// src/lib/firebase/stok-kain.ts
import {
  collection, doc, getDocs, getDoc,
  addDoc, updateDoc, serverTimestamp,
  query, orderBy, onSnapshot, deleteField,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import type { StokKain, StokKainInput } from '$lib/types';

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

// Restock: tambah jumlah yard ke stok yang ada
export async function restockKain(id: string, tambahYard: number, catatan?: string): Promise<void> {
  const kain = await getStokKainById(id);
  if (!kain) throw new Error('Kain tidak ditemukan');
  await updateDoc(doc(db, COL, id), {
    stok_tersedia: kain.stok_tersedia + tambahYard,
    catatan: catatan ?? kain.catatan,
    updatedAt: serverTimestamp(),
  });
}

// Edit informasi kain (nama dan catatan saja, stok dikelola via restock/order)
export async function updateStokKain(id: string, data: { nama_kain: string; catatan?: string }): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    nama_kain: data.nama_kain,
    catatan: data.catatan?.trim() ? data.catatan.trim() : deleteField(),
    updatedAt: serverTimestamp(),
  });
}

// Kurangi stok (dipanggil saat order produksi dibuat)
export async function kurangiStokKain(id: string, yard: number): Promise<void> {
  const kain = await getStokKainById(id);
  if (!kain) throw new Error('Kain tidak ditemukan');
  if (kain.stok_tersedia < yard) throw new Error(`Stok kain "${kain.nama_kain}" tidak mencukupi`);
  await updateDoc(doc(db, COL, id), {
    stok_tersedia: kain.stok_tersedia - yard,
    stok_terpakai: kain.stok_terpakai + yard,
    updatedAt: serverTimestamp(),
  });
}

// Real-time listener untuk dashboard
export function subscribeStokKain(callback: (data: StokKain[]) => void): Unsubscribe {
  const q = query(collection(db, COL), orderBy('nama_kain'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StokKain));
  });
}