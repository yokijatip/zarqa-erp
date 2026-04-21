// src/lib/firebase/stok-potongan.ts
import {
  collection, doc, getDocs,
  serverTimestamp, runTransaction,
  query, orderBy, where, updateDoc,
} from 'firebase/firestore';
import { db } from './config';
import type { StokPotongan, UkuranBaju } from '$lib/types';

const COL = 'stok_potongan';

function warnaDocKey(namaWarna: string): string {
  return namaWarna.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function buildStokPotonganDocId(modelId: string, ukuran: string, namaWarna?: string): string {
  if (!namaWarna) return `${modelId}__${ukuran}`;
  return `${modelId}__${ukuran}__${warnaDocKey(namaWarna)}`;
}

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
    const q = warna?.nama_warna
      ? query(collection(db, COL), where('model_id', '==', modelId), where('ukuran', '==', item.ukuran), where('nama_warna', '==', warna.nama_warna))
      : query(collection(db, COL), where('model_id', '==', modelId), where('ukuran', '==', item.ukuran));
    const snap = await getDocs(q);
    const ref = snap.empty
      ? doc(db, COL, buildStokPotonganDocId(modelId, item.ukuran, warna?.nama_warna))
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
          total_terpakai: 0,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      const data = existingSnap.data() as StokPotongan;
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

  const ref = snap.docs[0].ref;
  await runTransaction(db, async (transaction) => {
    const existingSnap = await transaction.get(ref);
    if (!existingSnap.exists()) {
      throw new Error(`Stok potongan ukuran ${ukuran} tidak ditemukan`);
    }

    const data = existingSnap.data() as StokPotongan;
    if (data.stok_tersedia < jumlah) {
      throw new Error(`Stok potongan ${ukuran} tidak mencukupi (tersedia: ${data.stok_tersedia} pcs)`);
    }

    transaction.update(ref, {
      stok_tersedia: data.stok_tersedia - jumlah,
      total_terpakai: data.total_terpakai + jumlah,
      updatedAt: serverTimestamp(),
    });
  });
}

// Koreksi manual stok potongan — hapus karena rusak/terbuang
export async function koreksiStokPotongan(
  stokId: string,
  jumlahBaru: number,
): Promise<void> {
  if (jumlahBaru < 0) throw new Error('Jumlah tidak boleh negatif');
  const ref = doc(db, COL, stokId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Stok potongan tidak ditemukan');
    const data = snap.data() as StokPotongan;
    const selisih = jumlahBaru - data.stok_tersedia;
    transaction.update(ref, {
      stok_tersedia: jumlahBaru,
      ...(selisih > 0 ? { total_masuk: data.total_masuk + selisih } : {}),
      ...(selisih < 0 ? { total_terpakai: data.total_terpakai + Math.abs(selisih) } : {}),
      updatedAt: serverTimestamp(),
    });
  });
}
