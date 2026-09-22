import {
  canonicalUkuran,
  ukuranAliases,
  type BarangKeluar,
  type BarangKeluarItem,
  type ModeHargaVarian,
  type ModelBaju,
  type UkuranBaju,
  type VarianPenjualan,
} from '$lib/types';

export type JenisHargaVarian = 'jual' | 'produksi';

export function modeHargaVarian(
  variant: VarianPenjualan | undefined,
  jenis: JenisHargaVarian,
): ModeHargaVarian {
  if (!variant) return 'induk_plus_addon';
  const explicit = jenis === 'jual' ? variant.harga_jual_mode : variant.harga_produksi_mode;
  if (explicit === 'custom' || explicit === 'induk_plus_addon') return explicit;

  // Data lama memakai harga tunggal sebagai harga custom total per ukuran.
  const legacy = jenis === 'jual' ? variant.harga_jual : variant.harga_produksi;
  const priceMap = jenis === 'jual' ? variant.harga_jual_per_ukuran : variant.harga_produksi_per_ukuran;
  return legacy != null && legacy > 0 || Object.values(priceMap ?? {}).some((value) => value != null && value > 0)
    ? 'custom'
    : 'induk_plus_addon';
}

export function hargaCustomVarianUntukUkuran(
  variant: VarianPenjualan | undefined,
  jenis: JenisHargaVarian,
  ukuran: string,
): number | undefined {
  if (!variant || modeHargaVarian(variant, jenis) !== 'custom') return undefined;
  const priceMap = jenis === 'jual' ? variant.harga_jual_per_ukuran : variant.harga_produksi_per_ukuran;
  const bySize = ukuranAliases(ukuran)
    .map((alias) => priceMap?.[alias as UkuranBaju])
    .find((value) => value != null && value > 0);
  if (bySize != null && bySize > 0) return bySize;
  const legacy = jenis === 'jual' ? variant.harga_jual : variant.harga_produksi;
  return legacy != null && legacy > 0 ? legacy : undefined;
}

export type SalesItemRow = {
  listId: string;
  tanggal: any;
  tujuan: string;
  buyer: string;
  model_id: string;
  nama_model: string;
  varian_id?: string;
  nama_varian?: string;
  nama_warna?: string;
  ukuran: string;
  status: 'keluar' | 'pending';
  pcs: number;
  harga_jual: number;
  biaya_admin: number;
  nilai_bersih: number;
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
  biayaAdmin: number;
  nilaiBersih: number;
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

export type ProductSalesRow = {
  key: string;
  model_id: string;
  nama_model: string;
  nama_warna?: string;
  ukuran: string;
  pcs: number;
  nilaiJual: number;
  nilaiBersih: number;
  biayaAdmin: number;
  hpp: number;
  laba: number;
  orderCount: number;
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

function findModel(modelList: ModelBaju[], modelId: string, modelName?: string) {
  const normalizedName = modelName?.trim().toLowerCase();
  return modelList.find((item) => item.id === modelId) ??
    (normalizedName ? modelList.find((item) => item.nama_model.trim().toLowerCase() === normalizedName) : undefined);
}

function modelPrice(modelList: ModelBaju[], modelId: string, modelName?: string) {
  const model = findModel(modelList, modelId, modelName);
  return {
    jual: model?.harga_jual ?? 0,
    produksi: model?.harga_produksi ?? 0,
  };
}

export function hargaJualUntukUkuran(model: ModelBaju | undefined, ukuran: string): number {
  const price = ukuranAliases(ukuran)
    .map((alias) => model?.harga_jual_per_ukuran?.[alias as UkuranBaju])
    .find((value) => value != null && value > 0);
  return price ?? model?.harga_jual ?? 0;
}

export function hargaJualKanalUntukUkuran(
  model: ModelBaju | undefined,
  ukuran: string,
  kanalId?: string,
): number {
  const canonicalSize = canonicalUkuran(ukuran);
  const channelPrice = kanalId
    ? ukuranAliases(canonicalSize)
        .map((alias) => model?.harga_jual_per_kanal?.[kanalId]?.[alias as UkuranBaju])
        .find((value) => value != null && value > 0)
    : undefined;
  return channelPrice != null && channelPrice > 0
    ? channelPrice
    : hargaJualUntukUkuran(model, canonicalSize);
}

export function hargaJualVarianKanalUntukUkuran(
  variant: VarianPenjualan | undefined,
  ukuran: string,
  kanalId?: string,
): number | undefined {
  const canonicalSize = canonicalUkuran(ukuran);
  const channelPrice = kanalId
    ? ukuranAliases(canonicalSize)
        .map((alias) => variant?.harga_jual_per_kanal?.[kanalId]?.[alias as UkuranBaju])
        .find((value) => value != null && value > 0)
    : undefined;
  if (channelPrice != null && channelPrice > 0) return channelPrice;
  return hargaCustomVarianUntukUkuran(variant, 'jual', canonicalSize);
}

export function hargaProduksiUntukUkuran(model: ModelBaju | undefined, ukuran: string): number {
  return model?.harga_produksi_per_ukuran?.[canonicalUkuran(ukuran)] ?? model?.harga_produksi ?? 0;
}

function effectivePrice(snapshot: number | undefined, fallback: number): number {
  return snapshot != null && snapshot > 0 ? snapshot : fallback;
}

function netPrice(gross: number, feePercent: number): number {
  return Math.max(0, gross * (1 - Math.min(100, Math.max(0, feePercent)) / 100));
}

export function salesItemValue(item: BarangKeluarItem, modelList: ModelBaju[]) {
  if (item.jenis_produk === 'hijab') {
    if (item.status === 'pending') return { nilaiJual: 0, biayaAdmin: 0, nilaiBersih: 0, hpp: 0, laba: 0 };
    const hargaJual = item.harga_jual_per_pcs ?? 0;
    const hargaBersih = item.harga_jual_bersih_per_pcs ?? netPrice(hargaJual, item.biaya_admin_persen ?? 0);
    const nilaiJual = item.total_pcs * hargaJual;
    const nilaiBersih = item.total_pcs * hargaBersih;
    const hpp = item.total_pcs * (item.harga_produksi_per_pcs ?? 0);
    return { nilaiJual, biayaAdmin: nilaiJual - nilaiBersih, nilaiBersih, hpp, laba: nilaiBersih - hpp };
  }
  const model = findModel(modelList, item.model_id, item.nama_model);
  const harga = modelPrice(modelList, item.model_id, item.nama_model);
  if (item.status === 'pending') return { nilaiJual: 0, biayaAdmin: 0, nilaiBersih: 0, hpp: 0, laba: 0 };
  const priceRows = item.detail_keluar.map((detail) => {
    const gross = effectivePrice(detail.harga_jual, hargaJualUntukUkuran(model, detail.ukuran));
    const fee = detail.biaya_admin_persen ?? item.biaya_admin_persen ?? 0;
    return { detail, gross, net: effectivePrice(detail.harga_jual_bersih, netPrice(gross, fee)) };
  });
  const nilaiJual = priceRows.reduce(
    (sum, row) => sum + row.detail.jumlah_pcs * row.gross,
    0,
  );
  const nilaiBersih = priceRows.reduce((sum, row) => sum + row.detail.jumlah_pcs * row.net, 0);
  const hpp = item.detail_keluar.reduce(
    (sum, detail) => sum + detail.jumlah_pcs * effectivePrice(detail.harga_produksi, hargaProduksiUntukUkuran(model, detail.ukuran) || harga.produksi),
    0,
  );
  return { nilaiJual, biayaAdmin: nilaiJual - nilaiBersih, nilaiBersih, hpp, laba: nilaiBersih - hpp };
}

export function salesItemRows(data: BarangKeluar[], modelList: ModelBaju[]): SalesItemRow[] {
  return data.flatMap((row) =>
    listItems(row).flatMap((item) => {
      if (item.jenis_produk === 'hijab') {
        const isPending = item.status === 'pending';
        const hargaJual = item.harga_jual_per_pcs ?? 0;
        const hargaBersih = item.harga_jual_bersih_per_pcs ?? netPrice(hargaJual, item.biaya_admin_persen ?? 0);
        const hargaProduksi = item.harga_produksi_per_pcs ?? 0;
        const nilaiJual = isPending ? 0 : item.total_pcs * hargaJual;
        const nilaiBersih = isPending ? 0 : item.total_pcs * hargaBersih;
        const hpp = isPending ? 0 : item.total_pcs * hargaProduksi;
        return [{
          listId: row.id,
          tanggal: row.tanggal_keluar,
          tujuan: item.tujuan ?? row.tujuan,
          buyer: item.nama_reseller ?? row.nama_reseller ?? '-',
          model_id: item.model_id,
          nama_model: item.nama_model,
          varian_id: item.varian_id,
          nama_varian: item.nama_varian,
          nama_warna: item.nama_warna,
          ukuran: 'ALL SIZE',
          status: item.status,
          pcs: item.total_pcs,
          harga_jual: hargaJual,
          biaya_admin: isPending ? 0 : nilaiJual - nilaiBersih,
          nilai_bersih: nilaiBersih,
          harga_produksi: hargaProduksi,
          nilai_jual: nilaiJual,
          hpp,
          laba: nilaiBersih - hpp,
        } satisfies SalesItemRow];
      }
      const model = findModel(modelList, item.model_id, item.nama_model);
      return item.detail_keluar.map((detail) => {
        const isPending = item.status === 'pending';
        const hargaJual = effectivePrice(detail.harga_jual, hargaJualUntukUkuran(model, detail.ukuran));
        const feePercent = detail.biaya_admin_persen ?? item.biaya_admin_persen ?? 0;
        const hargaBersih = effectivePrice(detail.harga_jual_bersih, netPrice(hargaJual, feePercent));
        const hargaProduksi = effectivePrice(detail.harga_produksi, hargaProduksiUntukUkuran(model, detail.ukuran));
        const nilaiJual = isPending ? 0 : detail.jumlah_pcs * hargaJual;
        const nilaiBersih = isPending ? 0 : detail.jumlah_pcs * hargaBersih;
        const hpp = isPending ? 0 : detail.jumlah_pcs * hargaProduksi;
        return {
          listId: row.id,
          tanggal: row.tanggal_keluar,
          tujuan: item.tujuan ?? row.tujuan,
          buyer: item.nama_reseller ?? row.nama_reseller ?? '-',
          model_id: item.model_id,
          nama_model: item.nama_model,
          varian_id: item.varian_id,
          nama_varian: item.nama_varian,
          nama_warna: item.nama_warna,
          ukuran: detail.ukuran,
          status: item.status,
          pcs: detail.jumlah_pcs,
          harga_jual: hargaJual,
          biaya_admin: isPending ? 0 : nilaiJual - nilaiBersih,
          nilai_bersih: nilaiBersih,
          harga_produksi: hargaProduksi,
          nilai_jual: nilaiJual,
          hpp,
          laba: nilaiBersih - hpp,
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
      biayaAdmin: detailRows.reduce((sum, item) => sum + item.biaya_admin, 0),
      nilaiBersih: detailRows.reduce((sum, item) => sum + item.nilai_bersih, 0),
      hpp: detailRows.reduce((sum, item) => sum + item.hpp, 0),
      laba: detailRows.reduce((sum, item) => sum + item.laba, 0),
      label: items.length > 1
        ? `${items.length} barang`
        : `${first?.nama_varian ?? first?.nama_model ?? row.nama_model}${first?.nama_warna ? ` - ${first.nama_warna}` : ''}`,
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

export function productSalesRows(items: SalesItemRow[]): ProductSalesRow[] {
  const map = new Map<string, ProductSalesRow>();
  for (const item of items.filter((row) => row.status !== 'pending')) {
    const key = `${item.model_id}|${item.nama_warna ?? ''}|${item.ukuran}`;
    const existing =
      map.get(key) ??
      ({
        key,
        model_id: item.model_id,
        nama_model: item.nama_model,
        nama_warna: item.nama_warna,
        ukuran: item.ukuran,
        pcs: 0,
        nilaiJual: 0,
        nilaiBersih: 0,
        biayaAdmin: 0,
        hpp: 0,
        laba: 0,
        orderCount: 0,
      } satisfies ProductSalesRow);
    existing.pcs += item.pcs;
    existing.nilaiJual += item.nilai_jual;
    existing.nilaiBersih += item.nilai_bersih;
    existing.biayaAdmin += item.biaya_admin;
    existing.hpp += item.hpp;
    existing.laba += item.laba;
    existing.orderCount += 1;
    map.set(key, existing);
  }
  return [...map.values()].sort((a, b) => b.pcs - a.pcs || b.nilaiJual - a.nilaiJual);
}

export function filterSalesLists(rows: SalesListRow[], search: string): SalesListRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    [row.label, row.tujuan, row.buyer, row.status].some((value) => value.toLowerCase().includes(q)),
  );
}
