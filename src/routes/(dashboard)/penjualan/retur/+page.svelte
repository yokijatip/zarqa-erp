<script lang="ts">
  import { onMount } from "svelte";
  import { getRiwayatBarangKeluarByPeriod, batalItemBarangKeluar, returBarangKeluarItem } from "$lib/firebase/barang-jadi";
  import { barangJadiCache, modelBajuCache } from "$lib/stores/data-cache.svelte";
  import { currentUser } from "$lib/stores/auth.store";
  import { getPeriodRange, type DateRange } from "$lib/period";
  import PeriodSelector from "$lib/components/period-selector.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Table from "$lib/components/ui/table";
  import type { BarangKeluarItem, ModelBaju } from "$lib/types";
  import {
    formatDate,
    listItems,
    rupiah,
    salesItemValue,
    salesListRows,
    type SalesListRow,
  } from "$lib/sales/penjualan";

  type ReturCandidate = {
    row: SalesListRow;
    item: BarangKeluarItem;
    itemIndex: number;
  };

  let loading = $state(true);
  let savingKey = $state("");
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);
  let search = $state("");
  let dateRange = $state<DateRange>(getPeriodRange("bulan_ini"));
  let rows = $state<SalesListRow[]>([]);
  let modelList = $state<ModelBaju[]>([]);
  let selectedKey = $state("");
  let returQty = $state<Record<string, number>>({});
  let manualCatatan = $state("");

  let candidates = $derived.by<ReturCandidate[]>(() =>
    rows.flatMap((row) =>
      listItems(row.original)
        .map((item, itemIndex) => ({ row, item, itemIndex }))
        .filter((entry) => entry.item.status !== "pending"),
    ),
  );

  let filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((entry) =>
      [
        entry.row.label,
        entry.row.tujuan,
        entry.row.buyer,
        entry.item.nama_model,
        entry.item.nama_warna ?? "",
      ].some((value) => value.toLowerCase().includes(q)),
    );
  });

  let totalPcs = $derived(filtered.reduce((sum, entry) => sum + entry.item.total_pcs, 0));
  let totalNilai = $derived(
    filtered.reduce((sum, entry) => sum + salesItemValue(entry.item, modelList).nilaiJual, 0),
  );
  let selectedCandidate = $derived(
    candidates.find((entry) => `${entry.row.id}:${entry.itemIndex}` === selectedKey) ?? null,
  );
  let selectedReturTotal = $derived(
    selectedCandidate
      ? selectedCandidate.item.detail_keluar.reduce(
          (sum, detail) => sum + Math.min(returQty[detail.ukuran] ?? 0, detail.jumlah_pcs),
          0,
        )
      : 0,
  );

  function itemSummary(item: BarangKeluarItem): string {
    return item.detail_keluar.map((detail) => `${detail.ukuran}: ${detail.jumlah_pcs}`).join(", ");
  }

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
      errorMsg = e?.message ?? "Gagal memuat data retur.";
    } finally {
      loading = false;
    }
  }

  async function submitRetur(entry: ReturCandidate) {
    if (!$currentUser) return;
    const confirmed = window.confirm("Retur item ini? Stok akan dikembalikan dan item keluar dibatalkan.");
    if (!confirmed) return;
    savingKey = `${entry.row.id}:${entry.itemIndex}`;
    errorMsg = null;
    successMsg = null;
    try {
      await batalItemBarangKeluar(entry.row.id, entry.itemIndex, {
        uid: $currentUser.uid,
        nama: $currentUser.name || $currentUser.email || $currentUser.uid,
        catatan: "Retur penjualan",
      });
      barangJadiCache.invalidate();
      await load();
      successMsg = "Retur berhasil dicatat. Stok sudah dikembalikan.";
    } catch (e: any) {
      errorMsg = e?.message ?? "Gagal memproses retur.";
    } finally {
      savingKey = "";
    }
  }

  async function submitManualRetur() {
    if (!$currentUser || !selectedCandidate || selectedReturTotal <= 0) return;
    savingKey = "manual";
    errorMsg = null;
    successMsg = null;
    try {
      await returBarangKeluarItem(
        selectedCandidate.row.id,
        selectedCandidate.itemIndex,
        selectedCandidate.item.detail_keluar
          .map((detail) => ({
            ukuran: detail.ukuran,
            jumlah_pcs: Math.min(returQty[detail.ukuran] ?? 0, detail.jumlah_pcs),
          }))
          .filter((detail) => detail.jumlah_pcs > 0),
        {
          uid: $currentUser.uid,
          nama: $currentUser.name || $currentUser.email || $currentUser.uid,
          catatan: manualCatatan.trim() || "Retur penjualan manual",
        },
      );
      barangJadiCache.invalidate();
      selectedKey = "";
      returQty = {};
      manualCatatan = "";
      await load();
      successMsg = "Retur manual berhasil dicatat. Stok sudah dikembalikan.";
    } catch (e: any) {
      errorMsg = e?.message ?? "Gagal memproses retur manual.";
    } finally {
      savingKey = "";
    }
  }

  onMount(load);
  $effect(() => {
    dateRange;
    load();
  });
</script>

<svelte:head><title>Retur Penjualan - Zarqa ERP</title></svelte:head>

<div class="space-y-5 p-6">
  <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
    <div>
      <p class="text-sm text-gray-400">Penjualan</p>
      <h1 class="text-2xl font-semibold text-gray-900">Retur</h1>
      <p class="text-gray-500">Batalkan item order keluar dan kembalikan stok ke barang jadi.</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <PeriodSelector bind:dateRange defaultPeriod="bulan_ini" />
      <Button variant="outline" onclick={load}>Refresh</Button>
    </div>
  </div>

  {#if errorMsg}
    <div class="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>
  {/if}
  {#if successMsg}
    <div class="rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{successMsg}</div>
  {/if}

  <div class="grid gap-3 md:grid-cols-3">
    <div class="rounded-lg border bg-white p-4 shadow-sm"><p class="text-sm text-gray-400">Kandidat Retur</p><p class="mt-1 text-2xl font-semibold">{filtered.length}</p></div>
    <div class="rounded-lg border bg-white p-4 shadow-sm"><p class="text-sm text-gray-400">Pcs</p><p class="mt-1 text-2xl font-semibold">{totalPcs}</p></div>
    <div class="rounded-lg border bg-white p-4 shadow-sm"><p class="text-sm text-gray-400">Nilai Order</p><p class="mt-1 text-2xl font-semibold text-green-700">{rupiah(totalNilai)}</p></div>
  </div>

  <section class="rounded-lg border bg-white p-5 shadow-sm">
    <div class="mb-4 flex flex-col gap-1">
      <h2 class="font-semibold text-gray-900">Input Retur Manual</h2>
      <p class="text-sm text-gray-500">Pilih order yang sudah keluar, lalu isi jumlah retur per ukuran.</p>
    </div>
    <div class="grid gap-4 lg:grid-cols-[1fr_220px]">
      <div class="space-y-4">
        <Select.Root
          type="single"
          value={selectedKey || undefined}
          onValueChange={(value) => {
            selectedKey = value ?? "";
            returQty = {};
          }}
        >
          <Select.Trigger class="w-full">
            {#if selectedCandidate}
              <span>
                {selectedCandidate.item.nama_model}
                {selectedCandidate.item.nama_warna ? ` - ${selectedCandidate.item.nama_warna}` : ""}
                · {selectedCandidate.row.tujuan}
              </span>
            {:else}
              <span class="text-muted-foreground">-- Pilih order/item keluar --</span>
            {/if}
          </Select.Trigger>
          <Select.Content preventScroll={false}>
            {#each candidates as entry}
              {@const key = `${entry.row.id}:${entry.itemIndex}`}
              <Select.Item value={key}>
                {formatDate(entry.row.tanggal)} · {entry.item.nama_model}
                {entry.item.nama_warna ? ` - ${entry.item.nama_warna}` : ""}
                · {entry.row.tujuan} · {entry.item.total_pcs} pcs
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>

        {#if selectedCandidate}
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {#each selectedCandidate.item.detail_keluar as detail}
              <label class="rounded-lg border bg-gray-50 p-3">
                <span class="text-sm font-medium text-gray-800">{detail.ukuran}</span>
                <span class="ml-1 text-xs text-gray-400">maks {detail.jumlah_pcs} pcs</span>
                <Input
                  class="mt-2"
                  type="number"
                  min="0"
                  max={detail.jumlah_pcs}
                  value={returQty[detail.ukuran] ?? 0}
                  oninput={(e) => {
                    const value = Number((e.currentTarget as HTMLInputElement).value) || 0;
                    returQty = {
                      ...returQty,
                      [detail.ukuran]: Math.max(0, Math.min(value, detail.jumlah_pcs)),
                    };
                  }}
                />
              </label>
            {/each}
          </div>
          <Input
            value={manualCatatan}
            oninput={(e) => (manualCatatan = (e.currentTarget as HTMLInputElement).value)}
            placeholder="Catatan retur, contoh: pesanan batal / salah kirim"
          />
        {/if}
      </div>
      <div class="rounded-lg border bg-gray-50 p-4">
        <p class="text-sm text-gray-500">Total Retur</p>
        <p class="mt-1 text-2xl font-semibold text-gray-900">{selectedReturTotal} pcs</p>
        <Button class="mt-4 w-full" onclick={submitManualRetur} disabled={!selectedCandidate || selectedReturTotal <= 0 || savingKey !== ""}>
          {savingKey === "manual" ? "Memproses..." : "Simpan Retur"}
        </Button>
      </div>
    </div>
  </section>

  <section class="rounded-lg border bg-white shadow-sm">
    <div class="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
      <Input bind:value={search} placeholder="Cari order untuk retur..." class="md:max-w-md" />
      <Badge variant="secondary">{filtered.length} item</Badge>
    </div>
    <div class="overflow-x-auto">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Tanggal</Table.Head>
            <Table.Head>Barang</Table.Head>
            <Table.Head>Buyer</Table.Head>
            <Table.Head>Ukuran</Table.Head>
            <Table.Head class="text-right">Pcs</Table.Head>
            <Table.Head class="text-right">Aksi</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each filtered as entry}
            {@const key = `${entry.row.id}:${entry.itemIndex}`}
            <Table.Row>
              <Table.Cell>{formatDate(entry.row.tanggal)}</Table.Cell>
              <Table.Cell><div class="font-medium">{entry.item.nama_model}</div><div class="text-xs text-gray-400">{entry.item.nama_warna ?? "-"} - {entry.row.tujuan}</div></Table.Cell>
              <Table.Cell>{entry.row.buyer}</Table.Cell>
              <Table.Cell>{itemSummary(entry.item)}</Table.Cell>
              <Table.Cell class="text-right">{entry.item.total_pcs}</Table.Cell>
              <Table.Cell class="text-right">
                <Button variant="outline" size="sm" onclick={() => submitRetur(entry)} disabled={savingKey !== ""}>
                  {savingKey === key ? "Memproses..." : "Retur"}
                </Button>
              </Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row><Table.Cell colspan={6} class="h-28 text-center text-gray-400">{loading ? "Memuat..." : "Tidak ada item retur."}</Table.Cell></Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  </section>
</div>
