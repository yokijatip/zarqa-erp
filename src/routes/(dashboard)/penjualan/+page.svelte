<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { getRiwayatBarangKeluarByPeriod } from "$lib/firebase/barang-jadi";
  import { modelBajuCache } from "$lib/stores/data-cache.svelte";
  import { getPeriodRange, type DateRange } from "$lib/period";
  import PeriodSelector from "$lib/components/period-selector.svelte";
  import StatCard from "$lib/components/StatCard.svelte";
  import { Button } from "$lib/components/ui/button";
  import {
    formatDate,
    productSalesRows,
    rupiah,
    salesItemRows,
    salesListRows,
    tsMillis,
    type SalesItemRow,
    type ProductSalesRow,
    type SalesListRow,
  } from "$lib/sales/penjualan";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import ShoppingBagIcon from "@lucide/svelte/icons/shopping-bag";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import SearchIcon from "@lucide/svelte/icons/search";
  import { Input } from "$lib/components/ui/input";
  import { Chart, registerables } from "chart.js";
  Chart.register(...registerables);

  const CHART_COLORS = ["#16a34a", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#64748b"];

  let loading = $state(true);
  let errorMsg = $state<string | null>(null);
  let dateRange = $state<DateRange>(getPeriodRange("hari_ini"));
  let trendDateRange = $state<DateRange>(getPeriodRange("hari_ini"));
  let popularDateRange = $state<DateRange>(getPeriodRange("hari_ini"));
  let tujuanDateRange = $state<DateRange>(getPeriodRange("hari_ini"));
  let tujuanCompositionDateRange = $state<DateRange>(getPeriodRange("hari_ini"));
  let allRows = $state<SalesListRow[]>([]);
  let allItems = $state<SalesItemRow[]>([]);
  let trendCanvas = $state<HTMLCanvasElement | null>(null);
  let popularCanvas = $state<HTMLCanvasElement | null>(null);
  let trendChart: Chart | null = null;
  let popularChart: Chart | null = null;
  let modelSearch = $state("");

  function inRange(timestamp: any, range: DateRange): boolean {
    if (!range) return true;
    const ms = tsMillis(timestamp);
    return ms >= range.start.getTime() && ms <= range.end.getTime();
  }

  function intersectRanges(parent: DateRange, child: DateRange): DateRange {
    if (!parent) return child;
    if (!child) return parent;
    return {
      start: new Date(Math.max(parent.start.getTime(), child.start.getTime())),
      end: new Date(Math.min(parent.end.getTime(), child.end.getTime())),
    };
  }

  // The main period is the parent scope. A panel can narrow it, but never escape it.
  $effect(() => {
    dateRange;
    trendDateRange = dateRange ? { start: new Date(dateRange.start), end: new Date(dateRange.end) } : null;
    popularDateRange = dateRange ? { start: new Date(dateRange.start), end: new Date(dateRange.end) } : null;
    tujuanDateRange = dateRange ? { start: new Date(dateRange.start), end: new Date(dateRange.end) } : null;
    tujuanCompositionDateRange = dateRange ? { start: new Date(dateRange.start), end: new Date(dateRange.end) } : null;
  });

  let rows = $derived(allRows.filter((row) => inRange(row.tanggal, dateRange)));
  let itemRows = $derived(allItems.filter((item) => inRange(item.tanggal, dateRange)));
  let trendItemRows = $derived(allItems.filter((item) => inRange(item.tanggal, intersectRanges(dateRange, trendDateRange))));
  let popularItemRows = $derived(allItems.filter((item) => inRange(item.tanggal, intersectRanges(dateRange, popularDateRange))));
  let tujuanPanelRows = $derived(allRows.filter((row) => inRange(row.tanggal, intersectRanges(dateRange, tujuanDateRange))));
  let tujuanCompositionRows = $derived(allRows.filter((row) => inRange(row.tanggal, intersectRanges(dateRange, tujuanCompositionDateRange))));
  let products = $derived(productSalesRows(itemRows));
  let popularProducts = $derived(productSalesRows(popularItemRows));

  let totalPenjualan = $derived(rows.reduce((sum, row) => sum + row.nilaiJual, 0));
  let totalOrder = $derived(rows.length);
  let totalPcs = $derived(rows.reduce((sum, row) => sum + row.pcsKeluar, 0));
  let totalPending = $derived(rows.reduce((sum, row) => sum + row.pcsPending, 0));
  function groupTujuan(source: SalesListRow[]) {
    const map = new Map<string, { tujuan: string; total: number; pcs: number; order: number }>();
    for (const row of source) {
      const item = map.get(row.tujuan) ?? { tujuan: row.tujuan, total: 0, pcs: 0, order: 0 };
      item.total += row.nilaiJual;
      item.pcs += row.pcsKeluar;
      item.order += 1;
      map.set(row.tujuan, item);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }
  let tujuanRows = $derived(groupTujuan(tujuanPanelRows));
  let tujuanCompositionData = $derived(groupTujuan(tujuanCompositionRows));
  let maxTujuan = $derived(Math.max(1, ...tujuanRows.map((item) => item.total)));
  let totalTujuanComposition = $derived(tujuanCompositionData.reduce((sum, item) => sum + item.total, 0));
  let trendRows = $derived.by(() => {
    const map = new Map<string, { label: string; total: number; pcs: number; order: number }>();
    for (const item of trendItemRows.filter((row) => row.status !== "pending")) {
      const existing = map.get(item.nama_model) ?? { label: item.nama_model, total: 0, pcs: 0, order: 0 };
      existing.total += item.nilai_jual;
      existing.pcs += item.pcs;
      existing.order += 1;
      map.set(item.nama_model, existing);
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 12);
  });
  let maxTrend = $derived(Math.max(1, ...trendRows.map((item) => item.total)));
  let modelRows = $derived.by(() => {
    const map = new Map<string, { model: string; pcs: number; total: number; laba: number }>();
    for (const item of products) {
      const existing = map.get(item.nama_model) ?? { model: item.nama_model, pcs: 0, total: 0, laba: 0 };
      existing.pcs += item.pcs;
      existing.total += item.nilaiJual;
      existing.laba += item.laba;
      map.set(item.nama_model, existing);
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 8);
  });
  let filteredModelRows = $derived.by(() => {
    const query = modelSearch.trim().toLowerCase();
    return query ? modelRows.filter((item) => item.model.toLowerCase().includes(query)) : modelRows;
  });
  let filteredProducts = $derived.by(() => {
    const query = modelSearch.trim().toLowerCase();
    return query ? popularProducts.filter((item) => item.nama_model.toLowerCase().includes(query)) : popularProducts;
  });
  let popularModelRows = $derived.by(() => {
    const map = new Map<string, { model_id: string; nama_model: string; pcs: number; nilaiJual: number; orderCount: number }>();
    for (const item of filteredProducts) {
      const existing = map.get(item.model_id) ?? { model_id: item.model_id, nama_model: item.nama_model, pcs: 0, nilaiJual: 0, orderCount: 0 };
      existing.pcs += item.pcs;
      existing.nilaiJual += item.nilaiJual;
      existing.orderCount += item.orderCount;
      map.set(item.model_id, existing);
    }
    return [...map.values()].sort((a, b) => b.pcs - a.pcs || b.nilaiJual - a.nilaiJual);
  });
  let maxModel = $derived(Math.max(1, ...modelRows.map((item) => item.total)));
  let avgOrder = $derived(totalOrder > 0 ? totalPenjualan / totalOrder : 0);
  let grossProfit = $derived(rows.reduce((sum, row) => sum + row.laba, 0));
  let grossMargin = $derived(totalPenjualan > 0 ? Math.round((grossProfit / totalPenjualan) * 100) : 0);

  function tujuanPieStyle() {
    if (tujuanCompositionData.length === 0 || totalTujuanComposition <= 0) return "background:#f1f5f9";
    let cursor = 0;
    const segments = tujuanCompositionData.slice(0, 8).map((item, index) => {
      const start = cursor;
      const end = cursor + (item.total / totalTujuanComposition) * 100;
      cursor = end;
      return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${end}%`;
    });
    if (cursor < 100) segments.push(`#e2e8f0 ${cursor}% 100%`);
    return `background:conic-gradient(${segments.join(",")})`;
  }


  async function load() {
    loading = true;
    errorMsg = null;
    try {
      const [keluar, models] = await Promise.all([
        getRiwayatBarangKeluarByPeriod(null),
        modelBajuCache.get(),
      ]);
      allRows = salesListRows(keluar, models);
      allItems = salesItemRows(keluar, models);
    } catch (e: any) {
      errorMsg = e?.message ?? "Gagal memuat penjualan.";
    } finally {
      loading = false;
    }
  }

  onMount(load);
  $effect(() => {
    dateRange;
    load();
  });

  $effect(() => {
    trendRows;
    trendCanvas;
    if (!trendCanvas) return;
    trendChart?.destroy();
    trendChart = new Chart(trendCanvas, {
      type: "line",
      data: {
        labels: trendRows.map((item) => item.label),
        datasets: [{
          label: "Omzet",
          data: trendRows.map((item) => item.total),
          borderColor: "#16a34a",
          backgroundColor: "rgba(22, 163, 74, 0.12)",
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (context) => { const item = trendRows[context.dataIndex]; return `${rupiah(item.total)} · ${item.pcs} pcs · ${item.order} order`; } } },
        },
        scales: { y: { beginAtZero: true, ticks: { callback: (value) => rupiah(Number(value)) } } },
      },
    });
  });

  $effect(() => {
    popularModelRows;
    popularCanvas;
    if (!popularCanvas) return;
    popularChart?.destroy();
    popularChart = new Chart(popularCanvas, {
      type: "doughnut",
      data: {
        labels: popularModelRows.slice(0, 8).map((item) => item.nama_model),
        datasets: [{ data: popularModelRows.slice(0, 8).map((item) => item.pcs), backgroundColor: CHART_COLORS, borderColor: "#fff", borderWidth: 3 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 12 } }, tooltip: { callbacks: { label: (context) => `${context.label}: ${Number(context.raw).toLocaleString("id-ID")} pcs` } } },
      },
    });
  });
</script>

<svelte:head><title>Penjualan - Zarqa ERP</title></svelte:head>

<div class="space-y-6">
  <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
    <div>
      <p class="text-sm text-gray-400">Dashboard Penjualan</p>
      <h1 class="text-2xl font-semibold text-gray-900">Penjualan</h1>
      <p class="text-gray-500">Order, buyer, pending, dan retur dari data barang keluar.</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <PeriodSelector bind:dateRange defaultPeriod="hari_ini" />
      <Button variant="outline" onclick={load}>Refresh</Button>
      <Button onclick={() => goto("/barang-keluar/catat")}>+ Order</Button>
    </div>
  </div>

  {#if errorMsg}
    <div class="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>
  {/if}

  <div class="grid gap-3 md:grid-cols-4">
    <StatCard title="Penjualan" value={rupiah(totalPenjualan)} icon={TrendingUpIcon} {loading} footerSubtext="nilai order keluar" class="border-green-100 bg-green-50" valueClass="text-green-700" />
    <StatCard title="Order" value={String(totalOrder)} icon={ShoppingBagIcon} {loading} footerSubtext={`${totalPcs} pcs terkirim`} />
    <StatCard title="Pending" value={`${totalPending} pcs`} icon={ClockIcon} {loading} footerSubtext="stok belum terpenuhi" class={totalPending > 0 ? "border-amber-100 bg-amber-50" : ""} valueClass={totalPending > 0 ? "text-amber-700" : ""} />
  </div>

  <div class="grid gap-4">
    <section class="rounded-lg border bg-white p-5 shadow-sm">
      <div class="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 class="font-semibold text-gray-900">Tren Penjualan</h2>
          <p class="text-sm text-gray-400">Omzet per model pada periode terpilih. Arahkan kursor untuk detail pcs dan order.</p>
        </div>
        <PeriodSelector bind:dateRange={trendDateRange} defaultPeriod="hari_ini" />
      </div>
      {#if trendRows.length === 0}<div class="flex h-64 items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-400">Belum ada data penjualan pada periode ini.</div>{:else}<div class="h-72 rounded-lg bg-gray-50 p-4"><canvas bind:this={trendCanvas} aria-label="Chart penjualan per model"></canvas></div>{/if}
    </section>

    <section class="hidden rounded-lg border bg-white p-5 shadow-sm">
      <h2 class="font-semibold text-gray-900">Kualitas Sales</h2>
      <p class="text-sm text-gray-400">Ringkasan nilai order.</p>
      <div class="mt-5 space-y-4">
        <div class="rounded-lg bg-gray-50 p-4">
          <p class="text-sm text-gray-400">Rata-rata Order</p>
          <p class="mt-1 text-2xl font-semibold text-gray-900">{rupiah(avgOrder)}</p>
        </div>
        <div class="rounded-lg bg-amber-50 p-4">
          <p class="text-sm text-amber-700">Pending</p>
          <p class="mt-1 text-2xl font-semibold text-amber-800">{totalPending} pcs</p>
        </div>
      </div>
    </section>
  </div>

  <div class="grid gap-4">
    <section class="rounded-lg border bg-white p-5 shadow-sm">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-semibold text-gray-900">Produk Paling Laku</h2>
          <p class="text-sm text-gray-400">Model dengan total pcs dan nilai jual terbesar.</p>
        </div>
        <div class="flex w-full flex-wrap items-center justify-end gap-2"><PeriodSelector bind:dateRange={popularDateRange} defaultPeriod="hari_ini" /><div class="relative w-full sm:w-48"><SearchIcon class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input class="pl-9" placeholder="Cari model..." aria-label="Cari produk paling laku" bind:value={modelSearch} /></div></div>
      </div>
      <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
      <div class="space-y-2">
        {#each popularModelRows.slice(0, 8) as item}
          <a href={`/barang-jadi/${item.model_id}`} class="grid grid-cols-[1fr_auto] gap-3 rounded-lg bg-gray-50 px-3 py-2 transition hover:bg-gray-100">
            <div class="min-w-0">
              <p class="truncate font-medium text-gray-800">{item.nama_model}</p>
              <p class="text-xs text-gray-400">{item.orderCount} order</p>
            </div>
            <div class="text-right">
              <p class="font-semibold text-gray-900">{item.pcs} pcs</p>
              <p class="text-xs text-green-700">{rupiah(item.nilaiJual)}</p>
            </div>
          </a>
        {:else}
          <p class="py-10 text-center text-sm text-gray-400">Belum ada produk keluar.</p>
        {/each}
      </div>
      <div class="h-[28rem] min-w-0"><canvas bind:this={popularCanvas} aria-label="Chart produk paling laku"></canvas></div>
      </div>
    </section>

    <section class="rounded-lg border bg-white p-5 shadow-sm">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="font-semibold text-gray-900">Order Terbaru</h2>
          <p class="text-sm text-gray-400">List terakhir dari barang keluar.</p>
        </div>
        <Button variant="outline" onclick={() => goto("/penjualan/order")}>Semua</Button>
      </div>
      <div class="space-y-2">
        {#each rows.slice(0, 6) as row}
          <button
            class="w-full rounded-lg bg-gray-50 px-3 py-2 text-left hover:bg-gray-100"
            onclick={() => goto(`/penjualan/order?open=${row.id}`)}
          >
            <div class="flex justify-between gap-3">
              <p class="font-medium text-gray-800">{row.label}</p>
              <p class="font-semibold text-green-700">{rupiah(row.nilaiJual)}</p>
            </div>
            <p class="mt-0.5 text-xs text-gray-400">{row.tujuan} · {row.pcsKeluar} pcs · {formatDate(row.tanggal)}</p>
          </button>
        {:else}
          <p class="py-10 text-center text-sm text-gray-400">Belum ada order.</p>
        {/each}
      </div>
    </section>
  </div>

  <div class="grid gap-4 xl:grid-cols-[1.25fr_0.9fr]">
    <section class="rounded-lg border bg-white p-5 shadow-sm">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="font-semibold text-gray-900">Penjualan per Tujuan</h2>
          <p class="text-sm text-gray-400">Ringkas nilai sales per marketplace/tujuan.</p>
        </div>
        <div class="flex items-center gap-2"><PeriodSelector bind:dateRange={tujuanDateRange} defaultPeriod="hari_ini" /><Button variant="outline" onclick={() => goto("/penjualan/order")}>Lihat Order</Button></div>
      </div>
      <div class="space-y-3">
        {#each tujuanRows.slice(0, 8) as item}
          <div>
            <div class="mb-1 flex justify-between gap-3 text-sm">
              <span class="font-medium text-gray-800">{item.tujuan}</span>
              <span class="text-gray-500">{rupiah(item.total)} - {item.pcs} pcs</span>
            </div>
            <div class="h-2 rounded-full bg-gray-100">
              <div class="h-2 rounded-full bg-green-500" style={`width:${Math.max(4, (item.total / maxTujuan) * 100)}%`}></div>
            </div>
          </div>
        {:else}
          <p class="py-10 text-center text-sm text-gray-400">Belum ada penjualan pada periode ini.</p>
        {/each}
      </div>
    </section>

    <section class="rounded-lg border bg-white p-5 shadow-sm">
      <div class="flex items-center justify-between gap-2"><h2 class="font-semibold text-gray-900">Komposisi Tujuan</h2><PeriodSelector bind:dateRange={tujuanCompositionDateRange} defaultPeriod="hari_ini" /></div>
      <p class="text-sm text-gray-400">Share nilai penjualan per tujuan.</p>
      <div class="mt-5 grid gap-5 sm:grid-cols-[180px_1fr] xl:grid-cols-1">
        <div class="mx-auto h-44 w-44 rounded-full border border-gray-100 shadow-inner" style={tujuanPieStyle()}></div>
        <div class="space-y-2">
          {#each tujuanCompositionData.slice(0, 8) as item, index}
            {@const pct = totalTujuanComposition > 0 ? Math.round((item.total / totalTujuanComposition) * 100) : 0}
            <div class="flex items-center justify-between gap-3 text-sm">
              <div class="flex min-w-0 items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-full" style={`background:${CHART_COLORS[index % CHART_COLORS.length]}`}></span>
                <span class="truncate text-gray-700">{item.tujuan}</span>
              </div>
              <span class="shrink-0 font-medium text-gray-900">{pct}%</span>
            </div>
          {:else}
            <p class="py-10 text-center text-sm text-gray-400">Belum ada komposisi.</p>
          {/each}
        </div>
      </div>
    </section>
  </div>

  <!-- Buyer overview removed. -->
  <div class="hidden">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="font-semibold text-gray-900">Penjualan per Model</h2>
          <p class="text-sm text-gray-400">Cari model untuk melihat total pcs dan omzetnya.</p>
        </div>
        <div class="relative w-full sm:w-48">
          <SearchIcon class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input class="pl-9" placeholder="Cari model..." aria-label="Cari model penjualan" bind:value={modelSearch} />
        </div>
      </div>
      <div class="space-y-3">
        {#each filteredModelRows as item}
          <div>
            <div class="mb-1 flex justify-between gap-3 text-sm">
              <span class="font-medium text-gray-800">{item.model}</span>
              <span class="text-gray-500">{rupiah(item.total)} - {item.pcs} pcs</span>
            </div>
            <div class="h-2.5 rounded-full bg-gray-100">
              <div class="h-2.5 rounded-full bg-blue-500" style={`width:${Math.max(4, (item.total / maxModel) * 100)}%`}></div>
            </div>
          </div>
        {:else}
          <p class="py-10 text-center text-sm text-gray-400">Model tidak ditemukan pada periode ini.</p>
        {/each}
      </div>
  </div>
</div>
