<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { getRiwayatBarangKeluarByPeriod, prosesPendingBarangKeluar, batalItemBarangKeluar } from "$lib/firebase/barang-jadi";
  import { barangJadiCache, modelBajuCache } from "$lib/stores/data-cache.svelte";
  import { currentUser } from "$lib/stores/auth.store";
  import { getPeriodRange, type DateRange } from "$lib/period";
  import PeriodSelector from "$lib/components/period-selector.svelte";
  import BarangKeluarDetailDialog from "$lib/components/barang-keluar-detail-dialog.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Table from "$lib/components/ui/table";
  import type { BarangKeluar, ModelBaju } from "$lib/types";
  import { filterSalesLists, formatDate, rupiah, salesListRows, type SalesListRow } from "$lib/sales/penjualan";

  let loading = $state(true);
  let errorMsg = $state<string | null>(null);
  let search = $state("");
  let dateRange = $state<DateRange>(getPeriodRange("hari_ini"));
  let rows = $state<SalesListRow[]>([]);
  let modelList = $state<ModelBaju[]>([]);
  let detailOpen = $state(false);
  let detailTarget = $state<BarangKeluar | null>(null);

  let filtered = $derived(filterSalesLists(rows, search));
  let totalNilai = $derived(filtered.reduce((sum, row) => sum + row.nilaiJual, 0));
  let totalPcs = $derived(filtered.reduce((sum, row) => sum + row.pcsKeluar, 0));
  let totalPending = $derived(filtered.reduce((sum, row) => sum + row.pcsPending, 0));

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      const [keluar, models] = await Promise.all([
        getRiwayatBarangKeluarByPeriod(dateRange),
        modelBajuCache.get(),
      ]);
      modelList = models;
      rows = salesListRows(keluar, models);
    } catch (e: any) {
      errorMsg = e?.message ?? "Gagal memuat order penjualan.";
    } finally {
      loading = false;
    }
  }

  function openDetail(row: SalesListRow) {
    detailTarget = row.original;
    detailOpen = true;
  }

  async function resolvePending(itemIndex: number) {
    if (!detailTarget || !$currentUser) return;
    await prosesPendingBarangKeluar(detailTarget.id, itemIndex, {
      uid: $currentUser.uid,
      nama: $currentUser.name || $currentUser.email || $currentUser.uid,
    });
    barangJadiCache.invalidate();
    await load();
    detailTarget = rows.find((row) => row.id === detailTarget?.id)?.original ?? detailTarget;
  }

  async function cancelItem(itemIndex: number) {
    if (!detailTarget || !$currentUser) return;
    const result = await batalItemBarangKeluar(detailTarget.id, itemIndex, {
      uid: $currentUser.uid,
      nama: $currentUser.name || $currentUser.email || $currentUser.uid,
    });
    barangJadiCache.invalidate();
    await load();
    if (result.deleted) {
      detailOpen = false;
      detailTarget = null;
    } else {
      detailTarget = rows.find((row) => row.id === detailTarget?.id)?.original ?? detailTarget;
    }
  }

  onMount(load);
  $effect(() => {
    dateRange;
    load();
  });
</script>

<svelte:head><title>Order Penjualan - Zarqa ERP</title></svelte:head>

<div class="space-y-5 p-6">
  <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
    <div>
      <p class="text-sm text-gray-400">Penjualan</p>
      <h1 class="text-2xl font-semibold text-gray-900">Order Penjualan</h1>
      <p class="text-gray-500">List barang keluar sebagai order sales.</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <PeriodSelector bind:dateRange defaultPeriod="hari_ini" />
      <Button variant="outline" onclick={load}>Refresh</Button>
      <Button onclick={() => goto("/barang-keluar/catat")}>+ Input Order</Button>
    </div>
  </div>

  {#if errorMsg}
    <div class="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>
  {/if}

  <div class="grid gap-3 md:grid-cols-3">
    <div class="rounded-lg border bg-white p-4 shadow-sm"><p class="text-sm text-gray-400">Nilai Order</p><p class="mt-1 text-2xl font-semibold text-green-700">{rupiah(totalNilai)}</p></div>
    <div class="rounded-lg border bg-white p-4 shadow-sm"><p class="text-sm text-gray-400">Pcs Keluar</p><p class="mt-1 text-2xl font-semibold">{totalPcs}</p></div>
    <div class="rounded-lg border bg-white p-4 shadow-sm"><p class="text-sm text-gray-400">Pending</p><p class="mt-1 text-2xl font-semibold text-amber-700">{totalPending}</p></div>
  </div>

  <section class="rounded-lg border bg-white shadow-sm">
    <div class="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
      <Input bind:value={search} placeholder="Cari order, buyer, tujuan..." class="md:max-w-md" />
      <Badge variant="secondary">{filtered.length} list</Badge>
    </div>
    <div class="overflow-x-auto">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Tanggal</Table.Head>
            <Table.Head>List</Table.Head>
            <Table.Head>Buyer</Table.Head>
            <Table.Head>Status</Table.Head>
            <Table.Head class="text-right">Pcs</Table.Head>
            <Table.Head class="text-right">Penjualan</Table.Head>
            <Table.Head class="text-right">Laba</Table.Head>
            <Table.Head class="text-right">Aksi</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each filtered as row}
            <Table.Row>
              <Table.Cell>{formatDate(row.tanggal)}</Table.Cell>
              <Table.Cell><div class="font-medium">{row.label}</div><div class="text-xs text-gray-400">{row.tujuan} - {row.itemCount} item</div></Table.Cell>
              <Table.Cell>{row.buyer}</Table.Cell>
              <Table.Cell>
                <Badge variant={row.pcsPending > 0 ? "secondary" : "outline"}>{row.pcsPending > 0 ? `Pending ${row.pcsPending}` : "Selesai"}</Badge>
              </Table.Cell>
              <Table.Cell class="text-right">{row.pcsKeluar}</Table.Cell>
              <Table.Cell class="text-right font-medium text-green-700">{rupiah(row.nilaiJual)}</Table.Cell>
              <Table.Cell class="text-right">{rupiah(row.laba)}</Table.Cell>
              <Table.Cell class="text-right"><Button variant="outline" size="sm" onclick={() => openDetail(row)}>Detail</Button></Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row><Table.Cell colspan={8} class="h-28 text-center text-gray-400">{loading ? "Memuat..." : "Belum ada order."}</Table.Cell></Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  </section>
</div>

<BarangKeluarDetailDialog bind:open={detailOpen} riwayat={detailTarget} {modelList} onResolvePending={resolvePending} onCancelItem={cancelItem} />
