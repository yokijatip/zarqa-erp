<script lang="ts">
  import { onMount } from "svelte";
  import { getRiwayatBarangKeluarByPeriod } from "$lib/firebase/barang-jadi";
  import { modelBajuCache } from "$lib/stores/data-cache.svelte";
  import { getPeriodRange, type DateRange } from "$lib/period";
  import PeriodSelector from "$lib/components/period-selector.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Table from "$lib/components/ui/table";
  import { buyerRows, formatDate, rupiah, salesListRows, type BuyerRow } from "$lib/sales/penjualan";

  let loading = $state(true);
  let errorMsg = $state<string | null>(null);
  let search = $state("");
  let dateRange = $state<DateRange>(getPeriodRange("bulan_ini"));
  let rows = $state<BuyerRow[]>([]);

  let filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => [row.nama, row.tujuan].some((value) => value.toLowerCase().includes(q)));
  });

  let totalBuyer = $derived(filtered.length);
  let totalNilai = $derived(filtered.reduce((sum, row) => sum + row.nilaiJual, 0));
  let totalPcs = $derived(filtered.reduce((sum, row) => sum + row.pcs, 0));

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      const [keluar, models] = await Promise.all([
        getRiwayatBarangKeluarByPeriod(dateRange),
        modelBajuCache.get(),
      ]);
      rows = buyerRows(salesListRows(keluar, models));
    } catch (e: any) {
      errorMsg = e?.message ?? "Gagal memuat buyer.";
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

<svelte:head><title>Data Buyer - Zarqa ERP</title></svelte:head>

<div class="space-y-5 p-6">
  <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
    <div>
      <p class="text-sm text-gray-400">Penjualan</p>
      <h1 class="text-2xl font-semibold text-gray-900">Data Buyer</h1>
      <p class="text-gray-500">Buyer otomatis dari reseller dan tujuan pengiriman.</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <PeriodSelector bind:dateRange defaultPeriod="bulan_ini" />
      <Button variant="outline" onclick={load}>Refresh</Button>
    </div>
  </div>

  {#if errorMsg}
    <div class="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>
  {/if}

  <div class="grid gap-3 md:grid-cols-3">
    <div class="rounded-lg border bg-white p-4 shadow-sm"><p class="text-sm text-gray-400">Buyer Aktif</p><p class="mt-1 text-2xl font-semibold">{totalBuyer}</p></div>
    <div class="rounded-lg border bg-white p-4 shadow-sm"><p class="text-sm text-gray-400">Nilai Order</p><p class="mt-1 text-2xl font-semibold text-green-700">{rupiah(totalNilai)}</p></div>
    <div class="rounded-lg border bg-white p-4 shadow-sm"><p class="text-sm text-gray-400">Pcs</p><p class="mt-1 text-2xl font-semibold">{totalPcs}</p></div>
  </div>

  <section class="rounded-lg border bg-white shadow-sm">
    <div class="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
      <Input bind:value={search} placeholder="Cari buyer atau tujuan..." class="md:max-w-md" />
      <Badge variant="secondary">{filtered.length} buyer</Badge>
    </div>
    <div class="overflow-x-auto">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Buyer</Table.Head>
            <Table.Head>Tujuan</Table.Head>
            <Table.Head class="text-right">Order</Table.Head>
            <Table.Head class="text-right">Pcs</Table.Head>
            <Table.Head class="text-right">Pending</Table.Head>
            <Table.Head class="text-right">Nilai</Table.Head>
            <Table.Head>Order Terakhir</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each filtered as row}
            <Table.Row>
              <Table.Cell class="font-medium">{row.nama}</Table.Cell>
              <Table.Cell>{row.tujuan}</Table.Cell>
              <Table.Cell class="text-right">{row.listCount}</Table.Cell>
              <Table.Cell class="text-right">{row.pcs}</Table.Cell>
              <Table.Cell class="text-right">{row.pendingPcs}</Table.Cell>
              <Table.Cell class="text-right font-medium text-green-700">{rupiah(row.nilaiJual)}</Table.Cell>
              <Table.Cell>{formatDate(row.lastOrderMs)}</Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row><Table.Cell colspan={7} class="h-28 text-center text-gray-400">{loading ? "Memuat..." : "Belum ada buyer."}</Table.Cell></Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  </section>
</div>
