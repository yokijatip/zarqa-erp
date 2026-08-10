<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import {
    addStokKain,
    restockKain,
    updateStokKain,
    kurangiStokManual,
    deleteStokKain,
    getRiwayatStokKain,
  } from "$lib/firebase/stok-kain";
  import { getBatchListByDateRange } from "$lib/firebase/batch-produksi";
  import { stokKainCache, warnaCache } from "$lib/stores/data-cache.svelte";
  import type { StokKain, Warna, BatchProduksi, RiwayatStokKain } from "$lib/types";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Table from "$lib/components/ui/table";
  import { Button } from "$lib/components/ui/button";
  import * as Select from "$lib/components/ui/select/index.js";
  import StatCard from "$lib/components/StatCard.svelte";
  import LayersIcon from "@lucide/svelte/icons/layers";
  import BoxIcon from "@lucide/svelte/icons/box";
  import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
  import { Chart, registerables } from "chart.js";
  Chart.register(...registerables);

  // ── State ──────────────────────────────────────────────────────────
  let stokList = $state<StokKain[]>([]);
  let warnaList = $state<Warna[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);
  let searchQuery = $state("");
  let sortBy = $state<"nama" | "tersedia_asc" | "tersedia_desc">(
    "tersedia_asc",
  );

  // Dialog state
  let openTambah = $state(false);
  let openRestock = $state(false);
  let openKurangi = $state(false);
  let openEdit = $state(false);
  let selectedKain = $state<StokKain | null>(null);
  let kurangiKain = $state<StokKain | null>(null);
  let editingKain = $state<StokKain | null>(null);

  // History state
  let openRiwayat = $state(false);
  let riwayatKain = $state<StokKain | null>(null);
  let riwayatList = $state<RiwayatStokKain[]>([]);
  let riwayatLoading = $state(false);

  async function bukaRiwayat(kain: StokKain) {
    riwayatKain = kain;
    riwayatList = [];
    openRiwayat = true;
    riwayatLoading = true;
    try {
      riwayatList = await getRiwayatStokKain(kain.id);
    } catch {
      riwayatList = [];
    } finally {
      riwayatLoading = false;
    }
  }

  function formatTanggal(ts: import("firebase/firestore").Timestamp | undefined): string {
    if (!ts) return "—";
    const d = ts.toDate();
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Form: tambah kain
  let fNama = $state("");
  let fWarnaId = $state("");
  let fSatuan = $state<"yard" | "kg">("yard");
  let fStok = $state<number | "">("");
  let fCatatan = $state("");

  // Form: restock
  let rJumlah = $state<number | "">("");
  let rCatatan = $state("");
  let rTanggalBeli = $state("");
  let rSupplier = $state("");
  let rHargaPerUnit = $state<number | "">("");

  // Form: kurangi stok
  let kJumlah = $state<number | "">("");
  let kCatatan = $state("");

  // Form: edit kain
  let eNama = $state("");
  let eWarnaId = $state("");
  let eCatatan = $state("");
  let eKonfirmasiHapus = $state(false);
  let deleting = $state(false);

  // ── Analytics State ────────────────────────────────────────────────
  function toDateStr(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  const _now = new Date();
  let analyticsFromStr = $state(
    toDateStr(new Date(_now.getFullYear(), _now.getMonth(), 1)),
  );
  let analyticsToStr = $state(
    toDateStr(new Date(_now.getFullYear(), _now.getMonth() + 1, 0)),
  );
  let analyticsLoading = $state(false);
  let analyticsBatches = $state<BatchProduksi[]>([]);
  let chartCanvas = $state<HTMLCanvasElement | null>(null);

  const CHART_COLORS = [
    "rgba(59,130,246,0.75)",
    "rgba(16,185,129,0.75)",
    "rgba(245,158,11,0.75)",
    "rgba(239,68,68,0.75)",
    "rgba(168,85,247,0.75)",
    "rgba(236,72,153,0.75)",
    "rgba(14,165,233,0.75)",
    "rgba(249,115,22,0.75)",
    "rgba(20,184,166,0.75)",
    "rgba(99,102,241,0.75)",
  ];

  type KainUsageEntry = {
    nama: string;
    satuan: string;
    total: number;
    models: Array<{ model_id: string; nama: string; total: number }>;
  };

  // Status yang menandakan kain sudah benar-benar dipotong
  const STATUSES_KAIN_DIPOTONG = new Set([
    "CUTTING_DONE", "JAHIT_IN_PROGRESS", "JAHIT_DONE",
    "STEAM_IN_PROGRESS", "STEAM_DONE", "COMPLETED",
  ]);

  let kainUsageData = $derived.by((): Array<[string, KainUsageEntry]> => {
    const map = new Map<string, KainUsageEntry>();
    for (const batch of analyticsBatches) {
      if (batch.dari_potongan) continue;
      if (!STATUSES_KAIN_DIPOTONG.has(batch.status)) continue; // kain belum dipotong
      for (const k of batch.kain_digunakan) {
        if (!map.has(k.kain_id)) {
          map.set(k.kain_id, {
            nama: k.nama_kain,
            satuan: k.satuan,
            total: 0,
            models: [],
          });
        }
        const entry = map.get(k.kain_id)!;
        entry.total = parseFloat((entry.total + k.jumlah_dipakai).toFixed(2));
        const m = entry.models.find((x) => x.model_id === batch.model_id);
        if (m) {
          m.total = parseFloat((m.total + k.jumlah_dipakai).toFixed(2));
        } else {
          entry.models.push({
            model_id: batch.model_id,
            nama: batch.nama_model,
            total: k.jumlah_dipakai,
          });
        }
      }
    }
    for (const [, entry] of map) {
      entry.models.sort((a, b) => b.total - a.total);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  });

  $effect(() => {
    const canvas = chartCanvas;
    const data = kainUsageData;
    if (!canvas || data.length === 0) return;

    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: data.map(([, v]) => `${v.nama}`),
        datasets: [
          {
            data: data.map(([, v]) => v.total),
            backgroundColor: data.map(
              (_, i) => CHART_COLORS[i % CHART_COLORS.length],
            ),
            borderColor: data.map(
              (_, i) =>
                CHART_COLORS[i % CHART_COLORS.length].replace("0.75", "1"),
            ),
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ` ${Number(ctx.raw).toLocaleString("id-ID")} ${data[ctx.dataIndex]?.[1]?.satuan ?? ""}`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { font: { size: 11 } },
          },
          y: {
            ticks: { font: { size: 12 } },
          },
        },
      },
    });

    return () => chart.destroy();
  });

  async function loadAnalytics() {
    if (!analyticsFromStr || !analyticsToStr) return;
    analyticsLoading = true;
    try {
      const from = new Date(analyticsFromStr + "T00:00:00");
      const to = new Date(analyticsToStr + "T23:59:59");
      analyticsBatches = await getBatchListByDateRange(from, to);
    } catch {
      analyticsBatches = [];
    } finally {
      analyticsLoading = false;
    }
  }

  // ── Derived ────────────────────────────────────────────────────────
  let totalYard = $derived(
    stokList
      .filter((k) => k.satuan === "yard")
      .reduce((s, k) => s + k.stok_tersedia, 0),
  );
  let totalKg = $derived(
    stokList
      .filter((k) => k.satuan === "kg")
      .reduce((s, k) => s + k.stok_tersedia, 0),
  );
  let totalJenis = $derived(stokList.length);
  let kritisCount = $derived(
    stokList.filter((k) => k.stok_tersedia < 100).length,
  );

  let filteredList = $derived.by(() => {
    let list = stokList.filter(
      (k) =>
        !searchQuery ||
        k.nama_kain.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (k.nama_warna ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
    );
    if (sortBy === "nama")
      list = [...list].sort((a, b) => a.nama_kain.localeCompare(b.nama_kain));
    if (sortBy === "tersedia_asc")
      list = [...list].sort((a, b) => a.stok_tersedia - b.stok_tersedia);
    if (sortBy === "tersedia_desc")
      list = [...list].sort((a, b) => b.stok_tersedia - a.stok_tersedia);
    return list;
  });

  // ── Helpers ────────────────────────────────────────────────────────
  function statusKain(tersedia: number) {
    if (tersedia < 100)
      return {
        label: "Kritis",
        cls: "bg-red-100 text-red-700",
        bar: "bg-red-400",
      };
    if (tersedia < 250)
      return {
        label: "Perhatian",
        cls: "bg-amber-100 text-amber-700",
        bar: "bg-amber-400",
      };
    return {
      label: "Aman",
      cls: "bg-green-100 text-green-700",
      bar: "bg-blue-400",
    };
  }

  function showSuccess(msg: string) {
    successMsg = msg;
    setTimeout(() => (successMsg = null), 3000);
  }

  function showError(msg: string) {
    errorMsg = msg;
    setTimeout(() => (errorMsg = null), 4000);
  }

  // ── Data ────────────────────────────────────────────────────────────
  async function load(force = false) {
    loading = true;
    errorMsg = null;
    try {
      [stokList, warnaList] = await Promise.all([
        stokKainCache.get(force),
        warnaCache.get(force),
      ]);
    } catch {
      showError("Gagal memuat data. Periksa koneksi Firebase.");
    } finally {
      loading = false;
    }
  }

  function getSelectedWarna(warnaId: string) {
    return warnaList.find((w) => w.id === warnaId) ?? null;
  }

  // ── Actions ─────────────────────────────────────────────────────────
  async function submitTambah() {
    if (!fNama.trim() || fStok === "" || Number(fStok) <= 0) return;
    saving = true;
    try {
      const selectedWarna = getSelectedWarna(fWarnaId);
      await addStokKain({
        nama_kain: fNama.trim(),
        ...(selectedWarna
          ? {
              warna_id: selectedWarna.id,
              nama_warna: selectedWarna.nama_warna,
              kode_hex_warna: selectedWarna.kode_hex,
            }
          : {}),
        satuan: fSatuan,
        stok_tersedia: Number(fStok),
        ...(fCatatan.trim() ? { catatan: fCatatan.trim() } : {}),
      });
      const namaKain = fNama.trim();
      await load(true);
      openTambah = false;
      fNama = "";
      fWarnaId = "";
      fSatuan = "yard";
      fStok = "";
      fCatatan = "";
      showSuccess(`Kain "${namaKain}" berhasil ditambahkan.`);
    } catch {
      showError("Gagal menyimpan data kain.");
    } finally {
      saving = false;
    }
  }

  async function submitRestock() {
    if (!selectedKain || rJumlah === "" || Number(rJumlah) <= 0) return;
    saving = true;
    try {
      await restockKain(selectedKain.id, Number(rJumlah), {
        catatan: rCatatan.trim() || undefined,
        tanggal_beli: rTanggalBeli || undefined,
        supplier: rSupplier.trim() || undefined,
        harga_per_unit: rHargaPerUnit !== "" ? Number(rHargaPerUnit) : undefined,
      });
      const nama = selectedKain.nama_kain;
      const satuan = selectedKain.satuan;
      const jumlah = Number(rJumlah);
      await load(true);
      openRestock = false;
      selectedKain = null;
      rJumlah = "";
      rCatatan = "";
      rTanggalBeli = "";
      rSupplier = "";
      rHargaPerUnit = "";
      showSuccess(`Restock ${nama} sebesar ${jumlah} ${satuan} berhasil.`);
    } catch {
      showError("Gagal melakukan restock.");
    } finally {
      saving = false;
    }
  }

  function bukaTambah() {
    fNama = "";
    fWarnaId = "";
    fSatuan = "yard";
    fStok = "";
    fCatatan = "";
    openTambah = true;
  }

  function bukaRestock(kain: StokKain) {
    selectedKain = kain;
    rJumlah = "";
    rCatatan = "";
    rTanggalBeli = new Date().toISOString().slice(0, 10);
    rSupplier = "";
    rHargaPerUnit = "";
    openRestock = true;
  }

  function bukaKurangi(kain: StokKain) {
    kurangiKain = kain;
    kJumlah = "";
    kCatatan = "";
    openKurangi = true;
  }

  async function submitKurangi() {
    if (!kurangiKain || kJumlah === "" || Number(kJumlah) <= 0) return;
    saving = true;
    try {
      await kurangiStokManual(kurangiKain.id, Number(kJumlah), kCatatan.trim() || undefined);
      const nama = kurangiKain.nama_kain;
      const satuan = kurangiKain.satuan;
      const jumlah = Number(kJumlah);
      await load(true);
      openKurangi = false;
      kurangiKain = null;
      kJumlah = "";
      kCatatan = "";
      showSuccess(`Stok ${nama} dikurangi ${jumlah} ${satuan}.`);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Gagal mengurangi stok.");
    } finally {
      saving = false;
    }
  }

  function bukaEdit(kain: StokKain) {
    editingKain = kain;
    eNama = kain.nama_kain;
    eWarnaId = kain.warna_id ?? "";
    eCatatan = kain.catatan ?? "";
    eKonfirmasiHapus = false;
    openEdit = true;
  }

  async function submitHapusKain() {
    if (!editingKain) return;
    deleting = true;
    try {
      await deleteStokKain(editingKain.id);
      await load(true);
      openEdit = false;
      editingKain = null;
      eKonfirmasiHapus = false;
      showSuccess(`Kain "${eNama}" berhasil dihapus.`);
      eNama = "";
      eWarnaId = "";
      eCatatan = "";
    } catch (e: any) {
      showError(e?.message ?? "Gagal menghapus kain.");
    } finally {
      deleting = false;
    }
  }

  async function submitEdit() {
    if (!editingKain || !eNama.trim()) return;
    saving = true;
    try {
      const selectedWarna = getSelectedWarna(eWarnaId);
      await updateStokKain(editingKain.id, {
        nama_kain: eNama.trim(),
        catatan: eCatatan.trim() || undefined,
        warna: selectedWarna,
      });
      const nama = eNama.trim();
      await load(true);
      openEdit = false;
      editingKain = null;
      eNama = "";
      eWarnaId = "";
      eCatatan = "";
      showSuccess(`Kain "${nama}" berhasil diperbarui.`);
    } catch {
      showError("Gagal menyimpan perubahan kain.");
    } finally {
      saving = false;
    }
  }

  afterNavigate(() => {
    load();
    loadAnalytics();
  });
</script>

<!-- ── Toast Notification ──────────────────────────────────────── -->
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

<!-- ── Header ──────────────────────────────────────────────────── -->
<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Stok Kain</h1>
    <p class="mt-0.5 text-sm text-gray-500">
      Kelola inventaris kain untuk produksi
    </p>
  </div>
  <Button onclick={bukaTambah}>
    <svg
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
    Tambah Kain
  </Button>
</div>

<!-- ── Stats Row ──────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
  <StatCard
    title="Total Jenis"
    value={totalJenis}
    icon={LayersIcon}
    footerSubtext="jenis kain terdaftar"
  />
  <StatCard
    title="Total Yard"
    value={totalYard.toLocaleString("id-ID")}
    icon={BoxIcon}
    footerSubtext="yard tersedia"
  />
  <StatCard
    title="Total Kg"
    value={totalKg.toLocaleString("id-ID")}
    icon={BoxIcon}
    footerSubtext="kg tersedia"
  />
  <StatCard
    title="Kain Kritis"
    value={kritisCount}
    icon={AlertTriangleIcon}
    footerSubtext="di bawah ambang batas"
    class={kritisCount > 0 ? "border-red-200 bg-red-50" : ""}
    valueClass={kritisCount > 0 ? "text-red-700" : ""}
  />
</div>

<!-- ── Analytics Section ─────────────────────────────────────── -->
<div
  class="mb-5 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
>
  <!-- Header + date range -->
  <div
    class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4"
  >
    <div>
      <h2 class="text-sm font-semibold text-gray-800">Analitik Pemakaian Kain</h2>
      <p class="text-xs text-gray-400">
        Kain yang terpakai saat order produksi dibuat (bukan dari potongan)
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <input
        type="date"
        bind:value={analyticsFromStr}
        class="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none"
      />
      <span class="text-xs text-gray-400">s/d</span>
      <input
        type="date"
        bind:value={analyticsToStr}
        class="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none"
      />
      <Button size="sm" onclick={loadAnalytics} disabled={analyticsLoading}>
        {#if analyticsLoading}
          <svg
            class="h-3.5 w-3.5 animate-spin"
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
          Memuat...
        {:else}
          Tampilkan
        {/if}
      </Button>
    </div>
  </div>

  <!-- Content -->
  {#if analyticsLoading}
    <div class="flex items-center justify-center py-12">
      <svg
        class="h-6 w-6 animate-spin text-gray-300"
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
    </div>
  {:else if kainUsageData.length === 0}
    <div class="flex flex-col items-center justify-center gap-2 py-12">
      <p class="text-sm text-gray-400">Tidak ada data pemakaian kain pada periode ini</p>
    </div>
  {:else}
    <div class="p-5">
      <!-- Summary total -->
      <div class="mb-4 flex flex-wrap gap-3">
        {#each kainUsageData as [, usage], i}
          <div
            class="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
          >
            <span
              class="inline-block h-3 w-3 shrink-0 rounded-full"
              style="background-color: {CHART_COLORS[i % CHART_COLORS.length]}"
            ></span>
            <span class="text-xs text-gray-600">{usage.nama}</span>
            <span class="text-xs font-semibold text-gray-800">
              {usage.total.toLocaleString("id-ID")}
              <span class="font-normal text-gray-400">{usage.satuan}</span>
            </span>
          </div>
        {/each}
      </div>

      <!-- Chart -->
      <div
        class="w-full"
        style="height: {Math.max(160, kainUsageData.length * 48)}px"
      >
        <canvas bind:this={chartCanvas}></canvas>
      </div>

      <!-- Model breakdown per kain -->
      {#if kainUsageData.some(([, v]) => v.models.length > 0)}
        <div class="mt-5">
          <p class="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">
            Model pengguna per jenis kain
          </p>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {#each kainUsageData as [kainId, usage], i}
              <div
                class="rounded-xl border border-gray-100 p-4"
                style="border-left: 3px solid {CHART_COLORS[
                  i % CHART_COLORS.length
                ]}"
              >
                <p class="mb-2 text-sm font-semibold text-gray-800">
                  {usage.nama}
                  <span class="ml-1 text-xs font-normal text-gray-400"
                    >({usage.satuan})</span
                  >
                </p>
                {#if usage.models.length === 0}
                  <p class="text-xs text-gray-400">Tidak ada data model</p>
                {:else}
                  <div class="space-y-1.5">
                    {#each usage.models.slice(0, 5) as model}
                      {@const pct = Math.round((model.total / usage.total) * 100)}
                      <div>
                        <div class="mb-0.5 flex items-center justify-between">
                          <span
                            class="max-w-[70%] truncate text-xs text-gray-600"
                            title={model.nama}>{model.nama}</span
                          >
                          <span class="text-xs font-medium text-gray-700">
                            {model.total.toLocaleString("id-ID")}
                            <span class="font-normal text-gray-400"
                              >{usage.satuan}</span
                            >
                          </span>
                        </div>
                        <div
                          class="h-1.5 w-full overflow-hidden rounded-full bg-gray-100"
                        >
                          <div
                            class="h-full rounded-full"
                            style="width: {pct}%; background-color: {CHART_COLORS[
                              i % CHART_COLORS.length
                            ]}"
                          ></div>
                        </div>
                      </div>
                    {/each}
                    {#if usage.models.length > 5}
                      <p class="text-xs text-gray-400">
                        +{usage.models.length - 5} model lainnya
                      </p>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- ── Filter & Sort Bar ──────────────────────────────────────── -->
<div class="mb-4 flex flex-wrap items-center gap-3">
  <div class="relative min-w-48 flex-1">
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
      placeholder="Cari nama kain..."
      bind:value={searchQuery}
      class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
    />
  </div>

  <div class="flex items-center gap-1.5">
    <span class="text-xs text-gray-500">Urutkan:</span>
    {#each [["tersedia_asc", "Kritis Dulu"], ["tersedia_desc", "Terbanyak"], ["nama", "A–Z"]] as const as [val, lbl]}
      <Button
        size="sm"
        variant={sortBy === val ? "default" : "outline"}
        onclick={() => (sortBy = val)}
      >
        {lbl}
      </Button>
    {/each}
  </div>

  <Button
    variant="outline"
    size="sm"
    onclick={() => load(true)}
    class="ml-auto"
  >
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
</div>

<!-- ── Table ──────────────────────────────────────────────────── -->
<div
  class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
>
  {#if loading}
    <div class="space-y-0">
      {#each Array(5) as _}
        <div class="flex items-center gap-4 border-b border-gray-50 px-5 py-4">
          <div class="h-4 w-40 animate-pulse rounded bg-gray-100"></div>
          <div class="ml-auto h-4 w-20 animate-pulse rounded bg-gray-100"></div>
          <div class="h-4 w-20 animate-pulse rounded bg-gray-100"></div>
          <div class="h-6 w-16 animate-pulse rounded-full bg-gray-100"></div>
        </div>
      {/each}
    </div>
  {:else if filteredList.length === 0}
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
            d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3"
          />
        </svg>
      </div>
      {#if searchQuery}
        <p class="text-sm font-medium text-gray-500">
          Kain "{searchQuery}" tidak ditemukan
        </p>
        <Button variant="link" size="sm" onclick={() => (searchQuery = "")}>
          Hapus filter
        </Button>
      {:else}
        <p class="text-sm font-medium text-gray-500">
          Belum ada data stok kain
        </p>
        <p class="text-xs text-gray-400">
          Mulai dengan menambahkan jenis kain pertama
        </p>
        <Button onclick={bukaTambah} class="mt-1">+ Tambah Kain</Button>
      {/if}
    </div>
  {:else}
    <Table.Root>
      <Table.Header>
        <Table.Row class="bg-gray-50 hover:bg-gray-50">
          <Table.Head>Nama Kain</Table.Head>
          <Table.Head>Warna</Table.Head>
          <Table.Head class="text-right">Tersedia</Table.Head>
          <Table.Head class="text-center">Status</Table.Head>
          <Table.Head>Catatan</Table.Head>
          <Table.Head></Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each filteredList as kain}
          {@const st = statusKain(kain.stok_tersedia)}
          <Table.Row>
            <Table.Cell>
              <p class="text-sm font-medium text-gray-800">{kain.nama_kain}</p>
            </Table.Cell>

            <Table.Cell>
              {#if kain.nama_warna}
                <span
                  class="inline-flex items-center gap-2 rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700"
                >
                  {#if kain.kode_hex_warna}
                    <span
                      class="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-gray-200"
                      style="background-color: {kain.kode_hex_warna}"
                    ></span>
                  {/if}
                  {kain.nama_warna}
                </span>
              {:else}
                <span class="text-xs text-gray-400">Tanpa warna</span>
              {/if}
            </Table.Cell>

            <Table.Cell class="text-right">
              <p
                class="text-sm font-semibold tabular-nums {kain.stok_tersedia <
                100
                  ? 'text-red-600'
                  : 'text-gray-800'}"
              >
                {kain.stok_tersedia.toLocaleString("id-ID")}
              </p>
              <p class="text-xs text-gray-400">{kain.satuan}</p>
            </Table.Cell>

            <Table.Cell class="text-center">
              <span
                class="inline-block rounded-full px-2.5 py-1 text-xs font-semibold {st.cls}"
              >
                {st.label}
              </span>
            </Table.Cell>

            <Table.Cell class="max-w-45">
              <p class="truncate text-xs text-gray-500">
                {kain.catatan ?? "—"}
              </p>
            </Table.Cell>

            <Table.Cell class="text-right">
              <div class="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => bukaEdit(kain)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
                    />
                  </svg>
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => bukaKurangi(kain)}
                  class="border-orange-200 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="2.5"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M5 12h14"
                    />
                  </svg>
                  Kurangi
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => bukaRestock(kain)}
                >
                  <svg
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
                  Restock
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => bukaRiwayat(kain)}
                  class="border-gray-200 text-gray-500 hover:text-gray-700"
                  title="Lihat riwayat"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                  Riwayat
                </Button>
              </div>
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>

    <div
      class="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-3"
    >
      <p class="text-xs text-gray-400">
        Menampilkan {filteredList.length} dari {totalJenis} jenis kain
      </p>
      <div class="flex flex-wrap gap-3 text-xs text-gray-400">
        {#if totalYard > 0}
          <span
            >Yard: <span class="font-semibold text-gray-700"
              >{totalYard.toLocaleString("id-ID")}</span
            ></span
          >
        {/if}
        {#if totalKg > 0}
          <span
            >Kg: <span class="font-semibold text-gray-700"
              >{totalKg.toLocaleString("id-ID")}</span
            ></span
          >
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- ── Dialog: Tambah Kain ──────────────────────────────────────── -->
<Dialog.Root bind:open={openTambah}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Tambah Kain Baru</Dialog.Title>
      <Dialog.Description>
        Daftarkan jenis kain baru ke inventaris gudang.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="nama-kain"
        >
          Nama Kain <span class="text-red-500">*</span>
        </label>
        <input
          id="nama-kain"
          type="text"
          placeholder="Contoh: Katun Premium, Wolfis, Jersey..."
          bind:value={fNama}
          class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        />
      </div>

      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="warna-kain"
        >
          Warna
          <span class="text-xs font-normal text-gray-400"
            >(opsional, ambil dari master warna)</span
          >
        </label>
        <Select.Root
          type="single"
          value={fWarnaId || undefined}
          onValueChange={(val) =>
            (fWarnaId = val === "__none__" ? "" : (val ?? ""))}
        >
          <Select.Trigger class="w-full" id="warna-kain">
            {#if fWarnaId && getSelectedWarna(fWarnaId)}
              {@const warna = getSelectedWarna(fWarnaId)!}
              <span class="flex items-center gap-2">
                <span
                  class="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-gray-200"
                  style="background-color: {warna.kode_hex}"
                ></span>
                {warna.nama_warna}
              </span>
            {:else}
              <span class="text-muted-foreground">-- Pilih warna --</span>
            {/if}
          </Select.Trigger>
          <Select.Content preventScroll={false}>
            <Select.Item value="__none__">-- Tanpa warna --</Select.Item>
            {#each warnaList as warna}
              <Select.Item value={warna.id}>
                <span class="flex items-center gap-2">
                  <span
                    class="inline-block h-3 w-3 shrink-0 rounded-full border border-gray-200"
                    style="background-color: {warna.kode_hex}"
                  ></span>
                  {warna.nama_warna}
                </span>
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        {#if warnaList.length === 0}
          <p class="mt-1 text-xs text-gray-400">
            Belum ada warna terdaftar. <a
              href="/warna"
              class="text-blue-500 hover:underline">Tambah warna -></a
            >
          </p>
        {/if}
      </div>

      <div>
        <p class="mb-1.5 text-sm font-medium text-gray-700">
          Satuan <span class="text-red-500">*</span>
        </p>
        <div class="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={fSatuan === "yard" ? "default" : "outline"}
            onclick={() => (fSatuan = "yard")}
            class="flex-1"
          >
            Yard
          </Button>
          <Button
            type="button"
            size="sm"
            variant={fSatuan === "kg" ? "default" : "outline"}
            onclick={() => (fSatuan = "kg")}
            class="flex-1"
          >
            Kilogram (kg)
          </Button>
        </div>
      </div>

      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="stok-awal"
        >
          Stok Awal ({fSatuan}) <span class="text-red-500">*</span>
        </label>
        <input
          id="stok-awal"
          type="number"
          min="1"
          placeholder="0"
          bind:value={fStok}
          class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        />
      </div>

      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="catatan-tambah"
        >
          Catatan
          <span class="text-xs font-normal text-gray-400">(opsional)</span>
        </label>
        <textarea
          id="catatan-tambah"
          rows="3"
          placeholder="Catatan tambahan tentang kain ini..."
          bind:value={fCatatan}
          class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        ></textarea>
      </div>
    </div>

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openTambah = false)}>
        Batal
      </Button>
      <Button
        onclick={submitTambah}
        disabled={saving || !fNama.trim() || fStok === "" || Number(fStok) <= 0}
      >
        {#if saving}
          <svg
            class="animate-spin"
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
          Menyimpan...
        {:else}
          Simpan Kain
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- ── Dialog: Restock ───────────────────────────────────────────── -->
<Dialog.Root bind:open={openRestock}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Restock Kain</Dialog.Title>
      <Dialog.Description>
        Tambah stok kain yang sudah terdaftar.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      {#if selectedKain}
        <div class="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p class="text-xs font-medium uppercase tracking-wider text-gray-500">
            Kain yang di-restock
          </p>
          <p class="mt-1 text-base font-semibold text-gray-800">
            {selectedKain.nama_kain}
          </p>
          {#if selectedKain.nama_warna}
            <div
              class="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700"
            >
              {#if selectedKain.kode_hex_warna}
                <span
                  class="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-gray-200"
                  style="background-color: {selectedKain.kode_hex_warna}"
                ></span>
              {/if}
              {selectedKain.nama_warna}
            </div>
          {/if}
          <div class="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <span
              >Saat ini: <strong class="text-gray-700"
                >{selectedKain.stok_tersedia.toLocaleString("id-ID")}
                {selectedKain.satuan}</strong
              ></span
            >
          </div>
          <span
            class="mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold {statusKain(
              selectedKain.stok_tersedia,
            ).cls}"
          >
            {statusKain(selectedKain.stok_tersedia).label}
          </span>
        </div>
      {/if}

      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="restock-jumlah"
        >
          Tambah Stok ({selectedKain?.satuan ?? "unit"})
          <span class="text-red-500">*</span>
        </label>
        <input
          id="restock-jumlah"
          type="number"
          min="1"
          placeholder="0"
          bind:value={rJumlah}
          class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        />
        {#if selectedKain && rJumlah !== "" && Number(rJumlah) > 0}
          <p class="mt-1.5 text-xs text-green-600">
            Stok setelah restock: <strong
              >{(selectedKain.stok_tersedia + Number(rJumlah)).toLocaleString(
                "id-ID",
              )}
              {selectedKain.satuan}</strong
            >
          </p>
        {/if}
      </div>

      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="catatan-restock"
        >
          Catatan
          <span class="text-xs font-normal text-gray-400">(opsional)</span>
        </label>
        <textarea
          id="catatan-restock"
          rows="2"
          placeholder="Contoh: Pembelian dari supplier X..."
          bind:value={rCatatan}
          class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        ></textarea>
      </div>

      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="restock-tanggal"
        >
          Tanggal Beli
        </label>
        <input
          id="restock-tanggal"
          type="date"
          bind:value={rTanggalBeli}
          class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none"
        />
      </div>

      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="restock-supplier"
        >
          Supplier
          <span class="text-xs font-normal text-gray-400">(opsional)</span>
        </label>
        <input
          id="restock-supplier"
          type="text"
          placeholder="Nama supplier / vendor"
          bind:value={rSupplier}
          class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        />
      </div>

      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="restock-harga"
        >
          Harga per {selectedKain?.satuan ?? "unit"}
          <span class="text-xs font-normal text-gray-400">(opsional)</span>
        </label>
        <input
          id="restock-harga"
          type="number"
          min="0"
          placeholder="0"
          bind:value={rHargaPerUnit}
          class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        />
      </div>
    </div>

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openRestock = false)}>
        Batal
      </Button>
      <Button
        onclick={submitRestock}
        disabled={saving || rJumlah === "" || Number(rJumlah) <= 0}
      >
        {saving ? "Menyimpan..." : "Restock Sekarang"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- ── Dialog: Kurangi Stok ─────────────────────────────────────── -->
<Dialog.Root bind:open={openKurangi}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Kurangi Stok</Dialog.Title>
      <Dialog.Description>
        Koreksi stok kain jika ada kesalahan input atau pengurangan fisik.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      {#if kurangiKain}
        <div class="rounded-xl border border-orange-100 bg-orange-50 p-4">
          <p
            class="text-xs font-medium uppercase tracking-wider text-orange-500"
          >
            Kain yang dikurangi
          </p>
          <p class="mt-1 text-base font-semibold text-gray-800">
            {kurangiKain.nama_kain}
          </p>
          {#if kurangiKain.nama_warna}
            <div
              class="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700"
            >
              {#if kurangiKain.kode_hex_warna}
                <span
                  class="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-gray-200"
                  style="background-color: {kurangiKain.kode_hex_warna}"
                ></span>
              {/if}
              {kurangiKain.nama_warna}
            </div>
          {/if}
          <div class="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <span>
              Stok saat ini:
              <strong class="text-gray-700">
                {kurangiKain.stok_tersedia.toLocaleString("id-ID")}
                {kurangiKain.satuan}
              </strong>
            </span>
          </div>
        </div>
      {/if}

      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="kurangi-jumlah"
        >
          Jumlah yang Dikurangi ({kurangiKain?.satuan ?? "unit"})
          <span class="text-red-500">*</span>
        </label>
        <input
          id="kurangi-jumlah"
          type="number"
          min="1"
          max={kurangiKain?.stok_tersedia ?? undefined}
          placeholder="0"
          bind:value={kJumlah}
          class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        />
        {#if kurangiKain && kJumlah !== "" && Number(kJumlah) > 0}
          {#if Number(kJumlah) > kurangiKain.stok_tersedia}
            <p class="mt-1.5 text-xs text-red-500">
              Melebihi stok tersedia ({kurangiKain.stok_tersedia}
              {kurangiKain.satuan})
            </p>
          {:else}
            <p class="mt-1.5 text-xs text-orange-600">
              Stok setelah dikurangi:
              <strong>
                {(kurangiKain.stok_tersedia - Number(kJumlah)).toLocaleString(
                  "id-ID",
                )}
                {kurangiKain.satuan}
              </strong>
            </p>
          {/if}
        {/if}
      </div>

      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="catatan-kurangi"
        >
          Alasan / Catatan
          <span class="text-xs font-normal text-gray-400">(opsional)</span>
        </label>
        <textarea
          id="catatan-kurangi"
          rows="3"
          placeholder="Contoh: Koreksi input salah, kain rusak/hilang..."
          bind:value={kCatatan}
          class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        ></textarea>
      </div>
    </div>

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openKurangi = false)}>
        Batal
      </Button>
      <Button
        onclick={submitKurangi}
        disabled={saving ||
          kJumlah === "" ||
          Number(kJumlah) <= 0 ||
          (kurangiKain != null && Number(kJumlah) > kurangiKain.stok_tersedia)}
        class="bg-orange-500 hover:bg-orange-600"
      >
        {saving ? "Menyimpan..." : "Kurangi Stok"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- ── Dialog: Edit Kain ─────────────────────────────────────────── -->
<Dialog.Root bind:open={openEdit}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Edit Kain</Dialog.Title>
      <Dialog.Description>
        Ubah nama dan catatan kain. Jumlah stok hanya bisa diubah lewat Restock.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      {#if editingKain}
        <div class="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p class="text-xs font-medium uppercase tracking-wider text-gray-500">
            Stok saat ini
          </p>
          <div class="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <span>
              Tersedia:
              <strong class="text-gray-700">
                {editingKain.stok_tersedia.toLocaleString("id-ID")}
                {editingKain.satuan}
              </strong>
            </span>
          </div>
          <p class="mt-1.5 text-[11px] text-gray-400">
            Satuan: <span class="font-semibold uppercase text-gray-600"
              >{editingKain.satuan}</span
            >
            · Tidak dapat diubah setelah dibuat
          </p>
          <span
            class="mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold {statusKain(
              editingKain.stok_tersedia,
            ).cls}"
          >
            {statusKain(editingKain.stok_tersedia).label}
          </span>
        </div>
      {/if}

      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="edit-nama-kain"
        >
          Nama Kain <span class="text-red-500">*</span>
        </label>
        <input
          id="edit-nama-kain"
          type="text"
          bind:value={eNama}
          placeholder="Nama kain..."
          class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        />
      </div>

      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="edit-warna-kain"
        >
          Warna
          <span class="text-xs font-normal text-gray-400">(opsional)</span>
        </label>
        <Select.Root
          type="single"
          value={eWarnaId || undefined}
          onValueChange={(val) =>
            (eWarnaId = val === "__none__" ? "" : (val ?? ""))}
        >
          <Select.Trigger class="w-full" id="edit-warna-kain">
            {#if eWarnaId && getSelectedWarna(eWarnaId)}
              {@const warna = getSelectedWarna(eWarnaId)!}
              <span class="flex items-center gap-2">
                <span
                  class="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-gray-200"
                  style="background-color: {warna.kode_hex}"
                ></span>
                {warna.nama_warna}
              </span>
            {:else}
              <span class="text-muted-foreground">-- Pilih warna --</span>
            {/if}
          </Select.Trigger>
          <Select.Content preventScroll={false}>
            <Select.Item value="__none__">-- Tanpa warna --</Select.Item>
            {#each warnaList as warna}
              <Select.Item value={warna.id}>
                <span class="flex items-center gap-2">
                  <span
                    class="inline-block h-3 w-3 shrink-0 rounded-full border border-gray-200"
                    style="background-color: {warna.kode_hex}"
                  ></span>
                  {warna.nama_warna}
                </span>
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="edit-catatan"
        >
          Catatan
          <span class="text-xs font-normal text-gray-400">(opsional)</span>
        </label>
        <textarea
          id="edit-catatan"
          rows="3"
          bind:value={eCatatan}
          placeholder="Catatan tentang kain ini..."
          class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        ></textarea>
      </div>
    </div>

    <Dialog.Footer class="gap-2">
      {#if eKonfirmasiHapus}
        <p class="mr-auto text-sm text-red-600">Yakin hapus kain ini?</p>
        <Button variant="outline" onclick={() => (eKonfirmasiHapus = false)} disabled={deleting}>
          Batal
        </Button>
        <Button variant="destructive" onclick={submitHapusKain} disabled={deleting}>
          {deleting ? "Menghapus..." : "Ya, Hapus"}
        </Button>
      {:else}
        <Button
          variant="outline"
          class="mr-auto border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
          onclick={() => (eKonfirmasiHapus = true)}
          disabled={saving}
        >
          Hapus Kain
        </Button>
        <Button variant="outline" onclick={() => (openEdit = false)} disabled={saving}>
          Batal
        </Button>
        <Button onclick={submitEdit} disabled={saving || !eNama.trim()}>
          {saving ? "Menyimpan..." : "Simpan Perubahan"}
        </Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- ── Dialog: Riwayat Stok Kain ─────────────────────────────── -->
<Dialog.Root bind:open={openRiwayat}>
  <Dialog.Content class="max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Riwayat Stok</Dialog.Title>
      {#if riwayatKain}
        <Dialog.Description>
          {riwayatKain.nama_kain}{riwayatKain.nama_warna
            ? ` · ${riwayatKain.nama_warna}`
            : ""} — 50 entri terakhir
        </Dialog.Description>
      {/if}
    </Dialog.Header>

    {#if riwayatLoading}
      <div class="flex items-center justify-center py-10">
        <svg
          class="h-5 w-5 animate-spin text-gray-300"
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
      </div>
    {:else if riwayatList.length === 0}
      <div class="flex flex-col items-center justify-center gap-2 py-10">
        <svg
          class="h-10 w-10 text-gray-200"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
        <p class="text-sm text-gray-400">Belum ada riwayat untuk kain ini</p>
      </div>
    {:else}
      <div class="max-h-[60vh] overflow-y-auto">
        <div class="space-y-2 py-1 pr-1">
          {#each riwayatList as item}
            {@const isRestock = item.tipe === "restock"}
            {@const isProduksi = item.tipe === "pemakaian_produksi"}
            <div
              class="flex items-start gap-3 rounded-xl border border-gray-100 p-3"
            >
              <!-- Icon -->
              <div
                class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full {isRestock
                  ? 'bg-green-100'
                  : isProduksi
                    ? 'bg-blue-100'
                    : 'bg-orange-100'}"
              >
                {#if isRestock}
                  <svg
                    class="h-4 w-4 text-green-600"
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
                {:else if isProduksi}
                  <svg
                    class="h-4 w-4 text-blue-600"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M7.848 8.25l1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3Zm1.536.887a2.165 2.165 0 0 1 1.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 1 1-5.196 3 3 3 0 0 1 5.196-3Zm1.536-.887a2.165 2.165 0 0 1 1.083-1.838c.5-.243.98-.54 1.433-.885M9.384 14.863l7.229-4.173M14.352 8.25l1.536.887M14.352 8.25a3 3 0 1 1 5.196-3 3 3 0 0 1-5.196 3Zm1.536.887a2.165 2.165 0 0 0-1.083 1.839c-.005.351-.054.695-.14 1.024m1.223-2.863 2.077 1.199m0 3.328-2.077 1.2m0 0-1.536.887M19.464 15.75l-1.536-.887m0 0a2.165 2.165 0 0 0-1.083-1.838 8.92 8.92 0 0 1-1.433-.885M16.615 14.863l-7.229-4.173"
                    />
                  </svg>
                {:else}
                  <svg
                    class="h-4 w-4 text-orange-600"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="2.5"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M5 12h14"
                    />
                  </svg>
                {/if}
              </div>

              <!-- Content -->
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <span
                    class="text-xs font-semibold {isRestock
                      ? 'text-green-700'
                      : isProduksi
                        ? 'text-blue-700'
                        : 'text-orange-700'}"
                  >
                    {isRestock
                      ? "Restock"
                      : isProduksi
                        ? "Pemakaian Produksi"
                        : "Pengurangan Manual"}
                  </span>
                  <span
                    class="shrink-0 text-sm font-bold tabular-nums {isRestock
                      ? 'text-green-600'
                      : 'text-red-600'}"
                  >
                    {isRestock ? "+" : "−"}{item.jumlah.toLocaleString("id-ID")}
                    <span class="text-xs font-normal text-gray-400"
                      >{riwayatKain?.satuan}</span
                    >
                  </span>
                </div>

                {#if item.catatan}
                  <p class="mt-0.5 text-xs text-gray-600">{item.catatan}</p>
                {/if}

                <div class="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                  <span
                    >{item.stok_sebelum.toLocaleString("id-ID")} →
                    <span
                      class="font-medium {item.stok_sesudah > item.stok_sebelum
                        ? 'text-green-600'
                        : 'text-red-500'}"
                      >{item.stok_sesudah.toLocaleString("id-ID")}</span
                    >
                    {riwayatKain?.satuan}</span
                  >
                  <span class="text-gray-300">·</span>
                  <span>{formatTanggal(item.timestamp)}</span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (openRiwayat = false)}>
        Tutup
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
