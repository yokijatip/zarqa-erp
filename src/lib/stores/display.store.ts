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

  // ── Tema ──────────────────────────────────────────────────────────
  html.classList.remove('dark');
  if (s.tema === 'dark') {
    html.classList.add('dark');
  } else if (s.tema === 'system') {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      html.classList.add('dark');
    }
  }

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
