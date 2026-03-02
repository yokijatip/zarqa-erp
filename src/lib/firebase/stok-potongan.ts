// src/lib/firebase/stok-potongan.ts
import {
  collection, doc, getDocs,
  addDoc, updateDoc, serverTimestamp,
  query, orderBy, where,
} from 'firebase/firestore';
import { db } from './config';
import type { StokPotongan, UkuranBaju } from '$lib/types';

const COL = 'stok_potongan';

// Ambil semua stok potongan
export async function getStokPotonganList(): Promise<StokPotongan[]> {
  const q = query(collection(db, COL), orderBy('nama_model'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StokPotongan);
}

// Ambil stok potongan untuk satu model (untuk dialog "dari potongan")
export async function getStokPotonganByModel(modelId: string): Promise<StokPotongan[]> {
  const q = query(collection(db, COL), where('model_id', '==', modelId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StokPotongan);
}

// Tambah stok potongan — dipanggil saat cutting selesai dengan sisa yang disimpan
export async function tambahStokPotongan(
  modelId: string,
  namaModel: string,
  detailDisimpan: { ukuran: string; jumlah_pcs: number }[],
  warna?: { nama_warna?: string; kode_hex_warna?: string }
): Promise<void> {
  for (const item of detailDisimpan) {
    const q = query(
      collection(db, COL),
      where('model_id', '==', modelId),
      where('ukuran', '==', item.ukuran)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      await addDoc(collection(db, COL), {
        model_id: modelId,
        nama_model: namaModel,
        ...(warna?.nama_warna     ? { nama_warna: warna.nama_warna }         : {}),
        ...(warna?.kode_hex_warna ? { kode_hex_warna: warna.kode_hex_warna } : {}),
        ukuran: item.ukuran,
        stok_tersedia: item.jumlah_pcs,
        total_masuk: item.jumlah_pcs,
        total_terpakai: 0,
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = snap.docs[0];
      const data = existing.data() as StokPotongan;
      await updateDoc(doc(db, COL, existing.id), {
        stok_tersedia: data.stok_tersedia + item.jumlah_pcs,
        total_masuk: data.total_masuk + item.jumlah_pcs,
        ...(warna?.nama_warna     ? { nama_warna: warna.nama_warna }         : {}),
        ...(warna?.kode_hex_warna ? { kode_hex_warna: warna.kode_hex_warna } : {}),
        updatedAt: serverTimestamp(),
      });
    }
  }
}

// Kurangi stok potongan — dipanggil saat batch "dari potongan" dibuat
export async function kurangiStokPotongan(
  modelId: string,
  ukuran: UkuranBaju,
  jumlah: number
): Promise<void> {
  const q = query(
    collection(db, COL),
    where('model_id', '==', modelId),
    where('ukuran', '==', ukuran)
  );
  const snap = await getDocs(q);
  if (snap.empty) throw new Error(`Stok potongan ukuran ${ukuran} tidak ditemukan`);

  const existing = snap.docs[0];
  const data = existing.data() as StokPotongan;
  if (data.stok_tersedia < jumlah) {
    throw new Error(`Stok potongan ${ukuran} tidak mencukupi (tersedia: ${data.stok_tersedia} pcs)`);
  }

  await updateDoc(doc(db, COL, existing.id), {
    stok_tersedia: data.stok_tersedia - jumlah,
    total_terpakai: data.total_terpakai + jumlah,
    updatedAt: serverTimestamp(),
  });
}
