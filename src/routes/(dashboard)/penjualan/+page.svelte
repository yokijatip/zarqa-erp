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
    buyerRows,
    formatDate,
    productSalesRows,
    rupiah,
    salesItemRows,
    salesListRows,
    type BuyerRow,
    type ProductSalesRow,
    type SalesListRow,
  } from "$lib/sales/penjualan";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import ShoppingBagIcon from "@lucide/svelte/icons/shopping-bag";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import UsersIcon from "@lucide/svelte/icons/users";

  let loading = $state(true);
  let errorMsg = $state<string | null>(null);
  let dateRange = $state<DateRange>(getPeriodRange("hari_ini"));
  let rows = $state<SalesListRow[]>([]);
  let buyers = $state<BuyerRow[]>([]);
  let products = $state<ProductSalesRow[]>([]);

  let totalPenjualan = $derived(rows.reduce((sum, row) => sum + row.nilaiJual, 0));
  let totalOrder = $derived(rows.length);
  let totalPcs = $derived(rows.reduce((sum, row) => sum + row.pcsKeluar, 0));
  let totalPending = $derived(rows.reduce((sum, row) => sum + row.pcsPending, 0));
  let tujuanRows = $derived.by(() => {
    const map = new Map<string, { tujuan: string; total: number; pcs: number; order: number }>();
    for (const row of rows) {
      const item = map.get(row.tujuan) ?? { tujuan: row.tujuan, total: 0, pcs: 0, order: 0 };
      item.total += row.nilaiJual;
      item.pcs += row.pcsKeluar;
      item.order += 1;
      map.set(row.tujuan, item);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  });
  let maxTujuan = $derived(Math.max(1, ...tujuanRows.map((item) => item.total)));

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      const [keluar, models] = await Promise.all([
        getRiwayatBarangKeluarByPeriod(dateRange),
        modelBajuCache.get(),
      ]);
      rows = salesListRows(keluar, models);
      products = productSalesRows(salesItemRows(keluar, models));
      buyers = buyerRows(rows);
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
</script>

<svelte:head><title>Penjualan - Zarqa ERP</title></svelte:head>

<div class="space-y-6 p-6">
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
    <StatCard title="Buyer" value={String(buyers.length)} icon={UsersIcon} {loading} footerSubtext="tujuan/reseller aktif" />
  </div>

  <div class="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
    <section class="rounded-lg border bg-white p-5 shadow-sm">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="font-semibold text-gray-900">Produk Paling Laku</h2>
          <p class="text-sm text-gray-400">Model, warna, ukuran yang paling banyak keluar.</p>
        </div>
      </div>
      <div class="space-y-2">
        {#each products.slice(0, 6) as item}
          <div class="grid grid-cols-[1fr_auto] gap-3 rounded-lg bg-gray-50 px-3 py-2">
            <div class="min-w-0">
              <p class="truncate font-medium text-gray-800">{item.nama_model}</p>
              <p class="text-xs text-gray-400">{item.nama_warna ?? "-"} · {item.ukuran} · {item.orderCount} order</p>
            </div>
            <div class="text-right">
              <p class="font-semibold text-gray-900">{item.pcs} pcs</p>
              <p class="text-xs text-green-700">{rupiah(item.nilaiJual)}</p>
            </div>
          </div>
        {:else}
          <p class="py-10 text-center text-sm text-gray-400">Belum ada produk keluar.</p>
        {/each}
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
            onclick={() => goto("/penjualan/order")}
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

  <div class="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
    <section class="rounded-lg border bg-white p-5 shadow-sm">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="font-semibold text-gray-900">Penjualan per Tujuan</h2>
          <p class="text-sm text-gray-400">Ringkas nilai sales per marketplace/tujuan.</p>
        </div>
        <Button variant="outline" onclick={() => goto("/penjualan/order")}>Lihat Order</Button>
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
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="font-semibold text-gray-900">Buyer Teratas</h2>
          <p class="text-sm text-gray-400">Berdasarkan nilai order.</p>
        </div>
        <Button variant="outline" onclick={() => goto("/penjualan/buyer")}>Data Buyer</Button>
      </div>
      <div class="space-y-2">
        {#each buyers.slice(0, 6) as buyer}
          <div class="rounded-lg bg-gray-50 px-3 py-2">
            <div class="flex justify-between gap-3">
              <p class="font-medium text-gray-800">{buyer.nama}</p>
              <p class="font-semibold text-green-700">{rupiah(buyer.nilaiJual)}</p>
            </div>
            <p class="mt-0.5 text-xs text-gray-400">{buyer.tujuan} - {buyer.listCount} order - terakhir {formatDate(buyer.lastOrderMs)}</p>
          </div>
        {:else}
          <p class="py-10 text-center text-sm text-gray-400">Belum ada buyer.</p>
        {/each}
      </div>
    </section>
  </div>
</div>
