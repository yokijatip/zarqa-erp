<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { subscribeStokKain } from '$lib/firebase/stok-kain';
  import { getStokBarangJadi, getRiwayatBarangKeluar } from '$lib/firebase/barang-jadi';
  import { getStokPotonganList } from '$lib/firebase/stok-potongan';
  import type { StokKain, StokBarangJadi, StokPotongan, BarangKeluar } from '$lib/types';
  import PackageIcon from '@lucide/svelte/icons/package';
  import LayersIcon from '@lucide/svelte/icons/layers-2';
  import ScissorsIcon from '@lucide/svelte/icons/scissors';
  import AlertTriangleIcon from '@lucide/svelte/icons/triangle-alert';
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
  import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

  let stokKain = $state<StokKain[]>([]);
  let barangJadi = $state<StokBarangJadi[]>([]);
  let stokPotongan = $state<StokPotongan[]>([]);
  let riwayatKeluar = $state<BarangKeluar[]>([]);
  let loading = $state(true);
  let error = $state('');
  let unsubscribe: (() => void) | undefined;

  let totalKain = $derived(stokKain.reduce((sum, item) => sum + item.stok_tersedia, 0));
  let kainKritis = $derived(stokKain.filter((item) => item.stok_tersedia < 100));
  let totalPotongan = $derived(stokPotongan.reduce((sum, item) => sum + item.stok_tersedia, 0));
  let totalBarangJadi = $derived(barangJadi.reduce((sum, item) => sum + item.stok_tersedia, 0));
  let modelBarangJadi = $derived(new Set(barangJadi.filter((item) => item.stok_tersedia > 0).map((item) => item.model_id)).size);
  let modelPotongan = $derived(new Set(stokPotongan.filter((item) => item.stok_tersedia > 0).map((item) => item.model_id)).size);
  let prioritasKain = $derived.by(() => [...stokKain].sort((a, b) => a.stok_tersedia - b.stok_tersedia).slice(0, 8));
  let stokPerModel = $derived.by(() => {
    const map = new Map<string, { nama: string; pcs: number }>();
    for (const item of barangJadi) {
      const current = map.get(item.model_id) ?? { nama: item.nama_model, pcs: 0 };
      current.pcs += item.stok_tersedia;
      map.set(item.model_id, current);
    }
    return [...map.values()].sort((a, b) => b.pcs - a.pcs);
  });
  let stokModelRendah = $derived([...stokPerModel].sort((a, b) => a.pcs - b.pcs).slice(0, 6));
  let keluarPerModel = $derived.by(() => {
    const map = new Map<string, { nama: string; pcs: number; transaksi: number }>();
    for (const keluar of riwayatKeluar) {
      const items = keluar.items?.length ? keluar.items : [{ model_id: keluar.model_id, nama_model: keluar.nama_model, total_pcs: keluar.total_pcs }];
      for (const item of items) {
        if ('status' in item && item.status === 'pending') continue;
        const current = map.get(item.model_id) ?? { nama: item.nama_model, pcs: 0, transaksi: 0 };
        current.pcs += item.total_pcs;
        current.transaksi += 1;
        map.set(item.model_id, current);
      }
    }
    return [...map.values()].sort((a, b) => b.pcs - a.pcs);
  });
  let modelJarangKeluar = $derived([...keluarPerModel].sort((a, b) => a.pcs - b.pcs).slice(0, 6));

  function formatQty(value: number): string {
    return value.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  }

  function reload() {
    loading = true;
    error = '';
    Promise.all([getStokBarangJadi(), getStokPotonganList(), getRiwayatBarangKeluar()])
      .then(([jadi, potongan, keluar]) => { barangJadi = jadi; stokPotongan = potongan; riwayatKeluar = keluar; })
      .catch(() => { error = 'Data stok belum dapat dimuat. Coba refresh kembali.'; })
      .finally(() => { loading = false; });
  }

  onMount(() => {
    unsubscribe = subscribeStokKain((data) => { stokKain = data; loading = false; });
    reload();
  });
  onDestroy(() => unsubscribe?.());
</script>

<div class="mb-6 flex flex-wrap items-start justify-between gap-3">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Dashboard Gudang</h1>
    <p class="mt-1 text-sm text-gray-500">Ringkasan persediaan kain dan barang di gudang.</p>
  </div>
  <button onclick={reload} class="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"><RefreshCwIcon class="h-4 w-4 {loading ? 'animate-spin' : ''}" /> Refresh</button>
</div>

{#if error}<div class="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>{/if}

<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
  <div class="rounded-xl border border-cyan-100 bg-cyan-50 p-5 shadow-sm"><div class="flex items-center justify-between"><p class="text-sm font-medium text-cyan-700">Stok Kain</p><LayersIcon class="h-5 w-5 text-cyan-500" /></div><p class="mt-3 text-2xl font-bold text-cyan-800">{formatQty(totalKain)}</p><p class="mt-1 text-xs text-cyan-700">{stokKain.length} jenis kain tersedia</p></div>
  <div class="rounded-xl border border-amber-100 bg-amber-50 p-5 shadow-sm"><div class="flex items-center justify-between"><p class="text-sm font-medium text-amber-700">Perlu Restock</p><AlertTriangleIcon class="h-5 w-5 text-amber-500" /></div><p class="mt-3 text-2xl font-bold text-amber-800">{kainKritis.length}</p><p class="mt-1 text-xs text-amber-700">jenis kain di bawah batas aman</p></div>
  <div class="rounded-xl border border-violet-100 bg-violet-50 p-5 shadow-sm"><div class="flex items-center justify-between"><p class="text-sm font-medium text-violet-700">Stok Potongan</p><ScissorsIcon class="h-5 w-5 text-violet-500" /></div><p class="mt-3 text-2xl font-bold text-violet-800">{formatQty(totalPotongan)} pcs</p><p class="mt-1 text-xs text-violet-700">{modelPotongan} model memiliki potongan</p></div>
  <div class="rounded-xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm"><div class="flex items-center justify-between"><p class="text-sm font-medium text-emerald-700">Barang Jadi</p><PackageIcon class="h-5 w-5 text-emerald-500" /></div><p class="mt-3 text-2xl font-bold text-emerald-800">{formatQty(totalBarangJadi)} pcs</p><p class="mt-1 text-xs text-emerald-700">{modelBarangJadi} model siap kirim</p></div>
</div>

<div class="grid grid-cols-1 gap-5 xl:grid-cols-2">
  <section class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
    <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><h2 class="text-sm font-semibold text-gray-900">Prioritas Stok Kain</h2><p class="mt-1 text-xs text-gray-400">Urutan dari stok paling sedikit.</p></div><a href="/stok-kain" class="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900">Kelola <ArrowRightIcon class="h-3.5 w-3.5" /></a></div>
    {#if loading}<div class="space-y-3 p-5">{#each Array(4) as _}<div class="h-10 animate-pulse rounded-lg bg-gray-100"></div>{/each}</div>{:else if prioritasKain.length === 0}<p class="p-8 text-center text-sm text-gray-400">Belum ada stok kain.</p>{:else}<div class="divide-y divide-gray-50">{#each prioritasKain as item}<a href="/stok-kain" class="flex items-center gap-3 px-5 py-3 transition hover:bg-gray-50"><span class="h-2.5 w-2.5 shrink-0 rounded-full {item.stok_tersedia < 100 ? 'bg-amber-500' : 'bg-emerald-500'}"></span><div class="min-w-0 flex-1"><p class="truncate text-sm font-medium text-gray-800">{item.nama_kain}{item.nama_warna ? ` - ${item.nama_warna}` : ''}</p><p class="text-xs text-gray-400">Terpakai {formatQty(item.stok_terpakai)} {item.satuan}</p></div><span class="text-sm font-semibold {item.stok_tersedia < 100 ? 'text-amber-700' : 'text-gray-700'}">{formatQty(item.stok_tersedia)} {item.satuan}</span></a>{/each}</div>{/if}
  </section>
  <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div class="mb-4 flex items-center justify-between"><div><h2 class="text-sm font-semibold text-gray-900">Akses Stok</h2><p class="mt-1 text-xs text-gray-400">Buka data gudang yang ingin diperiksa.</p></div><PackageIcon class="h-5 w-5 text-gray-400" /></div><div class="grid gap-3 sm:grid-cols-2"><a href="/stok-kain" class="rounded-lg border border-gray-200 p-4 transition hover:border-gray-400 hover:bg-gray-50"><p class="text-sm font-semibold text-gray-800">Stok Kain</p><p class="mt-1 text-xs text-gray-500">Pembelian, restock, dan riwayat kain.</p></a><a href="/model-hijab" class="rounded-lg border border-gray-200 p-4 transition hover:border-gray-400 hover:bg-gray-50"><p class="text-sm font-semibold text-gray-800">Model Hijab</p><p class="mt-1 text-xs text-gray-500">Master hijab tanpa ukuran dan harga pusat.</p></a><a href="/stok-hijab" class="rounded-lg border border-gray-200 p-4 transition hover:border-gray-400 hover:bg-gray-50"><p class="text-sm font-semibold text-gray-800">Stok Hijab</p><p class="mt-1 text-xs text-gray-500">Stok hijab yang dipakai oleh paket.</p></a><a href="/stok-potongan" class="rounded-lg border border-gray-200 p-4 transition hover:border-gray-400 hover:bg-gray-50"><p class="text-sm font-semibold text-gray-800">Stok Potongan</p><p class="mt-1 text-xs text-gray-500">Sisa hasil cutting yang siap dipakai.</p></a><a href="/barang-jadi" class="rounded-lg border border-gray-200 p-4 transition hover:border-gray-400 hover:bg-gray-50"><p class="text-sm font-semibold text-gray-800">Barang Jadi</p><p class="mt-1 text-xs text-gray-500">Stok siap kirim berdasarkan model dan ukuran.</p></a><a href="/model-baju" class="rounded-lg border border-gray-200 p-4 transition hover:border-gray-400 hover:bg-gray-50"><p class="text-sm font-semibold text-gray-800">Model Baju</p><p class="mt-1 text-xs text-gray-500">Ukuran, warna, harga, dan varian model.</p></a></div></section>
</div>

<div class="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
  <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="mb-5 flex items-start justify-between"><div><h2 class="text-sm font-semibold text-gray-900">Distribusi Stok Barang Jadi</h2><p class="mt-1 text-xs text-gray-400">Model dengan stok siap kirim terbanyak.</p></div><PackageIcon class="h-5 w-5 text-emerald-500" /></div>
    {#if stokPerModel.length === 0}<p class="py-8 text-center text-sm text-gray-400">Belum ada stok barang jadi.</p>{:else}{@const max = stokPerModel[0].pcs}<div class="space-y-3">{#each stokPerModel.slice(0, 8) as item}<div><div class="mb-1 flex items-center justify-between gap-3 text-xs"><span class="truncate font-medium text-gray-700">{item.nama}</span><span class="shrink-0 font-semibold text-gray-800">{formatQty(item.pcs)} pcs</span></div><div class="h-2 overflow-hidden rounded-full bg-gray-100"><div class="h-full rounded-full bg-emerald-500" style="width:{max ? Math.max(3, item.pcs / max * 100) : 0}%"></div></div></div>{/each}</div>{/if}
  </section>
  <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="mb-5 flex items-start justify-between"><div><h2 class="text-sm font-semibold text-gray-900">Model Stok Menipis</h2><p class="mt-1 text-xs text-gray-400">Prioritas pemeriksaan dan pengisian stok barang jadi.</p></div><AlertTriangleIcon class="h-5 w-5 text-amber-500" /></div>
    {#if stokModelRendah.length === 0}<p class="py-8 text-center text-sm text-gray-400">Belum ada data stok.</p>{:else}<div class="divide-y divide-gray-50">{#each stokModelRendah as item}<div class="flex items-center justify-between gap-3 py-2.5"><span class="truncate text-sm font-medium text-gray-700">{item.nama}</span><span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold {item.pcs === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}">{item.pcs === 0 ? 'Habis' : `${formatQty(item.pcs)} pcs`}</span></div>{/each}</div>{/if}
  </section>
  <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="mb-5 flex items-start justify-between"><div><h2 class="text-sm font-semibold text-gray-900">Model Paling Banyak Keluar</h2><p class="mt-1 text-xs text-gray-400">Berdasarkan riwayat pengiriman yang tercatat.</p></div><ArrowRightIcon class="h-5 w-5 text-blue-500" /></div>
    {#if keluarPerModel.length === 0}<p class="py-8 text-center text-sm text-gray-400">Belum ada riwayat pengiriman.</p>{:else}{@const max = keluarPerModel[0].pcs}<div class="space-y-3">{#each keluarPerModel.slice(0, 8) as item}<div><div class="mb-1 flex items-center justify-between gap-3 text-xs"><span class="truncate font-medium text-gray-700">{item.nama}</span><span class="shrink-0 font-semibold text-gray-800">{formatQty(item.pcs)} pcs <span class="font-normal text-gray-400">({item.transaksi}x)</span></span></div><div class="h-2 overflow-hidden rounded-full bg-gray-100"><div class="h-full rounded-full bg-blue-500" style="width:{max ? Math.max(3, item.pcs / max * 100) : 0}%"></div></div></div>{/each}</div>{/if}
  </section>
  <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="mb-5 flex items-start justify-between"><div><h2 class="text-sm font-semibold text-gray-900">Model Jarang Keluar</h2><p class="mt-1 text-xs text-gray-400">Model dengan volume pengiriman paling rendah.</p></div><PackageIcon class="h-5 w-5 text-gray-400" /></div>
    {#if modelJarangKeluar.length === 0}<p class="py-8 text-center text-sm text-gray-400">Belum ada riwayat pengiriman.</p>{:else}<div class="divide-y divide-gray-50">{#each modelJarangKeluar as item}<div class="flex items-center justify-between gap-3 py-2.5"><span class="truncate text-sm font-medium text-gray-700">{item.nama}</span><span class="shrink-0 text-xs text-gray-500">{formatQty(item.pcs)} pcs · {item.transaksi}x</span></div>{/each}</div>{/if}
  </section>
</div>
