import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './config';
import { getCursorPage, type CursorPage, type FirestoreCursor } from './pagination';
import type { ModelHijab, ModelHijabInput } from '$lib/types';

const COL = 'model_hijab';

function normalizeModel(model: ModelHijab): ModelHijab {
  return {
    ...model,
    nama_hijab: model.nama_hijab ?? '',
    warna_tersedia: Array.isArray(model.warna_tersedia) ? model.warna_tersedia : [],
    harga_jual: Number(model.harga_jual) || 0,
    harga_produksi: Number(model.harga_produksi) || 0,
    aktif: model.aktif !== false,
  };
}

function sortModels(models: ModelHijab[]): ModelHijab[] {
  return models.sort((a, b) => a.nama_hijab.localeCompare(b.nama_hijab, 'id'));
}

export async function getModelHijabList(hanyaAktif = true): Promise<ModelHijab[]> {
  const base = hanyaAktif
    // Filter aktif tidak digabung dengan orderBy agar tidak membutuhkan composite index.
    ? query(collection(db, COL), where('aktif', '==', true))
    : query(collection(db, COL), orderBy('nama_hijab'));
  const snap = await getDocs(base);
  return sortModels(snap.docs.map((item) => normalizeModel({ id: item.id, ...item.data() } as ModelHijab)));
}

export async function getModelHijabPage(
  hanyaAktif: boolean,
  cursor: FirestoreCursor,
  pageSize = 20,
): Promise<CursorPage<ModelHijab>> {
  const base = hanyaAktif
    ? query(collection(db, COL), where('aktif', '==', true))
    : query(collection(db, COL), orderBy('nama_hijab'));
  const page = await getCursorPage(
    base,
    cursor,
    (item) => normalizeModel({ id: item.id, ...item.data() } as ModelHijab),
    pageSize,
  );
  return { ...page, items: sortModels(page.items) };
}

export async function getModelHijabById(id: string): Promise<ModelHijab | null> {
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? normalizeModel({ id: snap.id, ...snap.data() } as ModelHijab) : null;
}

export async function addModelHijab(data: ModelHijabInput): Promise<string> {
  const name = data.nama_hijab.trim();
  if (!name) throw new Error('Nama hijab wajib diisi');
  const ref = await addDoc(collection(db, COL), {
    nama_hijab: name,
    warna_tersedia: data.warna_tersedia ?? [],
    ...(data.foto_url?.trim() ? { foto_url: data.foto_url.trim() } : {}),
    ...(data.deskripsi?.trim() ? { deskripsi: data.deskripsi.trim() } : {}),
    harga_jual: Math.max(0, Number(data.harga_jual) || 0),
    harga_produksi: Math.max(0, Number(data.harga_produksi) || 0),
    aktif: true,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateModelHijab(id: string, data: Partial<ModelHijabInput>): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (data.nama_hijab !== undefined) payload.nama_hijab = data.nama_hijab.trim();
  if (data.warna_tersedia !== undefined) payload.warna_tersedia = data.warna_tersedia;
  if (data.foto_url !== undefined) payload.foto_url = data.foto_url.trim();
  if (data.deskripsi !== undefined) payload.deskripsi = data.deskripsi.trim();
  if (data.harga_jual !== undefined) payload.harga_jual = Math.max(0, Number(data.harga_jual) || 0);
  if (data.harga_produksi !== undefined) payload.harga_produksi = Math.max(0, Number(data.harga_produksi) || 0);
  await updateDoc(doc(db, COL, id), payload);
}

export async function nonaktifkanModelHijab(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { aktif: false, updatedAt: serverTimestamp() });
}

export async function aktifkanModelHijab(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { aktif: true, updatedAt: serverTimestamp() });
}

export async function deleteModelHijab(id: string): Promise<void> {
  const modelRef = doc(db, COL, id);
  const modelSnap = await getDoc(modelRef);
  if (!modelSnap.exists()) throw new Error('Model hijab tidak ditemukan');
  const model = modelSnap.data() as ModelHijab;
  if (model.aktif !== false) throw new Error('Nonaktifkan model terlebih dahulu sebelum menghapus permanen');

  const stockSnap = await getDocs(query(collection(db, 'stok_hijab'), where('model_hijab_id', '==', id)));
  if (!stockSnap.empty) throw new Error('Model hijab masih terhubung ke stok. Lepaskan hubungan stok terlebih dahulu');
  await deleteDoc(modelRef);
}
