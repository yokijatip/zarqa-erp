// src/lib/firebase/model-baju.ts
import {
  collection, doc, getDocs, getDoc,
  addDoc, updateDoc, serverTimestamp,
  query, orderBy, where,
} from 'firebase/firestore';
import { db } from './config';
import type { ModelBaju, ModelBajuInput } from '$lib/types';

const COL = 'model_baju';

// Ambil semua model baju aktif
export async function getModelBajuList(hanyaAktif = true): Promise<ModelBaju[]> {
  const q = hanyaAktif
    ? query(collection(db, COL), where('aktif', '==', true), orderBy('nama_model'))
    : query(collection(db, COL), orderBy('nama_model'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ModelBaju);
}

// Ambil satu model baju by ID
export async function getModelBajuById(id: string): Promise<ModelBaju | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ModelBaju;
}

// Tambah model baju baru
export async function addModelBaju(data: ModelBajuInput): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    aktif: true,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// Edit model baju
export async function updateModelBaju(id: string, data: Partial<ModelBajuInput>): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// Nonaktifkan model baju (soft delete)
export async function nonaktifkanModel(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { aktif: false });
}