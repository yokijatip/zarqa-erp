// src/lib/firebase/stok-kain.ts
import {
  collection, doc, getDocs, getDoc,
  addDoc, updateDoc, deleteDoc, serverTimestamp, runTransaction,
  query, orderBy, limit, onSnapshot, deleteField,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import type { StokKain, StokKainInput, Warna, RiwayatStokKain } from '$lib/types';

const COL = 'stok_kain';

// Ambil semua stok kain (sekali fetch)
export async function getStokKainList(): Promise<StokKain[]> {
  const q = query(collection(db, COL), orderBy('nama_kain'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StokKain);
}

// Ambil satu stok kain by ID
export async function getStokKainById(id: string): Promise<StokKain | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as StokKain;
}

// Tambah jenis kain baru
export async function addStokKain(data: StokKainInput): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    stok_terpakai: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

function buildWarnaFields(warna?: Pick<Warna, 'id' | 'nama_warna' | 'kode_hex'> | null) {
  if (!warna?.id) {
    return {
      warna_id: deleteField(),
      nama_warna: deleteField(),
      kode_hex_warna: deleteField(),
    };
  }

  return {
    warna_id: warna.id,
    nama_warna: warna.nama_warna,
    kode_hex_warna: warna.kode_hex,
  };
}

// Restock: tambah jumlah ke stok yang ada + catat riwayat
export async function restockKain(id: string, tambahJumlah: number, catatan?: string): Promise<void> {
  const ref = doc(db, COL, id);
  const riwayatRef = doc(collection(db, COL, id, 'riwayat'));
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Kain tidak ditemukan');

    const kain = { id: snap.id, ...snap.data() } as StokKain;
    const finalCatatan = catatan ?? kain.catatan;
    const stokBaru = kain.stok_tersedia + tambahJumlah;

    transaction.update(ref, {
      stok_tersedia: stokBaru,
      ...(finalCatatan !== undefined ? { catatan: finalCatatan } : {}),
      updatedAt: serverTimestamp(),
    });
    transaction.set(riwayatRef, {
      tipe: 'restock',
      jumlah: tambahJumlah,
      stok_sebelum: kain.stok_tersedia,
      stok_sesudah: stokBaru,
      ...(catatan?.trim() ? { catatan: catatan.trim() } : {}),
      timestamp: serverTimestamp(),
    });
  });
}

// Edit informasi kain (nama dan catatan saja, stok dikelola via restock/order)
export async function updateStokKain(
  id: string,
  data: {
    nama_kain: string;
    catatan?: string;
    warna?: Pick<Warna, 'id' | 'nama_warna' | 'kode_hex'> | null;
  },
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    nama_kain: data.nama_kain,
    catatan: data.catatan?.trim() ? data.catatan.trim() : deleteField(),
    ...buildWarnaFields(data.warna),
    updatedAt: serverTimestamp(),
  });
}

// Kurangi stok (dipanggil saat order produksi dibuat)
export async function kurangiStokKain(id: string, jumlah: number): Promise<void> {
  const ref = doc(db, COL, id);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Kain tidak ditemukan');

    const kain = { id: snap.id, ...snap.data() } as StokKain;
    if (kain.stok_tersedia < jumlah) {
      throw new Error(`Stok kain "${kain.nama_kain}" tidak mencukupi`);
    }

    transaction.update(ref, {
      stok_tersedia: kain.stok_tersedia - jumlah,
      stok_terpakai: kain.stok_terpakai + jumlah,
      updatedAt: serverTimestamp(),
    });
  });
}

// Kembalikan stok kain (dipanggil saat order produksi dibatalkan/dihapus)
export async function kembalikanStokKain(id: string, jumlah: number): Promise<void> {
  const ref = doc(db, COL, id);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return; // kain mungkin sudah dihapus, abaikan

    const kain = { id: snap.id, ...snap.data() } as StokKain;
    transaction.update(ref, {
      stok_tersedia: kain.stok_tersedia + jumlah,
      stok_terpakai: Math.max(0, kain.stok_terpakai - jumlah),
      updatedAt: serverTimestamp(),
    });
  });
}

// Kurangi stok secara manual (koreksi admin) + catat riwayat
export async function kurangiStokManual(id: string, jumlah: number, catatan?: string): Promise<void> {
  const ref = doc(db, COL, id);
  const riwayatRef = doc(collection(db, COL, id, 'riwayat'));
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Kain tidak ditemukan');

    const kain = { id: snap.id, ...snap.data() } as StokKain;
    if (kain.stok_tersedia < jumlah) {
      throw new Error(`Stok kain "${kain.nama_kain}" tidak mencukupi (tersedia: ${kain.stok_tersedia})`);
    }

    const stokBaru = kain.stok_tersedia - jumlah;
    transaction.update(ref, {
      stok_tersedia: stokBaru,
      updatedAt: serverTimestamp(),
    });
    transaction.set(riwayatRef, {
      tipe: 'kurangi_manual',
      jumlah,
      stok_sebelum: kain.stok_tersedia,
      stok_sesudah: stokBaru,
      ...(catatan?.trim() ? { catatan: catatan.trim() } : {}),
      timestamp: serverTimestamp(),
    });
  });
}

// Ambil riwayat stok kain (50 terakhir, terbaru di atas)
export async function getRiwayatStokKain(kainId: string): Promise<RiwayatStokKain[]> {
  const q = query(
    collection(db, COL, kainId, 'riwayat'),
    orderBy('timestamp', 'desc'),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RiwayatStokKain);
}

// Hapus jenis kain dari inventaris
export async function deleteStokKain(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

// Real-time listener untuk dashboard
export function subscribeStokKain(callback: (data: StokKain[]) => void): Unsubscribe {
  const q = query(collection(db, COL), orderBy('nama_kain'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StokKain));
  });
}
