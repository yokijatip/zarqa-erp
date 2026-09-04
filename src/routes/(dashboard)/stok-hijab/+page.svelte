<script lang="ts">
  import { onMount } from "svelte";
  import {
    addStokHijab,
    deleteStokHijab,
    getRiwayatStokHijabPage,
    getStokHijabPage,
    kurangiStokHijabManual,
    restockHijab,
    updateStokHijab,
  } from "$lib/firebase/stok-hijab";
  import { modelHijabCache, stokHijabCache, warnaCache } from "$lib/stores/data-cache.svelte";
  import type { FirestoreCursor } from "$lib/firebase/pagination";
  import type { ModelHijab, RiwayatStokHijab, StokHijab, Warna } from "$lib/types";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SearchIcon from "@lucide/svelte/icons/search";
  import PackageIcon from "@lucide/svelte/icons/package";
  import HistoryIcon from "@lucide/svelte/icons/history";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import MinusIcon from "@lucide/svelte/icons/minus";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  const PAGE_SIZE = 20;
  let stokList = $state<StokHijab[]>([]);
  let loading = $state(true);
  let pageLoading = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);
  let searchQuery = $state("");
  let currentPage = $state(1);
  let pageCursors = $state<FirestoreCursor[]>([null]);
  let pageHasNext = $state<boolean[]>([]);
  let pageCache = $state<StokHijab[][]>([]);
  let modelHijabList = $state<ModelHijab[]>([]);
  let warnaList = $state<Warna[]>([]);

  let openTambah = $state(false);
  let openRestock = $state(false);
  let openKurangi = $state(false);
  let openEdit = $state(false);
  let openRiwayat = $state(false);
  let selectedStok = $state<StokHijab | null>(null);
  let saving = $state(false);
  let deleting = $state(false);

  let fModelHijabId = $state("");
  let fWarnaId = $state("");
  let fStokAwal = $state("");
  let fStokMinimum = $state("0");
  let fCatatan = $state("");

  let rJumlah = $state("");
  let rTanggalBeli = $state("");
  let rSupplier = $state("");
  let rCatatan = $state("");

  let kJumlah = $state("");
  let kCatatan = $state("");
  let eNama = $state("");
  let eModelHijabId = $state("");
  let eWarnaId = $state("");
  let eStokMinimum = $state("");
  let eCatatan = $state("");
  let konfirmasiHapus = $state(false);

  let riwayatList = $state<RiwayatStokHijab[]>([]);
  let riwayatLoading = $state(false);
  let riwayatPageLoading = $state(false);
  let riwayatPage = $state(1);
  let riwayatHasNext = $state(false);
  let riwayatCursors = $state<FirestoreCursor[]>([null]);
  let riwayatPageCache = $state<RiwayatStokHijab[][]>([]);

  let filteredList = $derived.by(() => {
    const query = searchQuery.trim().toLowerCase();
    return query
      ? stokList.filter((item) => item.nama_hijab.toLowerCase().includes(query))
      : stokList;
  });
  let totalStok = $derived(stokList.reduce((sum, item) => sum + item.stok_tersedia, 0));
  let totalNilai = $derived(stokList.reduce((sum, item) => sum + item.stok_tersedia * (item.harga_per_unit ?? 0), 0));
  let totalKritis = $derived(stokList.filter((item) => item.stok_tersedia <= (item.stok_minimum ?? 0)).length);

  function showSuccess(message: string) {
    successMsg = message;
    setTimeout(() => (successMsg = null), 3500);
  }

  function showError(message: string) {
    errorMsg = message;
    setTimeout(() => (errorMsg = null), 4500);
  }

  function formatRupiah(value: number): string {
    return `Rp${value.toLocaleString("id-ID")}`;
  }

  function formatTanggal(value?: import("firebase/firestore").Timestamp): string {
    if (!value) return "-";
    return value.toDate().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function status(item: StokHijab): { label: string; className: string } {
    const minimum = item.stok_minimum ?? 0;
    if (item.stok_tersedia <= 0) return { label: "Habis", className: "bg-red-100 text-red-700" };
    if (minimum > 0 && item.stok_tersedia <= minimum) return { label: "Kritis", className: "bg-amber-100 text-amber-700" };
    return { label: "Aman", className: "bg-green-100 text-green-700" };
  }

  function warnaUntukModel(model?: ModelHijab): Warna[] {
    if (!model?.warna_tersedia?.length) return warnaList;
    const warnaIds = new Set(model.warna_tersedia.map((item) => item.warna_id));
    return warnaList.filter((item) => warnaIds.has(item.id));
  }

  function warnaTerpilih(modelId: string, warnaId: string): Warna | undefined {
    return warnaUntukModel(modelHijabList.find((model) => model.id === modelId)).find((warna) => warna.id === warnaId);
  }

  function hppModel(modelId?: string): number {
    return modelHijabList.find((model) => model.id === modelId)?.harga_produksi ?? 0;
  }

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      const [result, modelHijab, warna] = await Promise.all([
        getStokHijabPage(null, PAGE_SIZE),
        modelHijabCache.get(),
        warnaCache.get(),
      ]);
      modelHijabList = modelHijab;
      warnaList = warna;
      stokList = result.items;
      pageCache = [result.items];
      pageCursors = [null, result.cursor];
      pageHasNext = [result.hasNext];
      currentPage = 1;
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal memuat stok hijab.");
    } finally {
      loading = false;
    }
  }

  async function nextPage() {
    if (pageLoading || !pageHasNext[currentPage - 1]) return;
    pageLoading = true;
    try {
      const result = await getStokHijabPage(pageCursors[currentPage] ?? null, PAGE_SIZE);
      pageCache[currentPage] = result.items;
      pageCursors[currentPage + 1] = result.cursor;
      pageHasNext[currentPage] = result.hasNext;
      pageCache = [...pageCache];
      pageCursors = [...pageCursors];
      pageHasNext = [...pageHasNext];
      currentPage += 1;
      stokList = result.items;
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal memuat halaman berikutnya.");
    } finally {
      pageLoading = false;
    }
  }

  function previousPage() {
    if (currentPage <= 1 || pageLoading) return;
    currentPage -= 1;
    stokList = pageCache[currentPage - 1] ?? stokList;
  }

  function resetTambah() {
    fModelHijabId = "";
    fWarnaId = "";
    fStokAwal = "";
    fStokMinimum = "0";
    fCatatan = "";
  }

  function bukaTambah() {
    resetTambah();
    openTambah = true;
  }

  async function submitTambah() {
    const modelHijab = modelHijabList.find((item) => item.id === fModelHijabId);
    const warna = warnaTerpilih(fModelHijabId, fWarnaId);
    const nama = modelHijab?.nama_hijab.trim() ?? "";
    const jumlah = Math.floor(Number(fStokAwal) || 0);
    if (!nama || jumlah < 0) return;
    saving = true;
    try {
      await addStokHijab({
        model_hijab_id: modelHijab?.id,
        nama_hijab: nama,
        ...(warna ? { warna_id: warna.id, nama_warna: warna.nama_warna, kode_hex_warna: warna.kode_hex } : {}),
        stok_tersedia: jumlah,
        stok_minimum: Math.max(0, Number(fStokMinimum) || 0),
        ...(fCatatan.trim() ? { catatan: fCatatan.trim() } : {}),
      });
      stokHijabCache.invalidate();
      await load();
      openTambah = false;
      showSuccess(`Stok hijab "${nama}" berhasil ditambahkan.`);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal menambahkan stok hijab.");
    } finally {
      saving = false;
    }
  }

  function bukaRestock(item: StokHijab) {
    selectedStok = item;
    rJumlah = "";
    rTanggalBeli = new Date().toISOString().slice(0, 10);
    rSupplier = "";
    rCatatan = "";
    openRestock = true;
  }

  async function submitRestock() {
    if (!selectedStok) return;
    const jumlah = Math.floor(Number(rJumlah) || 0);
    if (jumlah <= 0) return;
    saving = true;
    try {
      await restockHijab(selectedStok.id, jumlah, {
        tanggal_beli: rTanggalBeli || undefined,
        supplier: rSupplier.trim() || undefined,
        catatan: rCatatan.trim() || undefined,
      });
      const name = selectedStok.nama_hijab;
      stokHijabCache.invalidate();
      await load();
      openRestock = false;
      selectedStok = null;
      showSuccess(`Stok ${name} bertambah ${jumlah} pcs.`);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal melakukan restock.");
    } finally {
      saving = false;
    }
  }

  function bukaKurangi(item: StokHijab) {
    selectedStok = item;
    kJumlah = "";
    kCatatan = "";
    openKurangi = true;
  }

  async function submitKurangi() {
    if (!selectedStok) return;
    const jumlah = Math.floor(Number(kJumlah) || 0);
    if (jumlah <= 0 || jumlah > selectedStok.stok_tersedia) return;
    saving = true;
    try {
      await kurangiStokHijabManual(selectedStok.id, jumlah, kCatatan.trim() || undefined);
      const name = selectedStok.nama_hijab;
      stokHijabCache.invalidate();
      await load();
      openKurangi = false;
      selectedStok = null;
      showSuccess(`Stok ${name} dikurangi ${jumlah} pcs.`);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal mengurangi stok hijab.");
    } finally {
      saving = false;
    }
  }

  function bukaEdit(item: StokHijab) {
    selectedStok = item;
    eNama = item.nama_hijab;
    eModelHijabId = item.model_hijab_id ?? "";
    eWarnaId = item.warna_id ?? "";
    eStokMinimum = String(item.stok_minimum ?? 0);
    eCatatan = item.catatan ?? "";
    konfirmasiHapus = false;
    openEdit = true;
  }

  async function submitEdit() {
    const modelHijab = modelHijabList.find((item) => item.id === eModelHijabId);
    const warna = warnaTerpilih(eModelHijabId, eWarnaId);
    const nama = modelHijab?.nama_hijab.trim() ?? eNama.trim();
    if (!selectedStok || !nama) return;
    saving = true;
    try {
      await updateStokHijab(selectedStok.id, {
        model_hijab_id: modelHijab?.id,
        nama_hijab: nama,
        warna_id: warna?.id,
        nama_warna: warna?.nama_warna,
        kode_hex_warna: warna?.kode_hex,
        stok_minimum: Math.max(0, Number(eStokMinimum) || 0),
        catatan: eCatatan.trim() || undefined,
      });
      stokHijabCache.invalidate();
      await load();
      openEdit = false;
      selectedStok = null;
      showSuccess("Data stok hijab berhasil diperbarui.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal memperbarui stok hijab.");
    } finally {
      saving = false;
    }
  }

  async function submitHapus() {
    if (!selectedStok) return;
    deleting = true;
    try {
      await deleteStokHijab(selectedStok.id);
      stokHijabCache.invalidate();
      const name = selectedStok.nama_hijab;
      await load();
      openEdit = false;
      selectedStok = null;
      konfirmasiHapus = false;
      showSuccess(`Stok hijab "${name}" dihapus.`);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal menghapus stok hijab.");
    } finally {
      deleting = false;
    }
  }

  async function bukaRiwayat(item: StokHijab) {
    selectedStok = item;
    openRiwayat = true;
    riwayatLoading = true;
    try {
      const result = await getRiwayatStokHijabPage(item.id, null, 10);
      riwayatList = result.items;
      riwayatPage = 1;
      riwayatHasNext = result.hasNext;
      riwayatPageCache = [result.items];
      riwayatCursors = [null, result.cursor];
    } catch (error) {
      riwayatList = [];
      showError(error instanceof Error ? error.message : "Gagal memuat riwayat stok hijab.");
    } finally {
      riwayatLoading = false;
    }
  }

  async function nextRiwayatPage() {
    if (!selectedStok || riwayatPageLoading || !riwayatHasNext) return;
    riwayatPageLoading = true;
    try {
      const result = await getRiwayatStokHijabPage(selectedStok.id, riwayatCursors[riwayatPage] ?? null, 10);
      riwayatList = result.items;
      riwayatPageCache[riwayatPage] = result.items;
      riwayatPageCache = [...riwayatPageCache];
      riwayatCursors[riwayatPage + 1] = result.cursor;
      riwayatCursors = [...riwayatCursors];
      riwayatHasNext = result.hasNext;
      riwayatPage += 1;
    } finally {
      riwayatPageLoading = false;
    }
  }

  function previousRiwayatPage() {
    if (riwayatPage <= 1 || riwayatPageLoading) return;
    riwayatPage -= 1;
    riwayatList = riwayatPageCache[riwayatPage - 1] ?? riwayatList;
    riwayatHasNext = true;
  }

  function labelRiwayat(type: RiwayatStokHijab["tipe"]): string {
    return { stok_awal: "Stok awal", restock: "Restock", hasil_produksi: "Hasil produksi", barang_keluar: "Barang keluar", batal_keluar: "Pembatalan / retur", kurangi_manual: "Pengurangan manual" }[type];
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
    <h1 class="text-xl font-semibold text-foreground">Stok Hijab</h1>
    <p class="mt-1 text-sm text-muted-foreground">Persediaan hijab yang dipakai oleh varian paket penjualan.</p>
  </div>
  <div class="flex flex-wrap gap-2">
    <Button variant="outline" size="sm" onclick={() => load()} disabled={loading}>
      <RefreshCwIcon class={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      Refresh
    </Button>
    <Button size="sm" onclick={bukaTambah}><PlusIcon class="h-4 w-4" />Tambah Stok Hijab</Button>
  </div>
</div>

<div class="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
  <div class="rounded-lg border bg-card p-4 shadow-sm"><p class="text-xs text-muted-foreground">Jenis hijab</p><p class="mt-2 text-2xl font-semibold text-foreground">{stokList.length}</p><p class="mt-1 text-xs text-muted-foreground">pada halaman aktif</p></div>
  <div class="rounded-lg border bg-card p-4 shadow-sm"><p class="text-xs text-muted-foreground">Total stok</p><p class="mt-2 text-2xl font-semibold text-foreground">{totalStok.toLocaleString("id-ID")}</p><p class="mt-1 text-xs text-muted-foreground">pcs tersedia</p></div>
  <div class="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm"><p class="text-xs text-amber-700">Perlu restock</p><p class="mt-2 text-2xl font-semibold text-amber-800">{totalKritis}</p><p class="mt-1 text-xs text-amber-700">habis atau di bawah minimum</p></div>
  <div class="rounded-lg border bg-card p-4 shadow-sm"><p class="text-xs text-muted-foreground">Nilai persediaan</p><p class="mt-2 text-xl font-semibold text-foreground">{formatRupiah(totalNilai)}</p><p class="mt-1 text-xs text-muted-foreground">berdasarkan biaya per unit terakhir</p></div>
</div>

  <div class="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
  Buat <a class="font-semibold underline" href="/model-hijab">Model Hijab</a> terlebih dahulu, lalu kaitkan stoknya di sini. Saat membuat varian Set Hijab, pilih model dan stok hijab tersebut; barang keluar akan mengurangi stok baju dan hijab sekaligus.
</div>

<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
  <div class="relative w-full max-w-sm">
    <SearchIcon class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    <Input class="pl-9" placeholder="Cari nama hijab..." bind:value={searchQuery} />
  </div>
  <p class="text-xs text-muted-foreground">Halaman {currentPage} · {filteredList.length} stok tampil</p>
</div>

{#if loading}
  <div class="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">Memuat stok hijab...</div>
{:else if filteredList.length === 0}
  <div class="rounded-lg border bg-card p-12 text-center">
    <PackageIcon class="mx-auto h-10 w-10 text-muted-foreground/50" />
    <p class="mt-3 text-sm font-medium text-foreground">Belum ada stok hijab</p>
    <p class="mt-1 text-sm text-muted-foreground">Tambahkan stok awal sebelum dipilih pada varian penjualan.</p>
  </div>
{:else}
  <div class="overflow-hidden rounded-lg border bg-card shadow-sm">
    <div class="hidden grid-cols-[minmax(0,1.6fr)_120px_140px_130px_190px] gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
      <span>Hijab</span><span>Stok tersedia</span><span>Minimum</span><span>Status</span><span class="text-right">Aksi</span>
    </div>
    {#each filteredList as item}
      {@const itemStatus = status(item)}
      <div class="grid gap-3 border-b px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1.6fr)_120px_140px_130px_190px] md:items-center md:gap-4">
        <div class="min-w-0">
          <p class="truncate font-semibold text-foreground">{modelHijabList.find((model) => model.id === item.model_hijab_id)?.nama_hijab ?? item.nama_hijab}</p>
          {#if item.nama_warna}
            <p class="mt-1 flex items-center gap-1.5 text-xs text-foreground"><span class="h-2.5 w-2.5 rounded-full border border-black/10" style="background-color: {item.kode_hex_warna ?? '#d1d5db'}"></span>{item.nama_warna}</p>
          {/if}
          <p class="mt-1 text-xs {item.model_hijab_id ? 'text-primary' : 'text-amber-600'}">{item.model_hijab_id ? "Model Hijab terhubung" : "Belum dikaitkan ke Model Hijab"}</p>
          <p class="mt-1 text-xs text-muted-foreground">{item.harga_per_unit ? `${formatRupiah(item.harga_per_unit)} / pcs` : "HPP belum diisi"}</p>
        </div>
        <div><p class="font-semibold tabular-nums text-foreground">{item.stok_tersedia.toLocaleString("id-ID")} pcs</p><p class="text-xs text-muted-foreground">{item.total_keluar.toLocaleString("id-ID")} keluar</p></div>
        <div class="text-sm text-muted-foreground">{(item.stok_minimum ?? 0).toLocaleString("id-ID")} pcs</div>
        <div><span class={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${itemStatus.className}`}>{itemStatus.label}</span></div>
        <div class="flex flex-wrap justify-start gap-1.5 md:justify-end">
          <Button variant="outline" size="sm" title="Restock" onclick={() => bukaRestock(item)}><PlusIcon class="h-3.5 w-3.5" /><span class="sr-only">Restock</span></Button>
          <Button variant="outline" size="sm" title="Kurangi stok" onclick={() => bukaKurangi(item)}><MinusIcon class="h-3.5 w-3.5" /><span class="sr-only">Kurangi stok</span></Button>
          <Button variant="outline" size="sm" title="Riwayat stok" onclick={() => bukaRiwayat(item)}><HistoryIcon class="h-3.5 w-3.5" /><span class="sr-only">Riwayat</span></Button>
          <Button variant="outline" size="sm" title="Edit" onclick={() => bukaEdit(item)}><PencilIcon class="h-3.5 w-3.5" /><span class="sr-only">Edit</span></Button>
        </div>
      </div>
    {/each}
  </div>
  <div class="mt-4 flex items-center justify-end gap-2">
    <Button variant="outline" size="sm" disabled={currentPage <= 1 || pageLoading} onclick={previousPage}>Sebelumnya</Button>
    <span class="min-w-20 text-center text-xs text-muted-foreground">Halaman {currentPage}{pageLoading ? "..." : ""}</span>
    <Button variant="outline" size="sm" disabled={!pageHasNext[currentPage - 1] || pageLoading} onclick={nextPage}>{pageLoading ? "Memuat..." : "Berikutnya"}</Button>
  </div>
{/if}

<Dialog.Root bind:open={openTambah}>
  <Dialog.Content class="max-w-lg">
    <Dialog.Header><Dialog.Title>Tambah Stok Hijab</Dialog.Title><Dialog.Description>Pilih master hijab yang menjadi sumber stok. Satu master dapat dipakai oleh beberapa varian paket.</Dialog.Description></Dialog.Header>
    <div class="space-y-4">
      <div><label class="mb-1.5 block text-sm font-medium" for="hijab-model">Model Hijab <span class="text-red-500">*</span></label>{#if modelHijabList.length > 0}<select id="hijab-model" bind:value={fModelHijabId} onchange={() => (fWarnaId = "")} class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"><option value="">Pilih model hijab</option>{#each modelHijabList.filter((model) => model.aktif) as model}<option value={model.id}>{model.nama_hijab}</option>{/each}</select>{:else}<div class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Belum ada model hijab. <a class="font-medium text-primary hover:underline" href="/model-hijab">Buat Model Hijab →</a></div>{/if}</div>
      <div>
        <label class="mb-1.5 block text-sm font-medium" for="hijab-color">Warna <span class="text-xs font-normal text-muted-foreground">(opsional)</span></label>
        {#if warnaList.length > 0}
          <select id="hijab-color" bind:value={fWarnaId} disabled={!fModelHijabId} class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60">
            <option value="">Tanpa warna / stok umum</option>
            {#each warnaUntukModel(modelHijabList.find((model) => model.id === fModelHijabId)) as warna}
              <option value={warna.id}>{warna.nama_warna}</option>
            {/each}
          </select>
          {#if fModelHijabId && !(modelHijabList.find((model) => model.id === fModelHijabId)?.warna_tersedia?.length)}
            <p class="mt-1 text-[11px] text-muted-foreground">Master ini belum membatasi warna; semua warna terdaftar dapat dipilih.</p>
          {/if}
        {:else}
          <p class="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Belum ada warna terdaftar. <a class="font-medium text-primary hover:underline" href="/warna">Tambah warna</a> terlebih dahulu.</p>
        {/if}
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div><label class="mb-1.5 block text-sm font-medium" for="hijab-initial">Stok awal</label><Input id="hijab-initial" type="number" min="0" bind:value={fStokAwal} placeholder="0" /></div>
        <div><label class="mb-1.5 block text-sm font-medium" for="hijab-min">Batas minimum</label><Input id="hijab-min" type="number" min="0" bind:value={fStokMinimum} placeholder="0" /></div>
      </div>
      {#if fModelHijabId}
        <div class="rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
          <p class="font-medium text-foreground">HPP produksi mengikuti Model Hijab</p>
          <p class="mt-0.5 text-xs text-muted-foreground">{formatRupiah(hppModel(fModelHijabId))} / pcs. Nilai ini diambil otomatis dari master model.</p>
        </div>
      {/if}
      <div><label class="mb-1.5 block text-sm font-medium" for="hijab-note">Catatan</label><textarea id="hijab-note" rows="2" bind:value={fCatatan} class="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Opsional"></textarea></div>
      <p class="rounded-md border border-dashed px-3 py-2.5 text-xs text-muted-foreground">Stok awal atau hasil produksi tidak mengurangi kas. Pengeluaran produksi dicatat melalui proses keuangan yang sesuai.</p>
    </div>
    <Dialog.Footer><Button variant="outline" onclick={() => (openTambah = false)}>Batal</Button><Button onclick={submitTambah} disabled={saving || !fModelHijabId}>{saving ? "Menyimpan..." : "Simpan Stok"}</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={openRestock}>
  <Dialog.Content class="max-w-lg">
    <Dialog.Header><Dialog.Title>Restock Hijab</Dialog.Title><Dialog.Description>{selectedStok?.nama_hijab} · stok sekarang {selectedStok?.stok_tersedia.toLocaleString("id-ID")} pcs.</Dialog.Description></Dialog.Header>
    <div class="space-y-4">
      <div class="grid gap-3 sm:grid-cols-2"><div><label class="mb-1.5 block text-sm font-medium" for="restock-hijab-qty">Jumlah masuk <span class="text-red-500">*</span></label><Input id="restock-hijab-qty" type="number" min="1" bind:value={rJumlah} placeholder="0" /></div><div class="rounded-md border bg-muted/30 px-3 py-2.5"><p class="text-xs text-muted-foreground">HPP produksi / pcs</p><p class="mt-1 text-sm font-semibold text-foreground">{formatRupiah(hppModel(selectedStok?.model_hijab_id))}</p><p class="mt-0.5 text-[11px] text-muted-foreground">Mengikuti Model Hijab</p></div></div>
      <div class="grid gap-3 sm:grid-cols-2"><div><label class="mb-1.5 block text-sm font-medium" for="restock-hijab-date">Tanggal masuk</label><Input id="restock-hijab-date" type="date" bind:value={rTanggalBeli} /></div><div><label class="mb-1.5 block text-sm font-medium" for="restock-hijab-supplier">Sumber</label><Input id="restock-hijab-supplier" bind:value={rSupplier} placeholder="Contoh: produksi batch / migrasi" /></div></div>
      <div><label class="mb-1.5 block text-sm font-medium" for="restock-hijab-note">Catatan</label><textarea id="restock-hijab-note" rows="2" bind:value={rCatatan} class="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Opsional"></textarea></div>
      <p class="rounded-md border border-dashed px-3 py-2.5 text-xs text-muted-foreground">Penambahan ini hanya menambah stok hijab. HPP otomatis mengikuti master model dan tidak membuat transaksi pembelian.</p>
    </div>
    <Dialog.Footer><Button variant="outline" onclick={() => (openRestock = false)}>Batal</Button><Button onclick={submitRestock} disabled={saving || Number(rJumlah) <= 0}>{saving ? "Menyimpan..." : "Restock Sekarang"}</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={openKurangi}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header><Dialog.Title>Kurangi Stok Hijab</Dialog.Title><Dialog.Description>Koreksi stok fisik atau catat hijab yang rusak/hilang.</Dialog.Description></Dialog.Header>
    <div class="space-y-4"><div class="rounded-md bg-muted/40 px-3 py-2 text-sm">{selectedStok?.nama_hijab} · tersedia <strong>{selectedStok?.stok_tersedia.toLocaleString("id-ID")} pcs</strong></div><div><label class="mb-1.5 block text-sm font-medium" for="reduce-hijab-qty">Jumlah</label><Input id="reduce-hijab-qty" type="number" min="1" max={selectedStok?.stok_tersedia ?? 0} bind:value={kJumlah} /></div><div><label class="mb-1.5 block text-sm font-medium" for="reduce-hijab-note">Alasan / catatan</label><textarea id="reduce-hijab-note" rows="3" bind:value={kCatatan} class="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Contoh: rusak, hilang, koreksi stok"></textarea></div></div>
    <Dialog.Footer><Button variant="outline" onclick={() => (openKurangi = false)}>Batal</Button><Button onclick={submitKurangi} disabled={saving || Number(kJumlah) <= 0 || Number(kJumlah) > (selectedStok?.stok_tersedia ?? 0)}>{saving ? "Menyimpan..." : "Kurangi Stok"}</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={openEdit}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header><Dialog.Title>Edit Stok Hijab</Dialog.Title><Dialog.Description>Jumlah stok tidak diedit di sini. Gunakan restock atau kurangi stok agar riwayat tetap tercatat.</Dialog.Description></Dialog.Header>
    <div class="space-y-4"><div><label class="mb-1.5 block text-sm font-medium" for="edit-hijab-model">Model Hijab</label><select id="edit-hijab-model" bind:value={eModelHijabId} onchange={(event) => { const model = modelHijabList.find((item) => item.id === (event.currentTarget as HTMLSelectElement).value); eWarnaId = ""; if (model) eNama = model.nama_hijab; }} class="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"><option value="">Tidak dikaitkan / data migrasi</option>{#each modelHijabList as model}<option value={model.id}>{model.nama_hijab}</option>{/each}</select></div>{#if eModelHijabId}<div><label class="mb-1.5 block text-sm font-medium" for="edit-hijab-color">Warna <span class="text-xs font-normal text-muted-foreground">(opsional)</span></label>{#if warnaList.length > 0}<select id="edit-hijab-color" bind:value={eWarnaId} class="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"><option value="">Tanpa warna / stok umum</option>{#each warnaUntukModel(modelHijabList.find((model) => model.id === eModelHijabId)) as warna}<option value={warna.id}>{warna.nama_warna}</option>{/each}</select>{:else}<p class="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Belum ada warna terdaftar.</p>{/if}</div><div class="rounded-md border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">HPP produksi otomatis: <strong class="text-foreground">{formatRupiah(hppModel(eModelHijabId))} / pcs</strong> dari Model Hijab.</div>{/if}{#if !eModelHijabId}<div><label class="mb-1.5 block text-sm font-medium" for="edit-hijab-name">Nama tampilan data lama</label><Input id="edit-hijab-name" bind:value={eNama} /></div>{/if}<div><label class="mb-1.5 block text-sm font-medium" for="edit-hijab-min">Batas minimum</label><Input id="edit-hijab-min" type="number" min="0" bind:value={eStokMinimum} /></div><div><label class="mb-1.5 block text-sm font-medium" for="edit-hijab-note">Catatan</label><textarea id="edit-hijab-note" rows="2" bind:value={eCatatan} class="w-full rounded-md border bg-background px-3 py-2 text-sm"></textarea></div></div>
    <Dialog.Footer>{#if konfirmasiHapus}<p class="mr-auto text-sm text-red-600">Hapus stok ini?</p><Button variant="outline" onclick={() => (konfirmasiHapus = false)} disabled={deleting}>Batal</Button><Button variant="destructive" onclick={submitHapus} disabled={deleting}>{deleting ? "Menghapus..." : "Ya, Hapus"}</Button>{:else}<Button variant="outline" class="mr-auto text-red-600" onclick={() => (konfirmasiHapus = true)} disabled={saving}><Trash2Icon class="h-4 w-4" />Hapus</Button><Button variant="outline" onclick={() => (openEdit = false)}>Batal</Button><Button onclick={submitEdit} disabled={saving || !eNama.trim()}>{saving ? "Menyimpan..." : "Simpan"}</Button>{/if}</Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={openRiwayat}>
  <Dialog.Content class="max-w-xl">
    <Dialog.Header><Dialog.Title>Riwayat Stok Hijab</Dialog.Title><Dialog.Description>{selectedStok?.nama_hijab} · halaman {riwayatPage}</Dialog.Description></Dialog.Header>
    {#if riwayatLoading}<div class="py-10 text-center text-sm text-muted-foreground">Memuat riwayat...</div>{:else if riwayatList.length === 0}<div class="py-10 text-center text-sm text-muted-foreground">Belum ada riwayat stok.</div>{:else}<div class="max-h-[55vh] space-y-2 overflow-y-auto">{#each riwayatList as item}<div class="flex items-start justify-between gap-3 rounded-md border px-3 py-2.5"><div class="min-w-0"><p class="text-sm font-medium text-foreground">{labelRiwayat(item.tipe)}</p>{#if item.catatan}<p class="mt-0.5 text-xs text-muted-foreground">{item.catatan}</p>{/if}<p class="mt-1 text-[11px] text-muted-foreground">{item.stok_sebelum.toLocaleString("id-ID")} → {item.stok_sesudah.toLocaleString("id-ID")} pcs · {formatTanggal(item.timestamp)}</p></div><span class={`shrink-0 text-sm font-semibold tabular-nums ${item.tipe === "barang_keluar" || item.tipe === "kurangi_manual" ? "text-red-600" : "text-green-600"}`}>{item.tipe === "barang_keluar" || item.tipe === "kurangi_manual" ? "−" : "+"}{item.jumlah.toLocaleString("id-ID")} pcs</span></div>{/each}</div>{/if}
    {#if !riwayatLoading && riwayatList.length > 0 && (riwayatPage > 1 || riwayatHasNext)}<div class="mt-4 flex items-center justify-end gap-2 border-t pt-3"><Button variant="outline" size="sm" disabled={riwayatPage <= 1 || riwayatPageLoading} onclick={previousRiwayatPage}>Sebelumnya</Button><span class="text-xs text-muted-foreground">Halaman {riwayatPage}</span><Button variant="outline" size="sm" disabled={!riwayatHasNext || riwayatPageLoading} onclick={nextRiwayatPage}>{riwayatPageLoading ? "Memuat..." : "Berikutnya"}</Button></div>{/if}
    <Dialog.Footer><Button variant="outline" onclick={() => (openRiwayat = false)}>Tutup</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
