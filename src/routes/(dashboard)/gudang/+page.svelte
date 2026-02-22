<script lang="ts">
  import type { StatusBatch } from '$lib/types';
  import { STATUS_LABEL } from '$lib/types';

  // ── Dummy data ────────────────────────────────────────────────────
  const PIPELINE: {
    id: string; nama_model: string; total_pcs: number;
    status: StatusBatch; hari: number;
  }[] = [
    { id: 'b01', nama_model: "Gamis Syar'i Polos",  total_pcs: 100, status: 'CUTTING_IN_PROGRESS', hari: 3  },
    { id: 'b02', nama_model: 'Tunik Batik Modern',   total_pcs: 70,  status: 'JAHIT_IN_PROGRESS',   hari: 7  },
    { id: 'b03', nama_model: 'Baju Koko Premium',    total_pcs: 60,  status: 'STEAM_IN_PROGRESS',   hari: 10 },
    { id: 'b04', nama_model: 'Dress Muslim Casual',  total_pcs: 60,  status: 'PENDING_CUTTING',     hari: 1  },
    { id: 'b05', nama_model: 'Abaya Elegan',          total_pcs: 60,  status: 'JAHIT_DONE',          hari: 14 },
    { id: 'b09', nama_model: 'Dress Muslim Casual',  total_pcs: 60,  status: 'CUTTING_DONE',        hari: 5  },
    { id: 'b10', nama_model: 'Abaya Elegan',          total_pcs: 50,  status: 'STEAM_DONE',          hari: 12 },
    { id: 'b11', nama_model: "Gamis Syar'i Polos",  total_pcs: 70,  status: 'PENDING_CUTTING',     hari: 2  },
    { id: 'b12', nama_model: 'Tunik Batik Modern',   total_pcs: 50,  status: 'JAHIT_IN_PROGRESS',   hari: 8  },
  ];

  const STOK_KAIN = [
    { nama_kain: 'Katun Premium', stok_tersedia: 850 },
    { nama_kain: 'Batik Sogan',   stok_tersedia: 450 },
    { nama_kain: 'Wolfis',         stok_tersedia: 75  },
    { nama_kain: 'Jersey',          stok_tersedia: 320 },
    { nama_kain: 'Balotelly',       stok_tersedia: 200 },
    { nama_kain: 'Linen',           stok_tersedia: 90  },
  ];

  // ── Stage config ──────────────────────────────────────────────────
  type StageConf = {
    status: StatusBatch; label: string; short: string;
    dot: string; ring: string; textActive: string;
    bgActive: string; borderActive: string;
  };

  const STAGES: StageConf[] = [
    { status: 'PENDING_CUTTING',     label: 'Antri Cutting',   short: 'Antri',    dot: 'bg-slate-400',   ring: 'ring-slate-300',   textActive: 'text-slate-700',   bgActive: 'bg-slate-50',   borderActive: 'border-slate-200'   },
    { status: 'CUTTING_IN_PROGRESS', label: 'Cutting',         short: 'Cutting',  dot: 'bg-orange-500',  ring: 'ring-orange-300',  textActive: 'text-orange-700',  bgActive: 'bg-orange-50',  borderActive: 'border-orange-200'  },
    { status: 'CUTTING_DONE',        label: 'Cutting Selesai', short: 'Cut Done', dot: 'bg-yellow-500',  ring: 'ring-yellow-300',  textActive: 'text-yellow-700',  bgActive: 'bg-yellow-50',  borderActive: 'border-yellow-200'  },
    { status: 'JAHIT_IN_PROGRESS',   label: 'Jahit',           short: 'Jahit',    dot: 'bg-blue-500',    ring: 'ring-blue-300',    textActive: 'text-blue-700',    bgActive: 'bg-blue-50',    borderActive: 'border-blue-200'    },
    { status: 'JAHIT_DONE',          label: 'Jahit Selesai',   short: 'Jahit ✓',  dot: 'bg-teal-500',    ring: 'ring-teal-300',    textActive: 'text-teal-700',    bgActive: 'bg-teal-50',    borderActive: 'border-teal-200'    },
    { status: 'STEAM_IN_PROGRESS',   label: 'Steam',           short: 'Steam',    dot: 'bg-purple-500',  ring: 'ring-purple-300',  textActive: 'text-purple-700',  bgActive: 'bg-purple-50',  borderActive: 'border-purple-200'  },
    { status: 'STEAM_DONE',          label: 'Steam Selesai',   short: 'Steam ✓',  dot: 'bg-emerald-500', ring: 'ring-emerald-300', textActive: 'text-emerald-700', bgActive: 'bg-emerald-50', borderActive: 'border-emerald-200' },
    { status: 'COMPLETED',           label: 'Selesai',         short: 'Selesai',  dot: 'bg-green-500',   ring: 'ring-green-300',   textActive: 'text-green-700',   bgActive: 'bg-green-50',   borderActive: 'border-green-200'   },
  ];

  // ── Quick actions ─────────────────────────────────────────────────
  const ACTIONS: { title: string; desc: string; href: string; iconColor: string; iconBg: string; svg: string }[] = [
    {
      title: 'Buat Order Produksi', desc: 'Mulai batch produksi baru',
      href: '/order-produksi', iconColor: 'text-blue-600', iconBg: 'bg-blue-100',
      svg: 'M12 4.5v15m7.5-7.5h-15',
    },
    {
      title: 'Tambah Stok Kain', desc: 'Catat kain masuk ke gudang',
      href: '/stok-kain', iconColor: 'text-amber-600', iconBg: 'bg-amber-100',
      svg: 'M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3',
    },
    {
      title: 'Monitor Produksi', desc: 'Pantau progress seluruh batch',
      href: '/monitor-produksi', iconColor: 'text-purple-600', iconBg: 'bg-purple-100',
      svg: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z',
    },
    {
      title: 'Catat Barang Keluar', desc: 'Rekam pengiriman barang jadi',
      href: '/barang-keluar', iconColor: 'text-green-600', iconBg: 'bg-green-100',
      svg: 'M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12',
    },
    {
      title: 'Model Baju', desc: 'Kelola katalog model produksi',
      href: '/model-baju', iconColor: 'text-pink-600', iconBg: 'bg-pink-100',
      svg: 'M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z',
    },
    {
      title: 'Barang Jadi', desc: 'Lihat stok barang siap kirim',
      href: '/barang-jadi', iconColor: 'text-teal-600', iconBg: 'bg-teal-100',
      svg: 'm20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z',
    },
  ];

  // ── Derived ────────────────────────────────────────────────────────
  function countStatus(s: StatusBatch) {
    return PIPELINE.filter(b => b.status === s).length;
  }
  function pcsStatus(s: StatusBatch) {
    return PIPELINE.filter(b => b.status === s).reduce((sum, b) => sum + b.total_pcs, 0);
  }

  const batchAktif    = PIPELINE.filter(b => b.status !== 'COMPLETED');
  const kainKritis    = STOK_KAIN.filter(k => k.stok_tersedia < 100);
  const totalPcsAktif = batchAktif.reduce((s, b) => s + b.total_pcs, 0);
  const siapKirim     = countStatus('STEAM_DONE');

  const TODAY_STR = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  let selectedStage = $state<StatusBatch | null>(null);

  let filteredPipeline = $derived(
    selectedStage
      ? PIPELINE.filter(b => b.status === selectedStage)
      : [...batchAktif].sort((a, b) => b.hari - a.hari)
  );

  function stageOf(status: StatusBatch) {
    return STAGES.find(s => s.status === status)!;
  }
</script>

<!-- ── Header ─────────────────────────────────────────────────────── -->
<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Dashboard Gudang</h1>
    <p class="mt-0.5 text-sm text-gray-500">{TODAY_STR}</p>
  </div>
  <span class="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
    <svg class="h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/>
    </svg>
    Mode Demo
  </span>
</div>

<!-- ── KPI Cards ──────────────────────────────────────────────────── -->
<div class="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">

  <!-- Batch Berjalan -->
  <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="flex items-start justify-between">
      <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Batch Berjalan</p>
      <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50">
        <svg class="h-3.5 w-3.5 text-orange-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"/>
        </svg>
      </span>
    </div>
    <p class="mt-3 text-3xl font-bold tracking-tight text-gray-900">{batchAktif.length}</p>
    <p class="mt-0.5 text-xs text-gray-500">{totalPcsAktif.toLocaleString('id-ID')} pcs sedang diproduksi</p>
    <div class="mt-3 h-1 w-full rounded-full bg-gray-100">
      <div class="h-1 rounded-full bg-orange-400" style="width: {PIPELINE.length ? Math.round((batchAktif.length / PIPELINE.length) * 100) : 0}%"></div>
    </div>
    <p class="mt-1 text-xs text-gray-400">{PIPELINE.length - batchAktif.length} batch selesai</p>
  </div>

  <!-- Antri Cutting -->
  <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="flex items-start justify-between">
      <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Antri Cutting</p>
      <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
        <svg class="h-3.5 w-3.5 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
        </svg>
      </span>
    </div>
    <p class="mt-3 text-3xl font-bold tracking-tight text-gray-900">{countStatus('PENDING_CUTTING')}</p>
    <p class="mt-0.5 text-xs text-gray-500">{pcsStatus('PENDING_CUTTING')} pcs menunggu diproses</p>
    <p class="mt-3 text-xs text-gray-400">Cutting aktif: {countStatus('CUTTING_IN_PROGRESS')} batch</p>
  </div>

  <!-- Siap Kirim -->
  <div class="rounded-xl border {siapKirim > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-gray-100 bg-white'} p-5 shadow-sm">
    <div class="flex items-start justify-between">
      <p class="text-xs font-medium uppercase tracking-wider {siapKirim > 0 ? 'text-emerald-600' : 'text-gray-400'}">Siap Kirim</p>
      <span class="flex h-7 w-7 items-center justify-center rounded-lg {siapKirim > 0 ? 'bg-emerald-100' : 'bg-gray-100'}">
        <svg class="h-3.5 w-3.5 {siapKirim > 0 ? 'text-emerald-600' : 'text-gray-400'}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
        </svg>
      </span>
    </div>
    <p class="mt-3 text-3xl font-bold tracking-tight {siapKirim > 0 ? 'text-emerald-700' : 'text-gray-900'}">{siapKirim}</p>
    <p class="mt-0.5 text-xs {siapKirim > 0 ? 'text-emerald-600' : 'text-gray-500'}">{pcsStatus('STEAM_DONE')} pcs menunggu dicatat keluar</p>
    {#if siapKirim > 0}
      <a href="/barang-keluar" class="mt-3 inline-block text-xs font-medium text-emerald-700 hover:underline">Catat sekarang →</a>
    {:else}
      <p class="mt-3 text-xs text-gray-400">Belum ada yang siap kirim</p>
    {/if}
  </div>

  <!-- Kain Kritis -->
  <div class="rounded-xl border {kainKritis.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'} p-5 shadow-sm">
    <div class="flex items-start justify-between">
      <p class="text-xs font-medium uppercase tracking-wider {kainKritis.length > 0 ? 'text-amber-600' : 'text-gray-400'}">Kain Kritis</p>
      <span class="flex h-7 w-7 items-center justify-center rounded-lg {kainKritis.length > 0 ? 'bg-amber-100' : 'bg-gray-100'}">
        <svg class="h-3.5 w-3.5 {kainKritis.length > 0 ? 'text-amber-600' : 'text-gray-400'}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
        </svg>
      </span>
    </div>
    <p class="mt-3 text-3xl font-bold tracking-tight {kainKritis.length > 0 ? 'text-amber-700' : 'text-gray-900'}">{kainKritis.length}</p>
    <p class="mt-0.5 text-xs {kainKritis.length > 0 ? 'text-amber-600' : 'text-gray-500'}">
      {kainKritis.length > 0 ? kainKritis.map(k => k.nama_kain).join(', ') : 'Semua stok kain aman'}
    </p>
    {#if kainKritis.length > 0}
      <a href="/stok-kain" class="mt-3 inline-block text-xs font-medium text-amber-700 hover:underline">Restock sekarang →</a>
    {:else}
      <p class="mt-3 text-xs text-gray-400">{STOK_KAIN.length} jenis kain tersedia</p>
    {/if}
  </div>

</div>

<!-- ── Pipeline Produksi ───────────────────────────────────────────── -->
<div class="mb-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
  <div class="mb-4 flex items-center justify-between">
    <div>
      <h2 class="text-sm font-semibold text-gray-800">Pipeline Produksi</h2>
      <p class="text-xs text-gray-400">Klik tahap untuk filter batch · {batchAktif.length} batch aktif</p>
    </div>
    {#if selectedStage}
      <button
        onclick={() => selectedStage = null}
        class="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
      >
        <svg class="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
        Reset filter
      </button>
    {/if}
  </div>

  <!-- Stage tiles — 4 col mobile, 8 col desktop (no horizontal scroll) -->
  <div class="grid grid-cols-4 gap-2 lg:grid-cols-8">
    {#each STAGES as stage}
      {@const count = countStatus(stage.status)}
      {@const pcs   = pcsStatus(stage.status)}
      {@const active = count > 0}
      {@const sel    = selectedStage === stage.status}

      <button
        onclick={() => { if (active) selectedStage = sel ? null : stage.status; }}
        class="flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition
          {sel
            ? `${stage.bgActive} ${stage.borderActive} ring-2 ${stage.ring} ring-offset-1`
            : active
              ? `${stage.bgActive} ${stage.borderActive} hover:shadow-sm cursor-pointer`
              : 'border-gray-100 bg-gray-50 opacity-30 cursor-default'}"
      >
        <!-- Count badge -->
        <span class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white
          {active ? stage.dot : 'bg-gray-300'}">
          {count}
        </span>
        <!-- Stage label -->
        <span class="text-[11px] font-medium leading-tight {active ? stage.textActive : 'text-gray-400'}">
          {stage.short}
        </span>
        <!-- Pcs count -->
        {#if active}
          <span class="text-[10px] {stage.textActive} opacity-70">{pcs} pcs</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Separator -->
  <div class="my-4 border-t border-gray-100"></div>

  <!-- Batch list -->
  <div>
    <p class="mb-2.5 text-xs font-medium text-gray-500">
      {selectedStage ? STATUS_LABEL[selectedStage] : 'Semua Batch Aktif'}
      <span class="ml-1 text-gray-400">· {filteredPipeline.length} batch</span>
    </p>

    {#if filteredPipeline.length === 0}
      <p class="py-6 text-center text-sm text-gray-400">Tidak ada batch pada tahap ini</p>
    {:else}
      <div class="space-y-1.5">
        {#each filteredPipeline as batch}
          {@const s = stageOf(batch.status)}
          {@const terlambat = batch.hari > 5}
          <a
            href="/order-produksi/{batch.id}"
            class="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5 transition hover:bg-white hover:shadow-sm"
          >
            <div class="flex min-w-0 items-center gap-3">
              <!-- Stage dot -->
              <span class="h-2 w-2 shrink-0 rounded-full {s.dot}"></span>
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-gray-800">{batch.nama_model}</p>
              </div>
            </div>
            <div class="ml-3 flex shrink-0 items-center gap-2.5">
              <span class="text-xs text-gray-400">{batch.total_pcs} pcs</span>
              {#if terlambat}
                <span class="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                  {batch.hari}h ⚠
                </span>
              {:else}
                <span class="text-xs text-gray-400">{batch.hari}h</span>
              {/if}
              <span class="rounded-full border px-2.5 py-0.5 text-[11px] font-medium {s.bgActive} {s.borderActive} {s.textActive}">
                {s.short}
              </span>
              <svg class="h-3.5 w-3.5 text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- ── Bottom Row: Quick Actions + Stok Kain ──────────────────────── -->
<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">

  <!-- Quick Actions -->
  <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <h2 class="mb-4 text-sm font-semibold text-gray-800">Aksi Cepat</h2>
    <div class="space-y-1">
      {#each ACTIONS as action}
        <a
          href={action.href}
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-gray-50"
        >
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {action.iconBg}">
            <svg class="h-4 w-4 {action.iconColor}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="{action.svg}" />
            </svg>
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-gray-800">{action.title}</p>
            <p class="text-xs text-gray-400">{action.desc}</p>
          </div>
          <svg class="h-4 w-4 shrink-0 text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </a>
      {/each}
    </div>
  </div>

  <!-- Stok Kain -->
  <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-gray-800">Stok Kain</h2>
      <a href="/stok-kain" class="text-xs font-medium text-blue-600 hover:underline">Lihat semua →</a>
    </div>
    <div class="space-y-3">
      {#each STOK_KAIN as kain}
        {@const total  = kain.stok_tersedia + (STOK_KAIN.find(k => k.nama_kain === kain.nama_kain)?.stok_tersedia ?? 0)}
        {@const kritis = kain.stok_tersedia < 100}
        {@const persen = Math.min((kain.stok_tersedia / 900) * 100, 100)}
        <div>
          <div class="mb-1.5 flex items-center justify-between">
            <div class="flex items-center gap-1.5">
              {#if kritis}
                <span class="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
              {:else}
                <span class="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
              {/if}
              <span class="text-sm text-gray-700">{kain.nama_kain}</span>
            </div>
            <span class="text-xs {kritis ? 'font-semibold text-amber-600' : 'text-gray-500'}">
              {kain.stok_tersedia.toLocaleString('id-ID')} yard{kritis ? ' ⚠' : ''}
            </span>
          </div>
          <div class="h-1.5 w-full rounded-full bg-gray-100">
            <div
              class="h-1.5 rounded-full {kritis ? 'bg-amber-400' : 'bg-blue-400'}"
              style="width: {persen.toFixed(1)}%"
            ></div>
          </div>
        </div>
      {/each}
    </div>
  </div>

</div>

<!-- ── Alert Banner ───────────────────────────────────────────────── -->
{#if kainKritis.length > 0}
  <div class="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
    <svg class="mt-0.5 h-5 w-5 shrink-0 text-amber-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/>
    </svg>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-semibold text-amber-800">Stok Kain Perlu Segera Diisi Ulang</p>
      <p class="mt-0.5 text-xs text-amber-700">
        {kainKritis.map(k => `${k.nama_kain} (${k.stok_tersedia} yard)`).join(' · ')}
      </p>
    </div>
    <a href="/stok-kain" class="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700">
      Restock →
    </a>
  </div>
{/if}
