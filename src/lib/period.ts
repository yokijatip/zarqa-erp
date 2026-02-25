// src/lib/period.ts
// Utility untuk filter data berdasarkan periode waktu

export type Period = 'hari_ini' | 'minggu_ini' | 'bulan_ini' | 'tahun_ini' | 'semua';

export const PERIOD_LABEL: Record<Period, string> = {
  hari_ini: 'Hari Ini',
  minggu_ini: 'Minggu Ini',
  bulan_ini: 'Bulan Ini',
  tahun_ini: 'Tahun Ini',
  semua: 'Semua',
};

export type DateRange = { start: Date; end: Date } | null;

export function getPeriodRange(period: Period): DateRange {
  if (period === 'semua') return null;
  const now = new Date();
  switch (period) {
    case 'hari_ini': {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const end   = new Date(now); end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'minggu_ini': {
      const day = now.getDay(); // 0 = Minggu
      const start = new Date(now); start.setDate(now.getDate() - day); start.setHours(0, 0, 0, 0);
      const end   = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'bulan_ini': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'tahun_ini': {
      const start = new Date(now.getFullYear(), 0, 1);
      const end   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start, end };
    }
  }
}

// Filter array berdasarkan DateRange
export function filterByRange<T>(
  items: T[],
  range: DateRange,
  getTs: (item: T) => { toDate(): Date } | undefined
): T[] {
  if (!range) return items;
  return items.filter((item) => {
    const ts = getTs(item);
    if (!ts) return false;
    const d = ts.toDate();
    return d >= range.start && d <= range.end;
  });
}
