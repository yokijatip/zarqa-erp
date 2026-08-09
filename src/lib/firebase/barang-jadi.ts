// src/lib/firebase/barang-jadi.ts
import {
  collection, doc, getDocs, getDoc,
  serverTimestamp, runTransaction, deleteDoc,
  query, orderBy, where, limit, Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import type { StokBarangJadi, BarangKeluar, BarangKeluarInput, RiwayatBarangJadi, TipeRiwayatBarangJadi, SumberProduksi, BatchProduksi } from '$lib/types';

const COL_RIWAYAT = 'riwayat_barang_jadi';

type RiwayatMeta = {
  uid: string;
  nama: string;
  tipe: TipeRiwayatBarangJadi;
  catatan?: string;
  batch_id?: string;
};

const COL_JADI = 'stok_barang_jadi';
const COL_KELUAR = 'barang_keluar';

function warnaDocKey(namaWarna: string): string {
  return namaWarna.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function buildBarangJadiDocId(modelId: string, ukuran: string, namaWarna?: string): string {
  if (!namaWarna) return `${modelId}__${ukuran}`;
  return `${modelId}__${ukuran}__${warnaDocKey(namaWarna)}`;
}

// Tambahkan satu lot produksi ke akhir antrian sumber_produksi sebuah pool
// stok_barang_jadi. Kalau lot terakhir berasal dari batch_id yang sama,
// jumlah pcs-nya digabung (mis. batch yang disetor bertahap dari steam).
export function appendSumberProduksiLot(
  existing: SumberProduksi[] | undefined,
  lot: SumberProduksi,
): SumberProduksi[] {
  const list = existing ? [...existing] : [];
  const last = list[list.length - 1];
  if (last && last.batch_id === lot.batch_id) {
    list[list.length - 1] = { ...last, jumlah_pcs: (last.jumlah_pcs ?? 0) + (lot.jumlah_pcs ?? 0) };
    return list;
  }
  list.push(lot);
  return list;
}

// Ambil `qty` pcs dari antrian sumber_produksi secara FIFO (lot paling lama
// duluan). Kalau antrian tidak cukup menutupi qty (stok lama dari sebelum
// fitur ini ada, tanpa data lot), sisanya dianggap "data lama" — tidak
// diwariskan sumber produksi apa pun, dan itu memang perilaku yang diinginkan.
export function consumeSumberProduksiLots(
  queue: SumberProduksi[] | undefined,
  qty: number,
): { consumed: SumberProduksi[]; remaining: SumberProduksi[] } {
  const consumed: SumberProduksi[] = [];
  const remaining: SumberProduksi[] = [];
  let sisa = qty;
  for (const lot of queue ?? []) {
    const tersedia = lot.jumlah_pcs ?? 0;
    if (sisa <= 0 || tersedia <= 0) {
      remaining.push(lot);
      continue;
    }
    const diambil = Math.min(sisa, tersedia);
    consumed.push({ ...lot, jumlah_pcs: diambil });
    sisa -= diambil;
    if (tersedia > diambil) {
      remaining.push({ ...lot, jumlah_pcs: tersedia - diambil });
    }
  }
  return { consumed, remaining };
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
  warna?: { nama_warna?: string; kode_hex_warna?: string },
  riwayatMeta?: RiwayatMeta,
): Promise<void> {
  for (const item of detailUkuran) {
    const q = warna?.nama_warna
      ? query(collection(db, COL_JADI), where('model_id', '==', modelId), where('ukuran', '==', item.ukuran), where('nama_warna', '==', warna.nama_warna))
      : query(collection(db, COL_JADI), where('model_id', '==', modelId), where('ukuran', '==', item.ukuran));
    const snap = await getDocs(q);
    const ref = snap.empty
      ? doc(db, COL_JADI, buildBarangJadiDocId(modelId, item.ukuran, warna?.nama_warna))
      : snap.docs[0].ref;

    await runTransaction(db, async (transaction) => {
      const existingSnap = await transaction.get(ref);
      let stokSebelum = 0;
      let stokSesudah = item.jumlah_pcs;

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
      } else {
        const data = existingSnap.data() as StokBarangJadi;
        stokSebelum = data.stok_tersedia;
        stokSesudah = stokSebelum + item.jumlah_pcs;
        transaction.update(ref, {
          stok_tersedia: stokSesudah,
          total_masuk: data.total_masuk + item.jumlah_pcs,
          ...(warna?.nama_warna ? { nama_warna: warna.nama_warna } : {}),
          ...(warna?.kode_hex_warna ? { kode_hex_warna: warna.kode_hex_warna } : {}),
          updatedAt: serverTimestamp(),
        });
      }

      if (riwayatMeta) {
        const riwayatRef = doc(collection(db, COL_RIWAYAT));
        transaction.set(riwayatRef, {
          model_id: modelId,
          nama_model: namaModel,
          ukuran: item.ukuran,
          tipe: riwayatMeta.tipe,
          jumlah: item.jumlah_pcs,
          stok_sebelum: stokSebelum,
          stok_sesudah: stokSesudah,
          ...(riwayatMeta.catatan ? { catatan: riwayatMeta.catatan } : {}),
          ...(riwayatMeta.batch_id ? { batch_id: riwayatMeta.batch_id } : {}),
          dicatat_oleh_uid: riwayatMeta.uid,
          dicatat_oleh_nama: riwayatMeta.nama,
          timestamp: serverTimestamp(),
        });
      }
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
    const q = data.nama_warna
      ? query(collection(db, COL_JADI), where('model_id', '==', data.model_id), where('ukuran', '==', item.ukuran), where('nama_warna', '==', data.nama_warna))
      : query(collection(db, COL_JADI), where('model_id', '==', data.model_id), where('ukuran', '==', item.ukuran));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error(`Stok ${data.nama_model} ukuran ${item.ukuran} tidak ditemukan`);
    stokRefs.set(item.ukuran, snap.docs[0].ref);
  }

  const totalPcs = data.detail_keluar.reduce((sum, i) => sum + i.jumlah_pcs, 0);
  const ref = doc(collection(db, COL_KELUAR));

  await runTransaction(db, async (transaction) => {
    const stokSnapshots = new Map<string, { ref: ReturnType<typeof doc>; data: StokBarangJadi }>();

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

      stokSnapshots.set(item.ukuran, { ref: stokRef, data: stok });
    }

    for (const item of data.detail_keluar) {
      const stokSnapshot = stokSnapshots.get(item.ukuran);
      if (!stokSnapshot) {
        throw new Error(`Stok ${data.nama_model} ukuran ${item.ukuran} tidak ditemukan`);
      }

      const { ref: stokRef, data: stok } = stokSnapshot;
      const { consumed, remaining } = consumeSumberProduksiLots(stok.sumber_produksi, item.jumlah_pcs);
      // Simpan snapshot lot yang terkonsumsi ke detail_keluar item ini, supaya
      // laporan barang keluar bisa menampilkan siapa cutting/jahit/steam-nya.
      item.sumber = consumed;

      transaction.update(stokRef, {
        stok_tersedia: stok.stok_tersedia - item.jumlah_pcs,
        total_keluar: stok.total_keluar + item.jumlah_pcs,
        sumber_produksi: remaining,
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
export async function kurangiStokManual(
  stokId: string,
  jumlah: number,
  riwayatMeta?: RiwayatMeta,
): Promise<void> {
  const ref = doc(db, COL_JADI, stokId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Stok tidak ditemukan');

    const data = snap.data() as StokBarangJadi;
    if (data.stok_tersedia < jumlah) {
      throw new Error(`Stok hanya ${data.stok_tersedia} pcs, tidak bisa dikurangi ${jumlah} pcs`);
    }
    const stokSesudah = data.stok_tersedia - jumlah;

    transaction.update(ref, {
      stok_tersedia: stokSesudah,
      total_keluar: data.total_keluar + jumlah,
      updatedAt: serverTimestamp(),
    });

    if (riwayatMeta) {
      const riwayatRef = doc(collection(db, COL_RIWAYAT));
      transaction.set(riwayatRef, {
        model_id: data.model_id,
        nama_model: data.nama_model,
        ukuran: data.ukuran,
        tipe: 'kurangi_manual' as TipeRiwayatBarangJadi,
        jumlah,
        stok_sebelum: data.stok_tersedia,
        stok_sesudah: stokSesudah,
        ...(riwayatMeta.catatan ? { catatan: riwayatMeta.catatan } : {}),
        dicatat_oleh_uid: riwayatMeta.uid,
        dicatat_oleh_nama: riwayatMeta.nama,
        timestamp: serverTimestamp(),
      });
    }
  });
}

// Set stok ke nilai absolut (koreksi stok fisik)
export async function setStokManual(
  stokId: string,
  jumlahBaru: number,
  riwayatMeta?: RiwayatMeta,
): Promise<void> {
  const ref = doc(db, COL_JADI, stokId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Stok tidak ditemukan');

    const data = snap.data() as StokBarangJadi;
    const selisih = jumlahBaru - data.stok_tersedia;

    transaction.update(ref, {
      stok_tersedia: jumlahBaru,
      // total_masuk/keluar ikut selisih
      ...(selisih > 0 ? { total_masuk: data.total_masuk + selisih } : {}),
      ...(selisih < 0 ? { total_keluar: data.total_keluar + Math.abs(selisih) } : {}),
      updatedAt: serverTimestamp(),
    });

    if (riwayatMeta) {
      const riwayatRef = doc(collection(db, COL_RIWAYAT));
      transaction.set(riwayatRef, {
        model_id: data.model_id,
        nama_model: data.nama_model,
        ukuran: data.ukuran,
        tipe: 'set_manual' as TipeRiwayatBarangJadi,
        jumlah: Math.abs(selisih),
        stok_sebelum: data.stok_tersedia,
        stok_sesudah: jumlahBaru,
        catatan: `Set manual dari ${data.stok_tersedia} → ${jumlahBaru} pcs`,
        ...(riwayatMeta.catatan ? { catatan: riwayatMeta.catatan } : {}),
        dicatat_oleh_uid: riwayatMeta.uid,
        dicatat_oleh_nama: riwayatMeta.nama,
        timestamp: serverTimestamp(),
      });
    }
  });
}

// ─── RIWAYAT BARANG JADI ─────────────────────────────────────────

export async function getRiwayatBarangJadiByModel(modelId: string): Promise<RiwayatBarangJadi[]> {
  const q = query(
    collection(db, COL_RIWAYAT),
    where('model_id', '==', modelId),
    orderBy('timestamp', 'desc'),
    limit(100),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RiwayatBarangJadi);
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

// ─── BATALKAN BARANG KELUAR ──────────────────────────────────────

// Batalkan catatan barang keluar: kembalikan stok ke stok_barang_jadi, hapus dokumen
export async function batalBarangKeluar(
  id: string,
  riwayatMeta?: { uid: string; nama: string; catatan?: string },
): Promise<void> {
  const keluarRef = doc(db, COL_KELUAR, id);
  const keluarSnap = await getDoc(keluarRef);
  if (!keluarSnap.exists()) throw new Error('Catatan barang keluar tidak ditemukan');

  const keluar = { id: keluarSnap.id, ...keluarSnap.data() } as BarangKeluar;

  // Ambil semua stok refs sebelum transaksi (reads di luar transaction)
  const stokRefs = new Map<string, ReturnType<typeof doc>>();
  for (const item of keluar.detail_keluar) {
    const q = keluar.nama_warna
      ? query(collection(db, COL_JADI), where('model_id', '==', keluar.model_id), where('ukuran', '==', item.ukuran), where('nama_warna', '==', keluar.nama_warna))
      : query(collection(db, COL_JADI), where('model_id', '==', keluar.model_id), where('ukuran', '==', item.ukuran));
    const snap = await getDocs(q);
    if (!snap.empty) stokRefs.set(item.ukuran, snap.docs[0].ref);
  }

  await runTransaction(db, async (transaction) => {
    // Baca semua stok dulu, baru tulis
    const stokSnapshots = new Map<string, { ref: ReturnType<typeof doc>; data: StokBarangJadi }>();
    for (const [ukuran, ref] of stokRefs) {
      const snap = await transaction.get(ref);
      if (snap.exists()) stokSnapshots.set(ukuran, { ref, data: { id: snap.id, ...snap.data() } as StokBarangJadi });
    }

    for (const item of keluar.detail_keluar) {
      const entry = stokSnapshots.get(item.ukuran);
      if (!entry) continue;
      const { ref, data } = entry;
      const stokSesudah = data.stok_tersedia + item.jumlah_pcs;

      transaction.update(ref, {
        stok_tersedia: stokSesudah,
        total_keluar: Math.max(0, data.total_keluar - item.jumlah_pcs),
        updatedAt: serverTimestamp(),
      });

      if (riwayatMeta) {
        const riwayatRef = doc(collection(db, COL_RIWAYAT));
        transaction.set(riwayatRef, {
          model_id: keluar.model_id,
          nama_model: keluar.nama_model,
          ukuran: item.ukuran,
          tipe: 'batal_keluar' as TipeRiwayatBarangJadi,
          jumlah: item.jumlah_pcs,
          stok_sebelum: data.stok_tersedia,
          stok_sesudah: stokSesudah,
          catatan: riwayatMeta.catatan ?? `Pembatalan pengiriman ke ${keluar.tujuan}`,
          dicatat_oleh_uid: riwayatMeta.uid,
          dicatat_oleh_nama: riwayatMeta.nama,
          timestamp: serverTimestamp(),
        });
      }
    }

    transaction.delete(keluarRef);
  });
}
