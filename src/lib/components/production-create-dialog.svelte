<script lang="ts">
  import { createBatchProduksi, createBatchDariPotongan } from "$lib/firebase/batch-produksi";
  import { getKaryawanList } from "$lib/firebase/karyawan";
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

  type StokPotonganGroup = {
    key: string;
    model_id: string;
    nama_model: string;
    nama_warna?: string;
    kode_hex_warna?: string;
    items: StokPotongan[];
    ukuran_tersedia: UkuranBaju[];
  };

  let open = $state(false);
  let modelList = $state<ModelBaju[]>([]);
  let loadingModels = $state(false);
  let loadingWorkers = $state(false);
  let loadingStock = $state(false);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);

  let fModelId = $state("");
  let fPotonganKey = $state("");
  let fWarnaId = $state("");
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
  let stokPotonganGroups = $derived.by(() => {
    const map = new Map<string, StokPotonganGroup>();

    for (const item of stokPotonganModel) {
      if (item.stok_tersedia <= 0) continue;
      const key = `${item.model_id}__${item.nama_warna ?? ""}`;
      const group = map.get(key);

      if (group) {
        group.items.push(item);
        group.ukuran_tersedia = UKURAN_ORDER.filter((ukuran) =>
          group.items.some((stok) => stok.ukuran === ukuran && stok.stok_tersedia > 0),
        );
      } else {
        map.set(key, {
          key,
          model_id: item.model_id,
          nama_model: item.nama_model,
          nama_warna: item.nama_warna,
          kode_hex_warna: item.kode_hex_warna,
          items: [item],
          ukuran_tersedia: [item.ukuran],
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const byModel = a.nama_model.localeCompare(b.nama_model);
      if (byModel !== 0) return byModel;
      return (a.nama_warna ?? "").localeCompare(b.nama_warna ?? "");
    });
  });
  let selectedPotonganGroup = $derived(
    stokPotonganGroups.find((group) => group.key === fPotonganKey) ?? null,
  );
  let selectedWarna = $derived(
    mode === "jahit"
      ? selectedPotonganGroup?.nama_warna
        ? {
            warna_id: fPotonganKey,
            nama_warna: selectedPotonganGroup.nama_warna,
            kode_hex: selectedPotonganGroup.kode_hex_warna ?? "",
          }
        : null
      : selectedModel?.warna_tersedia?.find((warna) => warna.warna_id === fWarnaId) ?? null,
  );
  let selectedNamaModel = $derived(
    mode === "jahit" ? selectedPotonganGroup?.nama_model : selectedModel?.nama_model,
  );
  let warnaKey = $derived(
    selectedWarna?.nama_warna ?? "",
  );
  // Stok potongan yang relevan untuk model+warna yang dipilih
  let stokPotonganFiltered = $derived(
    mode === "jahit"
      ? selectedPotonganGroup?.items ?? []
      : warnaKey
        ? stokPotonganModel.filter((s) => s.nama_warna === warnaKey)
        : stokPotonganModel.filter((s) => !s.nama_warna)
  );
  let ukuranTersedia = $derived(
    mode === "jahit"
      ? selectedPotonganGroup?.ukuran_tersedia ?? []
      : selectedModel?.ukuran_tersedia ?? []
  );

  let detailUkuran = $derived(
    selectedNamaModel
      ? UKURAN_ORDER.filter(
          (ukuran) =>
            ukuranTersedia.includes(ukuran) && (fJumlah[ukuran] ?? 0) > 0,
        ).map((ukuran) => ({ ukuran, jumlah_pcs: fJumlah[ukuran]! }))
      : [],
  );
  let totalPcs = $derived(detailUkuran.reduce((sum, item) => sum + item.jumlah_pcs, 0));
  let kainDibutuhkan = $derived(
    mode === "cutting" && selectedModel && totalPcs > 0
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
    (mode === "jahit" ? !!selectedPotonganGroup : fModelId !== "") &&
      (mode === "jahit" || ((selectedModel?.warna_tersedia?.length ?? 0) === 0 || fWarnaId !== "")) &&
      totalPcs > 0 &&
      (
        mode !== "jahit" ||
        detailUkuran.every((item) => {
          const stok = stokPotonganFiltered.find((entry) => entry.ukuran === item.ukuran);
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

  async function loadReadyPotongan() {
    loadingStock = true;
    try {
      stokPotonganModel = await stokPotonganCache.get();
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
    fPotonganKey = "";
    fWarnaId = "";
    fCatatan = "";
    fPenugasanUid = "";
    fJumlah = {};
    stokPotonganModel = [];
    errorMsg = null;
    await Promise.all([mode === "jahit" ? loadReadyPotongan() : loadModels(), loadWorkers()]);
  }

  async function onModelChange(value: string) {
    fModelId = value;
    const model = modelList.find((item) => item.id === value) ?? null;
    const warnas = model?.warna_tersedia ?? [];
    fWarnaId = warnas.length === 1 ? warnas[0].warna_id : "";
    fJumlah = {};
    errorMsg = null;
    stokPotonganModel = [];
  }

  function onPotonganChange(value: string) {
    fPotonganKey = value;
    const group = stokPotonganGroups.find((item) => item.key === value) ?? null;
    fModelId = group?.model_id ?? "";
    fWarnaId = group?.key ?? "";
    fJumlah = {};
    errorMsg = null;
  }

  async function submit() {
    if (!$currentUser || !selectedNamaModel || !canSubmit) return;

    saving = true;
    errorMsg = null;
    try {
      const inputData = {
        model_id: mode === "jahit" ? selectedPotonganGroup!.model_id : fModelId,
        nama_model: selectedNamaModel,
        ...(selectedWarna
          ? {
              nama_warna: selectedWarna.nama_warna,
              kode_hex_warna: selectedWarna.kode_hex,
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
            {mode === "jahit" ? "Stok Cutting" : "Model Baju"} <span class="text-red-500">*</span>
          </label>
          {#if mode === "jahit" ? loadingStock : loadingModels}
            <p class="text-xs text-gray-400">
              {mode === "jahit" ? "Memuat stok cutting..." : "Memuat model..."}
            </p>
          {:else if mode === "jahit" ? stokPotonganGroups.length === 0 : modelList.length === 0}
            <p class="text-xs text-gray-400">
              {mode === "jahit" ? "Belum ada stok cutting yang siap dijahit." : "Belum ada model aktif."}
            </p>
          {:else}
            <Select.Root
              type="single"
              value={(mode === "jahit" ? fPotonganKey : fModelId) || undefined}
              onValueChange={(value) => {
                if (mode === "jahit") {
                  onPotonganChange(value ?? "");
                } else {
                  onModelChange(value ?? "");
                }
              }}
            >
              <Select.Trigger class="h-auto min-h-9 w-full min-w-0">
                {#if selectedNamaModel}
                  <!-- Trigger: nama model + dot warna + label warna -->
                  <span class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden [&>*:not(:first-child)]:hidden">
                    <span class="truncate">
                      {mode === "jahit" && selectedPotonganGroup?.nama_warna
                        ? `${selectedNamaModel} - ${selectedPotonganGroup.nama_warna}`
                        : selectedNamaModel}
                    </span>
                    {#if mode === "cutting" && selectedModel}
                    {#each selectedModel.warna_tersedia ?? [] as w, i}
                      {#if i === 0}
                        <span class="hidden text-gray-300">·</span>
                      {/if}
                      <span
                        class="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                        style="background:{w.kode_hex}"
                      ></span>
                      <span class="hidden text-gray-500">{w.nama_warna}</span>
                      {#if i < (selectedModel.warna_tersedia?.length ?? 0) - 1}
                        <span class="hidden text-gray-300">·</span>
                      {/if}
                    {/each}
                    {/if}
                  </span>
                {:else}
                  <span class="text-muted-foreground">
                    {mode === "jahit" ? "- Pilih stok cutting -" : "— Pilih model —"}
                  </span>
                {/if}
              </Select.Trigger>
              <Select.Content class="w-[--bits-select-anchor-width] max-w-[--bits-select-anchor-width]" preventScroll={false}>
                {#if mode === "jahit"}
                  {#each stokPotonganGroups as group}
                    <Select.Item value={group.key} class="overflow-hidden">
                      <span class="flex min-w-0 items-center gap-2">
                        {#if group.nama_warna}
                          <span
                            class="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                            style="background:{group.kode_hex_warna}"
                          ></span>
                        {/if}
                        <span class="truncate">
                          {group.nama_model}
                          {group.nama_warna ? ` - ${group.nama_warna}` : ""}
                        </span>
                        <span class="ml-auto shrink-0 text-xs text-gray-400">
                          {group.items.reduce((sum, item) => sum + item.stok_tersedia, 0)} pcs
                        </span>
                      </span>
                    </Select.Item>
                  {/each}
                {:else}
                {#each modelList as model}
                  <Select.Item value={model.id} class="overflow-hidden">
                    <!-- Item: nama model + dot warna + label warna -->
                    <span class="flex min-w-0 items-center overflow-hidden [&>*:not(:first-child)]:hidden">
                      <span class="truncate">{model.nama_model}</span>
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
                {/if}
              </Select.Content>
            </Select.Root>
          {/if}
        </div>

        {#if mode === "cutting" && selectedModel && (selectedModel.warna_tersedia?.length ?? 0) > 0}
          <div>
            <p class="mb-1.5 block text-sm font-medium text-gray-700">
              Warna Produksi <span class="text-red-500">*</span>
            </p>
            <Select.Root
              type="single"
              value={fWarnaId || undefined}
              onValueChange={(value) => {
                fWarnaId = value ?? "";
                fJumlah = {};
                errorMsg = null;
              }}
            >
              <Select.Trigger class="w-full">
                {#if selectedWarna}
                  <span class="flex items-center gap-1.5 truncate">
                    <span
                      class="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                      style="background:{selectedWarna.kode_hex}"
                    ></span>
                    <span>{selectedWarna.nama_warna}</span>
                  </span>
                {:else}
                  <span class="text-muted-foreground">- Pilih warna -</span>
                {/if}
              </Select.Trigger>
              <Select.Content preventScroll={false}>
                {#each selectedModel?.warna_tersedia ?? [] as warna}
                  <Select.Item value={warna.warna_id}>
                    <span class="flex items-center gap-1.5">
                      <span
                        class="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                        style="background:{warna.kode_hex}"
                      ></span>
                      <span>{warna.nama_warna}</span>
                    </span>
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        {/if}

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

        {#if selectedNamaModel}
          <div>
            <p class="mb-2 text-sm font-medium text-gray-700">
              Jumlah Per Ukuran <span class="text-red-500">*</span>
            </p>
            <div class="flex flex-wrap gap-2">
              {#each UKURAN_ORDER.filter((ukuran) => ukuranTersedia.includes(ukuran)) as ukuran}
                {@const stokUkuran = mode === "jahit" ? (stokPotonganFiltered.find((s) => s.ukuran === ukuran)?.stok_tersedia ?? 0) : null}
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
              {#if mode === "jahit" && totalPcs > 0 && !detailUkuran.every((item) => { const s = stokPotonganFiltered.find((e) => e.ukuran === item.ukuran); return s && s.stok_tersedia >= item.jumlah_pcs; })}
                <p class="text-xs font-medium text-red-500">Stok cutting tidak mencukupi</p>
              {/if}
            </div>
          </div>

          {#if mode === "jahit" && loadingStock}
            <p class="text-xs text-blue-500">Memuat stok cutting...</p>
          {:else if mode === "jahit" && stokPotonganFiltered.length === 0 && fModelId}
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
