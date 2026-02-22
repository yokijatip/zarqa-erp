<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getBatchList, createBatchProduksi } from '$lib/firebase/batch-produksi';
  import { getModelBajuList } from '$lib/firebase/model-baju';
  import { currentUser, isAdmin } from '$lib/stores/auth.store';
  import type { BatchProduksi, ModelBaju, StatusBatch, UkuranBaju } from '$lib/types';
  import { STATUS_LABEL } from '$lib/types';
  import * as Sheet from '$lib/components/ui/sheet/index.js';

  const UKURAN_ORDER: UkuranBaju[] = ['S', 'M', 'L', 'XL', 'XXL'];

  const STATUS_STYLE: Record<StatusBatch, string> = {
    PENDING_CUTTING:     'bg-slate-100 text-slate-700',
    CUTTING_IN_PROGRESS: 'bg-orange-100 text-orange-700',
    CUTTING_DONE:        'bg-yellow-100 text-yellow-700',
    JAHIT_IN_PROGRESS:   'bg-blue-100 text-blue-700',
    JAHIT_DONE:          'bg-teal-100 text-teal-700',
    STEAM_IN_PROGRESS:   'bg-purple-100 text-purple-700',
    STEAM_DONE:          'bg-emerald-100 text-emerald-700',
    COMPLETED:           'bg-green-100 text-green-700',
  };

  const STATUS_OPTIONS: Array<{ value: StatusBatch | 'SEMUA'; label: string }> = [
    { value: 'SEMUA',              label: 'Semua Status' },
    { value: 'PENDING_CUTTING',    label: STATUS_LABEL.PENDING_CUTTING },
    { value: 'CUTTING_IN_PROGRESS',label: STATUS_LABEL.CUTTING_IN_PROGRESS },
    { value: 'CUTTING_DONE',       label: STATUS_LABEL.CUTTING_DONE },
    { value: 'JAHIT_IN_PROGRESS',  label: STATUS_LABEL.JAHIT_IN_PROGRESS },
    { value: 'JAHIT_DONE',         label: STATUS_LABEL.JAHIT_DONE },
    { value: 'STEAM_IN_PROGRESS',  label: STATUS_LABEL.STEAM_IN_PROGRESS },
    { value: 'STEAM_DONE',         label: STATUS_LABEL.STEAM_DONE },
    { value: 'COMPLETED',          label: STATUS_LABEL.COMPLETED },
  ];

  // ── State ──────────────────────────────────────────────────────────
  let batchList    = $state<BatchProduksi[]>([]);
  let modelList    = $state<ModelBaju[]>([]);
  let loading      = $state(true);
  let saving       = $state(false);
  let errorMsg     = $state<string | null>(null);
  let successMsg   = $state<string | null>(null);
  let searchQuery  = $state('');
  let filterStatus = $state<StatusBatch | 'SEMUA'>('SEMUA');
  let openBuat     = $state(false);

  // Form
  let fModelId = $state('');
  let fCatatan = $state('');
  let fJumlah  = $state<Partial<Record<UkuranBaju, number>>>({});

  // ── Derived ────────────────────────────────────────────────────────
  let selectedModel = $derived(modelList.find(m => m.id === fModelId) ?? null);

  let detailUkuran = $derived(
    selectedModel
      ? UKURAN_ORDER
          .filter(u => selectedModel!.ukuran_tersedia.includes(u) && (fJumlah[u] ?? 0) > 0)
          .map(u => ({ ukuran: u, jumlah_pcs: fJumlah[u]! }))
      : []
  );

  let totalPcs = $derived(detailUkuran.reduce((s, d) => s + d.jumlah_pcs, 0));

  let kainDibutuhkan = $derived(
    selectedModel && totalPcs > 0
      ? selectedModel.kebutuhan_kain.map(k => ({
          kain_id:     k.kain_id,
          nama_kain:   k.nama_kain,
          yard_dipakai: parseFloat((k.yard_per_pcs * totalPcs).toFixed(2)),
        }))
      : []
  );

  let canSubmit    = $derived(fModelId !== '' && totalPcs > 0);
  let totalOrder   = $derived(batchList.length);
  let aktifCount   = $derived(batchList.filter(b => b.status !== 'COMPLETED').length);
  let selesaiCount = $derived(batchList.filter(b => b.status === 'COMPLETED').length);

  let filteredList = $derived.by(() => {
    let list = batchList;
    if (filterStatus !== 'SEMUA') list = list.filter(b => b.status === filterStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(b => b.nama_model.toLowerCase().includes(q));
    }
    return list;
  });

  // ── Helpers ────────────────────────────────────────────────────────
  function formatDate(ts: any): string {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function showSuccess(msg: string) {
    successMsg = msg;
    setTimeout(() => (successMsg = null), 3000);
  }

  function showError(msg: string) {
    errorMsg = msg;
    setTimeout(() => (errorMsg = null), 4000);
  }

  // ── Data ──────────────────────────────────────────────────────────
  async function load() {
    loading = true;
    errorMsg = null;
    try {
      batchList = await getBatchList();
    } catch {
      showError('Gagal memuat data. Periksa koneksi Firebase.');
    } finally {
      loading = false;
    }
  }

  async function loadModels() {
    try {
      modelList = await getModelBajuList(true);
    } catch {
      // silent — tidak kritis
    }
  }

  // ── Actions ──────────────────────────────────────────────────────
  function bukaBuat() {
    fModelId = '';
    fCatatan = '';
    fJumlah  = {};
    openBuat = true;
  }

  async function submitBuat() {
    if (!canSubmit || !$currentUser) return;
    saving = true;
    try {
      await createBatchProduksi(
        {
          model_id:      fModelId,
          nama_model:    selectedModel!.nama_model,
          detail_ukuran: detailUkuran,
          kain_digunakan: kainDibutuhkan,
          catatan_admin: fCatatan.trim() || undefined,
        },
        $currentUser.uid
      );
      await load();
      openBuat = false;
      showSuccess(`Order "${selectedModel!.nama_model}" berhasil dibuat.`);
    } catch (e: any) {
      showError(e?.message ?? 'Gagal membuat order produksi.');
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    load();
    loadModels();
  });
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
    <h1 class="text-xl font-semibold text-gray-900">Order Produksi</h1>
    <p class="mt-0.5 text-sm text-gray-500">Buat dan pantau order produksi baju</p>
  </div>
  {#if $isAdmin}
    <button
      onclick={bukaBuat}
      class="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-95"
    >
      <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      Buat Order
    </button>
  {/if}
</div>

<!-- ── Stats ──────────────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-3 gap-4">
  <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
    <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Total Order</p>
    <p class="mt-1.5 text-2xl font-bold text-gray-900">{totalOrder}</p>
    <p class="text-xs text-gray-400">semua order tercatat</p>
  </div>
  <div class="rounded-xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
    <p class="text-xs font-medium uppercase tracking-wider text-blue-500">Sedang Berjalan</p>
    <p class="mt-1.5 text-2xl font-bold text-blue-700">{aktifCount}</p>
    <p class="text-xs text-blue-500">dalam proses produksi</p>
  </div>
  <div class="rounded-xl border border-green-100 bg-green-50 p-4 shadow-sm">
    <p class="text-xs font-medium uppercase tracking-wider text-green-600">Selesai</p>
    <p class="mt-1.5 text-2xl font-bold text-green-700">{selesaiCount}</p>
    <p class="text-xs text-green-600">order telah selesai</p>
  </div>
</div>

<!-- ── Filter Bar ─────────────────────────────────────────────────── -->
<div class="mb-4 flex flex-wrap items-center gap-3">
  <!-- Search -->
  <div class="relative min-w-48 flex-1">
    <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
    <input
      type="text"
      placeholder="Cari nama model..."
      bind:value={searchQuery}
      class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
    />
  </div>

  <!-- Status Filter -->
  <select
    bind:value={filterStatus}
    class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
  >
    {#each STATUS_OPTIONS as opt}
      <option value={opt.value}>{opt.label}</option>
    {/each}
  </select>

  <!-- Refresh -->
  <button
    onclick={load}
    class="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
  >
    <svg class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
    Refresh
  </button>
</div>

<!-- ── Table ──────────────────────────────────────────────────────── -->
<div class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
  {#if loading}
    <!-- Skeleton -->
    <div class="space-y-0">
      {#each Array(5) as _}
        <div class="flex items-center gap-4 border-b border-gray-50 px-5 py-4">
          <div class="h-4 w-44 animate-pulse rounded bg-gray-100"></div>
          <div class="ml-auto h-4 w-12 animate-pulse rounded bg-gray-100"></div>
          <div class="h-6 w-28 animate-pulse rounded-full bg-gray-100"></div>
          <div class="h-4 w-20 animate-pulse rounded bg-gray-100"></div>
          <div class="h-8 w-16 animate-pulse rounded-lg bg-gray-100"></div>
        </div>
      {/each}
    </div>

  {:else if filteredList.length === 0}
    <!-- Empty State -->
    <div class="flex flex-col items-center justify-center gap-3 py-16">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
        <svg class="h-7 w-7 text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
        </svg>
      </div>
      {#if searchQuery || filterStatus !== 'SEMUA'}
        <p class="text-sm font-medium text-gray-500">Tidak ada order yang cocok dengan filter</p>
        <button
          onclick={() => { searchQuery = ''; filterStatus = 'SEMUA'; }}
          class="text-xs text-blue-600 hover:underline"
        >
          Hapus filter
        </button>
      {:else}
        <p class="text-sm font-medium text-gray-500">Belum ada order produksi</p>
        <p class="text-xs text-gray-400">Mulai dengan membuat order produksi pertama</p>
        {#if $isAdmin}
          <button
            onclick={bukaBuat}
            class="mt-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            + Buat Order
          </button>
        {/if}
      {/if}
    </div>

  {:else}
    <!-- Table Header -->
    <div class="grid grid-cols-[2fr_1fr_2fr_1fr_auto] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
      <span>Model</span>
      <span class="text-center">Total PCS</span>
      <span>Status</span>
      <span>Tanggal</span>
      <span></span>
    </div>

    <!-- Rows -->
    {#each filteredList as batch}
      <div
        class="grid cursor-pointer grid-cols-[2fr_1fr_2fr_1fr_auto] items-center gap-4 border-b border-gray-50 px-5 py-4 transition last:border-0 hover:bg-gray-50/60"
        onclick={() => goto(`/order-produksi/${batch.id}`)}
        role="row"
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && goto(`/order-produksi/${batch.id}`)}
      >
        <!-- Model + ukuran pills -->
        <div>
          <p class="text-sm font-medium text-gray-800">{batch.nama_model}</p>
          <div class="mt-1 flex flex-wrap gap-1">
            {#each batch.detail_ukuran as du}
              <span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                {du.ukuran}: {du.jumlah_pcs}
              </span>
            {/each}
          </div>
        </div>

        <!-- Total PCS -->
        <div class="text-center">
          <p class="text-sm font-semibold text-gray-800">{batch.total_pcs}</p>
          <p class="text-xs text-gray-400">pcs</p>
        </div>

        <!-- Status -->
        <div>
          <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold {STATUS_STYLE[batch.status]}">
            {STATUS_LABEL[batch.status]}
          </span>
        </div>

        <!-- Tanggal -->
        <div>
          <p class="text-xs text-gray-600">{formatDate(batch.createdAt)}</p>
        </div>

        <!-- Aksi -->
        <div class="flex shrink-0 items-center">
          <span class="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50">
            Detail
            <svg class="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </span>
        </div>
      </div>
    {/each}

    <!-- Footer -->
    <div class="border-t border-gray-100 bg-gray-50 px-5 py-3">
      <p class="text-xs text-gray-400">
        Menampilkan {filteredList.length} dari {totalOrder} order
      </p>
    </div>
  {/if}
</div>

<!-- ── Sheet: Buat Order ──────────────────────────────────────────── -->
<Sheet.Root bind:open={openBuat}>
  <Sheet.Content side="right" class="flex w-full max-w-md flex-col">
    <Sheet.Header class="shrink-0 px-6 pt-6">
      <Sheet.Title>Buat Order Produksi</Sheet.Title>
      <Sheet.Description>Pilih model dan tentukan jumlah pcs per ukuran.</Sheet.Description>
    </Sheet.Header>

    <div class="flex-1 overflow-y-auto px-6 py-5">
      <div class="space-y-5">
      <!-- Pilih Model -->
      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="model-select">
          Model Baju <span class="text-red-500">*</span>
        </label>
        {#if modelList.length === 0}
          <p class="text-xs text-gray-400">Belum ada model aktif. Tambahkan model baju terlebih dahulu.</p>
        {:else}
          <select
            id="model-select"
            value={fModelId}
            onchange={(e) => { fModelId = e.currentTarget.value; fJumlah = {}; }}
            class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="">— Pilih model —</option>
            {#each modelList as model}
              <option value={model.id}>{model.nama_model}</option>
            {/each}
          </select>
        {/if}
      </div>

      <!-- Jumlah Per Ukuran -->
      {#if selectedModel}
        <div>
          <p class="mb-2 text-sm font-medium text-gray-700">
            Jumlah Per Ukuran <span class="text-red-500">*</span>
          </p>
          <div class="grid gap-2" style="grid-template-columns: repeat({selectedModel.ukuran_tersedia.length}, minmax(0, 1fr))">
            {#each UKURAN_ORDER.filter(u => selectedModel!.ukuran_tersedia.includes(u)) as ukuran}
              <div class="text-center">
                <label class="mb-1 block text-xs font-semibold text-gray-600" for="ukuran-{ukuran}">
                  {ukuran}
                </label>
                <input
                  id="ukuran-{ukuran}"
                  type="number"
                  min="0"
                  placeholder="0"
                  bind:value={fJumlah[ukuran]}
                  class="w-full rounded-lg border border-gray-200 px-2 py-2 text-center text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            {/each}
          </div>
          {#if totalPcs > 0}
            <p class="mt-2 text-xs text-gray-500">
              Total: <span class="font-semibold text-gray-800">{totalPcs} pcs</span>
            </p>
          {/if}
        </div>

        <!-- Kebutuhan Kain (auto-calculated) -->
        {#if kainDibutuhkan.length > 0}
          <div class="rounded-xl border border-amber-100 bg-amber-50 p-4">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-700">Kain yang Dibutuhkan</p>
            <div class="space-y-1.5">
              {#each kainDibutuhkan as kain}
                <div class="flex items-center justify-between text-sm">
                  <span class="text-gray-700">{kain.nama_kain}</span>
                  <span class="font-semibold text-amber-800">{kain.yard_dipakai} yard</span>
                </div>
              {/each}
            </div>
            <p class="mt-2 text-[10px] text-amber-600">
              Stok kain akan dikurangi otomatis saat order dibuat.
            </p>
          </div>
        {/if}
      {/if}

      <!-- Catatan -->
      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="catatan-order">
          Catatan Admin <span class="text-xs font-normal text-gray-400">(opsional)</span>
        </label>
        <textarea
          id="catatan-order"
          rows="3"
          placeholder="Catatan khusus untuk order ini..."
          bind:value={fCatatan}
          class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
        onclick={submitBuat}
        disabled={saving || !canSubmit}
        class="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? 'Membuat...' : 'Buat Order'}
      </button>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>
