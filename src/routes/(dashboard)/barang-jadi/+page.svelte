<script lang="ts">
  import { goto, afterNavigate } from "$app/navigation";
  import { onMount } from "svelte";
  import { tambahStokBarangJadi } from "$lib/firebase/barang-jadi";
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

  // Tambah Stok Awal (migrasi)
  let openTambah = $state(false);
  let modelList = $state<ModelBaju[]>([]);
  let loadingModels = $state(false);
  let savingTambah = $state(false);
  let fModelId = $state("");
  let fWarnaId = $state("");
  let fJumlahPerUkuran = $state<Record<string, number>>({});

  let selectedModel = $derived(modelList.find((m) => m.id === fModelId) ?? null);
  let selectedWarna = $derived(
    (selectedModel?.warna_tersedia ?? []).find((w) => w.warna_id === fWarnaId) ?? null,
  );
  let modelHasWarna = $derived((selectedModel?.warna_tersedia ?? []).length > 0);
  let totalInputTambah = $derived(
    Object.values(fJumlahPerUkuran).reduce((s, v) => s + (v ?? 0), 0),
  );

  function successMsg2(msg: string) {
    // reuse errorMsg slot for success — dedicated simple approach
    successToast = msg;
    setTimeout(() => (successToast = null), 3500);
  }
  let successToast = $state<string | null>(null);

  // ── Derived ────────────────────────────────────────────────────────
  // Filter warna
  let filterWarna = $state<string>("semua");

  let grouped = $derived.by(() => {
    // Group by model_id + nama_warna agar tiap kombinasi warna tampil terpisah
    const map = new Map<
      string,
      { model_id: string; nama_model: string; nama_warna?: string; kode_hex_warna?: string; items: StokBarangJadi[] }
    >();
    for (const item of stokList) {
      const key = `${item.model_id}__${item.nama_warna ?? ''}`;
      if (!map.has(key)) {
        map.set(key, {
          model_id: item.model_id,
          nama_model: item.nama_model,
          nama_warna: item.nama_warna,
          kode_hex_warna: item.kode_hex_warna,
          items: [],
        });
      }
      map.get(key)!.items.push(item);
    }
    for (const g of map.values()) {
      g.items.sort(
        (a, b) =>
          UKURAN_ORDER.indexOf(a.ukuran) - UKURAN_ORDER.indexOf(b.ukuran),
      );
    }
    return [...map.values()];
  });

  // Daftar warna unik untuk filter chips
  let warnaUnik = $derived.by(() => {
    const set = new Set<string>();
    for (const g of grouped) {
      if (g.nama_warna) set.add(g.nama_warna);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'id'));
  });

  type GroupedModel = (typeof grouped)[number];

  function getTotalTersedia(g: GroupedModel) {
    return g.items.reduce((s, i) => s + i.stok_tersedia, 0);
  }
  function getStatusModel(
    g: GroupedModel,
  ): "kosong" | "kritis" | "low" | "aman" {
    const total = getTotalTersedia(g);
    if (total === 0) return "kosong";
    const hasKritis = g.items.some(
      (i) => i.stok_tersedia > 0 && i.stok_tersedia <= KRITIS_THRESHOLD,
    );
    if (hasKritis) return "kritis";
    const hasLow = g.items.some(
      (i) => i.stok_tersedia > 0 && i.stok_tersedia <= LOW_THRESHOLD,
    );
    if (hasLow) return "low";
    return "aman";
  }

  let filteredGrouped = $derived.by(() => {
    let list = grouped;

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((g) => g.nama_model.toLowerCase().includes(q));
    }

    // Filter warna
    if (filterWarna !== "semua") {
      list = list.filter((g) => g.nama_warna === filterWarna);
    }

    // Filter status
    if (filterStatus !== "semua") {
      list = list.filter((g) => getStatusModel(g) === filterStatus);
    }

    // Sort
    const sorted = [...list];
    if (sortBy === "kritis") {
      const order = { kosong: 0, kritis: 1, low: 2, aman: 3 };
      sorted.sort(
        (a, b) => order[getStatusModel(a)] - order[getStatusModel(b)],
      );
    } else if (sortBy === "terbanyak") {
      sorted.sort((a, b) => getTotalTersedia(b) - getTotalTersedia(a));
    } else if (sortBy === "nama") {
      sorted.sort((a, b) => a.nama_model.localeCompare(b.nama_model));
    } else if (sortBy === "keluar") {
      sorted.sort(
        (a, b) =>
          b.items.reduce((s, i) => s + i.total_keluar, 0) -
          a.items.reduce((s, i) => s + i.total_keluar, 0),
      );
    }
    return sorted;
  });

  let totalModel = $derived(grouped.length);
  let totalTersedia = $derived(
    stokList.reduce((s, i) => s + i.stok_tersedia, 0),
  );
  let totalMasuk = $derived(stokList.reduce((s, i) => s + i.total_masuk, 0));
  let modelKosong = $derived(
    grouped.filter((g) => g.items.every((i) => i.stok_tersedia === 0)).length,
  );
  let modelKritis = $derived(
    grouped.filter((g) => getStatusModel(g) === "kritis").length,
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
      badge: "bg-gray-100 text-gray-500",
      label: "Habis",
      num: "text-gray-400",
      bar: "bg-gray-300",
      ukuran: "bg-gray-100 text-gray-600",
    },
    kritis: {
      badge: "bg-red-100 text-red-600",
      label: "Kritis",
      num: "text-red-600",
      bar: "bg-red-400",
      ukuran: "bg-gray-100 text-gray-700",
    },
    low: {
      badge: "bg-amber-100 text-amber-600",
      label: "Menipis",
      num: "text-amber-600",
      bar: "bg-amber-400",
      ukuran: "bg-gray-100 text-gray-700",
    },
    aman: {
      badge: "bg-teal-100 text-teal-700",
      label: "Aman",
      num: "text-gray-900",
      bar: "bg-teal-400",
      ukuran: "bg-gray-100 text-gray-700",
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
      stokList = await barangJadiCache.get(force);
      lastLoaded = new Date();
    } catch {
      showError("Gagal memuat data. Periksa koneksi Firebase.");
    } finally {
      loading = false;
    }
  }

  async function bukaTambah() {
    openTambah = true;
    fModelId = "";
    fWarnaId = "";
    fJumlahPerUkuran = {};
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
    fJumlahPerUkuran = {};
  }

  async function submitTambah() {
    if (!selectedModel || savingTambah) return;
    if (modelHasWarna && !selectedWarna) {
      showError("Pilih warna terlebih dahulu.");
      return;
    }
    const items = selectedModel.ukuran_tersedia
      .map((u) => ({ ukuran: u, jumlah_pcs: fJumlahPerUkuran[u] ?? 0 }))
      .filter((i) => i.jumlah_pcs > 0);
    if (items.length === 0) { showError("Isi setidaknya satu ukuran."); return; }
    savingTambah = true;
    try {
      const warnaPayload = selectedWarna
        ? { nama_warna: selectedWarna.nama_warna, kode_hex_warna: selectedWarna.kode_hex }
        : undefined;
      await tambahStokBarangJadi(
        selectedModel.id,
        selectedModel.nama_model,
        items,
        warnaPayload,
        $currentUser ? {
          uid: $currentUser.uid,
          nama: $currentUser.name || $currentUser.email || $currentUser.uid,
          tipe: 'masuk_stok_awal',
          catatan: 'Stok awal manual',
        } : undefined,
      );
      openTambah = false;
      await load(true);
      successToast = `Stok awal ${selectedModel.nama_model}${selectedWarna ? ` (${selectedWarna.nama_warna})` : ''} berhasil ditambahkan.`;
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
      title="Total Masuk"
      value={totalMasuk.toLocaleString("id-ID")}
      icon={PackageIcon}
      footerSubtext="pcs dari produksi"
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
            ({grouped.filter((g) => getStatusModel(g) === val).length})
          </span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Filter Warna -->
  {#if warnaUnik.length > 1}
    <div class="flex items-center gap-1.5 flex-wrap">
      <span class="text-xs text-gray-400">Warna:</span>
      <button
        onclick={() => (filterWarna = "semua")}
        class="rounded-full border px-3 py-1 text-xs font-medium transition {filterWarna === 'semua'
          ? 'border-gray-800 bg-gray-800 text-white'
          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
      >
        Semua
      </button>
      {#each warnaUnik as warna}
        {@const hexFirst = stokList.find((i) => i.nama_warna === warna)?.kode_hex_warna}
        <button
          onclick={() => (filterWarna = warna)}
          class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition {filterWarna === warna
            ? 'border-gray-800 bg-gray-800 text-white'
            : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
        >
          {#if hexFirst}
            <span class="h-2 w-2 shrink-0 rounded-full" style="background:{hexFirst}"></span>
          {/if}
          {warna}
        </button>
      {/each}
    </div>
  {/if}

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
  <div class="space-y-4">
    {#each filteredGrouped as group}
      {@const statusModel = getStatusModel(group)}
      {@const st = STATUS_STYLE[statusModel]}
      {@const totalGrup = getTotalTersedia(group)}
<div class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <!-- ── Model Header ── -->
        <div class="border-b border-gray-100 bg-gray-50 px-5 py-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <!-- Kiri: nama + badges -->
            <div class="flex items-center gap-2.5">
              <a
                href="/barang-jadi/{group.model_id}"
                class="text-sm font-semibold text-gray-800 hover:underline"
              >
                {group.nama_model}
              </a>
              {#if group.nama_warna}
                <span class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600">
                  {#if group.kode_hex_warna}
                    <span class="inline-block h-2.5 w-2.5 rounded-full shrink-0" style="background-color: {group.kode_hex_warna}"></span>
                  {/if}
                  {group.nama_warna}
                </span>
              {/if}
            </div>

            <!-- Kanan: total + tombol detail -->
            <div class="flex items-center gap-3 text-xs text-gray-500">
              <div class="text-right">
                <p class="text-base font-semibold leading-tight text-gray-800">{totalGrup}</p>
                <p>pcs tersedia</p>
              </div>
              <div class="h-8 w-px bg-gray-200"></div>
              <a
                href="/barang-jadi/{group.model_id}"
                class="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                Detail →
              </a>
            </div>
          </div>

        </div>

        <!-- ── Ukuran Grid ── -->
        <div
          class="grid divide-x divide-gray-100 grid-cols-{Math.min(
            group.items.length,
            5,
          )}"
          style="grid-template-columns: repeat({group.items
            .length}, minmax(0, 1fr))"
        >
          {#each group.items as item}
            {@const uStatus = getUkuranStatus(item)}
            {@const uSt = STATUS_STYLE[uStatus]}

            <div class="p-4">
              <!-- Ukuran badge + status -->
              <div class="mb-2.5 flex items-center justify-between gap-1">
                <span
                  class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold {uSt.ukuran}"
                >
                  {item.ukuran}
                </span>
                {#if uStatus !== "aman"}
                  <span
                    class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold {uSt.badge}"
                  >
                    {uSt.label}
                  </span>
                {/if}
              </div>

              <!-- Stok besar -->
              <p class="text-2xl font-bold leading-none {uSt.num}">
                {item.stok_tersedia}
              </p>
              <p class="mt-0.5 text-[11px] text-gray-400">pcs tersedia</p>

              <!-- Last update -->
              {#if item.updatedAt}
                <p class="mt-2 text-[10px] text-gray-300">
                  {formatDate(item.updatedAt)}
                </p>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <!-- Footer summary -->
  <div
    class="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-white px-5 py-3 shadow-sm"
  >
    <p class="text-xs text-gray-400">
      Menampilkan <span class="font-medium text-gray-700"
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
        Tersedia: <span class="font-semibold text-teal-700"
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
  </div>
{/if}

<!-- ── Dialog: Tambah Stok Awal ──────────────────────────────────── -->
<Dialog.Root bind:open={openTambah}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Tambah Stok Awal</Dialog.Title>
      <Dialog.Description>
        Isi stok awal berdasarkan model — untuk migrasi bisnis yang sudah berjalan.
      </Dialog.Description>
    </Dialog.Header>

    <div class="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
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
            onValueChange={(val) => { fModelId = val ?? ""; fJumlahPerUkuran = {}; }}
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
                      {#if i === 0}<span class="text-gray-300">·</span>{/if}
                      <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style="background:{w.kode_hex}"></span>
                      <span class="text-gray-400 text-xs">{w.nama_warna}</span>
                      {#if i < (m.warna_tersedia?.length ?? 0) - 1}<span class="text-gray-300">·</span>{/if}
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
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="tambah-warna">
            Warna <span class="text-red-500">*</span>
          </label>
          <Select.Root
            type="single"
            value={fWarnaId || undefined}
            onValueChange={(val) => { fWarnaId = val ?? ""; fJumlahPerUkuran = {}; }}
          >
            <Select.Trigger class="w-full">
              {#if selectedWarna}
                <span class="flex items-center gap-2 truncate">
                  <span class="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style="background:{selectedWarna.kode_hex}"></span>
                  <span class="truncate">{selectedWarna.nama_warna}</span>
                </span>
              {:else}
                <span class="text-muted-foreground">— Pilih warna —</span>
              {/if}
            </Select.Trigger>
            <Select.Content preventScroll={false}>
              {#each selectedModel.warna_tersedia ?? [] as w}
                <Select.Item value={w.warna_id}>
                  <span class="flex items-center gap-2">
                    <span class="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style="background:{w.kode_hex}"></span>
                    <span>{w.nama_warna}</span>
                  </span>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      {/if}

      <!-- Input per ukuran -->
      {#if selectedModel && (!modelHasWarna || selectedWarna)}
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
    </div>

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openTambah = false)}>Batal</Button>
      <Button
        onclick={submitTambah}
        disabled={savingTambah ||
          !selectedModel ||
          (modelHasWarna && !selectedWarna) ||
          Object.values(fJumlahPerUkuran).every((v) => !v || v <= 0)}
      >
        {savingTambah ? "Menyimpan..." : "Simpan Stok Awal"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
