<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { subscribeBatchAktif } from "$lib/firebase/batch-produksi";
  import { subscribeStokKain } from "$lib/firebase/stok-kain";
  import { getStokBarangJadi } from "$lib/firebase/barang-jadi";
  import type { BatchProduksi, StokKain, StokBarangJadi, StatusBatch } from "$lib/types";
  import { STATUS_LABEL } from "$lib/types";
  import StatCard from "$lib/components/StatCard.svelte";
  import { getPerformaPerDivisi, type PerformaKaryawan, type DivisiKey } from "$lib/firebase/performa";
  import ListIcon from "@lucide/svelte/icons/list";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
  import AlertTriangleIcon from "@lucide/svelte/icons/triangle-alert";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import { type DateRange, filterByRange, getPeriodRange } from "$lib/period";
  import PeriodSelector from "$lib/components/period-selector.svelte";

  // ── Stage config ──────────────────────────────────────────────────
  type StageConf = {
    status: StatusBatch;
    label: string;
    short: string;
    dot: string;
    ring: string;
    textActive: string;
    bgActive: string;
    borderActive: string;
  };

  const STAGES: StageConf[] = [
    {
      status: "PENDING_CUTTING",
      label: "Antri Cutting",
      short: "Antri",
      dot: "bg-slate-400",
      ring: "ring-slate-300",
      textActive: "text-slate-700",
      bgActive: "bg-slate-50",
      borderActive: "border-slate-200",
    },
    {
      status: "CUTTING_IN_PROGRESS",
      label: "Cutting",
      short: "Cutting",
      dot: "bg-orange-500",
      ring: "ring-orange-300",
      textActive: "text-orange-700",
      bgActive: "bg-orange-50",
      borderActive: "border-orange-200",
    },
    {
      status: "CUTTING_DONE",
      label: "Cutting Selesai",
      short: "Cut ✓",
      dot: "bg-yellow-500",
      ring: "ring-yellow-300",
      textActive: "text-yellow-700",
      bgActive: "bg-yellow-50",
      borderActive: "border-yellow-200",
    },
    {
      status: "JAHIT_IN_PROGRESS",
      label: "Jahit",
      short: "Jahit",
      dot: "bg-blue-500",
      ring: "ring-blue-300",
      textActive: "text-blue-700",
      bgActive: "bg-blue-50",
      borderActive: "border-blue-200",
    },
    {
      status: "JAHIT_DONE",
      label: "Jahit Selesai",
      short: "Jahit ✓",
      dot: "bg-teal-500",
      ring: "ring-teal-300",
      textActive: "text-teal-700",
      bgActive: "bg-teal-50",
      borderActive: "border-teal-200",
    },
    {
      status: "STEAM_IN_PROGRESS",
      label: "Steam",
      short: "Steam",
      dot: "bg-purple-500",
      ring: "ring-purple-300",
      textActive: "text-purple-700",
      bgActive: "bg-purple-50",
      borderActive: "border-purple-200",
    },
    {
      status: "STEAM_DONE",
      label: "Steam Selesai",
      short: "Steam ✓",
      dot: "bg-emerald-500",
      ring: "ring-emerald-300",
      textActive: "text-emerald-700",
      bgActive: "bg-emerald-50",
      borderActive: "border-emerald-200",
    },
    {
      status: "COMPLETED",
      label: "Selesai",
      short: "Selesai",
      dot: "bg-green-500",
      ring: "ring-green-300",
      textActive: "text-green-700",
      bgActive: "bg-green-50",
      borderActive: "border-green-200",
    },
  ];

  const STAGE_MAP = Object.fromEntries(
    STAGES.map((s) => [s.status, s]),
  ) as Record<StatusBatch, StageConf>;

  // ── Quick actions ─────────────────────────────────────────────────
  const ACTIONS: {
    title: string;
    desc: string;
    href: string;
    iconBg: string;
    iconColor: string;
    svg: string;
  }[] = [
    {
      title: "Tambah Stok Kain",
      desc: "Catat kain masuk ke gudang",
      href: "/stok-kain",
      iconBg: "bg-gray-100",
      iconColor: "text-gray-600",
      svg: "M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3",
    },
    {
      title: "Model Baju",
      desc: "Kelola katalog model produksi",
      href: "/model-baju",
      iconBg: "bg-gray-100",
      iconColor: "text-gray-600",
      svg: "M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z",
    },
    {
      title: "Barang Jadi",
      desc: "Lihat stok barang siap kirim",
      href: "/barang-jadi",
      iconBg: "bg-gray-100",
      iconColor: "text-gray-600",
      svg: "m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z",
    },
    {
      title: "Catat Barang Keluar",
      desc: "Rekam pengiriman barang jadi",
      href: "/barang-keluar",
      iconBg: "bg-gray-100",
      iconColor: "text-gray-600",
      svg: "M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12",
    },
  ];

  // ── State ──────────────────────────────────────────────────────────
  let batchAktif = $state<BatchProduksi[]>([]);
  let stokKainList = $state<StokKain[]>([]);
  let stokBarangJadi = $state<StokBarangJadi[]>([]);
  let performaByDivisi = $state<Record<DivisiKey, PerformaKaryawan[]>>({
    Cutting: [], Jahit: [], Steam: [], Keluar: [],
  });
  let selectedDivisi = $state<DivisiKey>('Cutting');
  let loadingBatch = $state(true);
  let loadingKain = $state(true);
  let loadingBarangJadi = $state(true);
  let loadingPerforma = $state(true);
  let selectedStage = $state<StatusBatch | null>(null);
  let lastUpdated = $state<Date | null>(null);
  let dateRange = $state<DateRange>(getPeriodRange('bulan_ini'));

  // ── Derived ────────────────────────────────────────────────────────
  let batchPeriod = $derived(
    filterByRange(batchAktif, dateRange, (b) => b.createdAt),
  );

  let kainKritis = $derived(stokKainList.filter((k) => k.stok_tersedia < 100));
  let totalPcsAktif = $derived(batchPeriod.reduce((s, b) => s + b.total_pcs, 0));
  let terlambatPcs = $derived(
    batchPeriod
      .filter((b) => hitungHari(b.createdAt) > 5)
      .reduce((s, b) => s + b.total_pcs, 0),
  );
  let totalPcsBarangJadi = $derived(
    stokBarangJadi.reduce((s, b) => s + b.stok_tersedia, 0),
  );
  let modelBarangJadiCount = $derived(
    new Set(stokBarangJadi.filter((b) => b.stok_tersedia > 0).map((b) => b.model_id)).size,
  );
  let terlambatCount = $derived(
    batchPeriod.filter((b) => hitungHari(b.createdAt) > 5).length,
  );

  let filteredBatch = $derived.by(() => {
    let list = batchPeriod;
    if (selectedStage) list = list.filter((b) => b.status === selectedStage);
    return [...list].sort(
      (a, b) => hitungHari(b.createdAt) - hitungHari(a.createdAt),
    );
  });

  // ── Helpers ────────────────────────────────────────────────────────
  function countStatus(status: StatusBatch): number {
    return batchPeriod.filter((b) => b.status === status).length;
  }

  function pcsStatus(status: StatusBatch): number {
    return batchPeriod
      .filter((b) => b.status === status)
      .reduce((s, b) => s + b.total_pcs, 0);
  }

  function hitungHari(createdAt: any): number {
    if (!createdAt) return 0;
    const d = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  }

  function stageOf(status: StatusBatch): StageConf {
    return STAGE_MAP[status];
  }

  function persenStok(kain: StokKain): number {
    const total = kain.stok_tersedia + kain.stok_terpakai;
    return total > 0 ? Math.min((kain.stok_tersedia / total) * 100, 100) : 0;
  }

  function formatLastUpdated(d: Date): string {
    return d.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  const TODAY_STR = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // ── Lifecycle ─────────────────────────────────────────────────────
  let unsubBatch: (() => void) | undefined;
  let unsubKain: (() => void) | undefined;

  function reloadPerforma() {
    loadingPerforma = true;
    getPerformaPerDivisi()
      .then((data) => { performaByDivisi = data; })
      .finally(() => { loadingPerforma = false; });
  }

  const DIVISI_TABS: { key: DivisiKey; label: string; dot: string; tabActive: string; tabInactive: string; badgeBg: string }[] = [
    { key: 'Cutting', label: 'Cutting',  dot: 'bg-gray-500', tabActive: 'border-gray-900 text-gray-900', tabInactive: 'border-transparent text-gray-500 hover:text-gray-700', badgeBg: 'bg-gray-100 text-gray-600' },
    { key: 'Jahit',   label: 'Jahit',    dot: 'bg-gray-500', tabActive: 'border-gray-900 text-gray-900', tabInactive: 'border-transparent text-gray-500 hover:text-gray-700', badgeBg: 'bg-gray-100 text-gray-600' },
    { key: 'Steam',   label: 'Steam',    dot: 'bg-gray-500', tabActive: 'border-gray-900 text-gray-900', tabInactive: 'border-transparent text-gray-500 hover:text-gray-700', badgeBg: 'bg-gray-100 text-gray-600' },
  ];

  onMount(() => {
    unsubBatch = subscribeBatchAktif((data) => {
      batchAktif = data;
      loadingBatch = false;
      lastUpdated = new Date();
    });
    unsubKain = subscribeStokKain((data) => {
      stokKainList = data;
      loadingKain = false;
    });
    getStokBarangJadi().then((data) => {
      stokBarangJadi = data;
      loadingBarangJadi = false;
    });
    reloadPerforma();
  });

  onDestroy(() => {
    unsubBatch?.();
    unsubKain?.();
  });
</script>

<!-- ── Header ─────────────────────────────────────────────────────── -->
<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Dashboard Gudang</h1>
    <p class="mt-0.5 text-sm text-gray-500">{TODAY_STR}</p>
  </div>
  <div class="flex items-center gap-2">
    <PeriodSelector bind:dateRange defaultPeriod="bulan_ini" />
  </div>
</div>

<!-- ── Alert Banners ───────────────────────────────────────────────── -->
{#if !loadingKain && kainKritis.length > 0}
  <div
    class="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
  >
    <svg
      class="mt-0.5 h-5 w-5 shrink-0 text-amber-500"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fill-rule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clip-rule="evenodd"
      />
    </svg>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold text-amber-800">
        Stok Kain Perlu Segera Diisi Ulang
      </p>
      <p class="mt-0.5 text-xs text-amber-700">
        {kainKritis
          .map((k) => `${k.nama_kain} (${k.stok_tersedia} ${k.satuan})`)
          .join(" · ")}
      </p>
    </div>
    <a
      href="/stok-kain"
      class="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700"
    >
      Restock →
    </a>
  </div>
{/if}

{#if !loadingBatch && terlambatCount > 0}
  <div
    class="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
  >
    <svg
      class="mt-0.5 h-5 w-5 shrink-0 text-red-500"
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
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold text-red-800">
        Ada Batch Melebihi 5 Hari
      </p>
      <p class="mt-0.5 text-xs text-red-700">
        {terlambatCount} batch berjalan lebih dari 5 hari. Segera periksa progres
        produksi.
      </p>
    </div>
    <a
      href="/monitor-produksi"
      class="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
    >
      Cek Produksi →
    </a>
  </div>
{/if}

<!-- ── KPI Cards ──────────────────────────────────────────────────── -->
<div class="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
  <!-- Batch Aktif -->
  <StatCard
    title="Batch Aktif"
    value={batchPeriod.length}
    icon={ListIcon}
    iconBg="bg-orange-50"
    iconColor="text-orange-500"
    loading={loadingBatch}
    footerText="{totalPcsAktif.toLocaleString('id-ID')} pcs diproduksi"
    footerTextClass="text-gray-500"
    footerSubtext="Periode ini"
  />

  <!-- Terlambat -->
  <StatCard
    title="Terlambat"
    value={terlambatCount}
    icon={ClockIcon}
    iconBg={terlambatCount > 0 ? "bg-red-100" : "bg-gray-100"}
    iconColor={terlambatCount > 0 ? "text-red-600" : "text-gray-400"}
    loading={loadingBatch}
    class={terlambatCount > 0 ? "border-red-200 !bg-red-50" : ""}
    titleClass={terlambatCount > 0 ? "text-red-600" : ""}
    valueClass={terlambatCount > 0 ? "text-red-700" : ""}
    footerText={terlambatCount > 0
      ? `${terlambatPcs.toLocaleString('id-ID')} pcs terhambat`
      : "Semua dalam jadwal"}
    footerTextClass={terlambatCount > 0 ? "text-red-600" : "text-gray-400"}
    footerSubtext={terlambatCount > 0 ? "Lebih dari 5 hari berjalan" : ""}
    footerSubtextClass="text-red-400"
    footerLink={terlambatCount > 0 ? "/monitor-produksi" : undefined}
  />

  <!-- Siap Kirim (dari stok barang jadi) -->
  <StatCard
    title="Siap Kirim"
    value="{totalPcsBarangJadi.toLocaleString('id-ID')} pcs"
    icon={CheckCircleIcon}
    iconBg={totalPcsBarangJadi > 0 ? "bg-emerald-100" : "bg-gray-100"}
    iconColor={totalPcsBarangJadi > 0 ? "text-emerald-600" : "text-gray-400"}
    loading={loadingBarangJadi}
    class={totalPcsBarangJadi > 0 ? "border-emerald-200 !bg-emerald-50" : ""}
    titleClass={totalPcsBarangJadi > 0 ? "text-emerald-600" : "text-gray-400"}
    valueClass={totalPcsBarangJadi > 0 ? "text-emerald-700" : "text-gray-900"}
    footerText={totalPcsBarangJadi > 0 ? "Catat pengiriman" : "Stok barang jadi kosong"}
    footerLink={totalPcsBarangJadi > 0 ? "/barang-keluar" : undefined}
    footerTextClass={totalPcsBarangJadi > 0 ? "text-emerald-700" : "text-gray-400"}
    footerSubtext="{modelBarangJadiCount} model tersedia"
    footerSubtextClass={totalPcsBarangJadi > 0 ? "text-emerald-600" : "text-gray-400"}
  />

  <!-- Kain Kritis -->
  <StatCard
    title="Kain Kritis"
    value={kainKritis.length}
    icon={AlertTriangleIcon}
    iconBg={kainKritis.length > 0 ? "bg-amber-100" : "bg-gray-100"}
    iconColor={kainKritis.length > 0 ? "text-amber-600" : "text-gray-400"}
    loading={loadingKain}
    class={kainKritis.length > 0 ? "border-amber-200 !bg-amber-50" : ""}
    titleClass={kainKritis.length > 0 ? "text-amber-600" : "text-gray-400"}
    valueClass={kainKritis.length > 0 ? "text-amber-700" : "text-gray-900"}
    footerSubtext={kainKritis.length > 0
      ? kainKritis.map((k) => k.nama_kain).join(", ")
      : "Semua stok kain aman"}
    footerSubtextClass={kainKritis.length > 0
      ? "text-amber-600"
      : "text-gray-500"}
    footerText={kainKritis.length > 0
      ? "Restock sekarang"
      : `${stokKainList.length} jenis kain tersedia`}
    footerLink={kainKritis.length > 0 ? "/stok-kain" : undefined}
    footerTextClass={kainKritis.length > 0 ? "text-amber-700" : "text-gray-400"}
  />
</div>

<!-- ── Pipeline Produksi ───────────────────────────────────────────── -->
<div class="mb-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
  <div class="mb-4 flex items-center justify-between">
    <div>
      <h2 class="text-sm font-semibold text-gray-800">Pipeline Produksi</h2>
      <p class="text-xs text-gray-400">
        Klik tahap untuk filter batch ·
        {#if loadingBatch}
          <span
            class="inline-block h-3 w-8 animate-pulse rounded bg-gray-100 align-middle"
          ></span>
        {:else}
          {batchPeriod.length} batch aktif
        {/if}
      </p>
    </div>
    {#if selectedStage}
      <button
        onclick={() => (selectedStage = null)}
        class="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
      >
        <svg
          class="h-3 w-3"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2.5"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M6 18 18 6M6 6l12 12"
          />
        </svg>
        Reset filter
      </button>
    {/if}
  </div>

  <!-- Stage tiles -->
  <div class="grid grid-cols-4 gap-2 lg:grid-cols-8">
    {#each STAGES as stage}
      {@const count = countStatus(stage.status)}
      {@const pcs = pcsStatus(stage.status)}
      {@const active = count > 0}
      {@const sel = selectedStage === stage.status}

      <button
        onclick={() => {
          if (active) selectedStage = sel ? null : stage.status;
        }}
        disabled={loadingBatch}
        class="flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition
          {sel
          ? `${stage.bgActive} ${stage.borderActive} ring-2 ${stage.ring} ring-offset-1`
          : active
            ? `${stage.bgActive} ${stage.borderActive} cursor-pointer hover:shadow-sm`
            : 'cursor-default border-gray-100 bg-gray-50 opacity-30'}"
      >
        {#if loadingBatch}
          <div class="h-8 w-8 animate-pulse rounded-full bg-gray-200"></div>
          <div class="h-2.5 w-10 animate-pulse rounded bg-gray-200"></div>
        {:else}
          <span
            class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white
            {active ? stage.dot : 'bg-gray-300'}"
          >
            {count}
          </span>
          <span
            class="text-[11px] font-medium leading-tight {active
              ? stage.textActive
              : 'text-gray-400'}"
          >
            {stage.short}
          </span>
          {#if active}
            <span class="text-[10px] opacity-70 {stage.textActive}"
              >{pcs} pcs</span
            >
          {/if}
        {/if}
      </button>
    {/each}
  </div>

  <div class="my-4 border-t border-gray-100"></div>

  <!-- Batch list -->
  <div>
    <p class="mb-2.5 text-xs font-medium text-gray-500">
      {selectedStage ? STATUS_LABEL[selectedStage] : "Semua Batch Aktif"}
      {#if !loadingBatch}
        <span class="ml-1 text-gray-400">· {filteredBatch.length} batch</span>
      {/if}
    </p>

    {#if loadingBatch}
      <div class="space-y-1.5">
        {#each Array(4) as _}
          <div
            class="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
          >
            <div class="h-2 w-2 rounded-full bg-gray-200"></div>
            <div class="h-3.5 w-40 animate-pulse rounded bg-gray-200"></div>
            <div
              class="ml-auto h-3.5 w-12 animate-pulse rounded bg-gray-200"
            ></div>
            <div class="h-5 w-16 animate-pulse rounded-full bg-gray-200"></div>
          </div>
        {/each}
      </div>
    {:else if filteredBatch.length === 0}
      <div class="flex flex-col items-center gap-2 py-8">
        <svg
          class="h-8 w-8 text-gray-200"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"
          />
        </svg>
        <p class="text-sm text-gray-400">
          {selectedStage
            ? "Tidak ada batch pada tahap ini"
            : "Belum ada batch produksi aktif"}
        </p>
        {#if !selectedStage}
          <a
            href="/monitor-produksi"
            class="mt-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Monitor Produksi →
          </a>
        {/if}
      </div>
    {:else}
      <div class="space-y-1.5">
        {#each filteredBatch as batch}
          {@const s = stageOf(batch.status)}
          {@const hari = hitungHari(batch.createdAt)}
          {@const lambat = hari > 5}
          <div
            class="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5"
          >
            <div class="flex min-w-0 items-center gap-3">
              <span class="h-2 w-2 shrink-0 rounded-full {s.dot}"></span>
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-gray-800">
                  {batch.nama_model}
                </p>
                <p class="text-[11px] text-gray-400">
                  {batch.detail_ukuran
                    .map((d) => `${d.ukuran}:${d.jumlah_pcs}`)
                    .join(" · ")}
                </p>
              </div>
            </div>
            <div class="ml-3 flex shrink-0 items-center gap-2.5">
              <span class="text-xs text-gray-400">{batch.total_pcs} pcs</span>
              {#if lambat}
                <span
                  class="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600"
                >
                  {hari}h ⚠
                </span>
              {:else}
                <span class="text-xs text-gray-400">{hari}h</span>
              {/if}
              <span
                class="rounded-full border px-2.5 py-0.5 text-[11px] font-medium {s.bgActive} {s.borderActive} {s.textActive}"
              >
                {s.short}
              </span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- ── Performa Produksi ───────────────────────────────────────────── -->
<div class="mb-4 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
  <!-- Header -->
  <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
    <div class="flex items-center gap-2">
      <TrendingUpIcon class="h-4 w-4 text-gray-400" />
      <h2 class="text-sm font-semibold text-gray-800">Performa Produksi</h2>
      <span class="text-xs text-gray-400">— per bagian</span>
    </div>
    <button
      onclick={reloadPerforma}
      class="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"
    >
      <svg class="h-3 w-3 {loadingPerforma ? 'animate-spin' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
      Refresh
    </button>
  </div>

  <!-- Tab Bagian -->
  <div class="flex gap-0 border-b border-gray-100 px-5">
    {#each DIVISI_TABS as tab}
      {@const count = performaByDivisi[tab.key].length}
      <button
        onclick={() => (selectedDivisi = tab.key)}
        class="flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition
          {selectedDivisi === tab.key ? tab.tabActive : tab.tabInactive}"
      >
        <span class="h-2 w-2 rounded-full {tab.dot}"></span>
        {tab.label}
        {#if !loadingPerforma && count > 0}
          <span class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold {tab.badgeBg}">{count}</span>
        {/if}
      </button>
    {/each}
  </div>

  {#if loadingPerforma}
    <div class="space-y-0">
      {#each Array(4) as _}
        <div class="flex items-center gap-4 border-b border-gray-50 px-5 py-3.5">
          <div class="h-4 w-6 animate-pulse rounded bg-gray-100"></div>
          <div class="h-4 w-32 animate-pulse rounded bg-gray-100"></div>
          <div class="ml-auto h-4 w-16 animate-pulse rounded bg-gray-100"></div>
          <div class="h-4 w-12 animate-pulse rounded bg-gray-100"></div>
          <div class="h-5 w-16 animate-pulse rounded-full bg-gray-100"></div>
        </div>
      {/each}
    </div>
  {:else}
    {@const list = performaByDivisi[selectedDivisi]}
    {#if list.length === 0}
      <div class="flex flex-col items-center gap-2 py-10 text-center">
        <svg class="h-8 w-8 text-gray-200" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
        <p class="text-sm text-gray-400">Belum ada data performa {selectedDivisi}.</p>
        <p class="text-xs text-gray-300">Data muncul setelah ada batch yang selesai di bagian ini.</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 text-xs text-gray-500">
              <th class="px-5 py-2.5 text-left font-medium">#</th>
              <th class="px-4 py-2.5 text-left font-medium">Nama</th>
              <th class="px-4 py-2.5 text-right font-medium">Total PCS</th>
              <th class="px-4 py-2.5 text-right font-medium">PCS Reject</th>
              <th class="px-4 py-2.5 text-center font-medium">Reject Rate</th>
              <th class="px-4 py-2.5 text-center font-medium">Jml Batch</th>
            </tr>
          </thead>
          <tbody>
            {#each list as p, i}
              {@const rejectOk   = p.reject_rate < 5}
              {@const rejectWarn = p.reject_rate >= 5 && p.reject_rate < 10}
              <tr class="border-t border-gray-50 transition-colors hover:bg-gray-50/60">
                <!-- Rank -->
                <td class="px-5 py-3.5">
                  {#if i === 0}
                    <span class="text-base">🥇</span>
                  {:else if i === 1}
                    <span class="text-base">🥈</span>
                  {:else if i === 2}
                    <span class="text-base">🥉</span>
                  {:else}
                    <span class="text-xs text-gray-400">{i + 1}</span>
                  {/if}
                </td>
                <!-- Nama -->
                <td class="px-4 py-3.5">
                  <p class="font-medium text-gray-800">{p.nama}</p>
                </td>
                <!-- Total PCS Berhasil -->
                <td class="px-4 py-3.5 text-right">
                  <span class="font-semibold text-gray-800">{p.total_pcs_berhasil.toLocaleString('id-ID')}</span>
                  <span class="ml-1 text-xs text-gray-400">pcs</span>
                </td>
                <!-- PCS Reject -->
                <td class="px-4 py-3.5 text-right">
                  {#if p.total_pcs_reject > 0}
                    <span class="font-medium text-red-500">{p.total_pcs_reject}</span>
                    <span class="ml-1 text-xs text-gray-400">pcs</span>
                  {:else}
                    <span class="text-gray-300">—</span>
                  {/if}
                </td>
                <!-- Reject Rate -->
                <td class="px-4 py-3.5 text-center">
                  <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold
                    {rejectOk   ? 'bg-green-100 text-green-700' :
                     rejectWarn ? 'bg-yellow-100 text-yellow-700' :
                     'bg-red-100 text-red-600'}">
                    {p.reject_rate}%
                    {rejectOk ? '✓' : rejectWarn ? '!' : '!!'}
                  </span>
                </td>
                <!-- Jumlah Batch -->
                <td class="px-4 py-3.5 text-center text-sm text-gray-600">
                  {p.jumlah_batch}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="flex items-center border-t border-gray-50 bg-gray-50 px-5 py-2.5">
          <p class="text-xs text-gray-400">
            {list.length} karyawan bagian {selectedDivisi} ·
            Reject rate: <span class="text-green-600">{"<"}5% ✓ bagus</span> ·
            <span class="text-yellow-600">5–10% ! perlu perhatian</span> ·
            <span class="text-red-500">{">"}10% !! tinggi</span>
          </p>
        </div>
      </div>
    {/if}
  {/if}
</div>

<!-- ── Bottom Row: Quick Actions + Stok Kain ──────────────────────── -->
<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
  <!-- Quick Actions -->
  <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <h2 class="mb-4 text-sm font-semibold text-gray-800">Aksi Cepat</h2>
    <div class="space-y-0.5">
      {#each ACTIONS as action}
        <a
          href={action.href}
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-gray-50"
        >
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {action.iconBg}"
          >
            <svg
              class="h-4 w-4 {action.iconColor}"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d={action.svg}
              />
            </svg>
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-gray-800">{action.title}</p>
            <p class="text-xs text-gray-400">{action.desc}</p>
          </div>
          <svg
            class="h-4 w-4 shrink-0 text-gray-300"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2.5"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m8.25 4.5 7.5 7.5-7.5 7.5"
            />
          </svg>
        </a>
      {/each}
    </div>
  </div>

  <!-- Stok Kain -->
  <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-gray-800">Stok Kain</h2>
      <a
        href="/stok-kain"
        class="text-xs font-medium text-blue-600 hover:underline"
        >Lihat semua →</a
      >
    </div>

    {#if loadingKain}
      <div class="space-y-3">
        {#each Array(4) as _}
          <div>
            <div class="mb-1.5 flex justify-between">
              <div class="h-3.5 w-28 animate-pulse rounded bg-gray-100"></div>
              <div class="h-3.5 w-16 animate-pulse rounded bg-gray-100"></div>
            </div>
            <div class="h-1.5 w-full rounded-full bg-gray-100"></div>
          </div>
        {/each}
      </div>
    {:else if stokKainList.length === 0}
      <div class="flex flex-col items-center gap-2 py-8">
        <p class="text-sm text-gray-400">Belum ada data stok kain</p>
        <a
          href="/stok-kain"
          class="text-xs font-medium text-blue-600 hover:underline"
          >Tambah kain pertama →</a
        >
      </div>
    {:else}
      <div class="space-y-3">
        {#each stokKainList.slice(0, 7) as kain}
          {@const kritis = kain.stok_tersedia < 100}
          {@const persen = persenStok(kain)}
          <div>
            <div class="mb-1.5 flex items-center justify-between">
              <div class="flex items-center gap-1.5">
                <span
                  class="h-1.5 w-1.5 rounded-full {kritis
                    ? 'bg-amber-400'
                    : 'bg-blue-400'}"
                ></span>
                <span class="text-sm text-gray-700">{kain.nama_kain}</span>
              </div>
              <span
                class="text-xs {kritis
                  ? 'font-semibold text-amber-600'
                  : 'text-gray-500'}"
              >
                {kain.stok_tersedia.toLocaleString("id-ID")} {kain.satuan}{kritis
                  ? " ⚠"
                  : ""}
              </span>
            </div>
            <div class="h-1.5 w-full rounded-full bg-gray-100">
              <div
                class="h-1.5 rounded-full {kritis
                  ? 'bg-amber-400'
                  : 'bg-blue-400'}"
                style="width: {persen.toFixed(1)}%"
              ></div>
            </div>
          </div>
        {/each}
        {#if stokKainList.length > 7}
          <p class="pt-1 text-center text-xs text-gray-400">
            +{stokKainList.length - 7} kain lainnya ·
            <a href="/stok-kain" class="text-blue-500 hover:underline"
              >lihat semua</a
            >
          </p>
        {/if}
      </div>
    {/if}
  </div>
</div>
