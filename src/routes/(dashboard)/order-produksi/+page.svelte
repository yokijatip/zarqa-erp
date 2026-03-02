<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { createBatchProduksi, createBatchDariPotongan } from "$lib/firebase/batch-produksi";
  import { getStokPotonganByModel } from "$lib/firebase/stok-potongan";
  import { batchCache, modelBajuCache, stokPotonganCache } from "$lib/stores/data-cache.svelte";
  import { currentUser, isAdmin } from "$lib/stores/auth.store";
  import type {
    BatchProduksi,
    ModelBaju,
    StatusBatch,
    StokPotongan,
    UkuranBaju,
  } from "$lib/types";
  import { STATUS_LABEL } from "$lib/types";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Table from "$lib/components/ui/table";
  import { Button } from "$lib/components/ui/button";
  import StatCard from "$lib/components/StatCard.svelte";
  import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
  import LoaderIcon from "@lucide/svelte/icons/loader";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import { type DateRange, filterByRange } from "$lib/period";
  import PeriodSelector from "$lib/components/period-selector.svelte";

  const UKURAN_ORDER: UkuranBaju[] = ["S", "M", "L", "XL", "XXL"];

  const STATUS_STYLE: Record<StatusBatch, string> = {
    PENDING_CUTTING: "bg-slate-100 text-slate-700",
    CUTTING_IN_PROGRESS: "bg-orange-100 text-orange-700",
    CUTTING_DONE: "bg-yellow-100 text-yellow-700",
    JAHIT_IN_PROGRESS: "bg-blue-100 text-blue-700",
    JAHIT_DONE: "bg-teal-100 text-teal-700",
    STEAM_IN_PROGRESS: "bg-purple-100 text-purple-700",
    STEAM_DONE: "bg-emerald-100 text-emerald-700",
    COMPLETED: "bg-green-100 text-green-700",
  };

  const STATUS_OPTIONS: Array<{ value: StatusBatch | "SEMUA"; label: string }> =
    [
      { value: "SEMUA", label: "Semua Status" },
      { value: "PENDING_CUTTING", label: STATUS_LABEL.PENDING_CUTTING },
      { value: "CUTTING_IN_PROGRESS", label: STATUS_LABEL.CUTTING_IN_PROGRESS },
      { value: "CUTTING_DONE", label: STATUS_LABEL.CUTTING_DONE },
      { value: "JAHIT_IN_PROGRESS", label: STATUS_LABEL.JAHIT_IN_PROGRESS },
      { value: "JAHIT_DONE", label: STATUS_LABEL.JAHIT_DONE },
      { value: "STEAM_IN_PROGRESS", label: STATUS_LABEL.STEAM_IN_PROGRESS },
      { value: "STEAM_DONE", label: STATUS_LABEL.STEAM_DONE },
      { value: "COMPLETED", label: STATUS_LABEL.COMPLETED },
    ];

  // ── State ──────────────────────────────────────────────────────────
  let batchList = $state<BatchProduksi[]>([]);
  let modelList = $state<ModelBaju[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);
  let searchQuery = $state("");
  let filterStatus = $state<StatusBatch | "SEMUA">("SEMUA");
  let dateRange = $state<DateRange>(null);
  let openBuat = $state(false);

  // Form
  let fModelId = $state("");
  let fCatatan = $state("");
  let fJumlah = $state<Partial<Record<UkuranBaju, number>>>({});
  let dariPotongan = $state(false);
  let stokPotonganModel = $state<StokPotongan[]>([]);
  let loadingStokPotongan = $state(false);

  // ── Derived ────────────────────────────────────────────────────────
  let selectedModel = $derived(
    modelList.find((m) => m.id === fModelId) ?? null,
  );

  let detailUkuran = $derived(
    selectedModel
      ? UKURAN_ORDER.filter(
          (u) =>
            selectedModel!.ukuran_tersedia.includes(u) && (fJumlah[u] ?? 0) > 0,
        ).map((u) => ({ ukuran: u, jumlah_pcs: fJumlah[u]! }))
      : [],
  );

  let totalPcs = $derived(detailUkuran.reduce((s, d) => s + d.jumlah_pcs, 0));

  let kainDibutuhkan = $derived(
    selectedModel && totalPcs > 0
      ? selectedModel.kebutuhan_kain.map((k) => ({
          kain_id: k.kain_id,
          nama_kain: k.nama_kain,
          satuan: k.satuan,
          jumlah_dipakai: parseFloat(
            detailUkuran
              .reduce(
                (s, du) =>
                  s + ((k.jumlah_per_ukuran ?? {})[du.ukuran] ?? 0) * du.jumlah_pcs,
                0,
              )
              .toFixed(2),
          ),
        }))
      : [],
  );

  let canSubmit = $derived(
    fModelId !== "" &&
    totalPcs > 0 &&
    (!dariPotongan || detailUkuran.every((du) => {
      const stok = stokPotonganModel.find((s) => s.ukuran === du.ukuran);
      return stok && stok.stok_tersedia >= du.jumlah_pcs;
    }))
  );

  let batchPeriod = $derived(
    filterByRange(batchList, dateRange, (b) => b.createdAt),
  );

  let totalOrder = $derived(batchPeriod.length);
  let aktifCount = $derived(
    batchPeriod.filter((b) => b.status !== "COMPLETED").length,
  );
  let selesaiCount = $derived(
    batchPeriod.filter((b) => b.status === "COMPLETED").length,
  );

  let filterStatusLabel = $derived(
    STATUS_OPTIONS.find((o) => o.value === filterStatus)?.label ?? "Semua Status",
  );

  let filteredList = $derived.by(() => {
    let list = batchPeriod;
    if (filterStatus !== "SEMUA")
      list = list.filter((b) => b.status === filterStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((b) => b.nama_model.toLowerCase().includes(q));
    }
    return list;
  });

  // ── Helpers ────────────────────────────────────────────────────────
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
    errorMsg = null;
    try {
      batchList = await batchCache.get(force);
    } catch {
      showError("Gagal memuat data. Periksa koneksi Firebase.");
    } finally {
      loading = false;
    }
  }

  async function loadModels() {
    try {
      const all = await modelBajuCache.get();
      modelList = all.filter((m) => m.aktif);
    } catch (e) {
      console.error("[loadModels] Gagal memuat model baju:", e);
    }
  }

  // ── Actions ──────────────────────────────────────────────────────
  function bukaBuat() {
    fModelId = "";
    fCatatan = "";
    fJumlah = {};
    dariPotongan = false;
    stokPotonganModel = [];
    openBuat = true;
  }

  async function onToggleDariPotongan(val: boolean) {
    dariPotongan = val;
    if (val && fModelId) {
      loadingStokPotongan = true;
      try {
        stokPotonganModel = await getStokPotonganByModel(fModelId);
      } catch (e) {
        console.error("[stokPotongan] Gagal fetch:", e);
        stokPotonganModel = [];
      } finally {
        loadingStokPotongan = false;
      }
    }
  }

  async function onModelChange(val: string) {
    fModelId = val;
    fJumlah = {};
    stokPotonganModel = [];
    if (dariPotongan && val) {
      loadingStokPotongan = true;
      try {
        stokPotonganModel = await getStokPotonganByModel(val);
      } catch (e) {
        console.error("[stokPotongan] Gagal fetch:", e);
        stokPotonganModel = [];
      } finally {
        loadingStokPotongan = false;
      }
    }
  }

  async function submitBuat() {
    if (!canSubmit || !$currentUser) return;
    saving = true;
    try {
      const catatanTrimmed = fCatatan.trim();
      const inputData = {
        model_id: fModelId,
        nama_model: selectedModel!.nama_model,
        ...(selectedModel!.nama_warna ? { nama_warna: selectedModel!.nama_warna, kode_hex_warna: selectedModel!.kode_hex_warna } : {}),
        detail_ukuran: detailUkuran,
        kain_digunakan: kainDibutuhkan,
        ...(catatanTrimmed ? { catatan_admin: catatanTrimmed } : {}),
      };
      if (dariPotongan) {
        await createBatchDariPotongan(inputData, $currentUser.uid);
        stokPotonganCache.invalidate();
      } else {
        await createBatchProduksi(inputData, $currentUser.uid);
      }
      await load(true);
      openBuat = false;
      showSuccess(`Order "${selectedModel!.nama_model}" berhasil dibuat.`);
    } catch (e: any) {
      showError(e?.message ?? "Gagal membuat order produksi.");
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    loadModels();
    load();
  });
</script>

<!-- ── Toast ─────────────────────────────────────────────────────── -->
{#if successMsg}
  <div
    class="fixed right-5 top-5 z-9999 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 shadow-lg"
  >
    <svg
      class="h-4 w-4 text-green-600"
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
    <h1 class="text-xl font-semibold text-gray-900">Order Produksi</h1>
    <p class="mt-0.5 text-sm text-gray-500">
      Buat dan pantau order produksi baju
    </p>
  </div>
  {#if $isAdmin}
    <Button onclick={bukaBuat}>
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
      Buat Order
    </Button>
  {/if}
</div>

<!-- ── Stats ──────────────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-3 gap-4">
  {#if loading}
    {#each Array(3) as _}
      <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div class="mt-1.5 h-7 w-10 animate-pulse rounded bg-gray-100"></div>
      </div>
    {/each}
  {:else}
    <StatCard
      title="Total Order"
      value={totalOrder}
      icon={ClipboardListIcon}
      footerSubtext="semua order tercatat"
    />
    <StatCard
      title="Sedang Berjalan"
      value={aktifCount}
      icon={LoaderIcon}
      footerSubtext="dalam proses produksi"
      class="border-blue-100 bg-blue-50"
      valueClass="text-blue-700"
    />
    <StatCard
      title="Selesai"
      value={selesaiCount}
      icon={CircleCheckIcon}
      footerSubtext="order telah selesai"
      class="border-green-100 bg-green-50"
      valueClass="text-green-700"
    />
  {/if}
</div>

<!-- ── Filter Bar ─────────────────────────────────────────────────── -->
<div class="mb-4 flex flex-wrap items-center gap-3">
  <PeriodSelector bind:dateRange defaultPeriod="semua" />

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
      class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
    />
  </div>

  <!-- Status Filter -->
  <Select.Root
    type="single"
    value={filterStatus}
    onValueChange={(val) => {
      filterStatus = (val ?? "SEMUA") as StatusBatch | "SEMUA";
    }}
  >
    <Select.Trigger class="w-44">
      <span class={filterStatus !== "SEMUA" ? "text-foreground" : "text-muted-foreground"}>
        {filterStatusLabel}
      </span>
    </Select.Trigger>
    <Select.Content preventScroll={false}>
      {#each STATUS_OPTIONS as opt}
        <Select.Item value={opt.value}>{opt.label}</Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>

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

<!-- ── Table ──────────────────────────────────────────────────────── -->
<div
  class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
>
  {#if loading}
    <!-- Skeleton -->
    <div class="space-y-0">
      {#each Array(5) as _}
        <div class="flex items-center gap-4 border-b border-gray-50 px-5 py-4">
          <div class="h-4 w-44 animate-pulse rounded bg-gray-100"></div>
          <div class="ml-auto h-4 w-12 animate-pulse rounded bg-gray-100"></div>
          <div class="h-6 w-28 animate-pulse rounded-full bg-gray-100"></div>
          <div class="h-4 w-20 animate-pulse rounded bg-gray-100"></div>
          <div class="h-8 w-16 animate-pulse rounded-lg bg-gray-100"></div>
        </div>
      {/each}
    </div>
  {:else if filteredList.length === 0}
    <!-- Empty State -->
    <div class="flex flex-col items-center justify-center gap-3 py-16">
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
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z"
          />
        </svg>
      </div>
      {#if searchQuery || filterStatus !== "SEMUA"}
        <p class="text-sm font-medium text-gray-500">
          Tidak ada order yang cocok dengan filter
        </p>
        <Button
          variant="link"
          size="sm"
          onclick={() => {
            searchQuery = "";
            filterStatus = "SEMUA";
          }}
        >
          Hapus filter
        </Button>
      {:else}
        <p class="text-sm font-medium text-gray-500">
          Belum ada order produksi
        </p>
        <p class="text-xs text-gray-400">
          Mulai dengan membuat order produksi pertama
        </p>
        {#if $isAdmin}
          <Button onclick={bukaBuat} class="mt-1">+ Buat Order</Button>
        {/if}
      {/if}
    </div>
  {:else}
    <Table.Root>
      <Table.Header>
        <Table.Row class="bg-gray-50 hover:bg-gray-50">
          <Table.Head>Model</Table.Head>
          <Table.Head class="text-center">Total PCS</Table.Head>
          <Table.Head>Status</Table.Head>
          <Table.Head>Tanggal</Table.Head>
          <Table.Head></Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each filteredList as batch}
          <Table.Row
            class="cursor-pointer"
            onclick={() => goto(`/order-produksi/${batch.id}`)}
            tabindex={0}
            onkeydown={(e) => e.key === "Enter" && goto(`/order-produksi/${batch.id}`)}
          >
            <!-- Model + ukuran pills -->
            <Table.Cell>
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium text-gray-800">{batch.nama_model}</p>
                {#if batch.nama_warna}
                  <span class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 shrink-0">
                    <span class="inline-block h-2 w-2 rounded-full shrink-0" style="background-color: {batch.kode_hex_warna}"></span>
                    {batch.nama_warna}
                  </span>
                {/if}
              </div>
              <div class="mt-1 flex flex-wrap gap-1">
                {#each batch.detail_ukuran as du}
                  <span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                    {du.ukuran}: {du.jumlah_pcs}
                  </span>
                {/each}
              </div>
            </Table.Cell>

            <!-- Total PCS -->
            <Table.Cell class="text-center">
              <p class="text-sm font-semibold text-gray-800">{batch.total_pcs}</p>
              <p class="text-xs text-gray-400">pcs</p>
            </Table.Cell>

            <!-- Status -->
            <Table.Cell>
              <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold {STATUS_STYLE[batch.status]}">
                {STATUS_LABEL[batch.status]}
              </span>
            </Table.Cell>

            <!-- Tanggal -->
            <Table.Cell>
              <p class="text-xs text-gray-600">{formatDate(batch.createdAt)}</p>
            </Table.Cell>

            <!-- Aksi -->
            <Table.Cell class="text-right">
              <Button variant="outline" size="sm">
                Detail
                <svg class="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Button>
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>

    <!-- Footer -->
    <div class="border-t border-gray-100 bg-gray-50 px-5 py-3">
      <p class="text-xs text-gray-400">
        Menampilkan {filteredList.length} dari {batchList.length} order total
      </p>
    </div>
  {/if}
</div>

<!-- ── Sheet: Buat Order ──────────────────────────────────────────── -->
<Dialog.Root bind:open={openBuat}>
  <Dialog.Content class="flex max-h-[90vh] max-w-md flex-col gap-0 p-0">
    <Dialog.Header class="shrink-0 px-6 pt-6 pb-2">
      <Dialog.Title>Buat Order Produksi</Dialog.Title>
      <Dialog.Description>
        Pilih model dan tentukan jumlah pcs per ukuran.
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex-1 overflow-y-auto px-6 py-5">
      <div class="space-y-5">
        <!-- Pilih Model -->
        <div>
          <label
            class="mb-1.5 block text-sm font-medium text-gray-700"
            for="model-select"
          >
            Model Baju <span class="text-red-500">*</span>
          </label>
          {#if modelList.length === 0}
            <p class="text-xs text-gray-400">
              Belum ada model aktif. Tambahkan model baju terlebih dahulu.
            </p>
          {:else}
            <Select.Root
              type="single"
              value={fModelId || undefined}
              onValueChange={(val) => onModelChange(val ?? "")}
            >
              <Select.Trigger class="w-full">
                {#if selectedModel}
                  <span class="flex items-center gap-2">
                    {selectedModel.nama_model}
                    {#if selectedModel.nama_warna}
                      <span class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
                        <span class="inline-block h-2.5 w-2.5 rounded-full shrink-0" style="background-color: {selectedModel.kode_hex_warna}"></span>
                        {selectedModel.nama_warna}
                      </span>
                    {/if}
                  </span>
                {:else}
                  <span class="text-muted-foreground">— Pilih model —</span>
                {/if}
              </Select.Trigger>
              <Select.Content preventScroll={false}>
                {#each modelList as model}
                  <Select.Item value={model.id}>
                    <span class="flex items-center justify-between gap-2 w-full">
                      {model.nama_model}
                      {#if model.nama_warna}
                        <span class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 shrink-0">
                          <span class="inline-block h-2 w-2 rounded-full shrink-0" style="background-color: {model.kode_hex_warna}"></span>
                          {model.nama_warna}
                        </span>
                      {/if}
                    </span>
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          {/if}
        </div>

        <!-- Toggle: Dari Potongan Kain -->
        {#if selectedModel}
          <div class="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
            <div>
              <p class="text-sm font-medium text-gray-700">Dari Potongan Kain</p>
              <p class="text-xs text-gray-400">Gunakan stok sisa cutting — tidak memotong kain mentah</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Dari potongan kain"
              aria-checked={dariPotongan}
              onclick={() => onToggleDariPotongan(!dariPotongan)}
              class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors {dariPotongan
                ? 'bg-primary'
                : 'bg-gray-200'}"
            >
              <span
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {dariPotongan
                  ? 'translate-x-5'
                  : 'translate-x-0'}"
              ></span>
            </button>
          </div>
        {/if}

        <!-- Jumlah Per Ukuran -->
        {#if selectedModel}
          <div>
            <p class="mb-2 text-sm font-medium text-gray-700">
              Jumlah Per Ukuran <span class="text-red-500">*</span>
            </p>
            <div class="flex flex-wrap gap-2">
              {#each UKURAN_ORDER.filter((u) => selectedModel!.ukuran_tersedia.includes(u)) as ukuran}
                <div class="w-16 text-center">
                  <label
                    class="mb-1 block text-xs font-semibold text-gray-600"
                    for="ukuran-{ukuran}"
                  >
                    {ukuran}
                  </label>
                  <input
                    id="ukuran-{ukuran}"
                    type="number"
                    min="0"
                    placeholder="0"
                    bind:value={fJumlah[ukuran]}
                    class="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 py-1 text-center text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px]"
                  />
                </div>
              {/each}
            </div>
            <p class="mt-1.5 text-xs text-gray-400">
              Kosongkan atau isi 0 untuk ukuran yang tidak diorder.
            </p>
            {#if totalPcs > 0}
              <p class="mt-1 text-xs text-gray-500">
                Total: <span class="font-semibold text-gray-800"
                  >{totalPcs} pcs</span
                >
              </p>
            {/if}
          </div>

          <!-- Stok Potongan tersedia per ukuran (saat mode dari potongan) -->
          {#if dariPotongan}
            <div class="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-700">
                Stok Potongan Tersedia
              </p>
              {#if loadingStokPotongan}
                <p class="text-xs text-blue-500">Memuat stok potongan...</p>
              {:else if stokPotonganModel.length === 0}
                <p class="text-xs text-red-600">Tidak ada stok potongan untuk model ini.</p>
              {:else}
                <div class="space-y-1.5">
                  {#each UKURAN_ORDER.filter((u) => selectedModel!.ukuran_tersedia.includes(u)) as ukuran}
                    {@const stok = stokPotonganModel.find((s) => s.ukuran === ukuran)}
                    {@const jumlahDiminta = fJumlah[ukuran] ?? 0}
                    {@const cukup = stok && stok.stok_tersedia >= jumlahDiminta}
                    <div class="flex items-center justify-between text-sm">
                      <span class="text-gray-700">Ukuran {ukuran}</span>
                      <span class="font-semibold {stok ? (cukup || jumlahDiminta === 0 ? 'text-blue-800' : 'text-red-600') : 'text-gray-400'}">
                        {stok ? stok.stok_tersedia : 0} pcs tersedia
                        {#if jumlahDiminta > 0 && stok && !cukup}
                          <span class="text-xs font-normal">(diminta: {jumlahDiminta})</span>
                        {/if}
                      </span>
                    </div>
                  {/each}
                </div>
                <p class="mt-2 text-[10px] text-blue-600">
                  Stok potongan akan dikurangi otomatis. Kain mentah tidak dipotong.
                </p>
              {/if}
            </div>
          {/if}

          <!-- Kebutuhan Kain (auto-calculated) — sembunyikan saat dari potongan -->
          {#if kainDibutuhkan.length > 0 && !dariPotongan}
            <div class="rounded-xl border border-amber-100 bg-amber-50 p-4">
              <p
                class="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-700"
              >
                Kain yang Dibutuhkan
              </p>
              <div class="space-y-1.5">
                {#each kainDibutuhkan as kain}
                  <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-700">{kain.nama_kain}</span>
                    <span class="font-semibold text-amber-800"
                      >{kain.jumlah_dipakai} {kain.satuan}</span
                    >
                  </div>
                {/each}
              </div>
              <p class="mt-2 text-[10px] text-amber-600">
                Stok kain akan dikurangi otomatis saat order dibuat.
              </p>
            </div>
          {/if}
        {/if}

        <!-- Catatan -->
        <div>
          <label
            class="mb-1.5 block text-sm font-medium text-gray-700"
            for="catatan-order"
          >
            Catatan Admin <span class="text-xs font-normal text-gray-400"
              >(opsional)</span
            >
          </label>
          <textarea
            id="catatan-order"
            rows="3"
            placeholder="Catatan khusus untuk order ini..."
            bind:value={fCatatan}
            class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
          ></textarea>
        </div>
      </div>
    </div>

    <Dialog.Footer class="shrink-0 gap-2 border-t border-gray-100 px-6 py-4">
      <Button variant="outline" class="flex-1" onclick={() => (openBuat = false)}>
        Batal
      </Button>
      <Button
        onclick={submitBuat}
        disabled={saving || !canSubmit}
        class="flex-1"
      >
        {saving ? "Membuat..." : "Buat Order"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
