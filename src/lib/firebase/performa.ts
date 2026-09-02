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

export type DivisiKey = 'Cutting' | 'Jahit' | 'Steam' | 'Keluar';

// Status yang menandakan pekerjaan selesai di suatu divisi
const STATUS_DIVISI: Partial<Record<StatusBatch, DivisiKey>> = {
  CUTTING_DONE: 'Cutting',
  JAHIT_DONE:   'Jahit',
  STEAM_DONE:   'Steam',
  COMPLETED:    'Keluar',
};

/** Performa dikelompokkan per divisi — satu karyawan bisa muncul di beberapa divisi */
export async function getPerformaPerDivisi(options?: { dari?: string; sampai?: string }): Promise<Record<DivisiKey, PerformaKaryawan[]>> {
  const snap = await getDocs(collectionGroup(db, 'riwayat_proses'));

  const dari = options?.dari ? new Date(`${options.dari}T00:00:00`) : null;
  const sampai = options?.sampai ? new Date(`${options.sampai}T23:59:59.999`) : null;

  // Map per (uid + divisi)
  const map = new Map<string, PerformaKaryawan>();

  function getOrCreate(uid: string, nama: string, divisi: DivisiKey): PerformaKaryawan {
    const key = `${uid}__${divisi}`;
    const existing = map.get(key) ?? {
      uid,
      nama,
      divisi,
      total_pcs_berhasil: 0,
      total_pcs_reject: 0,
      jumlah_batch: 0,
      reject_rate: 0,
    };
    map.set(key, existing);
    return existing;
  }

  snap.docs.forEach((doc) => {
    const d = doc.data() as RiwayatProses;
    if (dari || sampai) {
      const timestamp = d.timestamp?.toDate ? d.timestamp.toDate() : d.timestamp ? new Date(d.timestamp as any) : null;
      if (!timestamp || (dari && timestamp < dari) || (sampai && timestamp > sampai)) return;
    }

    const divisi = STATUS_DIVISI[d.status_ke as StatusBatch];
    if (!divisi) return;

    const uid = d.updated_by_uid || d.updated_by_nama;
    if (!uid) return;

    const entry = getOrCreate(uid, d.updated_by_nama, divisi);
    entry.total_pcs_berhasil += d.pcs_berhasil ?? 0;
    entry.jumlah_batch += 1;

    // Reject biasanya jadi tanggung jawab tahap yang mencatatnya. Tapi kalau
    // ada `reject_attribusi` (mis. reject ditemukan saat Steam tapi
    // penyebabnya cacat jahitan), reject itu dialihkan ke divisi & orang yang
    // dituju, bukan ke tahap yang menemukannya.
    const pcsReject = d.pcs_reject ?? 0;
    if (pcsReject > 0) {
      if (d.reject_attribusi) {
        const target = getOrCreate(d.reject_attribusi.uid, d.reject_attribusi.nama, d.reject_attribusi.divisi as DivisiKey);
        target.total_pcs_reject += pcsReject;
      } else {
        entry.total_pcs_reject += pcsReject;
      }
    }
  });

  const result: Record<DivisiKey, PerformaKaryawan[]> = {
    Cutting: [],
    Jahit: [],
    Steam: [],
    Keluar: [],
  };

  map.forEach((p) => {
    const total = p.total_pcs_berhasil + p.total_pcs_reject;
    p.reject_rate = total > 0 ? Math.round((p.total_pcs_reject / total) * 100) : 0;
    result[p.divisi as DivisiKey]?.push(p);
  });

  for (const key of Object.keys(result) as DivisiKey[]) {
    result[key].sort((a, b) => b.total_pcs_berhasil - a.total_pcs_berhasil);
  }

  return result;
}

/** @deprecated Gunakan getPerformaPerDivisi */
export async function getPerformaKaryawan(): Promise<PerformaKaryawan[]> {
  const byDivisi = await getPerformaPerDivisi();
  const all = [...byDivisi.Cutting, ...byDivisi.Jahit, ...byDivisi.Steam, ...byDivisi.Keluar];
  return all.sort((a, b) => b.total_pcs_berhasil - a.total_pcs_berhasil);
}
