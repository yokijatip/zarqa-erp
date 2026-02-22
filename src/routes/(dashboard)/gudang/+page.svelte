<script lang="ts">
  import type { StatusBatch } from '$lib/types';
  import { STATUS_LABEL } from '$lib/types';

  // ── Dummy pipeline data (sama seperti dashboard) ──────────────────
  const PIPELINE: { id: string; nama_model: string; total_pcs: number; status: StatusBatch; hari: number }[] = [
    { id: 'b01', nama_model: "Gamis Syar'i Polos",  total_pcs: 100, status: 'CUTTING_IN_PROGRESS', hari: 3  },
    { id: 'b02', nama_model: 'Tunik Batik Modern',   total_pcs: 70,  status: 'JAHIT_IN_PROGRESS',   hari: 7  },
    { id: 'b03', nama_model: 'Baju Koko Premium',    total_pcs: 60,  status: 'STEAM_IN_PROGRESS',   hari: 10 },
    { id: 'b04', nama_model: 'Dress Muslim Casual',  total_pcs: 60,  status: 'PENDING_CUTTING',     hari: 1  },
    { id: 'b05', nama_model: 'Abaya Elegan',          total_pcs: 60,  status: 'JAHIT_DONE',          hari: 14 },
    { id: 'b09', nama_model: 'Dress Muslim Casual',  total_pcs: 60,  status: 'CUTTING_DONE',         hari: 5  },
    { id: 'b10', nama_model: 'Abaya Elegan',          total_pcs: 50,  status: 'STEAM_DONE',           hari: 12 },
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

  // ── Pipeline stages config ────────────────────────────────────────
  const STAGES: { status: StatusBatch; label: string; color: string; bg: string; dot: string }[] = [
    { status: 'PENDING_CUTTING',     label: 'Antri Cutting', color: 'text-slate-600',  bg: 'bg-slate-50  border-slate-200',  dot: 'bg-slate-400'  },
    { status: 'CUTTING_IN_PROGRESS', label: 'Cutting',       color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
    { status: 'CUTTING_DONE',        label: 'Cutting Selesai', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-400' },
    { status: 'JAHIT_IN_PROGRESS',   label: 'Jahit',         color: 'text-blue-700',   bg: 'bg-blue-50   border-blue-200',   dot: 'bg-blue-500'   },
    { status: 'JAHIT_DONE',          label: 'Jahit Selesai', color: 'text-teal-700',   bg: 'bg-teal-50   border-teal-200',   dot: 'bg-teal-500'   },
    { status: 'STEAM_IN_PROGRESS',   label: 'Steam',         color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', dot: 'bg-purple-500' },
    { status: 'STEAM_DONE',          label: 'Steam Selesai', color: 'text-emerald-700',bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-400' },
    { status: 'COMPLETED',           label: 'Selesai',       color: 'text-green-700',  bg: 'bg-green-50  border-green-200',  dot: 'bg-green-500'  },
  ];

  // ── Shortcuts config ─────────────────────────────────────────────
  const SHORTCUTS = [
    {
      title: 'Buat Order Produksi',
      desc: 'Mulai batch produksi baru',
      href: '/order-produksi',
      color: 'bg-blue-50 border-blue-100 hover:border-blue-300',
      icon: 'blue',
    },
    {
      title: 'Tambah Stok Kain',
      desc: 'Catat kain masuk ke gudang',
      href: '/stok-kain',
      color: 'bg-amber-50 border-amber-100 hover:border-amber-300',
      icon: 'amber',
    },
    {
      title: 'Monitor Produksi',
      desc: 'Pantau progress seluruh batch',
      href: '/monitor-produksi',
      color: 'bg-purple-50 border-purple-100 hover:border-purple-300',
      icon: 'purple',
    },
    {
      title: 'Catat Barang Keluar',
      desc: 'Rekam pengiriman barang jadi',
      href: '/barang-keluar',
      color: 'bg-green-50 border-green-100 hover:border-green-300',
      icon: 'green',
    },
    {
      title: 'Model Baju',
      desc: 'Kelola katalog model produksi',
      href: '/model-baju',
      color: 'bg-pink-50 border-pink-100 hover:border-pink-300',
      icon: 'pink',
    },
    {
      title: 'Barang Jadi',
      desc: 'Lihat stok barang siap kirim',
      href: '/barang-jadi',
      color: 'bg-teal-50 border-teal-100 hover:border-teal-300',
      icon: 'teal',
    },
  ];

  // ── Derived counts ────────────────────────────────────────────────
  function countStatus(s: StatusBatch) {
    return PIPELINE.filter(b => b.status === s).length;
  }

  let batchAktif    = PIPELINE.filter(b => b.status !== 'COMPLETED');
  let kainKritis    = STOK_KAIN.filter(k => k.stok_tersedia < 100);
  let totalPcsAktif = batchAktif.reduce((s, b) => s + b.total_pcs, 0);

  // today string
  const TODAY_STR = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // Selected stage filter
  let selectedStage = $state<StatusBatch | null>(null);
  let filteredPipeline = $derived(
    selectedStage ? PIPELINE.filter(b => b.status === selectedStage) : batchAktif
  );
</script>

<!-- ── Header ──────────────────────────────────────────────────── -->
<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
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

<!-- ── Stats Row ──────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
  <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
    <p class="text-xs text-gray-400 uppercase tracking-wider font-medium">Batch Berjalan</p>
    <p class="mt-2 text-3xl font-bold text-gray-900">{batchAktif.length}</p>
    <p class="mt-0.5 text-xs text-gray-500">{totalPcsAktif} pcs sedang diproduksi</p>
  </div>
  <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
    <p class="text-xs text-gray-400 uppercase tracking-wider font-medium">Antri Cutting</p>
    <p class="mt-2 text-3xl font-bold text-gray-900">{countStatus('PENDING_CUTTING')}</p>
    <p class="mt-0.5 text-xs text-gray-500">batch menunggu diproses</p>
  </div>
  <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
    <p class="text-xs text-gray-400 uppercase tracking-wider font-medium">Siap Kirim</p>
    <p class="mt-2 text-3xl font-bold text-gray-900">{countStatus('STEAM_DONE')}</p>
    <p class="mt-0.5 text-xs text-gray-500">batch menunggu dicatat keluar</p>
  </div>
  <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm {kainKritis.length > 0 ? 'border-amber-200 bg-amber-50' : ''}">
    <p class="text-xs uppercase tracking-wider font-medium {kainKritis.length > 0 ? 'text-amber-600' : 'text-gray-400'}">Kain Kritis</p>
    <p class="mt-2 text-3xl font-bold {kainKritis.length > 0 ? 'text-amber-700' : 'text-gray-900'}">{kainKritis.length}</p>
    <p class="mt-0.5 text-xs {kainKritis.length > 0 ? 'text-amber-600' : 'text-gray-500'}">
      {kainKritis.length > 0 ? kainKritis.map(k => k.nama_kain).join(', ') : 'semua stok aman'}
    </p>
  </div>
</div>

<!-- ── Pipeline Produksi ───────────────────────────────────────── -->
<div class="mb-5 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
  <div class="mb-4 flex items-center justify-between">
    <div>
      <h2 class="text-sm font-semibold text-gray-800">Pipeline Produksi</h2>
      <p class="text-xs text-gray-400">Klik tahap untuk filter batch di bawah</p>
    </div>
    {#if selectedStage}
      <button onclick={() => selectedStage = null} class="text-xs text-blue-600 hover:underline">
        Reset filter ×
      </button>
    {/if}
  </div>

  <!-- Pipeline Stages - scrollable horizontal -->
  <div class="flex items-stretch gap-0 overflow-x-auto pb-2">
    {#each STAGES as stage, i}
      {@const count = countStatus(stage.status)}
      {@const isActive = count > 0}
      {@const isSelected = selectedStage === stage.status}

      <!-- Stage box -->
      <button
        onclick={() => selectedStage = isSelected ? null : stage.status}
        disabled={!isActive && !isSelected}
        class="group relative flex min-w-[110px] flex-1 flex-col items-center rounded-lg border p-3 transition
          {isSelected
            ? stage.bg + ' ' + 'ring-2 ring-blue-400 ring-offset-1'
            : isActive
              ? stage.bg + ' cursor-pointer hover:shadow-sm'
              : 'bg-gray-50 border-gray-100 opacity-40 cursor-default'}"
      >
        <span class="flex h-7 w-7 items-center justify-center rounded-full {isActive ? stage.dot : 'bg-gray-300'} mb-1.5">
          <span class="text-xs font-bold text-white">{count}</span>
        </span>
        <p class="text-center text-[11px] font-medium leading-tight {isActive ? stage.color : 'text-gray-400'}">
          {stage.label}
        </p>
      </button>

      <!-- Arrow between stages -->
      {#if i < STAGES.length - 1}
        <div class="flex items-center px-1 text-gray-300">
          <svg class="h-3.5 w-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      {/if}
    {/each}
  </div>

  <!-- Batch list filtered by selected stage -->
  <div class="mt-4">
    {#if filteredPipeline.length === 0}
      <p class="py-4 text-center text-sm text-gray-400">Tidak ada batch pada tahap ini</p>
    {:else}
      <div class="space-y-1.5">
        <p class="mb-2 text-xs font-medium text-gray-500">
          {selectedStage ? STATUS_LABEL[selectedStage] : 'Semua Batch Aktif'}
          · {filteredPipeline.length} batch
        </p>
        {#each filteredPipeline as batch}
          {@const stage = STAGES.find(s => s.status === batch.status)}
          <a
            href="/order-produksi/{batch.id}"
            class="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 transition hover:bg-white hover:shadow-sm"
          >
            <div class="min-w-0">
              <span class="truncate text-sm font-medium text-gray-800">{batch.nama_model}</span>
              <span class="ml-2 text-xs text-gray-400">{batch.total_pcs} pcs</span>
            </div>
            <div class="ml-3 flex shrink-0 items-center gap-2">
              <span class="text-xs text-gray-400">{batch.hari}h yang lalu</span>
              <span class="rounded-full px-2 py-0.5 text-xs font-medium {stage?.bg ?? ''} {stage?.color ?? ''}">
                {STATUS_LABEL[batch.status]}
              </span>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- ── Quick Actions ───────────────────────────────────────────── -->
<div class="mb-5 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
  <h2 class="mb-4 text-sm font-semibold text-gray-800">Aksi Cepat</h2>
  <div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">

    <!-- Buat Order Produksi -->
    <a href="/order-produksi" class="flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition {SHORTCUTS[0].color}">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
        <svg class="h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </div>
      <div>
        <p class="text-xs font-semibold text-gray-800 leading-tight">{SHORTCUTS[0].title}</p>
        <p class="mt-0.5 text-[10px] text-gray-500 leading-tight">{SHORTCUTS[0].desc}</p>
      </div>
    </a>

    <!-- Tambah Stok Kain -->
    <a href="/stok-kain" class="flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition {SHORTCUTS[1].color}">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
        <svg class="h-5 w-5 text-amber-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3" />
        </svg>
      </div>
      <div>
        <p class="text-xs font-semibold text-gray-800 leading-tight">{SHORTCUTS[1].title}</p>
        <p class="mt-0.5 text-[10px] text-gray-500 leading-tight">{SHORTCUTS[1].desc}</p>
      </div>
    </a>

    <!-- Monitor Produksi -->
    <a href="/monitor-produksi" class="flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition {SHORTCUTS[2].color}">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100">
        <svg class="h-5 w-5 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      </div>
      <div>
        <p class="text-xs font-semibold text-gray-800 leading-tight">{SHORTCUTS[2].title}</p>
        <p class="mt-0.5 text-[10px] text-gray-500 leading-tight">{SHORTCUTS[2].desc}</p>
      </div>
    </a>

    <!-- Catat Barang Keluar -->
    <a href="/barang-keluar" class="flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition {SHORTCUTS[3].color}">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100">
        <svg class="h-5 w-5 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
        </svg>
      </div>
      <div>
        <p class="text-xs font-semibold text-gray-800 leading-tight">{SHORTCUTS[3].title}</p>
        <p class="mt-0.5 text-[10px] text-gray-500 leading-tight">{SHORTCUTS[3].desc}</p>
      </div>
    </a>

    <!-- Model Baju -->
    <a href="/model-baju" class="flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition {SHORTCUTS[4].color}">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-100">
        <svg class="h-5 w-5 text-pink-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />
        </svg>
      </div>
      <div>
        <p class="text-xs font-semibold text-gray-800 leading-tight">{SHORTCUTS[4].title}</p>
        <p class="mt-0.5 text-[10px] text-gray-500 leading-tight">{SHORTCUTS[4].desc}</p>
      </div>
    </a>

    <!-- Barang Jadi -->
    <a href="/barang-jadi" class="flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition {SHORTCUTS[5].color}">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100">
        <svg class="h-5 w-5 text-teal-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
        </svg>
      </div>
      <div>
        <p class="text-xs font-semibold text-gray-800 leading-tight">{SHORTCUTS[5].title}</p>
        <p class="mt-0.5 text-[10px] text-gray-500 leading-tight">{SHORTCUTS[5].desc}</p>
      </div>
    </a>

  </div>
</div>

<!-- ── Stok Kain Warning ────────────────────────────────────────── -->
{#if kainKritis.length > 0}
<div class="rounded-xl border border-amber-200 bg-amber-50 p-4">
  <div class="flex items-start gap-3">
    <svg class="mt-0.5 h-5 w-5 shrink-0 text-amber-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/>
    </svg>
    <div class="flex-1">
      <p class="text-sm font-semibold text-amber-800">Peringatan Stok Kain Kritis</p>
      <p class="mt-1 text-xs text-amber-700">
        {kainKritis.length} jenis kain di bawah 100 yard:
        {kainKritis.map(k => `${k.nama_kain} (${k.stok_tersedia} yard)`).join(' · ')}
      </p>
    </div>
    <a href="/stok-kain" class="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700">
      Restock Sekarang
    </a>
  </div>
</div>
{/if}
