// src/lib/firebase/performa.ts
import { collectionGroup, getDocs } from 'firebase/firestore';
import { db } from './config';
import type { RiwayatProses, StatusBatch } from '$lib/types';

export interface PerformaKaryawan {
  uid: string;
  nama: string;
  divisi: string;
  total_pcs_berhasil: number;
  total_pcs_reject: number;
  jumlah_batch: number;
  reject_rate: number; // 0-100
}

// Status yang menandakan pekerjaan selesai di suatu divisi
const STATUS_DIVISI: Partial<Record<StatusBatch, string>> = {
  CUTTING_DONE: 'Cutting',
  JAHIT_DONE:   'Jahit',
  STEAM_DONE:   'Steam',
  COMPLETED:    'Keluar',
};

export async function getPerformaKaryawan(): Promise<PerformaKaryawan[]> {
  const snap = await getDocs(collectionGroup(db, 'riwayat_proses'));

  // Map per uid: (uid -> PerformaKaryawan)
  const map = new Map<string, PerformaKaryawan & { _divisiCount: Record<string, number> }>();

  snap.docs.forEach((doc) => {
    const d = doc.data() as RiwayatProses;

    // Hanya hitung entri di mana batch mencapai status DONE/COMPLETED
    const divisi = STATUS_DIVISI[d.status_ke as StatusBatch];
    if (!divisi) return;

    const key = d.updated_by_uid || d.updated_by_nama;
    if (!key) return;

    const existing = map.get(key) ?? {
      uid: d.updated_by_uid,
      nama: d.updated_by_nama,
      divisi: '',
      total_pcs_berhasil: 0,
      total_pcs_reject: 0,
      jumlah_batch: 0,
      reject_rate: 0,
      _divisiCount: {},
    };

    existing.total_pcs_berhasil += d.pcs_berhasil ?? 0;
    existing.total_pcs_reject  += d.pcs_reject ?? 0;
    existing.jumlah_batch      += 1;
    existing._divisiCount[divisi] = (existing._divisiCount[divisi] ?? 0) + 1;

    map.set(key, existing);
  });

  return Array.from(map.values())
    .map(({ _divisiCount, ...p }) => {
      // Divisi utama = yang paling sering dikerjakan
      const divisi = Object.entries(_divisiCount)
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

      const total = p.total_pcs_berhasil + p.total_pcs_reject;
      const reject_rate = total > 0
        ? Math.round((p.total_pcs_reject / total) * 100)
        : 0;

      return { ...p, divisi, reject_rate };
    })
    .sort((a, b) => b.total_pcs_berhasil - a.total_pcs_berhasil);
}
