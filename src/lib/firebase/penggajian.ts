// src/lib/firebase/penggajian.ts
//
// Gaji karyawan produksi (Cutting, Jahit, Steam) dihitung per pcs baju yang
// berhasil diselesaikan dalam satu periode (biasanya per minggu), diambil
// dari riwayat_proses yang sudah tercatat di setiap batch produksi — tidak
// ada koleksi baru yang perlu ditulis manual, jadi datanya selalu sinkron
// dengan proses cutting/jahit/steam yang sudah berjalan.
//
// Breakdown model/warna/ukuran per karyawan datang dari `detail_ukuran` pada
// riwayat_proses (event saat batch itu berpindah status ke *_DONE), digabung
// dengan data batch induknya (nama_model/nama_warna).
//
// Penelusuran "dapat dari mana" (jahit dari cutting siapa, steam dari jahit
// & cutting siapa) memakai `batch.sumber_cutting` (antrian lot cutting yang
// sudah ada di sistem — dipakai juga oleh fitur stok potongan) dan
// `batch.penugasan` (worker yang ditugaskan di tiap tahap batch tsb).

import { collectionGroup, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from './config';
import { consumeSumberCuttingLots } from './batch-produksi';
import { getKaryawanList } from './karyawan';
import type {
  RiwayatProses,
  StatusBatch,
  BatchProduksi,
  DivisiProduksi,
  PenggajianKaryawan,
  PenggajianBreakdownItem,
  PenggajianSumberLot,
  DetailUkuran,
} from '$lib/types';

// Status yang menandakan pcs "diterima/selesai" pada masing-masing divisi.
const STATUS_DIVISI: Partial<Record<StatusBatch, DivisiProduksi>> = {
  CUTTING_DONE: 'Cutting',
  JAHIT_DONE: 'Jahit',
  STEAM_DONE: 'Steam',
};

interface RiwayatEvent {
  batchId: string;
  divisi: DivisiProduksi;
  uid: string;
  nama: string;
  pcsBerhasil: number;
  detailUkuran: DetailUkuran[];
  timestamp: Date | null;
}

function tsToDate(ts: any): Date | null {
  if (!ts) return null;
  return ts.toDate ? ts.toDate() : new Date(ts);
}

// Ambil semua event riwayat_proses yang relevan untuk penggajian (status_ke
// salah satu dari CUTTING_DONE / JAHIT_DONE / STEAM_DONE), lengkap dengan
// batch_id induknya (didapat dari path dokumen, karena RiwayatProses sendiri
// tidak menyimpan batch_id).
async function getRiwayatEvents(range: { start: Date; end: Date } | null): Promise<RiwayatEvent[]> {
  const snap = await getDocs(collectionGroup(db, 'riwayat_proses'));
  const events: RiwayatEvent[] = [];

  snap.docs.forEach((d) => {
    const data = d.data() as RiwayatProses;
    const divisi = STATUS_DIVISI[data.status_ke as StatusBatch];
    if (!divisi) return;

    const uid = data.updated_by_uid || data.updated_by_nama;
    if (!uid) return;

    const timestamp = tsToDate(data.timestamp);
    if (range) {
      if (!timestamp || timestamp < range.start || timestamp > range.end) return;
    }

    const batchId = d.ref.parent.parent?.id;
    if (!batchId) return;

    events.push({
      batchId,
      divisi,
      uid,
      nama: data.updated_by_nama,
      pcsBerhasil: data.pcs_berhasil ?? 0,
      detailUkuran: data.detail_ukuran ?? [],
      timestamp,
    });
  });

  return events;
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

// Cari lot-lot sumber cutting untuk sejumlah `qty` pcs pada `ukuran` tertentu,
// dari antrian sumber_cutting sebuah batch. Kalau batch tidak punya
// sumber_cutting (dijahit langsung dari kain, bukan dari pool stok potongan),
// fallback ke satu-satunya cutting worker yang ditugaskan di batch tsb.
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

function addBreakdown(
  list: PenggajianBreakdownItem[],
  item: Omit<PenggajianBreakdownItem, 'jumlah_pcs'> & { jumlah_pcs: number }
) {
  const existing = list.find(
    (b) => b.nama_model === item.nama_model && (b.nama_warna ?? '') === (item.nama_warna ?? '') && b.ukuran === item.ukuran
  );
  if (existing) {
    existing.jumlah_pcs += item.jumlah_pcs;
    if (item.sumber_cutting) {
      existing.sumber_cutting = [...(existing.sumber_cutting ?? []), ...item.sumber_cutting];
    }
    if (item.sumber_jahit) {
      existing.sumber_jahit = [...(existing.sumber_jahit ?? []), ...item.sumber_jahit];
    }
  } else {
    list.push({ ...item });
  }
}

/**
 * Hitung rekap penggajian untuk satu periode (mis. satu minggu), dikelompokkan
 * per karyawan + divisi, lengkap dengan breakdown model/warna/ukuran dan
 * (untuk Jahit & Steam) penelusuran sumber cutting/jahit-nya.
 */
export async function getPenggajianPeriode(
  range: { start: Date; end: Date } | null
): Promise<PenggajianKaryawan[]> {
  const [events, karyawanList] = await Promise.all([getRiwayatEvents(range), getKaryawanList()]);
  if (events.length === 0) return [];

  const batchMap = await getBatchMap(events.map((e) => e.batchId));
  const tarifMap = new Map(karyawanList.map((k) => [k.uid, k.tarif_per_pcs ?? 0]));
  const namaMap = new Map(karyawanList.map((k) => [k.uid, k.name]));

  const map = new Map<string, PenggajianKaryawan>();

  function getOrCreate(uid: string, nama: string, divisi: DivisiProduksi): PenggajianKaryawan {
    const key = `${uid}__${divisi}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        uid,
        nama: namaMap.get(uid) ?? nama,
        divisi,
        tarif_per_pcs: tarifMap.get(uid) ?? 0,
        total_pcs: 0,
        total_gaji: 0,
        jumlah_batch: 0,
        breakdown: [],
      };
      map.set(key, entry);
    }
    return entry;
  }

  for (const ev of events) {
    if (ev.pcsBerhasil <= 0) continue;
    const batch = batchMap.get(ev.batchId);
    if (!batch) continue;

    const entry = getOrCreate(ev.uid, ev.nama, ev.divisi);
    entry.total_pcs += ev.pcsBerhasil;
    entry.jumlah_batch += 1;

    // Pakai detail_ukuran event kalau ada (breakdown per-ukuran yang akurat).
    // Kalau kosong (data lama), fallback: satu baris tanpa breakdown ukuran.
    const rincianUkuran: { ukuran: string; jumlah_pcs: number }[] =
      ev.detailUkuran.length > 0
        ? ev.detailUkuran
        : [{ ukuran: '—', jumlah_pcs: ev.pcsBerhasil }];

    for (const du of rincianUkuran) {
      if (du.jumlah_pcs <= 0) continue;

      if (ev.divisi === 'Cutting') {
        addBreakdown(entry.breakdown, {
          nama_model: batch.nama_model,
          nama_warna: batch.nama_warna,
          ukuran: du.ukuran,
          jumlah_pcs: du.jumlah_pcs,
        });
      } else if (ev.divisi === 'Jahit') {
        addBreakdown(entry.breakdown, {
          nama_model: batch.nama_model,
          nama_warna: batch.nama_warna,
          ukuran: du.ukuran,
          jumlah_pcs: du.jumlah_pcs,
          sumber_cutting: cariSumberCutting(batch, du.ukuran, du.jumlah_pcs),
        });
      } else {
        // Steam: dapat dari jahit mana, dan (turunan) dari cutting mana.
        addBreakdown(entry.breakdown, {
          nama_model: batch.nama_model,
          nama_warna: batch.nama_warna,
          ukuran: du.ukuran,
          jumlah_pcs: du.jumlah_pcs,
          sumber_jahit: sumberJahitDariBatch(batch, du.ukuran, du.jumlah_pcs),
          sumber_cutting: cariSumberCutting(batch, du.ukuran, du.jumlah_pcs),
        });
      }
    }
  }

  const result = [...map.values()];
  for (const r of result) {
    r.total_gaji = r.total_pcs * r.tarif_per_pcs;
    r.breakdown.sort((a, b) => {
      if (a.nama_model !== b.nama_model) return a.nama_model.localeCompare(b.nama_model);
      if ((a.nama_warna ?? '') !== (b.nama_warna ?? '')) return (a.nama_warna ?? '').localeCompare(b.nama_warna ?? '');
      return a.ukuran.localeCompare(b.ukuran);
    });
  }

  result.sort((a, b) => {
    const order: Record<DivisiProduksi, number> = { Cutting: 0, Jahit: 1, Steam: 2 };
    if (order[a.divisi] !== order[b.divisi]) return order[a.divisi] - order[b.divisi];
    return b.total_pcs - a.total_pcs;
  });

  return result;
}
