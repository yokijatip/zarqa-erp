import type { BarangKeluar, BarangKeluarItem, ModelBaju } from '$lib/types';

export type SalesItemRow = {
  listId: string;
  tanggal: any;
  tujuan: string;
  buyer: string;
  model_id: string;
  nama_model: string;
  nama_warna?: string;
  ukuran: string;
  status: 'keluar' | 'pending';
  pcs: number;
  harga_jual: number;
  harga_produksi: number;
  nilai_jual: number;
  hpp: number;
  laba: number;
};

export type SalesListRow = {
  id: string;
  tanggal: any;
  tujuan: string;
  buyer: string;
  status: string;
  itemCount: number;
  pcsKeluar: number;
  pcsPending: number;
  nilaiJual: number;
  hpp: number;
  laba: number;
  label: string;
  original: BarangKeluar;
};

export type BuyerRow = {
  key: string;
  nama: string;
  tujuan: string;
  listCount: number;
  pcs: number;
  nilaiJual: number;
  pendingPcs: number;
  lastOrderMs: number;
};

export function listItems(row: BarangKeluar): BarangKeluarItem[] {
  return row.items && row.items.length > 0
    ? row.items
    : [
        {
          model_id: row.model_id,
          nama_model: row.nama_model,
          ...(row.nama_warna ? { nama_warna: row.nama_warna } : {}),
          ...(row.kode_hex_warna ? { kode_hex_warna: row.kode_hex_warna } : {}),
          detail_keluar: row.detail_keluar,
          total_pcs: row.total_pcs,
          status: 'keluar',
        },
      ];
}

export function tsMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  return new Date(ts).getTime();
}

export function formatDate(ts: any): string {
  const ms = tsMillis(ts);
  if (!ms) return '-';
  return new Date(ms).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function rupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function modelPrice(modelList: ModelBaju[], modelId: string) {
  const model = modelList.find((item) => item.id === modelId);
  return {
    jual: model?.harga_jual ?? 0,
    produksi: model?.harga_produksi ?? 0,
  };
}

export function salesItemRows(data: BarangKeluar[], modelList: ModelBaju[]): SalesItemRow[] {
  return data.flatMap((row) =>
    listItems(row).flatMap((item) => {
      const harga = modelPrice(modelList, item.model_id);
      return item.detail_keluar.map((detail) => {
        const isPending = item.status === 'pending';
        const nilaiJual = isPending ? 0 : detail.jumlah_pcs * harga.jual;
        const hpp = isPending ? 0 : detail.jumlah_pcs * harga.produksi;
        return {
          listId: row.id,
          tanggal: row.tanggal_keluar,
          tujuan: item.tujuan ?? row.tujuan,
          buyer: item.nama_reseller ?? row.nama_reseller ?? '-',
          model_id: item.model_id,
          nama_model: item.nama_model,
          nama_warna: item.nama_warna,
          ukuran: detail.ukuran,
          status: item.status,
          pcs: detail.jumlah_pcs,
          harga_jual: harga.jual,
          harga_produksi: harga.produksi,
          nilai_jual: nilaiJual,
          hpp,
          laba: nilaiJual - hpp,
        } satisfies SalesItemRow;
      });
    }),
  );
}

export function salesListRows(data: BarangKeluar[], modelList: ModelBaju[]): SalesListRow[] {
  return data.map((row) => {
    const items = listItems(row);
    const detailRows = salesItemRows([row], modelList);
    const pcsKeluar = items.filter((item) => item.status !== 'pending').reduce((sum, item) => sum + item.total_pcs, 0);
    const pcsPending = items.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.total_pcs, 0);
    const first = items[0];
    return {
      id: row.id,
      tanggal: row.tanggal_keluar,
      tujuan: row.tujuan,
      buyer: row.nama_reseller ?? '-',
      status: row.status ?? (pcsPending > 0 ? 'pending' : 'selesai'),
      itemCount: items.length,
      pcsKeluar,
      pcsPending,
      nilaiJual: detailRows.reduce((sum, item) => sum + item.nilai_jual, 0),
      hpp: detailRows.reduce((sum, item) => sum + item.hpp, 0),
      laba: detailRows.reduce((sum, item) => sum + item.laba, 0),
      label: items.length > 1 ? `${items.length} barang` : `${first?.nama_model ?? row.nama_model}${first?.nama_warna ? ` - ${first.nama_warna}` : ''}`,
      original: row,
    };
  });
}

export function buyerRows(rows: SalesListRow[]): BuyerRow[] {
  const map = new Map<string, BuyerRow>();
  for (const row of rows) {
    const key = `${row.tujuan}|${row.buyer}`;
    const existing =
      map.get(key) ??
      ({
        key,
        nama: row.buyer,
        tujuan: row.tujuan,
        listCount: 0,
        pcs: 0,
        nilaiJual: 0,
        pendingPcs: 0,
        lastOrderMs: 0,
      } satisfies BuyerRow);
    existing.listCount += 1;
    existing.pcs += row.pcsKeluar;
    existing.pendingPcs += row.pcsPending;
    existing.nilaiJual += row.nilaiJual;
    existing.lastOrderMs = Math.max(existing.lastOrderMs, tsMillis(row.tanggal));
    map.set(key, existing);
  }
  return [...map.values()].sort((a, b) => b.nilaiJual - a.nilaiJual || b.lastOrderMs - a.lastOrderMs);
}

export function filterSalesLists(rows: SalesListRow[], search: string): SalesListRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    [row.label, row.tujuan, row.buyer, row.status].some((value) => value.toLowerCase().includes(q)),
  );
}
