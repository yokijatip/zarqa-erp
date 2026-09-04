<script lang="ts">
  import { onMount } from 'svelte';
  import { uploadToCloudinary } from '$lib/cloudinary';
  import {
    aktifkanModelHijab,
    addModelHijab,
    deleteModelHijab,
    getModelHijabPage,
    nonaktifkanModelHijab,
    updateModelHijab,
  } from '$lib/firebase/model-hijab';
  import type { FirestoreCursor } from '$lib/firebase/pagination';
  import { isAdmin } from '$lib/stores/auth.store';
  import { modelHijabCache, warnaCache } from '$lib/stores/data-cache.svelte';
  import type { ModelHijab, Warna, WarnaTersedia } from '$lib/types';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
  import PencilIcon from '@lucide/svelte/icons/pencil';
  import ArchiveIcon from '@lucide/svelte/icons/archive';
  import CheckIcon from '@lucide/svelte/icons/check';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import PackageIcon from '@lucide/svelte/icons/package';

  const PAGE_SIZE = 12;
  let modelList = $state<ModelHijab[]>([]);
  let loading = $state(true);
  let pageLoading = $state(false);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);
  let searchQuery = $state('');
  let tampilNonaktif = $state(false);
  let currentPage = $state(1);
  let pageCursors = $state<FirestoreCursor[]>([null]);
  let pageHasNext = $state<boolean[]>([]);
  let pageCache = $state<ModelHijab[][]>([]);
  let warnaList = $state<Warna[]>([]);

  let openForm = $state(false);
  let openDelete = $state(false);
  let selectedModel = $state<ModelHijab | null>(null);
  let konfirmasiId = $state<string | null>(null);
  let editingId = $state<string | null>(null);
  let fNama = $state('');
  let fFotoUrl = $state('');
  let fFotoFile = $state<File | null>(null);
  let fDeskripsi = $state('');
  let fWarna = $state<WarnaTersedia[]>([]);
  let fHargaJual = $state('');
  let fHargaProduksi = $state('');

  let filteredList = $derived.by(() => {
    const search = searchQuery.trim().toLowerCase();
    if (!search) return modelList;
    return modelList.filter((item) => item.nama_hijab.toLowerCase().includes(search));
  });
  let isEditing = $derived(editingId !== null);
  let canSubmit = $derived(fNama.trim().length > 0);

  function showError(message: string) {
    errorMsg = message;
    setTimeout(() => (errorMsg = null), 4500);
  }

  function logLoadError(message: string, error: unknown) {
    console.error(`[Model Hijab] ${message}`, error);
  }

  function showSuccess(message: string) {
    successMsg = message;
    setTimeout(() => (successMsg = null), 3500);
  }

  function rupiah(value?: number): string {
    return `Rp${(value ?? 0).toLocaleString('id-ID')}`;
  }

  function formatDate(value: ModelHijab['createdAt']): string {
    if (!value) return '-';
    return value.toDate().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function toggleWarna(warna: Warna) {
    const index = fWarna.findIndex((item) => item.warna_id === warna.id);
    if (index >= 0) {
      fWarna = fWarna.filter((_, itemIndex) => itemIndex !== index);
    } else {
      fWarna = [...fWarna, { warna_id: warna.id, nama_warna: warna.nama_warna, kode_hex: warna.kode_hex }];
    }
  }

  function isWarnaSelected(warnaId: string): boolean {
    return fWarna.some((item) => item.warna_id === warnaId);
  }

  async function load() {
    loading = true;
    try {
      const [result, warna] = await Promise.all([
        getModelHijabPage(!tampilNonaktif, null, PAGE_SIZE),
        warnaCache.get(),
      ]);
      warnaList = warna;
      modelList = result.items;
      pageCache = [result.items];
      pageCursors = [null, result.cursor];
      pageHasNext = [result.hasNext];
      currentPage = 1;
    } catch (error) {
      logLoadError('Gagal memuat data.', error);
    } finally {
      loading = false;
    }
  }

  async function nextPage() {
    if (pageLoading || !pageHasNext[currentPage - 1]) return;
    pageLoading = true;
    try {
      const result = await getModelHijabPage(!tampilNonaktif, pageCursors[currentPage] ?? null, PAGE_SIZE);
      pageCache[currentPage] = result.items;
      pageCursors[currentPage + 1] = result.cursor;
      pageHasNext[currentPage] = result.hasNext;
      pageCache = [...pageCache];
      pageCursors = [...pageCursors];
      pageHasNext = [...pageHasNext];
      currentPage += 1;
      modelList = result.items;
    } catch (error) {
      logLoadError('Gagal memuat halaman berikutnya.', error);
    } finally {
      pageLoading = false;
    }
  }

  function previousPage() {
    if (currentPage <= 1 || pageLoading) return;
    currentPage -= 1;
    modelList = pageCache[currentPage - 1] ?? modelList;
  }

  async function toggleNonaktif() {
    tampilNonaktif = !tampilNonaktif;
    await load();
  }

  function resetForm() {
    editingId = null;
    fNama = '';
    fFotoUrl = '';
    fFotoFile = null;
    fDeskripsi = '';
    fWarna = [];
    fHargaJual = '';
    fHargaProduksi = '';
  }

  function openAdd() {
    resetForm();
    openForm = true;
  }

  function openEdit(model: ModelHijab) {
    editingId = model.id;
    fNama = model.nama_hijab;
    fFotoUrl = model.foto_url ?? '';
    fFotoFile = null;
    fDeskripsi = model.deskripsi ?? '';
    fWarna = [...(model.warna_tersedia ?? [])];
    fHargaJual = String(model.harga_jual ?? 0);
    fHargaProduksi = String(model.harga_produksi ?? 0);
    openForm = true;
  }

  async function submitForm() {
    if (!canSubmit) return;
    saving = true;
    try {
      let fotoUrl = fFotoUrl;
      if (fFotoFile) fotoUrl = await uploadToCloudinary(fFotoFile, 'products');
      const input = {
        nama_hijab: fNama.trim(),
        ...(fotoUrl ? { foto_url: fotoUrl } : {}),
        ...(fDeskripsi.trim() ? { deskripsi: fDeskripsi.trim() } : {}),
        warna_tersedia: fWarna.length > 0 ? fWarna : [],
        harga_jual: Math.max(0, Number(fHargaJual) || 0),
        harga_produksi: Math.max(0, Number(fHargaProduksi) || 0),
      };
      if (editingId) {
        await updateModelHijab(editingId, input);
        showSuccess(`Model hijab "${fNama.trim()}" diperbarui.`);
      } else {
        await addModelHijab(input);
        showSuccess(`Model hijab "${fNama.trim()}" ditambahkan.`);
      }
      modelHijabCache.invalidate();
      openForm = false;
      resetForm();
      await load();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Gagal menyimpan model hijab.');
    } finally {
      saving = false;
    }
  }

  async function toggleActive(model: ModelHijab) {
    try {
      if (model.aktif) {
        konfirmasiId = model.id;
        return;
      }
      await aktifkanModelHijab(model.id);
      modelHijabCache.invalidate();
      await load();
      showSuccess(`Model hijab "${model.nama_hijab}" diaktifkan.`);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Gagal mengubah status model hijab.');
    }
  }

  async function confirmNonaktif(model: ModelHijab) {
    try {
      await nonaktifkanModelHijab(model.id);
      modelHijabCache.invalidate();
      konfirmasiId = null;
      await load();
      showSuccess(`Model hijab "${model.nama_hijab}" dinonaktifkan.`);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Gagal menonaktifkan model hijab.');
    }
  }

  function askDelete(model: ModelHijab) {
    selectedModel = model;
    openDelete = true;
  }

  async function submitDelete() {
    if (!selectedModel) return;
    saving = true;
    try {
      await deleteModelHijab(selectedModel.id);
      modelHijabCache.invalidate();
      const name = selectedModel.nama_hijab;
      selectedModel = null;
      openDelete = false;
      await load();
      showSuccess(`Model hijab "${name}" dihapus.`);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Gagal menghapus model hijab.');
    } finally {
      saving = false;
    }
  }

  onMount(load);
</script>

{#if successMsg}
  <div class="fixed right-5 top-5 z-[9999] rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 shadow-lg">{successMsg}</div>
{/if}
{#if errorMsg}
  <div class="fixed right-5 top-5 z-[9999] max-w-sm rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg">{errorMsg}</div>
{/if}

<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
  <div>
    <h1 class="text-xl font-semibold text-foreground">Model Hijab</h1>
    <p class="mt-1 text-sm text-muted-foreground">Master hijab tanpa ukuran. Harga berlaku pusat untuk satu pcs.</p>
  </div>
  <div class="flex flex-wrap gap-2">
    <Button variant="outline" size="sm" onclick={load} disabled={loading}>
      <RefreshCwIcon class={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
    </Button>
    {#if $isAdmin}
      <Button size="sm" onclick={openAdd}><PlusIcon class="h-4 w-4" />Tambah Model Hijab</Button>
    {/if}
  </div>
</div>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-sm">
  <div class="flex min-w-[16rem] flex-1 items-center gap-2">
    <Input bind:value={searchQuery} placeholder="Cari nama hijab..." aria-label="Cari model hijab" />
  </div>
  <Button variant="outline" size="sm" onclick={toggleNonaktif}>{tampilNonaktif ? 'Tampilkan aktif' : 'Lihat nonaktif'}</Button>
</div>

{#if loading}
  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {#each Array(6) as _}<div class="h-56 animate-pulse rounded-xl border bg-muted/30"></div>{/each}
  </div>
{:else if filteredList.length === 0}
  <div class="flex min-h-64 flex-col items-center justify-center rounded-xl border bg-card px-5 text-center shadow-sm">
    <PackageIcon class="h-8 w-8 text-muted-foreground/50" />
    <p class="mt-3 text-sm font-medium text-foreground">{searchQuery ? 'Model hijab tidak ditemukan' : 'Belum ada model hijab'}</p>
    <p class="mt-1 text-xs text-muted-foreground">{searchQuery ? 'Coba kata kunci lain.' : 'Tambahkan master hijab sebelum mencatat stok.'}</p>
    {#if !searchQuery && $isAdmin}<Button class="mt-4" size="sm" onclick={openAdd}>Tambah Model Hijab</Button>{/if}
  </div>
{:else}
  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {#each filteredList as model}
      <article class={`flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm ${model.aktif ? '' : 'opacity-70'}`}>
        {#if model.foto_url}<img src={model.foto_url} alt={model.nama_hijab} loading="lazy" class="h-36 w-full object-cover" />{/if}
        <div class="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div class="min-w-0"><h2 class="truncate text-sm font-semibold text-foreground">{model.nama_hijab}</h2><p class="mt-1 text-xs text-muted-foreground">{model.deskripsi || 'Master hijab tanpa ukuran'}</p></div>
          <span class={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${model.aktif ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>{model.aktif ? 'Aktif' : 'Nonaktif'}</span>
        </div>
        <div class="flex-1 space-y-4 px-5 py-4">
          <div class="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Tidak ada ukuran. Stok dicatat per pcs dan dapat dipakai oleh beberapa varian set.</div>
          {#if (model.warna_tersedia ?? []).length > 0}
            <div>
              <p class="text-[11px] text-muted-foreground">Warna tersedia</p>
              <div class="mt-2 flex flex-wrap gap-1.5">
                {#each model.warna_tersedia ?? [] as warna}
                  <span class="inline-flex items-center gap-1.5 rounded-full border bg-muted/30 px-2 py-1 text-[11px] font-medium text-foreground">
                    <span class="h-2.5 w-2.5 rounded-full border border-black/10" style="background-color: {warna.kode_hex}"></span>
                    {warna.nama_warna}
                  </span>
                {/each}
              </div>
            </div>
          {:else}
            <p class="text-xs text-muted-foreground">Belum ada warna yang ditentukan.</p>
          {/if}
          <div class="grid grid-cols-2 gap-3">
            <div><p class="text-[11px] text-muted-foreground">Harga jual / pcs</p><p class="mt-1 text-sm font-semibold text-foreground">{rupiah(model.harga_jual)}</p></div>
            <div><p class="text-[11px] text-muted-foreground">Harga produksi / pcs</p><p class="mt-1 text-sm font-semibold text-foreground">{rupiah(model.harga_produksi)}</p></div>
          </div>
          <a href={`/stok-hijab?model_id=${model.id}`} class="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"><PackageIcon class="h-3.5 w-3.5" />Kelola stok hijab</a>
        </div>
        <div class="border-t px-5 py-3">
          <p class="mb-2.5 text-[10px] text-muted-foreground">Dibuat {formatDate(model.createdAt)}</p>
          {#if konfirmasiId === model.id}
            <div class="rounded-lg border border-red-200 bg-red-50 p-3"><p class="text-xs font-medium text-red-700">Nonaktifkan model ini?</p><div class="mt-3 flex gap-2"><Button variant="outline" size="sm" class="flex-1" onclick={() => (konfirmasiId = null)}>Batal</Button><Button variant="destructive" size="sm" class="flex-1" onclick={() => confirmNonaktif(model)}>Ya, Nonaktifkan</Button></div></div>
          {:else if $isAdmin}
            <div class="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" class="flex-1" onclick={() => openEdit(model)}><PencilIcon class="h-3.5 w-3.5" />Edit</Button>
              {#if model.aktif}
                <Button variant="outline" size="sm" class="flex-1 text-red-600" onclick={() => toggleActive(model)}><ArchiveIcon class="h-3.5 w-3.5" />Nonaktifkan</Button>
              {:else}
                <Button variant="outline" size="sm" class="flex-1 text-green-700" onclick={() => toggleActive(model)}><CheckIcon class="h-3.5 w-3.5" />Aktifkan</Button>
                <Button variant="outline" size="sm" class="text-red-600" title="Hapus permanen" aria-label={`Hapus ${model.nama_hijab}`} onclick={() => askDelete(model)}><Trash2Icon class="h-3.5 w-3.5" /></Button>
              {/if}
            </div>
          {/if}
        </div>
      </article>
    {/each}
  </div>
  <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
    <span>Menampilkan {filteredList.length} model pada halaman {currentPage}</span>
    <div class="flex items-center gap-2"><Button variant="outline" size="sm" disabled={currentPage <= 1 || pageLoading} onclick={previousPage}>Sebelumnya</Button><span>Halaman {currentPage}{pageLoading ? '...' : ''}</span><Button variant="outline" size="sm" disabled={!pageHasNext[currentPage - 1] || pageLoading} onclick={nextPage}>{pageLoading ? 'Memuat...' : 'Berikutnya'}</Button></div>
  </div>
{/if}

<Dialog.Root bind:open={openForm} onOpenChange={(open) => !open && resetForm()}>
  <Dialog.Content class="flex max-h-[90vh] max-w-lg flex-col gap-0 p-0">
    <Dialog.Header class="shrink-0 px-6 pb-2 pt-6"><Dialog.Title>{isEditing ? 'Edit Model Hijab' : 'Tambah Model Hijab'}</Dialog.Title><Dialog.Description>{isEditing ? 'Perbarui master hijab dan harga pusatnya.' : 'Buat master hijab tanpa ukuran untuk dipakai di stok dan varian set.'}</Dialog.Description></Dialog.Header>
    <div class="flex-1 space-y-4 overflow-y-auto px-6 py-5">
      <div><label for="model-hijab-name" class="mb-1.5 block text-sm font-medium">Nama Hijab <span class="text-red-500">*</span></label><Input id="model-hijab-name" bind:value={fNama} placeholder="Contoh: Luna Zarqa" /></div>
      <div><label for="model-hijab-photo" class="mb-1.5 block text-sm font-medium">Foto Produk <span class="text-xs font-normal text-muted-foreground">(opsional)</span></label>{#if fFotoUrl}<img src={fFotoUrl} alt={`Preview ${fNama || 'hijab'}`} class="mb-2 h-24 w-24 rounded-lg border object-cover" />{/if}<input id="model-hijab-photo" type="file" accept="image/jpeg,image/png,image/webp" onchange={(event) => (fFotoFile = (event.currentTarget as HTMLInputElement).files?.[0] ?? null)} class="block w-full cursor-pointer rounded-md border bg-background px-3 py-2 text-xs" /><p class="mt-1 text-[11px] text-muted-foreground">JPG, PNG, atau WebP. Maksimal 10 MB.</p></div>
      <div><label for="model-hijab-description" class="mb-1.5 block text-sm font-medium">Deskripsi <span class="text-xs font-normal text-muted-foreground">(opsional)</span></label><textarea id="model-hijab-description" rows="3" bind:value={fDeskripsi} class="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm" placeholder="Contoh: hijab voal untuk paket Luna Zarqa"></textarea></div>
      <div>
        <label for="model-hijab-colors" class="mb-1.5 block text-sm font-medium">Warna tersedia <span class="text-xs font-normal text-muted-foreground">(opsional)</span></label>
        {#if warnaList.length === 0}
          <p class="text-xs text-muted-foreground">Belum ada warna terdaftar. <a href="/warna" class="text-primary hover:underline">Tambah warna</a></p>
        {:else}
          <Popover.Root>
            <Popover.Trigger id="model-hijab-colors" class="flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              {#if fWarna.length === 0}
                <span class="text-muted-foreground">Pilih warna</span>
              {:else}
                <div class="flex flex-wrap gap-1.5">
                  {#each fWarna as warna}
                    <span class="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2 py-0.5 text-xs font-medium text-foreground">
                      <span class="h-2.5 w-2.5 rounded-full border border-black/10" style="background-color: {warna.kode_hex}"></span>
                      {warna.nama_warna}
                    </span>
                  {/each}
                </div>
              {/if}
              <span class="ml-2 shrink-0 text-muted-foreground">⌄</span>
            </Popover.Trigger>
            <Popover.Content class="w-[--bits-popover-anchor-width] overflow-hidden p-1" align="start">
              <div class="max-h-[min(16rem,var(--bits-popover-content-available-height))] overflow-y-auto">
                {#each warnaList as warna}
                  {@const selected = isWarnaSelected(warna.id)}
                  <button type="button" onclick={() => toggleWarna(warna)} class="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                    <span class="h-4 w-4 shrink-0 rounded-full border border-black/10 shadow-sm" style="background-color: {warna.kode_hex}"></span>
                    <span class="flex-1 text-left">{warna.nama_warna}</span>
                    {#if selected}<CheckIcon class="h-4 w-4 shrink-0 text-primary" />{:else}<span class="h-4 w-4 shrink-0"></span>{/if}
                  </button>
                {/each}
              </div>
            </Popover.Content>
          </Popover.Root>
          <p class="mt-1 text-[11px] text-muted-foreground">Stok hijab nanti dicatat terpisah berdasarkan warna yang dipilih.</p>
        {/if}
      </div>
      <div class="rounded-lg border bg-muted/30 p-4"><p class="text-sm font-semibold text-foreground">Harga pusat hijab</p><p class="mt-1 text-xs text-muted-foreground">Harga ini berlaku per pcs hijab dan dipakai sebagai referensi. Harga jual paket tetap diatur pada varian model baju.</p><div class="mt-3 grid gap-3 sm:grid-cols-2"><div><label for="model-hijab-sale-price" class="mb-1 block text-xs font-medium">Harga jual / pcs</label><Input id="model-hijab-sale-price" type="number" min="0" bind:value={fHargaJual} placeholder="0" /></div><div><label for="model-hijab-production-price" class="mb-1 block text-xs font-medium">Harga produksi / pcs</label><Input id="model-hijab-production-price" type="number" min="0" bind:value={fHargaProduksi} placeholder="0" /></div></div></div>
    </div>
    <Dialog.Footer class="shrink-0 border-t px-6 py-4"><Button variant="outline" onclick={() => (openForm = false)}>Batal</Button><Button onclick={submitForm} disabled={saving || !canSubmit}>{saving ? 'Menyimpan...' : isEditing ? 'Simpan Perubahan' : 'Tambah Model'}</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={openDelete} onOpenChange={(open) => !open && (selectedModel = null)}>
  <Dialog.Content class="max-w-sm"><Dialog.Header><Dialog.Title>Hapus Model Hijab</Dialog.Title><Dialog.Description>Model yang sudah terhubung ke stok tidak dapat dihapus.</Dialog.Description></Dialog.Header>{#if selectedModel}<div class="rounded-lg border bg-muted/30 p-4 text-sm"><p class="font-semibold">{selectedModel.nama_hijab}</p><p class="mt-1 text-xs text-muted-foreground">Pastikan tidak ada stok yang masih memakai master ini.</p></div>{/if}<Dialog.Footer><Button variant="outline" onclick={() => (openDelete = false)}>Batal</Button><Button variant="destructive" onclick={submitDelete} disabled={saving}>{saving ? 'Menghapus...' : 'Hapus Permanen'}</Button></Dialog.Footer></Dialog.Content>
</Dialog.Root>
