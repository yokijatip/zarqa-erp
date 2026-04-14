<script lang="ts">
  import { afterNavigate, goto } from "$app/navigation";
  import { batchCache, stokPotonganCache, karyawanCache } from "$lib/stores/data-cache.svelte";
  import { userRole, currentUser } from "$lib/stores/auth.store";
  import { sinkronStokPotonganBatch, updateStatusBatch, completeBatchProduksi } from "$lib/firebase/batch-produksi";
  import { STATUS_LABEL, type BatchProduksi, type StokPotongan, type UserRole, type UserProfile } from "$lib/types";
  import type { ProductionStageConfig } from "$lib/production-stages";
  import { filterBatchesByStage, STATUS_STYLE } from "$lib/production-stages";
  import ProductionCreateDialog from "$lib/components/production-create-dialog.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select";
  import * as Table from "$lib/components/ui/table";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import StatCard from "$lib/components/StatCard.svelte";
  import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
  import LoaderIcon from "@lucide/svelte/icons/loader";
  import PackageIcon from "@lucide/svelte/icons/package";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";

  let { config }: { config: ProductionStageConfig } = $props();

  const STAGE_ROLES: Record<string, UserRole[]> = {
    cutting: ["kepala_cutting", "admin_gudang", "owner", "developer"],
    jahit:   ["kepala_jahit",   "admin_gudang", "owner", "developer"],
    steam:   ["kepala_steam",   "admin_gudang", "owner", "developer"],
  };

  $effect(() => {
    const role = $userRole;
    if (role !== null && !STAGE_ROLES[config.key].includes(role)) {
      goto("/dashboard");
    }
  });

  let batchList = $state<BatchProduksi[]>([]);
  let stokPotonganList = $state<StokPotongan[]>([]);
  let karyawanList = $state<UserProfile[]>([]);
  let loading = $state(true);
  let stockLoading = $state(false);
  let errorMsg = $state<string | null>(null);
  let searchQuery = $state("");

  // Quick-action dialog (steam inline popup)
  let quickOpen = $state(false);
  let quickBatch = $state<BatchProduksi | null>(null);
  let quickWorkerUid = $state("");
  let quickPcsBerhasil = $state(0);
  let quickPcsReject = $state(0);
  let quickSaving = $state(false);
  let quickError = $state<string | null>(null);

  const NEXT_STATUS: Partial<Record<string, string>> = {
    JAHIT_DONE: "STEAM_IN_PROGRESS",
    STEAM_IN_PROGRESS: "STEAM_DONE",
  };

  let quickNextStatus = $derived(quickBatch ? (NEXT_STATUS[quickBatch.status] ?? null) : null);
  let quickNeedsWorker = $derived(quickNextStatus === "STEAM_IN_PROGRESS");
  let quickNeedsPcs = $derived(quickNextStatus === "STEAM_DONE");
  let quickWorkers = $derived(
    karyawanList.filter((k) => k.role === config.quickActionWorkerRole),
  );
  let quickFormValid = $derived.by(() => {
    if (!quickNextStatus) return false;
    if (quickNeedsWorker && !quickWorkerUid) return false;
    if (quickNeedsPcs && quickPcsBerhasil + quickPcsReject <= 0) return false;
    return true;
  });

  function openQuickAction(batch: BatchProduksi) {
    quickBatch = batch;
    quickWorkerUid = batch.penugasan?.steam?.uid ?? "";
    quickPcsBerhasil = batch.pcs_saat_ini ?? batch.total_pcs;
    quickPcsReject = 0;
    quickError = null;
    quickOpen = true;
  }

  async function submitQuickAction() {
    if (!quickBatch || !quickNextStatus || !$currentUser || !quickFormValid) return;
    quickSaving = true;
    quickError = null;
    const uid = $currentUser.uid;
    const nama = $currentUser.name || $currentUser.email || $currentUser.uid;
    try {
      const worker = quickNeedsWorker
        ? quickWorkers.find((k) => k.uid === quickWorkerUid)
        : undefined;
      const pcsBerhasil = quickNeedsPcs ? quickPcsBerhasil : (quickBatch.pcs_saat_ini ?? quickBatch.total_pcs);
      const pcsReject = quickNeedsPcs ? quickPcsReject : 0;

      await updateStatusBatch(
        quickBatch.id,
        quickNextStatus as any,
        uid,
        nama,
        { status_dari: quickBatch.status as any, pcs_berhasil: pcsBerhasil, pcs_reject: pcsReject },
        worker ? { uid: worker.uid, nama: worker.name } : undefined,
      );

      // Setelah STEAM_DONE, langsung selesaikan dan masukkan ke barang jadi
      if (quickNextStatus === "STEAM_DONE") {
        await completeBatchProduksi(quickBatch.id, uid, nama, {
          status_dari: "STEAM_DONE",
          pcs_berhasil: pcsBerhasil,
          pcs_reject: pcsReject,
        });
      }

      batchCache.invalidate();
      quickOpen = false;
      quickBatch = null;
      await load(true);
    } catch (e: any) {
      quickError = e?.message ?? "Gagal memperbarui status.";
    } finally {
      quickSaving = false;
    }
  }

  let filteredBatches = $derived.by(() => {
    let list = filterBatchesByStage(batchList, config);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((batch) => batch.nama_model.toLowerCase().includes(q));
    }
    return list;
  });

  let readyCount = $derived(
    filteredBatches.filter((batch) => config.readyStatuses.includes(batch.status)).length,
  );
  let inProgressCount = $derived(
    filteredBatches.filter(
      (batch) =>
        !config.readyStatuses.includes(batch.status) &&
        !(config.doneStatuses ?? []).includes(batch.status),
    ).length,
  );
  let doneCount = $derived(
    filteredBatches.filter((batch) => (config.doneStatuses ?? []).includes(batch.status)).length,
  );
  let totalPcs = $derived(filteredBatches.reduce((sum, batch) => sum + (batch.pcs_saat_ini ?? batch.total_pcs), 0));
  let stokPotonganReady = $derived(stokPotonganList.filter((stok) => stok.stok_tersedia > 0));
  let stokPotonganPcs = $derived(stokPotonganReady.reduce((sum, stok) => sum + stok.stok_tersedia, 0));

  function getPrimaryAction(batch: BatchProduksi): string {
    if (config.key === "cutting") {
      return batch.status === "PENDING_CUTTING" ? "Mulai Cutting" : "Selesaikan Cutting";
    }
    if (config.key === "jahit") {
      return batch.status === "CUTTING_DONE" ? "Mulai Jahit" : "Selesaikan Jahit";
    }
    return batch.status === "JAHIT_DONE" ? "Mulai Steam" : "Selesaikan Steam";
  }

  function getAssignedWorker(batch: BatchProduksi): string {
    if (config.key === "cutting") return batch.penugasan?.cutting?.nama ?? "Belum ditugaskan";
    if (config.key === "jahit") return batch.penugasan?.jahit?.nama ?? "Belum ditugaskan";
    return batch.penugasan?.steam?.nama ?? "Belum ditugaskan";
  }

  function formatDate(ts: any): string {
    if (!ts) return "—";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  async function load(force = false) {
    loading = true;
    errorMsg = null;
    try {
      batchList = await batchCache.get(force);
    } catch {
      errorMsg = "Gagal memuat batch produksi.";
    } finally {
      loading = false;
    }
  }

  async function loadStock(force = false) {
    if (!config.stockTitle) return;
    stockLoading = true;
    try {
      stokPotonganList = await stokPotonganCache.get(force);
    } catch {
      stokPotonganList = [];
    } finally {
      stockLoading = false;
    }
  }

  async function refreshAll() {
    await Promise.all([load(true), loadStock(true)]);
  }

  // Otomatis sync semua batch CUTTING_DONE yang belum masuk stok_potongan
  async function autoSyncPending() {
    if (config.key !== 'cutting') return;
    const pending = batchList.filter(
      (b) => b.status === 'CUTTING_DONE' && !b.dari_potongan && !b.stok_potongan_synced
    );
    if (pending.length === 0) return;
    let synced = false;
    for (const b of pending) {
      try {
        await sinkronStokPotonganBatch(b.id);
        synced = true;
      } catch (e) {
        console.error('[auto-sync] Gagal sync batch', b.id, e);
      }
    }
    if (synced) {
      stokPotonganCache.invalidate();
      batchCache.invalidate();
      await refreshAll();
    }
  }

  afterNavigate(async () => {
    const tasks: Promise<unknown>[] = [load(), loadStock()];
    if (config.quickAction) tasks.push(karyawanCache.get().then((list) => { karyawanList = list; }));
    await Promise.all(tasks);
    await autoSyncPending();
  });
</script>

<div class="space-y-5">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-xl font-semibold text-gray-900">{config.title}</h1>
      <p class="mt-0.5 text-sm text-gray-500">{config.description}</p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if config.createMode && config.createButtonLabel}
        <ProductionCreateDialog
          mode={config.createMode}
          buttonLabel={config.createButtonLabel}
          onCreated={refreshAll}
        />
      {/if}
      {#if config.stockTitle}
        <Button variant="outline" onclick={() => goto("/stok-potongan")}>Lihat Stok Cutting</Button>
      {/if}
      <Button variant="outline" onclick={refreshAll}>
        <svg
          class="h-3.5 w-3.5 {loading || stockLoading ? 'animate-spin' : ''}"
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

  <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
    <StatCard
      title={config.readyLabel}
      value={readyCount}
      icon={ClipboardListIcon}
      footerSubtext="batch siap diproses"
      class={config.borderClass + " " + config.accentSoftClass}
      valueClass={config.textClass}
    />
    <StatCard
      title={config.workingLabel}
      value={inProgressCount}
      icon={LoaderIcon}
      footerSubtext="batch sedang dikerjakan"
    />
    {#if config.doneStatuses}
      <StatCard
        title={config.doneLabel ?? "Selesai"}
        value={doneCount}
        icon={CheckCircleIcon}
        footerSubtext="batch sudah selesai diproses"
        class={config.borderClass + " " + config.accentSoftClass}
        valueClass={config.textClass}
      />
    {:else}
      <StatCard
        title="PCS Aktif"
        value={totalPcs}
        icon={PackageIcon}
        footerSubtext="pcs yang masih berada di tahap ini"
      />
    {/if}
  </div>

  {#if config.stockTitle}
    <div class="rounded-xl border {config.borderClass} bg-white p-5 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-gray-900">{config.stockTitle}</p>
          <p class="mt-1 text-sm text-gray-500">{config.stockDescription}</p>
        </div>
        <div class="text-right">
          <p class="text-2xl font-semibold text-gray-900">{stockLoading ? "…" : stokPotonganPcs}</p>
          <p class="text-xs text-gray-400">{stokPotonganReady.length} jenis stok siap jahit</p>
        </div>
      </div>
    </div>
  {/if}

  <div class="rounded-xl border border-dashed {config.borderClass} {config.accentSoftClass} px-4 py-3 text-sm {config.textClass}">
    {config.detailHint}
  </div>

  <div class="relative max-w-sm">
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
      bind:value={searchQuery}
      placeholder="Cari nama model..."
      class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
    />
  </div>

  {#if errorMsg}
    <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {errorMsg}
    </div>
  {:else}
    <div class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      {#if loading}
        <div class="space-y-0">
          {#each Array(5) as _}
            <div class="flex items-center gap-4 border-b border-gray-50 px-5 py-4">
              <div class="h-4 w-44 animate-pulse rounded bg-gray-100"></div>
              <div class="h-4 w-20 animate-pulse rounded bg-gray-100"></div>
              <div class="h-4 w-24 animate-pulse rounded bg-gray-100"></div>
              <div class="h-4 w-20 animate-pulse rounded bg-gray-100"></div>
              <div class="ml-auto h-8 w-18 animate-pulse rounded bg-gray-100"></div>
            </div>
          {/each}
        </div>
      {:else if filteredBatches.length === 0}
        <div class="flex flex-col items-center justify-center gap-3 py-16">
          <div class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <ClipboardListIcon class="h-7 w-7 text-gray-300" />
          </div>
          <p class="text-sm font-medium text-gray-500">Belum ada batch di tahap ini</p>
          <p class="text-xs text-gray-400">Batch akan muncul otomatis saat statusnya masuk ke proses {config.key}</p>
        </div>
      {:else}
        <Table.Root>
          <Table.Header>
            <Table.Row class="bg-gray-50 hover:bg-gray-50">
              <Table.Head>Model</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head>Petugas</Table.Head>
              <Table.Head class="text-center">PCS</Table.Head>
              <Table.Head>Tanggal</Table.Head>
              <Table.Head></Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each filteredBatches as batch}
              {@const isDone = (config.doneStatuses ?? []).includes(batch.status)}
              {@const useQuick = config.quickAction && !isDone}
              <Table.Row
                class={isDone ? 'opacity-60 bg-gray-50/50' : 'cursor-pointer'}
                onclick={() => useQuick ? openQuickAction(batch) : (!isDone && goto(`/order-produksi/${batch.id}?from=/produksi/${config.key}`))}
                tabindex={isDone ? undefined : 0}
                onkeydown={(event) => event.key === "Enter" && (useQuick ? openQuickAction(batch) : (!isDone && goto(`/order-produksi/${batch.id}?from=/produksi/${config.key}`)))}
              >
                <Table.Cell>
                  <div class="space-y-1">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-medium text-gray-800">{batch.nama_model}</p>
                      {#if batch.nama_warna}
                        <span class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
                          <span class="inline-block h-2 w-2 rounded-full" style="background-color: {batch.kode_hex_warna}"></span>
                          {batch.nama_warna}
                        </span>
                      {/if}
                    </div>
                    <div class="flex flex-wrap gap-1">
                      {#each batch.detail_ukuran as ukuran}
                        <span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                          {ukuran.ukuran}: {ukuran.jumlah_pcs}
                        </span>
                      {/each}
                    </div>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold {STATUS_STYLE[batch.status]}">
                    {STATUS_LABEL[batch.status]}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <p class="text-sm text-gray-700">{getAssignedWorker(batch)}</p>
                </Table.Cell>
                <Table.Cell class="text-center">
                  <p class="text-sm font-semibold text-gray-800">{batch.pcs_saat_ini ?? batch.total_pcs}</p>
                  <p class="text-xs text-gray-400">pcs</p>
                </Table.Cell>
                <Table.Cell>
                  <p class="text-xs text-gray-600">{formatDate(batch.createdAt)}</p>
                </Table.Cell>
                <Table.Cell class="text-right">
                  <Button
                    variant={useQuick ? "default" : "outline"}
                    size="sm"
                    onclick={(e: MouseEvent) => { e.stopPropagation(); useQuick ? openQuickAction(batch) : goto(`/order-produksi/${batch.id}?from=/produksi/${config.key}`); }}
                  >
                    {useQuick ? (batch.status === "JAHIT_DONE" ? "Mulai Steam" : "Selesaikan") : "Detail"}

                  </Button>
                  {#if useQuick}
                    <Button
                      variant="outline"
                      size="sm"
                      class="ml-1"
                      onclick={(e: MouseEvent) => { e.stopPropagation(); goto(`/order-produksi/${batch.id}?from=/produksi/${config.key}`); }}
                    >
                      Detail
                    </Button>
                  {/if}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      {/if}
    </div>
  {/if}
</div>

{#if config.quickAction}
<Dialog.Root bind:open={quickOpen}>
  <Dialog.Content class="max-w-md">
    {#if quickBatch}
      <Dialog.Header>
        <Dialog.Title>
          {quickNextStatus === "STEAM_IN_PROGRESS" ? "Mulai Steam" : "Selesaikan Steam & Kirim ke Barang Jadi"}
        </Dialog.Title>
        <Dialog.Description>
          <span class="font-medium text-gray-800">{quickBatch.nama_model}</span>
          {#if quickBatch.nama_warna}
            · <span class="text-gray-600">{quickBatch.nama_warna}</span>
          {/if}
          · {quickBatch.pcs_saat_ini ?? quickBatch.total_pcs} pcs
          {#if quickNextStatus === "STEAM_DONE"}
            <span class="mt-1 block text-xs text-emerald-600">Batch akan langsung diselesaikan dan masuk ke stok barang jadi.</span>
          {/if}
        </Dialog.Description>
      </Dialog.Header>

      <div class="space-y-4 py-2">
        <!-- Ukuran detail -->
        <div class="flex flex-wrap gap-1">
          {#each quickBatch.detail_ukuran as ukuran}
            <span class="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {ukuran.ukuran}: {ukuran.jumlah_pcs}
            </span>
          {/each}
        </div>

        {#if quickNeedsWorker}
          <!-- Pilih petugas steam -->
          <div class="space-y-1.5">
            <p class="text-sm font-medium text-gray-700">Petugas Steam</p>
            {#if quickWorkers.length === 0}
              <p class="text-xs text-amber-600">Belum ada akun Kepala Steam di sistem.</p>
            {:else}
              <Select.Root
                type="single"
                value={quickWorkerUid || undefined}
                onValueChange={(val) => { quickWorkerUid = val ?? ""; }}
              >
                <Select.Trigger class="w-full">
                  {#if quickWorkerUid}
                    <span>{quickWorkers.find((k) => k.uid === quickWorkerUid)?.name ?? "—"}</span>
                  {:else}
                    <span class="text-muted-foreground">— Pilih petugas —</span>
                  {/if}
                </Select.Trigger>
                <Select.Content preventScroll={false}>
                  {#each quickWorkers as k}
                    <Select.Item value={k.uid}>{k.name}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            {/if}
          </div>
        {/if}

        {#if quickNeedsPcs}
          <!-- Input PCS selesai steam -->
          {@const maxPcs = quickBatch.pcs_saat_ini ?? quickBatch.total_pcs}
          <div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Stok saat ini: <strong class="text-gray-800">{maxPcs} pcs</strong>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label for="quick-pcs-berhasil" class="text-sm font-medium text-gray-700">PCS Berhasil</label>
              <Input
                id="quick-pcs-berhasil"
                type="number"
                min="0"
                max={maxPcs}
                bind:value={quickPcsBerhasil}
                placeholder="0"
              />
            </div>
            <div class="space-y-1.5">
              <label for="quick-pcs-reject" class="text-sm font-medium text-gray-700">PCS Reject</label>
              <Input
                id="quick-pcs-reject"
                type="number"
                min="0"
                max={maxPcs}
                bind:value={quickPcsReject}
                placeholder="0"
              />
            </div>
          </div>
          {#if quickPcsBerhasil + quickPcsReject > maxPcs}
            <p class="text-xs text-red-500">Total melebihi stok saat ini ({maxPcs} pcs)</p>
          {/if}
        {/if}

        {#if quickError}
          <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{quickError}</p>
        {/if}
      </div>

      <Dialog.Footer class="gap-2">
        <Button variant="outline" onclick={() => { quickOpen = false; }} disabled={quickSaving}>
          Batal
        </Button>
        <Button
          class="bg-emerald-600 hover:bg-emerald-700 text-white"
          onclick={submitQuickAction}
          disabled={quickSaving || !quickFormValid}
        >
          {#if quickSaving}
            <LoaderIcon class="mr-2 h-4 w-4 animate-spin" />
            Menyimpan...
          {:else}
            {quickNextStatus === "STEAM_IN_PROGRESS" ? "Mulai Steam" : "Selesaikan & Kirim ke Barang Jadi"}
          {/if}
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
{/if}
