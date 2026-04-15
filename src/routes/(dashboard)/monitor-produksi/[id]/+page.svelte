<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { getBatchById, getRiwayatBatch } from '$lib/firebase/batch-produksi';
  import type { BatchProduksi, RiwayatProses, StatusBatch } from '$lib/types';
  import { STATUS_LABEL } from '$lib/types';
  import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
  import ClockIcon from '@lucide/svelte/icons/clock';
  import UsersIcon from '@lucide/svelte/icons/users';
  import ScissorsIcon from '@lucide/svelte/icons/scissors';
  import PackageIcon from '@lucide/svelte/icons/package';
  import ZapIcon from '@lucide/svelte/icons/zap';
  import CheckCircleIcon from '@lucide/svelte/icons/check-circle';
  import CircleIcon from '@lucide/svelte/icons/circle';

  const STATUS_STYLE: Record<StatusBatch, string> = {
    PENDING_CUTTING:     'bg-slate-100 text-slate-600',
    CUTTING_IN_PROGRESS: 'bg-orange-100 text-orange-700',
    CUTTING_DONE:        'bg-yellow-100 text-yellow-700',
    JAHIT_IN_PROGRESS:   'bg-blue-100 text-blue-700',
    JAHIT_DONE:          'bg-teal-100 text-teal-700',
    STEAM_IN_PROGRESS:   'bg-purple-100 text-purple-700',
    STEAM_DONE:          'bg-emerald-100 text-emerald-700',
    COMPLETED:           'bg-green-100 text-green-700',
  };

  // Urutan stage untuk progress bar
  const STAGES: StatusBatch[] = [
    'PENDING_CUTTING',
    'CUTTING_IN_PROGRESS',
    'CUTTING_DONE',
    'JAHIT_IN_PROGRESS',
    'JAHIT_DONE',
    'STEAM_IN_PROGRESS',
    'STEAM_DONE',
    'COMPLETED',
  ];

  const STAGE_STEPS = [
    { label: 'Cutting',  statuses: ['PENDING_CUTTING', 'CUTTING_IN_PROGRESS', 'CUTTING_DONE'] as StatusBatch[], icon: ScissorsIcon },
    { label: 'Jahit',    statuses: ['JAHIT_IN_PROGRESS', 'JAHIT_DONE'] as StatusBatch[],                        icon: PackageIcon  },
    { label: 'Steam',    statuses: ['STEAM_IN_PROGRESS', 'STEAM_DONE'] as StatusBatch[],                        icon: ZapIcon      },
    { label: 'Selesai',  statuses: ['COMPLETED'] as StatusBatch[],                                              icon: CheckCircleIcon },
  ];

  let batch = $state<BatchProduksi | null>(null);
  let riwayat = $state<RiwayatProses[]>([]);
  let loading = $state(true);
  let notFound = $state(false);

  function stepState(step: typeof STAGE_STEPS[0], currentStatus: StatusBatch): 'done' | 'active' | 'pending' {
    const currentIdx = STAGES.indexOf(currentStatus);
    const stepMax = Math.max(...step.statuses.map(s => STAGES.indexOf(s)));
    const stepMin = Math.min(...step.statuses.map(s => STAGES.indexOf(s)));
    if (currentIdx > stepMax) return 'done';
    if (currentIdx >= stepMin) return 'active';
    return 'pending';
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

  function formatDateTime(ts: any): string {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  onMount(async () => {
    const id = $page.params.id ?? '';
    const [b, r] = await Promise.all([getBatchById(id), getRiwayatBatch(id)]);
    if (!b) { notFound = true; loading = false; return; }
    batch = b;
    riwayat = r;
    loading = false;
  });
</script>

<!-- Back button -->
<div class="mb-5">
  <button
    onclick={() => goto('/monitor-produksi')}
    class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
  >
    <ArrowLeftIcon class="h-4 w-4" />
    Kembali ke Monitor Produksi
  </button>
</div>

{#if loading}
  <div class="space-y-4">
    <div class="h-8 w-48 animate-pulse rounded-lg bg-gray-100"></div>
    <div class="h-32 animate-pulse rounded-xl bg-gray-100"></div>
    <div class="h-48 animate-pulse rounded-xl bg-gray-100"></div>
  </div>

{:else if notFound}
  <div class="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-100 bg-white py-20">
    <p class="text-sm font-medium text-gray-500">Batch tidak ditemukan</p>
    <button onclick={() => goto('/monitor-produksi')} class="text-xs text-blue-600 hover:underline">
      Kembali ke Monitor Produksi
    </button>
  </div>

{:else if batch}
  {@const hari = hitungHari(batch.createdAt)}
  {@const lambat = hari > 5}

  <!-- Header -->
  <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div>
      <div class="flex items-center gap-2">
        <h1 class="text-xl font-semibold text-gray-900">{batch.nama_model}</h1>
        {#if batch.kode_hex_warna}
          <span class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-700">
            <span class="h-3 w-3 rounded-full shrink-0" style="background:{batch.kode_hex_warna}"></span>
            {batch.nama_warna ?? ''}
          </span>
        {/if}
      </div>
      <div class="mt-1 flex items-center gap-2">
        <span class="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold {STATUS_STYLE[batch.status]}">
          {STATUS_LABEL[batch.status]}
        </span>
        <span class="text-xs text-gray-400">·</span>
        <span class="inline-flex items-center gap-1 text-xs {lambat ? 'font-semibold text-red-600' : 'text-gray-400'}">
          <ClockIcon class="h-3 w-3" />
          {hari} hari berjalan
        </span>
        {#if batch.dari_potongan}
          <span class="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">dari potongan</span>
        {/if}
      </div>
    </div>
    <div class="text-right">
      <p class="text-2xl font-bold text-gray-900">{(batch.pcs_saat_ini ?? batch.total_pcs).toLocaleString('id-ID')}</p>
      <p class="text-xs text-gray-400">pcs saat ini</p>
    </div>
  </div>

  <!-- Progress Steps -->
  <div class="mb-5 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <p class="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Progress Produksi</p>
    <div class="flex items-center gap-0">
      {#each STAGE_STEPS as step, i}
        {@const state = stepState(step, batch.status)}
        {@const Icon = step.icon}
        <div class="flex flex-1 flex-col items-center gap-1.5">
          <div class="flex h-8 w-8 items-center justify-center rounded-full border-2 transition
            {state === 'done'   ? 'border-gray-800 bg-gray-800 text-white' :
             state === 'active' ? 'border-gray-800 bg-white text-gray-800' :
                                  'border-gray-200 bg-white text-gray-300'}">
            <Icon class="h-3.5 w-3.5" />
          </div>
          <p class="text-center text-[10px] font-medium
            {state === 'pending' ? 'text-gray-300' : 'text-gray-600'}">
            {step.label}
          </p>
        </div>
        {#if i < STAGE_STEPS.length - 1}
          <div class="mb-5 h-0.5 flex-1 {stepState(STAGE_STEPS[i + 1], batch.status) !== 'pending' ? 'bg-gray-800' : 'bg-gray-200'}"></div>
        {/if}
      {/each}
    </div>
  </div>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
    <!-- Left col: info + ukuran + kain -->
    <div class="space-y-4 lg:col-span-2">

      <!-- Info umum -->
      <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Informasi Batch</p>
        <div class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <p class="text-xs text-gray-400">Tanggal Dibuat</p>
            <p class="font-medium text-gray-800">{formatDate(batch.createdAt)}</p>
          </div>
          <div>
            <p class="text-xs text-gray-400">Total PCS Awal</p>
            <p class="font-medium text-gray-800">{batch.total_pcs.toLocaleString('id-ID')} pcs</p>
          </div>
          <div>
            <p class="text-xs text-gray-400">PCS Saat Ini</p>
            <p class="font-medium text-gray-800">{(batch.pcs_saat_ini ?? batch.total_pcs).toLocaleString('id-ID')} pcs</p>
          </div>
          {#if batch.catatan_admin}
            <div class="col-span-full">
              <p class="text-xs text-gray-400">Catatan</p>
              <p class="font-medium text-gray-800">{batch.catatan_admin}</p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Ukuran -->
      <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Detail Ukuran</p>
        <div class="flex flex-wrap gap-2">
          {#each batch.detail_ukuran as du}
            <div class="flex flex-col items-center rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5 min-w-[60px]">
              <p class="text-xs font-semibold text-gray-500">{du.ukuran}</p>
              <p class="text-lg font-bold text-gray-900">{du.jumlah_pcs}</p>
              <p class="text-[10px] text-gray-400">pcs</p>
            </div>
          {/each}
        </div>
      </div>

      <!-- Penugasan -->
      <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Penugasan</p>
        <div class="space-y-2">
          {#each [
            { label: 'Cutting', worker: batch.penugasan?.cutting, icon: ScissorsIcon },
            { label: 'Jahit',   worker: batch.penugasan?.jahit,   icon: PackageIcon  },
            { label: 'Steam',   worker: batch.penugasan?.steam,   icon: ZapIcon      },
          ] as p}
            {@const PIcon = p.icon}
            <div class="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
              <div class="flex items-center gap-2">
                <PIcon class="h-3.5 w-3.5 text-gray-400" />
                <p class="text-sm text-gray-500">{p.label}</p>
              </div>
              {#if p.worker}
                <div class="flex items-center gap-1.5">
                  <UsersIcon class="h-3 w-3 text-gray-400" />
                  <p class="text-sm font-medium text-gray-800">{p.worker.nama}</p>
                </div>
              {:else}
                <p class="text-xs text-gray-300">Belum ditugaskan</p>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Kain digunakan -->
      {#if batch.kain_digunakan.length > 0}
        <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Kain Digunakan</p>
          <div class="space-y-2">
            {#each batch.kain_digunakan as kain}
              <div class="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p class="text-sm font-medium text-gray-800">{kain.nama_kain}</p>
                <span class="text-sm text-gray-600">
                  {kain.jumlah_dipakai} {kain.satuan}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- Right col: riwayat -->
    <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <p class="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Riwayat Proses</p>
      {#if riwayat.length === 0}
        <p class="text-center text-xs text-gray-400 py-6">Belum ada riwayat</p>
      {:else}
        <div class="relative">
          <!-- vertical line -->
          <div class="absolute left-[11px] top-3 bottom-3 w-px bg-gray-100"></div>
          <div class="space-y-5">
            {#each riwayat as r}
              <div class="relative flex gap-3">
                <div class="relative z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 border-gray-200 bg-white">
                  <CircleIcon class="h-2 w-2 fill-gray-400 text-gray-400" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold {STATUS_STYLE[r.status_ke]}">
                      {STATUS_LABEL[r.status_ke]}
                    </span>
                    {#if r.tipe === 'edit_kuantitas'}
                      <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">edit</span>
                    {/if}
                  </div>
                  <p class="mt-0.5 text-[11px] text-gray-400">{formatDateTime(r.timestamp)}</p>
                  <p class="mt-0.5 text-[11px] font-medium text-gray-600">{r.updated_by_nama}</p>
                  <div class="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500">
                    <span>{r.pcs_berhasil} pcs berhasil</span>
                    {#if r.pcs_reject > 0}
                      <span class="text-red-500">{r.pcs_reject} reject</span>
                    {/if}
                  </div>
                  {#if r.catatan}
                    <p class="mt-0.5 text-[11px] italic text-gray-400">"{r.catatan}"</p>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
