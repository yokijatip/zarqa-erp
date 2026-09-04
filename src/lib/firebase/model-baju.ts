// src/lib/firebase/model-baju.ts
import {
  collection, doc, getDocs, getDoc,
  addDoc, updateDoc, deleteDoc, serverTimestamp,
  query, orderBy, where,
} from 'firebase/firestore';
import { db } from './config';
import { getCursorPage, type FirestoreCursor, type CursorPage } from './pagination';
import { canonicalUkuran, type ModelBaju, type ModelBajuInput, type UkuranBaju } from '$lib/types';

const COL = 'model_baju';

function normalizeSizeMap(value: Partial<Record<string, number>> | undefined): Partial<Record<UkuranBaju, number>> {
  const result: Partial<Record<UkuranBaju, number>> = {};
  for (const ukuran of ['XS', 'M/S', 'L/XL', 'XXL'] as UkuranBaju[]) {
    const aliases = ukuran === 'M/S' ? ['M/S', 'M', 'S'] : ukuran === 'L/XL' ? ['L/XL', 'L', 'XL'] : [ukuran];
    const source = aliases.find((key) => Number(value?.[key]) > 0);
    if (source) result[ukuran] = Number(value?.[source]);
  }
  return result;
}

function normalizeModel(model: ModelBaju): ModelBaju {
  return {
    ...model,
    ukuran_tersedia: [...new Set((model.ukuran_tersedia ?? []).map((ukuran) => canonicalUkuran(ukuran)))],
    kebutuhan_yard_per_pcs: normalizeSizeMap(model.kebutuhan_yard_per_pcs as Partial<Record<string, number>>),
    harga_jual_per_ukuran: normalizeSizeMap(model.harga_jual_per_ukuran as Partial<Record<string, number>>),
    harga_produksi_per_ukuran: normalizeSizeMap(model.harga_produksi_per_ukuran as Partial<Record<string, number>>),
    varian_penjualan: Array.isArray(model.varian_penjualan)
      ? model.varian_penjualan.map((variant) => ({
          ...variant,
          komponen: Array.isArray(variant.komponen) ? variant.komponen : [],
          aktif: variant.aktif !== false,
        }))
      : [],
  };
}

// Ambil semua model baju aktif
export async function getModelBajuList(hanyaAktif = true): Promise<ModelBaju[]> {
  const q = hanyaAktif
    ? query(collection(db, COL), where('aktif', '==', true), orderBy('nama_model'))
    : query(collection(db, COL), orderBy('nama_model'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeModel({ id: d.id, ...d.data() } as ModelBaju));
}

export async function getModelBajuPage(
  hanyaAktif: boolean,
  cursor: FirestoreCursor,
  pageSize = 25,
): Promise<CursorPage<ModelBaju>> {
  const baseQuery = hanyaAktif
    ? query(collection(db, COL), where('aktif', '==', true), orderBy('nama_model'))
    : query(collection(db, COL), orderBy('nama_model'));

  return getCursorPage(
    baseQuery,
    cursor,
    (d) => normalizeModel({ id: d.id, ...d.data() } as ModelBaju),
    pageSize,
  );
}

// Ambil satu model baju by ID
export async function getModelBajuById(id: string): Promise<ModelBaju | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return normalizeModel({ id: snap.id, ...snap.data() } as ModelBaju);
}

// Tambah model baju baru
export async function addModelBaju(data: ModelBajuInput): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    ukuran_tersedia: [...new Set(data.ukuran_tersedia.map((ukuran) => canonicalUkuran(ukuran)))],
    aktif: true,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// Edit model baju
export async function updateModelBaju(id: string, data: Partial<ModelBajuInput>): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    ...data,
    ...(data.ukuran_tersedia ? { ukuran_tersedia: [...new Set(data.ukuran_tersedia.map((ukuran) => canonicalUkuran(ukuran)))] } : {}),
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

  const [batchSnap, stokPotonganSnap, stokBarangJadiSnap, linkedModelSnap] = await Promise.all([
    getDocs(query(collection(db, 'batch_produksi'), where('model_id', '==', id))),
    getDocs(query(collection(db, 'stok_potongan'), where('model_id', '==', id))),
    getDocs(query(collection(db, 'stok_barang_jadi'), where('model_id', '==', id))),
    getDocs(query(collection(db, COL), where('stok_model_id', '==', id))),
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

  if (!linkedModelSnap.empty) {
    throw new Error('Model masih menjadi sumber stok model lain dan tidak dapat dihapus');
  }

  await deleteDoc(doc(db, COL, id));
}
