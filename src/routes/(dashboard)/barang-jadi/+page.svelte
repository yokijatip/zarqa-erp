<script lang="ts">
  import { onMount } from 'svelte';
  import { getStokBarangJadi } from '$lib/firebase/barang-jadi';
  import type { StokBarangJadi, UkuranBaju } from '$lib/types';

  const UKURAN_ORDER: UkuranBaju[] = ['S', 'M', 'L', 'XL', 'XXL'];

  // ── State ──────────────────────────────────────────────────────────
  let stokList    = $state<StokBarangJadi[]>([]);
  let loading     = $state(true);
  let errorMsg    = $state<string | null>(null);
  let searchQuery = $state('');

  // ── Derived ────────────────────────────────────────────────────────
  // Group by model
  let grouped = $derived.by(() => {
    const map = new Map<string, { model_id: string; nama_model: string; items: StokBarangJadi[] }>();
    for (const item of stokList) {
      if (!map.has(item.model_id)) {
        map.set(item.model_id, { model_id: item.model_id, nama_model: item.nama_model, items: [] });
      }
      map.get(item.model_id)!.items.push(item);
    }
    // Sort items per group by ukuran order
    for (const g of map.values()) {
      g.items.sort((a, b) => UKURAN_ORDER.indexOf(a.ukuran) - UKURAN_ORDER.indexOf(b.ukuran));
    }
    return [...map.values()].sort((a, b) => a.nama_model.localeCompare(b.nama_model));
  });

  let filteredGrouped = $derived.by(() => {
    if (!searchQuery.trim()) return grouped;
    const q = searchQuery.toLowerCase().trim();
    return grouped.filter(g => g.nama_model.toLowerCase().includes(q));
  });

  let totalModel    = $derived(grouped.length);
  let totalTersedia = $derived(stokList.reduce((s, i) => s + i.stok_tersedia, 0));
  let totalMasuk    = $derived(stokList.reduce((s, i) => s + i.total_masuk, 0));
  let totalKeluar   = $derived(stokList.reduce((s, i) => s + i.total_keluar, 0));
  let modelKosong   = $derived(grouped.filter(g => g.items.every(i => i.stok_tersedia === 0)).length);
  let lastLoaded    = $state<Date | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────
  function totalTersediaModel(items: StokBarangJadi[]): number {
    return items.reduce((s, i) => s + i.stok_tersedia, 0);
  }

  function formatDate(ts: any): string {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function showError(msg: string) {
    errorMsg = msg;
    setTimeout(() => (errorMsg = null), 4000);
  }

  // ── Data ──────────────────────────────────────────────────────────
  async function load() {
    loading  = true;
    errorMsg = null;
    try {
      stokList    = await getStokBarangJadi();
      lastLoaded  = new Date();
    } catch {
      showError('Gagal memuat data. Periksa koneksi Firebase.');
    } finally {
      loading = false;
    }
  }

  onMount(load);
</script>

<!-- ── Error Toast ─────────────────────────────────────────────────── -->
{#if errorMsg}
  <div class="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg">
    <svg class="h-4 w-4 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
    <p class="text-sm text-red-800">{errorMsg}</p>
  </div>
{/if}

<!-- ── Header ─────────────────────────────────────────────────────── -->
<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Barang Jadi</h1>
    <p class="mt-0.5 text-sm text-gray-500">Stok barang jadi siap kirim per model dan ukuran</p>
  </div>
  <div class="flex items-center gap-2">
    {#if lastLoaded && !loading}
      <span class="text-xs text-gray-400">
        Update: {lastLoaded.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
      </span>
    {/if}
    <button
      onclick={load}
      class="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
    >
      <svg class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
      Refresh
    </button>
  </div>
</div>

<!-- ── Stats ──────────────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
  <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
    <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Total Model</p>
    {#if loading}
      <div class="mt-1.5 h-7 w-12 animate-pulse rounded bg-gray-100"></div>
    {:else}
      <p class="mt-1.5 text-2xl font-bold text-gray-900">{totalModel}</p>
    {/if}
    <p class="text-xs text-gray-400">jenis model terdaftar</p>
  </div>

  <div class="rounded-xl border border-teal-100 bg-teal-50 p-4 shadow-sm">
    <p class="text-xs font-medium uppercase tracking-wider text-teal-600">Stok Tersedia</p>
    {#if loading}
      <div class="mt-1.5 h-7 w-16 animate-pulse rounded bg-teal-100"></div>
    {:else}
      <p class="mt-1.5 text-2xl font-bold text-teal-700">{totalTersedia.toLocaleString('id-ID')}</p>
    {/if}
    <p class="text-xs text-teal-600">pcs siap kirim</p>
  </div>

  <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
    <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Total Masuk</p>
    {#if loading}
      <div class="mt-1.5 h-7 w-16 animate-pulse rounded bg-gray-100"></div>
    {:else}
      <p class="mt-1.5 text-2xl font-bold text-gray-900">{totalMasuk.toLocaleString('id-ID')}</p>
    {/if}
    <p class="text-xs text-gray-400">pcs dari produksi</p>
  </div>

  <div class="rounded-xl border {modelKosong > 0 ? 'border-amber-100 bg-amber-50' : 'border-gray-100 bg-white'} p-4 shadow-sm">
    <p class="text-xs font-medium uppercase tracking-wider {modelKosong > 0 ? 'text-amber-600' : 'text-gray-400'}">Stok Habis</p>
    {#if loading}
      <div class="mt-1.5 h-7 w-10 animate-pulse rounded bg-gray-100"></div>
    {:else}
      <p class="mt-1.5 text-2xl font-bold {modelKosong > 0 ? 'text-amber-700' : 'text-gray-900'}">{modelKosong}</p>
    {/if}
    <p class="text-xs {modelKosong > 0 ? 'text-amber-600' : 'text-gray-400'}">model tanpa stok</p>
  </div>
</div>

<!-- ── Search ──────────────────────────────────────────────────────── -->
<div class="mb-4 flex items-center gap-3">
  <div class="relative flex-1">
    <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
    <input
      type="text"
      placeholder="Cari nama model..."
      bind:value={searchQuery}
      class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
    />
  </div>
  {#if searchQuery}
    <button onclick={() => (searchQuery = '')} class="text-xs text-gray-400 hover:text-gray-600">
      Hapus
    </button>
  {/if}
</div>

<!-- ── Content ────────────────────────────────────────────────────── -->
{#if loading}
  <!-- Skeleton -->
  <div class="space-y-4">
    {#each Array(3) as _}
      <div class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div class="border-b border-gray-100 bg-gray-50 px-5 py-3">
          <div class="h-4 w-48 animate-pulse rounded bg-gray-200"></div>
        </div>
        <div class="grid grid-cols-3 gap-px bg-gray-100 lg:grid-cols-5">
          {#each Array(3) as _}
            <div class="bg-white p-4">
              <div class="h-3 w-6 animate-pulse rounded bg-gray-100"></div>
              <div class="mt-2 h-6 w-12 animate-pulse rounded bg-gray-100"></div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

{:else if filteredGrouped.length === 0}
  <!-- Empty state -->
  <div class="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-100 bg-white py-16 shadow-sm">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
      <svg class="h-7 w-7 text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
      </svg>
    </div>
    {#if searchQuery}
      <p class="text-sm font-medium text-gray-500">Model "{searchQuery}" tidak ditemukan</p>
      <button onclick={() => (searchQuery = '')} class="text-xs text-teal-600 hover:underline">Hapus pencarian</button>
    {:else}
      <p class="text-sm font-medium text-gray-500">Belum ada stok barang jadi</p>
      <p class="text-xs text-gray-400">Stok akan terisi otomatis saat batch produksi selesai</p>
      <a href="/order-produksi" class="mt-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
        Lihat Order Produksi →
      </a>
    {/if}
  </div>

{:else}
  <!-- Model cards -->
  <div class="space-y-4">
    {#each filteredGrouped as group}
      {@const totalGrup    = totalTersediaModel(group.items)}
      {@const totalMasukG  = group.items.reduce((s, i) => s + i.total_masuk, 0)}
      {@const totalKeluarG = group.items.reduce((s, i) => s + i.total_keluar, 0)}
      {@const kosong       = totalGrup === 0}

      <div class="overflow-hidden rounded-xl border {kosong ? 'border-amber-100' : 'border-gray-100'} bg-white shadow-sm">
        <!-- Model header -->
        <div class="flex items-center justify-between border-b {kosong ? 'border-amber-100 bg-amber-50' : 'border-gray-100 bg-gray-50'} px-5 py-3">
          <div class="flex items-center gap-2">
            {#if kosong}
              <span class="h-2 w-2 rounded-full bg-amber-400"></span>
            {:else}
              <span class="h-2 w-2 rounded-full bg-teal-400"></span>
            {/if}
            <p class="text-sm font-semibold {kosong ? 'text-amber-700' : 'text-gray-800'}">{group.nama_model}</p>
          </div>
          <div class="flex items-center gap-4 text-xs">
            <span class="text-gray-400">
              Tersedia: <span class="font-semibold {kosong ? 'text-amber-600' : 'text-gray-700'}">{totalGrup} pcs</span>
            </span>
            <span class="text-gray-400">
              Masuk: <span class="font-semibold text-gray-700">{totalMasukG}</span>
            </span>
            <span class="text-gray-400">
              Keluar: <span class="font-semibold text-gray-700">{totalKeluarG}</span>
            </span>
          </div>
        </div>

        <!-- Ukuran grid -->
        <div class="grid divide-x divide-gray-100" style="grid-template-columns: repeat({group.items.length}, minmax(0, 1fr))">
          {#each group.items as item}
            {@const habis = item.stok_tersedia === 0}
            <div class="p-4 {habis ? 'bg-amber-50/40' : ''}">
              <!-- Ukuran badge -->
              <div class="mb-2 flex items-center justify-between">
                <span class="flex h-7 w-7 items-center justify-center rounded-full {habis ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'} text-xs font-bold">
                  {item.ukuran}
                </span>
                {#if habis}
                  <span class="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">Habis</span>
                {/if}
              </div>
              <!-- Stok number -->
              <p class="text-xl font-bold {habis ? 'text-amber-600' : 'text-gray-900'}">{item.stok_tersedia}</p>
              <p class="text-[11px] text-gray-400">pcs tersedia</p>
              <!-- Mini stats -->
              <div class="mt-2 space-y-0.5 text-[11px] text-gray-400">
                <p>Masuk: <span class="text-gray-600">{item.total_masuk}</span></p>
                <p>Keluar: <span class="text-gray-600">{item.total_keluar}</span></p>
              </div>
              <!-- Progress bar -->
              {#if item.total_masuk > 0}
                {@const pct = Math.round((item.stok_tersedia / item.total_masuk) * 100)}
                <div class="mt-2 h-1 w-full rounded-full bg-gray-100">
                  <div class="h-1 rounded-full {habis ? 'bg-amber-300' : 'bg-teal-400'}" style="width: {pct}%"></div>
                </div>
                <p class="mt-0.5 text-[10px] text-gray-400">{pct}% sisa</p>
              {/if}
              <!-- Last update -->
              {#if item.updatedAt}
                <p class="mt-1.5 text-[10px] text-gray-300">Update: {formatDate(item.updatedAt)}</p>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <!-- Footer summary -->
  <div class="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-white px-5 py-3 shadow-sm">
    <p class="text-xs text-gray-400">
      Menampilkan <span class="font-medium text-gray-700">{filteredGrouped.length}</span> dari {totalModel} model
    </p>
    <div class="flex gap-4 text-xs text-gray-400">
      <span>Total tersedia: <span class="font-semibold text-teal-700">{totalTersedia.toLocaleString('id-ID')} pcs</span></span>
      <span>Total keluar: <span class="font-semibold text-gray-700">{totalKeluar.toLocaleString('id-ID')} pcs</span></span>
    </div>
  </div>
{/if}
