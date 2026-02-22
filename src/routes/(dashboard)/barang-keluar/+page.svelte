<script lang="ts">
  import { onMount } from 'svelte';
  import { getStokBarangJadi, catatBarangKeluar, getRiwayatBarangKeluar } from '$lib/firebase/barang-jadi';
  import { currentUser, userRole } from '$lib/stores/auth.store';
  import type { StokBarangJadi, BarangKeluar, UkuranBaju } from '$lib/types';
  import * as Sheet from '$lib/components/ui/sheet/index.js';

  const UKURAN_ORDER: UkuranBaju[] = ['S', 'M', 'L', 'XL', 'XXL'];

  // ── State ──────────────────────────────────────────────────────────
  let stokList    = $state<StokBarangJadi[]>([]);
  let riwayat     = $state<BarangKeluar[]>([]);
  let loading     = $state(true);
  let saving      = $state(false);
  let errorMsg    = $state<string | null>(null);
  let successMsg  = $state<string | null>(null);
  let searchQuery = $state('');
  let openCatat   = $state(false);

  // Form
  let fModelId    = $state('');
  let fTujuan     = $state('');
  let fKeterangan = $state('');
  let fJumlah     = $state<Partial<Record<UkuranBaju, number>>>({});

  // ── Derived ────────────────────────────────────────────────────────
  let canCatat = $derived(
    $userRole === 'admin_gudang' || $userRole === 'kepala_keluar' || $userRole === 'developer'
  );

  // Models that have stock > 0
  let modelDenganStok = $derived.by(() => {
    const map = new Map<string, { model_id: string; nama_model: string; stok: StokBarangJadi[] }>();
    for (const item of stokList) {
      if (item.stok_tersedia > 0) {
        if (!map.has(item.model_id)) {
          map.set(item.model_id, { model_id: item.model_id, nama_model: item.nama_model, stok: [] });
        }
        map.get(item.model_id)!.stok.push(item);
      }
    }
    return [...map.values()].sort((a, b) => a.nama_model.localeCompare(b.nama_model));
  });

  let selectedModelData = $derived(modelDenganStok.find(m => m.model_id === fModelId) ?? null);

  let detailKeluar = $derived(
    selectedModelData
      ? UKURAN_ORDER
          .filter(u => {
            const s = selectedModelData!.stok.find(i => i.ukuran === u);
            return s && s.stok_tersedia > 0 && (fJumlah[u] ?? 0) > 0;
          })
          .map(u => ({ ukuran: u, jumlah_pcs: fJumlah[u]! }))
      : []
  );

  let totalPcs  = $derived(detailKeluar.reduce((s, d) => s + d.jumlah_pcs, 0));
  let canSubmit = $derived(fModelId !== '' && fTujuan.trim() !== '' && totalPcs > 0);

  // Stats
  let totalPengiriman   = $derived(riwayat.length);
  let totalPcsKeluar    = $derived(riwayat.reduce((s, r) => s + r.total_pcs, 0));
  let totalStokTersedia = $derived(stokList.reduce((s, i) => s + i.stok_tersedia, 0));
  let totalModelTersedia = $derived(modelDenganStok.length);

  // Filter riwayat
  let filteredRiwayat = $derived.by(() => {
    if (!searchQuery.trim()) return riwayat;
    const q = searchQuery.toLowerCase().trim();
    return riwayat.filter(r =>
      r.nama_model.toLowerCase().includes(q) || r.tujuan.toLowerCase().includes(q)
    );
  });

  // Validation helper
  function maxUkuran(ukuran: UkuranBaju): number {
    if (!selectedModelData) return 0;
    return selectedModelData.stok.find(i => i.ukuran === ukuran)?.stok_tersedia ?? 0;
  }

  function melebihiStok(ukuran: UkuranBaju): boolean {
    return (fJumlah[ukuran] ?? 0) > maxUkuran(ukuran);
  }

  let adaYangMelebihi = $derived(
    selectedModelData
      ? UKURAN_ORDER.some(u => melebihiStok(u))
      : false
  );

  // ── Helpers ────────────────────────────────────────────────────────
  function formatDate(ts: any): string {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatDateTime(ts: any): string {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function showSuccess(msg: string) {
    successMsg = msg;
    setTimeout(() => (successMsg = null), 3500);
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
      [stokList, riwayat] = await Promise.all([
        getStokBarangJadi(),
        getRiwayatBarangKeluar(),
      ]);
    } catch {
      showError('Gagal memuat data. Periksa koneksi Firebase.');
    } finally {
      loading = false;
    }
  }

  // ── Actions ──────────────────────────────────────────────────────
  function bukaCatat() {
    fModelId    = '';
    fTujuan     = '';
    fKeterangan = '';
    fJumlah     = {};
    openCatat   = true;
  }

  async function submitCatat() {
    if (!canSubmit || !$currentUser || adaYangMelebihi) return;
    saving = true;
    try {
      await catatBarangKeluar(
        {
          model_id:    fModelId,
          nama_model:  selectedModelData!.nama_model,
          detail_keluar: detailKeluar,
          tujuan:      fTujuan.trim(),
          keterangan:  fKeterangan.trim() || undefined,
        },
        $currentUser.uid
      );
      await load();
      openCatat = false;
      showSuccess(`Pengiriman ${totalPcs} pcs "${selectedModelData!.nama_model}" ke ${fTujuan.trim()} berhasil dicatat.`);
    } catch (e: any) {
      showError(e?.message ?? 'Gagal mencatat barang keluar.');
    } finally {
      saving = false;
    }
  }

  onMount(load);
</script>

<!-- ── Toast ─────────────────────────────────────────────────────── -->
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

<!-- ── Header ─────────────────────────────────────────────────────── -->
<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Barang Keluar</h1>
    <p class="mt-0.5 text-sm text-gray-500">Catat dan riwayat pengiriman barang jadi</p>
  </div>
  <div class="flex items-center gap-2">
    <button
      onclick={load}
      class="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
    >
      <svg class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
      Refresh
    </button>
    {#if canCatat}
      <button
        onclick={bukaCatat}
        class="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 active:scale-95"
      >
        <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Catat Keluar
      </button>
    {/if}
  </div>
</div>

<!-- ── Stats ──────────────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
  <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
    <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Total Pengiriman</p>
    {#if loading}
      <div class="mt-1.5 h-7 w-12 animate-pulse rounded bg-gray-100"></div>
    {:else}
      <p class="mt-1.5 text-2xl font-bold text-gray-900">{totalPengiriman}</p>
    {/if}
    <p class="text-xs text-gray-400">catatan pengiriman</p>
  </div>

  <div class="rounded-xl border border-green-100 bg-green-50 p-4 shadow-sm">
    <p class="text-xs font-medium uppercase tracking-wider text-green-600">Total Pcs Keluar</p>
    {#if loading}
      <div class="mt-1.5 h-7 w-20 animate-pulse rounded bg-green-100"></div>
    {:else}
      <p class="mt-1.5 text-2xl font-bold text-green-700">{totalPcsKeluar.toLocaleString('id-ID')}</p>
    {/if}
    <p class="text-xs text-green-600">pcs terkirim</p>
  </div>

  <div class="rounded-xl border border-teal-100 bg-teal-50 p-4 shadow-sm">
    <p class="text-xs font-medium uppercase tracking-wider text-teal-600">Stok Tersedia</p>
    {#if loading}
      <div class="mt-1.5 h-7 w-20 animate-pulse rounded bg-teal-100"></div>
    {:else}
      <p class="mt-1.5 text-2xl font-bold text-teal-700">{totalStokTersedia.toLocaleString('id-ID')}</p>
    {/if}
    <p class="text-xs text-teal-600">pcs siap kirim</p>
  </div>

  <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
    <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Model Tersedia</p>
    {#if loading}
      <div class="mt-1.5 h-7 w-10 animate-pulse rounded bg-gray-100"></div>
    {:else}
      <p class="mt-1.5 text-2xl font-bold text-gray-900">{totalModelTersedia}</p>
    {/if}
    <p class="text-xs text-gray-400">model ada stoknya</p>
  </div>
</div>

<!-- ── Filter + Table ─────────────────────────────────────────────── -->
<div class="mb-4 flex items-center gap-3">
  <div class="relative flex-1">
    <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
    <input
      type="text"
      placeholder="Cari model atau tujuan..."
      bind:value={searchQuery}
      class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
    />
  </div>
</div>

<!-- Riwayat table -->
<div class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
  {#if loading}
    <div class="space-y-0">
      {#each Array(5) as _}
        <div class="flex items-center gap-4 border-b border-gray-50 px-5 py-4">
          <div class="h-4 w-24 animate-pulse rounded bg-gray-100"></div>
          <div class="h-4 w-40 animate-pulse rounded bg-gray-100"></div>
          <div class="ml-auto h-4 w-16 animate-pulse rounded bg-gray-100"></div>
          <div class="h-4 w-24 animate-pulse rounded bg-gray-100"></div>
        </div>
      {/each}
    </div>

  {:else if filteredRiwayat.length === 0}
    <div class="flex flex-col items-center justify-center gap-3 py-16">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
        <svg class="h-7 w-7 text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
        </svg>
      </div>
      {#if searchQuery}
        <p class="text-sm font-medium text-gray-500">Tidak ada hasil untuk "{searchQuery}"</p>
        <button onclick={() => (searchQuery = '')} class="text-xs text-green-600 hover:underline">Hapus pencarian</button>
      {:else}
        <p class="text-sm font-medium text-gray-500">Belum ada catatan barang keluar</p>
        <p class="text-xs text-gray-400">Mulai dengan mencatat pengiriman pertama</p>
        {#if canCatat}
          <button
            onclick={bukaCatat}
            class="mt-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
          >
            + Catat Keluar
          </button>
        {/if}
      {/if}
    </div>

  {:else}
    <!-- Table header -->
    <div class="grid grid-cols-[1fr_1fr_2fr_1fr_1fr] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
      <span>Tanggal</span>
      <span>Model</span>
      <span>Detail Ukuran</span>
      <span class="text-center">Total PCS</span>
      <span>Tujuan</span>
    </div>

    <!-- Rows -->
    {#each filteredRiwayat as r}
      <div class="grid grid-cols-[1fr_1fr_2fr_1fr_1fr] items-start gap-4 border-b border-gray-50 px-5 py-4 last:border-0 hover:bg-gray-50/50 transition">
        <!-- Tanggal -->
        <div>
          <p class="text-sm text-gray-700">{formatDate(r.tanggal_keluar)}</p>
          <p class="text-xs text-gray-400">{formatDateTime(r.tanggal_keluar).split(',')[1]?.trim() ?? ''}</p>
        </div>

        <!-- Model -->
        <div>
          <p class="text-sm font-medium text-gray-800">{r.nama_model}</p>
        </div>

        <!-- Detail ukuran -->
        <div class="flex flex-wrap gap-1">
          {#each r.detail_keluar as d}
            <span class="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
              {d.ukuran}: {d.jumlah_pcs}
            </span>
          {/each}
        </div>

        <!-- Total PCS -->
        <div class="text-center">
          <p class="text-sm font-semibold text-gray-800">{r.total_pcs}</p>
          <p class="text-xs text-gray-400">pcs</p>
        </div>

        <!-- Tujuan + keterangan -->
        <div>
          <p class="text-sm font-medium text-gray-700">{r.tujuan}</p>
          {#if r.keterangan}
            <p class="mt-0.5 truncate text-xs text-gray-400">{r.keterangan}</p>
          {/if}
        </div>
      </div>
    {/each}

    <!-- Footer -->
    <div class="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-3">
      <p class="text-xs text-gray-400">
        Menampilkan {filteredRiwayat.length} dari {totalPengiriman} pengiriman
      </p>
      <p class="text-xs text-gray-400">
        Total: <span class="font-semibold text-gray-700">{totalPcsKeluar.toLocaleString('id-ID')} pcs</span>
      </p>
    </div>
  {/if}
</div>

<!-- ── Sheet: Catat Barang Keluar ─────────────────────────────────── -->
<Sheet.Root bind:open={openCatat}>
  <Sheet.Content side="right" class="flex w-full max-w-md flex-col">
    <Sheet.Header class="shrink-0 px-6 pt-6">
      <Sheet.Title>Catat Barang Keluar</Sheet.Title>
      <Sheet.Description>Rekam pengiriman barang jadi ke tujuan.</Sheet.Description>
    </Sheet.Header>

    <div class="flex-1 overflow-y-auto px-6 py-5">
      <div class="space-y-5">

      <!-- Pilih Model -->
      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="model-keluar">
          Model Baju <span class="text-red-500">*</span>
        </label>
        {#if modelDenganStok.length === 0}
          <div class="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
            <p class="text-sm text-amber-700">Tidak ada barang jadi yang tersedia.</p>
            <a href="/barang-jadi" class="mt-1 block text-xs font-medium text-amber-600 hover:underline">
              Lihat stok barang jadi →
            </a>
          </div>
        {:else}
          <select
            id="model-keluar"
            value={fModelId}
            onchange={(e) => { fModelId = e.currentTarget.value; fJumlah = {}; }}
            class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
          >
            <option value="">— Pilih model —</option>
            {#each modelDenganStok as m}
              <option value={m.model_id}>{m.nama_model}</option>
            {/each}
          </select>
        {/if}
      </div>

      <!-- Stok info + input per ukuran -->
      {#if selectedModelData}
        <div>
          <p class="mb-2 text-sm font-medium text-gray-700">
            Jumlah Per Ukuran <span class="text-red-500">*</span>
          </p>
          <div class="space-y-2">
            {#each UKURAN_ORDER.filter(u => selectedModelData!.stok.some(i => i.ukuran === u)) as ukuran}
              {@const stokItem  = selectedModelData.stok.find(i => i.ukuran === ukuran)!}
              {@const melebihi  = melebihiStok(ukuran)}
              <div class="flex items-center gap-3 rounded-lg border {melebihi ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'} px-3 py-2">
                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-gray-700 shadow-sm">
                  {ukuran}
                </div>
                <div class="flex-1">
                  <p class="text-xs text-gray-500">
                    Tersedia: <span class="font-semibold text-gray-700">{stokItem.stok_tersedia} pcs</span>
                  </p>
                  {#if melebihi}
                    <p class="text-xs text-red-600">Melebihi stok!</p>
                  {/if}
                </div>
                <input
                  type="number"
                  min="0"
                  max={stokItem.stok_tersedia}
                  placeholder="0"
                  bind:value={fJumlah[ukuran]}
                  class="w-20 rounded-lg border {melebihi ? 'border-red-300' : 'border-gray-200'} bg-white px-2 py-1.5 text-center text-sm text-gray-800 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
                />
              </div>
            {/each}
          </div>
          {#if totalPcs > 0}
            <p class="mt-2 text-xs text-gray-500">
              Total keluar: <span class="font-semibold text-gray-800">{totalPcs} pcs</span>
            </p>
          {/if}
        </div>
      {/if}

      <!-- Tujuan -->
      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="tujuan-keluar">
          Tujuan Pengiriman <span class="text-red-500">*</span>
        </label>
        <input
          id="tujuan-keluar"
          type="text"
          placeholder="Contoh: Toko Anisa, Reseller Jakarta..."
          bind:value={fTujuan}
          class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
        />
      </div>

      <!-- Keterangan -->
      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="keterangan-keluar">
          Keterangan <span class="text-xs font-normal text-gray-400">(opsional)</span>
        </label>
        <textarea
          id="keterangan-keluar"
          rows="3"
          placeholder="Catatan tambahan pengiriman..."
          bind:value={fKeterangan}
          class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
        ></textarea>
      </div>

      </div>
    </div>

    <Sheet.Footer class="shrink-0 gap-2 border-t border-gray-100 px-6 py-4">
      <Sheet.Close>
        <button class="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
          Batal
        </button>
      </Sheet.Close>
      <button
        onclick={submitCatat}
        disabled={saving || !canSubmit || adaYangMelebihi}
        class="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? 'Menyimpan...' : 'Catat Keluar'}
      </button>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>
