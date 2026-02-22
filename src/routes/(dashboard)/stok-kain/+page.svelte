<script lang="ts">
  import { onMount } from 'svelte';
  import { getStokKainList, addStokKain, restockKain } from '$lib/firebase/stok-kain';
  import type { StokKain } from '$lib/types';
  import * as Sheet from '$lib/components/ui/sheet/index.js';

  // ── State ──────────────────────────────────────────────────────────
  let stokList    = $state<StokKain[]>([]);
  let loading     = $state(true);
  let saving      = $state(false);
  let errorMsg    = $state<string | null>(null);
  let successMsg  = $state<string | null>(null);
  let searchQuery = $state('');
  let sortBy      = $state<'nama' | 'tersedia_asc' | 'tersedia_desc'>('tersedia_asc');

  // Sheet state
  let openTambah  = $state(false);
  let openRestock = $state(false);
  let selectedKain = $state<StokKain | null>(null);

  // Form: tambah kain
  let fNama    = $state('');
  let fStok    = $state<number | ''>('');
  let fCatatan = $state('');

  // Form: restock
  let rYard    = $state<number | ''>('');
  let rCatatan = $state('');

  // ── Derived ────────────────────────────────────────────────────────
  let totalYard   = $derived(stokList.reduce((s, k) => s + k.stok_tersedia, 0));
  let totalJenis  = $derived(stokList.length);
  let kritisCount = $derived(stokList.filter(k => k.stok_tersedia < 100).length);

  let filteredList = $derived.by(() => {
    let list = stokList.filter(k =>
      !searchQuery || k.nama_kain.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (sortBy === 'nama')           list = [...list].sort((a, b) => a.nama_kain.localeCompare(b.nama_kain));
    if (sortBy === 'tersedia_asc')   list = [...list].sort((a, b) => a.stok_tersedia - b.stok_tersedia);
    if (sortBy === 'tersedia_desc')  list = [...list].sort((a, b) => b.stok_tersedia - a.stok_tersedia);
    return list;
  });

  // ── Helpers ────────────────────────────────────────────────────────
  function statusKain(tersedia: number) {
    if (tersedia < 100) return { label: 'Kritis',    cls: 'bg-red-100 text-red-700',    bar: 'bg-red-400'    };
    if (tersedia < 250) return { label: 'Perhatian', cls: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400'  };
    return               { label: 'Aman',      cls: 'bg-green-100 text-green-700',  bar: 'bg-blue-400'   };
  }

  function persen(tersedia: number, terpakai: number) {
    const total = tersedia + terpakai;
    return total > 0 ? Math.min((tersedia / total) * 100, 100) : 0;
  }

  function showSuccess(msg: string) {
    successMsg = msg;
    setTimeout(() => successMsg = null, 3000);
  }

  function showError(msg: string) {
    errorMsg = msg;
    setTimeout(() => errorMsg = null, 4000);
  }

  // ── Data ────────────────────────────────────────────────────────────
  async function load() {
    loading = true;
    errorMsg = null;
    try {
      stokList = await getStokKainList();
    } catch {
      showError('Gagal memuat data. Periksa koneksi Firebase.');
    } finally {
      loading = false;
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────
  async function submitTambah() {
    if (!fNama.trim() || fStok === '' || Number(fStok) <= 0) return;
    saving = true;
    try {
      await addStokKain({
        nama_kain: fNama.trim(),
        satuan: 'yard',
        stok_tersedia: Number(fStok),
        catatan: fCatatan.trim() || undefined,
      });
      await load();
      openTambah = false;
      fNama = ''; fStok = ''; fCatatan = '';
      showSuccess(`Kain "${fNama || 'baru'}" berhasil ditambahkan.`);
    } catch {
      showError('Gagal menyimpan data kain.');
    } finally {
      saving = false;
    }
  }

  async function submitRestock() {
    if (!selectedKain || rYard === '' || Number(rYard) <= 0) return;
    saving = true;
    try {
      await restockKain(selectedKain.id, Number(rYard), rCatatan.trim() || undefined);
      const nama = selectedKain.nama_kain;
      await load();
      openRestock = false;
      selectedKain = null; rYard = ''; rCatatan = '';
      showSuccess(`Restock ${nama} sebesar ${rYard} yard berhasil.`);
    } catch {
      showError('Gagal melakukan restock.');
    } finally {
      saving = false;
    }
  }

  function bukaTambah() {
    fNama = ''; fStok = ''; fCatatan = '';
    openTambah = true;
  }

  function bukaRestock(kain: StokKain) {
    selectedKain = kain;
    rYard = ''; rCatatan = '';
    openRestock = true;
  }

  onMount(load);
</script>

<!-- ── Toast Notification ──────────────────────────────────────── -->
{#if successMsg}
  <div class="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 shadow-lg">
    <svg class="h-4 w-4 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
    <p class="text-sm text-green-800">{successMsg}</p>
  </div>
{/if}
{#if errorMsg}
  <div class="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg">
    <svg class="h-4 w-4 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
    <p class="text-sm text-red-800">{errorMsg}</p>
  </div>
{/if}

<!-- ── Header ──────────────────────────────────────────────────── -->
<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Stok Kain</h1>
    <p class="mt-0.5 text-sm text-gray-500">Kelola inventaris kain untuk produksi</p>
  </div>
  <button
    onclick={bukaTambah}
    class="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-95"
  >
    <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
    Tambah Kain
  </button>
</div>

<!-- ── Stats Row ──────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-3 gap-4">
  <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
    <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Total Jenis</p>
    <p class="mt-1.5 text-2xl font-bold text-gray-900">{totalJenis}</p>
    <p class="text-xs text-gray-400">jenis kain terdaftar</p>
  </div>
  <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
    <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Total Stok</p>
    <p class="mt-1.5 text-2xl font-bold text-gray-900">{totalYard.toLocaleString('id-ID')}</p>
    <p class="text-xs text-gray-400">yard tersedia</p>
  </div>
  <div class="rounded-xl border {kritisCount > 0 ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white'} p-4 shadow-sm">
    <p class="text-xs font-medium uppercase tracking-wider {kritisCount > 0 ? 'text-red-500' : 'text-gray-400'}">Kain Kritis</p>
    <p class="mt-1.5 text-2xl font-bold {kritisCount > 0 ? 'text-red-700' : 'text-gray-900'}">{kritisCount}</p>
    <p class="text-xs {kritisCount > 0 ? 'text-red-500' : 'text-gray-400'}">di bawah 100 yard</p>
  </div>
</div>

<!-- ── Filter & Sort Bar ──────────────────────────────────────── -->
<div class="mb-4 flex flex-wrap items-center gap-3">
  <!-- Search -->
  <div class="relative flex-1 min-w-48">
    <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
    <input
      type="text"
      placeholder="Cari nama kain..."
      bind:value={searchQuery}
      class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
    />
  </div>

  <!-- Sort -->
  <div class="flex items-center gap-1.5">
    <span class="text-xs text-gray-500">Urutkan:</span>
    {#each ([['tersedia_asc', 'Kritis Dulu'], ['tersedia_desc', 'Terbanyak'], ['nama', 'A–Z']] as const) as [val, lbl]}
      <button
        onclick={() => sortBy = val}
        class="rounded-md px-2.5 py-1 text-xs font-medium transition
          {sortBy === val ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}"
      >
        {lbl}
      </button>
    {/each}
  </div>

  <button onclick={load} class="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 hover:bg-gray-50">
    <svg class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
    Refresh
  </button>
</div>

<!-- ── Table ──────────────────────────────────────────────────── -->
<div class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
  {#if loading}
    <div class="space-y-0">
      {#each Array(5) as _}
        <div class="flex items-center gap-4 border-b border-gray-50 px-5 py-4">
          <div class="h-4 w-40 rounded bg-gray-100 animate-pulse"></div>
          <div class="h-4 w-20 rounded bg-gray-100 animate-pulse ml-auto"></div>
          <div class="h-4 w-20 rounded bg-gray-100 animate-pulse"></div>
          <div class="h-6 w-16 rounded-full bg-gray-100 animate-pulse"></div>
        </div>
      {/each}
    </div>

  {:else if filteredList.length === 0}
    <div class="flex flex-col items-center justify-center py-16 gap-3">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
        <svg class="h-7 w-7 text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3"/>
        </svg>
      </div>
      {#if searchQuery}
        <p class="text-sm font-medium text-gray-500">Kain "{searchQuery}" tidak ditemukan</p>
        <button onclick={() => searchQuery = ''} class="text-xs text-blue-600 hover:underline">Hapus filter</button>
      {:else}
        <p class="text-sm font-medium text-gray-500">Belum ada data stok kain</p>
        <p class="text-xs text-gray-400">Mulai dengan menambahkan jenis kain pertama</p>
        <button onclick={bukaTambah} class="mt-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
          + Tambah Kain
        </button>
      {/if}
    </div>

  {:else}
    <!-- Table Header -->
    <div class="grid grid-cols-[2fr_1fr_1fr_1fr_2fr_auto] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
      <span>Nama Kain</span>
      <span class="text-right">Tersedia</span>
      <span class="text-right">Terpakai</span>
      <span class="text-center">Status</span>
      <span>Catatan</span>
      <span></span>
    </div>

    <!-- Table Rows -->
    {#each filteredList as kain}
      {@const st = statusKain(kain.stok_tersedia)}
      {@const pct = persen(kain.stok_tersedia, kain.stok_terpakai)}
      <div class="grid grid-cols-[2fr_1fr_1fr_1fr_2fr_auto] items-center gap-4 border-b border-gray-50 px-5 py-4 last:border-0 hover:bg-gray-50/50 transition">

        <!-- Nama + Progress bar -->
        <div>
          <p class="text-sm font-medium text-gray-800">{kain.nama_kain}</p>
          <div class="mt-1.5 flex items-center gap-2">
            <div class="h-1.5 w-28 rounded-full bg-gray-100">
              <div class="h-1.5 rounded-full {st.bar}" style="width: {pct.toFixed(0)}%"></div>
            </div>
            <span class="text-[10px] text-gray-400">{pct.toFixed(0)}% sisa</span>
          </div>
        </div>

        <!-- Tersedia -->
        <div class="text-right">
          <p class="text-sm font-semibold {kain.stok_tersedia < 100 ? 'text-red-600' : 'text-gray-800'}">
            {kain.stok_tersedia.toLocaleString('id-ID')}
          </p>
          <p class="text-xs text-gray-400">yard</p>
        </div>

        <!-- Terpakai -->
        <div class="text-right">
          <p class="text-sm text-gray-600">{kain.stok_terpakai.toLocaleString('id-ID')}</p>
          <p class="text-xs text-gray-400">yard</p>
        </div>

        <!-- Status badge -->
        <div class="flex justify-center">
          <span class="rounded-full px-2.5 py-1 text-xs font-semibold {st.cls}">{st.label}</span>
        </div>

        <!-- Catatan -->
        <div>
          <p class="truncate text-xs text-gray-500">{kain.catatan ?? '—'}</p>
        </div>

        <!-- Action -->
        <div class="flex shrink-0 items-center gap-2">
          <button
            onclick={() => bukaRestock(kain)}
            class="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
          >
            <svg class="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Restock
          </button>
        </div>

      </div>
    {/each}

    <!-- Footer -->
    <div class="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-3">
      <p class="text-xs text-gray-400">
        Menampilkan {filteredList.length} dari {totalJenis} jenis kain
      </p>
      <p class="text-xs text-gray-400">
        Total tersedia: <span class="font-semibold text-gray-700">{totalYard.toLocaleString('id-ID')} yard</span>
      </p>
    </div>
  {/if}
</div>

<!-- ── Sheet: Tambah Kain ──────────────────────────────────────── -->
<Sheet.Root bind:open={openTambah}>
  <Sheet.Content side="right" class="w-full max-w-md">
    <Sheet.Header>
      <Sheet.Title>Tambah Kain Baru</Sheet.Title>
      <Sheet.Description>Daftarkan jenis kain baru ke inventaris gudang.</Sheet.Description>
    </Sheet.Header>

    <div class="mt-6 space-y-4 px-6">
      <!-- Nama Kain -->
      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="nama-kain">
          Nama Kain <span class="text-red-500">*</span>
        </label>
        <input
          id="nama-kain"
          type="text"
          placeholder="Contoh: Katun Premium, Wolfis, Jersey..."
          bind:value={fNama}
          class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <!-- Satuan (fixed) -->
      <div>
        <p class="mb-1.5 block text-sm font-medium text-gray-700">Satuan</p>
        <div class="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-500">
          <svg class="h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          Yard (tetap)
        </div>
      </div>

      <!-- Stok Awal -->
      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="stok-awal">
          Stok Awal (yard) <span class="text-red-500">*</span>
        </label>
        <input
          id="stok-awal"
          type="number"
          min="1"
          placeholder="0"
          bind:value={fStok}
          class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <!-- Catatan -->
      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="catatan-tambah">
          Catatan <span class="text-xs font-normal text-gray-400">(opsional)</span>
        </label>
        <textarea
          id="catatan-tambah"
          rows="3"
          placeholder="Catatan tambahan tentang kain ini..."
          bind:value={fCatatan}
          class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        ></textarea>
      </div>
    </div>

    <Sheet.Footer class="mt-6 gap-2 px-6">
      <Sheet.Close>
        <button class="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
          Batal
        </button>
      </Sheet.Close>
      <button
        onclick={submitTambah}
        disabled={saving || !fNama.trim() || fStok === '' || Number(fStok) <= 0}
        class="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'Menyimpan...' : 'Simpan Kain'}
      </button>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>

<!-- ── Sheet: Restock ────────────────────────────────────────────── -->
<Sheet.Root bind:open={openRestock}>
  <Sheet.Content side="right" class="w-full max-w-md">
    <Sheet.Header>
      <Sheet.Title>Restock Kain</Sheet.Title>
      <Sheet.Description>Tambah stok kain yang sudah terdaftar.</Sheet.Description>
    </Sheet.Header>

    <div class="mt-6 space-y-4 px-6">
      <!-- Info kain -->
      {#if selectedKain}
        <div class="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p class="text-xs font-medium text-gray-500 uppercase tracking-wider">Kain yang di-restock</p>
          <p class="mt-1 text-base font-semibold text-gray-800">{selectedKain.nama_kain}</p>
          <div class="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <span>Saat ini: <strong class="text-gray-700">{selectedKain.stok_tersedia.toLocaleString('id-ID')} yard</strong></span>
            <span>Terpakai: <strong class="text-gray-700">{selectedKain.stok_terpakai.toLocaleString('id-ID')} yard</strong></span>
          </div>
          <span class="mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold {statusKain(selectedKain.stok_tersedia).cls}">
            {statusKain(selectedKain.stok_tersedia).label}
          </span>
        </div>
      {/if}

      <!-- Jumlah Restock -->
      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="restock-yard">
          Tambah Stok (yard) <span class="text-red-500">*</span>
        </label>
        <input
          id="restock-yard"
          type="number"
          min="1"
          placeholder="0"
          bind:value={rYard}
          class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        {#if selectedKain && rYard !== '' && Number(rYard) > 0}
          <p class="mt-1.5 text-xs text-green-600">
            Stok setelah restock: <strong>{(selectedKain.stok_tersedia + Number(rYard)).toLocaleString('id-ID')} yard</strong>
          </p>
        {/if}
      </div>

      <!-- Catatan -->
      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="catatan-restock">
          Catatan <span class="text-xs font-normal text-gray-400">(opsional)</span>
        </label>
        <textarea
          id="catatan-restock"
          rows="3"
          placeholder="Contoh: Pembelian dari supplier X..."
          bind:value={rCatatan}
          class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        ></textarea>
      </div>
    </div>

    <Sheet.Footer class="mt-6 gap-2 px-6">
      <Sheet.Close>
        <button class="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
          Batal
        </button>
      </Sheet.Close>
      <button
        onclick={submitRestock}
        disabled={saving || rYard === '' || Number(rYard) <= 0}
        class="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'Menyimpan...' : 'Restock Sekarang'}
      </button>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>
