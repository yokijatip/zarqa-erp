// src/lib/firebase/warna.ts
import {
  collection, doc, getDocs, getDoc,
  addDoc, updateDoc, deleteDoc, serverTimestamp,
  query, orderBy, where,
} from 'firebase/firestore';
import { db } from './config';
import type { Warna, WarnaInput } from '$lib/types';

const COL = 'warna';

export async function getWarnaList(): Promise<Warna[]> {
  const q = query(collection(db, COL), orderBy('nama_warna', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Warna));
}

export async function getWarnaById(id: string): Promise<Warna | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Warna;
}

export async function addWarna(data: WarnaInput): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateWarna(id: string, data: Partial<WarnaInput>): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteWarna(id: string): Promise<void> {
  // Cek apakah warna sedang dipakai oleh model baju
  const [modelSnap, stokKainSnap] = await Promise.all([
    getDocs(query(collection(db, 'model_baju'), where('warna_id', '==', id))),
    getDocs(query(collection(db, 'stok_kain'), where('warna_id', '==', id))),
  ]);

  if (!modelSnap.empty) {
    throw new Error(
      `Warna sedang digunakan oleh ${modelSnap.size} model baju. Ubah warna model tersebut terlebih dahulu.`
    );
  }

  if (!stokKainSnap.empty) {
    throw new Error(
      `Warna sedang digunakan oleh ${stokKainSnap.size} stok kain. Ubah warna kain tersebut terlebih dahulu.`
    );
  }

  await deleteDoc(doc(db, COL, id));
}
