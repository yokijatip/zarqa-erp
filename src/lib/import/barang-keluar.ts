import {
  UKURAN_ORDER,
  TUJUAN_PENGIRIMAN_OPTIONS,
  getAddOnPenjualan,
  resolveStokHijabIdUntukWarna,
  type BarangKeluarItem,
  type DetailKeluar,
  type KanalPenjualan,
  type ModelBaju,
  type ModelHijab,
  type StokBarangJadi,
  type StokHijab,
  type UkuranBaju,
  type VarianPenjualan,
} from "$lib/types";
import { hargaCustomVarianUntukUkuran } from "$lib/sales/penjualan";

type JenisProdukImport = "baju" | "hijab";

export type ParsedBarangKeluarItem = {
  jenis_produk: JenisProdukImport;
  model_id: string;
  stok_model_id?: string;
  model_hijab_id?: string;
  stok_hijab_id?: string;
  nama_model: string;
  nama_hijab?: string;
  varian_id?: string;
  nama_varian?: string;
  warna_id?: string;
  nama_warna?: string;
  kode_hex_warna?: string;
  harga_jual_per_pcs?: number;
  harga_produksi_per_pcs?: number;
  komponen_varian?: BarangKeluarItem["komponen_varian"];
  tujuan?: string;
  detail_keluar: DetailKeluar[];
  total_pcs: number;
  terpenuhi_pcs: number;
  pending_pcs: number;
  batal_pcs: number;
  raw: string;
};

export type ImportBarangKeluarItem = BarangKeluarItem & {
  tujuan_import?: string;
};

export const BARANG_KELUAR_IMPORT_DRAFT_KEY = "zarqa-erp:barang-keluar-import-draft";

export type BarangKeluarImportDraft = {
  fileName: string;
  items: ImportBarangKeluarItem[];
  tujuan: string;
  namaReseller: string;
  keterangan: string;
  unmatchedLines: string[];
};

export type ParseBarangKeluarResult = {
  items: ParsedBarangKeluarItem[];
  tujuan?: string;
  nama_reseller?: string;
  batal_pcs: number;
  unmatched_lines: string[];
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function findTujuan(text: string, kanalPenjualan: KanalPenjualan[] = []): string | undefined {
  const normalizedText = normalize(text);
  const options = [...kanalPenjualan.map((channel) => channel.nama), ...TUJUAN_PENGIRIMAN_OPTIONS];
  return options.find((tujuan) =>
    normalizedText.includes(normalize(tujuan)),
  );
}

function findReseller(lines: string[]): string | undefined {
  for (const line of lines) {
    const match = line.match(/\b(?:reseller|nama reseller|customer|penerima)\b\s*[:\-]\s*(.+)$/i);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return undefined;
}

function uniqueColors(
  modelColors: ModelBaju["warna_tersedia"] | ModelHijab["warna_tersedia"],
  stockColors: { warna_id?: string; nama_warna?: string; kode_hex_warna?: string }[],
) {
  const map = new Map<string, { warna_id?: string; nama_warna: string; kode_hex_warna?: string }>();
  for (const warna of modelColors ?? []) {
    map.set(normalize(warna.nama_warna), {
      warna_id: warna.warna_id,
      nama_warna: warna.nama_warna,
      kode_hex_warna: warna.kode_hex,
    });
  }
  for (const stock of stockColors) {
    if (!stock.nama_warna?.trim()) continue;
    map.set(normalize(stock.nama_warna), {
      ...(stock.warna_id ? { warna_id: stock.warna_id } : {}),
      nama_warna: stock.nama_warna,
      kode_hex_warna: stock.kode_hex_warna,
    });
  }
  return [...map.values()].sort(
    (a, b) => normalize(b.nama_warna).length - normalize(a.nama_warna).length,
  );
}

function colorsForBaju(model: ModelBaju, stokList: StokBarangJadi[]) {
  const modelIds = new Set([model.id, model.stok_model_id].filter(Boolean));
  return uniqueColors(
    model.warna_tersedia,
    stokList.filter((item) => modelIds.has(item.model_id)),
  );
}

function colorsForHijab(model: ModelHijab, stokList: StokHijab[]) {
  return uniqueColors(
    model.warna_tersedia,
    stokList.filter(
      (item) =>
        item.model_hijab_id === model.id ||
        normalize(item.nama_hijab) === normalize(model.nama_hijab),
    ),
  );
}

function findColor(
  line: string,
  colors: { warna_id?: string; nama_warna: string; kode_hex_warna?: string }[],
) {
  const normalizedLine = normalize(line);
  return colors.find((color) =>
    normalizedLine.includes(normalize(color.nama_warna)),
  );
}

function parseSizeQty(line: string): DetailKeluar[] {
  const result = new Map<UkuranBaju, number>();
  for (const ukuran of [...UKURAN_ORDER].sort((a, b) => b.length - a.length)) {
    const labels = ukuran === "S/M" ? ["S/M", "M/S"] : [ukuran];
    for (const label of labels) {
      const patterns = [
        new RegExp("(?:^|\\b)" + label + "\\s*(?:x|X|:|=|-)?\\s*(\\d+)\\b", "i"),
        new RegExp("\\b(\\d+)\\s*(?:pcs|pc|buah)?\\s*" + label + "(?:\\b|$)", "i"),
      ];
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (!match) continue;
        const qty = Number(match[1]);
        if (Number.isFinite(qty) && qty > 0) result.set(ukuran, qty);
        break;
      }
      if (result.has(ukuran)) break;
    }
  }
  return UKURAN_ORDER
    .filter((ukuran) => (result.get(ukuran) ?? 0) > 0)
    .map((ukuran) => ({ ukuran, jumlah_pcs: result.get(ukuran) ?? 0 }));
}

function parsePcsColumns(line: string, fallbackQty: number): {
  qty: number;
  terpenuhi: number;
  pending: number;
  batal: number;
} {
  const values = [...line.matchAll(/\b(\d+)\s*Pcs\b/gi)].map((match) =>
    Number(match[1]),
  );
  const qty = Math.max(0, values[0] ?? fallbackQty);
  const terpenuhi = Math.min(qty, Math.max(0, values[1] ?? qty));
  const pending = Math.min(
    qty - terpenuhi,
    Math.max(0, values[2] ?? qty - terpenuhi),
  );
  const batal = Math.min(
    qty - terpenuhi - pending,
    Math.max(0, values[3] ?? 0),
  );
  return { qty, terpenuhi, pending, batal };
}

function findBestProduct(
  line: string,
  modelList: ModelBaju[],
  modelHijabList: ModelHijab[],
  stokHijabList: StokHijab[],
) {
  const normalizedLine = normalize(line);
  const candidates = [
    ...modelList
      .filter((model) => model.aktif !== false)
      .map((model) => ({
        jenis_produk: "baju" as const,
        id: model.id,
        nama: model.nama_model,
        model,
        priority: 1,
      })),
    ...modelHijabList
      .filter((model) => model.aktif !== false)
      .map((model) => ({
        jenis_produk: "hijab" as const,
        id: model.id,
        nama: model.nama_hijab,
        model,
        priority: 0,
      })),
    ...stokHijabList
      .map((stock) => ({
        jenis_produk: "hijab" as const,
        id: stock.id,
        nama: stock.nama_hijab,
        model: undefined,
        stock,
        priority: 0,
      })),
  ].sort(
    (a, b) =>
      normalize(b.nama).length - normalize(a.nama).length ||
      b.priority - a.priority,
  );

  return candidates.find((candidate) =>
    normalizedLine.includes(normalize(candidate.nama)),
  );
}

function findHijabStock(
  product: {
    id: string;
    nama: string;
  },
  warna: string | undefined,
  stokList: StokHijab[],
): StokHijab | undefined {
  const candidates = stokList.filter(
    (stock) =>
      stock.model_hijab_id === product.id ||
      normalize(stock.nama_hijab) === normalize(product.nama) ||
      stock.id === product.id,
  );
  const byColor = warna
    ? candidates.filter(
        (stock) => normalize(stock.nama_warna ?? "") === normalize(warna),
      )
    : candidates;
  return byColor[0] ??
    (byColor.length === 0 && candidates.length === 1 ? candidates[0] : undefined);
}

function buildMasterDetails(
  model: ModelBaju,
  details: DetailKeluar[],
  variant?: VarianPenjualan,
  modelHijabList: ModelHijab[] = [],
): DetailKeluar[] {
  const hargaKomponen = (jenis: "harga_jual" | "harga_produksi") =>
    (variant?.komponen ?? [])
      .filter((component) => component.tipe === "aksesori" && component.kelola_stok !== false && component.jumlah > 0)
      .reduce((total, component) => {
        const modelHijab = modelHijabList.find((item) =>
          item.id === component.model_hijab_id || item.id === component.ref_id,
        );
        return total + (modelHijab?.[jenis] ?? 0) * component.jumlah;
      }, 0);
  return details.map((detail) => ({
    ...detail,
    harga_jual: hargaCustomVarianUntukUkuran(variant, "jual", detail.ukuran) ??
      (model.harga_jual_per_ukuran?.[detail.ukuran] ?? model.harga_jual ?? 0) + hargaKomponen("harga_jual"),
    harga_produksi: hargaCustomVarianUntukUkuran(variant, "produksi", detail.ukuran) ??
      (model.harga_produksi_per_ukuran?.[detail.ukuran] ?? model.harga_produksi ?? 0) + hargaKomponen("harga_produksi"),
  }));
}

function findVariantForLine(model: ModelBaju, line: string): VarianPenjualan | undefined {
  const normalizedLine = normalize(line);
  return getAddOnPenjualan(model)
    .sort((a, b) => normalize(b.nama_varian).length - normalize(a.nama_varian).length)
    .find((variant) => normalizedLine.includes(normalize(variant.nama_varian)));
}

export function parseBarangKeluarText(
  text: string,
  modelList: ModelBaju[],
  stokList: StokBarangJadi[],
  modelHijabList: ModelHijab[] = [],
  stokHijabList: StokHijab[] = [],
  kanalPenjualan: KanalPenjualan[] = [],
): ParseBarangKeluarResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const items: ParsedBarangKeluarItem[] = [];
  const unmatchedLines: string[] = [];
  let pendingProduct: ReturnType<typeof findBestProduct> = undefined;
  let pendingRaw = "";
  let batalPcs = 0;

  for (const line of lines) {
    const matchedOnLine = findBestProduct(
      line,
      modelList,
      modelHijabList,
      stokHijabList,
    );
    const detailKeluar = parseSizeQty(line);
    const fallbackQty = detailKeluar.reduce(
      (sum, detail) => sum + detail.jumlah_pcs,
      0,
    );
    const statusCounts = parsePcsColumns(line, fallbackQty);
    // Baris hasil PDF bisa kehilangan label ALL SIZE atau label ukuran.
    // Kolom Pcs tetap menjadi penanda bahwa baris ini adalah item barang.
    const looksLikeProductRow = detailKeluar.length > 0 || statusCounts.qty > 0;
    const product = matchedOnLine ?? pendingProduct;

    if (!product) {
      if (looksLikeProductRow) unmatchedLines.push(line);
      continue;
    }
    // Soft file sering memisahkan judul model dan baris jumlah. Simpan
    // keduanya, termasuk hijab yang belum memiliki dokumen stok.
    if (matchedOnLine && detailKeluar.length === 0 && statusCounts.qty === 0) {
      pendingProduct = matchedOnLine;
      pendingRaw = line;
      continue;
    }

    if (product.jenis_produk === "baju") {
      if (detailKeluar.length === 0) {
        if (looksLikeProductRow) unmatchedLines.push(line);
        continue;
      }
      const model = product.model as ModelBaju;
      const sourceModel = modelList.find((entry) => entry.id === (model.stok_model_id ?? model.id)) ?? model;
      const warna = findColor(line, colorsForBaju(model, stokList));
      const variant = findVariantForLine(model, line) ??
        (sourceModel.id !== model.id ? findVariantForLine(sourceModel, line) : undefined);
      const details = buildMasterDetails(sourceModel, detailKeluar, variant, modelHijabList);
      const komponenVarian = variant?.komponen.map((component) => {
        if (component.tipe !== "aksesori" || component.kelola_stok === false) return component;
        const stockId = resolveStokHijabIdUntukWarna(component, warna, stokHijabList);
        return stockId
          ? { ...component, ref_id: stockId, stok_hijab_id: stockId }
          : component;
      });
      items.push({
        jenis_produk: "baju",
        model_id: model.id,
        ...(model.stok_model_id ? { stok_model_id: model.stok_model_id } : {}),
        ...(variant?.id ? { varian_id: variant.id } : {}),
        ...(variant?.nama_varian ? { nama_varian: variant.nama_varian } : {}),
        ...(komponenVarian ? { komponen_varian: komponenVarian } : {}),
        nama_model: model.nama_model,
        ...(warna?.warna_id ? { warna_id: warna.warna_id } : {}),
        ...(warna?.nama_warna ? { nama_warna: warna.nama_warna } : {}),
        ...(warna?.kode_hex_warna ? { kode_hex_warna: warna.kode_hex_warna } : {}),
        ...(findTujuan(line, kanalPenjualan) ? { tujuan: findTujuan(line, kanalPenjualan) } : {}),
        detail_keluar: details,
        total_pcs: statusCounts.qty || fallbackQty,
        terpenuhi_pcs: statusCounts.terpenuhi,
        pending_pcs: statusCounts.pending,
        batal_pcs: statusCounts.batal,
        raw: pendingProduct && !matchedOnLine ? pendingRaw + " " + line : line,
      });
    } else {
      const model = product.model as ModelHijab | undefined;
      const fallbackModel: ModelHijab = {
        id: product.id,
        nama_hijab: product.nama,
        warna_tersedia: [],
        harga_jual: 0,
        harga_produksi: 0,
        aktif: true,
      };
      const warna = findColor(line, colorsForHijab(model ?? fallbackModel, stokHijabList));
      const stock = findHijabStock(product, warna?.nama_warna, stokHijabList);
      // Hijab memang biasanya ditulis ALL SIZE, tetapi hasil ekstraksi PDF
      // kadang membuang label tersebut. Selama model hijab sudah cocok dan
      // ada jumlah Pcs, tetap masukkan item agar stok kosong menjadi pending,
      // bukan dianggap sebagai baris import yang gagal.
      if (statusCounts.qty <= 0) {
        if (looksLikeProductRow) unmatchedLines.push(line);
        continue;
      }
      items.push({
        jenis_produk: "hijab",
        model_id: model?.id ?? product.id,
        ...(model?.id ? { model_hijab_id: model.id } : {}),
        ...(stock?.id ? { stok_hijab_id: stock.id } : {}),
        nama_model: model?.nama_hijab ?? product.nama,
        nama_hijab: model?.nama_hijab ?? product.nama,
        ...(warna?.warna_id ? { warna_id: warna.warna_id } : {}),
        ...(warna?.nama_warna ? { nama_warna: warna.nama_warna } : {}),
        ...(warna?.kode_hex_warna ? { kode_hex_warna: warna.kode_hex_warna } : {}),
        ...(model
          ? {
              harga_jual_per_pcs: model.harga_jual ?? 0,
              harga_produksi_per_pcs: model.harga_produksi ?? 0,
            }
          : {}),
        ...(findTujuan(line, kanalPenjualan) ? { tujuan: findTujuan(line, kanalPenjualan) } : {}),
        detail_keluar: [],
        total_pcs: statusCounts.qty,
        terpenuhi_pcs: statusCounts.terpenuhi,
        pending_pcs: statusCounts.pending,
        batal_pcs: statusCounts.batal,
        raw: pendingProduct && !matchedOnLine ? pendingRaw + " " + line : line,
      });
    }
    batalPcs += statusCounts.batal;
    pendingProduct = undefined;
    pendingRaw = "";
  }

  return {
    items,
    tujuan: findTujuan(text, kanalPenjualan),
    nama_reseller: findReseller(lines),
    batal_pcs: batalPcs,
    unmatched_lines: unmatchedLines,
  };
}

function itemMetadata(item: ParsedBarangKeluarItem) {
  return {
    jenis_produk: item.jenis_produk,
    model_id: item.model_id,
    ...(item.stok_model_id ? { stok_model_id: item.stok_model_id } : {}),
    ...(item.model_hijab_id ? { model_hijab_id: item.model_hijab_id } : {}),
    ...(item.stok_hijab_id ? { stok_hijab_id: item.stok_hijab_id } : {}),
    nama_model: item.nama_model,
    ...(item.nama_hijab ? { nama_hijab: item.nama_hijab } : {}),
    ...(item.varian_id ? { varian_id: item.varian_id } : {}),
    ...(item.nama_varian ? { nama_varian: item.nama_varian } : {}),
    ...(item.warna_id ? { warna_id: item.warna_id } : {}),
    ...(item.nama_warna ? { nama_warna: item.nama_warna } : {}),
    ...(item.kode_hex_warna ? { kode_hex_warna: item.kode_hex_warna } : {}),
    ...(item.harga_jual_per_pcs != null
      ? { harga_jual_per_pcs: item.harga_jual_per_pcs }
      : {}),
    ...(item.harga_produksi_per_pcs != null
      ? { harga_produksi_per_pcs: item.harga_produksi_per_pcs }
      : {}),
    ...(item.tujuan ? { tujuan_import: item.tujuan } : {}),
    ...(item.komponen_varian ? { komponen_varian: item.komponen_varian } : {}),
  };
}

function distributeStatusCounts(
  item: ParsedBarangKeluarItem,
  detail: DetailKeluar[],
) {
  let remainingFulfilled = Math.max(0, item.terpenuhi_pcs);
  let remainingPending = Math.max(0, item.pending_pcs);
  return detail.map((entry) => {
    const requested = entry.jumlah_pcs;
    const fulfilled = Math.min(requested, remainingFulfilled);
    remainingFulfilled -= fulfilled;
    const pending = Math.min(requested - fulfilled, remainingPending);
    remainingPending -= pending;
    return { entry, fulfilled, pending };
  });
}

export function splitImportItemsByStock(
  parsedItems: ParsedBarangKeluarItem[],
  stokList: StokBarangJadi[],
  stokHijabList: StokHijab[] = [],
): ImportBarangKeluarItem[] {
  const availableBaju = new Map<string, number>();
  for (const stok of stokList) {
    const key = stok.model_id + "|" + (stok.nama_warna ?? "") + "|" + stok.ukuran;
    availableBaju.set(
      key,
      (availableBaju.get(key) ?? 0) + (stok.stok_tersedia ?? 0),
    );
  }
  const availableHijab = new Map<string, number>(
    stokHijabList.map((stok) => [stok.id, stok.stok_tersedia ?? 0]),
  );
  const result: ImportBarangKeluarItem[] = [];

  for (const item of parsedItems) {
    if (item.jenis_produk === "hijab") {
      const wantedOut = Math.max(0, item.terpenuhi_pcs);
      const available = item.stok_hijab_id
        ? availableHijab.get(item.stok_hijab_id) ?? 0
        : 0;
      const keluar = Math.min(available, wantedOut);
      const pending = item.pending_pcs + (wantedOut - keluar);
      if (keluar > 0) {
        result.push({
          ...itemMetadata(item),
          detail_keluar: [],
          total_pcs: keluar,
          status: "keluar",
        } as ImportBarangKeluarItem);
        if (item.stok_hijab_id) {
          availableHijab.set(item.stok_hijab_id, available - keluar);
        }
      }
      if (pending > 0) {
        result.push({
          ...itemMetadata(item),
          detail_keluar: [],
          total_pcs: pending,
          status: "pending",
          alasan_pending: "Sebagian atau seluruh stok hijab belum tersedia saat import.",
        } as ImportBarangKeluarItem);
      }
      continue;
    }

    const keluarDetails: DetailKeluar[] = [];
    const pendingDetails: DetailKeluar[] = [];
    const stockModelId = item.stok_model_id ?? item.model_id;
    const managedHijab = (item.komponen_varian ?? [])
      .filter((component) => component.tipe === "aksesori" && component.kelola_stok !== false && component.jumlah > 0)
      .map((component) => ({
        component,
        stockId: resolveStokHijabIdUntukWarna(
          component,
          { warna_id: item.warna_id, nama_warna: item.nama_warna },
          stokHijabList,
        ),
      }));
    for (const { entry, fulfilled, pending: pendingFromFile } of distributeStatusCounts(item, item.detail_keluar)) {
      const key = stockModelId + "|" + (item.nama_warna ?? "") + "|" + entry.ukuran;
      const available = availableBaju.get(key) ?? 0;
      const kapasitasHijab = managedHijab.reduce((capacity, { component, stockId }) => {
        if (!stockId) return 0;
        return Math.min(
          capacity,
          Math.floor((availableHijab.get(stockId) ?? 0) / component.jumlah),
        );
      }, Number.POSITIVE_INFINITY);
      const keluar = Math.min(available, fulfilled, kapasitasHijab);
      const shortage = fulfilled - keluar;
      if (keluar > 0) {
        keluarDetails.push({ ...entry, jumlah_pcs: keluar });
        availableBaju.set(key, available - keluar);
        for (const { component, stockId } of managedHijab) {
          if (stockId) {
            availableHijab.set(
              stockId,
              (availableHijab.get(stockId) ?? 0) - keluar * component.jumlah,
            );
          }
        }
      }
      if (pendingFromFile + shortage > 0) {
        pendingDetails.push({
          ...entry,
          jumlah_pcs: pendingFromFile + shortage,
        });
      }
    }

    if (keluarDetails.length > 0) {
      result.push({
        ...itemMetadata(item),
        detail_keluar: keluarDetails,
        total_pcs: keluarDetails.reduce((sum, detail) => sum + detail.jumlah_pcs, 0),
        status: "keluar",
      } as ImportBarangKeluarItem);
    }
    if (pendingDetails.length > 0) {
      result.push({
        ...itemMetadata(item),
        detail_keluar: pendingDetails,
        total_pcs: pendingDetails.reduce((sum, detail) => sum + detail.jumlah_pcs, 0),
        status: "pending",
        alasan_pending: "Sebagian atau seluruh stok belum tersedia saat import.",
      } as ImportBarangKeluarItem);
    }
  }
  return result;
}
