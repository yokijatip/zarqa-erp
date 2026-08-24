import {
  UKURAN_ORDER,
  TUJUAN_PENGIRIMAN_OPTIONS,
  type BarangKeluarItem,
  type DetailKeluar,
  type ModelBaju,
  type StokBarangJadi,
  type UkuranBaju,
} from "$lib/types";

export type ParsedBarangKeluarItem = {
  model_id: string;
  nama_model: string;
  nama_warna?: string;
  kode_hex_warna?: string;
  tujuan?: string;
  detail_keluar: DetailKeluar[];
  total_pcs: number;
  raw: string;
};

export type ImportBarangKeluarItem = BarangKeluarItem & {
  tujuan_import?: string;
};

export type ParseBarangKeluarResult = {
  items: ParsedBarangKeluarItem[];
  tujuan?: string;
  nama_reseller?: string;
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

function findTujuan(text: string): string | undefined {
  const normalizedText = normalize(text);
  return TUJUAN_PENGIRIMAN_OPTIONS.find((tujuan) =>
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

function knownColors(model: ModelBaju, stokList: StokBarangJadi[]) {
  const map = new Map<string, { nama_warna: string; kode_hex_warna?: string }>();
  for (const warna of model.warna_tersedia ?? []) {
    map.set(normalize(warna.nama_warna), {
      nama_warna: warna.nama_warna,
      kode_hex_warna: warna.kode_hex,
    });
  }
  for (const stok of stokList.filter((item) => item.model_id === model.id && item.nama_warna)) {
    const nama = stok.nama_warna ?? "";
    map.set(normalize(nama), {
      nama_warna: nama,
      kode_hex_warna: stok.kode_hex_warna,
    });
  }
  return [...map.values()];
}

function parseSizeQty(line: string): DetailKeluar[] {
  const result = new Map<UkuranBaju, number>();
  for (const ukuran of [...UKURAN_ORDER].sort((a, b) => b.length - a.length)) {
    const patterns = [
      new RegExp(`(?:^|\\b)${ukuran}\\s*(?:x|X|×|:|=|-)?\\s*(\\d+)\\b`, "i"),
      new RegExp(`\\b(\\d+)\\s*(?:pcs|pc|buah)?\\s*${ukuran}(?:\\b|$)`, "i"),
    ];
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (!match) continue;
      const qty = Number(match[1]);
      if (Number.isFinite(qty) && qty > 0) result.set(ukuran, qty);
      break;
    }
  }
  return UKURAN_ORDER
    .filter((ukuran) => (result.get(ukuran) ?? 0) > 0)
    .map((ukuran) => ({ ukuran, jumlah_pcs: result.get(ukuran) ?? 0 }));
}

export function parseBarangKeluarText(
  text: string,
  modelList: ModelBaju[],
  stokList: StokBarangJadi[],
): ParseBarangKeluarResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const items: ParsedBarangKeluarItem[] = [];
  const activeModels = modelList.filter((model) => model.aktif !== false);
  let pendingModel: ModelBaju | null = null;
  let pendingRaw = "";

  for (const line of lines) {
    const normalizedLine = normalize(line);
    const matchedModel = activeModels.find((entry) =>
      normalizedLine.includes(normalize(entry.nama_model)),
    );
    const detail_keluar = parseSizeQty(line);
    if (matchedModel && detail_keluar.length === 0) {
      pendingModel = matchedModel;
      pendingRaw = line;
      continue;
    }

    const model = matchedModel ?? (detail_keluar.length > 0 ? pendingModel : null);
    if (!model || detail_keluar.length === 0) continue;

    const colors = knownColors(model, stokList);
    const warna =
      colors.find((entry) => normalizedLine.includes(normalize(entry.nama_warna))) ??
      (colors.length === 1 ? colors[0] : undefined);

    const total_pcs = detail_keluar.reduce((sum, item) => sum + item.jumlah_pcs, 0);
    items.push({
      model_id: model.id,
      nama_model: model.nama_model,
      ...(warna?.nama_warna ? { nama_warna: warna.nama_warna } : {}),
      ...(warna?.kode_hex_warna ? { kode_hex_warna: warna.kode_hex_warna } : {}),
      ...(findTujuan(line) ? { tujuan: findTujuan(line) } : {}),
      detail_keluar,
      total_pcs,
      raw: pendingModel && !matchedModel ? `${pendingRaw} ${line}` : line,
    });
    pendingModel = null;
    pendingRaw = "";
  }

  return {
    items,
    tujuan: findTujuan(text),
    nama_reseller: findReseller(lines),
  };
}

export function splitImportItemsByStock(
  parsedItems: ParsedBarangKeluarItem[],
  stokList: StokBarangJadi[],
): ImportBarangKeluarItem[] {
  const available = new Map<string, number>();
  for (const stok of stokList) {
    available.set(
      `${stok.model_id}|${stok.nama_warna ?? ""}|${stok.ukuran}`,
      stok.stok_tersedia ?? 0,
    );
  }

  const result: ImportBarangKeluarItem[] = [];
  for (const item of parsedItems) {
    const keluarDetails: DetailKeluar[] = [];
    const pendingDetails: DetailKeluar[] = [];
    for (const detail of item.detail_keluar) {
      const key = `${item.model_id}|${item.nama_warna ?? ""}|${detail.ukuran}`;
      const stokTersedia = available.get(key) ?? 0;
      const keluar = Math.min(stokTersedia, detail.jumlah_pcs);
      const pending = detail.jumlah_pcs - keluar;
      if (keluar > 0) {
        keluarDetails.push({ ukuran: detail.ukuran, jumlah_pcs: keluar });
        available.set(key, stokTersedia - keluar);
      }
      if (pending > 0) pendingDetails.push({ ukuran: detail.ukuran, jumlah_pcs: pending });
    }

    if (keluarDetails.length > 0) {
      const total_pcs = keluarDetails.reduce((sum, detail) => sum + detail.jumlah_pcs, 0);
      result.push({
        model_id: item.model_id,
        nama_model: item.nama_model,
        ...(item.nama_warna ? { nama_warna: item.nama_warna } : {}),
        ...(item.kode_hex_warna ? { kode_hex_warna: item.kode_hex_warna } : {}),
        ...(item.tujuan ? { tujuan_import: item.tujuan } : {}),
        detail_keluar: keluarDetails,
        total_pcs,
        status: "keluar",
      });
    }

    if (pendingDetails.length > 0) {
      const total_pcs = pendingDetails.reduce((sum, detail) => sum + detail.jumlah_pcs, 0);
      result.push({
        model_id: item.model_id,
        nama_model: item.nama_model,
        ...(item.nama_warna ? { nama_warna: item.nama_warna } : {}),
        ...(item.kode_hex_warna ? { kode_hex_warna: item.kode_hex_warna } : {}),
        ...(item.tujuan ? { tujuan_import: item.tujuan } : {}),
        detail_keluar: pendingDetails,
        total_pcs,
        status: "pending",
        alasan_pending: "Stok tidak cukup saat import list barang keluar.",
      });
    }
  }
  return result;
}
