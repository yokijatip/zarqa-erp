<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { subscribeBatchAktif } from '$lib/firebase/batch-produksi';
  import type { BatchProduksi, StatusBatch } from '$lib/types';
  import { STATUS_LABEL } from '$lib/types';
  import { Button } from '$lib/components/ui/button';
  import StatCard from '$lib/components/StatCard.svelte';
  import ActivityIcon from '@lucide/svelte/icons/activity';
  import ScissorsIcon from '@lucide/svelte/icons/scissors';
  import ZapIcon from '@lucide/svelte/icons/zap';
  import PackageIcon from '@lucide/svelte/icons/package';
  import UsersIcon from '@lucide/svelte/icons/users';
  import ShirtIcon from '@lucide/svelte/icons/shirt';
  import LayoutIcon from '@lucide/svelte/icons/layout-dashboard';
  import CalendarIcon from '@lucide/svelte/icons/calendar';
  import XIcon from '@lucide/svelte/icons/x';

  type ViewMode = 'tahap' | 'kepala' | 'model';

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

  // ── State ──────────────────────────────────────────────────────────
  let batchList = $state<BatchProduksi[]>([]);
  let loading = $state(true);
  let unsubscribe: (() => void) | null = null;

  let viewMode = $state<ViewMode>('tahap');
  let filterTanggalDari = $state('');
  let filterTanggalSampai = $state('');

  // ── Filtered list ──────────────────────────────────────────────────
  let filteredBatches = $derived.by(() => {
    let list = batchList;
    if (filterTanggalDari) {
      const dari = new Date(filterTanggalDari);
      dari.setHours(0, 0, 0, 0);
      list = list.filter((b) => {
        const d = b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt ? new Date(b.createdAt as any) : null;
        return d ? d >= dari : true;
      });
    }
    if (filterTanggalSampai) {
      const sampai = new Date(filterTanggalSampai);
      sampai.setHours(23, 59, 59, 999);
      list = list.filter((b) => {
        const d = b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt ? new Date(b.createdAt as any) : null;
        return d ? d <= sampai : true;
      });
    }
    return list;
  });

  // ── Stats (from full list, not filtered) ──────────────────────────
  let totalAktif = $derived(filteredBatches.length);
  let cuttingCount = $derived(
    filteredBatches.filter((b) =>
      (['PENDING_CUTTING', 'CUTTING_IN_PROGRESS', 'CUTTING_DONE'] as StatusBatch[]).includes(b.status)
    ).length
  );
  let jahitCount = $derived(
    filteredBatches.filter((b) =>
      (['JAHIT_IN_PROGRESS', 'JAHIT_DONE'] as StatusBatch[]).includes(b.status)
    ).length
  );
  let steamCount = $derived(
    filteredBatches.filter((b) =>
      (['STEAM_IN_PROGRESS', 'STEAM_DONE'] as StatusBatch[]).includes(b.status)
    ).length
  );

  // ── Grouping helpers ───────────────────────────────────────────────
  type Group = { key: string; label: string; sub?: string; batches: BatchProduksi[] };

  let groupsByKepala = $derived.by((): Group[] => {
    const map = new Map<string, BatchProduksi[]>();
    for (const b of filteredBatches) {
      const nama = b.penugasan?.jahit?.nama ?? '— Belum ditugaskan';
      if (!map.has(nama)) map.set(nama, []);
      map.get(nama)!.push(b);
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (a.startsWith('—')) return 1;
        if (b.startsWith('—')) return -1;
        return a.localeCompare(b, 'id');
      })
      .map(([nama, batches]) => ({ key: nama, label: nama, batches }));
  });

  let groupsByModel = $derived.by((): Group[] => {
    const map = new Map<string, BatchProduksi[]>();
    for (const b of filteredBatches) {
      const key = b.model_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => a[0].nama_model.localeCompare(b[0].nama_model, 'id'))
      .map(([, batches]) => ({
        key: batches[0].model_id,
        label: batches[0].nama_model,
        batches,
      }));
  });

  // ── Utility ────────────────────────────────────────────────────────
  function getBatchesForStage(stages: StatusBatch[]): BatchProduksi[] {
    return filteredBatches.filter((b) => stages.includes(b.status));
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

  function clearFilter() {
    filterTanggalDari = '';
    filterTanggalSampai = '';
  }

  let hasFilter = $derived(filterTanggalDari !== '' || filterTanggalSampai !== '');

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
    <StatCard
      title="Total Aktif"
      value={totalAktif}
      icon={ActivityIcon}
      footerSubtext="batch berjalan"
    />
    <StatCard
      title="Cutting"
      value={cuttingCount}
      icon={ScissorsIcon}
      footerSubtext="batch"
      class="border-orange-100 bg-orange-50"
      valueClass="text-orange-700"
    />
    <StatCard
      title="Jahit"
      value={jahitCount}
      icon={PackageIcon}
      footerSubtext="batch"
      class="border-blue-100 bg-blue-50"
      valueClass="text-blue-700"
    />
    <StatCard
      title="Steam"
      value={steamCount}
      icon={ZapIcon}
      footerSubtext="batch"
      class="border-purple-100 bg-purple-50"
      valueClass="text-purple-700"
    />
  {/if}
</div>

<!-- ── Filter & View Mode Bar ─────────────────────────────────────── -->
<div class="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
  <!-- Date filters -->
  <div class="flex flex-wrap items-end gap-3 flex-1">
    <div class="flex flex-col gap-1 min-w-[140px]">
      <label for="dari" class="flex items-center gap-1 text-xs font-medium text-gray-500">
        <CalendarIcon class="h-3 w-3" /> Dari Tanggal
      </label>
      <input
        id="dari"
        type="date"
        bind:value={filterTanggalDari}
        class="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
      />
    </div>
    <div class="flex flex-col gap-1 min-w-[140px]">
      <label for="sampai" class="flex items-center gap-1 text-xs font-medium text-gray-500">
        <CalendarIcon class="h-3 w-3" /> Sampai Tanggal
      </label>
      <input
        id="sampai"
        type="date"
        bind:value={filterTanggalSampai}
        min={filterTanggalDari || undefined}
        class="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
      />
    </div>
    {#if hasFilter}
      <button
        onclick={clearFilter}
        class="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
      >
        <XIcon class="h-3 w-3" /> Reset filter
      </button>
    {/if}
  </div>

  <!-- View mode toggle -->
  <div class="flex items-center gap-1 rounded-lg border border-gray-200 p-1">
    <button
      onclick={() => viewMode = 'tahap'}
      class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition {viewMode === 'tahap' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}"
    >
      <LayoutIcon class="h-3 w-3" /> Per Tahap
    </button>
    <button
      onclick={() => viewMode = 'kepala'}
      class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition {viewMode === 'kepala' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}"
    >
      <UsersIcon class="h-3 w-3" /> Per Kepala Jahit
    </button>
    <button
      onclick={() => viewMode = 'model'}
      class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition {viewMode === 'model' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}"
    >
      <ShirtIcon class="h-3 w-3" /> Per Model
    </button>
  </div>
</div>

<!-- ── Content ────────────────────────────────────────────────────── -->
{#if loading}
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

{:else if filteredBatches.length === 0}
  <div class="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-100 bg-white py-20 shadow-sm">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
      <ActivityIcon class="h-7 w-7 text-gray-300" />
    </div>
    <p class="text-sm font-medium text-gray-500">
      {hasFilter ? 'Tidak ada batch untuk rentang tanggal ini' : 'Tidak ada batch yang sedang berjalan'}
    </p>
    <p class="text-xs text-gray-400">
      {hasFilter ? 'Coba ubah filter tanggal' : 'Semua produksi telah selesai atau belum ada order yang dibuat'}
    </p>
    {#if !hasFilter}
      <Button variant="outline" onclick={() => goto('/order-produksi')} class="mt-1">
        Buat Order Produksi
      </Button>
    {:else}
      <button onclick={clearFilter} class="mt-1 text-xs text-gray-400 underline">Reset filter</button>
    {/if}
  </div>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- VIEW: PER TAHAP                                                -->
<!-- ═══════════════════════════════════════════════════════════════ -->
{:else if viewMode === 'tahap'}
  <div class="space-y-6">
    {#each STAGE_GROUPS as group}
      {@const groupBatches = getBatchesForStage(group.stages)}
      {#if groupBatches.length > 0}
        <div class="overflow-hidden rounded-xl border {group.borderColor} bg-white shadow-sm">
          <div class="flex items-center justify-between border-b {group.borderColor} {group.bgColor} px-5 py-3">
            <div class="flex items-center gap-2">
              <span class="inline-block h-2.5 w-2.5 rounded-full {group.dotColor}"></span>
              <p class="text-sm font-semibold {group.textColor}">{group.label}</p>
            </div>
            <span class="inline-flex items-center rounded-full border {group.borderColor} {group.bgColor} px-2.5 py-0.5 text-xs font-semibold {group.textColor}">
              {groupBatches.length} batch
            </span>
          </div>
          <div class="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {#each groupBatches as batch}
              {@const hari = hitungHari(batch.createdAt)}
              {@const lambat = hari > 5}
              {@render BatchCard(batch, hari, lambat)}
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  </div>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- VIEW: PER KEPALA JAHIT                                         -->
<!-- ═══════════════════════════════════════════════════════════════ -->
{:else if viewMode === 'kepala'}
  <div class="space-y-6">
    {#each groupsByKepala as group}
      {@const belumDitugaskan = group.label.startsWith('—')}
      {@const byStatus = group.batches.reduce<Record<string, BatchProduksi[]>>((acc, b) => {
        const lbl = STATUS_LABEL[b.status];
        if (!acc[lbl]) acc[lbl] = [];
        acc[lbl].push(b);
        return acc;
      }, {})}
      <div class="overflow-hidden rounded-xl border {belumDitugaskan ? 'border-gray-200' : 'border-blue-200'} bg-white shadow-sm">
        <div class="flex items-center justify-between border-b {belumDitugaskan ? 'border-gray-200 bg-gray-50' : 'border-blue-200 bg-blue-50'} px-5 py-3">
          <div class="flex items-center gap-2">
            <UsersIcon class="h-4 w-4 {belumDitugaskan ? 'text-gray-400' : 'text-blue-600'}" />
            <p class="text-sm font-semibold {belumDitugaskan ? 'text-gray-500' : 'text-blue-700'}">
              {belumDitugaskan ? 'Belum Ditugaskan' : group.label}
            </p>
          </div>
          <span class="inline-flex items-center rounded-full border {belumDitugaskan ? 'border-gray-200 bg-gray-50 text-gray-600' : 'border-blue-200 bg-blue-50 text-blue-700'} px-2.5 py-0.5 text-xs font-semibold">
            {group.batches.length} batch
          </span>
        </div>

        <div class="divide-y divide-gray-50">
          {#each Object.entries(byStatus) as [statusLabel, batches]}
            <div class="px-5 py-4">
              <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{statusLabel}</p>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {#each batches as batch}
                  {@const hari = hitungHari(batch.createdAt)}
                  {@const lambat = hari > 5}
                  {@render BatchCard(batch, hari, lambat)}
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- VIEW: PER MODEL                                                -->
<!-- ═══════════════════════════════════════════════════════════════ -->
{:else if viewMode === 'model'}
  <div class="space-y-6">
    {#each groupsByModel as group}
      {@const sample = group.batches[0]}
      <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <!-- Model header -->
        <div class="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-3">
          <div class="flex items-center gap-2">
            {#if sample.kode_hex_warna}
              <span class="h-3 w-3 rounded-full border border-gray-300 shrink-0" style="background:{sample.kode_hex_warna}"></span>
            {:else}
              <ShirtIcon class="h-4 w-4 text-gray-400" />
            {/if}
            <p class="text-sm font-semibold text-gray-800">{group.label}</p>
            {#if sample.nama_warna}
              <span class="text-xs text-gray-400">· {sample.nama_warna}</span>
            {/if}
          </div>
          <span class="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-gray-600">
            {group.batches.length} batch · {group.batches.reduce((s, b) => s + (b.pcs_saat_ini ?? b.total_pcs), 0)} pcs
          </span>
        </div>

        <!-- Batches as rows table -->
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-100 bg-gray-50/50">
                <th class="px-5 py-2.5 text-left text-xs font-semibold text-gray-400">Status</th>
                <th class="px-5 py-2.5 text-left text-xs font-semibold text-gray-400">Ukuran</th>
                <th class="px-5 py-2.5 text-right text-xs font-semibold text-gray-400">PCS</th>
                <th class="px-5 py-2.5 text-left text-xs font-semibold text-gray-400">Kepala Jahit</th>
                <th class="px-5 py-2.5 text-left text-xs font-semibold text-gray-400">Tanggal</th>
                <th class="px-5 py-2.5 text-left text-xs font-semibold text-gray-400">Warna</th>
                <th class="px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              {#each group.batches as batch}
                {@const hari = hitungHari(batch.createdAt)}
                {@const lambat = hari > 5}
                <tr
                  class="cursor-pointer transition hover:bg-gray-50"
                  onclick={() => goto(`/order-produksi/${batch.id}`)}
                >
                  <td class="px-5 py-3">
                    <span class="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold {STATUS_STYLE[batch.status]}">
                      {STATUS_LABEL[batch.status]}
                    </span>
                  </td>
                  <td class="px-5 py-3">
                    <div class="flex flex-wrap gap-1">
                      {#each batch.detail_ukuran as du}
                        <span class="rounded border border-gray-100 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                          {du.ukuran}:{du.jumlah_pcs}
                        </span>
                      {/each}
                    </div>
                  </td>
                  <td class="px-5 py-3 text-right">
                    <span class="font-semibold text-gray-800">{batch.pcs_saat_ini ?? batch.total_pcs}</span>
                    {#if lambat}
                      <span class="ml-1 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">{hari}h</span>
                    {/if}
                  </td>
                  <td class="px-5 py-3 text-xs text-gray-600">
                    {#if batch.penugasan?.jahit?.nama}
                      {batch.penugasan.jahit.nama}
                    {:else}
                      <span class="text-gray-300">—</span>
                    {/if}
                  </td>
                  <td class="px-5 py-3 text-xs text-gray-500">{formatDate(batch.createdAt)}</td>
                  <td class="px-5 py-3">
                    {#if batch.kode_hex_warna}
                      <div class="flex items-center gap-1.5">
                        <span class="h-3 w-3 rounded-full border border-gray-200 shrink-0" style="background:{batch.kode_hex_warna}"></span>
                        <span class="text-xs text-gray-500">{batch.nama_warna ?? ''}</span>
                      </div>
                    {:else}
                      <span class="text-gray-300">—</span>
                    {/if}
                  </td>
                  <td class="px-5 py-3 text-right">
                    <span class="text-[10px] font-medium text-gray-400 hover:text-gray-600">Detail →</span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/each}
  </div>
{/if}

<!-- ── Shared BatchCard snippet ──────────────────────────────────── -->
{#snippet BatchCard(batch: BatchProduksi, hari: number, lambat: boolean)}
  <div
    class="group cursor-pointer rounded-xl border border-gray-100 bg-gray-50 p-4 transition hover:border-gray-200 hover:bg-white hover:shadow-sm"
    onclick={() => goto(`/order-produksi/${batch.id}`)}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === 'Enter' && goto(`/order-produksi/${batch.id}`)}
  >
    <div class="mb-2 flex items-start justify-between gap-2">
      <div class="flex items-center gap-1.5 min-w-0">
        {#if batch.kode_hex_warna}
          <span class="h-2.5 w-2.5 shrink-0 rounded-full border border-gray-200" style="background:{batch.kode_hex_warna}"></span>
        {/if}
        <p class="truncate text-sm font-semibold leading-tight text-gray-800">{batch.nama_model}</p>
      </div>
      {#if lambat}
        <span class="inline-flex shrink-0 items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
          {hari}h
        </span>
      {/if}
    </div>

    <span class="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold {STATUS_STYLE[batch.status]}">
      {STATUS_LABEL[batch.status]}
    </span>

    {#if batch.penugasan?.jahit?.nama}
      <p class="mt-1.5 text-[11px] text-gray-400">
        <span class="font-medium text-gray-500">{batch.penugasan.jahit.nama}</span>
      </p>
    {/if}

    <div class="mt-3 flex items-center justify-between gap-2">
      <p class="shrink-0 text-xs text-gray-500">
        <span class="font-semibold text-gray-700">{batch.pcs_saat_ini ?? batch.total_pcs}</span> pcs
      </p>
      <div class="flex flex-wrap justify-end gap-1">
        {#each batch.detail_ukuran as du}
          <span class="rounded border border-gray-100 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
            {du.ukuran}:{du.jumlah_pcs}
          </span>
        {/each}
      </div>
    </div>

    <div class="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5">
      <p class="text-[10px] text-gray-400">{formatDate(batch.createdAt)}</p>
      <p class="text-[10px] font-medium text-gray-400 transition group-hover:text-gray-600">
        Lihat Detail →
      </p>
    </div>
  </div>
{/snippet}
