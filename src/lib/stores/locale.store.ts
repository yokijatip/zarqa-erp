// src/lib/stores/locale.store.ts
import { browser } from '$app/environment';

export type Bahasa       = 'id' | 'en';
export type ZonaWaktu    = 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura';
export type FormatTanggal = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type FormatAngka  = 'id' | 'en';

export type LocaleSettings = {
  bahasa:  Bahasa;
  zona:    ZonaWaktu;
  tanggal: FormatTanggal;
  angka:   FormatAngka;
};

const STORAGE_KEY = 'zarqa_locale';

export const DEFAULT: LocaleSettings = {
  bahasa:  'id',
  zona:    'Asia/Jakarta',
  tanggal: 'DD/MM/YYYY',
  angka:   'id',
};

export function loadLocale(): LocaleSettings {
  if (!browser) return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function saveLocale(s: LocaleSettings): void {
  if (!browser) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/** Format angka sesuai preferensi pengguna */
export function formatNumber(value: number, format: FormatAngka = loadLocale().angka): string {
  return new Intl.NumberFormat(format === 'id' ? 'id-ID' : 'en-US').format(value);
}

/** Format tanggal sesuai preferensi pengguna */
export function formatDate(date: Date, format: FormatTanggal = loadLocale().tanggal): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  switch (format) {
    case 'MM/DD/YYYY': return `${m}/${d}/${y}`;
    case 'YYYY-MM-DD': return `${y}-${m}-${d}`;
    default:           return `${d}/${m}/${y}`;
  }
}
