// src/lib/firebase/batch-produksi.ts
import {
  collection, doc, getDocs, getDoc,
  addDoc, updateDoc, deleteDoc, serverTimestamp,
  runTransaction,
  query, orderBy, where, onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { getModelBajuById } from './model-baju';
import { tambahStokPotongan } from './stok-potongan';
import type { BatchProduksi, BatchProduksiInput, StatusBatch, RiwayatProses, PenugasanWorker, DetailUkuran } from '$lib/types';

const COL = 'batch_produksi';

// Buat order produksi baru
// Otomatis mengurangi stok kain sesuai kebutuhan model
export async function createBatchProduksi(
  data: BatchProduksiInput,
  dibuatOlehUid: string
): Promise<string> {
  const totalPcs = data.detail_ukuran.reduce((sum, u) => sum + u.jumlah_pcs, 0);
  const ref = doc(collection(db, COL));

  await runTransaction(db, async (transaction) => {
    const kainSnapshots = await Promise.all(
      data.kain_digunakan.map(async (kain) => {
        const kainRef = doc(db, 'stok_kain', kain.kain_id);
        const kainSnap = await transaction.get(kainRef);
        return { kain, kainRef, kainSnap };
      })
    );

    for (const { kain, kainSnap } of kainSnapshots) {
      if (!kainSnap.exists()) throw new Error('Kain tidak ditemukan');

      const stok = kainSnap.data() as { nama_kain: string; stok_tersedia: number; stok_terpakai: number };
      if (stok.stok_tersedia < kain.jumlah_dipakai) {
        throw new Error(`Stok kain "${stok.nama_kain}" tidak mencukupi`);
      }
    }

    for (const { kain, kainRef, kainSnap } of kainSnapshots) {
      const stok = kainSnap.data() as { stok_tersedia: number; stok_terpakai: number };
      transaction.update(kainRef, {
        stok_tersedia: stok.stok_tersedia - kain.jumlah_dipakai,
        stok_terpakai: stok.stok_terpakai + kain.jumlah_dipakai,
        updatedAt: serverTimestamp(),
      });
    }

    transaction.set(ref, {
      ...data,
      total_pcs: totalPcs,
      pcs_saat_ini: totalPcs,
      status: 'PENDING_CUTTING' as StatusBatch,
      dibuat_oleh: dibuatOlehUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return ref.id;
}

// Buat order produksi dari stok potongan kain (kain sudah dipotong sebelumnya)
// Tidak memotong stok kain mentah — langsung masuk CUTTING_DONE
export async function createBatchDariPotongan(
  data: BatchProduksiInput,
  dibuatOlehUid: string
): Promise<string> {
  const totalPcs = data.detail_ukuran.reduce((sum, u) => sum + u.jumlah_pcs, 0);
  const stokPotonganRefs = new Map<string, ReturnType<typeof doc>>();

  for (const du of data.detail_ukuran) {
    const q = query(
      collection(db, 'stok_potongan'),
      where('model_id', '==', data.model_id),
      where('ukuran', '==', du.ukuran)
    );
    const snap = await getDocs(q);
    if (snap.empty) throw new Error(`Stok potongan ukuran ${du.ukuran} tidak ditemukan`);
    stokPotonganRefs.set(du.ukuran, snap.docs[0].ref);
  }

  const ref = doc(collection(db, COL));
  await runTransaction(db, async (transaction) => {
    const stokSnapshots = await Promise.all(
      data.detail_ukuran.map(async (du) => {
        const stokRef = stokPotonganRefs.get(du.ukuran);
        if (!stokRef) throw new Error(`Stok potongan ukuran ${du.ukuran} tidak ditemukan`);

        const stokSnap = await transaction.get(stokRef);
        return { du, stokRef, stokSnap };
      })
    );

    for (const { du, stokSnap } of stokSnapshots) {
      if (!stokSnap.exists()) throw new Error(`Stok potongan ukuran ${du.ukuran} tidak ditemukan`);

      const stok = stokSnap.data() as { stok_tersedia: number; total_terpakai: number };
      if (stok.stok_tersedia < du.jumlah_pcs) {
        throw new Error(`Stok potongan ${du.ukuran} tidak mencukupi (tersedia: ${stok.stok_tersedia} pcs)`);
      }
    }

    for (const { du, stokRef, stokSnap } of stokSnapshots) {
      const stok = stokSnap.data() as { stok_tersedia: number; total_terpakai: number };
      transaction.update(stokRef, {
        stok_tersedia: stok.stok_tersedia - du.jumlah_pcs,
        total_terpakai: stok.total_terpakai + du.jumlah_pcs,
        updatedAt: serverTimestamp(),
      });
    }

    transaction.set(ref, {
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
// newDetailUkuran: jika diisi, detail_ukuran batch diperbarui dengan hasil aktual per ukuran
export async function updateStatusBatch(
  batchId: string,
  statusBaru: StatusBatch,
  updatedByUid: string,
  updatedByNama: string,
  riwayat: Omit<RiwayatProses, 'status_ke' | 'updated_by_uid' | 'updated_by_nama' | 'timestamp'>,
  penugasan?: PenugasanWorker,
  newDetailUkuran?: DetailUkuran[]
): Promise<void> {
  const batchRef = doc(db, COL, batchId);
  const riwayatRef = doc(collection(db, COL, batchId, 'riwayat_proses'));

  await runTransaction(db, async (transaction) => {
    const batchSnap = await transaction.get(batchRef);
    if (!batchSnap.exists()) throw new Error('Batch tidak ditemukan');

    const batch = { id: batchSnap.id, ...batchSnap.data() } as BatchProduksi;
    if (batch.status === statusBaru) {
      throw new Error('Status batch sudah diperbarui oleh pengguna lain');
    }

    const updatePayload: Record<string, unknown> = {
      status: statusBaru,
      updatedAt: serverTimestamp(),
    };

    const penugasanKey = PENUGASAN_KEY[statusBaru];
    if (penugasan && penugasanKey) {
      updatePayload[`penugasan.${penugasanKey}`] = penugasan;
    }

    if (riwayat.pcs_berhasil != null) {
      updatePayload['pcs_saat_ini'] = riwayat.pcs_berhasil;
    }

    if (newDetailUkuran && newDetailUkuran.length > 0) {
      updatePayload['detail_ukuran'] = newDetailUkuran;
    }

    transaction.update(batchRef, updatePayload);
    transaction.set(riwayatRef, {
      ...riwayat,
      tipe: 'status_update',
      status_dari: batch.status,
      status_ke: statusBaru,
      updated_by_uid: updatedByUid,
      updated_by_nama: updatedByNama,
      timestamp: serverTimestamp(),
    });
  });
}

// Sinkronkan hasil cutting batch ke stok_potongan
// Dipakai untuk batch CUTTING_DONE yang hasil cuttingnya belum masuk stok_potongan
export async function sinkronStokPotonganBatch(batchId: string): Promise<void> {
  const batch = await getBatchById(batchId);
  if (!batch) throw new Error('Batch tidak ditemukan');
  if (batch.status !== 'CUTTING_DONE') throw new Error('Hanya batch Cutting Selesai yang bisa disinkronkan');
  if (batch.dari_potongan) throw new Error('Batch ini bukan batch cutting original');
  if (batch.stok_potongan_synced) return; // sudah pernah disinkronkan, skip

  const pcsBerhasil = batch.pcs_saat_ini ?? batch.total_pcs;
  if (pcsBerhasil <= 0 || batch.total_pcs <= 0) throw new Error('PCS batch tidak valid');

  const ratio = pcsBerhasil / batch.total_pcs;
  let sisa = pcsBerhasil;
  const detailBerhasil = batch.detail_ukuran
    .map((du, idx) => {
      const isLast = idx === batch.detail_ukuran.length - 1;
      const jumlah = isLast ? sisa : Math.floor(du.jumlah_pcs * ratio);
      sisa -= jumlah;
      return { ukuran: du.ukuran, jumlah_pcs: Math.max(0, jumlah) };
    })
    .filter((du) => du.jumlah_pcs > 0);

  await tambahStokPotongan(
    batch.model_id,
    batch.nama_model,
    detailBerhasil,
    { nama_warna: batch.nama_warna, kode_hex_warna: batch.kode_hex_warna },
  );

  await updateDoc(doc(db, COL, batchId), { stok_potongan_synced: true, updatedAt: serverTimestamp() });
}

// Selesaikan batch + tambah stok barang jadi dalam satu transaction
export async function completeBatchProduksi(
  batchId: string,
  updatedByUid: string,
  updatedByNama: string,
  riwayat: Omit<RiwayatProses, 'status_ke' | 'updated_by_uid' | 'updated_by_nama' | 'timestamp'>
): Promise<void> {
  const batch = await getBatchById(batchId);
  if (!batch) throw new Error('Batch tidak ditemukan');
  if (batch.status !== 'STEAM_DONE') {
    throw new Error('Batch hanya bisa diselesaikan dari status Steam Selesai');
  }
  if (riwayat.pcs_berhasil <= 0) {
    throw new Error('PCS berhasil harus lebih dari 0 untuk menyelesaikan batch');
  }

  // Jika detail_ukuran sudah diperbarui dengan hasil aktual (sum == pcs_berhasil),
  // gunakan langsung. Jika tidak (masih data awal), hitung proporsional.
  const sumDetailUkuran = batch.detail_ukuran.reduce((s, du) => s + du.jumlah_pcs, 0);
  let detailBerhasil: DetailUkuran[];
  if (sumDetailUkuran === riwayat.pcs_berhasil) {
    detailBerhasil = batch.detail_ukuran.filter((du) => du.jumlah_pcs > 0);
  } else {
    const ratio = riwayat.pcs_berhasil / batch.total_pcs;
    let sisa = riwayat.pcs_berhasil;
    detailBerhasil = batch.detail_ukuran
      .map((du, idx) => {
        const isLast = idx === batch.detail_ukuran.length - 1;
        const jumlah = isLast ? sisa : Math.floor(du.jumlah_pcs * ratio);
        sisa -= jumlah;
        return { ukuran: du.ukuran, jumlah_pcs: Math.max(0, jumlah) };
      })
      .filter((du) => du.jumlah_pcs > 0);
  }

  const stokBarangJadiRefs = new Map<string, ReturnType<typeof doc>>();
  for (const item of detailBerhasil) {
    const q = query(
      collection(db, 'stok_barang_jadi'),
      where('model_id', '==', batch.model_id),
      where('ukuran', '==', item.ukuran)
    );
    const snap = await getDocs(q);
    const ref = snap.empty
      ? doc(db, 'stok_barang_jadi', `${batch.model_id}__${item.ukuran}`)
      : snap.docs[0].ref;
    stokBarangJadiRefs.set(item.ukuran, ref);
  }

  const batchRef = doc(db, COL, batchId);
  const riwayatRef = doc(collection(db, COL, batchId, 'riwayat_proses'));

  await runTransaction(db, async (transaction) => {
    const batchSnap = await transaction.get(batchRef);
    if (!batchSnap.exists()) throw new Error('Batch tidak ditemukan');

    const currentBatch = { id: batchSnap.id, ...batchSnap.data() } as BatchProduksi;
    if (currentBatch.status === 'COMPLETED') {
      throw new Error('Batch sudah diselesaikan oleh pengguna lain');
    }
    if (currentBatch.status !== 'STEAM_DONE') {
      throw new Error('Status batch sudah berubah, muat ulang halaman lalu coba lagi');
    }

    const stokSnapshots = await Promise.all(
      detailBerhasil.map(async (item) => {
        const stokRef = stokBarangJadiRefs.get(item.ukuran);
        if (!stokRef) return null;

        const stokSnap = await transaction.get(stokRef);
        return { item, stokRef, stokSnap };
      })
    );

    transaction.update(batchRef, {
      status: 'COMPLETED' as StatusBatch,
      pcs_saat_ini: riwayat.pcs_berhasil,
      updatedAt: serverTimestamp(),
    });

    transaction.set(riwayatRef, {
      ...riwayat,
      tipe: 'status_update',
      status_dari: currentBatch.status,
      status_ke: 'COMPLETED' as StatusBatch,
      updated_by_uid: updatedByUid,
      updated_by_nama: updatedByNama,
      timestamp: serverTimestamp(),
    });

    for (const entry of stokSnapshots) {
      if (!entry) continue;
      const { item, stokRef, stokSnap } = entry;

      if (!stokSnap.exists()) {
        transaction.set(stokRef, {
          model_id: currentBatch.model_id,
          nama_model: currentBatch.nama_model,
          ...(currentBatch.nama_warna ? { nama_warna: currentBatch.nama_warna } : {}),
          ...(currentBatch.kode_hex_warna ? { kode_hex_warna: currentBatch.kode_hex_warna } : {}),
          ukuran: item.ukuran,
          stok_tersedia: item.jumlah_pcs,
          total_masuk: item.jumlah_pcs,
          total_keluar: 0,
          updatedAt: serverTimestamp(),
        });
        continue;
      }

      const stok = stokSnap.data() as { stok_tersedia: number; total_masuk: number };
      transaction.update(stokRef, {
        stok_tersedia: stok.stok_tersedia + item.jumlah_pcs,
        total_masuk: stok.total_masuk + item.jumlah_pcs,
        ...(currentBatch.nama_warna ? { nama_warna: currentBatch.nama_warna } : {}),
        ...(currentBatch.kode_hex_warna ? { kode_hex_warna: currentBatch.kode_hex_warna } : {}),
        updatedAt: serverTimestamp(),
      });
    }
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
  const batchRef = doc(db, COL, batchId);
  await runTransaction(db, async (transaction) => {
    const batchSnap = await transaction.get(batchRef);
    if (!batchSnap.exists()) throw new Error('Batch tidak ditemukan');

    const batch = { id: batchSnap.id, ...batchSnap.data() } as BatchProduksi;
    if (batch.status === 'COMPLETED') {
      throw new Error('Batch yang sudah selesai tidak dapat dihapus');
    }

    const kainSnapshots = await Promise.all(
      batch.kain_digunakan.map(async (kain) => {
        const kainRef = doc(db, 'stok_kain', kain.kain_id);
        const kainSnap = await transaction.get(kainRef);
        return { kain, kainRef, kainSnap };
      })
    );

    for (const { kain, kainRef, kainSnap } of kainSnapshots) {
      if (!kainSnap.exists()) continue;

      const stok = kainSnap.data() as { stok_tersedia: number; stok_terpakai: number };
      transaction.update(kainRef, {
        stok_tersedia: stok.stok_tersedia + kain.jumlah_dipakai,
        stok_terpakai: Math.max(0, stok.stok_terpakai - kain.jumlah_dipakai),
        updatedAt: serverTimestamp(),
      });
    }

    transaction.delete(batchRef);
  });

  // Hapus semua riwayat_proses di sub-koleksi
  const riwayatSnap = await getDocs(collection(db, COL, batchId, 'riwayat_proses'));
  for (const d of riwayatSnap.docs) {
    await deleteDoc(doc(db, COL, batchId, 'riwayat_proses', d.id));
  }
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
    const kebutuhan = (model?.kebutuhan_kain ?? []).find(k => k.kain_id === kd.kain_id);
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

  const batchRef = doc(db, COL, batchId);
  const riwayatRef = doc(collection(db, COL, batchId, 'riwayat_proses'));

  await runTransaction(db, async (transaction) => {
    const batchSnap = await transaction.get(batchRef);
    if (!batchSnap.exists()) throw new Error('Batch tidak ditemukan');

    const currentBatch = { id: batchSnap.id, ...batchSnap.data() } as BatchProduksi;
    if (currentBatch.status === 'COMPLETED') throw new Error('Batch selesai tidak dapat diedit');

    const kainSnapshots = await Promise.all(
      currentBatch.kain_digunakan.map(async (kainDigunakan, i) => {
        const oldJumlah = parseFloat(kainDigunakan.jumlah_dipakai.toFixed(2));
        const selisih = parseFloat((oldJumlah - newKainDigunakan[i].jumlah_dipakai).toFixed(2));
        if (selisih === 0) return null;

        const kainRef = doc(db, 'stok_kain', kainDigunakan.kain_id);
        const kainSnap = await transaction.get(kainRef);
        return { i, selisih, kainRef, kainSnap };
      })
    );

    for (const entry of kainSnapshots) {
      if (!entry) continue;
      const { i, selisih, kainSnap } = entry;
      if (!kainSnap.exists()) throw new Error('Kain tidak ditemukan');

      const kain = kainSnap.data() as { nama_kain: string; stok_tersedia: number; stok_terpakai: number };
      if (selisih < 0 && kain.stok_tersedia < Math.abs(selisih)) {
        throw new Error(`Stok kain "${kain.nama_kain}" tidak mencukupi`);
      }
    }

    for (const entry of kainSnapshots) {
      if (!entry) continue;
      const { selisih, kainRef, kainSnap } = entry;
      const kain = kainSnap.data() as { stok_tersedia: number; stok_terpakai: number };
      transaction.update(kainRef, {
        stok_tersedia: selisih > 0
          ? kain.stok_tersedia + selisih
          : kain.stok_tersedia - Math.abs(selisih),
        stok_terpakai: selisih > 0
          ? Math.max(0, kain.stok_terpakai - selisih)
          : kain.stok_terpakai + Math.abs(selisih),
        updatedAt: serverTimestamp(),
      });
    }

    transaction.update(batchRef, {
      detail_ukuran: newDetailUkuran,
      total_pcs: newTotal,
      kain_digunakan: newKainDigunakan,
      updatedAt: serverTimestamp(),
    });

    transaction.set(riwayatRef, {
      tipe: 'edit_kuantitas',
      status_dari: currentBatch.status,
      status_ke: currentBatch.status,
      updated_by_uid: updatedByUid,
      updated_by_nama: updatedByNama,
      pcs_berhasil: newTotal,
      pcs_reject: 0,
      catatan: alasan?.trim() || `Jumlah diubah dari ${oldTotal} menjadi ${newTotal} pcs`,
      timestamp: serverTimestamp(),
    });
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
