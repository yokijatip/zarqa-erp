// src/lib/firebase/barang-jadi.ts
import {
  collection, doc, getDocs, getDoc,
  addDoc, updateDoc, serverTimestamp,
  query, orderBy, where,
} from 'firebase/firestore';
import { db } from './config';
import type { StokBarangJadi, BarangKeluar, BarangKeluarInput } from '$lib/types';

const COL_JADI = 'stok_barang_jadi';
const COL_KELUAR = 'barang_keluar';

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

    if (snap.empty) {
      // Belum ada, buat dokumen baru
      await addDoc(collection(db, COL_JADI), {
        model_id: modelId,
        nama_model: namaModel,
        ...(warna?.nama_warna     ? { nama_warna: warna.nama_warna }         : {}),
        ...(warna?.kode_hex_warna ? { kode_hex_warna: warna.kode_hex_warna } : {}),
        ukuran: item.ukuran,
        stok_tersedia: item.jumlah_pcs,
        total_masuk: item.jumlah_pcs,
        total_keluar: 0,
        updatedAt: serverTimestamp(),
      });
    } else {
      // Sudah ada, update stok (dan sinkron warna jika ada)
      const existing = snap.docs[0];
      const data = existing.data() as StokBarangJadi;
      await updateDoc(doc(db, COL_JADI, existing.id), {
        stok_tersedia: data.stok_tersedia + item.jumlah_pcs,
        total_masuk: data.total_masuk + item.jumlah_pcs,
        ...(warna?.nama_warna     ? { nama_warna: warna.nama_warna }         : {}),
        ...(warna?.kode_hex_warna ? { kode_hex_warna: warna.kode_hex_warna } : {}),
        updatedAt: serverTimestamp(),
      });
    }
  }
}

// ─── BARANG KELUAR ───────────────────────────────────────────────

// Catat barang keluar dan kurangi stok
export async function catatBarangKeluar(
  data: BarangKeluarInput,
  dicatatOlehUid: string
): Promise<string> {
  // Kurangi stok barang jadi per ukuran
  for (const item of data.detail_keluar) {
    const q = query(
      collection(db, COL_JADI),
      where('model_id', '==', data.model_id),
      where('ukuran', '==', item.ukuran)
    );
    const snap = await getDocs(q);
    if (snap.empty) throw new Error(`Stok ${data.nama_model} ukuran ${item.ukuran} tidak ditemukan`);

    const existing = snap.docs[0];
    const stok = existing.data() as StokBarangJadi;
    if (stok.stok_tersedia < item.jumlah_pcs) {
      throw new Error(`Stok ${data.nama_model} ukuran ${item.ukuran} tidak mencukupi`);
    }

    await updateDoc(doc(db, COL_JADI, existing.id), {
      stok_tersedia: stok.stok_tersedia - item.jumlah_pcs,
      total_keluar: stok.total_keluar + item.jumlah_pcs,
      updatedAt: serverTimestamp(),
    });
  }

  const totalPcs = data.detail_keluar.reduce((sum, i) => sum + i.jumlah_pcs, 0);

  const ref = await addDoc(collection(db, COL_KELUAR), {
    ...data,
    total_pcs: totalPcs,
    dicatat_oleh: dicatatOlehUid,
    tanggal_keluar: serverTimestamp(),
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
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Stok tidak ditemukan');
  const data = snap.data() as StokBarangJadi;
  if (data.stok_tersedia < jumlah) throw new Error(`Stok hanya ${data.stok_tersedia} pcs, tidak bisa dikurangi ${jumlah} pcs`);
  await updateDoc(ref, {
    stok_tersedia: data.stok_tersedia - jumlah,
    total_keluar: data.total_keluar + jumlah,
    updatedAt: serverTimestamp(),
  });
}

// Set stok ke nilai absolut (koreksi stok fisik)
export async function setStokManual(stokId: string, jumlahBaru: number): Promise<void> {
  const ref = doc(db, COL_JADI, stokId);
  if (!( await getDoc(ref)).exists()) throw new Error('Stok tidak ditemukan');
  await updateDoc(ref, {
    stok_tersedia: jumlahBaru,
    updatedAt: serverTimestamp(),
  });
}

// ─── BARANG KELUAR ───────────────────────────────────────────────

// Ambil riwayat barang keluar
export async function getRiwayatBarangKeluar(): Promise<BarangKeluar[]> {
  const q = query(collection(db, COL_KELUAR), orderBy('tanggal_keluar', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BarangKeluar);
}