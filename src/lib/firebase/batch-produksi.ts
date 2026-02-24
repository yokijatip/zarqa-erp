// src/lib/firebase/batch-produksi.ts
import {
  collection, doc, getDocs, getDoc,
  addDoc, updateDoc, deleteDoc, serverTimestamp,
  query, orderBy, where, onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { kurangiStokKain, kembalikanStokKain } from './stok-kain';
import type { BatchProduksi, BatchProduksiInput, StatusBatch, RiwayatProses } from '$lib/types';

const COL = 'batch_produksi';

// Buat order produksi baru
// Otomatis mengurangi stok kain sesuai kebutuhan model
export async function createBatchProduksi(
  data: BatchProduksiInput,
  dibuatOlehUid: string
): Promise<string> {
  // Kurangi stok semua jenis kain yang dibutuhkan
  for (const kain of data.kain_digunakan) {
    await kurangiStokKain(kain.kain_id, kain.jumlah_dipakai);
  }

  const totalPcs = data.detail_ukuran.reduce((sum, u) => sum + u.jumlah_pcs, 0);

  const ref = await addDoc(collection(db, COL), {
    ...data,
    total_pcs: totalPcs,
    status: 'PENDING_CUTTING' as StatusBatch,
    dibuat_oleh: dibuatOlehUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

// Ambil semua batch (bisa filter by status)
export async function getBatchList(status?: StatusBatch): Promise<BatchProduksi[]> {
  const q = status
    ? query(collection(db, COL), where('status', '==', status), orderBy('createdAt', 'desc'))
    : query(collection(db, COL), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BatchProduksi);
}

// Ambil satu batch by ID
export async function getBatchById(id: string): Promise<BatchProduksi | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as BatchProduksi;
}

// Update status batch + catat riwayat
export async function updateStatusBatch(
  batchId: string,
  statusBaru: StatusBatch,
  updatedByUid: string,
  updatedByNama: string,
  riwayat: Omit<RiwayatProses, 'status_ke' | 'updated_by_uid' | 'updated_by_nama' | 'timestamp'>
): Promise<void> {
  const batch = await getBatchById(batchId);
  if (!batch) throw new Error('Batch tidak ditemukan');

  // Update status di dokumen utama
  await updateDoc(doc(db, COL, batchId), {
    status: statusBaru,
    updatedAt: serverTimestamp(),
  });

  // Catat riwayat di sub-koleksi
  await addDoc(collection(db, COL, batchId, 'riwayat_proses'), {
    ...riwayat,
    status_dari: batch.status,
    status_ke: statusBaru,
    updated_by_uid: updatedByUid,
    updated_by_nama: updatedByNama,
    timestamp: serverTimestamp(),
  });
}

// Ambil riwayat proses sebuah batch
export async function getRiwayatBatch(batchId: string): Promise<RiwayatProses[]> {
  const q = query(
    collection(db, COL, batchId, 'riwayat_proses'),
    orderBy('timestamp', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RiwayatProses);
}

// Hapus batch produksi + kembalikan stok kain
// Hanya boleh untuk batch yang belum COMPLETED
export async function deleteBatchProduksi(batchId: string): Promise<void> {
  const batch = await getBatchById(batchId);
  if (!batch) throw new Error('Batch tidak ditemukan');
  if (batch.status === 'COMPLETED') {
    throw new Error('Batch yang sudah selesai tidak dapat dihapus');
  }

  // Kembalikan stok kain yang sudah dipotong saat order dibuat
  for (const kain of batch.kain_digunakan) {
    await kembalikanStokKain(kain.kain_id, kain.jumlah_dipakai);
  }

  // Hapus semua riwayat_proses di sub-koleksi
  const riwayatSnap = await getDocs(collection(db, COL, batchId, 'riwayat_proses'));
  for (const d of riwayatSnap.docs) {
    await deleteDoc(doc(db, COL, batchId, 'riwayat_proses', d.id));
  }

  // Hapus dokumen batch
  await deleteDoc(doc(db, COL, batchId));
}

// Real-time listener semua batch aktif (untuk monitor produksi)
export function subscribeBatchAktif(callback: (data: BatchProduksi[]) => void): Unsubscribe {
  const statusAktif: StatusBatch[] = [
    'PENDING_CUTTING', 'CUTTING_IN_PROGRESS', 'CUTTING_DONE',
    'JAHIT_IN_PROGRESS', 'JAHIT_DONE',
    'STEAM_IN_PROGRESS', 'STEAM_DONE',
  ];
  const q = query(
    collection(db, COL),
    where('status', 'in', statusAktif),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BatchProduksi));
  });
}