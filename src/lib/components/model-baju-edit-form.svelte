<script lang="ts">
  import { updateModelBaju } from "$lib/firebase/model-baju";
  import { isOwner } from "$lib/stores/auth.store";
  import { UKURAN_ORDER } from "$lib/types";
  import type {
    KanalPenjualan,
    ModelBaju,
    UkuranBaju,
    Warna,
    WarnaTersedia,
  } from "$lib/types";
  import { uploadToCloudinary } from "$lib/cloudinary";
  import { Input } from "$lib/components/ui/input";
  import * as Popover from "$lib/components/ui/popover";
  import { Button } from "$lib/components/ui/button";
  import ChannelLogo from "$lib/components/channel-logo.svelte";

  let {
    model,
    modelList = [],
    warnaList = [],
    kanalList = [],
    onSaved = () => {},
    onError = () => {},
  }: {
    model: ModelBaju;
    modelList?: ModelBaju[];
    warnaList?: Warna[];
    kanalList?: KanalPenjualan[];
    onSaved?: () => void;
    onError?: (message: string) => void;
  } = $props();

  let initializedId = $state<string | null>(null);
  let saving = $state(false);
  let fNama = $state("");
  let fStokModelId = $state("");
  let fFotoUrl = $state("");
  let fFotoFile = $state<File | null>(null);
  let fDeskripsi = $state("");
  let fUkuran = $state<UkuranBaju[]>([]);
  let fWarna = $state<WarnaTersedia[]>([]);
  let fHargaJualByUkuran = $state<Partial<Record<UkuranBaju, string>>>({});
  let fHargaJualPerKanal = $state<Record<string, Partial<Record<UkuranBaju, string>>>>({});
  let fHargaJualKanalAktif = $state("default");
  let fHargaProduksiByUkuran = $state<Partial<Record<UkuranBaju, string>>>({});
  let fKebutuhanYard = $state<Partial<Record<UkuranBaju, string>>>({});
  let fTarifCutting = $state("");
  let fTarifJahit = $state("");
  let fTarifSteam = $state("");

  const kanalHargaAktif = $derived(
    kanalList.filter((channel) => channel.aktif && channel.id !== "gudang_central"),
  );
  const linkedSourceModel = $derived(
    modelList.find((item) => item.id === fStokModelId) ?? null,
  );
  const canSubmit = $derived(fNama.trim() !== "" && fUkuran.length > 0);

  function toStringMap(value: Partial<Record<string, number>> | undefined) {
    return Object.fromEntries(
      Object.entries(value ?? {}).map(([key, item]) => [key, item != null ? String(item) : ""]),
    ) as Partial<Record<UkuranBaju, string>>;
  }

  function seedForm(value: ModelBaju) {
    fNama = value.nama_model;
    fStokModelId = value.stok_model_id ?? "";
    fFotoUrl = value.foto_url ?? "";
    fFotoFile = null;
    fDeskripsi = value.deskripsi ?? "";
    fUkuran = [...value.ukuran_tersedia];
    fWarna = value.stok_model_id ? [] : [...(value.warna_tersedia ?? [])];
    fHargaJualByUkuran = toStringMap(value.harga_jual_per_ukuran);
    fHargaJualPerKanal = Object.fromEntries(
      Object.entries(value.harga_jual_per_kanal ?? {}).map(([channelId, prices]) => [
        channelId,
        toStringMap(prices),
      ]),
    ) as Record<string, Partial<Record<UkuranBaju, string>>>;
    fHargaJualKanalAktif = "default";
    fHargaProduksiByUkuran = toStringMap(value.harga_produksi_per_ukuran);
    fKebutuhanYard = toStringMap(value.kebutuhan_yard_per_pcs);
    fTarifCutting = value.tarif_cutting != null ? String(value.tarif_cutting) : "";
    fTarifJahit = value.tarif_jahit != null ? String(value.tarif_jahit) : "";
    fTarifSteam = value.tarif_steam != null ? String(value.tarif_steam) : "";
  }

  $effect(() => {
    if (model.id && model.id !== initializedId) {
      seedForm(model);
      initializedId = model.id;
    }
  });

  function toggleUkuran(ukuran: UkuranBaju) {
    if (fUkuran.includes(ukuran)) {
      fUkuran = fUkuran.filter((item) => item !== ukuran);
      const nextYard = { ...fKebutuhanYard };
      delete nextYard[ukuran];
      fKebutuhanYard = nextYard;
      const nextBasePrice = { ...fHargaJualByUkuran };
      delete nextBasePrice[ukuran];
      fHargaJualByUkuran = nextBasePrice;
      fHargaJualPerKanal = Object.fromEntries(
        Object.entries(fHargaJualPerKanal).map(([channelId, prices]) => {
          const nextPrices = { ...prices };
          delete nextPrices[ukuran];
          return [channelId, nextPrices];
        }),
      );
      const nextProductionPrice = { ...fHargaProduksiByUkuran };
      delete nextProductionPrice[ukuran];
      fHargaProduksiByUkuran = nextProductionPrice;
      return;
    }
    fUkuran = UKURAN_ORDER.filter((item) => [...fUkuran, ukuran].includes(item));
  }

  function toggleWarna(warna: Warna) {
    if (fWarna.some((item) => item.warna_id === warna.id)) {
      fWarna = fWarna.filter((item) => item.warna_id !== warna.id);
      return;
    }
    fWarna = [
      ...fWarna,
      { warna_id: warna.id, nama_warna: warna.nama_warna, kode_hex: warna.kode_hex },
    ];
  }

  function isWarnaSelected(warnaId: string) {
    return fWarna.some((item) => item.warna_id === warnaId);
  }

  function toggleSemuaWarna() {
    const semuaTerpilih = warnaList.length > 0 && warnaList.every((warna) => isWarnaSelected(warna.id));
    fWarna = semuaTerpilih
      ? []
      : warnaList.map((warna) => ({
          warna_id: warna.id,
          nama_warna: warna.nama_warna,
          kode_hex: warna.kode_hex,
        }));
  }

  function pilihSumberStok(modelId: string) {
    fStokModelId = modelId;
    if (!modelId) return;
    fWarna = [];
    fHargaJualByUkuran = {};
    fHargaJualPerKanal = {};
    fHargaJualKanalAktif = "default";
    fHargaProduksiByUkuran = {};
    fKebutuhanYard = {};
    fTarifCutting = "";
    fTarifJahit = "";
    fTarifSteam = "";
  }

  function hargaJualFormValue(ukuran: UkuranBaju) {
    return fHargaJualKanalAktif === "default"
      ? fHargaJualByUkuran[ukuran] ?? ""
      : fHargaJualPerKanal[fHargaJualKanalAktif]?.[ukuran] ?? "";
  }

  function setHargaJualFormValue(ukuran: UkuranBaju, value: string) {
    if (fHargaJualKanalAktif === "default") {
      fHargaJualByUkuran = { ...fHargaJualByUkuran, [ukuran]: value };
      return;
    }
    fHargaJualPerKanal = {
      ...fHargaJualPerKanal,
      [fHargaJualKanalAktif]: {
        ...(fHargaJualPerKanal[fHargaJualKanalAktif] ?? {}),
        [ukuran]: value,
      },
    };
  }

  function cleanNumberMap(map: Partial<Record<UkuranBaju, string>>) {
    return Object.fromEntries(
      Object.entries(map)
        .map(([ukuran, value]) => [ukuran, Number(value) || 0] as const)
        .filter(([, value]) => value > 0),
    );
  }

  function cleanChannelPriceMaps() {
    return Object.fromEntries(
      Object.entries(fHargaJualPerKanal)
        .map(([channelId, prices]) => [channelId, cleanNumberMap(prices)] as const)
        .filter(([, prices]) => Object.keys(prices).length > 0),
    );
  }

  function fileChanged(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file && file.size > 10 * 1024 * 1024) {
      onError("Ukuran foto maksimal 10 MB.");
      input.value = "";
      fFotoFile = null;
      return;
    }
    fFotoFile = file;
  }

  async function save() {
    if (!canSubmit || saving) return;
    saving = true;
    try {
      let fotoUrl = fFotoUrl;
      if (fFotoFile) fotoUrl = await uploadToCloudinary(fFotoFile, "products");
      const linkedToSource = Boolean(fStokModelId);
      const ownerCanEditFinancials = $isOwner;
      const input = {
        nama_model: fNama.trim(),
        stok_model_id: fStokModelId || null,
        ...(fotoUrl ? { foto_url: fotoUrl } : {}),
        ...(fDeskripsi.trim() ? { deskripsi: fDeskripsi.trim() } : {}),
        ukuran_tersedia: fUkuran,
        warna_tersedia: linkedToSource ? [] : fWarna,
        kebutuhan_yard_per_pcs: linkedToSource
          ? {}
          : ownerCanEditFinancials
            ? cleanNumberMap(fKebutuhanYard)
            : model.kebutuhan_yard_per_pcs ?? {},
        harga_jual: 0,
        harga_jual_per_ukuran: linkedToSource
          ? {}
          : ownerCanEditFinancials
            ? cleanNumberMap(fHargaJualByUkuran)
            : model.harga_jual_per_ukuran ?? {},
        harga_jual_per_kanal: linkedToSource
          ? {}
          : ownerCanEditFinancials
            ? cleanChannelPriceMaps()
            : model.harga_jual_per_kanal ?? {},
        harga_produksi: 0,
        harga_produksi_per_ukuran: linkedToSource
          ? {}
          : ownerCanEditFinancials
            ? cleanNumberMap(fHargaProduksiByUkuran)
            : model.harga_produksi_per_ukuran ?? {},
        tarif_cutting: linkedToSource ? 0 : ownerCanEditFinancials ? Number(fTarifCutting) || 0 : model.tarif_cutting ?? 0,
        tarif_jahit: linkedToSource ? 0 : ownerCanEditFinancials ? Number(fTarifJahit) || 0 : model.tarif_jahit ?? 0,
        tarif_steam: linkedToSource ? 0 : ownerCanEditFinancials ? Number(fTarifSteam) || 0 : model.tarif_steam ?? 0,
      };
      await updateModelBaju(model.id, input);
      onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Gagal memperbarui model.");
    } finally {
      saving = false;
    }
  }
</script>

<form class="space-y-6" onsubmit={(event) => { event.preventDefault(); void save(); }}>
  <section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <div class="mb-5">
      <h2 class="text-base font-semibold text-gray-900">Identitas Model</h2>
      <p class="mt-1 text-sm text-gray-500">Atur nama, foto, dan sumber stok model ini.</p>
    </div>
    <div class="space-y-5">
      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="edit-nama-model">Nama Model <span class="text-red-500">*</span></label>
        <Input id="edit-nama-model" bind:value={fNama} placeholder="Contoh: Gamis Syar'i Polos, Tunik Batik..." />
      </div>

      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="edit-stok-model">Kaitkan stok ke model lain <span class="text-xs font-normal text-gray-400">(opsional)</span></label>
        <select id="edit-stok-model" value={fStokModelId} onchange={(event) => pilihSumberStok((event.currentTarget as HTMLSelectElement).value)} class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
          <option value="">Gunakan stok model ini sendiri</option>
          {#each modelList.filter((item) => item.id !== model.id && item.aktif) as sourceModel}
            <option value={sourceModel.id}>{sourceModel.nama_model}</option>
          {/each}
        </select>
        <p class="mt-1.5 text-xs text-gray-500">Model ini tetap punya identitas sendiri, tetapi stok, warna, yard, tarif, dan HPP mengikuti model sumber.</p>
      </div>

      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="edit-foto-model">Foto Produk <span class="text-xs font-normal text-gray-400">(opsional)</span></label>
        {#if fFotoUrl}
          <img src={fFotoUrl} alt={`Preview ${fNama || "produk"}`} class="mb-3 h-36 w-36 rounded-lg border border-gray-200 object-cover" />
        {/if}
        <input id="edit-foto-model" type="file" accept="image/jpeg,image/png,image/webp" onchange={fileChanged} class="block w-full cursor-pointer rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-medium" />
        <p class="mt-1 text-xs text-gray-400">JPG, PNG, atau WebP. Maksimal 10 MB.</p>
      </div>

      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="edit-deskripsi-model">Deskripsi <span class="text-xs font-normal text-gray-400">(opsional)</span></label>
        <textarea id="edit-deskripsi-model" rows="3" placeholder="Deskripsi singkat model..." bind:value={fDeskripsi} class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"></textarea>
      </div>
    </div>
  </section>

  <section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <div class="mb-5">
      <h2 class="text-base font-semibold text-gray-900">Ukuran dan Warna</h2>
      <p class="mt-1 text-sm text-gray-500">Pilih ukuran yang tersedia. Model turunan otomatis memakai warna model sumber.</p>
    </div>
    <div class="space-y-6">
      <div>
        <p class="mb-2 text-sm font-medium text-gray-700">Ukuran Tersedia <span class="text-red-500">*</span></p>
        <div class="flex flex-wrap gap-2">
          {#each UKURAN_ORDER as ukuran}
            <button type="button" onclick={() => toggleUkuran(ukuran)} class="flex h-11 min-w-11 items-center justify-center rounded-full border-2 px-2 text-sm font-bold transition {fUkuran.includes(ukuran) ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'}">{ukuran}</button>
          {/each}
        </div>
        {#if fUkuran.length === 0}
          <p class="mt-2 text-xs text-red-500">Pilih minimal satu ukuran.</p>
        {:else}
          <p class="mt-2 text-xs text-gray-500">Dipilih: <span class="font-medium text-gray-800">{fUkuran.join(", ")}</span></p>
        {/if}
      </div>

      {#if !fStokModelId}
        <div>
          <div class="mb-2 flex items-center justify-between gap-3">
            <label for="edit-warna-model" class="block text-sm font-medium text-gray-700">Warna Tersedia <span class="text-xs font-normal text-gray-400">(opsional)</span></label>
            {#if warnaList.length > 0}
              <button type="button" onclick={toggleSemuaWarna} class="text-xs font-medium text-blue-600 hover:underline">{warnaList.every((warna) => isWarnaSelected(warna.id)) ? "Hapus semua" : "Pilih semua"}</button>
            {/if}
          </div>
          {#if warnaList.length === 0}
            <p class="text-xs text-gray-400">Belum ada warna terdaftar. <a href="/warna" class="text-blue-500 hover:underline">Tambah warna</a></p>
          {:else}
            <Popover.Root>
              <Popover.Trigger id="edit-warna-model" class="flex min-h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                {#if fWarna.length === 0}
                  <span class="text-muted-foreground">Pilih warna</span>
                {:else}
                  <div class="flex flex-wrap gap-1.5">
                    {#each fWarna.slice(0, 8) as warna}
                      <span class="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
                        <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/10" style={`background-color: ${warna.kode_hex}`}></span>
                        {warna.nama_warna}
                      </span>
                    {/each}
                    {#if fWarna.length > 8}<span class="self-center text-xs text-gray-500">+{fWarna.length - 8}</span>{/if}
                  </div>
                {/if}
                <span class="ml-2 shrink-0 text-xs text-gray-400">{fWarna.length}/{warnaList.length}</span>
              </Popover.Trigger>
              <Popover.Content class="w-[--bits-popover-anchor-width] overflow-hidden p-1" align="start">
                <div class="max-h-[min(22rem,var(--bits-popover-content-available-height))] overflow-y-auto">
                  {#each warnaList as warna}
                    <button type="button" onclick={() => toggleWarna(warna)} class="flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-sm hover:bg-accent">
                      <span class="inline-block h-4 w-4 shrink-0 rounded-full border border-black/10 shadow-sm" style={`background-color: ${warna.kode_hex}`}></span>
                      <span class="flex-1 text-left">{warna.nama_warna}</span>
                      {#if isWarnaSelected(warna.id)}<span class="font-bold text-blue-600">Terpilih</span>{/if}
                    </button>
                  {/each}
                </div>
              </Popover.Content>
            </Popover.Root>
          {/if}
        </div>
      {:else}
        <div class="rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-3 text-sm text-blue-800">Warna mengikuti model sumber: <span class="font-semibold">{linkedSourceModel?.nama_model ?? "Model sumber"}</span></div>
      {/if}
    </div>
  </section>

  {#if fUkuran.length > 0}
    <section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div class="mb-5">
        <h2 class="text-base font-semibold text-gray-900">Harga dan Kebutuhan Produksi</h2>
        <p class="mt-1 text-sm text-gray-500">Harga penjualan dapat dibuat berbeda per kanal e-commerce.</p>
      </div>

      {#if $isOwner && !fStokModelId}
        <div class="space-y-6">
          <div>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-sm font-semibold text-gray-800">Harga jual per ukuran</p>
                <p class="text-xs text-gray-500">Kosongkan harga kanal untuk mengikuti harga dasar.</p>
              </div>
              <div class="flex flex-wrap gap-1.5" role="tablist" aria-label="Kanal harga jual model">
                <button type="button" role="tab" aria-selected={fHargaJualKanalAktif === "default"} onclick={() => (fHargaJualKanalAktif = "default")} class={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${fHargaJualKanalAktif === "default" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-600"}`}>Harga dasar</button>
                {#each kanalHargaAktif as channel}
                  <button type="button" role="tab" aria-selected={fHargaJualKanalAktif === channel.id} onclick={() => (fHargaJualKanalAktif = channel.id)} class={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${fHargaJualKanalAktif === channel.id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-600"}`}>
                    <ChannelLogo name={channel.nama} size="sm" />
                    {channel.nama}
                  </button>
                {/each}
              </div>
            </div>
            <p class="mb-3 text-xs text-gray-500">{fHargaJualKanalAktif === "default" ? "Harga dasar model." : `Harga khusus ${kanalList.find((channel) => channel.id === fHargaJualKanalAktif)?.nama ?? fHargaJualKanalAktif}.`}</p>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {#each fUkuran as ukuran}
                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-700" for={`edit-harga-jual-${ukuran}`}>{ukuran}</label>
                  <div class="relative"><span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rp</span><Input id={`edit-harga-jual-${ukuran}`} type="number" min="0" placeholder="0" value={hargaJualFormValue(ukuran)} oninput={(event) => setHargaJualFormValue(ukuran, (event.currentTarget as HTMLInputElement).value)} class="h-9 pl-7" /></div>
                </div>
              {/each}
            </div>
          </div>

          <div class="border-t border-gray-100 pt-5">
            <p class="mb-3 text-sm font-semibold text-gray-800">Harga produksi per ukuran</p>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {#each fUkuran as ukuran}
                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-700" for={`edit-harga-produksi-${ukuran}`}>{ukuran}</label>
                  <div class="relative"><span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rp</span><Input id={`edit-harga-produksi-${ukuran}`} type="number" min="0" placeholder="0" value={fHargaProduksiByUkuran[ukuran] ?? ""} oninput={(event) => (fHargaProduksiByUkuran = { ...fHargaProduksiByUkuran, [ukuran]: (event.currentTarget as HTMLInputElement).value })} class="h-9 pl-7" /></div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {:else if $isOwner && fStokModelId}
        <div class="rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-3 text-sm text-blue-800">Harga dan biaya mengikuti model sumber. Harga paket diatur melalui Kelola Add-on.</div>
      {/if}

      <div class="mt-6 border-t border-gray-100 pt-5">
        <div class="mb-3">
          <p class="text-sm font-semibold text-gray-800">Kebutuhan Yard / Pcs</p>
          <p class="text-xs text-gray-500">Dipakai otomatis saat membuat order cutting.</p>
        </div>
        {#if fStokModelId}
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {#each UKURAN_ORDER.filter((ukuran) => (linkedSourceModel?.ukuran_tersedia ?? fUkuran).includes(ukuran)) as ukuran}
              <div class="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"><span class="font-medium text-gray-800">{ukuran}</span><span class="ml-1">{linkedSourceModel?.kebutuhan_yard_per_pcs?.[ukuran] ? `${linkedSourceModel.kebutuhan_yard_per_pcs[ukuran]} yd` : "-"}</span></div>
            {/each}
          </div>
        {:else}
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {#each fUkuran as ukuran}
              <div>
                <label class="mb-1 block text-xs font-medium text-gray-700" for={`edit-kebutuhan-yard-${ukuran}`}>{ukuran}</label>
                <div class="relative"><Input id={`edit-kebutuhan-yard-${ukuran}`} type="number" min="0" step="0.1" placeholder="0" value={fKebutuhanYard[ukuran] ?? ""} oninput={(event) => (fKebutuhanYard = { ...fKebutuhanYard, [ukuran]: (event.currentTarget as HTMLInputElement).value })} class="h-9 pr-10" /><span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">yd</span></div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      {#if $isOwner && !fStokModelId}
        <div class="mt-6 border-t border-gray-100 pt-5">
          <div class="mb-3"><p class="text-sm font-semibold text-gray-800">Tarif Default Produksi</p><p class="text-xs text-gray-500">Tarif standar per pcs untuk pengisian gaji produksi.</p></div>
          <div class="grid gap-3 sm:grid-cols-3">
            {#each [["edit-tarif-cutting", "Cutting / Pcs", fTarifCutting], ["edit-tarif-jahit", "Jahit / Pcs", fTarifJahit], ["edit-tarif-steam", "Steam / Pcs", fTarifSteam]] as item}
              <div><label class="mb-1 block text-xs font-medium text-gray-700" for={item[0]}>{item[1]}</label><div class="relative"><span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rp</span><Input id={item[0]} type="number" min="0" placeholder="0" value={item[2]} oninput={(event) => { const value = (event.currentTarget as HTMLInputElement).value; if (item[0] === "edit-tarif-cutting") fTarifCutting = value; else if (item[0] === "edit-tarif-jahit") fTarifJahit = value; else fTarifSteam = value; }} class="h-9 pl-7" /></div></div>
            {/each}
          </div>
        </div>
      {:else if $isOwner && fStokModelId}
        <div class="mt-6 rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-3 text-sm text-blue-800">Tarif cutting, jahit, dan steam hanya dihitung satu kali dari model sumber.</div>
      {/if}
    </section>
  {/if}

  <div class="flex flex-wrap justify-end gap-2 pb-4">
    <Button type="submit" disabled={saving || !canSubmit} class="min-w-44">{saving ? "Menyimpan..." : "Simpan Perubahan"}</Button>
  </div>
</form>
