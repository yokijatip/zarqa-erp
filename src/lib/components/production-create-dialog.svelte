<script lang="ts">
  import {
    createBatchProduksi,
    createBatchDariPotongan,
  } from "$lib/firebase/batch-produksi";
  import { getKaryawanList } from "$lib/firebase/karyawan";
  import {
    batchCache,
    modelBajuCache,
    stokPotonganCache,
    stokKainCache,
  } from "$lib/stores/data-cache.svelte";
  import { currentUser } from "$lib/stores/auth.store";
  import {
    UKURAN_ORDER,
    canonicalUkuran,
    type BatchProduksi,
    type ModelBaju,
    type SumberCutting,
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
  let fUkuran = $state<UkuranBaju | "">("");
  let fCatatan = $state("");
  let fPenugasanUid = $state("");
  let fKain = $state<
    {
      kain_id: string;
      jenis_kain: string;
      nama_kain: string;
      satuan: "yard" | "kg";
      jumlah_dipakai: string;
      /** Kebutuhan kain ini sendiri untuk 1 pcs (yard/pcs) — tiap kain punya rasio masing-masing */
      yard_per_pcs: string;
    }[]
  >([]);
  let stokPotonganModel = $state<StokPotongan[]>([]);
  let batchList = $state<BatchProduksi[]>([]);
  let workerList = $state<UserProfile[]>([]);
  let stokKainList = $state<
    Array<{
      id: string;
      nama_kain: string;
      satuan: "yard" | "kg";
      stok_tersedia: number;
      nama_warna?: string;
      kode_hex_warna?: string;
    }>
  >([]);

  let rolePenugasan = $derived<UserRole>(
    mode === "cutting" ? "kepala_cutting" : "kepala_jahit",
  );
  let penugasanLabel = $derived(
    mode === "cutting" ? "Kepala Cutting" : "Kepala Jahit",
  );
  let filteredWorkers = $derived(
    workerList.filter((worker) => worker.role === rolePenugasan),
  );
  let selectedModel = $derived(
    modelList.find((model) => model.id === fModelId) ?? null,
  );
  let selectedModelUkuran = $derived(
    [...new Set((selectedModel?.ukuran_tersedia ?? []).map((ukuran) => canonicalUkuran(ukuran)))],
  );
  let stokPotonganGroups = $derived.by(() => {
    const map = new Map<string, StokPotonganGroup>();

    for (const item of stokPotonganModel) {
      if (item.stok_tersedia <= 0) continue;
      const key = `${item.model_id}__${item.nama_warna ?? ""}`;
      const group = map.get(key);

      if (group) {
        group.items.push(item);
        group.ukuran_tersedia = UKURAN_ORDER.filter((ukuran) =>
          group.items.some(
            (stok) => stok.ukuran === ukuran && stok.stok_tersedia > 0,
          ),
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
      : (selectedModel?.warna_tersedia?.find(
          (warna) => warna.warna_id === fWarnaId,
        ) ?? null),
  );
  let selectedNamaModel = $derived(
    mode === "jahit"
      ? selectedPotonganGroup?.nama_model
      : selectedModel?.nama_model,
  );
  // Stok potongan yang relevan untuk model+warna yang dipilih
  let stokPotonganFiltered = $derived(
    mode === "jahit"
      ? (selectedPotonganGroup?.items ?? [])
      : selectedWarna
        ? stokPotonganModel.filter(
            (s) => s.nama_warna === selectedWarna.nama_warna,
          )
        : stokPotonganModel.filter((s) => !s.nama_warna),
  );
  let ukuranTersedia = $derived(
    mode === "jahit"
      ? (selectedPotonganGroup?.ukuran_tersedia ?? [])
      : selectedModelUkuran,
  );

  let stokKainGroups = $derived.by(() => {
    const map = new Map<string, typeof stokKainList>();
    for (const kain of stokKainList) {
      const list = map.get(kain.nama_kain) ?? [];
      list.push(kain);
      map.set(kain.nama_kain, list);
    }
    return Array.from(map.entries())
      .map(([nama_kain, items]) => ({
        nama_kain,
        total: items.reduce((sum, item) => sum + item.stok_tersedia, 0),
        items: [...items].sort((a, b) =>
          (a.nama_warna ?? "").localeCompare(b.nama_warna ?? ""),
        ),
      }))
      .sort((a, b) => a.nama_kain.localeCompare(b.nama_kain));
  });

  function stokKainByJenis(namaKain: string) {
    return stokKainGroups.find((group) => group.nama_kain === namaKain)?.items ?? [];
  }

  function defaultYardPerPcs(ukuran = fUkuran): string {
    if (!selectedModel || !ukuran) return "";
    const value = selectedModel.kebutuhan_yard_per_pcs?.[ukuran as UkuranBaju];
    return value && value > 0 ? String(value) : "";
  }

  function applyDefaultYardPerPcs() {
    const value = defaultYardPerPcs();
    fKain = fKain.map((k) => ({ ...k, yard_per_pcs: value }));
  }

  function updateKainField(
    index: number,
    field: "jumlah_dipakai" | "yard_per_pcs",
    value: string,
  ) {
    fKain = fKain.map((kain, currentIndex) =>
      currentIndex === index ? { ...kain, [field]: value } : kain,
    );
  }

  // Total yard kain yang dipakai (sum dari semua kain entry) — hanya info,
  // tidak dipakai lagi untuk kalkulasi pcs jadi (lihat perKainEstimasi).
  let totalYardDipakai = $derived(
    fKain.reduce((sum, k) => sum + (parseFloat(k.jumlah_dipakai) || 0), 0),
  );

  // Estimasi pcs per kain — tiap kain punya rasio "1 pcs = ? yard" sendiri,
  // TIDAK digabung dengan kain lain. Contoh: kain utama 120 yard @2.4/pcs = 50 pcs,
  // kain kedua 240 yard @4.8/pcs = 50 pcs juga — bukan (120+240)/2.4.
  type KainEstimasi = {
    index: number;
    nama: string;
    pcs: number;
    sisa: number;
  };
  let perKainEstimasi = $derived(
    fKain.reduce<KainEstimasi[]>((acc, k, i) => {
      const yard = parseFloat(k.jumlah_dipakai) || 0;
      const rasio = parseFloat(k.yard_per_pcs) || 0;
      if (yard > 0 && rasio > 0) {
        const pcs = Math.floor(yard / rasio);
        acc.push({
          index: i,
          nama: k.nama_kain || `Kain #${i + 1}`,
          pcs,
          sisa: yard - pcs * rasio,
        });
      }
      return acc;
    }, []),
  );

  // Pcs jadi ditentukan oleh kain yang paling cepat habis (bottleneck),
  // bukan seluruh kain harus lengkap diisi untuk mulai menghitung.
  let jumlahJadi = $derived(() =>
    perKainEstimasi.length > 0
      ? Math.min(...perKainEstimasi.map((e) => e.pcs))
      : 0,
  );

  // Kain yang jadi pembatas (paling cepat habis) — dipakai untuk info "sisa"
  let kainPembatas = $derived(() =>
    perKainEstimasi.length > 0
      ? perKainEstimasi.reduce((min, e) => (e.pcs < min.pcs ? e : min))
      : null,
  );

  // fJumlah needed for jahit mode (grid input per ukuran)
  let fJumlah = $state<Partial<Record<UkuranBaju, number>>>({});

  // Detail ukuran: 1 entry untuk cutting, array multi-ukuran untuk jahit
  let detailUkuran = $derived(
    mode === "cutting"
      ? fUkuran !== ""
        ? [{ ukuran: fUkuran as UkuranBaju, jumlah_pcs: jumlahJadi() }]
        : []
      : selectedNamaModel
        ? UKURAN_ORDER.filter(
            (ukuran) =>
              ukuranTersedia.includes(ukuran) &&
              ((fJumlah as Record<string, number>)?.[ukuran] ?? 0) > 0,
          ).map((ukuran) => ({
            ukuran,
            jumlah_pcs: (fJumlah as Record<string, number>)?.[ukuran] ?? 0,
          }))
        : [],
  );

  let totalPcs = $derived(
    detailUkuran.reduce((sum, item) => sum + item.jumlah_pcs, 0),
  );
  let kainDibutuhkan = $derived(
    fKain
      .map((k) => ({
        kain_id: k.kain_id,
        nama_kain: k.nama_kain,
        satuan: k.satuan,
        jumlah_dipakai: parseFloat(k.jumlah_dipakai) || 0,
      }))
      .filter((k) => k.kain_id !== "" && k.jumlah_dipakai > 0),
  );
  let canSubmit = $derived(
    (mode === "jahit" ? !!selectedPotonganGroup : fModelId !== "") &&
      (mode === "jahit" || fUkuran !== "") &&
      (mode === "jahit" ? totalPcs > 0 : true) &&
      // Kain mentah hanya wajib diisi untuk mode cutting — jahit memakai stok
      // potongan (hasil cutting), bukan kain mentah, jadi tidak butuh input ini.
      (mode !== "jahit" ||
        detailUkuran.every((item) => {
          const stok = stokPotonganFiltered.find(
            (entry) => entry.ukuran === item.ukuran,
          );
          return stok && stok.stok_tersedia >= item.jumlah_pcs;
        })) &&
      fPenugasanUid !== "",
  );

  // Ambil label warna gabungan untuk sebuah model, misal "Abu · Navy"
  function warnaLabel(model: ModelBaju): string {
    return (model.warna_tersedia ?? []).map((w) => w.nama_warna).join(" · ");
  }

  function mergeSources(sources: SumberCutting[]): SumberCutting[] {
    const map = new Map<string, SumberCutting>();
    for (const source of sources) map.set(source.batch_id, source);
    return Array.from(map.values());
  }

  function cuttingSourcesForGroup(
    group: StokPotonganGroup | null,
  ): SumberCutting[] {
    if (!group) return [];
    const explicitSources = mergeSources(
      group.items.flatMap((item) => item.sumber_cutting ?? []),
    );
    if (explicitSources.length > 0) return explicitSources;

    return batchList
      .filter(
        (batch) =>
          batch.status === "CUTTING_DONE" &&
          !batch.dari_potongan &&
          batch.model_id === group.model_id &&
          (batch.nama_warna ?? "") === (group.nama_warna ?? ""),
      )
      .map((batch) => ({
        batch_id: batch.id,
        nama_model: batch.nama_model,
        ...(batch.nama_warna ? { nama_warna: batch.nama_warna } : {}),
        ...(batch.penugasan?.cutting
          ? { penugasan: { cutting: batch.penugasan.cutting } }
          : {}),
      }));
  }

  function cuttingInfoForGroup(group: StokPotonganGroup | null): string {
    const names = Array.from(
      new Set(
        cuttingSourcesForGroup(group)
          .map((source) => source.penugasan?.cutting?.nama)
          .filter(Boolean) as string[],
      ),
    );
    if (names.length === 0) return "Cutting: belum tercatat";
    if (names.length === 1) return `Cutting: ${names[0]}`;
    return `Cutting: ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`;
  }

  async function loadModels() {
    loadingModels = true;
    try {
      const allModels = await modelBajuCache.get();
      modelList = allModels
        .filter((model) => model.aktif)
        .map((model) => ({
          ...model,
          ukuran_tersedia: [...new Set(model.ukuran_tersedia.map((ukuran) => canonicalUkuran(ukuran)))],
        }));
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
      const [stok, batches] = await Promise.all([
        stokPotonganCache.get(),
        batchCache.get(),
      ]);
      stokPotonganModel = stok;
      batchList = batches;
    } catch {
      stokPotonganModel = [];
      batchList = [];
    } finally {
      loadingStock = false;
    }
  }

  async function loadKainList() {
    try {
      const kain = await stokKainCache.get();
      stokKainList = kain.map((k) => ({
        id: k.id,
        nama_kain: k.nama_kain,
        satuan: k.satuan,
        stok_tersedia: k.stok_tersedia,
        nama_warna: k.nama_warna,
        kode_hex_warna: k.kode_hex_warna,
      }));
    } catch {
      stokKainList = [];
    }
  }

  async function onOpenChange(nextOpen: boolean) {
    open = nextOpen;
    if (!nextOpen) return;
    fModelId = "";
    fPotonganKey = "";
    fWarnaId = "";
    fUkuran = "";
    fCatatan = "";
    fPenugasanUid = "";
    fJumlah = {};
    fKain = [];
    stokPotonganModel = [];
    batchList = [];
    errorMsg = null;
    const loads: Promise<void>[] = [loadWorkers()];
    if (mode === "jahit") loads.push(loadReadyPotongan());
    else loads.push(loadModels(), loadKainList());
    await Promise.all(loads);
  }

  async function onModelChange(value: string) {
    fModelId = value;
    const model = modelList.find((item) => item.id === value) ?? null;
    const warnas = model?.warna_tersedia ?? [];
    fWarnaId = warnas.length === 1 ? warnas[0].warna_id : "";
    fUkuran = "";
    fJumlah = {};
    // Rasio kebutuhan kain spesifik per ukuran/model — perlu diisi ulang
    applyDefaultYardPerPcs();
    errorMsg = null;
    stokPotonganModel = [];
  }

  function onPotonganChange(value: string) {
    fPotonganKey = value;
    const group = stokPotonganGroups.find((item) => item.key === value) ?? null;
    fModelId = group?.model_id ?? "";
    fWarnaId = group?.key ?? "";
    fUkuran = "";
    fJumlah = {};
    errorMsg = null;
  }

  async function submit() {
    if (!$currentUser || !selectedNamaModel || !canSubmit) return;

    saving = true;
    errorMsg = null;
    try {
      const sumberCutting =
        mode === "jahit" ? cuttingSourcesForGroup(selectedPotonganGroup) : [];
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
        kain_digunakan:
          mode === "cutting" && jumlahJadi() <= 0 ? [] : kainDibutuhkan,
        ...(sumberCutting.length > 0 ? { sumber_cutting: sumberCutting } : {}),
        penugasan: {
          [mode]: {
            uid: fPenugasanUid,
            nama:
              filteredWorkers.find((worker) => worker.uid === fPenugasanUid)
                ?.name ?? "",
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

<Dialog.Root bind:open {onOpenChange}>
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
          <div
            class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {errorMsg}
          </div>
        {/if}

        <div>
          <label
            class="mb-1.5 block text-sm font-medium text-gray-700"
            for="model-select-stage"
          >
            {mode === "jahit" ? "Stok Cutting" : "Model Baju"}
            <span class="text-red-500">*</span>
          </label>
          {#if mode === "jahit" ? loadingStock : loadingModels}
            <p class="text-xs text-gray-400">
              {mode === "jahit" ? "Memuat stok cutting..." : "Memuat model..."}
            </p>
          {:else if mode === "jahit" ? stokPotonganGroups.length === 0 : modelList.length === 0}
            <p class="text-xs text-gray-400">
              {mode === "jahit"
                ? "Belum ada stok cutting yang siap dijahit."
                : "Belum ada model aktif."}
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
                  <span
                    class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
                  >
                    <span class="truncate">
                      {mode === "jahit" && selectedPotonganGroup?.nama_warna
                        ? `${selectedNamaModel} - ${selectedPotonganGroup.nama_warna}`
                        : selectedNamaModel}
                    </span>
                    {#if mode === "cutting" && selectedModel && (selectedModel.warna_tersedia?.length ?? 0) > 0}
                      <span
                        class="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500"
                      >
                        {(selectedModel.warna_tersedia ?? []).length} warna
                      </span>
                    {/if}
                  </span>
                {:else}
                  <span class="text-muted-foreground">
                    {mode === "jahit"
                      ? "- Pilih stok cutting -"
                      : "— Pilih model —"}
                  </span>
                {/if}
              </Select.Trigger>
              <Select.Content
                class="w-[--bits-select-anchor-width] max-w-[--bits-select-anchor-width]"
                preventScroll={false}
              >
                {#if mode === "jahit"}
                  {#each stokPotonganGroups as group}
                    <Select.Item value={group.key} class="overflow-hidden">
                      <span class="flex min-w-0 flex-col gap-0.5">
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
                            {group.items.reduce(
                              (sum, item) => sum + item.stok_tersedia,
                              0,
                            )} pcs
                          </span>
                        </span>
                        <span class="truncate text-[11px] text-gray-400"
                          >{cuttingInfoForGroup(group)}</span
                        >
                      </span>
                    </Select.Item>
                  {/each}
                {:else}
                  {#each modelList as model}
                    <Select.Item value={model.id} class="overflow-hidden">
                      <!-- Item: nama model + dot warna + label warna -->
                      <span
                        class="flex min-w-0 items-center overflow-hidden [&>*:not(:first-child)]:hidden"
                      >
                        <span class="truncate">{model.nama_model}</span>
                        {#each model.warna_tersedia ?? [] as w, i}
                          {#if i === 0}
                            <span class="text-gray-300">·</span>
                          {/if}
                          <span
                            class="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                            style="background:{w.kode_hex}"
                          ></span>
                          <span class="text-gray-400 text-xs"
                            >{w.nama_warna}</span
                          >
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

        {#if mode === "jahit" && selectedPotonganGroup}
          <div
            class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-600"
          >
            <span class="font-medium text-gray-800"
              >{cuttingInfoForGroup(selectedPotonganGroup)}</span
            >
            <span class="ml-2 text-xs text-gray-400">
              {selectedPotonganGroup.items.reduce(
                (sum, item) => sum + item.stok_tersedia,
                0,
              )} pcs tersedia
            </span>
          </div>
        {/if}

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
                fUkuran = "";
                fJumlah = {};
                applyDefaultYardPerPcs();
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

        {#if selectedNamaModel && mode === "cutting" && selectedWarna}
          <!-- Dropdown Ukuran -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700">
              Ukuran <span class="text-red-500">*</span>
            </label>
            <Select.Root
              type="single"
              value={fUkuran || undefined}
              onValueChange={(val) => {
                fUkuran = (val ?? "") as UkuranBaju | "";
                // Rasio "1 pcs = ? yard" spesifik per ukuran — reset supaya diisi ulang
                applyDefaultYardPerPcs();
              }}
            >
              <Select.Trigger class="w-full">
                {fUkuran || "— Pilih ukuran —"}
              </Select.Trigger>
              <Select.Content preventScroll={false}>
                {#each selectedModelUkuran as ukuran}
                  <Select.Item value={ukuran}>{ukuran}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        {/if}

        {#if selectedNamaModel && mode === "cutting"}
          <!-- Kain yang Digunakan -->
          {#if fUkuran !== ""}
            <div>
              <p
                class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-600"
              >
                Pembagian Kain (opsional)
              </p>
              <p class="mb-2 text-xs text-gray-500">
                Kosongkan dulu jika total yard baru diketahui saat kain dibagikan.
              </p>
              <div class="space-y-2">
                {#each fKain as kainEntry, i}
                  {@const kainStok = stokKainList.find(
                    (k) => k.id === kainEntry.kain_id,
                  )}
                  {@const pilihanWarnaKain = stokKainByJenis(kainEntry.jenis_kain)}
                  {@const est = perKainEstimasi.find((e) => e.index === i)}
                  <div
                    class="flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <div class="flex items-center justify-between">
                      <span
                        class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider"
                      >
                        Kain #{i + 1}
                      </span>
                      {#if fKain.length > 1}
                        <button
                          type="button"
                          onclick={() => {
                            fKain = fKain.filter((_, fi) => fi !== i);
                          }}
                          class="shrink-0 rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                        >
                          ✕ Hapus
                        </button>
                      {/if}
                    </div>
                    <div class="grid gap-2 sm:grid-cols-[1fr_1.15fr]">
                      <div>
                        <p class="mb-0.5 text-[10px] text-gray-500">
                          Jenis kain
                        </p>
                        <Select.Root
                          type="single"
                          value={kainEntry.jenis_kain || undefined}
                          onValueChange={(val: string | undefined) => {
                            kainEntry.jenis_kain = val ?? "";
                            kainEntry.kain_id = "";
                            kainEntry.nama_kain = "";
                            kainEntry.satuan = "yard";
                          }}
                        >
                          <Select.Trigger class="h-8 border-gray-200 bg-white px-3 text-xs">
                            {#if kainEntry.jenis_kain}
                              <span class="truncate">{kainEntry.jenis_kain}</span>
                            {:else}
                              <span class="text-gray-400">Pilih jenis</span>
                            {/if}
                          </Select.Trigger>
                          <Select.Content preventScroll={false} class="z-[100] max-h-56 text-xs">
                            {#each stokKainGroups as group}
                              <Select.Item value={group.nama_kain} class="text-xs">
                                <span class="flex w-full items-center gap-2">
                                  <span class="truncate">{group.nama_kain}</span>
                                  <span class="ml-auto text-gray-400">
                                    {group.items.length} warna
                                  </span>
                                </span>
                              </Select.Item>
                            {/each}
                          </Select.Content>
                        </Select.Root>
                      </div>

                      <div>
                        <p class="mb-0.5 text-[10px] text-gray-500">
                          Warna / stok
                        </p>
                        <Select.Root
                          type="single"
                          value={kainEntry.kain_id || undefined}
                          onValueChange={(val: string | undefined) => {
                            if (val) {
                              kainEntry.kain_id = val;
                              const found = stokKainList.find((k) => k.id === val);
                              if (found) {
                                kainEntry.jenis_kain = found.nama_kain;
                                kainEntry.satuan = found.satuan;
                                kainEntry.nama_kain = found.nama_warna
                                  ? `${found.nama_kain} (${found.nama_warna})`
                                  : found.nama_kain;
                              }
                            }
                          }}
                        >
                          <Select.Trigger
                            class="h-8 border-gray-200 bg-white px-3 text-xs"
                            disabled={!kainEntry.jenis_kain}
                          >
                            {#if kainStok}
                              <span class="flex min-w-0 items-center gap-2">
                                {#if kainStok.kode_hex_warna}
                                  <span
                                    class="h-2.5 w-2.5 shrink-0 rounded-full"
                                    style="background-color: {kainStok.kode_hex_warna}"
                                  ></span>
                                {/if}
                                <span class="truncate">{kainStok.nama_warna ?? "Tanpa warna"}</span>
                                <span class="ml-auto shrink-0 text-gray-400">
                                  {kainStok.stok_tersedia} {kainStok.satuan}
                                </span>
                              </span>
                            {:else if kainEntry.jenis_kain}
                              <span class="text-gray-400">Pilih warna</span>
                            {:else}
                              <span class="text-gray-400">Pilih jenis dulu</span>
                            {/if}
                          </Select.Trigger>
                          <Select.Content preventScroll={false} class="z-[100] max-h-56 text-xs">
                            {#each pilihanWarnaKain as kain}
                              <Select.Item value={kain.id} class="text-xs">
                                <span class="flex w-full items-center gap-2">
                                  {#if kain.kode_hex_warna}
                                    <span
                                      class="h-2.5 w-2.5 shrink-0 rounded-full"
                                      style="background-color: {kain.kode_hex_warna}"
                                    ></span>
                                  {/if}
                                  <span class="truncate">{kain.nama_warna ?? "Tanpa warna"}</span>
                                  <span class="ml-auto shrink-0 text-gray-400">
                                    {kain.stok_tersedia} {kain.satuan}
                                  </span>
                                </span>
                              </Select.Item>
                            {/each}
                          </Select.Content>
                        </Select.Root>
                      </div>
                    </div>

                    <div class="hidden">
                    <Select.Root
                      type="single"
                      value={kainEntry.kain_id || undefined}
                      onValueChange={(val: string | undefined) => {
                        if (val) {
                          kainEntry.kain_id = val;
                          const found = stokKainList.find((k) => k.id === val);
                          if (found) {
                            kainEntry.satuan = found.satuan;
                            kainEntry.nama_kain = found.nama_kain;
                          }
                        }
                      }}
                    >
                      <Select.Trigger
                        class="flex-1 h-8 border-gray-200 bg-white px-3 text-xs"
                      >
                        {#if kainStok}
                          <span class="flex items-center gap-2">
                            {#if kainStok.kode_hex_warna}
                              <span
                                class="h-2.5 w-2.5 shrink-0 rounded-full"
                                style="background-color: {kainStok.kode_hex_warna}"
                              ></span>
                            {/if}
                            <span>{kainStok.nama_kain}</span>
                            {#if kainStok.nama_warna}
                              <span class="text-gray-400"
                                >({kainStok.nama_warna})</span
                              >
                            {/if}
                          </span>
                        {:else}
                          <span class="text-gray-400">— Pilih kain —</span>
                        {/if}
                      </Select.Trigger>
                      <Select.Content
                        preventScroll={false}
                        class="text-xs z-[100]"
                      >
                        {#each stokKainList as kain}
                          <Select.Item value={kain.id} class="text-xs">
                            <span class="flex items-center gap-2">
                              {#if kain.kode_hex_warna}
                                <span
                                  class="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style="background-color: {kain.kode_hex_warna}"
                                ></span>
                              {/if}
                              <span>{kain.nama_kain}</span>
                              {#if kain.nama_warna}
                                <span class="text-gray-400"
                                  >({kain.nama_warna})</span
                                >
                              {/if}
                              <span class="text-gray-400">({kain.satuan})</span>
                              <span class="ml-auto text-gray-400"
                                >{kain.stok_tersedia}</span
                              >
                            </span>
                          </Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                    </div>

                    {#if kainStok}
                      <div class="flex flex-wrap items-center gap-1.5">
                        {#if kainStok.kode_hex_warna}
                          <span
                            class="h-4 w-4 shrink-0 rounded-full border border-gray-200"
                            style="background-color: {kainStok.kode_hex_warna}"
                          ></span>
                        {/if}
                        {#if kainStok.nama_warna}
                          <span
                            class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600"
                            >{kainStok.nama_warna}</span
                          >
                        {/if}
                        <span
                          class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500"
                          >{kainStok.stok_tersedia} {kainStok.satuan}</span
                        >
                      </div>
                    {/if}

                    <!-- Input jumlah kain yang dipakai + rasio kebutuhan per pcs -->
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <label class="mb-0.5 block text-[10px] text-gray-500">
                          Jumlah dipakai ({kainEntry.satuan})
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={kainEntry.jumlah_dipakai}
                          oninput={(event) => updateKainField(i, "jumlah_dipakai", (event.currentTarget as HTMLInputElement).value)}
                          placeholder="0"
                          class="h-8 w-full rounded-md border border-gray-200 bg-white px-3 text-xs text-gray-700 placeholder:text-gray-400"
                        />
                      </div>
                      <div>
                        <label class="mb-0.5 block text-[10px] text-gray-500">
                          Yard / pcs ({fUkuran})
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={kainEntry.yard_per_pcs}
                          oninput={(event) => updateKainField(i, "yard_per_pcs", (event.currentTarget as HTMLInputElement).value)}
                          placeholder="2.4"
                          class="h-8 w-full rounded-md border border-gray-200 bg-white px-3 text-xs text-gray-700 placeholder:text-gray-400"
                        />
                      </div>
                    </div>
                    {#if defaultYardPerPcs()}
                      <p class="text-[10px] text-cyan-700">
                        Rasio master model: {defaultYardPerPcs()} yard/pcs.
                      </p>
                    {/if}
                    {#if est}
                      <p class="text-[10px] text-gray-500">
                        ≈ <span class="font-semibold text-gray-700"
                          >{est.pcs} pcs</span
                        >
                        dari kain ini · sisa {est.sisa.toFixed(2)} yard
                      </p>
                    {/if}
                  </div>
                {/each}
                <button
                  type="button"
                  onclick={() => {
                    fKain = [
                      ...fKain,
                      {
                        kain_id: "",
                        jenis_kain: "",
                        nama_kain: "",
                        satuan: "yard" as const,
                        jumlah_dipakai: "",
                        yard_per_pcs: defaultYardPerPcs(),
                      },
                    ];
                  }}
                  class="w-full rounded-lg border border-dashed border-gray-300 bg-white py-2 text-xs font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700"
                >
                  + Tambah Kain
                </button>
              </div>
            </div>
          {/if}

          <!-- Kalkulasi Jadi — di bawah kain. Rasio "1 pcs = ? yard" sudah
               diisi per kain di atas (tiap kain punya kebutuhannya sendiri). -->
          {#if fUkuran !== "" && fKain.length > 0}
            <div
              class="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3"
            >
              <p class="text-sm font-semibold text-gray-800">
                Kalkulasi Jadi — Ukuran {fUkuran}
              </p>

              {#if perKainEstimasi.length > 0}
                <div
                  class="rounded-lg bg-white border border-blue-200 p-3 text-center"
                >
                  <p class="text-3xl font-bold text-blue-700">{jumlahJadi()}</p>
                  <p class="text-xs text-gray-500">perkiraan pcs jadi</p>
                  {#if kainPembatas()}
                    <p class="mt-1 text-xs text-gray-400">
                      Dibatasi oleh <span class="font-medium"
                        >{kainPembatas()?.nama}</span
                      >
                      · sisa
                      <span class="font-medium"
                        >{kainPembatas()?.sisa.toFixed(2)} yard</span
                      >
                    </p>
                  {/if}
                </div>
                {#if perKainEstimasi.length < fKain.length}
                  <p class="text-xs text-amber-600">
                    Masih ada kain yang belum diisi jumlah/rasionya — belum ikut
                    dihitung.
                  </p>
                {/if}
              {:else}
                <p class="text-xs text-gray-400">
                  Isi jumlah dipakai dan rasio "1 pcs = ? yard" tiap kain di
                  atas untuk melihat perkiraan pcs jadi.
                </p>
              {/if}
            </div>
          {/if}

          <!-- Petugas Cutting -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700">
              {penugasanLabel} <span class="text-red-500">*</span>
            </label>
            {#if loadingWorkers}
              <p class="text-xs text-gray-400">Memuat petugas...</p>
            {:else if filteredWorkers.length === 0}
              <p class="text-xs text-red-600">
                Belum ada akun {penugasanLabel} di sistem.
              </p>
            {:else}
              <Select.Root
                type="single"
                value={fPenugasanUid || undefined}
                onValueChange={(value) => {
                  fPenugasanUid = value ?? "";
                }}
              >
                <Select.Trigger class="w-full">
                  {#if fPenugasanUid}
                    <span
                      >{filteredWorkers.find(
                        (worker) => worker.uid === fPenugasanUid,
                      )?.name ?? "—"}</span
                    >
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
        {/if}

        {#if selectedNamaModel && mode === "jahit"}
          <!-- Jahit: petugas, lalu grid ukuran -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700">
              {penugasanLabel} <span class="text-red-500">*</span>
            </label>
            {#if loadingWorkers}
              <p class="text-xs text-gray-400">Memuat petugas...</p>
            {:else if filteredWorkers.length === 0}
              <p class="text-xs text-red-600">
                Belum ada akun {penugasanLabel} di sistem.
              </p>
            {:else}
              <Select.Root
                type="single"
                value={fPenugasanUid || undefined}
                onValueChange={(value) => {
                  fPenugasanUid = value ?? "";
                }}
              >
                <Select.Trigger class="w-full">
                  {#if fPenugasanUid}
                    <span
                      >{filteredWorkers.find(
                        (worker) => worker.uid === fPenugasanUid,
                      )?.name ?? "—"}</span
                    >
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

          <!-- Jumlah per Ukuran (jahit mode — grid input per ukuran) -->
          <div>
            <p class="mb-2 text-sm font-medium text-gray-700">
              Jumlah Per Ukuran <span class="text-red-500">*</span>
            </p>
            <div class="flex flex-wrap gap-2">
              {#each UKURAN_ORDER.filter( (ukuran) => ukuranTersedia.includes(ukuran), ) as ukuran}
                {@const stokUkuran =
                  mode === "jahit"
                    ? (stokPotonganFiltered.find((s) => s.ukuran === ukuran)
                        ?.stok_tersedia ?? 0)
                    : null}
                {@const diminta = fJumlah[ukuran] ?? 0}
                {@const kurang =
                  mode === "jahit" &&
                  stokUkuran !== null &&
                  diminta > stokUkuran}
                <div class="w-16 text-center">
                  <label
                    class="mb-1 block text-xs font-semibold text-gray-600"
                    for={"ukuran-" + mode + "-" + ukuran}
                  >
                    {ukuran}
                  </label>
                  <input
                    id={"ukuran-" + mode + "-" + ukuran}
                    type="number"
                    min="0"
                    placeholder="0"
                    bind:value={fJumlah[ukuran]}
                    class="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 py-1 text-center text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] {kurang
                      ? 'border-red-400 bg-red-50'
                      : ''}"
                  />
                  {#if mode === "jahit" && stokUkuran !== null}
                    <p
                      class="mt-0.5 text-[10px] {kurang
                        ? 'font-semibold text-red-500'
                        : 'text-gray-400'}"
                    >
                      stok: {stokUkuran}
                    </p>
                  {/if}
                </div>
              {/each}
            </div>
            <div class="mt-2 flex items-center justify-between">
              {#if totalPcs > 0}
                <p class="text-xs text-gray-500">
                  Total: <span class="font-semibold text-gray-800"
                    >{totalPcs} pcs</span
                  >
                </p>
              {:else}
                <span></span>
              {/if}
              {#if mode === "jahit" && totalPcs > 0 && !detailUkuran.every( (item) => {
                    const s = stokPotonganFiltered.find((e) => e.ukuran === item.ukuran);
                    return s && s.stok_tersedia >= item.jumlah_pcs;
                  }, )}
                <p class="text-xs font-medium text-red-500">
                  Stok cutting tidak mencukupi
                </p>
              {/if}
            </div>
          </div>

          {#if mode === "jahit" && loadingStock}
            <p class="text-xs text-blue-500">Memuat stok cutting...</p>
          {:else if mode === "jahit" && stokPotonganFiltered.length === 0 && fModelId}
            <p class="text-xs text-red-600">
              Tidak ada stok cutting untuk model ini.
            </p>
          {/if}
        {/if}

        <div>
          <label
            class="mb-1.5 block text-sm font-medium text-gray-700"
            for={"catatan-" + mode}
          >
            Catatan <span class="text-xs font-normal text-gray-400"
              >(opsional)</span
            >
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
      <Button variant="outline" class="flex-1" onclick={() => (open = false)}
        >Batal</Button
      >
      <Button onclick={submit} disabled={saving || !canSubmit} class="flex-1">
        {saving ? "Menyimpan..." : buttonLabel}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
