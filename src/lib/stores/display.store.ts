// src/lib/stores/display.store.ts
import { browser } from '$app/environment';

export type Tema     = 'light' | 'dark' | 'system' | 'midnight' | 'ocean' | 'forest' | 'amoled';
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

const THEME_VALUES: Tema[] = ['light', 'dark', 'system', 'midnight', 'ocean', 'forest', 'amoled'];
const DARK_THEMES = new Set<Tema>(['dark', 'midnight', 'ocean', 'forest', 'amoled']);

function isTema(value: unknown): value is Tema {
  return typeof value === 'string' && THEME_VALUES.includes(value as Tema);
}

function isDensitas(value: unknown): value is Densitas {
  return value === 'default' || value === 'compact';
}

export function loadSettings(): DisplaySettings {
  if (!browser) return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<DisplaySettings>;
    return {
      tema: isTema(parsed.tema) ? parsed.tema : DEFAULT.tema,
      densitas: isDensitas(parsed.densitas) ? parsed.densitas : DEFAULT.densitas,
      animasi: typeof parsed.animasi === 'boolean' ? parsed.animasi : DEFAULT.animasi,
    };
  } catch {
    return DEFAULT;
  }
}

export function applySettings(s: DisplaySettings): void {
  if (!browser) return;
  const html = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = DARK_THEMES.has(s.tema) || (s.tema === 'system' && prefersDark);
  const resolvedTheme = s.tema === 'system' ? (isDark ? 'dark' : 'light') : s.tema;

  // ── Tema ──────────────────────────────────────────────────────────
  html.classList.remove('dark');
  if (isDark) html.classList.add('dark');
  html.dataset.theme = resolvedTheme;
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
