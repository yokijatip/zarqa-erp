import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './config';
import type { KanalPenjualan, PengaturanPenjualan } from '$lib/types';

const COL = 'pengaturan_penjualan';
const DOC_ID = 'kanal';

export const DEFAULT_KANAL_PENJUALAN: KanalPenjualan[] = [
  { id: 'gudang_central', nama: 'Gudang Central', biaya_admin_persen: 0, aktif: true, bawaan: true },
  { id: 'shopee', nama: 'Shopee', biaya_admin_persen: 0, aktif: true, bawaan: true },
  { id: 'tiktok', nama: 'TikTok', biaya_admin_persen: 0, aktif: true, bawaan: true },
  { id: 'lazada', nama: 'Lazada', biaya_admin_persen: 0, aktif: true, bawaan: true },
  { id: 'tokopedia', nama: 'Tokopedia', biaya_admin_persen: 0, aktif: true, bawaan: true },
  { id: 'web_ecommerce', nama: 'Web E-Commerce', biaya_admin_persen: 0, aktif: true, bawaan: true },
];

export function normalizeChannelKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function channelIdForName(value: string | undefined, channels: KanalPenjualan[] = DEFAULT_KANAL_PENJUALAN): string | undefined {
  if (!value) return undefined;
  const key = normalizeChannelKey(value);
  return channels.find((channel) => channel.id === value || normalizeChannelKey(channel.nama) === key)?.id;
}

function normalizeChannel(channel: Partial<KanalPenjualan>, fallback?: KanalPenjualan): KanalPenjualan | null {
  const nama = String(channel.nama ?? fallback?.nama ?? '').trim();
  const id = String(channel.id ?? fallback?.id ?? normalizeChannelKey(nama)).trim();
  if (!id || !nama) return null;
  const fee = Number(channel.biaya_admin_persen ?? fallback?.biaya_admin_persen ?? 0);
  return {
    id,
    nama,
    biaya_admin_persen: Math.min(100, Math.max(0, Number.isFinite(fee) ? fee : 0)),
    aktif: channel.aktif !== false,
    ...(channel.bawaan === true || fallback?.bawaan === true ? { bawaan: true } : {}),
  };
}

export function normalizeKanalPenjualan(value: unknown): KanalPenjualan[] {
  const stored = Array.isArray(value) ? value : [];
  const byId = new Map<string, KanalPenjualan>();
  for (const fallback of DEFAULT_KANAL_PENJUALAN) byId.set(fallback.id, { ...fallback });

  for (const raw of stored) {
    const candidate = normalizeChannel((raw ?? {}) as Partial<KanalPenjualan>);
    if (!candidate) continue;
    const existing = byId.get(candidate.id) ?? DEFAULT_KANAL_PENJUALAN.find(
      (fallback) => normalizeChannelKey(fallback.nama) === normalizeChannelKey(candidate.nama),
    );
    const normalized = normalizeChannel(candidate, existing);
    if (normalized) byId.set(normalized.id, normalized);
  }

  return [...byId.values()];
}

export async function getKanalPenjualan(): Promise<KanalPenjualan[]> {
  const snapshot = await getDoc(doc(db, COL, DOC_ID));
  if (!snapshot.exists()) return DEFAULT_KANAL_PENJUALAN.map((channel) => ({ ...channel }));
  const data = snapshot.data() as Partial<PengaturanPenjualan>;
  return normalizeKanalPenjualan(data.kanal);
}

export async function saveKanalPenjualan(channels: KanalPenjualan[]): Promise<void> {
  const normalized = normalizeKanalPenjualan(channels);
  const names = new Set<string>();
  for (const channel of normalized) {
    const key = normalizeChannelKey(channel.nama);
    if (names.has(key)) throw new Error(`Nama kanal "${channel.nama}" sudah digunakan`);
    names.add(key);
  }
  await setDoc(doc(db, COL, DOC_ID), {
    kanal: normalized,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function adminFeeForChannel(channels: KanalPenjualan[], channel: string | undefined): number {
  const id = channelIdForName(channel, channels);
  return channels.find((item) => item.id === id)?.biaya_admin_persen ?? 0;
}

export function netSalesValue(gross: number, feePercent: number): number {
  return Math.max(0, gross * (1 - Math.min(100, Math.max(0, feePercent)) / 100));
}
