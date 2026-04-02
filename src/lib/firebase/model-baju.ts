// src/lib/firebase/model-baju.ts
import {
  collection, doc, getDocs, getDoc,
  addDoc, updateDoc, deleteDoc, serverTimestamp,
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
  await updateDoc(doc(db, COL, id), { aktif: false, updatedAt: serverTimestamp() });
}

// Aktifkan kembali model baju
export async function aktifkanModel(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { aktif: true, updatedAt: serverTimestamp() });
}

// Hapus permanen model baju (hanya boleh jika sudah nonaktif)
export async function deleteModelBaju(id: string): Promise<void> {
  const modelRef = doc(db, COL, id);
  const modelSnap = await getDoc(modelRef);

  if (!modelSnap.exists()) {
    throw new Error('Model baju tidak ditemukan');
  }

  const model = { id: modelSnap.id, ...modelSnap.data() } as ModelBaju;
  if (model.aktif) {
    throw new Error('Nonaktifkan model terlebih dahulu sebelum menghapus permanen');
  }

  const [batchSnap, stokPotonganSnap, stokBarangJadiSnap] = await Promise.all([
    getDocs(query(collection(db, 'batch_produksi'), where('model_id', '==', id))),
    getDocs(query(collection(db, 'stok_potongan'), where('model_id', '==', id))),
    getDocs(query(collection(db, 'stok_barang_jadi'), where('model_id', '==', id))),
  ]);

  if (!batchSnap.empty) {
    throw new Error('Model masih digunakan pada data batch produksi dan tidak dapat dihapus');
  }

  if (!stokPotonganSnap.empty) {
    throw new Error('Model masih memiliki stok potongan dan tidak dapat dihapus');
  }

  if (!stokBarangJadiSnap.empty) {
    throw new Error('Model masih memiliki stok barang jadi dan tidak dapat dihapus');
  }

  await deleteDoc(doc(db, COL, id));
}
