<script lang="ts">
  import { goto, afterNavigate } from "$app/navigation";
  import { onMount } from "svelte";
  import { tambahStokBarangJadi, getStokBarangJadiPage } from "$lib/firebase/barang-jadi";
  import type { FirestoreCursor } from "$lib/firebase/pagination";
  import { barangJadiCache, modelBajuCache } from "$lib/stores/data-cache.svelte";
  import { currentUser } from "$lib/stores/auth.store";
  import { UKURAN_ORDER, type StokBarangJadi, type UkuranBaju, type ModelBaju } from "$lib/types";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select/index.js";
  import StatCard from "$lib/components/StatCard.svelte";
  import ShirtIcon from "@lucide/svelte/icons/shirt";
  import PackageIcon from "@lucide/svelte/icons/package";
  import PackageCheckIcon from "@lucide/svelte/icons/package-check";
  import AlertTriangleIcon from "@lucide/svelte/icons/triangle-alert";

  // Threshold stok kritis per ukuran
  const KRITIS_THRESHOLD = 5;
  const LOW_THRESHOLD = 15;

  // ── State ──────────────────────────────────────────────────────────
  let stokList = $state<StokBarangJadi[]>([]);
  let loading = $state(true);
  let errorMsg = $state<string | null>(null);
  let searchQuery = $state("");
  let sortBy = $state<"kritis" | "terbanyak" | "nama" | "keluar">("kritis");
  let filterStatus = $state<"semua" | "kritis" | "low" | "kosong">("semua");
  let lastLoaded = $state<Date | null>(null);
  const PAGE_SIZE = 25;
  let currentPage = $state(1);
  let pageCursors = $state<FirestoreCursor[]>([null]);
  let pageHasNext = $state<boolean[]>([]);
  let pageCache = $state<StokBarangJadi[][]>([]);
  let pageLoading = $state(false);

  // Collapse state: set of expanded model names
  let expandedModels = $state<Set<string>>(new Set());
  // Collapse state: set of "modelId|warna" keys for color-level collapse
  let expandedColors = $state<Set<string>>(new Set());

  // Tambah Stok Awal (migrasi)
  let openTambah = $state(false);
  let modelList = $state<ModelBaju[]>([]);
  let loadingModels = $state(false);
  let savingTambah = $state(false);
  let fModelId = $state("");
  let fWarnaId = $state("");
  let fWarnaIds = $state<string[]>([]);
  let fJumlahPerUkuran = $state<Record<string, number>>({});
  let fJumlahPerWarna = $state<Record<string, Record<string, number>>>({});

  let selectedModel = $derived(modelList.find((m) => m.id === fModelId) ?? null);
  let selectedWarna = $derived(
    (selectedModel?.warna_tersedia ?? []).find((w) => w.warna_id === fWarnaId) ?? null,
  );
  let selectedWarnaList = $derived(
    (selectedModel?.warna_tersedia ?? []).filter((w) => fWarnaIds.includes(w.warna_id)),
  );
  let modelHasWarna = $derived((selectedModel?.warna_tersedia ?? []).length > 0);
  let totalInputTambah = $derived(
    modelHasWarna
      ? Object.values(fJumlahPerWarna).reduce(
          (sum, perUkuran) => sum + Object.values(perUkuran).reduce((s, v) => s + (v ?? 0), 0),
          0,
        )
      : Object.values(fJumlahPerUkuran).reduce((s, v) => s + (v ?? 0), 0),
  );

  function successMsg2(msg: string) {
    // reuse errorMsg slot for success — dedicated simple approach
    successToast = msg;
    setTimeout(() => (successToast = null), 3500);
  }
  let successToast = $state<string | null>(null);

  // ── Derived ────────────────────────────────────────────────────────
  type ColorGroup = {
    nama_warna?: string;
    kode_hex_warna?: string;
    items: StokBarangJadi[];
  };
  type ModelGroup = {
    model_id: string;
    nama_model: string;
    colors: Map<string, ColorGroup>;
  };

  let grouped = $derived.by((): ModelGroup[] => {
    const modelMap = new Map<string, ModelGroup>();
    for (const item of stokList) {
      if (!modelMap.has(item.model_id)) {
        modelMap.set(item.model_id, {
          model_id: item.model_id,
          nama_model: item.nama_model,
          colors: new Map(),
        });
      }
      const model = modelMap.get(item.model_id)!;
      const colorKey = item.nama_warna ?? '';
      if (!model.colors.has(colorKey)) {
        model.colors.set(colorKey, {
          nama_warna: item.nama_warna,
          kode_hex_warna: item.kode_hex_warna,
          items: [],
        });
      }
      model.colors.get(colorKey)!.items.push(item);
    }

    // Ukuran dengan stok 0 tetap ditampilkan berdasarkan master model.
    // Ini penting agar model/warna bisa ditemukan lewat filter "Habis".
    for (const master of modelList) {
      if (!modelMap.has(master.id)) {
        modelMap.set(master.id, {
          model_id: master.id,
          nama_model: master.nama_model,
          colors: new Map(),
        });
      }
      const model = modelMap.get(master.id)!;
      const masterColors = master.warna_tersedia?.length
        ? master.warna_tersedia
        : [{ nama_warna: undefined, kode_hex: undefined, warna_id: '' }];

      for (const color of masterColors) {
        const colorKey = color.nama_warna ?? '';
        if (!model.colors.has(colorKey)) {
          model.colors.set(colorKey, {
            nama_warna: color.nama_warna,
            kode_hex_warna: color.kode_hex,
            items: [],
          });
        }
        const colorGroup = model.colors.get(colorKey)!;
        for (const ukuran of master.ukuran_tersedia) {
          if (!colorGroup.items.some((item) => item.ukuran === ukuran)) {
            colorGroup.items.push({
              id: `${master.id}__${ukuran}__${colorKey || 'tanpa-warna'}__zero`,
              model_id: master.id,
              nama_model: master.nama_model,
              ...(color.nama_warna ? { nama_warna: color.nama_warna } : {}),
              ...(color.kode_hex ? { kode_hex_warna: color.kode_hex } : {}),
              ukuran,
              stok_tersedia: 0,
              total_masuk: 0,
              total_keluar: 0,
            });
          }
        }
      }
    }

    for (const model of modelMap.values()) {
      for (const color of model.colors.values()) {
        color.items.sort(
          (a, b) => UKURAN_ORDER.indexOf(a.ukuran) - UKURAN_ORDER.indexOf(b.ukuran),
        );
      }
    }
    return [...modelMap.values()];
  });

  function getColorTotal(color: ColorGroup) {
    return color.items.reduce((s, i) => s + i.stok_tersedia, 0);
  }

  function getModelTotal(model: ModelGroup) {
    let total = 0;
    for (const color of model.colors.values()) {
      total += getColorTotal(color);
    }
    return total;
  }

  function getModelStatus(model: ModelGroup): "kosong" | "kritis" | "low" | "aman" {
    const total = getModelTotal(model);
    const hasEmptySize = [...model.colors.values()].some((color) =>
      color.items.some((item) => item.stok_tersedia === 0),
    );
    if (total === 0 || hasEmptySize) return "kosong";
    const hasKritis = [...model.colors.values()].some((c) =>
      c.items.some((i) => i.stok_tersedia > 0 && i.stok_tersedia <= KRITIS_THRESHOLD),
    );
    if (hasKritis) return "kritis";
    const hasLow = [...model.colors.values()].some((c) =>
      c.items.some((i) => i.stok_tersedia > 0 && i.stok_tersedia <= LOW_THRESHOLD),
    );
    if (hasLow) return "low";
    return "aman";
  }

  function getColorStatus(color: ColorGroup): "kosong" | "kritis" | "low" | "aman" {
    const total = getColorTotal(color);
    if (total === 0 || color.items.some((item) => item.stok_tersedia === 0)) return "kosong";
    const hasKritis = color.items.some(
      (i) => i.stok_tersedia > 0 && i.stok_tersedia <= KRITIS_THRESHOLD,
    );
    if (hasKritis) return "kritis";
    const hasLow = color.items.some(
      (i) => i.stok_tersedia > 0 && i.stok_tersedia <= LOW_THRESHOLD,
    );
    if (hasLow) return "low";
    return "aman";
  }

  function toggleModel(modelId: string) {
    const next = new Set(expandedModels);
    if (next.has(modelId)) {
      next.delete(modelId);
    } else {
      next.add(modelId);
    }
    expandedModels = next;
  }

  function colorKey(modelId: string, warna: string) {
    return `${modelId}|${warna}`;
  }

  function toggleColor(modelId: string, warna: string) {
    const key = colorKey(modelId, warna);
    const next = new Set(expandedColors);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    expandedColors = next;
  }

  let filteredGrouped = $derived.by(() => {
    let list = grouped;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((m) => m.nama_model.toLowerCase().includes(q));
    }

    if (filterStatus !== "semua") {
      list = list.filter((m) => getModelStatus(m) === filterStatus);
    }

    const sorted = [...list];
    if (sortBy === "kritis") {
      const order = { kosong: 0, kritis: 1, low: 2, aman: 3 };
      sorted.sort(
        (a, b) => order[getModelStatus(a)] - order[getModelStatus(b)],
      );
    } else if (sortBy === "terbanyak") {
      sorted.sort((a, b) => getModelTotal(b) - getModelTotal(a));
    } else if (sortBy === "nama") {
      sorted.sort((a, b) => a.nama_model.localeCompare(b.nama_model));
    } else if (sortBy === "keluar") {
      sorted.sort(
        (a, b) =>
          [...b.colors.values()].reduce((s, c) => s + c.items.reduce((si, i) => si + i.total_keluar, 0), 0) -
          [...a.colors.values()].reduce((s, c) => s + c.items.reduce((si, i) => si + i.total_keluar, 0), 0),
      );
    }
    return sorted;
  });

  let totalModel = $derived(grouped.length);
  let totalTersedia = $derived(
    stokList.reduce((s, i) => s + i.stok_tersedia, 0),
  );
  let modelKosong = $derived(
    grouped.filter((m) => getModelStatus(m) === "kosong").length,
  );
  let modelKritis = $derived(
    grouped.filter((m) => getModelStatus(m) === "kritis").length,
  );
  let ukuranKritis = $derived(
    stokList.filter((i) => i.stok_tersedia > 0 && i.stok_tersedia <= KRITIS_THRESHOLD).length,
  );
  let ukuranMenipis = $derived(
    stokList.filter((i) => i.stok_tersedia > KRITIS_THRESHOLD && i.stok_tersedia <= LOW_THRESHOLD).length,
  );

  // ── Helpers ────────────────────────────────────────────────────────
  function getUkuranStatus(
    item: StokBarangJadi,
  ): "kosong" | "kritis" | "low" | "aman" {
    if (item.stok_tersedia === 0) return "kosong";
    if (item.stok_tersedia <= KRITIS_THRESHOLD) return "kritis";
    if (item.stok_tersedia <= LOW_THRESHOLD) return "low";
    return "aman";
  }

  const STATUS_STYLE = {
    kosong: {
      badge: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-slate-300",
      label: "Habis",
      num: "text-gray-400 dark:text-slate-400",
      bar: "bg-gray-300",
      ukuran: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-slate-300",
    },
    kritis: {
      badge: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
      label: "Kritis",
      num: "text-red-600 dark:text-red-300",
      bar: "bg-red-400",
      ukuran: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-slate-200",
    },
    low: {
      badge: "bg-amber-100 text-amber-600 dark:bg-amber-400/15 dark:text-amber-200",
      label: "Menipis",
      num: "text-amber-600 dark:text-amber-200",
      bar: "bg-amber-400",
      ukuran: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-slate-200",
    },
    aman: {
      badge: "bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-200",
      label: "Aman",
      num: "text-gray-900 dark:text-slate-50",
      bar: "bg-teal-400",
      ukuran: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-slate-200",
    },
  };

  function formatDate(ts: any): string {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function showError(msg: string) {
    errorMsg = msg;
    setTimeout(() => (errorMsg = null), 4000);
  }

  // ── Data ──────────────────────────────────────────────────────────
  async function load(force = false) {
    loading = true;
    errorMsg = null;
    try {
      const [firstPage, models] = await Promise.all([
        getStokBarangJadiPage(null, PAGE_SIZE),
        modelBajuCache.get(force),
      ]);
      stokList = firstPage.items;
      pageCache = [firstPage.items];
      pageCursors = [null, firstPage.cursor];
      pageHasNext = [firstPage.hasNext];
      currentPage = 1;
      modelList = models.filter((model) => model.aktif);
      lastLoaded = new Date();
    } catch {
      showError("Gagal memuat data. Periksa koneksi Firebase.");
    } finally {
      loading = false;
    }
  }

  async function nextPage() {
    if (pageLoading || !pageHasNext[currentPage - 1]) return;
    pageLoading = true;
    try {
      const result = await getStokBarangJadiPage(pageCursors[currentPage] ?? null, PAGE_SIZE);
      pageCache[currentPage] = result.items;
      pageCursors[currentPage + 1] = result.cursor;
      pageHasNext[currentPage] = result.hasNext;
      pageCache = [...pageCache];
      pageCursors = [...pageCursors];
      pageHasNext = [...pageHasNext];
      currentPage += 1;
      stokList = result.items;
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal memuat halaman stok berikutnya.");
    } finally {
      pageLoading = false;
    }
  }

  function previousPage() {
    if (currentPage <= 1 || pageLoading) return;
    currentPage -= 1;
    stokList = pageCache[currentPage - 1] ?? stokList;
  }

  async function bukaTambah() {
    openTambah = true;
    fModelId = "";
    fWarnaId = "";
    fWarnaIds = [];
    fJumlahPerUkuran = {};
    fJumlahPerWarna = {};
    if (modelList.length === 0) {
      loadingModels = true;
      try {
        const all = await modelBajuCache.get();
        modelList = all.filter((m) => m.aktif);
      }
      finally { loadingModels = false; }
    }
  }

  function resetWarnaDanJumlah() {
    fWarnaId = "";
    fWarnaIds = [];
    fJumlahPerUkuran = {};
    fJumlahPerWarna = {};
  }

  function toggleTambahWarna(warnaId: string, checked: boolean) {
    fWarnaIds = checked
      ? [...new Set([...fWarnaIds, warnaId])]
      : fWarnaIds.filter((id) => id !== warnaId);
    if (!checked) {
      const next = { ...fJumlahPerWarna };
      delete next[warnaId];
      fJumlahPerWarna = next;
    }
  }

  function jumlahTambahWarna(warnaId: string, ukuran: string): number {
    return fJumlahPerWarna[warnaId]?.[ukuran] ?? 0;
  }

  function setJumlahTambahWarna(warnaId: string, ukuran: string, value: number) {
    fJumlahPerWarna = {
      ...fJumlahPerWarna,
      [warnaId]: {
        ...(fJumlahPerWarna[warnaId] ?? {}),
        [ukuran]: value,
      },
    };
  }

  async function submitTambah() {
    if (!selectedModel || savingTambah) return;
    if (modelHasWarna && selectedWarnaList.length === 0) {
      showError("Pilih minimal satu warna terlebih dahulu.");
      return;
    }
    if (totalInputTambah <= 0) { showError("Isi setidaknya satu ukuran."); return; }
    savingTambah = true;
    try {
      const meta = $currentUser ? {
        uid: $currentUser.uid,
        nama: $currentUser.name || $currentUser.email || $currentUser.uid,
        tipe: 'masuk_stok_awal' as const,
        catatan: 'Stok awal manual',
      } : undefined;
      if (modelHasWarna) {
        for (const warna of selectedWarnaList) {
          const items = selectedModel.ukuran_tersedia
            .map((u) => ({ ukuran: u, jumlah_pcs: jumlahTambahWarna(warna.warna_id, u) }))
            .filter((i) => i.jumlah_pcs > 0);
          if (items.length === 0) continue;
          await tambahStokBarangJadi(
            selectedModel.id,
            selectedModel.nama_model,
            items,
            { nama_warna: warna.nama_warna, kode_hex_warna: warna.kode_hex },
            meta,
          );
        }
      } else {
        const items = selectedModel.ukuran_tersedia
          .map((u) => ({ ukuran: u, jumlah_pcs: fJumlahPerUkuran[u] ?? 0 }))
          .filter((i) => i.jumlah_pcs > 0);
        await tambahStokBarangJadi(
          selectedModel.id,
          selectedModel.nama_model,
          items,
          undefined,
          meta,
        );
      }
      openTambah = false;
      await load(true);
      successToast = `Stok awal ${selectedModel.nama_model} berhasil ditambahkan (${totalInputTambah} pcs).`;
      setTimeout(() => (successToast = null), 3500);
    } catch (e: any) {
      showError(e?.message ?? "Gagal menyimpan stok awal.");
    } finally {
      savingTambah = false;
    }
  }

  // onMount: handles hard refresh (afterNavigate doesn't fire when component
  // mounts late due to auth guard delaying render past initial navigation)
  onMount(() => { load(); });

  afterNavigate(({ from }) => {
    if (from?.url.pathname.startsWith("/barang-jadi/")) {
      barangJadiCache.invalidate();
    }
    load();
  });
</script>

<!-- ── Success Toast ──────────────────────────────────────────────── -->
{#if successToast}
  <div class="fixed right-5 top-5 z-[9999] flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 shadow-lg">
    <svg class="h-4 w-4 shrink-0 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
    <p class="text-sm text-green-800">{successToast}</p>
  </div>
{/if}

<!-- ── Error Toast ─────────────────────────────────────────────────── -->
{#if errorMsg}
  <div
    class="fixed right-5 top-5 z-[9999] flex max-w-sm items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg"
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
    <h1 class="text-xl font-semibold text-gray-900">Barang Jadi</h1>
    <p class="mt-0.5 text-sm text-gray-500">
      Stok barang jadi siap kirim per model dan ukuran
    </p>
  </div>
  <div class="flex items-center gap-2">
    {#if lastLoaded && !loading}
      <span class="text-xs text-gray-400">
        Update: {lastLoaded.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    {/if}
    <Button variant="outline" size="sm" onclick={bukaTambah}>
      <svg class="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      Tambah Stok Awal
    </Button>
    <Button variant="outline" size="sm" onclick={() => load(true)}>
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
</div>

<!-- ── Stats ──────────────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
  {#if loading}
    {#each Array(4) as _}
      <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div class="mt-1.5 h-7 w-12 animate-pulse rounded bg-gray-100"></div>
      </div>
    {/each}
  {:else}
    <StatCard
      title="Total Model"
      value={totalModel}
      icon={ShirtIcon}
      footerSubtext="jenis model terdaftar"
    />
    <StatCard
      title="Stok Tersedia"
      value={totalTersedia.toLocaleString("id-ID")}
      icon={PackageCheckIcon}
      footerSubtext="pcs siap kirim"
      class="border-teal-100 bg-teal-50"
      valueClass="text-teal-700"
    />
    <StatCard
      title="Ukuran Kritis"
      value={ukuranKritis}
      icon={AlertTriangleIcon}
      footerSubtext={`<= ${KRITIS_THRESHOLD} pcs per ukuran`}
      class="border-red-100 bg-red-50"
      valueClass="text-red-600"
    />
    <StatCard
      title="Ukuran Menipis"
      value={ukuranMenipis}
      icon={PackageIcon}
      footerSubtext={`${KRITIS_THRESHOLD + 1}-${LOW_THRESHOLD} pcs per ukuran`}
      class="border-amber-100 bg-amber-50"
      valueClass="text-amber-600"
    />
  {/if}
</div>

<!-- ── Filter & Sort Bar ──────────────────────────────────────────── -->
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
      class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
    />
  </div>

  <!-- Filter Status -->
  <div class="flex items-center gap-1.5 flex-wrap">
    {#each [["semua", "Semua"], ["kritis", "🔴 Kritis"], ["low", "🟡 Menipis"], ["kosong", "⚫ Habis"]] as const as [val, lbl]}
      <button
        onclick={() => (filterStatus = val)}
        class="rounded-full border px-3 py-1 text-xs font-medium transition {filterStatus ===
        val
          ? 'border-gray-800 bg-gray-800 text-white'
          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
      >
        {lbl}
        {#if val !== "semua"}
          <span class="ml-1 opacity-60">
            ({grouped.filter((m) => getModelStatus(m) === val).length})
          </span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Sort -->
  <div class="flex items-center gap-1.5 ml-auto">
    <span class="text-xs text-gray-400">Urutkan:</span>
    {#each [["kritis", "Kritis Dulu"], ["terbanyak", "Terbanyak"], ["keluar", "Paling Laku"], ["nama", "A–Z"]] as const as [val, lbl]}
      <Button
        size="sm"
        variant={sortBy === val ? "default" : "outline"}
        onclick={() => (sortBy = val)}
      >
        {lbl}
      </Button>
    {/each}
  </div>
</div>

<!-- ── Content ────────────────────────────────────────────────────── -->
{#if loading}
  <div class="space-y-4">
    {#each Array(3) as _}
      <div
        class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
      >
        <div class="border-b border-gray-100 bg-gray-50 px-5 py-3">
          <div class="h-4 w-48 animate-pulse rounded bg-gray-200"></div>
        </div>
        <div class="grid grid-cols-3 gap-px bg-gray-100 lg:grid-cols-5">
          {#each Array(3) as _}
            <div class="bg-white p-4">
              <div class="h-3 w-6 animate-pulse rounded bg-gray-100"></div>
              <div
                class="mt-2 h-6 w-12 animate-pulse rounded bg-gray-100"
              ></div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{:else if filteredGrouped.length === 0}
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
          d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
        />
      </svg>
    </div>
    {#if searchQuery || filterStatus !== "semua"}
      <p class="text-sm font-medium text-gray-500">
        Tidak ada model yang cocok
      </p>
      <Button
        variant="link"
        size="sm"
        onclick={() => {
          searchQuery = "";
          filterStatus = "semua";
        }}
      >
        Reset filter
      </Button>
    {:else}
      <p class="text-sm font-medium text-gray-500">
        Belum ada stok barang jadi
      </p>
      <p class="text-xs text-gray-400">
        Stok akan terisi otomatis saat batch produksi selesai
      </p>
      <Button
        variant="outline"
        class="mt-1"
        onclick={() => goto("/monitor-produksi")}
      >
        Monitor Produksi →
      </Button>
    {/if}
  </div>
{:else}
  <div class="space-y-3">
    {#each filteredGrouped as model}
      {@const modelStatus = getModelStatus(model)}
      {@const modelSt = STATUS_STYLE[modelStatus]}
      {@const isOpen = expandedModels.has(model.model_id)}
      {@const totalModelPcs = getModelTotal(model)}
      {@const colorCount = model.colors.size}
      <div class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <!-- ── Model Header (clickable to expand/collapse) ── -->
        <button
          type="button"
          onclick={() => toggleModel(model.model_id)}
          class="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
        >
          <!-- Chevron -->
          <svg
            class="h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 {isOpen ? 'rotate-90' : ''}"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>

          <!-- Model name + color count -->
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <a
                href="/barang-jadi/{model.model_id}"
                class="text-sm font-semibold text-gray-800 hover:underline dark:text-slate-100"
                onclick={(e) => e.stopPropagation()}
              >
                {model.nama_model}
              </a>
              {#if colorCount > 1}
                <span class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-white/10 dark:text-slate-300">
                  {colorCount} warna
                </span>
              {:else if colorCount === 1}
                {#each [...model.colors.values()] as color}
                  {#if color.nama_warna}
                    <span class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300">
                      {#if color.kode_hex_warna}
                        <span class="inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/60" style="background-color: {color.kode_hex_warna}"></span>
                      {/if}
                      {color.nama_warna}
                    </span>
                  {/if}
                {/each}
              {/if}
            </div>
          </div>

          <!-- Total pcs -->
          <div class="text-right">
            <p class="text-base font-bold tabular-nums text-gray-800 dark:text-slate-100 {modelStatus === 'kritis' ? 'text-red-600 dark:text-red-400' : ''}">
              {totalModelPcs.toLocaleString("id-ID")}
            </p>
            <p class="text-xs text-gray-400">pcs tersedia</p>
          </div>

          <!-- Status badge -->
          <span class="inline-block shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold {modelSt.badge}">
            {modelSt.label}
          </span>
        </button>

        <!-- ── Expanded: Colors ── -->
        {#if isOpen}
          <div class="divide-y divide-gray-50 border-t border-gray-100 dark:divide-white/10 dark:border-white/10">
            {#each [...model.colors.values()] as color}
              {@const colorStatus = getColorStatus(color)}
              {@const colorSt = STATUS_STYLE[colorStatus]}
              {@const colorTotal = getColorTotal(color)}
              {@const ck = colorKey(model.model_id, color.nama_warna ?? '')}
              {@const colorOpen = expandedColors.has(ck)}
              <div>
                <!-- Color sub-header (clickable to expand/collapse) -->
                <button
                  type="button"
                  onclick={() => toggleColor(model.model_id, color.nama_warna ?? '')}
                  class="flex w-full items-center gap-2 bg-gray-50/50 px-5 py-2.5 text-left transition hover:bg-gray-100 dark:bg-slate-800/80 dark:hover:bg-slate-800"
                >
                  <!-- Chevron -->
                  <svg
                    class="h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200 {colorOpen ? 'rotate-90' : ''}"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                    stroke="currentColor"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>

                  {#if color.nama_warna}
                    <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200">
                      {#if color.kode_hex_warna}
                        <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-gray-200 ring-1 ring-black/10 dark:border-white/30 dark:ring-white/60" style="background-color: {color.kode_hex_warna}"></span>
                      {/if}
                      {color.nama_warna}
                    </span>
                  {:else}
                    <span class="text-xs text-gray-400 font-medium">Tanpa warna</span>
                  {/if}
                  <span class="text-xs text-gray-400">·</span>
                  <span class="text-xs font-semibold text-gray-600 dark:text-slate-300">{colorTotal} pcs</span>
                  <span class="inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold {colorSt.badge}">
                    {colorSt.label}
                  </span>
                  {#if color.items.filter(i => i.stok_tersedia > 0 && i.stok_tersedia <= KRITIS_THRESHOLD).length > 0}
                    <span class="text-[10px] text-red-400 font-medium">
                      ({color.items.filter(i => i.stok_tersedia > 0 && i.stok_tersedia <= KRITIS_THRESHOLD).length} kritis)
                    </span>
                  {/if}
                  <a
                    href="/barang-jadi/{model.model_id}?warna={encodeURIComponent(color.nama_warna ?? '')}"
                    class="ml-auto shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-500 transition hover:bg-gray-50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                    onclick={(e) => e.stopPropagation()}
                  >
                    Detail →
                  </a>
                </button>

                <!-- Size grid -->
                {#if colorOpen}
                  <div
                    class="grid divide-x divide-gray-100 bg-white dark:divide-white/10 dark:bg-slate-950/40"
                    style="grid-template-columns: repeat({color.items.length}, minmax(0, 1fr))"
                  >
                    {#each color.items as item}
                      {@const uStatus = getUkuranStatus(item)}
                      {@const uSt = STATUS_STYLE[uStatus]}

                      <div class="p-4">
                        <div class="mb-2.5 flex items-center justify-between gap-1">
                          <span class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold {uSt.ukuran}">
                            {item.ukuran}
                          </span>
                          {#if uStatus !== "aman"}
                            <span class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold {uSt.badge}">
                              {uSt.label}
                            </span>
                          {/if}
                        </div>
                        <p class="text-2xl font-bold leading-none {uSt.num}">
                          {item.stok_tersedia}
                        </p>
                        <p class="mt-0.5 text-[11px] text-gray-400">pcs tersedia</p>
                        {#if item.updatedAt}
                          <p class="mt-2 text-[10px] text-gray-300">
                            {formatDate(item.updatedAt)}
                          </p>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Footer summary -->
  <div
    class="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-white px-5 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900"
  >
    <p class="text-xs text-gray-400">
      Menampilkan <span class="font-medium text-gray-700 dark:text-slate-200"
        >{filteredGrouped.length}</span
      >
      dari {totalModel} model
      {#if filterStatus !== "semua"}
        <button
          onclick={() => (filterStatus = "semua")}
          class="ml-1.5 text-teal-600 hover:underline"
        >
          (reset filter)
        </button>
      {/if}
    </p>
    <div class="flex flex-wrap gap-4 text-xs text-gray-400">
      <span>
        Tersedia: <span class="font-semibold text-teal-700 dark:text-teal-300"
          >{totalTersedia.toLocaleString("id-ID")} pcs</span
        >
      </span>
      {#if modelKritis > 0}
        <span class="font-medium text-red-500">{modelKritis} model kritis</span>
      {/if}
      {#if modelKosong > 0}
        <span class="font-medium text-gray-400">{modelKosong} model habis</span>
      {/if}
    </div>
    {#if currentPage > 1 || pageHasNext[currentPage - 1]}
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={currentPage === 1 || pageLoading} onclick={previousPage}>Sebelumnya</Button>
        <span class="text-xs font-medium text-gray-700">Halaman {currentPage}{pageLoading ? "..." : ""}</span>
        <Button variant="outline" size="sm" disabled={pageLoading || !pageHasNext[currentPage - 1]} onclick={nextPage}>Berikutnya</Button>
      </div>
    {/if}
  </div>
{/if}

<!-- ── Dialog: Tambah Stok Awal ──────────────────────────────────── -->
<Dialog.Root bind:open={openTambah}>
  <Dialog.Content class="w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-hidden">
    <Dialog.Header>
      <Dialog.Title>Tambah Stok Awal</Dialog.Title>
      <Dialog.Description>
        Isi stok awal berdasarkan model — untuk migrasi bisnis yang sudah berjalan.
      </Dialog.Description>
    </Dialog.Header>

    <div class="min-h-0 max-h-[60vh] space-y-4 overflow-y-auto pr-2">
      <!-- Pilih model -->
      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="tambah-model">
          Model Baju <span class="text-red-500">*</span>
        </label>
        {#if loadingModels}
          <div class="h-10 animate-pulse rounded-lg bg-gray-100"></div>
        {:else}
          <Select.Root
            type="single"
            value={fModelId || undefined}
            onValueChange={(val) => { fModelId = val ?? ""; fWarnaId = ""; fWarnaIds = []; fJumlahPerUkuran = {}; fJumlahPerWarna = {}; }}
          >
            <Select.Trigger class="w-full">
              {#if selectedModel}
                <span class="flex items-center gap-1.5 truncate">
                  <span class="truncate">{selectedModel.nama_model}</span>
                  {#if (selectedModel.warna_tersedia ?? []).length > 0}
                    <span class="shrink-0 text-gray-300">·</span>
                    <span class="shrink-0 text-xs text-gray-500">
                      {(selectedModel.warna_tersedia ?? []).length} warna
                    </span>
                  {/if}
                </span>
              {:else}
                <span class="text-muted-foreground">— Pilih model —</span>
              {/if}
            </Select.Trigger>
            <Select.Content preventScroll={false}>
              {#each modelList as m}
                <Select.Item value={m.id}>
                  <span class="flex items-center gap-1.5">
                    <span>{m.nama_model}</span>
                    {#each m.warna_tersedia ?? [] as w, i}
                      {#if i === 0}<span class="hidden text-gray-300">·</span>{/if}
                      <span class="hidden h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style="background:{w.kode_hex}"></span>
                      <span class="hidden text-gray-400 text-xs">{w.nama_warna}</span>
                      {#if i < (m.warna_tersedia?.length ?? 0) - 1}<span class="hidden text-gray-300">·</span>{/if}
                    {/each}
                  </span>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        {/if}
      </div>

      <!-- Pilih warna (muncul hanya jika model punya warna_tersedia) -->
      {#if selectedModel && modelHasWarna}
        <div>
          <p class="mb-1.5 text-sm font-medium text-gray-700">
            Warna <span class="text-red-500">*</span>
          </p>
          <div class="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2 sm:grid-cols-2">
            {#each selectedModel.warna_tersedia ?? [] as w}
              {@const checked = fWarnaIds.includes(w.warna_id)}
              <label
                class="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors {checked
                  ? 'bg-blue-50 shadow-sm ring-1 ring-blue-200'
                  : 'hover:bg-white/70'}"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onchange={(e) => toggleTambahWarna(w.warna_id, (e.currentTarget as HTMLInputElement).checked)}
                  class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span class="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style="background:{w.kode_hex}"></span>
                <span class="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">{w.nama_warna}</span>
              </label>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Input per ukuran -->
      {#if selectedModel && !modelHasWarna}
        <div>
          <p class="mb-2 text-sm font-medium text-gray-700">Jumlah per Ukuran</p>
          <div class="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {#each selectedModel.ukuran_tersedia as ukuran}
              <div class="flex flex-col items-center gap-1.5">
                <span class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                  {ukuran}
                </span>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  class="text-center"
                  value={fJumlahPerUkuran[ukuran] ?? 0}
                  oninput={(e) => {
                    const v = parseInt((e.target as HTMLInputElement).value) || 0;
                    fJumlahPerUkuran = { ...fJumlahPerUkuran, [ukuran]: v };
                  }}
                />
              </div>
            {/each}
          </div>
          {#if totalInputTambah > 0}
            <p class="mt-2 text-xs text-gray-500">
              Total: <span class="font-semibold text-gray-800">{totalInputTambah} pcs</span>
            </p>
          {/if}
        </div>
      {/if}

      {#if selectedModel && modelHasWarna && selectedWarnaList.length > 0}
        <div class="space-y-3">
          <p class="text-sm font-medium text-gray-700">Jumlah per Ukuran</p>
          {#each selectedWarnaList as warna}
            <div class="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div class="mb-3 flex items-center gap-2">
                <span class="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style="background:{warna.kode_hex}"></span>
                <p class="text-sm font-semibold text-gray-800">{warna.nama_warna}</p>
              </div>
              <div class="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {#each selectedModel.ukuran_tersedia as ukuran}
                  <div class="flex flex-col items-center gap-1.5">
                    <span class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                      {ukuran}
                    </span>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      class="text-center"
                      value={jumlahTambahWarna(warna.warna_id, ukuran)}
                      oninput={(e) => {
                        const v = parseInt((e.target as HTMLInputElement).value) || 0;
                        setJumlahTambahWarna(warna.warna_id, ukuran, v);
                      }}
                    />
                  </div>
                {/each}
              </div>
            </div>
          {/each}
          {#if totalInputTambah > 0}
            <p class="text-xs text-gray-500">
              Total: <span class="font-semibold text-gray-800">{totalInputTambah} pcs</span>
            </p>
          {/if}
        </div>
      {/if}
    </div>

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openTambah = false)}>Batal</Button>
      <Button
        onclick={submitTambah}
        disabled={savingTambah ||
          !selectedModel ||
          (modelHasWarna && selectedWarnaList.length === 0) ||
          totalInputTambah <= 0}
      >
        {savingTambah ? "Menyimpan..." : "Simpan Stok Awal"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
