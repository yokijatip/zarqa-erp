<script lang="ts">
  import {
    collection, getDocs, deleteDoc, writeBatch,
  } from 'firebase/firestore';
  import { db } from '$lib/firebase/config';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import AlertTriangleIcon from '@lucide/svelte/icons/triangle-alert';
  import DatabaseIcon from '@lucide/svelte/icons/database';
  import TrashIcon from '@lucide/svelte/icons/trash-2';
  import LoaderIcon from '@lucide/svelte/icons/loader';

  // ── Collections yang bisa di-flush ────────────────────────────────
  type FlushTarget = {
    id: string;
    label: string;
    description: string;
    collection: string;
    hasSubcollection?: boolean;
    subcollection?: string;
  };

  const TARGETS: FlushTarget[] = [
    {
      id: 'batch',
      label: 'Batch Produksi',
      description: 'Semua order produksi beserta riwayat prosesnya',
      collection: 'batch_produksi',
      hasSubcollection: true,
      subcollection: 'riwayat_proses',
    },
    {
      id: 'stok_kain',
      label: 'Stok Kain',
      description: 'Seluruh data inventaris kain (tersedia & terpakai)',
      collection: 'stok_kain',
    },
    {
      id: 'barang_jadi',
      label: 'Stok Barang Jadi',
      description: 'Stok produk jadi per ukuran',
      collection: 'stok_barang_jadi',
    },
    {
      id: 'stok_potongan',
      label: 'Stok Potongan',
      description: 'Stok kain yang sudah dipotong',
      collection: 'stok_potongan',
    },
    {
      id: 'barang_keluar',
      label: 'Barang Keluar',
      description: 'Riwayat pengiriman & pengeluaran barang',
      collection: 'barang_keluar',
    },
  ];

  // ── State ─────────────────────────────────────────────────────────
  let selected   = $state<Set<string>>(new Set());
  let password   = $state('');
  let step       = $state<'form' | 'confirm' | 'done'>('form');
  let flushing   = $state(false);
  let progress   = $state('');
  let errorMsg   = $state<string | null>(null);

  let noneSelected = $derived(selected.size === 0);
  let wrongPass    = $derived(password.length > 0 && password !== 'Yokijatiperkasa30!');
  let canFlush     = $derived(!noneSelected && password === 'Yokijatiperkasa30!');

  function toggleAll(checked: boolean) {
    selected = checked ? new Set(TARGETS.map((t) => t.id)) : new Set();
  }

  // ── Flush logic ───────────────────────────────────────────────────
  async function deleteCollection(colName: string) {
    const snap = await getDocs(collection(db, colName));
    if (snap.empty) return;
    // Firestore writeBatch max 500 ops
    const chunks = [];
    for (let i = 0; i < snap.docs.length; i += 499) {
      chunks.push(snap.docs.slice(i, i + 499));
    }
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  async function deleteWithSubcollection(colName: string, subCol: string) {
    const snap = await getDocs(collection(db, colName));
    for (const docSnap of snap.docs) {
      // Hapus subdokumen dulu
      const subSnap = await getDocs(collection(db, colName, docSnap.id, subCol));
      if (!subSnap.empty) {
        const chunks = [];
        for (let i = 0; i < subSnap.docs.length; i += 499) {
          chunks.push(subSnap.docs.slice(i, i + 499));
        }
        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      await deleteDoc(docSnap.ref);
    }
  }

  async function runFlush() {
    flushing = true;
    errorMsg = null;
    try {
      const targets = TARGETS.filter((t) => selected.has(t.id));
      for (const target of targets) {
        progress = `Menghapus ${target.label}...`;
        if (target.hasSubcollection && target.subcollection) {
          await deleteWithSubcollection(target.collection, target.subcollection);
        } else {
          await deleteCollection(target.collection);
        }
      }
      progress = '';
      step = 'done';
    } catch (e: unknown) {
      errorMsg = e instanceof Error ? e.message : 'Terjadi kesalahan saat flush.';
      step = 'form';
    } finally {
      flushing = false;
    }
  }

  function reset() {
    selected = new Set();
    password = '';
    step = 'form';
    errorMsg = null;
    progress = '';
  }
</script>

<div class="mx-auto max-w-xl space-y-6">

  <!-- ── Header ───────────────────────────────────────────────────── -->
  <div class="flex items-start gap-3">
    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
      <DatabaseIcon class="h-5 w-5 text-red-600" />
    </div>
    <div>
      <h1 class="text-lg font-semibold text-gray-900">Flushing Database</h1>
      <p class="mt-0.5 text-sm text-gray-500">
        Hapus permanen data operasional. Data master (model baju, warna, pengguna) tidak terpengaruh.
      </p>
    </div>
  </div>

  <!-- ── Danger banner ────────────────────────────────────────────── -->
  <div class="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5">
    <AlertTriangleIcon class="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
    <p class="text-sm font-medium text-red-700">
      Tindakan ini <strong>tidak dapat dibatalkan</strong>. Data yang dihapus tidak bisa dipulihkan kecuali ada backup.
    </p>
  </div>

  {#if step === 'form'}
    <!-- ── Pilih koleksi ──────────────────────────────────────────── -->
    <div class="rounded-xl border border-gray-100 bg-gray-50/50 p-5">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-gray-800">Pilih Data yang Akan Dihapus</h2>
        <button
          type="button"
          onclick={() => toggleAll(selected.size < TARGETS.length)}
          class="text-xs text-blue-600 hover:underline"
        >
          {selected.size === TARGETS.length ? 'Batalkan Semua' : 'Pilih Semua'}
        </button>
      </div>

      <div class="space-y-2">
        {#each TARGETS as target}
          <label
            class={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
              selected.has(target.id)
                ? 'border-red-200 bg-red-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <input
              type="checkbox"
              class="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
              checked={selected.has(target.id)}
              onchange={() => {
                const next = new Set(selected);
                next.has(target.id) ? next.delete(target.id) : next.add(target.id);
                selected = next;
              }}
            />
            <div>
              <p class="text-sm font-medium text-gray-800">{target.label}</p>
              <p class="text-xs text-gray-500">{target.description}</p>
            </div>
          </label>
        {/each}
      </div>
    </div>

    <!-- ── Password ───────────────────────────────────────────────── -->
    <div class="rounded-xl border border-gray-100 bg-gray-50/50 p-5">
      <h2 class="mb-3 text-sm font-semibold text-gray-800">Verifikasi Password</h2>
      <Input
        type="password"
        bind:value={password}
        placeholder="Masukkan password flush"
        autocomplete="off"
      />
      {#if wrongPass}
        <p class="mt-1.5 text-xs text-red-500">Password salah.</p>
      {/if}
    </div>

    {#if errorMsg}
      <p class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</p>
    {/if}

    <!-- ── Action ─────────────────────────────────────────────────── -->
    <div class="flex justify-end">
      <Button
        variant="destructive"
        disabled={!canFlush}
        onclick={() => (step = 'confirm')}
        class="gap-2"
      >
        <TrashIcon class="h-4 w-4" />
        Flush Database
      </Button>
    </div>

  {:else if step === 'confirm'}
    <!-- ── Konfirmasi ────────────────────────────────────────────── -->
    <div class="rounded-xl border border-red-200 bg-white p-6">
      <h2 class="mb-2 text-base font-semibold text-gray-900">Konfirmasi Tindakan</h2>
      <p class="mb-4 text-sm text-gray-600">
        Anda akan menghapus permanen data berikut:
      </p>
      <ul class="mb-6 space-y-1.5">
        {#each TARGETS.filter((t) => selected.has(t.id)) as t}
          <li class="flex items-center gap-2 text-sm text-red-700">
            <TrashIcon class="h-3.5 w-3.5 shrink-0" />
            {t.label}
          </li>
        {/each}
      </ul>
      <div class="flex gap-3 justify-end">
        <Button variant="outline" onclick={() => (step = 'form')} disabled={flushing}>
          Batal
        </Button>
        <Button variant="destructive" onclick={runFlush} disabled={flushing} class="gap-2 min-w-[140px]">
          {#if flushing}
            <LoaderIcon class="h-4 w-4 animate-spin" />
            {progress || 'Memproses...'}
          {:else}
            <TrashIcon class="h-4 w-4" />
            Ya, Hapus Sekarang
          {/if}
        </Button>
      </div>
    </div>

  {:else if step === 'done'}
    <!-- ── Selesai ────────────────────────────────────────────────── -->
    <div class="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
      <svg class="mx-auto mb-3 h-10 w-10 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
      <p class="font-semibold text-green-800">Flush berhasil!</p>
      <p class="mt-1 text-sm text-green-700">Data yang dipilih telah dihapus dari database.</p>
      <Button variant="outline" onclick={reset} class="mt-4">Kembali</Button>
    </div>
  {/if}

</div>
