<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import { stokPotonganCache } from "$lib/stores/data-cache.svelte";
  import type { StokPotongan } from "$lib/types";
  import * as Table from "$lib/components/ui/table";
  import { Button } from "$lib/components/ui/button";
  import StatCard from "$lib/components/StatCard.svelte";
  import ScissorsIcon from "@lucide/svelte/icons/scissors";
  import PackageIcon from "@lucide/svelte/icons/package";
  import PackageXIcon from "@lucide/svelte/icons/package-x";

  // ── State ──────────────────────────────────────────────────────────
  let stokList = $state<StokPotongan[]>([]);
  let loading = $state(true);
  let errorMsg = $state<string | null>(null);
  let searchQuery = $state("");

  // ── Derived stats ──────────────────────────────────────────────────
  let totalJenis = $derived(stokList.filter((s) => s.stok_tersedia > 0).length);
  let totalPcs = $derived(stokList.reduce((sum, s) => sum + s.stok_tersedia, 0));
  let stokHabis = $derived(stokList.filter((s) => s.stok_tersedia === 0).length);

  let filteredList = $derived.by(() => {
    if (!searchQuery.trim()) return stokList;
    const q = searchQuery.toLowerCase().trim();
    return stokList.filter((s) => s.nama_model.toLowerCase().includes(q));
  });

  // ── Data ──────────────────────────────────────────────────────────
  async function load(force = false) {
    loading = true;
    errorMsg = null;
    try {
      stokList = await stokPotonganCache.get(force);
    } catch {
      errorMsg = "Gagal memuat data stok potongan.";
    } finally {
      loading = false;
    }
  }

  afterNavigate(() => load());
</script>

<!-- ── Header ─────────────────────────────────────────────────────── -->
<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Stok Potongan Kain</h1>
    <p class="mt-0.5 text-sm text-gray-500">
      Sisa hasil cutting yang belum dikirim ke jahit
    </p>
  </div>
  <Button variant="outline" size="sm" onclick={() => load(true)} class="ml-auto">
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

<!-- ── Stats ──────────────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-3 gap-4">
  {#if loading}
    {#each Array(3) as _}
      <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div class="mt-1.5 h-7 w-10 animate-pulse rounded bg-gray-100"></div>
      </div>
    {/each}
  {:else}
    <StatCard
      title="Jenis Tersedia"
      value={totalJenis}
      icon={ScissorsIcon}
      footerSubtext="model + ukuran dengan stok > 0"
    />
    <StatCard
      title="Total PCS Tersedia"
      value={totalPcs}
      icon={PackageIcon}
      footerSubtext="pcs potongan siap pakai"
      class="border-blue-100 bg-blue-50"
      valueClass="text-blue-700"
    />
    <StatCard
      title="Stok Habis"
      value={stokHabis}
      icon={PackageXIcon}
      footerSubtext="jenis dengan stok 0"
      class="border-red-100 bg-red-50"
      valueClass="text-red-700"
    />
  {/if}
</div>

<!-- ── Search ─────────────────────────────────────────────────────── -->
<div class="mb-4">
  <div class="relative max-w-sm">
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
      placeholder="Cari nama model..."
      bind:value={searchQuery}
      class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
    />
  </div>
</div>

<!-- ── Table ──────────────────────────────────────────────────────── -->
{#if errorMsg}
  <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
    {errorMsg}
  </div>
{:else}
  <div class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
    {#if loading}
      <div class="space-y-0">
        {#each Array(6) as _}
          <div class="flex items-center gap-4 border-b border-gray-50 px-5 py-4">
            <div class="h-4 w-44 animate-pulse rounded bg-gray-100"></div>
            <div class="ml-auto h-4 w-20 animate-pulse rounded bg-gray-100"></div>
            <div class="h-4 w-12 animate-pulse rounded bg-gray-100"></div>
            <div class="h-4 w-16 animate-pulse rounded bg-gray-100"></div>
            <div class="h-4 w-16 animate-pulse rounded bg-gray-100"></div>
            <div class="h-4 w-16 animate-pulse rounded bg-gray-100"></div>
          </div>
        {/each}
      </div>
    {:else if filteredList.length === 0}
      <div class="flex flex-col items-center justify-center gap-3 py-16">
        <div class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
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
              d="M7.848 8.25l1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3Zm1.536.887a2.165 2.165 0 0 1 1.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 1 1-5.196 3 3 3 0 0 1 5.196-3Zm1.536-.887a2.165 2.165 0 0 1 1.083-1.838c.355-.193.704-.402 1.042-.629m-2.125 2.467 2.077-1.199m0-3.328a4.323 4.323 0 0 1 2.068-1.379l5.325-1.628a4.5 4.5 0 0 1 2.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.33 4.33 0 0 0 10.607 12m3.736 0 7.794 4.5-.802.215a4.5 4.5 0 0 1-2.48-.044l-5.326-1.629a4.324 4.324 0 0 1-2.068-1.379M14.343 12l-2.882 1.664"
            />
          </svg>
        </div>
        {#if searchQuery}
          <p class="text-sm font-medium text-gray-500">Tidak ada hasil untuk "{searchQuery}"</p>
          <Button variant="link" size="sm" onclick={() => (searchQuery = "")}>Hapus pencarian</Button>
        {:else}
          <p class="text-sm font-medium text-gray-500">Belum ada stok potongan</p>
          <p class="text-xs text-gray-400">Stok akan muncul saat worker cutting menyimpan sisa potongan</p>
        {/if}
      </div>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row class="bg-gray-50 hover:bg-gray-50">
            <Table.Head>Nama Model</Table.Head>
            <Table.Head>Warna</Table.Head>
            <Table.Head class="text-center">Ukuran</Table.Head>
            <Table.Head class="text-center">Stok Tersedia</Table.Head>
            <Table.Head class="text-center">Total Masuk</Table.Head>
            <Table.Head class="text-center">Total Terpakai</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each filteredList as stok}
            <Table.Row>
              <Table.Cell>
                <p class="text-sm font-medium text-gray-800">{stok.nama_model}</p>
              </Table.Cell>

              <Table.Cell>
                {#if stok.nama_warna}
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    <span
                      class="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style="background-color: {stok.kode_hex_warna}"
                    ></span>
                    {stok.nama_warna}
                  </span>
                {:else}
                  <span class="text-xs text-gray-400">—</span>
                {/if}
              </Table.Cell>

              <Table.Cell class="text-center">
                <span class="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                  {stok.ukuran}
                </span>
              </Table.Cell>

              <Table.Cell class="text-center">
                <span
                  class="text-sm font-semibold {stok.stok_tersedia === 0
                    ? 'text-red-500'
                    : stok.stok_tersedia < 10
                      ? 'text-amber-600'
                      : 'text-gray-800'}"
                >
                  {stok.stok_tersedia}
                </span>
                <span class="ml-1 text-xs text-gray-400">pcs</span>
              </Table.Cell>

              <Table.Cell class="text-center">
                <span class="text-sm text-gray-600">{stok.total_masuk}</span>
                <span class="ml-1 text-xs text-gray-400">pcs</span>
              </Table.Cell>

              <Table.Cell class="text-center">
                <span class="text-sm text-gray-600">{stok.total_terpakai}</span>
                <span class="ml-1 text-xs text-gray-400">pcs</span>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>

      <div class="border-t border-gray-100 bg-gray-50 px-5 py-3">
        <p class="text-xs text-gray-400">
          Menampilkan {filteredList.length} dari {stokList.length} entri total
        </p>
      </div>
    {/if}
  </div>
{/if}
