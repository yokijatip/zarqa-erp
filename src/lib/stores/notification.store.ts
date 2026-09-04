import { browser } from '$app/environment';

export type NotificationId =
  | 'batch_selesai'
  | 'stok_menipis'
  | 'batch_pending'
  | 'laporan_harian'
  | 'barang_keluar';

export type NotificationSettings = {
  enabled: boolean;
  inApp: boolean;
  browser: boolean;
  items: Record<NotificationId, boolean>;
};

export const NOTIFICATION_DEFINITIONS: Array<{
  id: NotificationId;
  label: string;
  description: string;
}> = [
  {
    id: 'batch_selesai',
    label: 'Batch produksi selesai',
    description: 'Beri tahu saat batch mencapai status selesai.',
  },
  {
    id: 'stok_menipis',
    label: 'Stok kain menipis',
    description: 'Beri tahu saat stok kain berada di bawah ambang batas.',
  },
  {
    id: 'batch_pending',
    label: 'Batch baru menunggu',
    description: 'Beri tahu saat ada order produksi yang belum diproses.',
  },
  {
    id: 'laporan_harian',
    label: 'Ringkasan harian',
    description: 'Siapkan ringkasan aktivitas produksi setiap hari pukul 18.00.',
  },
  {
    id: 'barang_keluar',
    label: 'Barang keluar dicatat',
    description: 'Beri tahu setiap kali ada pencatatan pengiriman barang.',
  },
];

const DEFAULT_ITEMS: Record<NotificationId, boolean> = {
  batch_selesai: true,
  stok_menipis: true,
  batch_pending: false,
  laporan_harian: false,
  barang_keluar: false,
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  inApp: true,
  browser: false,
  items: DEFAULT_ITEMS,
};

const STORAGE_KEY = 'zarqa_notifications';

function getStorageKey(uid?: string): string {
  return `${STORAGE_KEY}:${uid || 'local'}`;
}

export function loadNotificationSettings(uid?: string): NotificationSettings {
  if (!browser) return { ...DEFAULT_NOTIFICATION_SETTINGS, items: { ...DEFAULT_ITEMS } };

  try {
    const raw = localStorage.getItem(getStorageKey(uid));
    if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS, items: { ...DEFAULT_ITEMS } };
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>;
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...parsed,
      items: { ...DEFAULT_ITEMS, ...(parsed.items ?? {}) },
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS, items: { ...DEFAULT_ITEMS } };
  }
}

export function saveNotificationSettings(settings: NotificationSettings, uid?: string): void {
  if (!browser) return;
  localStorage.setItem(getStorageKey(uid), JSON.stringify(settings));
}

export function resetNotificationSettings(uid?: string): NotificationSettings {
  const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, items: { ...DEFAULT_ITEMS } };
  saveNotificationSettings(settings, uid);
  return settings;
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!browser || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!browser || !('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}

export function sendBrowserNotification(title: string, body: string): boolean {
  if (!browser || !('Notification' in window) || Notification.permission !== 'granted') return false;
  new Notification(title, { body, icon: '/favicon.svg' });
  return true;
}

export function isNotificationEnabled(
  settings: NotificationSettings,
  id: NotificationId,
  channel: 'inApp' | 'browser' = 'inApp',
): boolean {
  return settings.enabled && settings[channel] && settings.items[id];
}
