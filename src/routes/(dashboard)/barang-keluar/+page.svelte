<script lang="ts">
  import { onMount } from "svelte";
  import {
    catatBarangKeluar,
    getRiwayatBarangKeluarByPeriod,
    batalBarangKeluar,
  } from "$lib/firebase/barang-jadi";
  import { barangJadiCache } from "$lib/stores/data-cache.svelte";
  import { currentUser, userRole } from "$lib/stores/auth.store";
  import {
    UKURAN_ORDER,
    TUJUAN_PENGIRIMAN_OPTIONS,
    type StokBarangJadi,
    type BarangKeluar,
    type UkuranBaju,
  } from "$lib/types";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Table from "$lib/components/ui/table";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import StatCard from "$lib/components/StatCard.svelte";
  import TruckIcon from "@lucide/svelte/icons/truck";
  import PackageCheckIcon from "@lucide/svelte/icons/package-check";
  import BoxesIcon from "@lucide/svelte/icons/boxes";
  import ShirtIcon from "@lucide/svelte/icons/shirt";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import { type DateRange, getPeriodRange } from "$lib/period";
  import PeriodSelector from "$lib/components/period-selector.svelte";
  import BarangKeluarDetailDialog from "$lib/components/barang-keluar-detail-dialog.svelte";

  // ── State ──────────────────────────────────────────────────────────
  let stokList = $state<StokBarangJadi[]>([]);
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
  let fModelKey = $state(""); // composite: "${model_id}__${nama_warna ?? ''}"
  let fTujuan = $state("");
  let fKeterangan = $state("");
  let fJumlah = $state<Partial<Record<UkuranBaju, number>>>({});

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
        stok: StokBarangJadi[];
      }
    >();
    for (const item of stokList) {
      if (item.stok_tersedia > 0) {
        const key = `${item.model_id}__${item.nama_warna ?? ""}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            model_id: item.model_id,
            nama_model: item.nama_model,
            nama_warna: item.nama_warna,
            kode_hex_warna: item.kode_hex_warna,
            stok: [],
          });
        }
        map.get(key)!.stok.push(item);
      }
    }
    return [...map.values()].sort((a, b) =>
      a.nama_model.localeCompare(b.nama_model),
    );
  });

  let selectedModelData = $derived(
    modelDenganStok.find((m) => m.key === fModelKey) ?? null,
  );

  let detailKeluar = $derived(
    selectedModelData
      ? UKURAN_ORDER.filter((u) => {
          const s = selectedModelData!.stok.find((i) => i.ukuran === u);
          return s && s.stok_tersedia > 0 && (fJumlah[u] ?? 0) > 0;
        }).map((u) => ({ ukuran: u, jumlah_pcs: fJumlah[u]! }))
      : [],
  );

  let totalPcs = $derived(detailKeluar.reduce((s, d) => s + d.jumlah_pcs, 0));
  let canSubmit = $derived(
    fModelKey !== "" && fTujuan.trim() !== "" && totalPcs > 0,
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
      doc.text(`Total Pengiriman: ${totalPengiriman}`, marginX, 41);
      doc.text(`Total Pcs Keluar: ${totalPcsKeluar}`, marginX + 70, 41);

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
        startY: 47,
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
          .map((r) => [
            formatDate(r.tanggal_keluar),
            r.nama_model,
            r.nama_warna ?? "—",
            r.tujuan,
            String(r.total_pcs),
          ]);

        autoTable(doc, {
          startY: finalY + 14,
          head: [["Tanggal", "Model", "Warna", "Tujuan", "Pcs"]],
          body: detailBody,
          theme: "grid",
          margin: { left: marginX, right: marginX },
          styles: {
            font: "helvetica",
            fontSize: 8.5,
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
            4: { halign: "center" },
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
        r.tujuan.toLowerCase().includes(q),
    );
  });

  function maxUkuran(ukuran: UkuranBaju): number {
    if (!selectedModelData) return 0;
    return (
      selectedModelData.stok.find((i) => i.ukuran === ukuran)?.stok_tersedia ??
      0
    );
  }

  function melebihiStok(ukuran: UkuranBaju): boolean {
    return (fJumlah[ukuran] ?? 0) > maxUkuran(ukuran);
  }

  let adaYangMelebihi = $derived(
    selectedModelData ? UKURAN_ORDER.some((u) => melebihiStok(u)) : false,
  );

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
      [stokList, riwayat] = await Promise.all([
        barangJadiCache.get(force),
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
    fTujuan = "";
    fKeterangan = "";
    fJumlah = {};
    openCatat = true;
  }

  async function submitCatat() {
    if (!canSubmit || !$currentUser || adaYangMelebihi) return;
    saving = true;
    try {
      const keteranganTrimmed = fKeterangan.trim();
      // Simpan dulu ke variabel lokal SEBELUM load(true) — selectedModelData bersifat
      // reactive dan bisa jadi null setelah reload kalau pengiriman ini menghabiskan
      // sisa stok terakhir model tsb (model otomatis hilang dari modelDenganStok).
      const namaModelDikirim = selectedModelData!.nama_model;
      const tujuanDikirim = fTujuan.trim();
      const totalPcsDikirim = totalPcs;

      await catatBarangKeluar(
        {
          model_id: selectedModelData!.model_id,
          nama_model: selectedModelData!.nama_model,
          ...(selectedModelData!.nama_warna
            ? { nama_warna: selectedModelData!.nama_warna }
            : {}),
          ...(selectedModelData!.kode_hex_warna
            ? { kode_hex_warna: selectedModelData!.kode_hex_warna }
            : {}),
          detail_keluar: detailKeluar,
          tujuan: tujuanDikirim,
          ...(keteranganTrimmed ? { keterangan: keteranganTrimmed } : {}),
        },
        $currentUser.uid,
      );
      await load(true);
      openCatat = false;
      showSuccess(
        `Pengiriman ${totalPcsDikirim} pcs "${namaModelDikirim}" ke ${tujuanDikirim} berhasil dicatat.`,
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
      <Button onclick={bukaCatat}>
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
      title="Model Tersedia"
      value={totalModelTersedia}
      icon={ShirtIcon}
      footerSubtext="model ada stoknya"
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
          <Button onclick={bukaCatat} class="mt-1">+ Catat Keluar</Button>
        {/if}
      {/if}
    </div>
  {:else}
    <Table.Root>
      <Table.Header>
        <Table.Row class="bg-gray-50 hover:bg-gray-50">
          <Table.Head>Tanggal</Table.Head>
          <Table.Head>Model</Table.Head>
          <Table.Head>Detail Ukuran</Table.Head>
          <Table.Head class="text-center">Total PCS</Table.Head>
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
              <p class="text-sm font-medium text-gray-800">{r.nama_model}</p>
            </Table.Cell>
            <Table.Cell>
              <div class="flex flex-wrap gap-1">
                {#each r.detail_keluar as d}
                  <span
                    class="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700"
                  >
                    {d.ukuran}: {d.jumlah_pcs}
                  </span>
                {/each}
              </div>
            </Table.Cell>
            <Table.Cell class="text-center">
              <p class="text-sm font-semibold text-gray-800">{r.total_pcs}</p>
              <p class="text-xs text-gray-400">pcs</p>
            </Table.Cell>
            <Table.Cell>
              <p class="text-sm font-medium text-gray-700">{r.tujuan}</p>
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
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Catat Barang Keluar</Dialog.Title>
      <Dialog.Description>
        Rekam pengiriman barang jadi ke tujuan.
      </Dialog.Description>
    </Dialog.Header>

    <div class="max-h-[60vh] space-y-5 overflow-y-auto px-1 pb-1">
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
              fJumlah = {};
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

      <!-- Stok info + input per ukuran -->
      {#if selectedModelData}
        <div>
          <p class="mb-2 text-sm font-medium text-gray-700">
            Jumlah Per Ukuran <span class="text-red-500">*</span>
          </p>
          <div class="space-y-2">
            {#each UKURAN_ORDER.filter( (u) => selectedModelData!.stok.some((i) => i.ukuran === u), ) as ukuran}
              {@const stokItem = selectedModelData.stok.find(
                (i) => i.ukuran === ukuran,
              )!}
              {@const melebihi = melebihiStok(ukuran)}
              <div
                class="flex items-center gap-3 rounded-lg border {melebihi
                  ? 'border-red-200 bg-red-50'
                  : 'border-gray-100 bg-gray-50'} px-3 py-2"
              >
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-gray-700 shadow-sm"
                >
                  {ukuran}
                </div>
                <div class="flex-1">
                  <p class="text-xs text-gray-500">
                    Tersedia: <span class="font-semibold text-gray-700"
                      >{stokItem.stok_tersedia} pcs</span
                    >
                  </p>
                  {#if melebihi}
                    <p class="text-xs text-red-600">Melebihi stok!</p>
                  {/if}
                </div>
                <Input
                  type="number"
                  min="0"
                  max={stokItem.stok_tersedia}
                  placeholder="0"
                  bind:value={fJumlah[ukuran]}
                  class="w-20 text-center {melebihi ? 'border-red-300' : ''}"
                />
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
                >— Pilih tujuan pengiriman —</span
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
        disabled={saving || !canSubmit || adaYangMelebihi}
      >
        {saving ? "Menyimpan..." : "Catat Keluar"}
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

<BarangKeluarDetailDialog bind:open={detailDialogOpen} riwayat={detailTarget} />
