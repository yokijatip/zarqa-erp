// src/lib/firebase/penggajian.ts
//
// Sistem penggajian baru:
// - Karyawan punya tipe penggajian: harian, mingguan, bulanan, atau tahunan
// - Penggajian mingguan dihitung per pcs dari riwayat_proses
// - Tarif per pcs diinput saat akan cetak laporan
//
// Breakdown model per karyawan dikelompokkan per model dengan detail warna, ukuran, dan tanggal

import { collectionGroup, getDocs, getDoc, doc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import { consumeSumberCuttingLots } from './batch-produksi';
import type {
  RiwayatProses,
  StatusBatch,
  BatchProduksi,
  DivisiProduksi,
  PenggajianSumberLot,
} from '$lib/types';

// Status yang menandai pcs "diterima/selesai" pada masing-masing divisi.
const STATUS_DIVISI: Partial<Record<StatusBatch, DivisiProduksi>> = {
  CUTTING_DONE: 'Cutting',
  JAHIT_DONE: 'Jahit',
  STEAM_DONE: 'Steam',
  COMPLETED: 'Steam',
};

interface RiwayatEvent {
  batchId: string;
  divisi: DivisiProduksi;
  statusKe: StatusBatch;
  uid: string;
  nama: string;
  pcsBerhasil: number;
  detailUkuran: Array<{ ukuran: string; jumlah_pcs: number }>;
  timestamp: Date | null;
}

function tsToDate(ts: any): Date | null {
  if (!ts) return null;
  return ts.toDate ? ts.toDate() : new Date(ts);
}

function steamPayrollKey(event: RiwayatEvent): string {
  return `${event.batchId}::${event.uid}`;
}

function dedupeSteamFinalizationEvents(events: RiwayatEvent[]): RiwayatEvent[] {
  const steamDoneKeys = new Set(
    events
      .filter((event) => event.statusKe === 'STEAM_DONE' && event.divisi === 'Steam' && event.pcsBerhasil > 0)
      .map(steamPayrollKey)
  );

  return events.filter((event) => {
    if (event.statusKe !== 'COMPLETED' || event.divisi !== 'Steam') return true;
    return !steamDoneKeys.has(steamPayrollKey(event));
  });
}

// Ambil semua event riwayat_proses yang relevan untuk penggajian
async function getRiwayatEvents(range: { start: Date; end: Date } | null): Promise<RiwayatEvent[]> {
  const snap = await getDocs(collectionGroup(db, 'riwayat_proses'));
  const events: RiwayatEvent[] = [];

  snap.docs.forEach((d) => {
    const data = d.data() as RiwayatProses;
    const statusKe = data.status_ke as StatusBatch;
    const divisi = STATUS_DIVISI[statusKe];
    if (!divisi) return;

    const uid = data.updated_by_uid || data.updated_by_nama;
    if (!uid) return;

    const timestamp = tsToDate(data.timestamp);

    const batchId = d.ref.parent.parent?.id;
    if (!batchId) return;

    const rawDetailUkuran =
      data.detail_ukuran ||
      (data as any).ke_jahit_per_ukuran ||
      (data as any).ke_steam_per_ukuran ||
      (data as any).detail_berhasil ||
      [];

    events.push({
      batchId,
      divisi,
      statusKe,
      uid,
      nama: data.updated_by_nama,
      pcsBerhasil: data.pcs_berhasil ?? 0,
      detailUkuran: Array.isArray(rawDetailUkuran) ? rawDetailUkuran : [],
      timestamp,
    });
  });

  const payrollEvents = dedupeSteamFinalizationEvents(events);
  if (!range) return payrollEvents;
  return payrollEvents.filter((event) => {
    if (!event.timestamp) return false;
    return event.timestamp >= range.start && event.timestamp <= range.end;
  });
}

async function getBatchMap(batchIds: string[]): Promise<Map<string, BatchProduksi>> {
  const uniqueIds = [...new Set(batchIds)];
  const map = new Map<string, BatchProduksi>();
  await Promise.all(
    uniqueIds.map(async (id) => {
      const snap = await getDoc(doc(db, 'batch_produksi', id));
      if (snap.exists()) map.set(id, { id: snap.id, ...snap.data() } as BatchProduksi);
    })
  );
  return map;
}

// Cari lot-lot sumber cutting
function cariSumberCutting(batch: BatchProduksi, ukuran: string, qty: number): PenggajianSumberLot[] {
  const lotUkuran = (batch.sumber_cutting ?? []).filter((l) => (l.ukuran ?? '') === ukuran);
  if (lotUkuran.length > 0) {
    const { consumed } = consumeSumberCuttingLots(lotUkuran, qty);
    return consumed.map((l) => ({
      batch_id: l.batch_id,
      nama_model: l.nama_model,
      nama_warna: l.nama_warna,
      ukuran,
      jumlah_pcs: l.jumlah_pcs ?? 0,
      nama_pekerja: l.penugasan?.cutting?.nama,
    }));
  }
  if (batch.penugasan?.cutting) {
    return [
      {
        batch_id: batch.id,
        nama_model: batch.nama_model,
        nama_warna: batch.nama_warna,
        ukuran,
        jumlah_pcs: qty,
        nama_pekerja: batch.penugasan.cutting.nama,
      },
    ];
  }
  return [];
}

function sumberJahitDariBatch(batch: BatchProduksi, ukuran: string, qty: number): PenggajianSumberLot[] {
  if (!batch.penugasan?.jahit) return [];
  return [
    {
      batch_id: batch.id,
      nama_model: batch.nama_model,
      nama_warna: batch.nama_warna,
      ukuran,
      jumlah_pcs: qty,
      nama_pekerja: batch.penugasan.jahit.nama,
    },
  ];
}

/**
 * Detail per (model + warna + ukuran) dengan tanggal
 */
export interface PenggajianBreakdownDetail {
  nama_model: string;
  nama_warna?: string;
  ukuran: string;
  pcs: number;
  tanggal: string; // format: dd MMM yyyy HH:mm
  batch_id: string;
  sumber_cutting?: PenggajianSumberLot[];
  sumber_jahit?: PenggajianSumberLot[];
}

/**
 * Data penggajian per karyawan dengan breakdown detail
 */
export interface PenggajianData {
  uid: string;
  nama: string;
  divisi: DivisiProduksi;
  total_pcs: number;
  jumlah_batch: number;
  breakdown: PenggajianBreakdownDetail[];
}

/**
 * Hitung penggajian untuk periode tertentu, dengan breakdown lengkap (model, warna, ukuran, tanggal)
 */
export async function getPenggajianPeriode(
  range: { start: Date; end: Date } | null
): Promise<PenggajianData[]> {
  const events = await getRiwayatEvents(range);
  if (events.length === 0) return [];

  const batchMap = await getBatchMap(events.map((e) => e.batchId));

  const map = new Map<string, PenggajianData>();

  function getOrCreate(uid: string, nama: string, divisi: DivisiProduksi): PenggajianData {
    let entry = map.get(uid);
    if (!entry) {
      entry = {
        uid,
        nama,
        divisi,
        total_pcs: 0,
        jumlah_batch: 0,
        breakdown: [],
      };
      map.set(uid, entry);
    }
    return entry;
  }

  function workerForPayroll(
    ev: RiwayatEvent,
    batch: BatchProduksi
  ): { uid: string; nama: string } | null {
    if (ev.statusKe === 'CUTTING_DONE') return batch.penugasan?.cutting ?? { uid: ev.uid, nama: ev.nama };
    if (ev.statusKe === 'JAHIT_DONE') return batch.penugasan?.jahit ?? { uid: ev.uid, nama: ev.nama };
    if (ev.statusKe === 'STEAM_DONE' || ev.statusKe === 'COMPLETED') {
      return batch.penugasan?.steam ?? { uid: ev.uid, nama: ev.nama };
    }
    return { uid: ev.uid, nama: ev.nama };
  }

  function formatTanggal(date: Date | null): string {
    if (!date) return "—";
    return date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  for (const ev of events) {
    if (ev.pcsBerhasil <= 0) continue;
    const batch = batchMap.get(ev.batchId);
    if (!batch) continue;

    const payrollWorker = workerForPayroll(ev, batch);
    if (!payrollWorker?.uid) continue;

    const entry = getOrCreate(payrollWorker.uid, payrollWorker.nama, ev.divisi);
    entry.total_pcs += ev.pcsBerhasil;
    entry.jumlah_batch += 1;

    let rincianUkuran: { ukuran: string; jumlah_pcs: number }[] =
      ev.detailUkuran.length > 0 ? ev.detailUkuran.filter((u) => (u.jumlah_pcs ?? 0) > 0) : [];

    // Jika riwayat_proses tidak punya rincian ukuran, ambil dari batch.detail_ukuran
    if (rincianUkuran.length === 0 && batch.detail_ukuran && batch.detail_ukuran.length > 0) {
      const batchTotal = batch.detail_ukuran.reduce((s, du) => s + (du.jumlah_pcs ?? 0), 0);
      if (batchTotal > 0 && ev.pcsBerhasil === batchTotal) {
        rincianUkuran = batch.detail_ukuran.map((du) => ({
          ukuran: du.ukuran,
          jumlah_pcs: du.jumlah_pcs,
        }));
      } else if (batchTotal > 0) {
        // Bagi proporsional jika pcsBerhasil beda dengan total_pcs batch
        const ratio = ev.pcsBerhasil / batchTotal;
        rincianUkuran = batch.detail_ukuran.map((du) => ({
          ukuran: du.ukuran,
          jumlah_pcs: Math.max(1, Math.round((du.jumlah_pcs ?? 0) * ratio)),
        }));
      } else {
        rincianUkuran = batch.detail_ukuran.map((du) => ({
          ukuran: du.ukuran,
          jumlah_pcs: du.jumlah_pcs,
        }));
      }
    }

    if (rincianUkuran.length === 0) {
      rincianUkuran = [{ ukuran: 'All Size', jumlah_pcs: ev.pcsBerhasil }];
    }

    for (const du of rincianUkuran) {
      if (du.jumlah_pcs <= 0) continue;

      const detail: PenggajianBreakdownDetail = {
        nama_model: batch.nama_model,
        nama_warna: batch.nama_warna,
        ukuran: du.ukuran,
        pcs: du.jumlah_pcs,
        tanggal: formatTanggal(ev.timestamp),
        batch_id: ev.batchId,
      };

      if (ev.divisi === 'Jahit') {
        detail.sumber_cutting = cariSumberCutting(batch, du.ukuran, du.jumlah_pcs);
      } else if (ev.divisi === 'Steam') {
        detail.sumber_jahit = sumberJahitDariBatch(batch, du.ukuran, du.jumlah_pcs);
        detail.sumber_cutting = cariSumberCutting(batch, du.ukuran, du.jumlah_pcs);
      }

      entry.breakdown.push(detail);
    }
  }

  const result = [...map.values()];
  // Sort breakdown by date descending (newest first)
  for (const r of result) {
    r.breakdown.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  }
  result.sort((a, b) => b.total_pcs - a.total_pcs);

  return result;
}

/**
 * Input tarif saat cetak per model
 */
export interface TarifCetakInput {
  nama_model: string;
  tarif_per_pcs: number;
}

/**
 * Hitung gaji karyawan dengan tarif yang diinput
 */
export function hitungGajiKaryawan(
  data: PenggajianData,
  tarifList: TarifCetakInput[]
): {
  total_gaji: number;
  detail_per_model: Array<{
    nama_model: string;
    total_pcs: number;
    tarif: number;
    subtotal: number;
    detail_warna_ukuran: Array<{
      nama_warna?: string;
      ukuran: string;
      pcs: number;
    }>;
  }>;
} {
  const tarifMap = new Map(tarifList.map(t => [t.nama_model, t.tarif_per_pcs]));

  let totalGaji = 0;

  // Group by model
  const byModel = new Map<string, {
    nama_model: string;
    total_pcs: number;
    tarif: number;
    detail_warna_ukuran: Array<{ nama_warna?: string; ukuran: string; pcs: number }>;
  }>();

  for (const b of data.breakdown) {
    let modelEntry = byModel.get(b.nama_model);
    if (!modelEntry) {
      const tarif = tarifMap.get(b.nama_model) ?? 0;
      modelEntry = {
        nama_model: b.nama_model,
        total_pcs: 0,
        tarif,
        detail_warna_ukuran: [],
      };
      byModel.set(b.nama_model, modelEntry);
    }
    modelEntry.total_pcs += b.pcs;

    // Add warna+ukuran detail
    const existingWarnaUkuran = modelEntry.detail_warna_ukuran.find(
      w => (w.nama_warna ?? '') === (b.nama_warna ?? '') && w.ukuran === b.ukuran
    );
    if (existingWarnaUkuran) {
      existingWarnaUkuran.pcs += b.pcs;
    } else {
      modelEntry.detail_warna_ukuran.push({
        nama_warna: b.nama_warna,
        ukuran: b.ukuran,
        pcs: b.pcs,
      });
    }
  }

  const detailPerModel: Array<{
    nama_model: string;
    total_pcs: number;
    tarif: number;
    subtotal: number;
    detail_warna_ukuran: Array<{ nama_warna?: string; ukuran: string; pcs: number }>;
  }> = [];

  for (const [_, modelEntry] of byModel) {
    const subtotal = modelEntry.total_pcs * modelEntry.tarif;
    totalGaji += subtotal;
    detailPerModel.push({
      ...modelEntry,
      subtotal,
    });
  }

  return { total_gaji: totalGaji, detail_per_model: detailPerModel };
}

/**
 * Record pembayaran gaji yang disimpan di Firestore
 */
export interface PembayaranGajiRecord {
  id?: string;
  karyawan_uid: string;
  karyawan_nama: string;
  divisi: DivisiProduksi;
  periode_start: string;
  periode_end: string;
  total_pcs: number;
  total_gaji: number;
  detail_per_model: Array<{
    nama_model: string;
    total_pcs: number;
    tarif: number;
    subtotal: number;
  }>;
  created_at?: any;
  created_by_uid?: string;
  created_by_nama?: string;
}

/**
 * Simpan bukti pembayaran gaji ke Firestore
 */
export async function simpanPembayaranGaji(
  data: Omit<PembayaranGajiRecord, 'id' | 'created_at'>
): Promise<string> {
  const colRef = collection(db, 'pembayaran_gaji');
  const docRef = await addDoc(colRef, {
    ...data,
    created_at: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Ambil daftar pembayaran gaji yang sudah diproses pada periode tertentu
 */
export async function getPembayaranGajiPeriode(
  range: { start: Date; end: Date } | null
): Promise<PembayaranGajiRecord[]> {
  const colRef = collection(db, 'pembayaran_gaji');
  const snap = await getDocs(colRef);
  const result: PembayaranGajiRecord[] = [];

  snap.docs.forEach((docSnap) => {
    const d = docSnap.data() as PembayaranGajiRecord;
    if (range) {
      const pStart = d.periode_start ? new Date(d.periode_start) : null;
      const pEnd = d.periode_end ? new Date(d.periode_end) : null;
      if (pStart && pEnd) {
        if (pEnd < range.start || pStart > range.end) {
          return;
        }
      }
    }
    result.push({ id: docSnap.id, ...d });
  });

  return result;
}

