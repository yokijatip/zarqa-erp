<script lang="ts">
  import { getBatchPage } from '$lib/firebase/batch-produksi';
  import { getPerformaPerDivisi, type PerformaKaryawan, type DivisiKey } from '$lib/firebase/performa';
  import { STATUS_LABEL, type BatchProduksi, type StatusBatch } from '$lib/types';
  import ActivityIcon from '@lucide/svelte/icons/activity';
  import ScissorsIcon from '@lucide/svelte/icons/scissors';
  import ShirtIcon from '@lucide/svelte/icons/shirt';
  import ZapIcon from '@lucide/svelte/icons/zap';
  import UsersIcon from '@lucide/svelte/icons/users';
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
  import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import TrendingUpIcon from '@lucide/svelte/icons/trending-up';
  import PeriodSelector from '$lib/components/period-selector.svelte';
  import { getPeriodRange, type DateRange } from '$lib/period';
  import type { FirestoreCursor } from '$lib/firebase/pagination';

  type StageGroup = { label: string; statuses: StatusBatch[]; color: string; icon: typeof ActivityIcon; card: string; title: string; value: string; iconColor: string };
  const STAGE_GROUPS: StageGroup[] = [
    { label: 'Cutting', statuses: ['PENDING_KAIN', 'PENDING_CUTTING', 'CUTTING_IN_PROGRESS', 'CUTTING_DONE'], color: 'orange', icon: ScissorsIcon, card: 'border-orange-100 bg-orange-50', title: 'text-orange-700', value: 'text-orange-800', iconColor: 'text-orange-500' },
    { label: 'Jahit', statuses: ['JAHIT_IN_PROGRESS', 'JAHIT_DONE'], color: 'blue', icon: ShirtIcon, card: 'border-blue-100 bg-blue-50', title: 'text-blue-700', value: 'text-blue-800', iconColor: 'text-blue-500' },
    { label: 'Steam', statuses: ['STEAM_IN_PROGRESS', 'STEAM_DONE'], color: 'violet', icon: ZapIcon, card: 'border-violet-100 bg-violet-50', title: 'text-violet-700', value: 'text-violet-800', iconColor: 'text-violet-500' },
  ];
  const PAGE_SIZE = 12;
  const ACTIVE_STATUSES: StatusBatch[] = STAGE_GROUPS.flatMap((group) => group.statuses);
  const DIVISI: DivisiKey[] = ['Cutting', 'Jahit', 'Steam'];
  const STATUS_STYLE: Record<StatusBatch, string> = {
    PENDING_KAIN: 'bg-cyan-100 text-cyan-700', PENDING_CUTTING: 'bg-slate-100 text-slate-600',
    CUTTING_IN_PROGRESS: 'bg-orange-100 text-orange-700', CUTTING_DONE: 'bg-yellow-100 text-yellow-700',
    JAHIT_IN_PROGRESS: 'bg-blue-100 text-blue-700', JAHIT_DONE: 'bg-teal-100 text-teal-700',
    STEAM_IN_PROGRESS: 'bg-violet-100 text-violet-700', STEAM_DONE: 'bg-emerald-100 text-emerald-700',
    COMPLETED: 'bg-green-100 text-green-700',
  };
  const STATUS_DISPLAY: Record<StatusBatch, string> = {
    ...STATUS_LABEL, CUTTING_DONE: 'Siap Jahit', JAHIT_DONE: 'Siap Steam', STEAM_DONE: 'Siap Masuk Gudang',
  };

  let batches = $state<BatchProduksi[]>([]);
  let allBatches = $state<BatchProduksi[]>([]);
  let loading = $state(true);
  let loadingPerforma = $state(true);
  let pages = $state<Record<string, number>>({});
  let pageRows = $state<Record<string, BatchProduksi[][]>>({});
  let pageCursors = $state<Record<string, FirestoreCursor[]>>({});
  let pageHasNext = $state<Record<string, boolean[]>>({});
  let pageLoading = $state<string | null>(null);
  let activeDivisi = $state<DivisiKey>('Cutting');
  let performa = $state<Record<DivisiKey, PerformaKaryawan[]>>({ Cutting: [], Jahit: [], Steam: [], Keluar: [] });

  let dateRange = $state<DateRange>(getPeriodRange('bulan_ini'));
  let dari = $derived(dateRange ? toInputDate(dateRange.start) : '');
  let sampai = $derived(dateRange ? toInputDate(dateRange.end) : '');

  function toInputDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  let filtered = $derived.by(() => batches.filter((batch) => {
    const date = batch.createdAt?.toDate ? batch.createdAt.toDate() : batch.createdAt ? new Date(batch.createdAt as any) : null;
    if (!date) return true;
    const start = dari ? new Date(`${dari}T00:00:00`) : null;
    const end = sampai ? new Date(`${sampai}T23:59:59.999`) : null;
    return (!start || date >= start) && (!end || date <= end);
  }));
  let filteredAll = $derived.by(() => allBatches.filter((batch) => {
    const date = batch.createdAt?.toDate ? batch.createdAt.toDate() : batch.createdAt ? new Date(batch.createdAt as any) : null;
    if (!date) return true;
    const start = dari ? new Date(`${dari}T00:00:00`) : null;
    const end = sampai ? new Date(`${sampai}T23:59:59.999`) : null;
    return (!start || date >= start) && (!end || date <= end);
  }));
  let totalPcs = $derived(filtered.reduce((sum, batch) => sum + (batch.pcs_saat_ini ?? batch.total_pcs), 0));
  let terlambat = $derived(filtered.filter((batch) => ageInDays(batch.createdAt) > 5).length);
  let modelSeringDibuat = $derived.by(() => {
    const map = new Map<string, { nama: string; batch: number; pcs: number }>();
    for (const batch of filteredAll) {
      const current = map.get(batch.model_id) ?? { nama: batch.nama_model, batch: 0, pcs: 0 };
      current.batch += 1;
      current.pcs += batch.pcs_saat_ini ?? batch.total_pcs;
      map.set(batch.model_id, current);
    }
    return [...map.values()].sort((a, b) => b.batch - a.batch || b.pcs - a.pcs).slice(0, 6);
  });
  let prosesTerlama = $derived([...filtered]
    .sort((a, b) => ageInDays(b.createdAt) - ageInDays(a.createdAt))
    .slice(0, 6));
  let outputHarian = $derived.by(() => {
    const map = new Map<string, { label: string; pcs: number }>();
    for (const batch of filteredAll) {
      const date = batch.createdAt?.toDate ? batch.createdAt.toDate() : batch.createdAt ? new Date(batch.createdAt as any) : null;
      if (!date) continue;
      const key = toInputDate(date);
      const current = map.get(key) ?? { label: date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }), pcs: 0 };
      current.pcs += batch.total_pcs;
      map.set(key, current);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([, value]) => value);
  });
  let bottleneck = $derived.by(() => STAGE_GROUPS
    .map((group) => ({ label: group.label, batch: groupBatches(group).length, pcs: pcs(groupBatches(group)) }))
    .sort((a, b) => b.batch - a.batch || b.pcs - a.pcs)[0]);

  function groupBatches(group: StageGroup): BatchProduksi[] {
    return filtered.filter((batch) => group.statuses.includes(batch.status));
  }
  function pageFor(key: string): number { return pages[key] ?? 1; }
  function visible(group: StageGroup): BatchProduksi[] {
    return groupBatches(group);
  }
  function rebuildLoadedRows() {
    const loadedRows = STAGE_GROUPS.flatMap((group) =>
      pageRows[group.label]?.[(pages[group.label] ?? 1) - 1] ?? [],
    );
    batches = loadedRows;
    allBatches = loadedRows;
  }
  async function setPage(group: StageGroup, page: number) {
    const current = pageFor(group.label);
    if (page <= 0 || page === current || pageLoading) return;
    if (page < current) {
      if (!pageRows[group.label]?.[page - 1]) return;
      pages = { ...pages, [group.label]: page };
      rebuildLoadedRows();
      return;
    }
    if (!(pageHasNext[group.label]?.[current - 1] ?? false)) return;
    pageLoading = group.label;
    try {
      const result = await getBatchPage(
        group.statuses,
        pageCursors[group.label]?.[current] ?? null,
        PAGE_SIZE,
        dateRange,
      );
      const nextRows = [...(pageRows[group.label] ?? []), result.items];
      const nextCursors = [...(pageCursors[group.label] ?? [null]), result.cursor];
      const nextHasNext = [...(pageHasNext[group.label] ?? []), result.hasNext];
      pageRows = { ...pageRows, [group.label]: nextRows };
      pageCursors = { ...pageCursors, [group.label]: nextCursors };
      pageHasNext = { ...pageHasNext, [group.label]: nextHasNext };
      pages = { ...pages, [group.label]: page };
      rebuildLoadedRows();
    } finally {
      pageLoading = null;
    }
  }
  function pcs(list: BatchProduksi[]): number { return list.reduce((sum, batch) => sum + (batch.pcs_saat_ini ?? batch.total_pcs), 0); }
  function ageInDays(value: any): number {
    if (!value) return 0;
    const date = value.toDate ? value.toDate() : new Date(value);
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  }
  function formatDate(value: any): string {
    if (!value) return '-';
    const date = value.toDate ? value.toDate() : new Date(value);
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function worker(batch: BatchProduksi, group: StageGroup): string {
    const key = group.label.toLowerCase() as 'cutting' | 'jahit' | 'steam';
    return batch.penugasan?.[key]?.nama ?? '';
  }
  function reloadPerforma() {
    loadingPerforma = true;
    getPerformaPerDivisi({ dari: dari || undefined, sampai: sampai || undefined })
      .then((data) => { performa = data; })
      .finally(() => { loadingPerforma = false; });
  }
  async function refresh() {
    loading = true;
    try {
      const results = await Promise.all(STAGE_GROUPS.map((group) => getBatchPage(group.statuses, null, PAGE_SIZE, dateRange)));
      const rows = Object.fromEntries(STAGE_GROUPS.map((group, index) => [group.label, [results[index].items]]));
      const cursors = Object.fromEntries(STAGE_GROUPS.map((group, index) => [group.label, [null, results[index].cursor]]));
      const hasNext = Object.fromEntries(STAGE_GROUPS.map((group, index) => [group.label, [results[index].hasNext]]));
      pageRows = rows;
      pageCursors = cursors;
      pageHasNext = hasNext;
      pages = Object.fromEntries(STAGE_GROUPS.map((group) => [group.label, 1]));
      batches = results.flatMap((result) => result.items);
      allBatches = batches;
    } finally {
      loading = false;
    }
    reloadPerforma();
  }

  $effect(() => {
    dari; sampai;
    pages = {};
    refresh();
  });
</script>

<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
  <div><h1 class="text-xl font-semibold text-gray-900">Dashboard Produksi</h1><p class="mt-1 text-sm text-gray-500">Pantau antrean, hasil tiap tahap, dan performa produksi.</p></div>
  <button onclick={refresh} class="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"><RefreshCwIcon class="h-4 w-4 {loading ? 'animate-spin' : ''}" /> Refresh</button>
</div>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
  <div><p class="text-sm font-semibold text-gray-800">Periode Produksi</p><p class="text-xs text-gray-400">Berlaku untuk ringkasan, performa, dan pipeline.</p></div>
  <PeriodSelector bind:dateRange defaultPeriod="bulan_ini" />
</div>

<div class="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
  <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><div class="flex justify-between"><p class="text-xs font-medium text-gray-500">Batch aktif</p><ActivityIcon class="h-4 w-4 text-gray-400" /></div><p class="mt-2 text-2xl font-bold text-gray-900">{filtered.length}</p><p class="mt-1 text-xs text-gray-400">{totalPcs.toLocaleString('id-ID')} pcs berjalan</p></div>
  {#each STAGE_GROUPS as group}<div class="rounded-xl border p-4 shadow-sm {group.card}"><div class="flex justify-between"><p class="text-xs font-medium {group.title}">{group.label}</p><svelte:component this={group.icon} class="h-4 w-4 {group.iconColor}" /></div><p class="mt-2 text-2xl font-bold {group.value}">{groupBatches(group).length}</p><p class="mt-1 text-xs {group.title}">{pcs(groupBatches(group)).toLocaleString('id-ID')} pcs</p></div>{/each}
</div>

<section class="mb-5 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
  <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div class="flex items-center gap-2"><TrendingUpIcon class="h-4 w-4 text-gray-500" /><div><h2 class="text-sm font-semibold text-gray-900">Performa Produksi</h2><p class="text-xs text-gray-400">Chart dan detail hasil selesai pada periode terpilih.</p></div></div><span class="text-xs text-gray-400">{terlambat} batch lebih dari 5 hari</span></div>
  <div class="flex overflow-x-auto border-b border-gray-100 px-5">{#each DIVISI as tab}<button onclick={() => activeDivisi = tab} class="border-b-2 px-3 py-2.5 text-xs font-medium {activeDivisi === tab ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}">{tab}<span class="ml-1 text-gray-400">({performa[tab].length})</span></button>{/each}</div>
  {#if loadingPerforma}<p class="p-6 text-sm text-gray-400">Memuat performa...</p>{:else if performa[activeDivisi].length === 0}<p class="p-6 text-sm text-gray-400">Belum ada hasil selesai pada periode ini.</p>{:else}{@const maxChart = Math.max(...performa[activeDivisi].map((item) => item.total_pcs_berhasil), 1)}<div class="space-y-3 border-b border-gray-100 p-5">{#each performa[activeDivisi] as item}<div><div class="mb-1 flex items-center justify-between gap-3 text-xs"><span class="truncate font-medium text-gray-700">{item.nama}</span><span class="shrink-0 text-gray-500">{item.total_pcs_berhasil.toLocaleString('id-ID')} pcs · reject {item.total_pcs_reject.toLocaleString('id-ID')}</span></div><div class="h-2.5 overflow-hidden rounded-full bg-blue-100"><div class="h-full rounded-full bg-blue-500" style="width:{Math.max(3, item.total_pcs_berhasil / maxChart * 100)}%"></div></div></div>{/each}</div><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="bg-gray-50 text-xs text-gray-500"><th class="px-5 py-2.5 text-left font-medium">Nama</th><th class="px-4 py-2.5 text-right font-medium">PCS berhasil</th><th class="px-4 py-2.5 text-right font-medium">Reject</th><th class="px-5 py-2.5 text-right font-medium">Batch</th></tr></thead><tbody>{#each performa[activeDivisi] as item}<tr class="border-t border-gray-50"><td class="px-5 py-3 font-medium text-gray-800">{item.nama}</td><td class="px-4 py-3 text-right">{item.total_pcs_berhasil.toLocaleString('id-ID')}</td><td class="px-4 py-3 text-right text-red-600">{item.total_pcs_reject.toLocaleString('id-ID')}</td><td class="px-5 py-3 text-right text-gray-500">{item.jumlah_batch}</td></tr>{/each}</tbody></table></div>{/if}
</section>

<div class="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
  <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="mb-5 flex items-start justify-between"><div><h2 class="text-sm font-semibold text-gray-900">Output Produksi Harian</h2><p class="mt-1 text-xs text-gray-400">Total pcs dari batch yang dibuat pada periode ini.</p></div><ActivityIcon class="h-5 w-5 text-gray-400" /></div>
    {#if outputHarian.length === 0}<p class="py-10 text-center text-sm text-gray-400">Belum ada data produksi.</p>{:else}{@const maxOutput = Math.max(...outputHarian.map((item) => item.pcs), 1)}<div class="flex h-44 items-end gap-2 border-b border-l border-gray-200 px-3 pb-0 pt-4">{#each outputHarian as item}<div class="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1"><span class="text-[10px] font-semibold text-gray-500 opacity-0 transition group-hover:opacity-100">{item.pcs.toLocaleString('id-ID')}</span><div class="w-full max-w-8 rounded-t bg-blue-500 transition hover:bg-blue-600" style="height:{Math.max(4, item.pcs / maxOutput * 125)}px" title={`${item.label}: ${item.pcs.toLocaleString('id-ID')} pcs`}></div><span class="mt-1 w-full truncate text-center text-[10px] text-gray-400">{item.label}</span></div>{/each}</div>{/if}
  </section>
  <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="mb-5 flex items-start justify-between"><div><h2 class="text-sm font-semibold text-gray-900">Bottleneck Produksi</h2><p class="mt-1 text-xs text-gray-400">Tahap dengan antrean batch terbesar.</p></div><UsersIcon class="h-5 w-5 text-amber-500" /></div>
    {#if bottleneck}<div class="mb-4 rounded-lg bg-amber-50 p-4"><p class="text-xs text-amber-700">Prioritas perhatian</p><p class="mt-1 text-lg font-bold text-amber-800">Divisi {bottleneck.label}</p><p class="mt-1 text-xs text-amber-700">{bottleneck.batch} batch · {bottleneck.pcs.toLocaleString('id-ID')} pcs</p></div>{/if}
    <div class="space-y-4">{#each STAGE_GROUPS as group}{@const count = groupBatches(group).length}{@const max = Math.max(...STAGE_GROUPS.map((item) => groupBatches(item).length), 1)}<div><div class="mb-1 flex justify-between text-xs"><span class="font-medium text-gray-700">{group.label}</span><span class="text-gray-500">{count} batch</span></div><div class="h-2 overflow-hidden rounded-full bg-gray-100"><div class="h-full rounded-full {group.color === 'orange' ? 'bg-orange-500' : group.color === 'blue' ? 'bg-blue-500' : 'bg-violet-500'}" style="width:{Math.max(count ? 4 : 0, count / max * 100)}%"></div></div></div>{/each}</div>
  </section>
</div>

<div class="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
  <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div class="mb-4 flex items-center justify-between"><div><h2 class="text-sm font-semibold text-gray-900">Model Sering Dibuat</h2><p class="text-xs text-gray-400">Berdasarkan jumlah batch pada periode ini.</p></div><ShirtIcon class="h-5 w-5 text-blue-500" /></div>{#if modelSeringDibuat.length === 0}<p class="text-sm text-gray-400">Belum ada data.</p>{:else}{#each modelSeringDibuat as item, i}<div class="flex items-center gap-3 border-b border-gray-50 py-2.5 last:border-0"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500">{i + 1}</span><span class="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">{item.nama}</span><span class="text-right text-xs text-gray-500"><strong class="text-gray-800">{item.batch} batch</strong><br />{item.pcs.toLocaleString('id-ID')} pcs</span></div>{/each}{/if}</section>
  <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div class="mb-4 flex items-center justify-between"><div><h2 class="text-sm font-semibold text-gray-900">Proses Terlama</h2><p class="text-xs text-gray-400">Batch aktif dengan umur proses tertinggi.</p></div><ActivityIcon class="h-5 w-5 text-red-500" /></div>{#if prosesTerlama.length === 0}<p class="text-sm text-gray-400">Belum ada batch aktif.</p>{:else}<div class="divide-y divide-gray-50">{#each prosesTerlama as batch}<a href="/monitor-produksi/{batch.id}" class="flex items-center gap-3 py-2.5 hover:bg-gray-50"><div class="min-w-0 flex-1"><p class="truncate text-sm font-medium text-gray-700">{batch.nama_model}</p><p class="text-xs text-gray-400">{STATUS_DISPLAY[batch.status]} · {(batch.pcs_saat_ini ?? batch.total_pcs).toLocaleString('id-ID')} pcs</p></div><span class="shrink-0 rounded-full {ageInDays(batch.createdAt) > 5 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'} px-2 py-0.5 text-xs font-semibold">{ageInDays(batch.createdAt)} hari</span></a>{/each}</div>{/if}</section>
</div>

<section class="hidden mb-5 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
  <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div class="flex items-center gap-2"><TrendingUpIcon class="h-4 w-4 text-gray-500" /><div><h2 class="text-sm font-semibold text-gray-900">Performa Produksi</h2><p class="text-xs text-gray-400">Hasil selesai pada rentang tanggal terpilih.</p></div></div><span class="text-xs text-gray-400">{terlambat} batch lebih dari 5 hari</span></div>
  <div class="flex overflow-x-auto border-b border-gray-100 px-5">{#each DIVISI as tab}<button onclick={() => activeDivisi = tab} class="border-b-2 px-3 py-2.5 text-xs font-medium {activeDivisi === tab ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}">{tab}<span class="ml-1 text-gray-400">({performa[tab].length})</span></button>{/each}</div>
  {#if loadingPerforma}<p class="p-6 text-sm text-gray-400">Memuat performa...</p>{:else if performa[activeDivisi].length === 0}<p class="p-6 text-sm text-gray-400">Belum ada hasil selesai pada rentang ini.</p>{:else}<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="bg-gray-50 text-xs text-gray-500"><th class="px-5 py-2.5 text-left font-medium">Nama</th><th class="px-4 py-2.5 text-right font-medium">PCS berhasil</th><th class="px-4 py-2.5 text-right font-medium">Reject</th><th class="px-5 py-2.5 text-right font-medium">Batch</th></tr></thead><tbody>{#each performa[activeDivisi] as item}<tr class="border-t border-gray-50"><td class="px-5 py-3 font-medium text-gray-800">{item.nama}</td><td class="px-4 py-3 text-right">{item.total_pcs_berhasil.toLocaleString('id-ID')}</td><td class="px-4 py-3 text-right text-red-600">{item.total_pcs_reject.toLocaleString('id-ID')}</td><td class="px-5 py-3 text-right text-gray-500">{item.jumlah_batch}</td></tr>{/each}</tbody></table></div>{/if}
</section>

<section class="hidden mb-5 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
  <div class="mb-4 flex items-center gap-2"><TrendingUpIcon class="h-4 w-4 text-gray-500" /><div><h2 class="text-sm font-semibold text-gray-900">Chart Performa {activeDivisi}</h2><p class="text-xs text-gray-400">Perbandingan pcs berhasil pada periode terpilih.</p></div></div>
  {#if loadingPerforma}<p class="text-sm text-gray-400">Memuat chart...</p>{:else if performa[activeDivisi].length === 0}<p class="text-sm text-gray-400">Belum ada data performa.</p>{:else}{@const max = Math.max(...performa[activeDivisi].map((item) => item.total_pcs_berhasil), 1)}<div class="space-y-3">{#each performa[activeDivisi] as item}<div><div class="mb-1 flex justify-between gap-3 text-xs"><span class="truncate font-medium text-gray-700">{item.nama}</span><span class="shrink-0 text-gray-500">{item.total_pcs_berhasil.toLocaleString('id-ID')} pcs · reject {item.total_pcs_reject.toLocaleString('id-ID')}</span></div><div class="h-2.5 overflow-hidden rounded-full bg-gray-100"><div class="h-full rounded-full bg-blue-500" style="width:{Math.max(3, item.total_pcs_berhasil / max * 100)}%"></div></div></div>{/each}</div>{/if}
</section>

<div class="space-y-5">
  {#if loading}<div class="rounded-xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-400">Memuat pipeline produksi...</div>{:else if filtered.length === 0}<div class="rounded-xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-400">Tidak ada batch aktif pada rentang tanggal ini.</div>{:else}{#each STAGE_GROUPS as group}{@const list = groupBatches(group)}{#if list.length > 0}{@const current = pageFor(group.label)}{@const hasNext = pageHasNext[group.label]?.[current - 1] ?? false}<section class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"><div class="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3"><div class="flex items-center gap-2"><svelte:component this={group.icon} class="h-4 w-4 text-gray-500" /><h2 class="text-sm font-semibold text-gray-800">Divisi {group.label}</h2></div><div class="flex items-center gap-2 text-xs text-gray-500"><span>{pcs(list).toLocaleString('id-ID')} pcs</span><span class="rounded-full bg-white px-2 py-0.5 font-semibold">{list.length} batch</span></div></div><div class="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">{#each visible(group) as batch}<a href="/monitor-produksi/{batch.id}" class="rounded-xl border border-gray-100 bg-gray-50 p-4 transition hover:border-gray-300 hover:bg-white hover:shadow-sm"><div class="flex items-start justify-between gap-2"><p class="truncate text-sm font-semibold text-gray-800">{batch.nama_model}</p><span class="shrink-0 text-[10px] text-gray-400">{ageInDays(batch.createdAt)} hari</span></div><p class="mt-2 flex items-center gap-1.5 text-xs text-gray-600">{#if batch.kode_hex_warna}<span class="h-2.5 w-2.5 rounded-full ring-1 ring-black/10" style="background:{batch.kode_hex_warna}"></span>{/if}{batch.nama_warna || 'Tanpa warna'}</p><span class="mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold {STATUS_STYLE[batch.status]}">{STATUS_DISPLAY[batch.status]}</span>{#if worker(batch, group)}<p class="mt-2 flex items-center gap-1 text-[11px] text-gray-500"><UsersIcon class="h-3 w-3" />{worker(batch, group)}</p>{/if}<div class="mt-3 flex items-end justify-between gap-2 border-t border-gray-100 pt-3"><span class="text-xs font-semibold text-gray-700">{(batch.pcs_saat_ini ?? batch.total_pcs).toLocaleString('id-ID')} pcs</span><span class="text-right text-[10px] text-gray-400">{batch.detail_ukuran.map((item) => `${item.ukuran}:${item.jumlah_pcs}`).join(' · ')}</span></div><p class="mt-2 text-[10px] text-gray-400">{formatDate(batch.createdAt)}</p></a>{/each}</div>{#if current > 1 || hasNext}<div class="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-xs text-gray-500"><span>Halaman {current}</span><div class="flex gap-2"><button aria-label="Halaman sebelumnya" disabled={current <= 1 || pageLoading === group.label} onclick={() => setPage(group, current - 1)} class="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 hover:bg-gray-50 disabled:opacity-40"><ChevronLeftIcon class="h-3.5 w-3.5" /> Sebelumnya</button><button aria-label="Halaman berikutnya" disabled={!hasNext || pageLoading === group.label} onclick={() => setPage(group, current + 1)} class="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 hover:bg-gray-50 disabled:opacity-40">{pageLoading === group.label ? 'Memuat...' : 'Berikutnya'} <ChevronRightIcon class="h-3.5 w-3.5" /></button></div></div>{/if}</section>{/if}{/each}{/if}
</div>
