<script lang="ts">
  import { createBatchProduksi, createBatchDariPotongan } from "$lib/firebase/batch-produksi";
  import { getKaryawanList } from "$lib/firebase/karyawan";
  import { getStokPotonganByModel } from "$lib/firebase/stok-potongan";
  import { modelBajuCache, stokPotonganCache } from "$lib/stores/data-cache.svelte";
  import { currentUser } from "$lib/stores/auth.store";
  import {
    UKURAN_ORDER,
    type ModelBaju,
    type StokPotongan,
    type UkuranBaju,
    type UserProfile,
    type UserRole,
  } from "$lib/types";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button";

  let {
    mode,
    buttonLabel,
    onCreated,
  }: {
    mode: "cutting" | "jahit";
    buttonLabel: string;
    onCreated?: () => void | Promise<void>;
  } = $props();

  let open = $state(false);
  let modelList = $state<ModelBaju[]>([]);
  let loadingModels = $state(false);
  let loadingWorkers = $state(false);
  let loadingStock = $state(false);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);

  let fModelId = $state("");
  let fCatatan = $state("");
  let fPenugasanUid = $state("");
  let fJumlah = $state<Partial<Record<UkuranBaju, number>>>({});
  let stokPotonganModel = $state<StokPotongan[]>([]);
  let workerList = $state<UserProfile[]>([]);

  let rolePenugasan = $derived<UserRole>(
    mode === "cutting" ? "kepala_cutting" : "kepala_jahit",
  );
  let penugasanLabel = $derived(
    mode === "cutting" ? "Kepala Cutting" : "Kepala Jahit",
  );
  let filteredWorkers = $derived(workerList.filter((worker) => worker.role === rolePenugasan));
  let selectedModel = $derived(modelList.find((model) => model.id === fModelId) ?? null);
  let detailUkuran = $derived(
    selectedModel
      ? UKURAN_ORDER.filter(
          (ukuran) =>
            selectedModel.ukuran_tersedia.includes(ukuran) && (fJumlah[ukuran] ?? 0) > 0,
        ).map((ukuran) => ({ ukuran, jumlah_pcs: fJumlah[ukuran]! }))
      : [],
  );
  let totalPcs = $derived(detailUkuran.reduce((sum, item) => sum + item.jumlah_pcs, 0));
  let kainDibutuhkan = $derived(
    selectedModel && totalPcs > 0
      ? (
          (selectedModel.kebutuhan_kain?.length ?? 0) > 0
            ? selectedModel.kebutuhan_kain!
            : ((selectedModel as any).varian_warna?.[0]?.kebutuhan_kain ?? [])
        ).map((kain: typeof selectedModel.kebutuhan_kain[0]) => ({
          kain_id: kain.kain_id,
          nama_kain: kain.nama_kain,
          satuan: kain.satuan,
          jumlah_dipakai: parseFloat(
            detailUkuran
              .reduce(
                (sum, item) =>
                  sum + ((kain.jumlah_per_ukuran ?? {})[item.ukuran] ?? 0) * item.jumlah_pcs,
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
      (
        mode !== "jahit" ||
        detailUkuran.every((item) => {
          const stok = stokPotonganModel.find((entry) => entry.ukuran === item.ukuran);
          return stok && stok.stok_tersedia >= item.jumlah_pcs;
        })
      ) &&
      fPenugasanUid !== "",
  );

  // Ambil label warna gabungan untuk sebuah model, misal "Abu · Navy"
  function warnaLabel(model: ModelBaju): string {
    return (model.warna_tersedia ?? []).map((w) => w.nama_warna).join(" · ");
  }

  async function loadModels() {
    loadingModels = true;
    try {
      const allModels = await modelBajuCache.get();
      modelList = allModels.filter((model) => model.aktif);
    } finally {
      loadingModels = false;
    }
  }

  async function loadWorkers() {
    loadingWorkers = true;
    try {
      workerList = await getKaryawanList();
    } finally {
      loadingWorkers = false;
    }
  }

  async function loadPotongan(modelId: string) {
    if (mode !== "jahit" || !modelId) {
      stokPotonganModel = [];
      return;
    }
    loadingStock = true;
    try {
      stokPotonganModel = await getStokPotonganByModel(modelId);
    } catch {
      stokPotonganModel = [];
    } finally {
      loadingStock = false;
    }
  }

  async function onOpenChange(nextOpen: boolean) {
    open = nextOpen;
    if (!nextOpen) return;
    fModelId = "";
    fCatatan = "";
    fPenugasanUid = "";
    fJumlah = {};
    stokPotonganModel = [];
    errorMsg = null;
    await Promise.all([loadModels(), loadWorkers()]);
  }

  async function onModelChange(value: string) {
    fModelId = value;
    fJumlah = {};
    errorMsg = null;
    await loadPotongan(value);
  }

  async function submit() {
    if (!$currentUser || !selectedModel || !canSubmit) return;

    saving = true;
    errorMsg = null;
    try {
      const warnas = selectedModel.warna_tersedia ?? [];
      const inputData = {
        model_id: fModelId,
        nama_model: selectedModel.nama_model,
        // Simpan info warna kombinasi ke batch jika model punya warna
        ...(warnas.length > 0
          ? {
              nama_warna: warnas.map((w) => w.nama_warna).join(", "),
              kode_hex_warna: warnas[0].kode_hex,
            }
          : {}),
        detail_ukuran: detailUkuran,
        kain_digunakan: kainDibutuhkan,
        penugasan: {
          [mode]: {
            uid: fPenugasanUid,
            nama: filteredWorkers.find((worker) => worker.uid === fPenugasanUid)?.name ?? "",
          },
        },
        ...(fCatatan.trim() ? { catatan_admin: fCatatan.trim() } : {}),
      };

      if (mode === "jahit") {
        await createBatchDariPotongan(inputData, $currentUser.uid);
        stokPotonganCache.invalidate();
      } else {
        await createBatchProduksi(inputData, $currentUser.uid);
      }

      open = false;
      await onCreated?.();
    } catch (error: any) {
      errorMsg = error?.message ?? "Gagal membuat order produksi.";
    } finally {
      saving = false;
    }
  }
</script>

<Dialog.Root bind:open onOpenChange={onOpenChange}>
  <Dialog.Trigger>
    {#snippet child({ props })}
      <Button {...props}>{buttonLabel}</Button>
    {/snippet}
  </Dialog.Trigger>

  <Dialog.Content class="flex max-h-[90vh] max-w-md flex-col gap-0 p-0">
    <Dialog.Header class="shrink-0 px-6 pt-6 pb-2">
      <Dialog.Title>{buttonLabel}</Dialog.Title>
      <Dialog.Description>
        {#if mode === "cutting"}
          Buat batch baru untuk proses cutting.
        {:else}
          Buat batch jahit dari stok cutting yang sudah tersedia.
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex-1 overflow-y-auto px-6 py-5">
      <div class="space-y-5">
        {#if errorMsg}
          <div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </div>
        {/if}

        <div>
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="model-select-stage">
            Model Baju <span class="text-red-500">*</span>
          </label>
          {#if loadingModels}
            <p class="text-xs text-gray-400">Memuat model...</p>
          {:else if modelList.length === 0}
            <p class="text-xs text-gray-400">Belum ada model aktif.</p>
          {:else}
            <Select.Root
              type="single"
              value={fModelId || undefined}
              onValueChange={(value) => onModelChange(value ?? "")}
            >
              <Select.Trigger class="w-full">
                {#if selectedModel}
                  <!-- Trigger: nama model + dot warna + label warna -->
                  <span class="flex items-center gap-1.5 truncate">
                    <span>{selectedModel.nama_model}</span>
                    {#each selectedModel.warna_tersedia ?? [] as w, i}
                      {#if i === 0}
                        <span class="text-gray-300">·</span>
                      {/if}
                      <span
                        class="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                        style="background:{w.kode_hex}"
                      ></span>
                      <span class="text-gray-500">{w.nama_warna}</span>
                      {#if i < (selectedModel.warna_tersedia?.length ?? 0) - 1}
                        <span class="text-gray-300">·</span>
                      {/if}
                    {/each}
                  </span>
                {:else}
                  <span class="text-muted-foreground">— Pilih model —</span>
                {/if}
              </Select.Trigger>
              <Select.Content preventScroll={false}>
                {#each modelList as model}
                  <Select.Item value={model.id}>
                    <!-- Item: nama model + dot warna + label warna -->
                    <span class="flex items-center gap-1.5">
                      <span>{model.nama_model}</span>
                      {#each model.warna_tersedia ?? [] as w, i}
                        {#if i === 0}
                          <span class="text-gray-300">·</span>
                        {/if}
                        <span
                          class="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                          style="background:{w.kode_hex}"
                        ></span>
                        <span class="text-gray-400 text-xs">{w.nama_warna}</span>
                        {#if i < (model.warna_tersedia?.length ?? 0) - 1}
                          <span class="text-gray-300">·</span>
                        {/if}
                      {/each}
                    </span>
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          {/if}
        </div>

        <div>
          <label class="mb-1.5 block text-sm font-medium text-gray-700">
            {penugasanLabel} <span class="text-red-500">*</span>
          </label>
          {#if loadingWorkers}
            <p class="text-xs text-gray-400">Memuat petugas...</p>
          {:else if filteredWorkers.length === 0}
            <p class="text-xs text-red-600">Belum ada akun {penugasanLabel} di sistem.</p>
          {:else}
            <Select.Root
              type="single"
              value={fPenugasanUid || undefined}
              onValueChange={(value) => { fPenugasanUid = value ?? ""; }}
            >
              <Select.Trigger class="w-full">
                {#if fPenugasanUid}
                  <span>{filteredWorkers.find((worker) => worker.uid === fPenugasanUid)?.name ?? "—"}</span>
                {:else}
                  <span class="text-muted-foreground">— Pilih petugas —</span>
                {/if}
              </Select.Trigger>
              <Select.Content preventScroll={false}>
                {#each filteredWorkers as worker}
                  <Select.Item value={worker.uid}>{worker.name}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          {/if}
        </div>

        {#if selectedModel}
          <div>
            <p class="mb-2 text-sm font-medium text-gray-700">
              Jumlah Per Ukuran <span class="text-red-500">*</span>
            </p>
            <div class="flex flex-wrap gap-2">
              {#each UKURAN_ORDER.filter((ukuran) => selectedModel.ukuran_tersedia.includes(ukuran)) as ukuran}
                {@const stokUkuran = mode === "jahit" ? (stokPotonganModel.find((s) => s.ukuran === ukuran)?.stok_tersedia ?? 0) : null}
                {@const diminta = fJumlah[ukuran] ?? 0}
                {@const kurang = mode === "jahit" && stokUkuran !== null && diminta > stokUkuran}
                <div class="w-16 text-center">
                  <label class="mb-1 block text-xs font-semibold text-gray-600" for={"ukuran-" + mode + "-" + ukuran}>
                    {ukuran}
                  </label>
                  <input
                    id={"ukuran-" + mode + "-" + ukuran}
                    type="number"
                    min="0"
                    placeholder="0"
                    bind:value={fJumlah[ukuran]}
                    class="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 py-1 text-center text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] {kurang ? 'border-red-400 bg-red-50' : ''}"
                  />
                  {#if mode === "jahit" && stokUkuran !== null}
                    <p class="mt-0.5 text-[10px] {kurang ? 'font-semibold text-red-500' : 'text-gray-400'}">
                      stok: {stokUkuran}
                    </p>
                  {/if}
                </div>
              {/each}
            </div>
            <div class="mt-2 flex items-center justify-between">
              {#if totalPcs > 0}
                <p class="text-xs text-gray-500">
                  Total: <span class="font-semibold text-gray-800">{totalPcs} pcs</span>
                </p>
              {:else}
                <span></span>
              {/if}
              {#if mode === "jahit" && totalPcs > 0 && !detailUkuran.every((item) => { const s = stokPotonganModel.find((e) => e.ukuran === item.ukuran); return s && s.stok_tersedia >= item.jumlah_pcs; })}
                <p class="text-xs font-medium text-red-500">Stok cutting tidak mencukupi</p>
              {/if}
            </div>
          </div>

          {#if mode === "jahit" && loadingStock}
            <p class="text-xs text-blue-500">Memuat stok cutting...</p>
          {:else if mode === "jahit" && stokPotonganModel.length === 0 && fModelId}
            <p class="text-xs text-red-600">Tidak ada stok cutting untuk model ini.</p>
          {:else if mode !== "jahit" && kainDibutuhkan.length > 0}
            <div class="rounded-xl border border-amber-100 bg-amber-50 p-4">
              <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-700">
                Kain yang Dibutuhkan
              </p>
              <div class="space-y-1.5">
                {#each kainDibutuhkan as kain}
                  <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-700">{kain.nama_kain}</span>
                    <span class="font-semibold text-amber-800">{kain.jumlah_dipakai} {kain.satuan}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        {/if}

        <div>
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for={"catatan-" + mode}>
            Catatan <span class="text-xs font-normal text-gray-400">(opsional)</span>
          </label>
          <textarea
            id={"catatan-" + mode}
            rows="3"
            bind:value={fCatatan}
            placeholder="Catatan tambahan..."
            class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
          ></textarea>
        </div>
      </div>
    </div>

    <Dialog.Footer class="shrink-0 gap-2 border-t border-gray-100 px-6 py-4">
      <Button variant="outline" class="flex-1" onclick={() => (open = false)}>Batal</Button>
      <Button onclick={submit} disabled={saving || !canSubmit} class="flex-1">
        {saving ? "Menyimpan..." : buttonLabel}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
