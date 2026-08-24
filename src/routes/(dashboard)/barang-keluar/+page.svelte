<script lang="ts">
  import { onMount } from "svelte";
  import {
    catatBarangKeluar,
    getRiwayatBarangKeluarByPeriod,
    batalBarangKeluar,
    prosesPendingBarangKeluar,
  } from "$lib/firebase/barang-jadi";
  import { barangJadiCache, modelBajuCache } from "$lib/stores/data-cache.svelte";
  import { currentUser, userRole } from "$lib/stores/auth.store";
  import {
    UKURAN_ORDER,
    TUJUAN_PENGIRIMAN_OPTIONS,
    type StokBarangJadi,
    type ModelBaju,
    type BarangKeluar,
    type BarangKeluarItem,
    type UkuranBaju,
  } from "$lib/types";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Table from "$lib/components/ui/table";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Badge } from "$lib/components/ui/badge";
  import StatCard from "$lib/components/StatCard.svelte";
  import TruckIcon from "@lucide/svelte/icons/truck";
  import PackageCheckIcon from "@lucide/svelte/icons/package-check";
  import BoxesIcon from "@lucide/svelte/icons/boxes";
  import ShirtIcon from "@lucide/svelte/icons/shirt";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import XIcon from "@lucide/svelte/icons/x";
  import { type DateRange, getPeriodRange } from "$lib/period";
  import PeriodSelector from "$lib/components/period-selector.svelte";
  import BarangKeluarDetailDialog from "$lib/components/barang-keluar-detail-dialog.svelte";

  // ── State ──────────────────────────────────────────────────────────
  let stokList = $state<StokBarangJadi[]>([]);
  let modelList = $state<ModelBaju[]>([]);
  let riwayat = $state<BarangKeluar[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let exportingPdf = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);
  let searchQuery = $state("");
  let dateRange = $state<DateRange>(getPeriodRange("bulan_ini"));
  let openCatat = $state(false);

  // Cancel dialog
  let batalTarget = $state<BarangKeluar | null>(null);
  let detailDialogOpen = $state(false);
  let detailTarget = $state<BarangKeluar | null>(null);

  function bukaDetail(r: BarangKeluar) {
    detailTarget = r;
    detailDialogOpen = true;
  }

  async function submitProsesPending(itemIndex: number) {
    if (!detailTarget || !$currentUser) return;
    const result = await prosesPendingBarangKeluar(detailTarget.id, itemIndex, {
      uid: $currentUser.uid,
      nama: $currentUser.name || $currentUser.email || $currentUser.uid,
    });
    barangJadiCache.invalidate();
    await load(true);
    detailTarget = riwayat.find((item) => item.id === detailTarget?.id) ?? detailTarget;
    showSuccess(
      result.remainingPendingPcs > 0
        ? `${result.processedPcs} pcs pending berhasil diproses. Sisa pending ${result.remainingPendingPcs} pcs.`
        : `${result.processedPcs} pcs pending berhasil diproses. List sudah selesai.`,
    );
  }
  let batalOpen = $state(false);
  let batalSaving = $state(false);
  let batalError = $state<string | null>(null);

  function bukaBatal(r: BarangKeluar) {
    batalTarget = r;
    batalError = null;
    batalOpen = true;
  }

  async function submitBatal() {
    if (!batalTarget || !$currentUser) return;
    batalSaving = true;
    batalError = null;
    try {
      await batalBarangKeluar(batalTarget.id, {
        uid: $currentUser.uid,
        nama: $currentUser.name || $currentUser.email || $currentUser.uid,
      });
      barangJadiCache.invalidate();
      await load(true);
      batalOpen = false;
      showSuccess(
        `Pengiriman ${batalTarget.total_pcs} pcs "${batalTarget.nama_model}" ke ${batalTarget.tujuan} berhasil dibatalkan.`,
      );
    } catch (e: any) {
      batalError = e?.message ?? "Gagal membatalkan pengiriman.";
    } finally {
      batalSaving = false;
    }
  }

  // Form
  let fModelKey = $state("");
  let fWarnaKeys = $state<string[]>([]);
  let fTujuan = $state("");
  let fNamaReseller = $state("");
  let fKeterangan = $state("");
  let fJumlahByWarna = $state<Record<string, Partial<Record<UkuranBaju, number>>>>({});
  let fPending = $state(false);
  let fAlasanPending = $state("");
  let draftItems = $state<BarangKeluarItem[]>([]);

  // ── Derived ────────────────────────────────────────────────────────
  let canCatat = $derived(
    $userRole === "admin_gudang" ||
      $userRole === "admin_hr" ||
      $userRole === "admin_keuangan" ||
      $userRole === "owner" ||
      $userRole === "developer",
  );

  let modelDenganStok = $derived.by(() => {
    const map = new Map<
      string,
      {
        key: string;
        model_id: string;
        nama_model: string;
        nama_warna?: string;
        kode_hex_warna?: string;
        ukuran_tersedia: UkuranBaju[];
        warna_tersedia: ModelBaju["warna_tersedia"];
        stok: StokBarangJadi[];
      }
    >();
    for (const model of modelList.filter((m) => m.aktif)) {
      map.set(model.id, {
        key: model.id,
        model_id: model.id,
        nama_model: model.nama_model,
        ukuran_tersedia: model.ukuran_tersedia,
        warna_tersedia: model.warna_tersedia,
        stok: [],
      });
    }
    for (const item of stokList) {
      const entry = map.get(item.model_id);
      if (entry) entry.stok.push(item);
    }
    return [...map.values()].sort((a, b) =>
      a.nama_model.localeCompare(b.nama_model),
    );
  });

  let selectedModelData = $derived(
    modelDenganStok.find((m) => m.key === fModelKey) ?? null,
  );
  let selectedUkuranList = $derived(
    selectedModelData?.ukuran_tersedia?.length
      ? selectedModelData.ukuran_tersedia
      : UKURAN_ORDER,
  );

  function warnaKey(item: Pick<StokBarangJadi, "nama_warna">): string {
    return item.nama_warna?.trim() || "__tanpa_warna__";
  }

  let warnaTersedia = $derived.by(() => {
    if (!selectedModelData) return [];
    const map = new Map<
      string,
      {
        key: string;
        nama_warna?: string;
        kode_hex_warna?: string;
        stok: StokBarangJadi[];
        total_stok: number;
      }
    >();
    for (const warna of selectedModelData.warna_tersedia ?? []) {
      map.set(warna.nama_warna.trim() || "__tanpa_warna__", {
        key: warna.nama_warna.trim() || "__tanpa_warna__",
        nama_warna: warna.nama_warna,
        kode_hex_warna: warna.kode_hex,
        stok: [],
        total_stok: 0,
      });
    }
    if (map.size === 0) {
      map.set("__tanpa_warna__", {
        key: "__tanpa_warna__",
        stok: [],
        total_stok: 0,
      });
    }
    for (const item of selectedModelData.stok) {
      const key = warnaKey(item);
      if (!map.has(key)) {
        map.set(key, {
          key,
          nama_warna: item.nama_warna,
          kode_hex_warna: item.kode_hex_warna,
          stok: [],
          total_stok: 0,
        });
      }
      const warna = map.get(key)!;
      warna.stok.push(item);
      warna.total_stok += item.stok_tersedia;
    }
    return [...map.values()].sort((a, b) =>
      (a.nama_warna ?? "Tanpa warna").localeCompare(
        b.nama_warna ?? "Tanpa warna",
      ),
    );
  });

  let selectedWarnaList = $derived(
    warnaTersedia.filter((w) => fWarnaKeys.includes(w.key)),
  );

  let detailKeluarByWarna = $derived.by(() => {
    const map = new Map<string, { warna: (typeof warnaTersedia)[number]; detail: { ukuran: UkuranBaju; jumlah_pcs: number }[]; total: number }>();
    for (const warna of selectedWarnaList) {
      const jumlahWarna = fJumlahByWarna[warna.key] ?? {};
      const ukuranList =
        selectedModelData?.ukuran_tersedia?.length
          ? selectedModelData.ukuran_tersedia
          : UKURAN_ORDER;
      const detail = ukuranList
        .filter((u) => (jumlahWarna[u] ?? 0) > 0)
        .map((u) => ({ ukuran: u, jumlah_pcs: jumlahWarna[u]! }));
      const total = detail.reduce((sum, d) => sum + d.jumlah_pcs, 0);
      map.set(warna.key, { warna, detail, total });
    }
    return map;
  });

  let totalPcs = $derived(
    [...detailKeluarByWarna.values()].reduce((s, item) => s + item.total, 0),
  );
  let totalDraftKeluarPcs = $derived(
    draftItems
      .filter((item) => item.status !== "pending")
      .reduce((s, item) => s + item.total_pcs, 0),
  );
  let totalDraftPendingPcs = $derived(
    draftItems
      .filter((item) => item.status === "pending")
      .reduce((s, item) => s + item.total_pcs, 0),
  );
  let totalDraftPcs = $derived(totalDraftKeluarPcs + totalDraftPendingPcs);
  let canSubmit = $derived(
    fTujuan.trim() !== "" &&
      draftItems.length > 0 &&
      draftItems.some((item) => item.total_pcs > 0),
  );

  // riwayat sudah difilter dari Firestore sesuai periode — tidak perlu filter ulang
  let riwayatPeriod = $derived(riwayat);

  // Stats (totalPengiriman & totalPcsKeluar ikut periode; stok & model = current state)
  let totalPengiriman = $derived(riwayatPeriod.length);
  let totalPcsKeluar = $derived(
    riwayatPeriod.reduce((s, r) => s + r.total_pcs, 0),
  );
  let totalStokTersedia = $derived(
    stokList.reduce((s, i) => s + i.stok_tersedia, 0),
  );
  let totalModelTersedia = $derived(modelDenganStok.length);

  // Rekap barang keluar per tujuan pengiriman untuk periode yang aktif
  // (ikut PeriodSelector yang sama dengan tabel riwayat di bawah:
  // hari ini / minggu ini / bulan ini / custom "dari — sampai").
  // Selalu memuat semua tujuan baku (walau 0) supaya rekapnya konstan
  // antar periode; sisa nilai tujuan lama yang bebas teks dikumpulkan
  // di baris "Lainnya".
  type RekapTujuan = {
    tujuan: string;
    jumlahPengiriman: number;
    totalPcs: number;
  };
  let rekapPerTujuan = $derived.by(() => {
    const map = new Map<string, RekapTujuan>();
    for (const t of TUJUAN_PENGIRIMAN_OPTIONS) {
      map.set(t, { tujuan: t, jumlahPengiriman: 0, totalPcs: 0 });
    }
    for (const r of riwayatPeriod) {
      const key = (TUJUAN_PENGIRIMAN_OPTIONS as readonly string[]).includes(
        r.tujuan,
      )
        ? r.tujuan
        : "Lainnya";
      if (!map.has(key))
        map.set(key, { tujuan: key, jumlahPengiriman: 0, totalPcs: 0 });
      const item = map.get(key)!;
      item.jumlahPengiriman += 1;
      item.totalPcs += r.total_pcs;
    }
    return [...map.values()].sort((a, b) => b.totalPcs - a.totalPcs);
  });

  let rekapMaxPcs = $derived(
    Math.max(1, ...rekapPerTujuan.map((r) => r.totalPcs)),
  );

  async function exportRekapPdf() {
    exportingPdf = true;
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const marginX = 14;

      // ── Header ────────────────────────────────────────────────
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(20, 20, 20);
      doc.text("Zarqa — Rekap Pengiriman Barang Keluar", marginX, 18);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 90);
      doc.text("Moeslim Fashion", marginX, 24);
      doc.text(`Periode: ${rekapPeriodLabel}`, marginX, 30);
      doc.text(
        `Dicetak: ${new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`,
        pageWidth - marginX,
        30,
        { align: "right" },
      );

      doc.setDrawColor(230, 230, 230);
      doc.line(marginX, 34, pageWidth - marginX, 34);

      // ── Ringkasan singkat ────────────────────────────────────
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      const totalPendingPdf = riwayatPeriod.reduce(
        (s, r) => s + (r.total_pending_pcs ?? 0),
        0,
      );
      const totalNilaiJualPdf = riwayatPeriod.reduce(
        (sum, r) =>
          sum +
          listItems(r)
            .filter((item) => item.status !== "pending")
            .reduce((s, item) => s + item.total_pcs * hargaModel(item.model_id).jual, 0),
        0,
      );
      const totalNilaiProduksiPdf = riwayatPeriod.reduce(
        (sum, r) =>
          sum +
          listItems(r)
            .filter((item) => item.status !== "pending")
            .reduce((s, item) => s + item.total_pcs * hargaModel(item.model_id).produksi, 0),
        0,
      );
      doc.text(`Total Pengiriman: ${totalPengiriman}`, marginX, 41);
      doc.text(`Total Pcs Keluar: ${totalPcsKeluar}`, marginX + 70, 41);
      if (totalPendingPdf > 0) {
        doc.text(`Total Pcs Pending: ${totalPendingPdf}`, marginX + 135, 41);
      }
      doc.text(`Total Jual: ${formatRupiah(totalNilaiJualPdf)}`, marginX, 46);
      doc.text(`Total Produksi: ${formatRupiah(totalNilaiProduksiPdf)}`, marginX + 70, 46);
      doc.text(`Laba Kotor: ${formatRupiah(totalNilaiJualPdf - totalNilaiProduksiPdf)}`, marginX + 135, 46);

      // ── Tabel rekap per tujuan ───────────────────────────────
      const totalPcsSemua = rekapPerTujuan.reduce((s, r) => s + r.totalPcs, 0);
      const body = rekapPerTujuan.map((r) => [
        r.tujuan,
        String(r.jumlahPengiriman),
        String(r.totalPcs),
        totalPcsSemua > 0
          ? `${((r.totalPcs / totalPcsSemua) * 100).toFixed(1)}%`
          : "0%",
      ]);

      autoTable(doc, {
          startY: 52,
        head: [
          [
            "Tujuan Pengiriman",
            "Jumlah Pengiriman",
            "Total Pcs",
            "% dari Total",
          ],
        ],
        body,
        foot: [
          [
            "Total",
            String(rekapPerTujuan.reduce((s, r) => s + r.jumlahPengiriman, 0)),
            String(totalPcsSemua),
            "100%",
          ],
        ],
        theme: "grid",
        margin: { left: marginX, right: marginX },
        styles: {
          font: "helvetica",
          fontSize: 9,
          cellPadding: 3,
          lineColor: [230, 230, 230],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [17, 24, 39],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "left",
        },
        footStyles: {
          fillColor: [243, 244, 246],
          textColor: [17, 24, 39],
          fontStyle: "bold",
        },
        columnStyles: {
          0: { halign: "left" },
          1: { halign: "center" },
          2: { halign: "center" },
          3: { halign: "center" },
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
      });

      // ── Detail riwayat pengiriman (jika ada) ─────────────────
      if (riwayatPeriod.length > 0) {
        const finalY = (doc as any).lastAutoTable.finalY ?? 47;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(20, 20, 20);
        doc.text("Detail Riwayat Pengiriman", marginX, finalY + 10);

        const detailBody = [...riwayatPeriod]
          .sort(
            (a, b) => tsMillis(b.tanggal_keluar) - tsMillis(a.tanggal_keluar),
          )
          .flatMap((r) => listItems(r).map((item) => {
            const harga = hargaModel(item.model_id);
            const totalJual = item.status === "pending" ? 0 : item.total_pcs * harga.jual;
            const totalProduksi = item.status === "pending" ? 0 : item.total_pcs * harga.produksi;
            return [
               formatDate(r.tanggal_keluar),
               r.tujuan,
               r.nama_reseller ?? "-",
               item.nama_model,
               item.nama_warna ?? "-",
               itemSummary(item),
              item.status === "pending" ? "Pending" : "Keluar",
              String(item.total_pcs),
              harga.jual > 0 ? formatRupiah(harga.jual) : "-",
              harga.produksi > 0 ? formatRupiah(harga.produksi) : "-",
              formatRupiah(totalJual),
              formatRupiah(totalProduksi),
              formatRupiah(totalJual - totalProduksi),
            ];
          }));

        autoTable(doc, {
          startY: finalY + 14,
          head: [["Tanggal", "Tujuan", "Reseller", "Model", "Warna", "Ukuran", "Status", "Pcs", "Harga Jual", "Harga Produksi", "Total Jual", "Total Produksi", "Laba Kotor"]],
          body: detailBody,
          theme: "grid",
          margin: { left: marginX, right: marginX },
          styles: {
            font: "helvetica",
            fontSize: 7,
            cellPadding: 2.5,
            lineColor: [230, 230, 230],
            lineWidth: 0.1,
          },
          headStyles: {
            fillColor: [17, 24, 39],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            halign: "left",
          },
          columnStyles: {
            6: { halign: "center" },
            7: { halign: "center" },
            8: { halign: "right" },
            9: { halign: "right" },
            10: { halign: "right" },
            11: { halign: "right" },
            12: { halign: "right" },
          },
          alternateRowStyles: { fillColor: [250, 250, 250] },
        });
      }

      // ── Footer halaman ───────────────────────────────────────
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const h = doc.internal.pageSize.getHeight();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Halaman ${i} dari ${pageCount} — Zarqa ERP`,
          pageWidth / 2,
          h - 8,
          { align: "center" },
        );
      }

      const tanggal = new Date().toISOString().slice(0, 10);
      doc.save(`rekap-barang-keluar-${tanggal}.pdf`);
    } catch (e) {
      console.error("Gagal membuat PDF rekap:", e);
      showError("Gagal membuat PDF rekap.");
    } finally {
      exportingPdf = false;
    }
  }

  let filteredRiwayat = $derived.by(() => {
    if (!searchQuery.trim()) return riwayatPeriod;
    const q = searchQuery.toLowerCase().trim();
    return riwayatPeriod.filter(
      (r) =>
        r.nama_model.toLowerCase().includes(q) ||
        listItems(r).some(
          (item) =>
            item.nama_model.toLowerCase().includes(q) ||
            (item.nama_warna ?? "").toLowerCase().includes(q),
        ) ||
        (r.nama_reseller ?? "").toLowerCase().includes(q) ||
        r.tujuan.toLowerCase().includes(q),
    );
  });

  function jumlahWarna(warnaKey: string, ukuran: UkuranBaju): number {
    return fJumlahByWarna[warnaKey]?.[ukuran] ?? 0;
  }

  function setJumlahWarna(warnaKey: string, ukuran: UkuranBaju, value: number) {
    fJumlahByWarna = {
      ...fJumlahByWarna,
      [warnaKey]: {
        ...(fJumlahByWarna[warnaKey] ?? {}),
        [ukuran]: Number.isFinite(value) && value > 0 ? value : 0,
      },
    };
  }

  function maxUkuran(warnaKey: string, ukuran: UkuranBaju): number {
    const warna = warnaTersedia.find((w) => w.key === warnaKey);
    if (!warna) return 0;
    return (
      warna.stok.find((i) => i.ukuran === ukuran)?.stok_tersedia ??
      0
    );
  }

  function melebihiStok(warnaKey: string, ukuran: UkuranBaju): boolean {
    return jumlahWarna(warnaKey, ukuran) > maxUkuran(warnaKey, ukuran);
  }

  let adaYangMelebihi = $derived.by(() =>
    selectedWarnaList.some((warna) =>
      UKURAN_ORDER.some((u) => melebihiStok(warna.key, u)),
    ),
  );
  let canAddItem = $derived(
    fModelKey !== "" &&
      fWarnaKeys.length > 0 &&
      totalPcs > 0 &&
      (fPending || !adaYangMelebihi),
  );

  function toggleWarna(key: string, checked: boolean) {
    fWarnaKeys = checked
      ? [...new Set([...fWarnaKeys, key])]
      : fWarnaKeys.filter((k) => k !== key);
  }

  function itemSummary(item: BarangKeluarItem): string {
    return item.detail_keluar
      .map((d) => `${d.ukuran}: ${d.jumlah_pcs}`)
      .join(", ");
  }

  function hargaModel(modelId: string) {
    const model = modelList.find((item) => item.id === modelId);
    return {
      jual: model?.harga_jual ?? 0,
      produksi: model?.harga_produksi ?? 0,
    };
  }

  function formatRupiah(value: number): string {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(value);
  }

  function listItems(r: BarangKeluar): BarangKeluarItem[] {
    return r.items && r.items.length > 0
      ? r.items
      : [
          {
            model_id: r.model_id,
            nama_model: r.nama_model,
            ...(r.nama_warna ? { nama_warna: r.nama_warna } : {}),
            ...(r.kode_hex_warna ? { kode_hex_warna: r.kode_hex_warna } : {}),
            detail_keluar: r.detail_keluar,
            total_pcs: r.total_pcs,
            status: "keluar",
          },
        ];
  }

  function listTitle(r: BarangKeluar): string {
    const items = listItems(r);
    if (items.length <= 1) return items[0]?.nama_model ?? r.nama_model;
    return `${items.length} barang`;
  }

  // ── Helpers ────────────────────────────────────────────────────────
  function formatDate(ts: any): string {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatDateTime(ts: any): string {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  let rekapPeriodLabel = $derived.by(() => {
    if (!dateRange) return "Semua Data";
    return `${formatDate(dateRange.start)} – ${formatDate(dateRange.end)}`;
  });

  function tsMillis(ts: any): number {
    return ts?.toMillis ? ts.toMillis() : ts ? new Date(ts).getTime() : 0;
  }

  function showSuccess(msg: string) {
    successMsg = msg;
    setTimeout(() => (successMsg = null), 3500);
  }

  function showError(msg: string) {
    errorMsg = msg;
    setTimeout(() => (errorMsg = null), 4000);
  }

  // ── Data ──────────────────────────────────────────────────────────
  async function load(force = false) {
    loading = true;
    errorMsg = null;
    try {
      [stokList, modelList, riwayat] = await Promise.all([
        barangJadiCache.get(force),
        modelBajuCache.get(force),
        getRiwayatBarangKeluarByPeriod(dateRange),
      ]);
    } catch {
      showError("Gagal memuat data. Periksa koneksi Firebase.");
    } finally {
      loading = false;
    }
  }

  // Re-fetch riwayat saat periode berubah
  $effect(() => {
    const range = dateRange;
    getRiwayatBarangKeluarByPeriod(range).then((data) => {
      riwayat = data;
    });
  });

  // ── Actions ──────────────────────────────────────────────────────
  function bukaCatat() {
    fModelKey = "";
    fWarnaKeys = [];
    fTujuan = "";
    fNamaReseller = "";
    fKeterangan = "";
    fJumlahByWarna = {};
    fPending = false;
    fAlasanPending = "";
    draftItems = [];
    openCatat = true;
  }

  function resetLineForm() {
    fModelKey = "";
    fWarnaKeys = [];
    fJumlahByWarna = {};
    fPending = false;
    fAlasanPending = "";
  }

  function tambahDraftItem() {
    if (!canAddItem || !selectedModelData) return;
    const items: BarangKeluarItem[] = [...detailKeluarByWarna.values()]
      .filter((entry) => entry.total > 0)
      .map(({ warna, detail, total }) => ({
        model_id: selectedModelData.model_id,
        nama_model: selectedModelData.nama_model,
        ...(warna.nama_warna ? { nama_warna: warna.nama_warna } : {}),
        ...(warna.kode_hex_warna ? { kode_hex_warna: warna.kode_hex_warna } : {}),
        detail_keluar: detail,
        total_pcs: total,
        status: fPending ? "pending" : "keluar",
        ...(fPending && fAlasanPending.trim()
          ? { alasan_pending: fAlasanPending.trim() }
          : {}),
      }));
    draftItems = [...draftItems, ...items];
    resetLineForm();
  }

  function hapusDraftItem(index: number) {
    draftItems = draftItems.filter((_, i) => i !== index);
  }

  async function submitCatat() {
    if (!canSubmit || !$currentUser) return;
    saving = true;
    try {
      const keteranganTrimmed = fKeterangan.trim();
      const namaResellerTrimmed = fNamaReseller.trim();
      const tujuanDikirim = fTujuan.trim();
      const itemPertama = draftItems[0];
      const totalPcsDikirim = totalDraftKeluarPcs;
      const totalPending = totalDraftPendingPcs;

      await catatBarangKeluar(
        {
          model_id: itemPertama.model_id,
          nama_model:
            draftItems.length > 1
              ? `${draftItems.length} barang`
              : itemPertama.nama_model,
          ...(draftItems.length === 1 && itemPertama.nama_warna
            ? { nama_warna: itemPertama.nama_warna }
            : {}),
          ...(draftItems.length === 1 && itemPertama.kode_hex_warna
            ? { kode_hex_warna: itemPertama.kode_hex_warna }
            : {}),
          detail_keluar: itemPertama.detail_keluar,
          items: draftItems,
          tujuan: tujuanDikirim,
          ...(namaResellerTrimmed ? { nama_reseller: namaResellerTrimmed } : {}),
          ...(keteranganTrimmed ? { keterangan: keteranganTrimmed } : {}),
        },
        $currentUser.uid,
      );
      await load(true);
      openCatat = false;
      showSuccess(
        `List barang keluar tersimpan: ${totalPcsDikirim} pcs keluar${totalPending > 0 ? `, ${totalPending} pcs pending` : ""} ke ${tujuanDikirim}.`,
      );
    } catch (e: any) {
      showError(e?.message ?? "Gagal mencatat barang keluar.");
    } finally {
      saving = false;
    }
  }

  onMount(load);
</script>

<!-- ── Toast ─────────────────────────────────────────────────────── -->
{#if successMsg}
  <div
    class="fixed right-5 top-5 z-[9999] flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 shadow-lg"
  >
    <svg
      class="h-4 w-4 shrink-0 text-green-600"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m4.5 12.75 6 6 9-13.5"
      />
    </svg>
    <p class="text-sm text-green-800">{successMsg}</p>
  </div>
{/if}
{#if errorMsg}
  <div
    class="fixed right-5 top-5 z-[9999] flex max-w-sm items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg"
  >
    <svg
      class="mt-0.5 h-4 w-4 shrink-0 text-red-500"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
      />
    </svg>
    <p class="text-sm text-red-800">{errorMsg}</p>
  </div>
{/if}

<!-- ── Header ─────────────────────────────────────────────────────── -->
<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Barang Keluar</h1>
    <p class="mt-0.5 text-sm text-gray-500">
      Catat dan riwayat pengiriman barang jadi
    </p>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <PeriodSelector bind:dateRange defaultPeriod="bulan_ini" />
    <Button variant="outline" size="sm" onclick={() => load(true)}>
      <svg
        class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
        />
      </svg>
      Refresh
    </Button>
    {#if canCatat}
      <Button
        variant="outline"
        onclick={() =>
          showSuccess("Import otomatis list barang keluar akan ditambahkan di tahap berikutnya.")}
      >
        <UploadIcon class="h-4 w-4" />
        Import List
      </Button>
      <Button href="/barang-keluar/catat">
        <svg
          class="h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2.5"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        Catat Keluar
      </Button>
    {/if}
  </div>
</div>

<!-- ── Stats ──────────────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
  {#if loading}
    {#each Array(4) as _}
      <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div class="mt-1.5 h-7 w-12 animate-pulse rounded bg-gray-100"></div>
      </div>
    {/each}
  {:else}
    <StatCard
      title="Total Pengiriman"
      value={totalPengiriman}
      icon={TruckIcon}
      footerSubtext="catatan pengiriman"
    />
    <StatCard
      title="Total Pcs Keluar"
      value={totalPcsKeluar.toLocaleString("id-ID")}
      icon={PackageCheckIcon}
      footerSubtext="pcs terkirim"
      class="border-green-100 bg-green-50"
      valueClass="text-green-700"
    />
    <StatCard
      title="Stok Tersedia"
      value={totalStokTersedia.toLocaleString("id-ID")}
      icon={BoxesIcon}
      footerSubtext="pcs siap kirim"
      class="border-teal-100 bg-teal-50"
      valueClass="text-teal-700"
    />
    <StatCard
      title="Model Tercatat"
      value={totalModelTersedia}
      icon={ShirtIcon}
      footerSubtext="model barang jadi"
    />
  {/if}
</div>

<!-- ── Rekap per Tujuan ──────────────────────────────────────────── -->
<div
  class="mb-5 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
>
  <div
    class="flex items-center justify-between border-b border-gray-100 px-5 py-3"
  >
    <div class="flex items-center gap-2">
      <ClipboardListIcon class="h-4 w-4 text-gray-400" />
      <h2 class="text-sm font-semibold text-gray-800">
        Rekap Pengiriman per Tujuan
      </h2>
      <span class="text-xs text-gray-400">— {rekapPeriodLabel}</span>
    </div>
    {#if !loading && rekapPerTujuan.length > 0}
      <Button
        variant="outline"
        size="sm"
        onclick={exportRekapPdf}
        disabled={exportingPdf}
      >
        <DownloadIcon
          class="h-3.5 w-3.5 {exportingPdf ? 'animate-pulse' : ''}"
        />
        {exportingPdf ? "Membuat PDF..." : "Export PDF"}
      </Button>
    {/if}
  </div>

  {#if loading}
    <div class="space-y-2 p-5">
      {#each Array(3) as _}
        <div class="h-6 w-full animate-pulse rounded bg-gray-100"></div>
      {/each}
    </div>
  {:else}
    <div class="divide-y divide-gray-50">
      {#each rekapPerTujuan as r (r.tujuan)}
        <div class="flex items-center gap-4 px-5 py-3">
          <p class="w-36 shrink-0 truncate text-sm font-medium text-gray-700">
            {r.tujuan}
          </p>
          <div class="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div
              class="h-full rounded-full bg-green-500"
              style="width: {(r.totalPcs / rekapMaxPcs) * 100}%"
            ></div>
          </div>
          <p class="w-20 shrink-0 text-right text-xs text-gray-400">
            {r.jumlahPengiriman} kirim
          </p>
          <p
            class="w-20 shrink-0 text-right text-sm font-semibold text-gray-800"
          >
            {r.totalPcs.toLocaleString("id-ID")} pcs
          </p>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- ── Filter + Table ─────────────────────────────────────────────── -->
<div class="mb-4 flex items-center gap-3">
  <div class="relative flex-1">
    <svg
      class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
      />
    </svg>
    <input
      type="text"
      placeholder="Cari model atau tujuan..."
      bind:value={searchQuery}
      class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
    />
  </div>
</div>

<!-- Riwayat table -->
<div
  class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
>
  {#if loading}
    <div class="space-y-0">
      {#each Array(5) as _}
        <div class="flex items-center gap-4 border-b border-gray-50 px-5 py-4">
          <div class="h-4 w-24 animate-pulse rounded bg-gray-100"></div>
          <div class="h-4 w-40 animate-pulse rounded bg-gray-100"></div>
          <div class="ml-auto h-4 w-16 animate-pulse rounded bg-gray-100"></div>
          <div class="h-4 w-24 animate-pulse rounded bg-gray-100"></div>
        </div>
      {/each}
    </div>
  {:else if filteredRiwayat.length === 0}
    <div class="flex flex-col items-center justify-center gap-3 py-16">
      <div
        class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100"
      >
        <svg
          class="h-7 w-7 text-gray-300"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
          />
        </svg>
      </div>
      {#if searchQuery}
        <p class="text-sm font-medium text-gray-500">
          Tidak ada hasil untuk "{searchQuery}"
        </p>
        <Button variant="link" size="sm" onclick={() => (searchQuery = "")}>
          Hapus pencarian
        </Button>
      {:else}
        <p class="text-sm font-medium text-gray-500">
          Belum ada catatan barang keluar
        </p>
        <p class="text-xs text-gray-400">
          Mulai dengan mencatat pengiriman pertama
        </p>
        {#if canCatat}
          <Button href="/barang-keluar/catat" class="mt-1">+ Catat Keluar</Button>
        {/if}
      {/if}
    </div>
  {:else}
    <Table.Root>
      <Table.Header>
        <Table.Row class="bg-gray-50 hover:bg-gray-50">
          <Table.Head>Tanggal</Table.Head>
          <Table.Head>List Barang</Table.Head>
          <Table.Head>Detail</Table.Head>
          <Table.Head class="text-center">PCS Keluar</Table.Head>
          <Table.Head>Status</Table.Head>
          <Table.Head>Tujuan</Table.Head>
          <Table.Head class="w-12"></Table.Head>
          {#if canCatat}<Table.Head class="w-12"></Table.Head>{/if}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each filteredRiwayat as r}
          <Table.Row>
            <Table.Cell>
              <p class="text-sm text-gray-700">
                {formatDate(r.tanggal_keluar)}
              </p>
              <p class="text-xs text-gray-400">
                {formatDateTime(r.tanggal_keluar).split(",")[1]?.trim() ?? ""}
              </p>
            </Table.Cell>
            <Table.Cell>
              <p class="text-sm font-medium text-gray-800">{listTitle(r)}</p>
              <p class="mt-0.5 text-xs text-gray-400">
                {listItems(r).length} item pencatatan
              </p>
            </Table.Cell>
            <Table.Cell>
              <div class="space-y-1.5">
                {#each listItems(r).slice(0, 3) as item}
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="text-xs font-medium text-gray-700">
                      {item.nama_model}{item.nama_warna ? ` - ${item.nama_warna}` : ""}
                    </span>
                    <span
                      class="rounded px-1.5 py-0.5 text-[11px] font-medium {item.status === 'pending'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700'}"
                    >
                      {itemSummary(item)}
                    </span>
                  </div>
                {/each}
                {#if listItems(r).length > 3}
                  <p class="text-xs text-gray-400">
                    +{listItems(r).length - 3} item lain
                  </p>
                {/if}
              </div>
            </Table.Cell>
            <Table.Cell class="text-center">
              <p class="text-sm font-semibold text-gray-800">{r.total_pcs}</p>
              <p class="text-xs text-gray-400">pcs</p>
            </Table.Cell>
            <Table.Cell>
              <Badge
                variant="outline"
                class={r.status === "pending"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-green-200 bg-green-50 text-green-700"}
              >
                {r.status === "pending" ? "Pending" : "Selesai"}
              </Badge>
              {#if (r.total_pending_pcs ?? 0) > 0}
                <p class="mt-1 text-xs text-amber-600">
                  {r.total_pending_pcs} pcs pending
                </p>
              {/if}
            </Table.Cell>
            <Table.Cell>
              <p class="text-sm font-medium text-gray-700">{r.tujuan}</p>
              {#if r.nama_reseller}
                <p class="mt-0.5 truncate text-xs text-gray-500">
                  Reseller: {r.nama_reseller}
                </p>
              {/if}
              {#if r.keterangan}
                <p class="mt-0.5 truncate text-xs text-gray-400">
                  {r.keterangan}
                </p>
              {/if}
            </Table.Cell>
            <Table.Cell>
              <button
                onclick={() => bukaDetail(r)}
                title="Detail pekerja"
                class="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-600"
              >
                <EyeIcon class="h-4 w-4" />
              </button>
            </Table.Cell>
            {#if canCatat}
              <Table.Cell>
                <button
                  onclick={() => bukaBatal(r)}
                  title="Batalkan pengiriman"
                  class="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2Icon class="h-4 w-4" />
                </button>
              </Table.Cell>
            {/if}
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>

    <!-- Footer -->
    <div
      class="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-3"
    >
      <p class="text-xs text-gray-400">
        Menampilkan {filteredRiwayat.length} dari {riwayat.length} pengiriman total
      </p>
      <p class="text-xs text-gray-400">
        Total: <span class="font-semibold text-gray-700"
          >{totalPcsKeluar.toLocaleString("id-ID")} pcs</span
        >
      </p>
    </div>
  {/if}
</div>

<!-- ── Dialog: Catat Barang Keluar ───────────────────────────────── -->
<Dialog.Root bind:open={openCatat}>
  <Dialog.Content class="max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Catat Barang Keluar</Dialog.Title>
      <Dialog.Description>
        Buat satu list pencatatan berisi beberapa barang keluar.
      </Dialog.Description>
    </Dialog.Header>

    <div class="max-h-[68vh] space-y-5 overflow-y-auto px-1 pb-1">
      <!-- Tujuan -->
      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="tujuan-keluar"
        >
          Tujuan Pengiriman <span class="text-red-500">*</span>
        </label>
        <Select.Root
          type="single"
          value={fTujuan || undefined}
          onValueChange={(val) => (fTujuan = val ?? "")}
        >
          <Select.Trigger id="tujuan-keluar" class="w-full">
            {#if fTujuan}
              <span>{fTujuan}</span>
            {:else}
              <span class="text-muted-foreground"
                >-- Pilih tujuan pengiriman --</span
              >
            {/if}
          </Select.Trigger>
          <Select.Content preventScroll={false}>
            {#each TUJUAN_PENGIRIMAN_OPTIONS as t}
              <Select.Item value={t}>{t}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="nama-reseller"
        >
          Nama Reseller
          <span class="text-xs font-normal text-gray-400">(opsional)</span>
        </label>
        <Input
          id="nama-reseller"
          placeholder="Nama reseller atau toko tujuan..."
          bind:value={fNamaReseller}
        />
      </div>

      {#if draftItems.length > 0}
        <div class="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div class="mb-2 flex items-center justify-between gap-3">
            <p class="text-sm font-medium text-gray-700">
              Daftar barang keluar
            </p>
            <p class="text-xs text-gray-400">
              {totalDraftKeluarPcs} keluar · {totalDraftPendingPcs} pending
            </p>
          </div>
          <div class="space-y-2">
            {#each draftItems as item, index}
              <div class="flex items-start gap-2 rounded-md bg-white px-3 py-2">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <p class="truncate text-sm font-medium text-gray-800">
                      {item.nama_model}{item.nama_warna ? ` - ${item.nama_warna}` : ""}
                    </p>
                    <Badge
                      variant="outline"
                      class={item.status === "pending"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-green-200 bg-green-50 text-green-700"}
                    >
                      {item.status === "pending" ? "Pending" : "Keluar"}
                    </Badge>
                  </div>
                  <p class="mt-1 text-xs text-gray-500">
                    {itemSummary(item)} · {item.total_pcs} pcs
                  </p>
                  {#if item.alasan_pending}
                    <p class="mt-0.5 text-xs text-amber-600">
                      {item.alasan_pending}
                    </p>
                  {/if}
                </div>
                <button
                  type="button"
                  onclick={() => hapusDraftItem(index)}
                  class="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
                  title="Hapus item"
                >
                  <XIcon class="h-4 w-4" />
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Pilih Model -->
      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="model-keluar"
        >
          Model Baju <span class="text-red-500">*</span>
        </label>
        {#if modelDenganStok.length === 0}
          <div class="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
            <p class="text-sm text-amber-700">
              Tidak ada barang jadi yang tersedia.
            </p>
            <a
              href="/barang-jadi"
              class="mt-1 block text-xs font-medium text-amber-600 hover:underline"
            >
              Lihat stok barang jadi →
            </a>
          </div>
        {:else}
          <Select.Root
            type="single"
            value={fModelKey || undefined}
            onValueChange={(val) => {
              fModelKey = val ?? "";
              fWarnaKeys = [];
              fJumlahByWarna = {};
            }}
          >
            <Select.Trigger class="w-full">
              {#if selectedModelData}
                <span class="flex items-center gap-1.5 truncate">
                  {selectedModelData.nama_model}
                  {#if selectedModelData.nama_warna}
                    <span class="text-gray-300">·</span>
                    {#if selectedModelData.kode_hex_warna}
                      <span
                        class="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                        style="background:{selectedModelData.kode_hex_warna}"
                      ></span>
                    {/if}
                    <span class="text-gray-500"
                      >{selectedModelData.nama_warna}</span
                    >
                  {/if}
                </span>
              {:else}
                <span class="text-muted-foreground">— Pilih model —</span>
              {/if}
            </Select.Trigger>
            <Select.Content preventScroll={false}>
              {#each modelDenganStok as m}
                <Select.Item value={m.key}>
                  <span class="flex items-center gap-1.5">
                    {m.nama_model}
                    {#if m.nama_warna}
                      <span class="text-gray-300">·</span>
                      {#if m.kode_hex_warna}
                        <span
                          class="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                          style="background:{m.kode_hex_warna}"
                        ></span>
                      {/if}
                      <span class="text-gray-400 text-xs">{m.nama_warna}</span>
                    {/if}
                  </span>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        {/if}
      </div>

      <!-- Pilih Warna -->
      {#if selectedModelData}
        <div>
          <p class="mb-1.5 text-sm font-medium text-gray-700">
            Warna <span class="text-red-500">*</span>
          </p>
          <div class="space-y-2">
            {#each warnaTersedia as w}
              {@const checked = fWarnaKeys.includes(w.key)}
              <label
                class="flex cursor-pointer items-center gap-3 rounded-lg border {checked
                  ? 'border-green-200 bg-green-50'
                  : 'border-gray-100 bg-gray-50'} px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onchange={(e) =>
                    toggleWarna(w.key, (e.currentTarget as HTMLInputElement).checked)}
                  class="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                {#if w.kode_hex_warna}
                  <span
                    class="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                    style="background:{w.kode_hex_warna}"
                  ></span>
                {/if}
                <span class="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">
                  {w.nama_warna ?? "Tanpa warna"}
                </span>
                <span class="text-xs text-gray-400">{w.total_stok} pcs</span>
              </label>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Stok info + input per ukuran -->
      {#if selectedWarnaList.length > 0}
        <div>
          <p class="mb-2 text-sm font-medium text-gray-700">
            Jumlah Per Ukuran <span class="text-red-500">*</span>
          </p>
          <div class="space-y-3">
            {#each selectedWarnaList as w}
              <div class="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div class="mb-2 flex items-center justify-between gap-3">
                  <p class="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-800">
                    {#if w.kode_hex_warna}
                      <span
                        class="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                        style="background:{w.kode_hex_warna}"
                      ></span>
                    {/if}
                    <span class="truncate">{w.nama_warna ?? "Tanpa warna"}</span>
                  </p>
                  <p class="text-xs text-gray-400">{w.total_stok} pcs stok</p>
                </div>
                <div class="space-y-2">
                  {#each selectedUkuranList as ukuran}
                    {@const stokItem = w.stok.find((i) => i.ukuran === ukuran)}
                    {@const melebihi = melebihiStok(w.key, ukuran)}
                    <div
                      class="flex items-center gap-3 rounded-lg border {melebihi && !fPending
                        ? 'border-red-200 bg-red-50'
                        : 'border-gray-100 bg-white'} px-3 py-2"
                    >
                      <div
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-50 text-xs font-bold text-gray-700 shadow-sm"
                      >
                        {ukuran}
                      </div>
                      <div class="flex-1">
                        <p class="text-xs text-gray-500">
                          Tersedia: <span class="font-semibold text-gray-700"
                            >{stokItem?.stok_tersedia ?? 0} pcs</span
                          >
                        </p>
                        {#if melebihi && !fPending}
                          <p class="text-xs text-red-600">Melebihi stok. Tandai pending jika belum tersedia.</p>
                        {:else if melebihi && fPending}
                          <p class="text-xs text-amber-600">Akan dicatat sebagai pending.</p>
                        {/if}
                      </div>
                      <Input
                        type="number"
                        min="0"
                        max={fPending ? undefined : (stokItem?.stok_tersedia ?? 0)}
                        placeholder="0"
                        value={jumlahWarna(w.key, ukuran) || ""}
                        oninput={(e) =>
                          setJumlahWarna(
                            w.key,
                            ukuran,
                            Number((e.currentTarget as HTMLInputElement).value || 0),
                          )}
                        class="w-20 text-center {melebihi && !fPending ? 'border-red-300' : ''}"
                      />
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
          {#if totalPcs > 0}
            <p class="mt-2 text-xs text-gray-500">
              Total keluar: <span class="font-semibold text-gray-800"
                >{totalPcs} pcs</span
              >
            </p>
          {/if}
        </div>
      {/if}

      {#if selectedWarnaList.length > 0}
        <div class="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <label class="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              bind:checked={fPending}
              class="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            <span>
              Tandai item ini pending
              <span class="block text-xs text-gray-400">
                Pending tidak mengurangi stok dan membuat status list menjadi pending.
              </span>
            </span>
          </label>
          {#if fPending}
            <Input
              class="mt-3"
              placeholder="Alasan pending, misal stok belum ada"
              bind:value={fAlasanPending}
            />
          {/if}
        </div>

        <Button
          type="button"
          variant="outline"
          class="w-full"
          onclick={tambahDraftItem}
          disabled={!canAddItem}
        >
          Tambah ke Daftar
        </Button>
      {/if}

      <!-- Keterangan -->
      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="keterangan-keluar"
        >
          Keterangan
          <span class="text-xs font-normal text-gray-400">(opsional)</span>
        </label>
        <textarea
          id="keterangan-keluar"
          rows="3"
          placeholder="Catatan tambahan pengiriman..."
          bind:value={fKeterangan}
          class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
        ></textarea>
      </div>
    </div>

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openCatat = false)}>
        Batal
      </Button>
      <Button
        onclick={submitCatat}
        disabled={saving || !canSubmit}
      >
        {saving ? "Menyimpan..." : "Simpan List"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- ── Dialog: Batalkan Barang Keluar ────────────────────────────── -->
{#if batalTarget}
  <Dialog.Root bind:open={batalOpen}>
    <Dialog.Content class="max-w-sm">
      <Dialog.Header>
        <Dialog.Title class="text-red-700">Batalkan Pengiriman?</Dialog.Title>
        <Dialog.Description>
          Pengiriman <span class="font-semibold text-gray-800"
            >{batalTarget.total_pcs} pcs "{batalTarget.nama_model}"</span
          >
          ke <span class="font-medium">{batalTarget.tujuan}</span> akan dihapus dan
          stok barang jadi akan dikembalikan.
        </Dialog.Description>
      </Dialog.Header>
      {#if batalError}
        <p
          class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {batalError}
        </p>
      {/if}
      <Dialog.Footer class="gap-2">
        <Button
          variant="outline"
          onclick={() => (batalOpen = false)}
          disabled={batalSaving}
        >
          Batal
        </Button>
        <Button
          variant="destructive"
          onclick={submitBatal}
          disabled={batalSaving}
        >
          {#if batalSaving}
            <svg
              class="mr-2 h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
          {/if}
          Ya, Batalkan
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
{/if}

<BarangKeluarDetailDialog
  bind:open={detailDialogOpen}
  riwayat={detailTarget}
  modelList={modelList}
  onResolvePending={submitProsesPending}
/>
