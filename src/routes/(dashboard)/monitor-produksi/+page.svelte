<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { subscribeBatchAktif } from '$lib/firebase/batch-produksi';
  import type { BatchProduksi, StatusBatch } from '$lib/types';
  import { STATUS_LABEL } from '$lib/types';
  import { Button } from '$lib/components/ui/button';
  import ActivityIcon from '@lucide/svelte/icons/activity';
  import ScissorsIcon from '@lucide/svelte/icons/scissors';
  import ZapIcon from '@lucide/svelte/icons/zap';
  import PackageIcon from '@lucide/svelte/icons/package';

  type StageGroup = {
    label: string;
    stages: StatusBatch[];
    dotColor: string;
    bgColor: string;
    borderColor: string;
    textColor: string;
  };

  const STAGE_GROUPS: StageGroup[] = [
    {
      label: 'Divisi Cutting',
      stages: ['PENDING_CUTTING', 'CUTTING_IN_PROGRESS', 'CUTTING_DONE'],
      dotColor: 'bg-orange-500',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      textColor: 'text-orange-700',
    },
    {
      label: 'Divisi Jahit',
      stages: ['JAHIT_IN_PROGRESS', 'JAHIT_DONE'],
      dotColor: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-700',
    },
    {
      label: 'Divisi Steam',
      stages: ['STEAM_IN_PROGRESS', 'STEAM_DONE'],
      dotColor: 'bg-purple-500',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      textColor: 'text-purple-700',
    },
  ];

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

  let batchList = $state<BatchProduksi[]>([]);
  let loading = $state(true);
  let unsubscribe: (() => void) | null = null;

  let totalAktif = $derived(batchList.length);
  let cuttingCount = $derived(
    batchList.filter(b =>
      (['PENDING_CUTTING', 'CUTTING_IN_PROGRESS', 'CUTTING_DONE'] as StatusBatch[]).includes(b.status)
    ).length
  );
  let jahitCount = $derived(
    batchList.filter(b =>
      (['JAHIT_IN_PROGRESS', 'JAHIT_DONE'] as StatusBatch[]).includes(b.status)
    ).length
  );
  let steamCount = $derived(
    batchList.filter(b =>
      (['STEAM_IN_PROGRESS', 'STEAM_DONE'] as StatusBatch[]).includes(b.status)
    ).length
  );

  function getBatchesForGroup(stages: StatusBatch[]): BatchProduksi[] {
    return batchList.filter(b => stages.includes(b.status));
  }

  function hitungHari(createdAt: any): number {
    if (!createdAt) return 0;
    const d = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  }

  function formatDate(ts: any): string {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  onMount(() => {
    unsubscribe = subscribeBatchAktif((data) => {
      batchList = data;
      loading = false;
    });
  });

  onDestroy(() => {
    unsubscribe?.();
  });
</script>

<!-- ── Header ─────────────────────────────────────────────────────── -->
<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Monitor Produksi</h1>
    <p class="mt-0.5 flex items-center gap-2 text-sm text-gray-500">
      Pantau status produksi secara real-time
      <span class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500"></span>
        Live
      </span>
    </p>
  </div>
  <Button variant="outline" onclick={() => goto('/order-produksi')}>
    Lihat Semua Order
  </Button>
</div>

<!-- ── Stats Row ─────────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
  {#if loading}
    {#each Array(4) as _}
      <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div class="mb-2 h-3 w-16 animate-pulse rounded bg-gray-100"></div>
        <div class="h-7 w-10 animate-pulse rounded bg-gray-100"></div>
        <div class="mt-1 h-3 w-24 animate-pulse rounded bg-gray-100"></div>
      </div>
    {/each}
  {:else}
    <!-- Total Aktif -->
    <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div class="mb-1 flex items-center gap-1.5">
        <ActivityIcon class="h-3.5 w-3.5 text-gray-400" />
        <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Total Aktif</p>
      </div>
      <p class="text-2xl font-bold text-gray-900">{totalAktif}</p>
      <p class="text-xs text-gray-400">batch berjalan</p>
    </div>

    <!-- Cutting -->
    <div class="rounded-xl border border-orange-100 bg-orange-50 p-4 shadow-sm">
      <div class="mb-1 flex items-center gap-1.5">
        <ScissorsIcon class="h-3.5 w-3.5 text-orange-400" />
        <p class="text-xs font-medium uppercase tracking-wider text-orange-500">Cutting</p>
      </div>
      <p class="text-2xl font-bold text-orange-700">{cuttingCount}</p>
      <p class="text-xs text-orange-500">batch</p>
    </div>

    <!-- Jahit -->
    <div class="rounded-xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
      <div class="mb-1 flex items-center gap-1.5">
        <PackageIcon class="h-3.5 w-3.5 text-blue-400" />
        <p class="text-xs font-medium uppercase tracking-wider text-blue-500">Jahit</p>
      </div>
      <p class="text-2xl font-bold text-blue-700">{jahitCount}</p>
      <p class="text-xs text-blue-500">batch</p>
    </div>

    <!-- Steam -->
    <div class="rounded-xl border border-purple-100 bg-purple-50 p-4 shadow-sm">
      <div class="mb-1 flex items-center gap-1.5">
        <ZapIcon class="h-3.5 w-3.5 text-purple-400" />
        <p class="text-xs font-medium uppercase tracking-wider text-purple-500">Steam</p>
      </div>
      <p class="text-2xl font-bold text-purple-700">{steamCount}</p>
      <p class="text-xs text-purple-500">batch</p>
    </div>
  {/if}
</div>

<!-- ── Content ────────────────────────────────────────────────────── -->
{#if loading}
  <!-- Skeleton -->
  <div class="space-y-6">
    {#each Array(2) as _}
      <div class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div class="h-11 animate-pulse border-b border-gray-100 bg-gray-50"></div>
        <div class="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {#each Array(3) as _}
            <div class="h-28 animate-pulse rounded-xl bg-gray-50"></div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

{:else if totalAktif === 0}
  <!-- Empty State -->
  <div class="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-100 bg-white py-20 shadow-sm">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
      <ActivityIcon class="h-7 w-7 text-gray-300" />
    </div>
    <p class="text-sm font-medium text-gray-500">Tidak ada batch yang sedang berjalan</p>
    <p class="text-xs text-gray-400">Semua produksi telah selesai atau belum ada order yang dibuat</p>
    <Button variant="outline" onclick={() => goto('/order-produksi')} class="mt-1">
      Buat Order Produksi
    </Button>
  </div>

{:else}
  <!-- Stage Groups -->
  <div class="space-y-6">
    {#each STAGE_GROUPS as group}
      {@const groupBatches = getBatchesForGroup(group.stages)}
      {#if groupBatches.length > 0}
        <div class="overflow-hidden rounded-xl border {group.borderColor} bg-white shadow-sm">
          <!-- Group Header -->
          <div class="flex items-center justify-between border-b {group.borderColor} {group.bgColor} px-5 py-3">
            <div class="flex items-center gap-2">
              <span class="inline-block h-2.5 w-2.5 rounded-full {group.dotColor}"></span>
              <p class="text-sm font-semibold {group.textColor}">{group.label}</p>
            </div>
            <span class="inline-flex items-center rounded-full border {group.borderColor} {group.bgColor} px-2.5 py-0.5 text-xs font-semibold {group.textColor}">
              {groupBatches.length} batch
            </span>
          </div>

          <!-- Batch Cards -->
          <div class="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {#each groupBatches as batch}
              {@const hari = hitungHari(batch.createdAt)}
              {@const lambat = hari > 5}
              <div
                class="group cursor-pointer rounded-xl border border-gray-100 bg-gray-50 p-4 transition hover:border-gray-200 hover:bg-white hover:shadow-sm"
                onclick={() => goto(`/order-produksi/${batch.id}`)}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === 'Enter' && goto(`/order-produksi/${batch.id}`)}
              >
                <!-- Model name + late warning -->
                <div class="mb-2 flex items-start justify-between gap-2">
                  <p class="text-sm font-semibold leading-tight text-gray-800">{batch.nama_model}</p>
                  {#if lambat}
                    <span class="inline-flex shrink-0 items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                      {hari}h
                    </span>
                  {/if}
                </div>

                <!-- Status badge -->
                <span class="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold {STATUS_STYLE[batch.status]}">
                  {STATUS_LABEL[batch.status]}
                </span>

                <!-- PCS + ukuran pills -->
                <div class="mt-3 flex items-center justify-between gap-2">
                  <p class="shrink-0 text-xs text-gray-500">
                    <span class="font-semibold text-gray-700">{batch.total_pcs}</span> pcs
                  </p>
                  <div class="flex flex-wrap justify-end gap-1">
                    {#each batch.detail_ukuran as du}
                      <span class="rounded border border-gray-100 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                        {du.ukuran}:{du.jumlah_pcs}
                      </span>
                    {/each}
                  </div>
                </div>

                <!-- Footer: date + lihat detail -->
                <div class="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5">
                  <p class="text-[10px] text-gray-400">{formatDate(batch.createdAt)}</p>
                  <p class="text-[10px] font-medium text-gray-400 transition group-hover:text-gray-600">
                    Lihat Detail →
                  </p>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  </div>
{/if}
