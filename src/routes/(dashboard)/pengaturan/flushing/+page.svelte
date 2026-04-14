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
  import ShieldIcon from '@lucide/svelte/icons/shield';
  import CheckIcon from '@lucide/svelte/icons/check';

  // Koleksi yang akan dihapus saat flush
  type FlushTarget = {
    collection: string;
    label: string;
    subcollection?: string;
  };

  const FLUSH_TARGETS: FlushTarget[] = [
    { collection: 'batch_produksi',  label: 'Batch Produksi',    subcollection: 'riwayat_proses' },
    { collection: 'stok_kain',       label: 'Stok Kain'         },
    { collection: 'model_baju',      label: 'Model Baju'        },
    { collection: 'stok_potongan',   label: 'Stok Potongan'     },
    { collection: 'stok_barang_jadi',label: 'Stok Barang Jadi'  },
    { collection: 'barang_keluar',   label: 'Barang Keluar'     },
  ];

  // Koleksi yang dilindungi — tidak pernah dihapus
  const PROTECTED = [
    { label: 'Akun Pengguna',  description: 'Data login & profil karyawan' },
    { label: 'Warna',          description: 'Master data warna produk' },
  ];

  const CORRECT_PASSWORD = 'Yokijatiperkasa30!';

  // ── State ─────────────────────────────────────────────────────────
  let password  = $state('');
  let step      = $state<'form' | 'confirm' | 'done'>('form');
  let flushing  = $state(false);
  let progress  = $state('');
  let errorMsg  = $state<string | null>(null);
  let deleted   = $state<string[]>([]);   // label koleksi yang sudah selesai dihapus

  let wrongPass = $derived(password.length > 0 && password !== CORRECT_PASSWORD);
  let canFlush  = $derived(password === CORRECT_PASSWORD);

  // ── Helpers ───────────────────────────────────────────────────────
  async function deleteCollection(colName: string) {
    const snap = await getDocs(collection(db, colName));
    if (snap.empty) return;
    for (let i = 0; i < snap.docs.length; i += 499) {
      const chunk = snap.docs.slice(i, i + 499);
      const batch = writeBatch(db);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  async function deleteWithSubcollection(colName: string, subCol: string) {
    const snap = await getDocs(collection(db, colName));
    for (const docSnap of snap.docs) {
      const subSnap = await getDocs(collection(db, colName, docSnap.id, subCol));
      if (!subSnap.empty) {
        for (let i = 0; i < subSnap.docs.length; i += 499) {
          const chunk = subSnap.docs.slice(i, i + 499);
          const batch = writeBatch(db);
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      await deleteDoc(docSnap.ref);
    }
  }

  // ── Flush ────────────────────────────────────────────────────────
  async function runFlush() {
    flushing = true;
    errorMsg = null;
    deleted = [];
    try {
      for (const target of FLUSH_TARGETS) {
        progress = `Menghapus ${target.label}...`;
        if (target.subcollection) {
          await deleteWithSubcollection(target.collection, target.subcollection);
        } else {
          await deleteCollection(target.collection);
        }
        deleted = [...deleted, target.label];
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
    password = '';
    step = 'form';
    errorMsg = null;
    progress = '';
    deleted = [];
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
        Hapus permanen seluruh data operasional. Akun pengguna dan warna tetap aman.
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

    <!-- ── Yang akan dihapus ─────────────────────────────────────── -->
    <div class="rounded-xl border border-red-100 bg-white p-5">
      <h2 class="mb-3 text-sm font-semibold text-gray-800">Yang Akan Dihapus</h2>
      <div class="space-y-1.5">
        {#each FLUSH_TARGETS as t}
          <div class="flex items-center gap-2.5 rounded-lg border border-red-100 bg-red-50 px-3.5 py-2.5">
            <TrashIcon class="h-3.5 w-3.5 shrink-0 text-red-400" />
            <span class="text-sm font-medium text-red-700">{t.label}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- ── Yang dilindungi ───────────────────────────────────────── -->
    <div class="rounded-xl border border-green-100 bg-white p-5">
      <div class="mb-3 flex items-center gap-2">
        <ShieldIcon class="h-4 w-4 text-green-500" />
        <h2 class="text-sm font-semibold text-gray-800">Yang Dilindungi (Tidak Dihapus)</h2>
      </div>
      <div class="space-y-1.5">
        {#each PROTECTED as p}
          <div class="flex items-start gap-2.5 rounded-lg border border-green-100 bg-green-50 px-3.5 py-2.5">
            <CheckIcon class="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
            <div>
              <p class="text-sm font-medium text-green-800">{p.label}</p>
              <p class="text-xs text-green-600">{p.description}</p>
            </div>
          </div>
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
      <h2 class="mb-1 text-base font-semibold text-gray-900">Konfirmasi Flush</h2>
      <p class="mb-5 text-sm text-gray-500">
        Data berikut akan dihapus permanen dari database:
      </p>

      <div class="mb-5 space-y-1.5">
        {#each FLUSH_TARGETS as t}
          {@const done = deleted.includes(t.label)}
          <div class="flex items-center gap-2.5 rounded-lg border {done ? 'border-green-100 bg-green-50' : 'border-red-100 bg-red-50'} px-3.5 py-2">
            {#if done}
              <CheckIcon class="h-3.5 w-3.5 shrink-0 text-green-500" />
              <span class="text-sm text-green-700 line-through">{t.label}</span>
            {:else if flushing && progress.includes(t.label)}
              <LoaderIcon class="h-3.5 w-3.5 shrink-0 animate-spin text-red-400" />
              <span class="text-sm font-medium text-red-700">{t.label}</span>
            {:else}
              <TrashIcon class="h-3.5 w-3.5 shrink-0 text-red-400" />
              <span class="text-sm text-red-700">{t.label}</span>
            {/if}
          </div>
        {/each}
      </div>

      <div class="flex gap-3 justify-end">
        <Button variant="outline" onclick={() => (step = 'form')} disabled={flushing}>
          Batal
        </Button>
        <Button variant="destructive" onclick={runFlush} disabled={flushing} class="gap-2 min-w-[160px]">
          {#if flushing}
            <LoaderIcon class="h-4 w-4 animate-spin" />
            {progress || 'Memproses...'}
          {:else}
            <TrashIcon class="h-4 w-4" />
            Ya, Hapus Semua
          {/if}
        </Button>
      </div>
    </div>

  {:else if step === 'done'}

    <!-- ── Selesai ────────────────────────────────────────────────── -->
    <div class="rounded-xl border border-green-200 bg-green-50 p-6">
      <div class="mb-4 flex items-center gap-3">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
          <CheckIcon class="h-5 w-5 text-green-600" />
        </div>
        <div>
          <p class="font-semibold text-green-800">Flush berhasil!</p>
          <p class="text-sm text-green-700">Semua data operasional telah dihapus.</p>
        </div>
      </div>

      <div class="mb-5 space-y-1">
        {#each FLUSH_TARGETS as t}
          <div class="flex items-center gap-2 text-sm text-green-700">
            <CheckIcon class="h-3.5 w-3.5 shrink-0 text-green-500" />
            <span>{t.label} dihapus</span>
          </div>
        {/each}
      </div>

      <div class="rounded-lg border border-green-200 bg-white px-4 py-3 text-sm text-green-700">
        <span class="font-medium">Tetap tersimpan:</span> Akun pengguna &amp; warna
      </div>

      <Button variant="outline" onclick={reset} class="mt-4">Kembali</Button>
    </div>

  {/if}

</div>
