// src/lib/firebase/barang-jadi.ts
import {
  collection, doc, getDocs,
  serverTimestamp, runTransaction,
  query, orderBy, where, limit, Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import type { StokBarangJadi, BarangKeluar, BarangKeluarInput } from '$lib/types';

const COL_JADI = 'stok_barang_jadi';
const COL_KELUAR = 'barang_keluar';

function buildBarangJadiDocId(modelId: string, ukuran: string): string {
  return `${modelId}__${ukuran}`;
}

// ─── STOK BARANG JADI ───────────────────────────────────────────

// Ambil semua stok barang jadi
export async function getStokBarangJadi(): Promise<StokBarangJadi[]> {
  const q = query(collection(db, COL_JADI), orderBy('nama_model'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StokBarangJadi);
}

// Tambah stok barang jadi setelah batch COMPLETED atau restock manual
export async function tambahStokBarangJadi(
  modelId: string,
  namaModel: string,
  detailUkuran: { ukuran: string; jumlah_pcs: number }[],
  warna?: { nama_warna?: string; kode_hex_warna?: string }
): Promise<void> {
  for (const item of detailUkuran) {
    // Cari dokumen yang sudah ada untuk model + ukuran ini
    const q = query(
      collection(db, COL_JADI),
      where('model_id', '==', modelId),
      where('ukuran', '==', item.ukuran)
    );
    const snap = await getDocs(q);
    const ref = snap.empty
      ? doc(db, COL_JADI, buildBarangJadiDocId(modelId, item.ukuran))
      : snap.docs[0].ref;

    await runTransaction(db, async (transaction) => {
      const existingSnap = await transaction.get(ref);
      if (!existingSnap.exists()) {
        transaction.set(ref, {
          model_id: modelId,
          nama_model: namaModel,
          ...(warna?.nama_warna ? { nama_warna: warna.nama_warna } : {}),
          ...(warna?.kode_hex_warna ? { kode_hex_warna: warna.kode_hex_warna } : {}),
          ukuran: item.ukuran,
          stok_tersedia: item.jumlah_pcs,
          total_masuk: item.jumlah_pcs,
          total_keluar: 0,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      const data = existingSnap.data() as StokBarangJadi;
      transaction.update(ref, {
        stok_tersedia: data.stok_tersedia + item.jumlah_pcs,
        total_masuk: data.total_masuk + item.jumlah_pcs,
        ...(warna?.nama_warna ? { nama_warna: warna.nama_warna } : {}),
        ...(warna?.kode_hex_warna ? { kode_hex_warna: warna.kode_hex_warna } : {}),
        updatedAt: serverTimestamp(),
      });
    });
  }
}

// ─── BARANG KELUAR ───────────────────────────────────────────────

// Catat barang keluar dan kurangi stok
export async function catatBarangKeluar(
  data: BarangKeluarInput,
  dicatatOlehUid: string
): Promise<string> {
  const stokRefs = new Map<string, ReturnType<typeof doc>>();

  for (const item of data.detail_keluar) {
    const q = query(
      collection(db, COL_JADI),
      where('model_id', '==', data.model_id),
      where('ukuran', '==', item.ukuran)
    );
    const snap = await getDocs(q);
    if (snap.empty) throw new Error(`Stok ${data.nama_model} ukuran ${item.ukuran} tidak ditemukan`);
    stokRefs.set(item.ukuran, snap.docs[0].ref);
  }

  const totalPcs = data.detail_keluar.reduce((sum, i) => sum + i.jumlah_pcs, 0);
  const ref = doc(collection(db, COL_KELUAR));

  await runTransaction(db, async (transaction) => {
    for (const item of data.detail_keluar) {
      const stokRef = stokRefs.get(item.ukuran);
      if (!stokRef) {
        throw new Error(`Stok ${data.nama_model} ukuran ${item.ukuran} tidak ditemukan`);
      }

      const existingSnap = await transaction.get(stokRef);
      if (!existingSnap.exists()) {
        throw new Error(`Stok ${data.nama_model} ukuran ${item.ukuran} tidak ditemukan`);
      }

      const stok = existingSnap.data() as StokBarangJadi;
      if (stok.stok_tersedia < item.jumlah_pcs) {
        throw new Error(`Stok ${data.nama_model} ukuran ${item.ukuran} tidak mencukupi`);
      }

      transaction.update(stokRef, {
        stok_tersedia: stok.stok_tersedia - item.jumlah_pcs,
        total_keluar: stok.total_keluar + item.jumlah_pcs,
        updatedAt: serverTimestamp(),
      });
    }

    transaction.set(ref, {
      ...data,
      total_pcs: totalPcs,
      dicatat_oleh: dicatatOlehUid,
      tanggal_keluar: serverTimestamp(),
    });
  });

  return ref.id;
}

// Ambil semua ukuran stok untuk satu model
export async function getStokByModel(modelId: string): Promise<StokBarangJadi[]> {
  const q = query(
    collection(db, COL_JADI),
    where('model_id', '==', modelId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StokBarangJadi);
}

// Kurangi stok manual (koreksi, loss, dll — dicatat ke total_keluar)
export async function kurangiStokManual(stokId: string, jumlah: number): Promise<void> {
  const ref = doc(db, COL_JADI, stokId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Stok tidak ditemukan');

    const data = snap.data() as StokBarangJadi;
    if (data.stok_tersedia < jumlah) {
      throw new Error(`Stok hanya ${data.stok_tersedia} pcs, tidak bisa dikurangi ${jumlah} pcs`);
    }

    transaction.update(ref, {
      stok_tersedia: data.stok_tersedia - jumlah,
      total_keluar: data.total_keluar + jumlah,
      updatedAt: serverTimestamp(),
    });
  });
}

// Set stok ke nilai absolut (koreksi stok fisik)
export async function setStokManual(stokId: string, jumlahBaru: number): Promise<void> {
  const ref = doc(db, COL_JADI, stokId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Stok tidak ditemukan');

    transaction.update(ref, {
      stok_tersedia: jumlahBaru,
      updatedAt: serverTimestamp(),
    });
  });
}

// ─── BARANG KELUAR ───────────────────────────────────────────────

// Ambil riwayat keluar untuk satu model spesifik (halaman detail)
// Tanpa orderBy agar tidak perlu composite index — sort dilakukan di JS
export async function getRiwayatKeluarByModel(modelId: string): Promise<BarangKeluar[]> {
  const q = query(
    collection(db, COL_KELUAR),
    where('model_id', '==', modelId),
    limit(100),
  );
  const snap = await getDocs(q);
  const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BarangKeluar);
  return results.sort((a, b) => {
    const ta = a.tanggal_keluar?.toMillis?.() ?? 0;
    const tb = b.tanggal_keluar?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

// Ambil riwayat barang keluar — hanya 30 hari terakhir, max 200 dokumen (untuk dashboard/cache)
export async function getRiwayatBarangKeluar(): Promise<BarangKeluar[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const q = query(
    collection(db, COL_KELUAR),
    where('tanggal_keluar', '>=', Timestamp.fromDate(since)),
    orderBy('tanggal_keluar', 'desc'),
    limit(200),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BarangKeluar);
}

// Ambil riwayat barang keluar berdasarkan rentang tanggal — untuk halaman Barang Keluar.
// Jika range null (periode "Semua"), ambil 500 dokumen terbaru saja.
export async function getRiwayatBarangKeluarByPeriod(
  range: { start: Date; end: Date } | null,
): Promise<BarangKeluar[]> {
  const q = range
    ? query(
        collection(db, COL_KELUAR),
        where('tanggal_keluar', '>=', Timestamp.fromDate(range.start)),
        where('tanggal_keluar', '<=', Timestamp.fromDate(range.end)),
        orderBy('tanggal_keluar', 'desc'),
        limit(500),
      )
    : query(
        collection(db, COL_KELUAR),
        orderBy('tanggal_keluar', 'desc'),
        limit(500),
      );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BarangKeluar);
}
