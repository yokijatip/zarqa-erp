// src/lib/firebase/batch-produksi.ts
import {
  collection, doc, getDocs, getDoc,
  addDoc, updateDoc, deleteDoc, serverTimestamp,
  runTransaction, Timestamp,
  query, orderBy, where, onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { getModelBajuById } from './model-baju';
import type { BatchProduksi, BatchProduksiInput, StatusBatch, RiwayatProses, PenugasanWorker, DetailUkuran, KainDigunakan, ModelBaju, SumberCutting } from '$lib/types';

const COL = 'batch_produksi';

function warnaDocKey(namaWarna: string): string {
  return namaWarna.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function buildStokPotonganDocId(modelId: string, ukuran: string, namaWarna?: string): string {
  if (!namaWarna) return `${modelId}__${ukuran}`;
  return `${modelId}__${ukuran}__${warnaDocKey(namaWarna)}`;
}

function buildSumberCutting(batch: BatchProduksi, ukuran: string, jumlahPcs: number): SumberCutting {
  return {
    batch_id: batch.id,
    nama_model: batch.nama_model,
    ...(batch.nama_warna ? { nama_warna: batch.nama_warna } : {}),
    ukuran,
    jumlah_pcs: jumlahPcs,
    ...(batch.penugasan?.cutting ? { penugasan: { cutting: batch.penugasan.cutting } } : {}),
  };
}

// Tambahkan satu lot baru ke akhir antrian sumber_cutting sebuah pool stok_potongan.
// Kalau lot paling belakang berasal dari batch_id yang sama (misalnya cutting yang
// disetor bertahap), jumlah pcs-nya digabung supaya antrian tidak pecah jadi banyak
// entri kecil untuk satu batch cutting yang sama.
function appendSumberCuttingLot(existing: SumberCutting[] | undefined, lot: SumberCutting): SumberCutting[] {
  const list = existing ? [...existing] : [];
  const last = list[list.length - 1];
  if (last && last.batch_id === lot.batch_id) {
    list[list.length - 1] = { ...last, jumlah_pcs: (last.jumlah_pcs ?? 0) + (lot.jumlah_pcs ?? 0) };
    return list;
  }
  list.push(lot);
  return list;
}

// Ambil `qty` pcs dari antrian sumber_cutting sebuah pool secara FIFO (lot paling lama
// diambil duluan). Mengembalikan lot-lot yang benar-benar terpakai (untuk diwariskan ke
// batch baru sebagai sumber_cutting-nya) beserta sisa antrian setelah pengambilan.
// Ini yang memastikan batch baru hanya "mewarisi" sumber cutting sebanyak yang memang
// diambil dari pool — bukan seluruh histori kontributor pool tersebut.
function consumeSumberCuttingLots(
  queue: SumberCutting[] | undefined,
  qty: number,
): { consumed: SumberCutting[]; remaining: SumberCutting[] } {
  const consumed: SumberCutting[] = [];
  const remaining: SumberCutting[] = [];
  let sisa = qty;
  for (const lot of queue ?? []) {
    const tersedia = lot.jumlah_pcs ?? 0;
    if (sisa <= 0 || tersedia <= 0) {
      remaining.push(lot);
      continue;
    }
    const diambil = Math.min(sisa, tersedia);
    consumed.push({ ...lot, jumlah_pcs: diambil });
    sisa -= diambil;
    if (tersedia > diambil) {
      remaining.push({ ...lot, jumlah_pcs: tersedia - diambil });
    }
  }
  return { consumed, remaining };
}

// Status yang menandakan kain sudah dipotong (stok kain sudah berkurang)
const STATUSES_KAIN_SUDAH_DIPOTONG = new Set<StatusBatch>([
  'CUTTING_DONE', 'JAHIT_IN_PROGRESS', 'JAHIT_DONE',
  'STEAM_IN_PROGRESS', 'STEAM_DONE',
  // COMPLETED tidak ada di sini karena batch COMPLETED tidak bisa dihapus
]);

// Buat order produksi baru
// Stok kain BELUM dikurangi di sini — pengurangan terjadi saat CUTTING_DONE
export async function createBatchProduksi(
  data: BatchProduksiInput,
  dibuatOlehUid: string
): Promise<string> {
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
  const totalPcs = data.detail_ukuran.reduce((sum, u) => sum + u.jumlah_pcs, 0);
  const stokPotonganRefs = new Map<string, ReturnType<typeof doc>>();

  for (const du of data.detail_ukuran) {
    const q = data.nama_warna
      ? query(collection(db, 'stok_potongan'), where('model_id', '==', data.model_id), where('ukuran', '==', du.ukuran), where('nama_warna', '==', data.nama_warna))
      : query(collection(db, 'stok_potongan'), where('model_id', '==', data.model_id), where('ukuran', '==', du.ukuran));
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

    // Tarik lot cutting secara FIFO per ukuran, sebanyak pcs yang benar-benar diambil.
    // Sisa antrian (yang tidak terpakai) dikembalikan ke pool agar tetap bisa dilacak
    // untuk penarikan berikutnya.
    const sumberCuttingBaru: SumberCutting[] = [];
    for (const { du, stokRef, stokSnap } of stokSnapshots) {
      const stok = stokSnap.data() as { stok_tersedia: number; total_terpakai: number; sumber_cutting?: SumberCutting[] };
      const { consumed, remaining } = consumeSumberCuttingLots(stok.sumber_cutting, du.jumlah_pcs);
      sumberCuttingBaru.push(...consumed.map((lot) => ({ ...lot, ukuran: du.ukuran })));

      transaction.update(stokRef, {
        stok_tersedia: stok.stok_tersedia - du.jumlah_pcs,
        total_terpakai: stok.total_terpakai + du.jumlah_pcs,
        sumber_cutting: remaining,
        updatedAt: serverTimestamp(),
      });
    }

    const sumberCutting = [...(data.sumber_cutting ?? []), ...sumberCuttingBaru];
    const firstCuttingWorker = sumberCutting.find((source) => source.penugasan?.cutting)?.penugasan?.cutting;

    transaction.set(ref, {
      ...data,
      kain_digunakan: [],
      total_pcs: totalPcs,
      pcs_saat_ini: totalPcs,
      status: 'CUTTING_DONE' as StatusBatch,
      dari_potongan: true,
      ...(sumberCutting.length > 0 ? { sumber_cutting: sumberCutting } : {}),
      ...(firstCuttingWorker
        ? { penugasan: { ...data.penugasan, cutting: data.penugasan?.cutting ?? firstCuttingWorker } }
        : {}),
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

    // Saat transisi ke CUTTING_DONE: baca & validasi stok kain, lalu potong
    type KainEntry = {
      kain: KainDigunakan;
      kRef: ReturnType<typeof doc>;
      riwayatRef: ReturnType<typeof doc>;
      stok_tersedia: number;
      stok_terpakai: number;
    };
    const kainEntries: KainEntry[] = [];

    if (statusBaru === 'CUTTING_DONE' && !batch.dari_potongan) {
      // Gunakan kain_digunakan dari batch, atau hitung ulang dari model jika kosong/nol
      let kainList: KainDigunakan[] = (batch.kain_digunakan ?? []).filter(k => (k.jumlah_dipakai ?? 0) > 0);

      if (kainList.length === 0 && batch.model_id) {
        // Fallback: baca model sekarang dan hitung kebutuhan kain dari detail_ukuran aktual
        const modelRef = doc(db, 'model_baju', batch.model_id);
        const modelSnap = await transaction.get(modelRef);
        if (modelSnap.exists()) {
          const model = modelSnap.data() as ModelBaju;
          const detailUkuran = (newDetailUkuran && newDetailUkuran.length > 0) ? newDetailUkuran : batch.detail_ukuran;
          // Backward compat: kebutuhan_kain pernah disimpan di varian_warna[0].kebutuhan_kain
          const kebutuhanKain = (model.kebutuhan_kain?.length ?? 0) > 0
            ? model.kebutuhan_kain!
            : ((model as any).varian_warna?.[0]?.kebutuhan_kain ?? []);
          kainList = (kebutuhanKain as typeof model.kebutuhan_kain)
            .map((k) => ({
              kain_id: k.kain_id,
              nama_kain: k.nama_kain,
              satuan: k.satuan,
              jumlah_dipakai: parseFloat(
                detailUkuran
                  .reduce((sum, du) => sum + ((k.jumlah_per_ukuran ?? {})[du.ukuran] ?? 0) * du.jumlah_pcs, 0)
                  .toFixed(2)
              ),
            }))
            .filter((k) => k.jumlah_dipakai > 0);
        }
      }

      for (const kain of kainList) {
        const kRef = doc(db, 'stok_kain', kain.kain_id);
        const kSnap = await transaction.get(kRef);
        if (!kSnap.exists()) throw new Error(`Kain "${kain.nama_kain}" tidak ditemukan (id: ${kain.kain_id})`);
        const d = kSnap.data() as { nama_kain: string; stok_tersedia: number; stok_terpakai: number };
        if (d.stok_tersedia < kain.jumlah_dipakai) {
          throw new Error(`Stok kain "${d.nama_kain}" tidak mencukupi (tersedia: ${d.stok_tersedia}, dibutuhkan: ${kain.jumlah_dipakai})`);
        }
        kainEntries.push({
          kain,
          kRef,
          riwayatRef: doc(collection(db, 'stok_kain', kain.kain_id, 'riwayat')),
          stok_tersedia: d.stok_tersedia,
          stok_terpakai: d.stok_terpakai ?? 0,
        });
      }
    }

    const updatePayload: Record<string, unknown> = {
      status: statusBaru,
      updatedAt: serverTimestamp(),
    };

    // Jika kain_digunakan batch kosong/nol tapi kita bisa hitung dari model, simpan hasil hitung
    if (statusBaru === 'CUTTING_DONE' && !batch.dari_potongan && kainEntries.length > 0 && (batch.kain_digunakan ?? []).filter(k => (k.jumlah_dipakai ?? 0) > 0).length === 0) {
      updatePayload['kain_digunakan'] = kainEntries.map(e => e.kain);
    }

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

    // Kurangi stok kain + tulis riwayat saat cutting selesai
    for (const { kain, kRef, riwayatRef, stok_tersedia, stok_terpakai } of kainEntries) {
      const stokBaru = stok_tersedia - kain.jumlah_dipakai;
      transaction.update(kRef, {
        stok_tersedia: stokBaru,
        stok_terpakai: stok_terpakai + kain.jumlah_dipakai,
        updatedAt: serverTimestamp(),
      });
      transaction.set(riwayatRef, {
        tipe: 'pemakaian_produksi',
        jumlah: kain.jumlah_dipakai,
        stok_sebelum: stok_tersedia,
        stok_sesudah: stokBaru,
        catatan: `Batch produksi: ${batch.nama_model}`,
        timestamp: serverTimestamp(),
      });
    }
  });
}

export async function recordBatchProgress(
  batchId: string,
  updatedByUid: string,
  updatedByNama: string,
  riwayat: Pick<RiwayatProses, 'status_dari' | 'pcs_berhasil' | 'pcs_reject' | 'detail_ukuran' | 'detail_reject' | 'catatan'>
): Promise<void> {
  const batchRef = doc(db, COL, batchId);
  const riwayatRef = doc(collection(db, COL, batchId, 'riwayat_proses'));

  await runTransaction(db, async (transaction) => {
    const batchSnap = await transaction.get(batchRef);
    if (!batchSnap.exists()) throw new Error('Batch tidak ditemukan');

    const batch = { id: batchSnap.id, ...batchSnap.data() } as BatchProduksi;
    if (batch.status !== riwayat.status_dari) {
      throw new Error('Status batch sudah berubah, muat ulang halaman lalu coba lagi');
    }
    if (riwayat.pcs_berhasil <= 0 && riwayat.pcs_reject <= 0) {
      throw new Error('Isi minimal 1 pcs berhasil atau reject');
    }

    transaction.update(batchRef, {
      updatedAt: serverTimestamp(),
    });

    transaction.set(riwayatRef, {
      ...riwayat,
      tipe: 'setor_proses',
      status_ke: batch.status,
      updated_by_uid: updatedByUid,
      updated_by_nama: updatedByNama,
      timestamp: serverTimestamp(),
    });
  });
}

export async function splitJahitPartialToSteam(
  batchId: string,
  updatedByUid: string,
  updatedByNama: string,
  detailBerhasil: DetailUkuran[],
  detailReject: DetailUkuran[] = []
): Promise<string | null> {
  const batchRef = doc(db, COL, batchId);
  const childRef = doc(collection(db, COL));
  const sourceRiwayatRef = doc(collection(db, COL, batchId, 'riwayat_proses'));
  const childRiwayatRef = doc(collection(db, COL, childRef.id, 'riwayat_proses'));

  let createdChildId: string | null = null;

  await runTransaction(db, async (transaction) => {
    const batchSnap = await transaction.get(batchRef);
    if (!batchSnap.exists()) throw new Error('Batch tidak ditemukan');

    const batch = { id: batchSnap.id, ...batchSnap.data() } as BatchProduksi;
    if (batch.status !== 'JAHIT_IN_PROGRESS') {
      throw new Error('Setor parsial hanya bisa dilakukan dari status Sedang Jahit');
    }

    const berhasilBySize = new Map(detailBerhasil.map((du) => [du.ukuran, du.jumlah_pcs]));
    const rejectBySize = new Map(detailReject.map((du) => [du.ukuran, du.jumlah_pcs]));
    const remainingDetail = batch.detail_ukuran
      .map((du) => ({
        ukuran: du.ukuran,
        jumlah_pcs: du.jumlah_pcs - (berhasilBySize.get(du.ukuran) ?? 0) - (rejectBySize.get(du.ukuran) ?? 0),
      }))
      .filter((du) => du.jumlah_pcs > 0);
    const childDetail = batch.detail_ukuran
      .map((du) => ({
        ukuran: du.ukuran,
        jumlah_pcs: berhasilBySize.get(du.ukuran) ?? 0,
      }))
      .filter((du) => du.jumlah_pcs > 0);

    const totalBerhasil = childDetail.reduce((sum, du) => sum + du.jumlah_pcs, 0);
    const totalReject = detailReject.reduce((sum, du) => sum + du.jumlah_pcs, 0);
    const totalRemaining = remainingDetail.reduce((sum, du) => sum + du.jumlah_pcs, 0);
    const totalInput = totalBerhasil + totalReject;

    if (totalInput <= 0) throw new Error('Isi minimal 1 pcs berhasil atau reject');
    if (totalRemaining <= 0) throw new Error('Gunakan Selesaikan Jahit untuk setoran terakhir');
    for (const du of batch.detail_ukuran) {
      const used = (berhasilBySize.get(du.ukuran) ?? 0) + (rejectBySize.get(du.ukuran) ?? 0);
      if (used < 0 || used > du.jumlah_pcs) {
        throw new Error(`Jumlah ukuran ${du.ukuran} melebihi sisa pekerjaan`);
      }
    }

    transaction.update(batchRef, {
      detail_ukuran: remainingDetail,
      pcs_saat_ini: totalRemaining,
      updatedAt: serverTimestamp(),
    });

    transaction.set(sourceRiwayatRef, {
      tipe: 'setor_proses',
      status_dari: batch.status,
      status_ke: batch.status,
      updated_by_uid: updatedByUid,
      updated_by_nama: updatedByNama,
      pcs_berhasil: totalBerhasil,
      pcs_reject: totalReject,
      catatan: `Setor parsial ${totalBerhasil} pcs${totalReject > 0 ? `, ${totalReject} reject` : ''}`,
      timestamp: serverTimestamp(),
    });

    if (totalBerhasil > 0) {
      const { id: _id, ...batchData } = batch as BatchProduksi;
      transaction.set(childRef, {
        ...batchData,
        detail_ukuran: childDetail,
        total_pcs: totalBerhasil,
        pcs_saat_ini: totalBerhasil,
        status: 'JAHIT_DONE' as StatusBatch,
        sumber_batch_id: batch.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.set(childRiwayatRef, {
        tipe: 'status_update',
        status_dari: 'JAHIT_IN_PROGRESS' as StatusBatch,
        status_ke: 'JAHIT_DONE' as StatusBatch,
        updated_by_uid: updatedByUid,
        updated_by_nama: updatedByNama,
        pcs_berhasil: totalBerhasil,
        pcs_reject: 0,
        detail_ukuran: childDetail,
        catatan: `Hasil setor parsial dari batch ${batch.nama_model}`,
        timestamp: serverTimestamp(),
      });
      createdChildId = childRef.id;
    }
  });

  return createdChildId;
}

// Sinkronkan hasil cutting batch ke stok_potongan
// Dipakai untuk batch CUTTING_DONE yang hasil cuttingnya belum masuk stok_potongan
export async function sinkronStokPotonganBatch(batchId: string): Promise<void> {
  const batch = await getBatchById(batchId);
  if (!batch) throw new Error('Batch tidak ditemukan');
  if (batch.status !== 'CUTTING_DONE') throw new Error('Hanya batch Cutting Selesai yang bisa disinkronkan');
  if (batch.dari_potongan) throw new Error('Batch ini bukan batch cutting original');
  if (batch.stok_potongan_synced) return; // sudah pernah disinkronkan, skip

  function hitungDetailBerhasil(source: BatchProduksi): DetailUkuran[] {
    const pcsBerhasil = source.pcs_saat_ini ?? source.total_pcs;
    if (pcsBerhasil <= 0 || source.total_pcs <= 0) throw new Error('PCS batch tidak valid');

    const totalDetail = source.detail_ukuran.reduce((sum, du) => sum + du.jumlah_pcs, 0);
    if (totalDetail === pcsBerhasil) {
      return source.detail_ukuran.filter((du) => du.jumlah_pcs > 0);
    }

    const ratio = pcsBerhasil / source.total_pcs;
    let sisa = pcsBerhasil;
    return source.detail_ukuran
      .map((du, idx) => {
        const isLast = idx === source.detail_ukuran.length - 1;
        const jumlah = isLast ? sisa : Math.floor(du.jumlah_pcs * ratio);
        sisa -= jumlah;
        return { ukuran: du.ukuran, jumlah_pcs: Math.max(0, jumlah) };
      })
      .filter((du) => du.jumlah_pcs > 0);
  }

  const detailBerhasil = hitungDetailBerhasil(batch);
  const stokRefs = new Map<string, ReturnType<typeof doc>>();
  for (const item of detailBerhasil) {
    const q = batch.nama_warna
      ? query(collection(db, 'stok_potongan'), where('model_id', '==', batch.model_id), where('ukuran', '==', item.ukuran), where('nama_warna', '==', batch.nama_warna))
      : query(collection(db, 'stok_potongan'), where('model_id', '==', batch.model_id), where('ukuran', '==', item.ukuran));
    const snap = await getDocs(q);
    const ref = snap.empty
      ? doc(db, 'stok_potongan', buildStokPotonganDocId(batch.model_id, item.ukuran, batch.nama_warna))
      : snap.docs[0].ref;
    stokRefs.set(item.ukuran, ref);
  }

  const batchRef = doc(db, COL, batchId);
  await runTransaction(db, async (transaction) => {
    const batchSnap = await transaction.get(batchRef);
    if (!batchSnap.exists()) throw new Error('Batch tidak ditemukan');

    const currentBatch = { id: batchSnap.id, ...batchSnap.data() } as BatchProduksi;
    if (currentBatch.status !== 'CUTTING_DONE') throw new Error('Hanya batch Cutting Selesai yang bisa disinkronkan');
    if (currentBatch.dari_potongan) throw new Error('Batch ini bukan batch cutting original');
    if (currentBatch.stok_potongan_synced) return;

    const currentDetailBerhasil = hitungDetailBerhasil(currentBatch);
    const stokSnapshots = await Promise.all(
      currentDetailBerhasil.map(async (item) => {
        const stokRef = stokRefs.get(item.ukuran);
        if (!stokRef) throw new Error('Data batch berubah, muat ulang lalu coba lagi');
        const stokSnap = await transaction.get(stokRef);
        return { item, stokRef, stokSnap };
      })
    );

    for (const { item, stokRef, stokSnap } of stokSnapshots) {
      const lot = buildSumberCutting(currentBatch, item.ukuran, item.jumlah_pcs);

      if (!stokSnap.exists()) {
        transaction.set(stokRef, {
          model_id: currentBatch.model_id,
          nama_model: currentBatch.nama_model,
          ...(currentBatch.nama_warna ? { nama_warna: currentBatch.nama_warna } : {}),
          ...(currentBatch.kode_hex_warna ? { kode_hex_warna: currentBatch.kode_hex_warna } : {}),
          ukuran: item.ukuran,
          stok_tersedia: item.jumlah_pcs,
          total_masuk: item.jumlah_pcs,
          total_terpakai: 0,
          sumber_cutting: [lot],
          updatedAt: serverTimestamp(),
        });
        continue;
      }

      const stok = stokSnap.data() as { stok_tersedia: number; total_masuk: number; sumber_cutting?: SumberCutting[] };
      transaction.update(stokRef, {
        stok_tersedia: stok.stok_tersedia + item.jumlah_pcs,
        total_masuk: stok.total_masuk + item.jumlah_pcs,
        ...(currentBatch.nama_warna ? { nama_warna: currentBatch.nama_warna } : {}),
        ...(currentBatch.kode_hex_warna ? { kode_hex_warna: currentBatch.kode_hex_warna } : {}),
        sumber_cutting: appendSumberCuttingLot(stok.sumber_cutting, lot),
        updatedAt: serverTimestamp(),
      });
    }

    transaction.update(batchRef, {
      stok_potongan_synced: true,
      updatedAt: serverTimestamp(),
    });
  });
}

// Selesaikan batch + tambah stok barang jadi dalam satu transaction
// Bisa dipanggil dari STEAM_IN_PROGRESS (skip STEAM_DONE) atau STEAM_DONE (recovery)
export async function completeBatchProduksi(
  batchId: string,
  updatedByUid: string,
  updatedByNama: string,
  riwayat: Omit<RiwayatProses, 'status_ke' | 'updated_by_uid' | 'updated_by_nama' | 'timestamp'>,
  newDetailUkuran?: DetailUkuran[]
): Promise<void> {
  const batch = await getBatchById(batchId);
  if (!batch) throw new Error('Batch tidak ditemukan');
  if (batch.status !== 'STEAM_DONE' && batch.status !== 'STEAM_IN_PROGRESS') {
    throw new Error('Batch hanya bisa diselesaikan dari status Steam atau Steam Selesai');
  }
  if (riwayat.pcs_berhasil <= 0) {
    throw new Error('PCS berhasil harus lebih dari 0 untuk menyelesaikan batch');
  }

  // Gunakan newDetailUkuran jika disertakan (hasil aktual per ukuran dari form),
  // jika tidak, gunakan detail_ukuran yang tersimpan di batch.
  // Jika sum == pcs_berhasil → gunakan langsung; jika tidak → hitung proporsional.
  const sourceDetail = (newDetailUkuran && newDetailUkuran.length > 0) ? newDetailUkuran : batch.detail_ukuran;
  const sumDetail = sourceDetail.reduce((s, du) => s + du.jumlah_pcs, 0);
  let detailBerhasil: DetailUkuran[];
  if (sumDetail === riwayat.pcs_berhasil) {
    detailBerhasil = sourceDetail.filter((du) => du.jumlah_pcs > 0);
  } else {
    const ratio = riwayat.pcs_berhasil / batch.total_pcs;
    let sisa = riwayat.pcs_berhasil;
    detailBerhasil = sourceDetail
      .map((du, idx) => {
        const isLast = idx === sourceDetail.length - 1;
        const jumlah = isLast ? sisa : Math.floor(du.jumlah_pcs * ratio);
        sisa -= jumlah;
        return { ukuran: du.ukuran, jumlah_pcs: Math.max(0, jumlah) };
      })
      .filter((du) => du.jumlah_pcs > 0);
  }

  function buildBarangJadiId(modelId: string, ukuran: string, namaWarna?: string): string {
    if (!namaWarna) return `${modelId}__${ukuran}`;
    const wKey = namaWarna.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return `${modelId}__${ukuran}__${wKey}`;
  }

  const stokBarangJadiRefs = new Map<string, ReturnType<typeof doc>>();
  for (const item of detailBerhasil) {
    const q = batch.nama_warna
      ? query(collection(db, 'stok_barang_jadi'), where('model_id', '==', batch.model_id), where('ukuran', '==', item.ukuran), where('nama_warna', '==', batch.nama_warna))
      : query(collection(db, 'stok_barang_jadi'), where('model_id', '==', batch.model_id), where('ukuran', '==', item.ukuran));
    const snap = await getDocs(q);
    const ref = snap.empty
      ? doc(db, 'stok_barang_jadi', buildBarangJadiId(batch.model_id, item.ukuran, batch.nama_warna))
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
    if (currentBatch.status !== 'STEAM_DONE' && currentBatch.status !== 'STEAM_IN_PROGRESS') {
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

      const stokSebelum = stokSnap.exists()
        ? (stokSnap.data() as { stok_tersedia: number }).stok_tersedia
        : 0;
      const stokSesudah = stokSebelum + item.jumlah_pcs;

      if (!stokSnap.exists()) {
        transaction.set(stokRef, {
          model_id: currentBatch.model_id,
          nama_model: currentBatch.nama_model,
          ...(currentBatch.nama_warna ? { nama_warna: currentBatch.nama_warna } : {}),
          ...(currentBatch.kode_hex_warna ? { kode_hex_warna: currentBatch.kode_hex_warna } : {}),
          ukuran: item.ukuran,
          stok_tersedia: stokSesudah,
          total_masuk: item.jumlah_pcs,
          total_keluar: 0,
          updatedAt: serverTimestamp(),
        });
      } else {
        const stok = stokSnap.data() as { stok_tersedia: number; total_masuk: number };
        transaction.update(stokRef, {
          stok_tersedia: stokSesudah,
          total_masuk: stok.total_masuk + item.jumlah_pcs,
          ...(currentBatch.nama_warna ? { nama_warna: currentBatch.nama_warna } : {}),
          ...(currentBatch.kode_hex_warna ? { kode_hex_warna: currentBatch.kode_hex_warna } : {}),
          updatedAt: serverTimestamp(),
        });
      }

      // Tulis riwayat masuk dari produksi
      const riwayatBarangJadiRef = doc(collection(db, 'riwayat_barang_jadi'));
      transaction.set(riwayatBarangJadiRef, {
        model_id: currentBatch.model_id,
        nama_model: currentBatch.nama_model,
        ukuran: item.ukuran,
        tipe: 'masuk_produksi',
        jumlah: item.jumlah_pcs,
        stok_sebelum: stokSebelum,
        stok_sesudah: stokSesudah,
        catatan: `Batch produksi selesai`,
        batch_id: batchId,
        dicatat_oleh_uid: updatedByUid,
        dicatat_oleh_nama: updatedByNama,
        timestamp: serverTimestamp(),
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

    // Kembalikan stok kain hanya jika kain sudah dipotong (CUTTING_DONE ke atas)
    if (STATUSES_KAIN_SUDAH_DIPOTONG.has(batch.status) && !batch.dari_potongan) {
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

    // Hanya sesuaikan stok kain jika cutting sudah selesai (kain sudah dipotong)
    if (STATUSES_KAIN_SUDAH_DIPOTONG.has(currentBatch.status) && !currentBatch.dari_potongan) {
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

// Ambil batch dalam rentang tanggal (berdasarkan createdAt)
export async function getBatchListByDateRange(from: Date, to: Date): Promise<BatchProduksi[]> {
  const q = query(
    collection(db, COL),
    where('createdAt', '>=', Timestamp.fromDate(from)),
    where('createdAt', '<=', Timestamp.fromDate(to)),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BatchProduksi);
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