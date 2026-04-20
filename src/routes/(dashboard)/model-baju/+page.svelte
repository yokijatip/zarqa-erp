<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import { onMount } from "svelte";
  import {
    addModelBaju,
    updateModelBaju,
    nonaktifkanModel,
    aktifkanModel,
    deleteModelBaju,
  } from "$lib/firebase/model-baju";
  import { modelBajuCache, stokKainCache, warnaCache } from "$lib/stores/data-cache.svelte";
  import { isAdmin } from "$lib/stores/auth.store";
  import { UKURAN_ORDER, type ModelBaju, type StokKain, type UkuranBaju, type Warna, type VarianWarna } from "$lib/types";
  import * as Dialog from "$lib/components/ui/dialog";
  import StatCard from "$lib/components/StatCard.svelte";
  import ShirtIcon from "@lucide/svelte/icons/shirt";
  import ArchiveIcon from "@lucide/svelte/icons/archive";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select/index.js";

  // ── State ──────────────────────────────────────────────────────────
  let modelList = $state<ModelBaju[]>([]);
  let stokKainList = $state<StokKain[]>([]);
  let warnaList = $state<Warna[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);
  let searchQuery = $state("");
  let tampilNonaktif = $state(false);
  let openForm = $state(false);
  let editingId = $state<string | null>(null);
  let konfirmasiId = $state<string | null>(null);
  let openHapus = $state(false);
  let selectedModelHapus = $state<ModelBaju | null>(null);

  type FormKain = {
    kain_id: string;
    nama_kain: string;
    satuan: 'yard' | 'kg';
    jumlah_per_ukuran: Partial<Record<UkuranBaju, number | "">>;
  };
  type FormVarian = {
    warna_id: string;
    nama_warna: string;
    kode_hex_warna: string;
    kainList: FormKain[];
  };

  // Form fields
  let fNama = $state("");
  let fDeskripsi = $state("");
  let fUkuran = $state<UkuranBaju[]>([]);
  let fVarianList = $state<FormVarian[]>([]);

  // ── Derived ────────────────────────────────────────────────────────
  let filteredList = $derived.by(() => {
    let list = tampilNonaktif ? modelList : modelList.filter((m) => m.aktif);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((m) => m.nama_model.toLowerCase().includes(q));
    }
    return list;
  });

  let totalAktif = $derived(modelList.filter((m) => m.aktif).length);
  let totalNonaktif = $derived(modelList.filter((m) => !m.aktif).length);
  let isEditing = $derived(editingId !== null);
  let formTitle = $derived(isEditing ? "Edit Model Baju" : "Tambah Model Baju");

  let canSubmit = $derived(
    fNama.trim() !== "" &&
    fUkuran.length > 0 &&
    fVarianList.every((v) =>
      v.warna_id !== "" &&
      v.kainList.every(
        (k) =>
          k.kain_id !== "" &&
          fUkuran.every((u) => Number(k.jumlah_per_ukuran[u] ?? 0) > 0),
      ),
    ),
  );

  // ── Helpers ────────────────────────────────────────────────────────
  function toggleUkuran(u: UkuranBaju) {
    if (fUkuran.includes(u)) {
      fUkuran = fUkuran.filter((x) => x !== u);
    } else {
      fUkuran = UKURAN_ORDER.filter((x) => [...fUkuran, u].includes(x));
    }
  }

  function getKainById(kainId: string): StokKain | null {
    return stokKainList.find((k) => k.id === kainId) ?? null;
  }

  function formatKainLabel(kain: Pick<StokKain, "nama_kain" | "nama_warna">): string {
    return kain.nama_warna ? `${kain.nama_kain} · ${kain.nama_warna}` : kain.nama_kain;
  }

  function availableKainForVarian(varianIdx: number, kainIdx: number): StokKain[] {
    const otherIds = fVarianList[varianIdx].kainList
      .filter((_, idx) => idx !== kainIdx && _.kain_id !== "")
      .map((k) => k.kain_id);
    return stokKainList.filter((k) => !otherIds.includes(k.id));
  }

  function tambahVarian() {
    fVarianList = [
      ...fVarianList,
      { warna_id: "", nama_warna: "", kode_hex_warna: "", kainList: [] },
    ];
  }

  function hapusVarian(vi: number) {
    fVarianList = fVarianList.filter((_, idx) => idx !== vi);
  }

  function onWarnaSelectVarian(vi: number, warnaId: string) {
    const w = warnaList.find((w) => w.id === warnaId);
    fVarianList[vi].warna_id = warnaId;
    fVarianList[vi].nama_warna = w?.nama_warna ?? "";
    fVarianList[vi].kode_hex_warna = w?.kode_hex ?? "";
  }

  function tambahKainVarian(vi: number) {
    fVarianList[vi].kainList = [
      ...fVarianList[vi].kainList,
      { kain_id: "", nama_kain: "", satuan: "yard", jumlah_per_ukuran: {} },
    ];
  }

  function hapusKainVarian(vi: number, ki: number) {
    fVarianList[vi].kainList = fVarianList[vi].kainList.filter((_, idx) => idx !== ki);
  }

  function onKainSelectVarian(vi: number, ki: number, kainId: string) {
    const kain = stokKainList.find((k) => k.id === kainId);
    fVarianList[vi].kainList[ki].kain_id = kainId;
    fVarianList[vi].kainList[ki].nama_kain = kain?.nama_kain ?? "";
    fVarianList[vi].kainList[ki].satuan = kain?.satuan ?? "yard";
  }

  function resetForm() {
    fNama = "";
    fDeskripsi = "";
    fUkuran = [];
    fVarianList = [];
    editingId = null;
  }

  function bukaAdd() {
    resetForm();
    openForm = true;
  }

  function bukaEdit(model: ModelBaju) {
    editingId = model.id;
    fNama = model.nama_model;
    fDeskripsi = model.deskripsi ?? "";
    fUkuran = [...model.ukuran_tersedia];
    fVarianList = (model.varian_warna ?? []).map((v) => ({
      warna_id: v.warna_id,
      nama_warna: v.nama_warna,
      kode_hex_warna: v.kode_hex_warna,
      kainList: v.kebutuhan_kain.map((k) => ({
        kain_id: k.kain_id,
        nama_kain: getKainById(k.kain_id)?.nama_kain ?? k.nama_kain,
        satuan: k.satuan ?? "yard",
        jumlah_per_ukuran: { ...k.jumlah_per_ukuran } as Partial<Record<UkuranBaju, number | "">>,
      })),
    }));
    openForm = true;
  }

  function bukaHapus(model: ModelBaju) {
    selectedModelHapus = model;
    openHapus = true;
  }

  function formatDate(ts: any): string {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function showSuccess(msg: string) {
    successMsg = msg;
    setTimeout(() => (successMsg = null), 3000);
  }

  function showError(msg: string) {
    errorMsg = msg;
    setTimeout(() => (errorMsg = null), 4000);
  }

  // ── Data ──────────────────────────────────────────────────────────
  async function load(force = false) {
    loading = true;
    try {
      const [models, stokKain, warna] = await Promise.all([
        modelBajuCache.get(force),
        stokKainCache.get(force),
        warnaCache.get(force),
      ]);
      modelList = models;
      stokKainList = stokKain;
      warnaList = warna;
    } catch {
      showError("Gagal memuat data. Periksa koneksi Firebase.");
    } finally {
      loading = false;
    }
  }

  // ── Actions ──────────────────────────────────────────────────────
  async function submitForm() {
    if (!canSubmit) return;
    saving = true;
    try {
      const input = {
        nama_model: fNama.trim(),
        ...(fDeskripsi.trim() ? { deskripsi: fDeskripsi.trim() } : {}),
        ukuran_tersedia: fUkuran,
        varian_warna: fVarianList.map((v) => ({
          warna_id: v.warna_id,
          nama_warna: v.nama_warna,
          kode_hex_warna: v.kode_hex_warna,
          kebutuhan_kain: v.kainList.map((k) => ({
            kain_id: k.kain_id,
            nama_kain: k.nama_kain,
            satuan: k.satuan,
            jumlah_per_ukuran: Object.fromEntries(
              fUkuran.map((u) => [u, Number(k.jumlah_per_ukuran[u] ?? 0)])
            ) as Partial<Record<UkuranBaju, number>>,
          })),
        })),
      };

      if (isEditing) {
        await updateModelBaju(editingId!, input);
        showSuccess(`Model "${fNama}" berhasil diperbarui.`);
      } else {
        await addModelBaju(input);
        showSuccess(`Model "${fNama}" berhasil ditambahkan.`);
      }

      await load(true);
      openForm = false;
      resetForm();
    } catch {
      showError(
        isEditing ? "Gagal memperbarui model." : "Gagal menambahkan model.",
      );
    } finally {
      saving = false;
    }
  }

  async function doNonaktifkan(id: string, nama: string) {
    try {
      await nonaktifkanModel(id);
      konfirmasiId = null;
      await load(true);
      showSuccess(`Model "${nama}" berhasil dinonaktifkan.`);
    } catch {
      showError("Gagal menonaktifkan model.");
    }
  }

  async function doAktifkan(id: string, nama: string) {
    try {
      await aktifkanModel(id);
      await load(true);
      showSuccess(`Model "${nama}" berhasil diaktifkan kembali.`);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Gagal mengaktifkan model.");
    }
  }

  async function submitHapus() {
    if (!selectedModelHapus) return;

    saving = true;
    try {
      await deleteModelBaju(selectedModelHapus.id);
      const nama = selectedModelHapus.nama_model;
      openHapus = false;
      selectedModelHapus = null;
      await load(true);
      showSuccess(`Model "${nama}" berhasil dihapus permanen.`);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Gagal menghapus model.");
    } finally {
      saving = false;
    }
  }

  onMount(() => { load(); });

  afterNavigate(({ from }) => {
    if (from?.url.pathname.startsWith("/model-baju/")) {
      modelBajuCache.invalidate();
    }
    load();
  });
</script>

<!-- ── Toast ─────────────────────────────────────────────────────── -->
{#if successMsg}
  <div
    class="fixed right-5 top-5 z-9999 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 shadow-lg"
  >
    <svg
      class="h-4 w-4 shrink-0 text-green-600"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m4.5 12.75 6 6 9-13.5"
      />
    </svg>
    <p class="text-sm text-green-800">{successMsg}</p>
  </div>
{/if}
{#if errorMsg}
  <div
    class="fixed right-5 top-5 z-9999 flex max-w-sm items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg"
  >
    <svg
      class="mt-0.5 h-4 w-4 shrink-0 text-red-500"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
      />
    </svg>
    <p class="text-sm text-red-800">{errorMsg}</p>
  </div>
{/if}

<!-- ── Header ─────────────────────────────────────────────────────── -->
<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Model Baju</h1>
    <p class="mt-0.5 text-sm text-gray-500">
      Kelola katalog model dan kebutuhan kain produksi
    </p>
  </div>
  {#if $isAdmin}
    <Button onclick={bukaAdd}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2.5"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 4.5v15m7.5-7.5h-15"
        />
      </svg>
      Tambah Model
    </Button>
  {/if}
</div>

<!-- ── Stats ──────────────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-2 gap-4">
  {#if loading}
    <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div class="mt-1.5 h-7 w-10 animate-pulse rounded bg-gray-100"></div>
    </div>
    <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div class="mt-1.5 h-7 w-10 animate-pulse rounded bg-gray-100"></div>
    </div>
  {:else}
    <StatCard
      title="Model Aktif"
      value={totalAktif}
      icon={ShirtIcon}
      footerSubtext="model siap diorder"
    />
    <StatCard
      title="Nonaktif"
      value={totalNonaktif}
      icon={ArchiveIcon}
      footerSubtext="model diarsipkan"
    />
  {/if}
</div>

<!-- ── Filter Bar ─────────────────────────────────────────────────── -->
<div class="mb-4 flex flex-wrap items-center gap-3">
  <!-- Search -->
  <div class="relative min-w-48 flex-1">
    <svg
      class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
      />
    </svg>
    <input
      type="text"
      placeholder="Cari nama model..."
      bind:value={searchQuery}
      class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
    />
  </div>

  <!-- Toggle nonaktif -->
  <button
    onclick={() => (tampilNonaktif = !tampilNonaktif)}
    class="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition
      {tampilNonaktif
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}"
  >
    <svg
      class="h-3.5 w-3.5"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
    {tampilNonaktif ? "Sembunyikan Nonaktif" : "Tampilkan Nonaktif"}
  </button>

  <!-- Refresh -->
  <Button variant="outline" size="sm" onclick={() => load(true)} class="ml-auto">
    <svg
      class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
    Refresh
  </Button>
</div>

<!-- ── Content ────────────────────────────────────────────────────── -->
{#if loading}
  <!-- Skeleton grid -->
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
    {#each Array(6) as _}
      <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div class="mb-3 flex items-start justify-between">
          <div class="h-5 w-40 animate-pulse rounded bg-gray-100"></div>
          <div class="h-5 w-12 animate-pulse rounded-full bg-gray-100"></div>
        </div>
        <div class="mb-3 h-3 w-full animate-pulse rounded bg-gray-100"></div>
        <div class="mb-3 flex gap-1.5">
          {#each Array(3) as _}
            <div class="h-6 w-8 animate-pulse rounded-full bg-gray-100"></div>
          {/each}
        </div>
        <div class="space-y-1.5">
          {#each Array(2) as _}
            <div class="h-3 w-3/4 animate-pulse rounded bg-gray-100"></div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{:else if filteredList.length === 0}
  <!-- Empty state -->
  <div
    class="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-100 bg-white py-16 shadow-sm"
  >
    <div
      class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100"
    >
      <svg
        class="h-7 w-7 text-gray-300"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z"
        />
      </svg>
    </div>
    {#if searchQuery}
      <p class="text-sm font-medium text-gray-500">
        Model "{searchQuery}" tidak ditemukan
      </p>
      <Button variant="link" size="sm" onclick={() => (searchQuery = "")}>
        Hapus pencarian
      </Button>
    {:else}
      <p class="text-sm font-medium text-gray-500">Belum ada model baju</p>
      <p class="text-xs text-gray-400">
        Mulai dengan menambahkan model baju pertama
      </p>
      {#if $isAdmin}
        <Button onclick={bukaAdd} class="mt-1">+ Tambah Model</Button>
      {/if}
    {/if}
  </div>
{:else}
  <!-- Model card grid -->
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
    {#each filteredList as model}
      {@const nonaktif = !model.aktif}

      <div
        class="flex flex-col overflow-hidden rounded-xl border {nonaktif
          ? 'border-gray-200 opacity-70'
          : 'border-gray-100'} bg-white shadow-sm transition hover:shadow-md"
      >
        <!-- Card Header -->
        <div
          class="flex items-start justify-between border-b border-gray-100 px-5 py-4"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-gray-900">
              {model.nama_model}
            </p>
            {#if model.varian_warna?.length > 0}
              <div class="mt-0.5 flex flex-wrap items-center gap-1">
                {#each model.varian_warna as v, vi}
                  <span class="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
                    <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-gray-300" style="background-color: {v.kode_hex_warna}"></span>
                    {v.nama_warna}
                  </span>
                  {#if vi < model.varian_warna.length - 1}
                    <span class="text-gray-300 text-[10px]">·</span>
                  {/if}
                {/each}
              </div>
            {/if}
            {#if model.deskripsi}
              <p class="mt-0.5 line-clamp-1 text-xs text-gray-400">
                {model.deskripsi}
              </p>
            {/if}
          </div>
          <span
            class="ml-2 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium
            {nonaktif
              ? 'bg-gray-100 text-gray-500'
              : 'bg-blue-100 text-blue-700'}"
          >
            {nonaktif ? "Nonaktif" : "Aktif"}
          </span>
        </div>

        <!-- Card Body -->
        <div class="flex-1 space-y-4 px-5 py-4">
          <!-- Ukuran -->
          <div>
            <p
              class="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400"
            >
              Ukuran Tersedia
            </p>
            <div class="flex flex-wrap gap-1.5">
              {#each UKURAN_ORDER as u}
                <span
                  class="rounded-full px-2.5 py-0.5 text-xs font-semibold
                  {model.ukuran_tersedia.includes(u)
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-300'}"
                >
                  {u}
                </span>
              {/each}
            </div>
          </div>

          <!-- Kebutuhan Kain per Varian -->
          <div>
            <p class="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Kebutuhan Kain
            </p>
            {#if model.varian_warna?.length > 0}
              <div class="space-y-2">
                {#each model.varian_warna as v}
                  <div class="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-2 text-xs">
                    <!-- Label varian -->
                    <div class="mb-1.5 flex items-center gap-1.5">
                      <span class="inline-block h-2 w-2 shrink-0 rounded-full border border-gray-300" style="background-color: {v.kode_hex_warna}"></span>
                      <span class="font-semibold text-gray-600">{v.nama_warna}</span>
                    </div>
                    {#if v.kebutuhan_kain.length > 0}
                      <div class="space-y-1">
                        {#each v.kebutuhan_kain as kain}
                          {@const ukuranAda = UKURAN_ORDER.filter((u) => (kain.jumlah_per_ukuran ?? {})[u])}
                          {@const kainStok = getKainById(kain.kain_id)}
                          <div>
                            <div class="flex items-center justify-between">
                              <div class="flex items-center gap-1">
                                <span class="h-1 w-1 shrink-0 rounded-full bg-amber-400"></span>
                                <span class="font-medium text-gray-700">{kainStok ? formatKainLabel(kainStok) : kain.nama_kain}</span>
                              </div>
                              <span class="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{kain.satuan}</span>
                            </div>
                            {#if ukuranAda.length > 0}
                              <div class="mt-0.5 grid text-center" style="grid-template-columns: repeat({ukuranAda.length}, 1fr)">
                                {#each ukuranAda as u}
                                  <span class="text-[10px] font-semibold text-gray-400">{u}</span>
                                {/each}
                                {#each ukuranAda as u}
                                  <span class="font-bold text-gray-700">{(kain.jumlah_per_ukuran ?? {})[u]}</span>
                                {/each}
                              </div>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {:else}
                      <p class="text-[11px] italic text-gray-300">Belum ada kain</p>
                    {/if}
                  </div>
                {/each}
              </div>
            {:else}
              <p class="text-xs italic text-gray-300">Belum ada varian warna</p>
            {/if}
          </div>
        </div>

        <!-- Card Footer -->
        <div class="border-t border-gray-100 px-5 py-3">
          <p class="mb-2.5 text-[10px] text-gray-300">
            Dibuat {formatDate(model.createdAt)}
            {#if model.updatedAt}
              · Diupdate {formatDate(model.updatedAt)}{/if}
          </p>

          {#if konfirmasiId === model.id}
            <!-- Konfirmasi nonaktifkan -->
            <div class="rounded-lg border border-red-200 bg-red-50 p-3">
              <p class="mb-2 text-xs font-medium text-red-700">
                Nonaktifkan model ini?
              </p>
              <p class="mb-3 text-[11px] text-red-600">
                Model tidak akan muncul di daftar order produksi.
              </p>
              <div class="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  class="flex-1"
                  onclick={() => (konfirmasiId = null)}
                >
                  Batal
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  class="flex-1"
                  onclick={() => doNonaktifkan(model.id, model.nama_model)}
                >
                  Ya, Nonaktifkan
                </Button>
              </div>
            </div>
          {:else if $isAdmin}
            <div class="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                class="flex-1"
                onclick={() => bukaEdit(model)}
              >
                <svg
                  class="h-3.5 w-3.5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="2"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
                  />
                </svg>
                Edit
              </Button>
              {#if nonaktif}
                <Button
                  variant="outline"
                  size="sm"
                  class="flex-1 border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800"
                  onclick={() => doAktifkan(model.id, model.nama_model)}
                >
                  <svg
                    class="h-3.5 w-3.5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="m4.5 12.75 6 6 9-13.5"
                    />
                  </svg>
                  Aktifkan
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="flex-1 border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                  onclick={() => bukaHapus(model)}
                >
                  <svg
                    class="h-3.5 w-3.5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                    />
                  </svg>
                  Hapus
                </Button>
              {:else}
                <Button
                  variant="outline"
                  size="sm"
                  class="flex-1 border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                  onclick={() => (konfirmasiId = model.id)}
                >
                  <svg
                    class="h-3.5 w-3.5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                    />
                  </svg>
                  Nonaktifkan
                </Button>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Footer count -->
  <p class="mt-4 text-center text-xs text-gray-400">
    Menampilkan {filteredList.length} dari {tampilNonaktif
      ? modelList.length
      : totalAktif} model
  </p>
{/if}

<!-- ── Sheet: Tambah / Edit Model ─────────────────────────────────── -->
<Dialog.Root
  bind:open={openForm}
  onOpenChange={(o) => {
    if (!o) resetForm();
  }}
>
  <Dialog.Content class="flex max-h-[90vh] max-w-lg flex-col gap-0 p-0">
    <Dialog.Header class="shrink-0 px-6 pt-6 pb-2">
      <Dialog.Title>{formTitle}</Dialog.Title>
      <Dialog.Description>
        {isEditing
          ? "Perbarui informasi model baju."
          : "Tambah model baju baru ke katalog produksi."}
      </Dialog.Description>
    </Dialog.Header>

    <!-- Scrollable body -->
    <div class="flex-1 overflow-y-auto px-6 py-5">
      <div class="space-y-5">
        <!-- Nama Model -->
        <div>
          <label
            class="mb-1.5 block text-sm font-medium text-gray-700"
            for="nama-model"
          >
            Nama Model <span class="text-red-500">*</span>
          </label>
          <Input
            id="nama-model"
            type="text"
            placeholder="Contoh: Gamis Syar'i Polos, Tunik Batik..."
            bind:value={fNama}
          />
        </div>

        <!-- Deskripsi -->
        <div>
          <label
            class="mb-1.5 block text-sm font-medium text-gray-700"
            for="deskripsi-model"
          >
            Deskripsi <span class="text-xs font-normal text-gray-400"
              >(opsional)</span
            >
          </label>
          <textarea
            id="deskripsi-model"
            rows="2"
            placeholder="Deskripsi singkat model..."
            bind:value={fDeskripsi}
            class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray.400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          ></textarea>
        </div>

        <!-- Ukuran Tersedia -->
        <div>
          <p class="mb-2 text-sm font-medium text-gray-700">
            Ukuran Tersedia <span class="text-red-500">*</span>
          </p>
          <div class="flex gap-2">
            {#each UKURAN_ORDER as u}
              <button
                type="button"
                onclick={() => toggleUkuran(u)}
                class="flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold transition
                  {fUkuran.includes(u)
                  ? 'border-blue-500 bg-blue-500 text-white'
                  : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'}"
              >
                {u}
              </button>
            {/each}
          </div>
          {#if fUkuran.length === 0}
            <p class="mt-1.5 text-xs text-red-500">Pilih minimal satu ukuran</p>
          {:else}
            <p class="mt-1.5 text-xs text-gray-400">
              Dipilih: <span class="font-medium text-gray-700">{fUkuran.join(", ")}</span>
            </p>
          {/if}
        </div>

        <!-- Varian Warna -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <p class="text-sm font-medium text-gray-700">
              Varian Warna
              <span class="text-xs font-normal text-gray-400">(opsional)</span>
            </p>
            <Button
              variant="outline"
              size="sm"
              onclick={tambahVarian}
              disabled={warnaList.length === 0 || fUkuran.length === 0}
              class="border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700"
            >
              <svg class="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Tambah Varian
            </Button>
          </div>

          {#if warnaList.length === 0}
            <div class="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
              <p class="text-xs text-amber-700">Belum ada warna terdaftar.</p>
              <a href="/warna" class="text-xs font-medium text-amber-600 hover:underline">Tambah warna di sini →</a>
            </div>
          {:else if fVarianList.length === 0}
            <div class="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-5 text-center">
              <p class="text-xs text-gray-400">Belum ada varian warna</p>
              <button type="button" onclick={tambahVarian} disabled={fUkuran.length === 0} class="mt-1 text-xs font-medium text-blue-500 hover:underline disabled:text-gray-300">
                + Tambah varian pertama
              </button>
            </div>
          {:else}
            <div class="space-y-3">
              {#each fVarianList as varian, vi}
                <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <!-- Header varian -->
                  <div class="mb-2.5 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      {#if varian.kode_hex_warna}
                        <span class="inline-block h-3 w-3 shrink-0 rounded-full border border-gray-300" style="background-color: {varian.kode_hex_warna}"></span>
                      {/if}
                      <p class="text-xs font-semibold text-gray-600">
                        Varian {vi + 1}{varian.nama_warna ? ` — ${varian.nama_warna}` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon-sm" onclick={() => hapusVarian(vi)} class="text-gray-400 hover:text-red-500" aria-label="Hapus varian">
                      <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </Button>
                  </div>

                  <!-- Pilih Warna -->
                  <div class="mb-3">
                    <p class="mb-1 text-[11px] font-semibold text-gray-500">Warna <span class="text-red-400">*</span></p>
                    <Select.Root
                      type="single"
                      value={varian.warna_id || undefined}
                      onValueChange={(val) => onWarnaSelectVarian(vi, val ?? "")}
                    >
                      <Select.Trigger class="w-full">
                        {#if varian.warna_id}
                          <span class="flex items-center gap-2">
                            <span class="inline-block h-3 w-3 shrink-0 rounded-full border border-gray-200" style="background-color: {varian.kode_hex_warna}"></span>
                            {varian.nama_warna}
                          </span>
                        {:else}
                          <span class="text-muted-foreground">— Pilih warna —</span>
                        {/if}
                      </Select.Trigger>
                      <Select.Content preventScroll={false}>
                        {#each warnaList as w}
                          <Select.Item value={w.id}>
                            <span class="flex items-center gap-2">
                              <span class="inline-block h-3 w-3 shrink-0 rounded-full border border-gray-200" style="background-color: {w.kode_hex}"></span>
                              {w.nama_warna}
                            </span>
                          </Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  </div>

                  <!-- Kebutuhan Kain untuk varian ini -->
                  <div>
                    <div class="mb-1.5 flex items-center justify-between">
                      <p class="text-[11px] font-semibold text-gray-500">Kebutuhan Kain</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() => tambahKainVarian(vi)}
                        disabled={stokKainList.length === 0 || varian.kainList.length >= stokKainList.length}
                        class="h-6 px-2 text-[11px] text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                      >
                        + Tambah Kain
                      </Button>
                    </div>

                    {#if varian.kainList.length === 0}
                      <p class="text-[11px] italic text-gray-300">Belum ada kain — opsional</p>
                    {:else}
                      <div class="space-y-2">
                        {#each varian.kainList as entry, ki}
                          <div class="rounded border border-gray-200 bg-white p-2">
                            <div class="mb-1.5 flex items-center justify-between">
                              <p class="text-[10px] font-semibold text-gray-400">Kain #{ki + 1}</p>
                              <button onclick={() => hapusKainVarian(vi, ki)} class="text-gray-300 hover:text-red-400">
                                <svg class="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            <Select.Root
                              type="single"
                              value={entry.kain_id || undefined}
                              onValueChange={(val) => onKainSelectVarian(vi, ki, val ?? "")}
                            >
                              <Select.Trigger class="w-full">
                                <span class={entry.kain_id ? "text-foreground" : "text-muted-foreground"}>
                                  {entry.kain_id ? formatKainLabel({ nama_kain: entry.nama_kain, nama_warna: getKainById(entry.kain_id)?.nama_warna }) : "— Pilih kain —"}
                                </span>
                              </Select.Trigger>
                              <Select.Content preventScroll={false}>
                                {#each availableKainForVarian(vi, ki) as kain}
                                  <Select.Item value={kain.id}>{formatKainLabel(kain)}</Select.Item>
                                {/each}
                                {#if entry.kain_id && !availableKainForVarian(vi, ki).find((k) => k.id === entry.kain_id)}
                                  <Select.Item value={entry.kain_id}>{entry.nama_kain}</Select.Item>
                                {/if}
                              </Select.Content>
                            </Select.Root>
                            {#if fUkuran.length > 0 && entry.kain_id}
                              <div class="mt-1.5 grid gap-1" style="grid-template-columns: repeat({fUkuran.length}, 1fr)">
                                {#each fUkuran as u}
                                  <div class="text-center">
                                    <p class="mb-0.5 text-[9px] font-semibold text-gray-400">{u}</p>
                                    <Input
                                      type="number"
                                      min="0.1"
                                      step="0.1"
                                      placeholder="0"
                                      bind:value={fVarianList[vi].kainList[ki].jumlah_per_ukuran[u]}
                                      class="h-7 px-1 text-center text-xs"
                                    />
                                  </div>
                                {/each}
                              </div>
                              <p class="mt-0.5 text-[10px] text-gray-400">{entry.satuan}/pcs per ukuran</p>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>

                  <!-- Preview ringkas kebutuhan kain varian ini -->
                  {#if varian.kainList.some((k) => k.kain_id && fUkuran.some((u) => Number(k.jumlah_per_ukuran[u] ?? 0) > 0))}
                    <div class="mt-2.5 rounded-lg border border-blue-100 bg-blue-50 p-2.5">
                      <p class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-blue-500">Ringkasan</p>
                      <div class="mb-0.5 grid text-[10px] font-semibold text-blue-400" style="grid-template-columns: 1fr {fUkuran.map(() => '2rem').join(' ')} 1.5rem">
                        <span>Kain</span>
                        {#each fUkuran as u}<span class="text-right">{u}</span>{/each}
                        <span class="text-right">Sat</span>
                      </div>
                      {#each varian.kainList.filter((k) => k.kain_id) as k}
                        <div class="grid text-[11px]" style="grid-template-columns: 1fr {fUkuran.map(() => '2rem').join(' ')} 1.5rem">
                          <span class="truncate text-blue-700">{k.nama_kain}</span>
                          {#each fUkuran as u}
                            <span class="text-right font-semibold text-blue-800">
                              {Number(k.jumlah_per_ukuran[u] ?? 0) > 0 ? k.jumlah_per_ukuran[u] : "—"}
                            </span>
                          {/each}
                          <span class="text-right text-blue-400">{k.satuan}</span>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Footer -->
    <Dialog.Footer class="shrink-0 gap-2 border-t border-gray-100 px-6 py-4">
      <Button
        variant="outline"
        onclick={() => {
          resetForm();
          openForm = false;
        }}
        class="">Batal</Button
      >
      <Button
        onclick={submitForm}
        disabled={saving || !canSubmit}
        class="flex-1"
      >
        {#if saving}
          {isEditing ? "Menyimpan..." : "Menambahkan..."}
        {:else}
          {isEditing ? "Simpan Perubahan" : "Tambah Model"}
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root
  bind:open={openHapus}
  onOpenChange={(o) => {
    if (!o) selectedModelHapus = null;
  }}
>
  <Dialog.Content class="max-w-sm">
    <Dialog.Header>
      <Dialog.Title>Hapus Model Baju</Dialog.Title>
      <Dialog.Description>
        Tindakan ini menghapus model secara permanen dan tidak dapat dibatalkan.
      </Dialog.Description>
    </Dialog.Header>

    {#if selectedModelHapus}
      <div class="space-y-3">
        <div class="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <p class="text-sm font-semibold text-gray-800">{selectedModelHapus.nama_model}</p>
          <p class="mt-1 text-xs text-gray-500">
            Hanya model yang sudah nonaktif dan tidak dipakai data operasional yang bisa dihapus.
          </p>
        </div>
        <p class="text-sm text-gray-500">
          Jika model ini masih dipakai oleh batch produksi, stok potongan, atau stok barang jadi, proses hapus akan ditolak.
        </p>
      </div>
    {/if}

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openHapus = false)}>Batal</Button>
      <Button variant="destructive" onclick={submitHapus} disabled={saving}>
        {saving ? "Menghapus..." : "Ya, Hapus Permanen"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
