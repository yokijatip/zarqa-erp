<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import { onMount } from "svelte";
  import { stokPotonganCache, batchCache } from "$lib/stores/data-cache.svelte";
  import { sinkronStokPotonganBatch } from "$lib/firebase/batch-produksi";
  import type { StokPotongan, UkuranBaju } from "$lib/types";
  import { Button } from "$lib/components/ui/button";
  import StatCard from "$lib/components/StatCard.svelte";
  import ScissorsIcon from "@lucide/svelte/icons/scissors";
  import PackageIcon from "@lucide/svelte/icons/package";
  import PackageXIcon from "@lucide/svelte/icons/package-x";

  const URUTAN_UKURAN: UkuranBaju[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

  // ── State ──────────────────────────────────────────────────────────
  let stokList = $state<StokPotongan[]>([]);
  let loading = $state(true);
  let errorMsg = $state<string | null>(null);
  let searchQuery = $state("");

  // ── Group per model+warna ─────────────────────────────────────────
  type ModelGroup = {
    key: string;
    model_id: string;
    nama_model: string;
    nama_warna?: string;
    kode_hex_warna?: string;
    items: StokPotongan[];
    totalTersedia: number;
    totalMasuk: number;
    totalTerpakai: number;
  };

  let groupedList = $derived.by((): ModelGroup[] => {
    const map = new Map<string, ModelGroup>();
    for (const s of stokList) {
      // key: model_id + warna (satu model bisa multi warna)
      const key = `${s.model_id}__${s.nama_warna ?? ''}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          model_id: s.model_id,
          nama_model: s.nama_model,
          nama_warna: s.nama_warna,
          kode_hex_warna: s.kode_hex_warna,
          items: [],
          totalTersedia: 0,
          totalMasuk: 0,
          totalTerpakai: 0,
        });
      }
      const g = map.get(key)!;
      g.items.push(s);
      g.totalTersedia += s.stok_tersedia;
      g.totalMasuk += s.total_masuk;
      g.totalTerpakai += s.total_terpakai;
    }
    // Urutkan items dalam setiap group sesuai urutan ukuran
    for (const g of map.values()) {
      g.items.sort((a, b) => URUTAN_UKURAN.indexOf(a.ukuran) - URUTAN_UKURAN.indexOf(b.ukuran));
    }
    return [...map.values()].sort((a, b) => a.nama_model.localeCompare(b.nama_model, 'id'));
  });

  let filteredGroups = $derived.by(() => {
    if (!searchQuery.trim()) return groupedList;
    const q = searchQuery.toLowerCase().trim();
    return groupedList.filter((g) => g.nama_model.toLowerCase().includes(q));
  });

  // ── Stats ─────────────────────────────────────────────────────────
  let totalJenis = $derived(stokList.filter((s) => s.stok_tersedia > 0).length);
  let totalPcs   = $derived(stokList.reduce((sum, s) => sum + s.stok_tersedia, 0));
  let stokHabis  = $derived(stokList.filter((s) => s.stok_tersedia === 0).length);

  // ── Data ─────────────────────────────────────────────────────────
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

  async function autoSyncPending() {
    try {
      const batches = await batchCache.get();
      const pending = batches.filter(
        (b) => b.status === 'CUTTING_DONE' && !b.dari_potongan && !b.stok_potongan_synced
      );
      if (pending.length === 0) return;
      let synced = false;
      for (const b of pending) {
        try {
          await sinkronStokPotonganBatch(b.id);
          synced = true;
        } catch (e) {
          console.error('[auto-sync] Gagal sync batch', b.id, e);
        }
      }
      if (synced) {
        stokPotonganCache.invalidate();
        batchCache.invalidate();
        await load(true);
      }
    } catch {
      // silent — auto-sync gagal tidak boleh mengganggu tampilan halaman
    }
  }

  onMount(async () => {
    await load();
    await autoSyncPending();
  });

  afterNavigate(async () => {
    await load();
    await autoSyncPending();
  });

  function stokColor(stok: number) {
    if (stok === 0) return 'bg-red-100 text-red-600 border-red-200';
    if (stok < 10)  return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-green-50 text-green-700 border-green-200';
  }
</script>

<!-- ── Header ──────────────────────────────────────────────────────── -->
<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Stok Potongan Kain</h1>
    <p class="mt-0.5 text-sm text-gray-500">Sisa hasil cutting yang belum dikirim ke jahit</p>
  </div>
  <Button variant="outline" size="sm" onclick={() => load(true)}>
    <svg class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
    Refresh
  </Button>
</div>

<!-- ── Stats ───────────────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-3 gap-4">
  {#if loading}
    {#each Array(3) as _}
      <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div class="mt-1.5 h-7 w-10 animate-pulse rounded bg-gray-100"></div>
      </div>
    {/each}
  {:else}
    <StatCard title="Jenis Tersedia" value={totalJenis} icon={ScissorsIcon} footerSubtext="jenis ukuran dengan stok > 0" />
    <StatCard title="Total PCS Tersedia" value={totalPcs} icon={PackageIcon} footerSubtext="pcs potongan siap pakai" class="border-blue-100 bg-blue-50" valueClass="text-blue-700" />
    <StatCard title="Stok Habis" value={stokHabis} icon={PackageXIcon} footerSubtext="jenis ukuran dengan stok 0" class="border-red-100 bg-red-50" valueClass="text-red-700" />
  {/if}
</div>

<!-- ── Search ──────────────────────────────────────────────────────── -->
<div class="mb-4">
  <div class="relative max-w-sm">
    <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
    <input
      type="text"
      placeholder="Cari nama model..."
      bind:value={searchQuery}
      class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
    />
  </div>
</div>

<!-- ── Content ─────────────────────────────────────────────────────── -->
{#if errorMsg}
  <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>

{:else if loading}
  <div class="space-y-3">
    {#each Array(4) as _}
      <div class="h-20 animate-pulse rounded-xl border border-gray-100 bg-white"></div>
    {/each}
  </div>

{:else if filteredGroups.length === 0}
  <div class="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-100 bg-white py-16 shadow-sm">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
      <ScissorsIcon class="h-7 w-7 text-gray-300" />
    </div>
    {#if searchQuery}
      <p class="text-sm font-medium text-gray-500">Tidak ada hasil untuk "{searchQuery}"</p>
      <Button variant="link" size="sm" onclick={() => (searchQuery = "")}>Hapus pencarian</Button>
    {:else}
      <p class="text-sm font-medium text-gray-500">Belum ada stok potongan</p>
      <p class="text-xs text-gray-400">Stok akan muncul otomatis saat cutting selesai</p>
    {/if}
  </div>

{:else}
  <!-- ── Table header ─────────────────────────────────────────────── -->
  <div class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
    <div class="grid grid-cols-[1fr_auto_auto_auto] items-center border-b border-gray-100 bg-gray-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
      <span>Model & Ukuran</span>
      <span class="w-32 text-right">Total Tersedia</span>
      <span class="w-28 text-right">Masuk</span>
      <span class="w-28 text-right">Terpakai</span>
    </div>

    <div class="divide-y divide-gray-50">
      {#each filteredGroups as group}
        {@const habis = group.totalTersedia === 0}
        <div class="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-4 {habis ? 'opacity-60' : ''}">
          <!-- Model + warna + ukuran pills -->
          <div class="min-w-0">
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <p class="text-sm font-semibold text-gray-800">{group.nama_model}</p>
              {#if group.nama_warna}
                <span class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {#if group.kode_hex_warna}
                    <span class="h-2 w-2 rounded-full shrink-0" style="background:{group.kode_hex_warna}"></span>
                  {/if}
                  {group.nama_warna}
                </span>
              {/if}
            </div>
            <!-- Ukuran pills -->
            <div class="flex flex-wrap gap-1.5">
              {#each group.items as item}
                <span class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium {stokColor(item.stok_tersedia)}">
                  <span class="font-bold">{item.ukuran}</span>
                  <span class="text-[11px] opacity-80">{item.stok_tersedia}</span>
                </span>
              {/each}
            </div>
          </div>

          <!-- Total tersedia -->
          <div class="w-32 text-right">
            <span class="text-base font-bold {group.totalTersedia === 0 ? 'text-red-500' : group.totalTersedia < 20 ? 'text-amber-600' : 'text-gray-800'}">
              {group.totalTersedia}
            </span>
            <span class="ml-1 text-xs text-gray-400">pcs</span>
          </div>

          <!-- Total masuk -->
          <div class="w-28 text-right">
            <span class="text-sm text-gray-600">{group.totalMasuk}</span>
            <span class="ml-1 text-xs text-gray-400">pcs</span>
          </div>

          <!-- Total terpakai -->
          <div class="w-28 text-right">
            <span class="text-sm text-gray-600">{group.totalTerpakai}</span>
            <span class="ml-1 text-xs text-gray-400">pcs</span>
          </div>
        </div>
      {/each}
    </div>

    <div class="border-t border-gray-100 bg-gray-50 px-5 py-3">
      <p class="text-xs text-gray-400">
        {filteredGroups.length} model · {stokList.length} jenis ukuran total
      </p>
    </div>
  </div>
{/if}
