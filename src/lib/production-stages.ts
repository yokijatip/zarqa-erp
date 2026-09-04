import type { BatchProduksi, StatusBatch } from "$lib/types";

export type ProductionStageKey = "cutting" | "jahit" | "steam";

export type ProductionStageConfig = {
  key: ProductionStageKey;
  title: string;
  description: string;
  createMode?: "cutting" | "jahit";
  createButtonLabel?: string;
  readyLabel: string;
  workingLabel: string;
  readyStatuses: StatusBatch[];
  activeStatuses: StatusBatch[];
  /** Filter tambahan di atas status filter, untuk membedakan tipe batch */
  extraFilter?: (batch: BatchProduksi) => boolean;
  /** Status yang dianggap "sudah selesai" — ditampilkan terpisah di stat card ketiga */
  doneStatuses?: StatusBatch[];
  /** Label stat card ketiga saat doneStatuses diisi (default: "PCS Aktif") */
  doneLabel?: string;
  detailHint: string;
  accentClass: string;
  accentSoftClass: string;
  borderClass: string;
  textClass: string;
  stockTitle?: string;
  stockDescription?: string;
  /** Klik baris membuka quick-action popup alih-alih navigasi ke detail */
  quickAction?: boolean;
  /** Role karyawan yang muncul di dropdown penugasan quick-action */
  quickActionWorkerRole?: string;
};

export const PRODUCTION_STAGE_CONFIG: Record<ProductionStageKey, ProductionStageConfig> = {
  cutting: {
    key: "cutting",
    title: "Produksi Cutting",
    description: "Kelola antrean cutting dan pantau hasil potongan yang sudah selesai.",
    createMode: "cutting",
    createButtonLabel: "Buat Order Cutting",
    readyLabel: "Menunggu Kain",
    workingLabel: "Siap / Sedang Cutting",
    readyStatuses: ["PENDING_KAIN"],
    activeStatuses: ["PENDING_KAIN", "PENDING_CUTTING", "CUTTING_IN_PROGRESS", "CUTTING_DONE"],
    // Hanya tampilkan CUTTING_DONE dari batch cutting original (bukan batch Jahit
    // yang dibuat dari stok potongan). Berlaku untuk baju dan hijab.
    extraFilter: (batch) =>
      batch.status !== "CUTTING_DONE" || !batch.dari_potongan,
    doneStatuses: ["CUTTING_DONE"],
    doneLabel: "Hasil Cutting",
    detailHint: "Buka detail batch untuk mulai cutting dan input hasil potongan.",
    accentClass: "bg-orange-500",
    accentSoftClass: "bg-orange-50",
    borderClass: "border-orange-200",
    textClass: "text-orange-700",
  },
  jahit: {
    key: "jahit",
    title: "Produksi Jahit",
    description: "Fokus ke batch yang sudah selesai cutting dan siap diteruskan ke proses jahit.",
    createMode: "jahit",
    createButtonLabel: "Buat Order Jahit",
    readyLabel: "Siap Jahit",
    workingLabel: "Sedang Jahit",
    readyStatuses: ["CUTTING_DONE"],
    activeStatuses: ["CUTTING_DONE", "JAHIT_IN_PROGRESS"],
    // Hanya tampilkan batch yang dibuat dari stok potongan (dari_potongan=true),
    // bukan batch cutting original yang kebetulan status-nya CUTTING_DONE.
    // Hijab mengikuti aturan yang sama, hanya tanpa detail ukuran.
    extraFilter: (batch) =>
      batch.status !== "CUTTING_DONE" || !!batch.dari_potongan,
    detailHint: "Pilih batch atau cek stok cutting yang tersedia sebelum proses jahit dimulai.",
    accentClass: "bg-blue-500",
    accentSoftClass: "bg-blue-50",
    borderClass: "border-blue-200",
    textClass: "text-blue-700",
    stockTitle: "Stok Cutting Tersedia",
    stockDescription: "Stok potongan kain yang sudah siap dipakai untuk proses jahit.",
  },
  steam: {
    key: "steam",
    title: "Produksi Steam",
    description: "Pantau batch yang selesai dijahit dan lanjutkan ke tahap finishing steam.",
    readyLabel: "Siap Steam",
    workingLabel: "Sedang Steam",
    readyStatuses: ["JAHIT_DONE"],
    activeStatuses: ["JAHIT_DONE", "STEAM_IN_PROGRESS", "STEAM_DONE"],
    detailHint: "Klik baris batch untuk mulai atau selesaikan proses steam langsung dari halaman ini.",
    accentClass: "bg-emerald-500",
    accentSoftClass: "bg-emerald-50",
    borderClass: "border-emerald-200",
    textClass: "text-emerald-700",
    quickAction: true,
    quickActionWorkerRole: "kepala_steam",
  },
};

export const STATUS_STYLE: Record<StatusBatch, string> = {
  PENDING_KAIN: "bg-cyan-100 text-cyan-700",
  PENDING_CUTTING: "bg-slate-100 text-slate-700",
  CUTTING_IN_PROGRESS: "bg-orange-100 text-orange-700",
  CUTTING_DONE: "bg-yellow-100 text-yellow-700",
  JAHIT_IN_PROGRESS: "bg-blue-100 text-blue-700",
  JAHIT_DONE: "bg-teal-100 text-teal-700",
  STEAM_IN_PROGRESS: "bg-purple-100 text-purple-700",
  STEAM_DONE: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-green-100 text-green-700",
};

export function filterBatchesByStage(
  batchList: BatchProduksi[],
  config: ProductionStageConfig,
): BatchProduksi[] {
  return batchList.filter(
    (batch) =>
      config.activeStatuses.includes(batch.status) &&
      (!config.extraFilter || config.extraFilter(batch)),
  );
}
