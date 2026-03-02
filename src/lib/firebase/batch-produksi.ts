// src/lib/firebase/batch-produksi.ts
import {
  collection, doc, getDocs, getDoc,
  addDoc, updateDoc, deleteDoc, serverTimestamp,
  query, orderBy, where, onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { kurangiStokKain, kembalikanStokKain } from './stok-kain';
import { kurangiStokPotongan } from './stok-potongan';
import { getModelBajuById } from './model-baju';
import type { BatchProduksi, BatchProduksiInput, StatusBatch, RiwayatProses, PenugasanWorker, DetailUkuran } from '$lib/types';

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
    pcs_saat_ini: totalPcs,
    status: 'PENDING_CUTTING' as StatusBatch,
    dibuat_oleh: dibuatOlehUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

// Buat order produksi dari stok potongan kain (kain sudah dipotong sebelumnya)
// Tidak memotong stok kain mentah — langsung masuk CUTTING_DONE
export async function createBatchDariPotongan(
  data: BatchProduksiInput,
  dibuatOlehUid: string
): Promise<string> {
  // Validasi dan kurangi stok potongan per ukuran
  for (const du of data.detail_ukuran) {
    await kurangiStokPotongan(data.model_id, du.ukuran, du.jumlah_pcs);
  }

  const totalPcs = data.detail_ukuran.reduce((sum, u) => sum + u.jumlah_pcs, 0);

  const ref = await addDoc(collection(db, COL), {
    ...data,
    kain_digunakan: [],
    total_pcs: totalPcs,
    pcs_saat_ini: totalPcs,
    status: 'CUTTING_DONE' as StatusBatch,
    dari_potongan: true,
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

// Field penugasan yang diupdate berdasarkan status tujuan
const PENUGASAN_KEY: Partial<Record<StatusBatch, 'cutting' | 'jahit' | 'steam'>> = {
  CUTTING_IN_PROGRESS: 'cutting',
  JAHIT_IN_PROGRESS:   'jahit',
  STEAM_IN_PROGRESS:   'steam',
};

// Update status batch + catat riwayat
// penugasan: worker yang ditugaskan (hanya untuk transisi ke *_IN_PROGRESS)
export async function updateStatusBatch(
  batchId: string,
  statusBaru: StatusBatch,
  updatedByUid: string,
  updatedByNama: string,
  riwayat: Omit<RiwayatProses, 'status_ke' | 'updated_by_uid' | 'updated_by_nama' | 'timestamp'>,
  penugasan?: PenugasanWorker
): Promise<void> {
  const batch = await getBatchById(batchId);
  if (!batch) throw new Error('Batch tidak ditemukan');

  // Bangun payload update dokumen utama
  const updatePayload: Record<string, unknown> = {
    status: statusBaru,
    updatedAt: serverTimestamp(),
  };

  // Jika ada penugasan dan status tujuan memiliki key yang sesuai, simpan ke field
  const penugasanKey = PENUGASAN_KEY[statusBaru];
  if (penugasan && penugasanKey) {
    updatePayload[`penugasan.${penugasanKey}`] = penugasan;
  }

  // Sinkronkan pcs_saat_ini agar app Android tidak menampilkan "Belum sinkron"
  if (riwayat.pcs_berhasil != null) {
    updatePayload['pcs_saat_ini'] = riwayat.pcs_berhasil;
  }

  await updateDoc(doc(db, COL, batchId), updatePayload);

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

// Edit kuantitas batch (naik/turun) + sesuaikan stok kain otomatis
export async function editKuantitasBatch(
  batchId: string,
  newDetailUkuran: DetailUkuran[],
  updatedByUid: string,
  updatedByNama: string,
  alasan?: string
): Promise<void> {
  const batch = await getBatchById(batchId);
  if (!batch) throw new Error('Batch tidak ditemukan');
  if (batch.status === 'COMPLETED') throw new Error('Batch selesai tidak dapat diedit');

  const oldTotal = batch.total_pcs;
  const newTotal = newDetailUkuran.reduce((s, du) => s + du.jumlah_pcs, 0);
  if (newTotal <= 0) throw new Error('Total pcs harus lebih dari 0');

  const model = await getModelBajuById(batch.model_id);

  const newKainDigunakan = batch.kain_digunakan.map(kd => {
    let jumlahBaru: number;
    const kebutuhan = model?.kebutuhan_kain.find(k => k.kain_id === kd.kain_id);
    if (kebutuhan?.jumlah_per_ukuran) {
      jumlahBaru = newDetailUkuran.reduce((s, du) =>
        s + (kebutuhan.jumlah_per_ukuran[du.ukuran] ?? 0) * du.jumlah_pcs, 0);
      jumlahBaru = parseFloat(jumlahBaru.toFixed(2));
    } else {
      // fallback proporsional jika data model tidak tersedia
      jumlahBaru = parseFloat((kd.jumlah_dipakai * (newTotal / oldTotal)).toFixed(2));
    }
    return { ...kd, jumlah_dipakai: jumlahBaru };
  });

  // Sesuaikan stok kain: kembalikan jika kurang, potong jika tambah
  for (let i = 0; i < batch.kain_digunakan.length; i++) {
    const selisih = parseFloat(
      (batch.kain_digunakan[i].jumlah_dipakai - newKainDigunakan[i].jumlah_dipakai).toFixed(2)
    );
    if (selisih > 0) await kembalikanStokKain(batch.kain_digunakan[i].kain_id, selisih);
    if (selisih < 0) await kurangiStokKain(batch.kain_digunakan[i].kain_id, Math.abs(selisih));
  }

  await updateDoc(doc(db, COL, batchId), {
    detail_ukuran: newDetailUkuran,
    total_pcs: newTotal,
    kain_digunakan: newKainDigunakan,
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, COL, batchId, 'riwayat_proses'), {
    tipe: 'edit_kuantitas',
    status_dari: batch.status,
    status_ke: batch.status,
    updated_by_uid: updatedByUid,
    updated_by_nama: updatedByNama,
    pcs_berhasil: newTotal,
    pcs_reject: 0,
    catatan: alasan?.trim() || `Jumlah diubah dari ${oldTotal} menjadi ${newTotal} pcs`,
    timestamp: serverTimestamp(),
  });
}

// Update penugasan worker tanpa mengubah status batch
export async function updatePenugasanBatch(
  batchId: string,
  penugasan: { cutting?: PenugasanWorker; jahit?: PenugasanWorker; steam?: PenugasanWorker }
): Promise<void> {
  await updateDoc(doc(db, COL, batchId), {
    penugasan,
    updatedAt: serverTimestamp(),
  });
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