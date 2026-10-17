import { addDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import type { PekerjaanSteam } from '$lib/types';

const COL = 'pekerjaan_steam';

export interface CatatPekerjaanSteamInput {
  model_id: string;
  nama_model: string;
  warna_id?: string;
  nama_warna?: string;
  kode_hex_warna?: string;
  ukuran: string;
  pcs: number;
  tarif_steam_snapshot?: number;
  catatan?: string;
}

export async function catatPekerjaanSteam(
  input: CatatPekerjaanSteamInput,
  uid: string,
  nama: string,
): Promise<string> {
  const pcs = Math.floor(Number(input.pcs) || 0);
  if (!uid) throw new Error('Pengguna Steam tidak ditemukan');
  if (!input.model_id || !input.nama_model) throw new Error('Model wajib dipilih');
  if (pcs <= 0) throw new Error('Jumlah pcs harus lebih dari 0');

  const ref = await addDoc(collection(db, COL), {
    uid,
    nama,
    model_id: input.model_id,
    nama_model: input.nama_model,
    ...(input.warna_id ? { warna_id: input.warna_id } : {}),
    ...(input.nama_warna ? { nama_warna: input.nama_warna } : {}),
    ...(input.kode_hex_warna ? { kode_hex_warna: input.kode_hex_warna } : {}),
    ukuran: input.ukuran || 'All Size',
    pcs,
    ...(Number(input.tarif_steam_snapshot) > 0
      ? { tarif_steam_snapshot: Number(input.tarif_steam_snapshot) }
      : {}),
    ...(input.catatan?.trim() ? { catatan: input.catatan.trim() } : {}),
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getPekerjaanSteamPeriode(
  range: { start: Date; end: Date } | null = null,
): Promise<PekerjaanSteam[]> {
  const snap = await getDocs(collection(db, COL));
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }) as PekerjaanSteam)
    .filter((item) => {
      if (!range) return true;
      const raw = item.timestamp;
      const timestamp = raw?.toDate ? raw.toDate() : raw ? new Date(raw as any) : null;
      return !!timestamp && timestamp >= range.start && timestamp <= range.end;
    })
    .sort((a, b) => {
      const ta = a.timestamp?.toMillis?.() ?? 0;
      const tb = b.timestamp?.toMillis?.() ?? 0;
      return tb - ta;
    });
}
