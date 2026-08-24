// src/lib/stores/display.store.ts
import { browser } from '$app/environment';

export type Tema     = 'light' | 'dark' | 'system';
export type Densitas = 'default' | 'compact';

export type DisplaySettings = {
  tema:     Tema;
  densitas: Densitas;
  animasi:  boolean;
};

const STORAGE_KEY = 'zarqa_display';

export const DEFAULT: DisplaySettings = {
  tema:     'light',
  densitas: 'default',
  animasi:  true,
};

export function loadSettings(): DisplaySettings {
  if (!browser) return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function applySettings(s: DisplaySettings): void {
  if (!browser) return;
  const html = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = s.tema === 'dark' || (s.tema === 'system' && prefersDark);

  // ── Tema ──────────────────────────────────────────────────────────
  html.classList.remove('dark');
  if (isDark) html.classList.add('dark');
  html.style.colorScheme = isDark ? 'dark' : 'light';

  // ── Densitas ──────────────────────────────────────────────────────
  html.dataset.density = s.densitas;

  // ── Animasi ───────────────────────────────────────────────────────
  if (s.animasi) {
    html.classList.remove('no-animation');
  } else {
    html.classList.add('no-animation');
  }
}

export function saveSettings(s: DisplaySettings): void {
  if (!browser) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  applySettings(s);
}

export function watchSystemTheme(s: DisplaySettings): () => void {
  if (!browser || s.tema !== 'system') return () => {};
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => applySettings(s);
  media.addEventListener('change', handler);
  return () => media.removeEventListener('change', handler);
}
