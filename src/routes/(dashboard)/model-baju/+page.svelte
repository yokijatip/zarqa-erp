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
  import { modelBajuCache, modelHijabCache, stokHijabCache, warnaCache } from "$lib/stores/data-cache.svelte";
  import { isAdmin, isOwner } from "$lib/stores/auth.store";
  import {
    UKURAN_ORDER,
    getAddOnPenjualan,
    warnaMappingKey,
    type KomponenVarianPenjualan,
    type ModeHargaVarian,
    type ModelBaju,
    type ModelHijab,
    type StokHijab,
    type UkuranBaju,
    type VarianPenjualan,
    type Warna,
    type WarnaTersedia,
  } from "$lib/types";
  import { modeHargaVarian } from "$lib/sales/penjualan";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Popover from "$lib/components/ui/popover";
  import StatCard from "$lib/components/StatCard.svelte";
  import ShirtIcon from "@lucide/svelte/icons/shirt";
  import ArchiveIcon from "@lucide/svelte/icons/archive";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { uploadToCloudinary } from "$lib/cloudinary";
  import * as Select from "$lib/components/ui/select/index.js";

  // ── State ──────────────────────────────────────────────────────────
  let modelList = $state<ModelBaju[]>([]);
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
  let openVarian = $state(false);
  let variantModel = $state<ModelBaju | null>(null);
  let variantList = $state<VarianPenjualan[]>([]);
  let variantSaving = $state(false);
  let variantError = $state<string | null>(null);
  let fVariantName = $state("");
  let fVariantSku = $state("");
  let fVariantSellingMode = $state<ModeHargaVarian>("induk_plus_addon");
  let fVariantProductionMode = $state<ModeHargaVarian>("induk_plus_addon");
  let fVariantSellingPricesBySize = $state<Partial<Record<UkuranBaju, string>>>({});
  let fVariantProductionPricesBySize = $state<Partial<Record<UkuranBaju, string>>>({});
  let fVariantHijabId = $state("");
  let fVariantAccessoryId = $state("");
  let fVariantAccessoryQty = $state("1");
  let fVariantMappingMode = $state<"global" | "per_warna">("global");
  let fVariantStockByWarna = $state<Record<string, string>>({});
  let stokHijabList = $state<StokHijab[]>([]);
  let modelHijabList = $state<Array<ModelHijab & { stok_tersedia: number }>>([]);

  // Form fields
  let fNama = $state("");
  let fStokModelId = $state("");
  let fFotoUrl = $state("");
  let fFotoFile = $state<File | null>(null);
  let fDeskripsi = $state("");
  let fUkuran = $state<UkuranBaju[]>([]);
  let fWarna = $state<WarnaTersedia[]>([]);
  let fHargaJualByUkuran = $state<Partial<Record<UkuranBaju, string>>>({});
  let fHargaProduksiByUkuran = $state<Partial<Record<UkuranBaju, string>>>({});
  let fKebutuhanYard = $state<Partial<Record<UkuranBaju, string>>>({});
  let fTarifCutting = $state("");
  let fTarifJahit = $state("");
  let fTarifSteam = $state("");
  let failedPhotos = $state<Record<string, boolean>>({});

  function markPhotoFailed(modelId: string) {
    failedPhotos = { ...failedPhotos, [modelId]: true };
  }

  // ── Derived ────────────────────────────────────────────────────────
  let filteredList = $derived.by(() => {
    let list = tampilNonaktif ? modelList : modelList.filter((m) => m.aktif);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((m) => m.nama_model.toLowerCase().includes(q));
    }
    return list;
  });

  async function fetchModels(force = false) {
    const allModels = await modelBajuCache.get(force);
    modelList = tampilNonaktif ? allModels : allModels.filter((model) => model.aktif);
  }

  function setSearch(value: string) {
    searchQuery = value;
  }

  async function toggleTampilNonaktif() {
    tampilNonaktif = !tampilNonaktif;
    await load(true);
  }

  let totalAktif = $derived(modelList.filter((m) => m.aktif).length);
  let totalNonaktif = $derived(modelList.filter((m) => !m.aktif).length);
  let isEditing = $derived(editingId !== null);
  let formTitle = $derived(isEditing ? "Edit Model Baju" : "Tambah Model Baju");

  let canSubmit = $derived(
    fNama.trim() !== "" &&
    fUkuran.length > 0
  );
  let linkedSourceModel = $derived(
    modelList.find((model) => model.id === fStokModelId) ?? null,
  );

  // ── Helpers ────────────────────────────────────────────────────────
  function toggleUkuran(u: UkuranBaju) {
    if (fUkuran.includes(u)) {
      fUkuran = fUkuran.filter((x) => x !== u);
      const next = { ...fKebutuhanYard };
      delete next[u];
      fKebutuhanYard = next;
      const nextHarga = { ...fHargaJualByUkuran };
      delete nextHarga[u];
      fHargaJualByUkuran = nextHarga;
      const nextHargaProduksi = { ...fHargaProduksiByUkuran };
      delete nextHargaProduksi[u];
      fHargaProduksiByUkuran = nextHargaProduksi;
    } else {
      fUkuran = UKURAN_ORDER.filter((x) => [...fUkuran, x].includes(x));
    }
  }

  function toggleWarna(w: Warna) {
    const idx = fWarna.findIndex((x) => x.warna_id === w.id);
    if (idx >= 0) {
      fWarna = fWarna.filter((_, i) => i !== idx);
    } else {
      fWarna = [...fWarna, { warna_id: w.id, nama_warna: w.nama_warna, kode_hex: w.kode_hex }];
    }
  }

  function toggleSemuaWarna() {
    const semuaTerpilih = warnaList.length > 0 && warnaList.every((warna) => isWarnaSelected(warna.id));
    fWarna = semuaTerpilih
      ? []
      : warnaList.map((warna) => ({ warna_id: warna.id, nama_warna: warna.nama_warna, kode_hex: warna.kode_hex }));
  }

  function isWarnaSelected(warnaId: string): boolean {
    return fWarna.some((w) => w.warna_id === warnaId);
  }

  function resetForm() {
    fNama = "";
    fStokModelId = "";
    fFotoUrl = "";
    fFotoFile = null;
    fDeskripsi = "";
    fUkuran = [];
    fWarna = [];
    fHargaJualByUkuran = {};
    fHargaProduksiByUkuran = {};
    fKebutuhanYard = {};
    fTarifCutting = "";
    fTarifJahit = "";
    fTarifSteam = "";
    editingId = null;
  }

  function pilihSumberStok(modelId: string) {
    fStokModelId = modelId;
    if (modelId) {
      fWarna = [];
      // A linked model has no independent production cost, tariff, or yard.
      fHargaJualByUkuran = {};
      fHargaProduksiByUkuran = {};
      fKebutuhanYard = {};
      fTarifCutting = "";
      fTarifJahit = "";
      fTarifSteam = "";
    }
  }

  function resetVariantForm() {
    fVariantName = "";
    fVariantSku = "";
    fVariantSellingMode = "induk_plus_addon";
    fVariantProductionMode = "induk_plus_addon";
    fVariantSellingPricesBySize = {};
    fVariantProductionPricesBySize = {};
    fVariantHijabId = "";
    fVariantAccessoryId = "";
    fVariantAccessoryQty = "1";
    fVariantMappingMode = "global";
    fVariantStockByWarna = {};
    variantError = null;
  }

  type VariantPriceKind = "jual" | "produksi";

  function variantPriceMode(variant: VarianPenjualan, kind: VariantPriceKind): ModeHargaVarian {
    return modeHargaVarian(variant, kind);
  }

  function variantPriceMap(
    variant: VarianPenjualan,
    kind: VariantPriceKind,
  ): Partial<Record<UkuranBaju, number>> {
    const source = kind === "jual" ? variant.harga_jual_per_ukuran : variant.harga_produksi_per_ukuran;
    const legacy = kind === "jual" ? variant.harga_jual : variant.harga_produksi;
    const sizes = variantModel?.ukuran_tersedia ?? UKURAN_ORDER;
    const result: Partial<Record<UkuranBaju, number>> = { ...(source ?? {}) };
    if (legacy != null && legacy > 0) {
      for (const ukuran of sizes) {
        if (!(result[ukuran] && result[ukuran]! > 0)) result[ukuran] = legacy;
      }
    }
    return result;
  }

  function cleanPriceMap(map: Partial<Record<UkuranBaju, number>>) {
    return Object.fromEntries(
      Object.entries(map).filter(([, value]) => Number(value) > 0),
    ) as Partial<Record<UkuranBaju, number>>;
  }

  function updateVariantPriceMode(index: number, kind: VariantPriceKind, mode: ModeHargaVarian) {
    const variant = variantList[index];
    if (!variant) return;
    const patch: Partial<VarianPenjualan> = kind === "jual"
      ? { harga_jual_mode: mode }
      : { harga_produksi_mode: mode };
    if (mode === "induk_plus_addon") {
      if (kind === "jual") patch.harga_jual_per_ukuran = undefined;
      else patch.harga_produksi_per_ukuran = undefined;
    } else {
      const map = variantPriceMap(variant, kind);
      if (kind === "jual") patch.harga_jual_per_ukuran = map;
      else patch.harga_produksi_per_ukuran = map;
    }
    updateVariant(index, patch);
  }

  function updateVariantPrice(index: number, kind: VariantPriceKind, ukuran: UkuranBaju, value: string) {
    const variant = variantList[index];
    if (!variant) return;
    const map = variantPriceMap(variant, kind);
    const next = { ...map, [ukuran]: Number(value) > 0 ? Number(value) : undefined };
    updateVariant(
      index,
      kind === "jual"
        ? { harga_jual_mode: "custom", harga_jual_per_ukuran: next }
        : { harga_produksi_mode: "custom", harga_produksi_per_ukuran: next },
    );
  }

  function updateNewVariantPriceMode(kind: VariantPriceKind, mode: ModeHargaVarian) {
    if (kind === "jual") fVariantSellingMode = mode;
    else fVariantProductionMode = mode;
  }

  function updateNewVariantPrice(kind: VariantPriceKind, ukuran: UkuranBaju, value: string) {
    if (kind === "jual") {
      fVariantSellingPricesBySize = { ...fVariantSellingPricesBySize, [ukuran]: value };
    } else {
      fVariantProductionPricesBySize = { ...fVariantProductionPricesBySize, [ukuran]: value };
    }
  }

  function openVariantManager(model: ModelBaju) {
    variantModel = model;
    variantList = getAddOnPenjualan(model).map((variant) => ({
      ...variant,
      komponen: variant.komponen.map((component) => ({ ...component })),
    }));
    resetVariantForm();
    openVarian = true;
  }

  function variantId() {
    return `varian_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function addVariant() {
    const name = fVariantName.trim();
    if (!variantModel || !name) {
      variantError = "Nama add-on wajib diisi.";
      return;
    }
    if (!fVariantHijabId) {
      variantError = "Pilih model hijab untuk add-on ini.";
      return;
    }
    const warnaModel = variantModel.warna_tersedia ?? [];
    const usePerWarna = fVariantMappingMode === "per_warna" && warnaModel.length > 0;
    const stockOptions = stokUntukModelHijab(fVariantHijabId);
    const stockOptionIds = new Set(stockOptions.map((item) => item.id));
    const stockByWarna = usePerWarna
      ? Object.fromEntries(warnaModel.map((warna) => [warnaMappingKey(warna.warna_id, warna.nama_warna), fVariantStockByWarna[warnaMappingKey(warna.warna_id, warna.nama_warna)] ?? ""]))
      : {};
    if (usePerWarna) {
      const warnaBelumDipetakan = warnaModel.filter((warna) => !stockByWarna[warnaMappingKey(warna.warna_id, warna.nama_warna)]);
      if (warnaBelumDipetakan.length > 0) {
        variantError = `Pilih stok hijab untuk semua warna baju (${warnaBelumDipetakan.map((warna) => warna.nama_warna).join(", ")}).`;
        return;
      }
      if (Object.values(stockByWarna).some((stockId) => !stockOptionIds.has(stockId))) {
        variantError = "Stok hijab yang dipilih tidak sesuai dengan model hijab.";
        return;
      }
    }
    if (variantList.some((variant) => variant.nama_varian.trim().toLowerCase() === name.toLowerCase())) {
      variantError = "Nama varian sudah digunakan pada model ini.";
      return;
    }
    const variantSizes = variantModel.ukuran_tersedia;
    if (fVariantSellingMode === "custom" && variantSizes.some((ukuran) => Number(fVariantSellingPricesBySize[ukuran]) <= 0)) {
      variantError = "Isi harga jual custom untuk semua ukuran.";
      return;
    }
    if (fVariantProductionMode === "custom" && variantSizes.some((ukuran) => Number(fVariantProductionPricesBySize[ukuran]) <= 0)) {
      variantError = "Isi harga produksi custom untuk semua ukuran.";
      return;
    }

    const stokModelId = variantModel.stok_model_id ?? variantModel.id;
    const stokModelNama = modelList.find((model) => model.id === stokModelId)?.nama_model ?? variantModel.nama_model;
    const komponen: KomponenVarianPenjualan[] = [
      {
        tipe: "model_baju",
        ref_id: stokModelId,
        nama: stokModelNama,
        jumlah: 1,
        kelola_stok: true,
      },
    ];
    const modelHijab = modelHijabList.find((item) => item.id === fVariantHijabId);
    const fallbackStockId = usePerWarna ? Object.values(stockByWarna)[0] : fVariantAccessoryId;
    const accessory = stokHijabList.find((item) => item.id === fallbackStockId && (!item.model_hijab_id || item.model_hijab_id === fVariantHijabId));
    const accessoryQty = Math.max(1, Number(fVariantAccessoryQty) || 1);
    if (modelHijab || accessory) {
      komponen.push({
        tipe: "aksesori",
        nama: modelHijab?.nama_hijab ?? accessory?.nama_hijab ?? "Hijab",
        jumlah: accessoryQty,
        kelola_stok: Boolean(modelHijab?.id || accessory),
        ...(accessory?.id ? { ref_id: accessory.id, stok_hijab_id: accessory.id } : {}),
        ...(modelHijab?.id ? { model_hijab_id: modelHijab.id } : {}),
        ...(usePerWarna ? { stok_hijab_per_warna: stockByWarna } : {}),
      });
    }

    variantList = [
      ...variantList,
      {
        id: variantId(),
        nama_varian: name,
        ...(fVariantSku.trim() ? { sku: fVariantSku.trim() } : {}),
        harga_jual_mode: fVariantSellingMode,
        ...(fVariantSellingMode === "custom"
          ? {
              harga_jual_per_ukuran: cleanPriceMap(Object.fromEntries(
                Object.entries(fVariantSellingPricesBySize).map(([ukuran, value]) => [ukuran, Number(value) || 0]),
              ) as Partial<Record<UkuranBaju, number>>),
            }
          : {}),
        harga_produksi_mode: fVariantProductionMode,
        ...(fVariantProductionMode === "custom"
          ? {
              harga_produksi_per_ukuran: cleanPriceMap(Object.fromEntries(
                Object.entries(fVariantProductionPricesBySize).map(([ukuran, value]) => [ukuran, Number(value) || 0]),
              ) as Partial<Record<UkuranBaju, number>>),
            }
          : {}),
        komponen,
        aktif: true,
      },
    ];
    resetVariantForm();
  }

  function updateVariant(index: number, patch: Partial<VarianPenjualan>) {
    variantList = variantList.map((variant, itemIndex) =>
      itemIndex === index ? { ...variant, ...patch } : variant,
    );
  }

  function updateVariantComponent(variantIndex: number, componentIndex: number, patch: Partial<KomponenVarianPenjualan>) {
    variantList = variantList.map((variant, index) => {
      if (index !== variantIndex) return variant;
      return {
        ...variant,
        komponen: variant.komponen.map((component, itemIndex) =>
          itemIndex === componentIndex ? { ...component, ...patch } : component,
        ),
      };
    });
  }

  function stockIdForComponent(component: KomponenVarianPenjualan): string {
    return component.stok_hijab_id ?? component.ref_id ?? "";
  }

  function modelHijabIdForComponent(component: KomponenVarianPenjualan): string {
    const stock = stokHijabList.find((item) => item.id === stockIdForComponent(component));
    return component.model_hijab_id ?? stock?.model_hijab_id ?? "";
  }

  function stokUntukModelHijab(modelId: string): StokHijab[] {
    return stokHijabList.filter((item) => item.model_hijab_id === modelId);
  }

  function labelStokHijab(item: StokHijab): string {
    return item.nama_warna ? `${item.nama_hijab} · ${item.nama_warna}` : item.nama_hijab;
  }

  function pilihHijabBaru(modelId: string) {
    fVariantHijabId = modelId === "__none__" ? "" : modelId;
    // Default add-on follows clothing color. Fixed color is optional.
    fVariantAccessoryId = "";
    fVariantMappingMode = "global";
    fVariantStockByWarna = {};
  }

  function pilihModePemetaanBaru(mode: "global" | "per_warna") {
    fVariantMappingMode = mode;
    if (mode !== "per_warna") {
      fVariantStockByWarna = {};
      fVariantAccessoryId = "";
      return;
    }
    const seed = fVariantAccessoryId;
    fVariantStockByWarna = Object.fromEntries(
      (variantModel?.warna_tersedia ?? []).map((warna) => [warnaMappingKey(warna.warna_id, warna.nama_warna), seed]),
    );
  }

  function pilihModelHijabUntukKomponen(variantIndex: number, componentIndex: number, modelId: string) {
    const model = modelHijabList.find((item) => item.id === modelId);
    updateVariantComponent(variantIndex, componentIndex, model
      ? { model_hijab_id: model.id, ref_id: undefined, stok_hijab_id: undefined, nama: model.nama_hijab, kelola_stok: true, stok_hijab_per_warna: undefined }
      : { model_hijab_id: undefined, ref_id: undefined, stok_hijab_id: undefined, kelola_stok: false });
  }

  function pilihStokHijabUntukKomponen(variantIndex: number, componentIndex: number, stockId: string) {
    const component = variantList[variantIndex]?.komponen[componentIndex];
    if (!component) return;
    if (stockId === "__auto__") {
      updateVariantComponent(variantIndex, componentIndex, {
        ref_id: undefined,
        stok_hijab_id: undefined,
        kelola_stok: true,
        stok_hijab_per_warna: undefined,
      });
      return;
    }
    const stock = stokHijabList.find((item) => item.id === stockId);
    updateVariantComponent(variantIndex, componentIndex, stock
      ? { ref_id: stock.id, stok_hijab_id: stock.id, model_hijab_id: stock.model_hijab_id, nama: modelHijabList.find((item) => item.id === stock.model_hijab_id)?.nama_hijab ?? stock.nama_hijab, kelola_stok: true, stok_hijab_per_warna: undefined }
      : { ref_id: undefined, stok_hijab_id: undefined, kelola_stok: false, stok_hijab_per_warna: undefined });
  }

  function modePemetaanKomponen(component: KomponenVarianPenjualan): "global" | "per_warna" {
    return component.stok_hijab_per_warna && Object.keys(component.stok_hijab_per_warna).length > 0
      ? "per_warna"
      : "global";
  }

  function pilihModePemetaanKomponen(variantIndex: number, componentIndex: number, mode: "global" | "per_warna") {
    const component = variantList[variantIndex]?.komponen[componentIndex];
    if (!component) return;
    if (mode === "global") {
      updateVariantComponent(variantIndex, componentIndex, {
        ref_id: undefined,
        stok_hijab_id: undefined,
        stok_hijab_per_warna: undefined,
        kelola_stok: true,
      });
      return;
    }
    const seed = stockIdForComponent(component);
    const mapping = Object.fromEntries(
      (variantModel?.warna_tersedia ?? []).map((warna) => [warnaMappingKey(warna.warna_id, warna.nama_warna), seed]),
    );
    updateVariantComponent(variantIndex, componentIndex, {
      stok_hijab_per_warna: mapping,
    });
  }

  function pilihStokHijabPerWarna(
    variantIndex: number,
    componentIndex: number,
    warna: WarnaTersedia,
    stockId: string,
  ) {
    const component = variantList[variantIndex]?.komponen[componentIndex];
    if (!component) return;
    const key = warnaMappingKey(warna.warna_id, warna.nama_warna);
    const mapping = { ...(component.stok_hijab_per_warna ?? {}) };
    if (stockId === "__none__") delete mapping[key];
    else mapping[key] = stockId;
    const firstStockId = Object.values(mapping)[0];
    updateVariantComponent(variantIndex, componentIndex, {
      stok_hijab_per_warna: Object.keys(mapping).length > 0 ? mapping : undefined,
      ...(firstStockId ? { ref_id: firstStockId, stok_hijab_id: firstStockId } : {}),
    });
  }

  function cleanVariantComponent(component: KomponenVarianPenjualan): KomponenVarianPenjualan {
    const { ref_id, model_hijab_id, stok_hijab_id, stok_hijab_per_warna, ...rest } = component;
    const mapping = stok_hijab_per_warna && Object.keys(stok_hijab_per_warna).length > 0
      ? stok_hijab_per_warna
      : undefined;
    return {
      ...rest,
      ...(ref_id ? { ref_id } : {}),
      ...(model_hijab_id ? { model_hijab_id } : {}),
      ...(stok_hijab_id ? { stok_hijab_id } : {}),
      ...(mapping ? { stok_hijab_per_warna: mapping } : {}),
    };
  }

  function removeVariant(index: number) {
    variantList = variantList.filter((_, itemIndex) => itemIndex !== index);
  }

  async function saveVariants() {
    if (!variantModel) return;
    const validVariants = variantList
      .map((variant) => ({
        ...variant,
        nama_varian: variant.nama_varian.trim(),
        komponen: variant.komponen
          .filter((component) => component.jumlah > 0)
          .map(cleanVariantComponent),
      }))
      .filter((variant) => variant.nama_varian);
    if (new Set(validVariants.map((variant) => variant.nama_varian.toLowerCase())).size !== validVariants.length) {
      variantError = "Nama varian tidak boleh sama.";
      return;
    }
    const warnaModel = variantModel.warna_tersedia ?? [];
    for (const variant of validVariants) {
      if (variantPriceMode(variant, "jual") === "custom") {
        const priceMap = variantPriceMap(variant, "jual");
        if (variantModel.ukuran_tersedia.some((ukuran) => !(priceMap[ukuran] && priceMap[ukuran]! > 0))) {
          variantError = `Isi harga jual custom untuk semua ukuran pada ${variant.nama_varian}.`;
          return;
        }
      }
      if (variantPriceMode(variant, "produksi") === "custom") {
        const priceMap = variantPriceMap(variant, "produksi");
        if (variantModel.ukuran_tersedia.some((ukuran) => !(priceMap[ukuran] && priceMap[ukuran]! > 0))) {
          variantError = `Isi harga produksi custom untuk semua ukuran pada ${variant.nama_varian}.`;
          return;
        }
      }
      for (const component of variant.komponen) {
        const mapping = component.stok_hijab_per_warna;
        if (!mapping || Object.keys(mapping).length === 0 || warnaModel.length === 0) continue;
        const missing = warnaModel.filter(
          (warna) => !mapping[warnaMappingKey(warna.warna_id, warna.nama_warna)],
        );
        if (missing.length > 0) {
          variantError = `Pemetaan stok hijab pada ${variant.nama_varian} belum lengkap.`;
          return;
        }
      }
    }

    variantSaving = true;
    variantError = null;
    try {
      const firestoreVariants = validVariants.map((variant) => {
        const {
          sku,
          harga_jual,
          harga_produksi,
          harga_jual_mode,
          harga_jual_per_ukuran,
          harga_produksi_mode,
          harga_produksi_per_ukuran,
          ...rest
        } = variant;
        const jualMode = variantPriceMode(variant, "jual");
        const produksiMode = variantPriceMode(variant, "produksi");
        return {
          ...rest,
          ...(sku?.trim() ? { sku: sku.trim() } : {}),
          harga_jual_mode: jualMode,
          harga_jual_per_ukuran: jualMode === "custom"
            ? cleanPriceMap(variantPriceMap(variant, "jual"))
            : {},
          harga_produksi_mode: produksiMode,
          harga_produksi_per_ukuran: produksiMode === "custom"
            ? cleanPriceMap(variantPriceMap(variant, "produksi"))
            : {},
        };
      });
      await updateModelBaju(variantModel.id, { varian_penjualan: firestoreVariants });
      await load(true);
      openVarian = false;
      variantModel = null;
      showSuccess("Varian penjualan berhasil disimpan.");
    } catch (e: unknown) {
      variantError = e instanceof Error ? e.message : "Gagal menyimpan varian penjualan.";
    } finally {
      variantSaving = false;
    }
  }

  function bukaAdd() {
    resetForm();
    openForm = true;
  }

  function bukaEdit(model: ModelBaju) {
    editingId = model.id;
    fNama = model.nama_model;
    fStokModelId = model.stok_model_id ?? "";
    fFotoUrl = model.foto_url ?? "";
    fFotoFile = null;
    fDeskripsi = model.deskripsi ?? "";
    fUkuran = [...model.ukuran_tersedia];
    fWarna = model.stok_model_id ? [] : [...(model.warna_tersedia ?? [])];
    fHargaJualByUkuran = Object.fromEntries(
      Object.entries(model.harga_jual_per_ukuran ?? {}).map(([ukuran, value]) => [
        ukuran,
        value != null ? String(value) : "",
      ]),
    ) as Partial<Record<UkuranBaju, string>>;
    fHargaProduksiByUkuran = Object.fromEntries(
      Object.entries(model.harga_produksi_per_ukuran ?? {}).map(([ukuran, value]) => [ukuran, value != null ? String(value) : ""]),
    ) as Partial<Record<UkuranBaju, string>>;
    fKebutuhanYard = Object.fromEntries(
      Object.entries(model.kebutuhan_yard_per_pcs ?? {}).map(([ukuran, value]) => [
        ukuran,
        value != null ? String(value) : "",
      ]),
    ) as Partial<Record<UkuranBaju, string>>;
    fTarifCutting = model.tarif_cutting != null ? String(model.tarif_cutting) : "";
    fTarifJahit = model.tarif_jahit != null ? String(model.tarif_jahit) : "";
    fTarifSteam = model.tarif_steam != null ? String(model.tarif_steam) : "";
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
      const [warna, stokHijab, modelHijab] = await Promise.all([
        warnaCache.get(force),
        stokHijabCache.get(force),
        modelHijabCache.get(force),
      ]);
      warnaList = warna;
      stokHijabList = stokHijab;
      const stokPerModel = new Map<string, number>();
      for (const item of stokHijab) {
        if (item.model_hijab_id) stokPerModel.set(item.model_hijab_id, (stokPerModel.get(item.model_hijab_id) ?? 0) + item.stok_tersedia);
      }
      modelHijabList = modelHijab.map((item) => ({ ...item, stok_tersedia: stokPerModel.get(item.id) ?? 0 }));
      await fetchModels(force);
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
      let fotoUrl = fFotoUrl;
      if (fFotoFile) fotoUrl = await uploadToCloudinary(fFotoFile, 'products');
      const linkedToSource = Boolean(fStokModelId);
      const ownYard = Object.fromEntries(
        fUkuran
          .map((ukuran) => [ukuran, Number(fKebutuhanYard[ukuran]) || 0] as const)
          .filter(([, value]) => value > 0),
      );
      const ownSellingPrices = Object.fromEntries(
        fUkuran
          .map((ukuran) => [ukuran, Number(fHargaJualByUkuran[ukuran]) || 0] as const)
          .filter(([, value]) => value > 0),
      );
      const ownProductionPrices = Object.fromEntries(
        fUkuran
          .map((ukuran) => [ukuran, Number(fHargaProduksiByUkuran[ukuran]) || 0] as const)
          .filter(([, value]) => value > 0),
      );
      const input = {
        nama_model: fNama.trim(),
        stok_model_id: fStokModelId || null,
        ...(fotoUrl ? { foto_url: fotoUrl } : {}),
        ...(fDeskripsi.trim() ? { deskripsi: fDeskripsi.trim() } : {}),
        ukuran_tersedia: fUkuran,
        warna_tersedia: linkedToSource ? [] : fWarna.length > 0 ? fWarna : [],
        // Linked models inherit these values from their source model.
        kebutuhan_yard_per_pcs: linkedToSource ? {} : ownYard,
        harga_jual: 0,
        harga_jual_per_ukuran: linkedToSource ? {} : ownSellingPrices,
        harga_produksi: 0,
        harga_produksi_per_ukuran: linkedToSource ? {} : ownProductionPrices,
        tarif_cutting: linkedToSource ? 0 : Number(fTarifCutting) || 0,
        tarif_jahit: linkedToSource ? 0 : Number(fTarifJahit) || 0,
        tarif_steam: linkedToSource ? 0 : Number(fTarifSteam) || 0,
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
      Kelola katalog model produksi
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
      value={searchQuery}
      oninput={(event) => setSearch((event.currentTarget as HTMLInputElement).value)}
      class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
    />
  </div>

  <!-- Toggle nonaktif -->
  <button
    onclick={toggleTampilNonaktif}
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
      {@const addOns = getAddOnPenjualan(model)}

      <div
        class="flex flex-col overflow-hidden rounded-xl border {nonaktif
          ? 'border-gray-200 opacity-70'
          : 'border-gray-100'} bg-white shadow-sm transition hover:shadow-md"
      >
        <div class="flex h-44 w-full items-center justify-center overflow-hidden bg-gray-50">
          {#if model.foto_url && !failedPhotos[model.id]}
            <img
              src={model.foto_url}
              alt={model.nama_model}
              class="h-full w-full object-contain"
              loading="lazy"
              onerror={() => markPhotoFailed(model.id)}
            />
          {:else}
            <div class="flex flex-col items-center gap-2 text-gray-400">
              <ShirtIcon class="h-10 w-10" />
              <span class="text-xs">{model.foto_url ? "Foto tidak dapat dimuat" : "Foto belum tersedia"}</span>
            </div>
          {/if}
        </div>
        <!-- Card Header -->
        <div
          class="flex items-start justify-between border-b border-gray-100 px-5 py-4"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-gray-900">
              {model.nama_model}
            </p>
            {#if model.deskripsi}
              <p class="mt-0.5 line-clamp-1 text-xs text-gray-400">
                {model.deskripsi}
              </p>
            {/if}
          </div>
          <span
            class="ml-2 shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
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
                  class="rounded-full border border-border bg-transparent px-2.5 py-0.5 text-xs font-semibold
                  {model.ukuran_tersedia.includes(u)
                    ? 'text-foreground'
                    : 'text-muted-foreground/50'}"
                >
                  {u}
                </span>
              {/each}
            </div>
          </div>

          <!-- Warna Tersedia -->
          {#if !model.stok_model_id && (model.warna_tersedia ?? []).length > 0}
            <div>
              <p class="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Warna Tersedia
              </p>
              <details class="group">
                <summary class="flex cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-transparent px-2.5 py-2 text-xs text-muted-foreground transition hover:bg-muted">
                  <span class="flex items-center -space-x-1">
                    {#each (model.warna_tersedia ?? []).slice(0, 6) as w}
                      <span
                        class="h-4 w-4 rounded-full border-2 border-background ring-1 ring-black/10"
                        style="background-color: {w.kode_hex}"
                        title={w.nama_warna}
                      ></span>
                    {/each}
                  </span>
                  <span class="font-medium">{(model.warna_tersedia ?? []).length} warna</span>
                  <span class="ml-auto text-[11px] text-gray-400 transition-transform group-open:rotate-180">⌄</span>
                </summary>
                <div class="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
                  {#each model.warna_tersedia ?? [] as w}
                    <span class="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-2 py-1 text-[11px] text-muted-foreground">
                      <span class="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style="background-color: {w.kode_hex}"></span>
                      {w.nama_warna}
                    </span>
                  {/each}
                </div>
              </details>
            </div>
          {/if}

          {#if model.stok_model_id}
            <div class="rounded-md border border-border bg-transparent px-2.5 py-2 text-xs text-muted-foreground">
              Stok mengikuti: <span class="font-semibold text-foreground">{modelList.find((item) => item.id === model.stok_model_id)?.nama_model ?? "Model lain"}</span>
            </div>
          {/if}

          {#if addOns.length > 0}
            <div>
              <p class="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Add-on Penjualan
              </p>
              <div class="space-y-1.5">
              {#each addOns as variant}
                <div class="flex items-center justify-between gap-2 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs">
                  <span class="min-w-0 truncate font-medium text-foreground">{variant.nama_varian}</span>
                  <span class="shrink-0 text-muted-foreground">{variant.komponen.filter((component) => component.tipe === "aksesori").map((component) => `${component.jumlah}x ${component.nama}`).join(", ")}</span>
                </div>
              {/each}
              </div>
            </div>
          {/if}

          {#if Object.values(model.kebutuhan_yard_per_pcs ?? {}).some((v) => (v ?? 0) > 0)}
            <div>
              <p class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Kebutuhan Yard / Pcs
              </p>
              <div class="flex flex-wrap gap-1.5 text-xs">
                {#each UKURAN_ORDER.filter((u) => model.kebutuhan_yard_per_pcs?.[u]) as u}
                  <span class="rounded-md border border-border bg-transparent px-2 py-0.5 font-medium text-muted-foreground">
                    {u}: {model.kebutuhan_yard_per_pcs?.[u]} yd
                  </span>
                {/each}
              </div>
            </div>
          {/if}

          {#if $isOwner}
          <!-- Harga per ukuran -->
          <div class="border-t border-gray-100 pt-2.5">
            <p class="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Harga Jual / Ukuran
            </p>
            <div class="flex flex-wrap gap-1.5 text-xs">
              {#each UKURAN_ORDER.filter((u) => model.ukuran_tersedia.includes(u)) as u}
                <span class="rounded-md border border-border bg-transparent px-2 py-0.5 font-medium text-muted-foreground">
                  {u}: {model.harga_jual_per_ukuran?.[u] ? `Rp${model.harga_jual_per_ukuran[u].toLocaleString("id-ID")}` : "-"}
                </span>
              {/each}
            </div>
          </div>

          <div>
            <p class="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Harga Produksi / Ukuran
            </p>
            <div class="flex flex-wrap gap-1.5 text-xs">
              {#each UKURAN_ORDER.filter((u) => model.ukuran_tersedia.includes(u)) as u}
                <span class="rounded-md border border-border bg-transparent px-2 py-0.5 font-medium text-muted-foreground">
                  {u}: {model.harga_produksi_per_ukuran?.[u] ? `Rp${model.harga_produksi_per_ukuran[u].toLocaleString("id-ID")}` : "-"}
                </span>
              {/each}
            </div>
          </div>

          <!-- Tarif Default -->
          {#if (model.tarif_cutting || model.tarif_jahit || model.tarif_steam)}
            <div>
              <p class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Tarif Default Produksi
              </p>
              <div class="flex flex-wrap gap-1.5 text-xs">
                {#if model.tarif_cutting}
                  <span class="rounded-md border border-border bg-transparent px-2 py-0.5 font-medium text-muted-foreground">Cut: Rp{model.tarif_cutting.toLocaleString("id-ID")}</span>
                {/if}
                {#if model.tarif_jahit}
                  <span class="rounded-md border border-border bg-transparent px-2 py-0.5 font-medium text-muted-foreground">Jahit: Rp{model.tarif_jahit.toLocaleString("id-ID")}</span>
                {/if}
                {#if model.tarif_steam}
                  <span class="rounded-md border border-border bg-transparent px-2 py-0.5 font-medium text-muted-foreground">Steam: Rp{model.tarif_steam.toLocaleString("id-ID")}</span>
                {/if}
              </div>
            </div>
          {/if}
          {/if}
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
                class="w-full border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                onclick={() => openVariantManager(model)}
              >
                Kelola Add-on
              </Button>
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
  <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400">
    Menampilkan {filteredList.length} dari {tampilNonaktif
      ? modelList.length
      : totalAktif} model
  </div>
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

        <!-- Sumber stok barang jadi -->
        <div>
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="stok-model">
            Kaitkan stok ke model lain <span class="text-xs font-normal text-gray-400">(opsional)</span>
          </label>
          <select
            id="stok-model"
            value={fStokModelId}
            onchange={(event) => pilihSumberStok((event.currentTarget as HTMLSelectElement).value)}
            class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">Gunakan stok model ini sendiri</option>
            {#each modelList.filter((model) => model.id !== editingId && model.aktif) as sourceModel}
              <option value={sourceModel.id}>{sourceModel.nama_model}</option>
            {/each}
          </select>
           <p class="mt-1.5 text-[11px] text-gray-400">
             Model ini tetap punya identitas sendiri, tetapi stok, warna, yard, tarif, dan HPP baju mengikuti model sumber. Harga paket diatur melalui Add-on.
           </p>
        </div>

        <!-- Foto produk -->
        <div>
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="foto-model">
            Foto Produk <span class="text-xs font-normal text-gray-400">(opsional)</span>
          </label>
          {#if fFotoUrl}
            <img src={fFotoUrl} alt="Preview {fNama || 'produk'}" class="mb-2 h-24 w-24 rounded-lg border border-gray-200 object-cover" />
          {/if}
          <input
            id="foto-model"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onchange={(event) => {
              const file = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
              if (file && file.size > 10 * 1024 * 1024) {
                showError('Ukuran foto maksimal 10 MB.');
                (event.currentTarget as HTMLInputElement).value = '';
                fFotoFile = null;
                return;
              }
              fFotoFile = file;
            }}
            class="block w-full cursor-pointer rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-medium"
          />
          <p class="mt-1 text-[11px] text-gray-400">JPG, PNG, atau WebP. Maksimal 10 MB.</p>
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

        <!-- Warna Tersedia: model turunan mengikuti warna dari sumber stok -->
        {#if !fStokModelId}
          <div>
          <label class="mb-1.5 block text-sm font-medium text-gray-700">
            Warna Tersedia
            <span class="text-xs font-normal text-gray-400">(opsional)</span>
          </label>
          {#if warnaList.length === 0}
            <p class="text-xs text-gray-400">
              Belum ada warna terdaftar.
              <a href="/warna" class="text-blue-500 hover:underline">Tambah warna →</a>
            </p>
          {:else}
            <Popover.Root>
              <Popover.Trigger
                class="flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {#if fWarna.length === 0}
                  <span class="text-muted-foreground">— Pilih warna —</span>
                {:else}
                  <div class="flex flex-wrap gap-1.5">
                    {#each fWarna as w}
                      <span
                        class="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700"
                      >
                        <span
                          class="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
                          style="background-color: {w.kode_hex}"
                        ></span>
                        {w.nama_warna}
                      </span>
                    {/each}
                  </div>
                {/if}
                <svg
                  class="ml-2 h-4 w-4 shrink-0 opacity-50"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="2"
                  stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </Popover.Trigger>
              <Popover.Content class="w-[--bits-popover-anchor-width] overflow-hidden p-1" align="start">
                <div class="border-b border-border p-1">
                  <button
                    type="button"
                    onclick={toggleSemuaWarna}
                    class="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs font-medium text-primary hover:bg-accent"
                  >
                    <span>{warnaList.length > 0 && warnaList.every((warna) => isWarnaSelected(warna.id)) ? "Hapus semua" : "Pilih semua"}</span>
                    <span class="text-muted-foreground">{fWarna.length}/{warnaList.length}</span>
                  </button>
                </div>
                <div class="max-h-[min(16rem,var(--bits-popover-content-available-height))] overflow-y-auto">
                  {#each warnaList as w}
                    {@const selected = isWarnaSelected(w.id)}
                    <button
                      type="button"
                      onclick={() => toggleWarna(w)}
                      class="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <span
                        class="inline-block h-4 w-4 shrink-0 rounded-full border border-black/10 shadow-sm"
                        style="background-color: {w.kode_hex}"
                      ></span>
                      <span class="flex-1 text-left">{w.nama_warna}</span>
                      {#if selected}
                        <svg
                          class="h-4 w-4 shrink-0 text-primary"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke-width="2.5"
                          stroke="currentColor"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      {:else}
                        <span class="h-4 w-4 shrink-0"></span>
                      {/if}
                    </button>
                  {/each}
                </div>
              </Popover.Content>
            </Popover.Root>
          {/if}
        </div>
        {/if}

        {#if $isOwner && !fStokModelId}
        <!-- Harga (Opsional) -->
        <div class="rounded-lg border border-gray-200 bg-gray-50/70 p-3.5 space-y-2.5">
          <div>
            <p class="text-xs font-semibold text-gray-800">Harga per Ukuran (Opsional)</p>
            <p class="text-[11px] text-gray-500">Masukkan harga jual dan harga produksi untuk setiap ukuran.</p>
          </div>
          {#if fUkuran.length > 0}
            <div class="border-t border-gray-200 pt-2.5">
              <p class="mb-1.5 text-[11px] font-medium text-gray-700">Harga jual per ukuran</p>
              <p class="mb-2 text-[11px] text-gray-500">Harga jual tiap ukuran.</p>
              <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {#each fUkuran as ukuran}
                  <div>
                    <label class="mb-1 block text-[11px] font-medium text-gray-700" for={`harga-jual-${ukuran}`}>
                      {ukuran}
                    </label>
                    <div class="relative">
                      <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rp</span>
                      <Input
                        id={`harga-jual-${ukuran}`}
                        type="number"
                        min="0"
                        placeholder="0"
                        value={fHargaJualByUkuran[ukuran] ?? ""}
                        oninput={(e) => {
                          fHargaJualByUkuran = {
                            ...fHargaJualByUkuran,
                            [ukuran]: (e.currentTarget as HTMLInputElement).value,
                          };
                        }}
                        class="h-8 pl-7 text-xs"
                      />
                    </div>
                  </div>
                {/each}
              </div>
            </div>
            <div class="border-t border-gray-200 pt-2.5">
              <p class="mb-1.5 text-[11px] font-medium text-gray-700">Harga produksi per ukuran</p>
              <p class="mb-2 text-[11px] text-gray-500">Harga pokok produksi tiap ukuran.</p>
              <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {#each fUkuran as ukuran}
                  <div>
                    <label class="mb-1 block text-[11px] font-medium text-gray-700" for={`harga-produksi-${ukuran}`}>
                      {ukuran}
                    </label>
                    <div class="relative">
                      <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rp</span>
                      <Input
                        id={`harga-produksi-${ukuran}`}
                        type="number"
                        min="0"
                        placeholder="0"
                        value={fHargaProduksiByUkuran[ukuran] ?? ""}
                        oninput={(e) => {
                          fHargaProduksiByUkuran = {
                            ...fHargaProduksiByUkuran,
                            [ukuran]: (e.currentTarget as HTMLInputElement).value,
                          };
                        }}
                        class="h-8 pl-7 text-xs"
                      />
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
        {:else if $isOwner && fStokModelId}
          <div class="rounded-lg border border-blue-100 bg-blue-50/60 p-3.5">
            <p class="text-xs font-semibold text-blue-800">Harga dan biaya mengikuti model sumber</p>
            <p class="mt-1 text-[11px] text-blue-700">
              Harga jual paket, jika berbeda, diatur pada Kelola Add-on. HPP baju dan biaya produksi tidak diisi ulang di model ini.
            </p>
          </div>
        {/if}

        {#if fUkuran.length > 0}
          <div class="rounded-lg border border-gray-200 bg-gray-50/70 p-3.5 space-y-2.5">
            <div>
              <p class="text-xs font-semibold text-gray-800">Kebutuhan Yard / Pcs</p>
              <p class="text-[11px] text-gray-500">
                {#if fStokModelId}
                  Mengikuti {linkedSourceModel?.nama_model ?? "model sumber"}; tidak dihitung ulang untuk model ini.
                {:else}
                  Dipakai otomatis saat membuat order cutting. Bisa dikosongkan jika belum pasti.
                {/if}
              </p>
            </div>
            {#if fStokModelId}
              <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {#each UKURAN_ORDER.filter((ukuran) => (linkedSourceModel?.ukuran_tersedia ?? fUkuran).includes(ukuran)) as ukuran}
                  <div class="rounded-md border border-gray-200 bg-white px-2.5 py-2 text-xs text-gray-600">
                    <span class="font-medium text-gray-800">{ukuran}</span>
                    <span class="ml-1">{linkedSourceModel?.kebutuhan_yard_per_pcs?.[ukuran] ? `${linkedSourceModel.kebutuhan_yard_per_pcs[ukuran]} yd` : "-"}</span>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {#each fUkuran as ukuran}
                  <div>
                    <label class="block text-[11px] font-medium text-gray-700 mb-1" for={`kebutuhan-yard-${ukuran}`}>
                      {ukuran}
                    </label>
                    <div class="relative">
                      <Input
                        id={`kebutuhan-yard-${ukuran}`}
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="0"
                        value={fKebutuhanYard[ukuran] ?? ""}
                        oninput={(e) => {
                          fKebutuhanYard = {
                            ...fKebutuhanYard,
                            [ukuran]: (e.currentTarget as HTMLInputElement).value,
                          };
                        }}
                        class="pr-10 text-xs h-8"
                      />
                      <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">yd</span>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        {#if $isOwner && !fStokModelId}
        <!-- Tarif Default Produksi (Opsional) -->
        <div class="rounded-lg border border-gray-200 bg-gray-50/70 p-3.5 space-y-2.5">
          <div>
            <p class="text-xs font-semibold text-gray-800">Tarif Default Produksi (Opsional)</p>
            <p class="text-[11px] text-gray-500">Tarif standar per pcs untuk mempermudah pengisian cetak gaji.</p>
          </div>
          <div class="grid grid-cols-3 gap-2.5">
            <div>
              <label class="block text-[11px] font-medium text-gray-700 mb-1">Cutting / Pcs</label>
              <div class="relative">
                <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rp</span>
                <Input type="number" min="0" placeholder="0" bind:value={fTarifCutting} class="pl-7 text-xs h-8" />
              </div>
            </div>
            <div>
              <label class="block text-[11px] font-medium text-gray-700 mb-1">Jahit / Pcs</label>
              <div class="relative">
                <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rp</span>
                <Input type="number" min="0" placeholder="0" bind:value={fTarifJahit} class="pl-7 text-xs h-8" />
              </div>
            </div>
            <div>
              <label class="block text-[11px] font-medium text-gray-700 mb-1">Steam / Pcs</label>
              <div class="relative">
                <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rp</span>
                <Input type="number" min="0" placeholder="0" bind:value={fTarifSteam} class="pl-7 text-xs h-8" />
              </div>
            </div>
          </div>
        </div>
        {:else if $isOwner && fStokModelId}
          <div class="rounded-lg border border-blue-100 bg-blue-50/60 p-3.5">
            <p class="text-xs font-semibold text-blue-800">Tarif mengikuti model sumber</p>
            <p class="mt-1 text-[11px] text-blue-700">Cutting, jahit, dan steam hanya dihitung satu kali dari model sumber.</p>
          </div>
        {/if}
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
  bind:open={openVarian}
  onOpenChange={(open) => {
    if (!open) {
      variantModel = null;
      resetVariantForm();
    }
  }}
>
  <Dialog.Content class="flex max-h-[90vh] max-w-xl flex-col gap-0 p-0">
    <Dialog.Header class="shrink-0 px-6 pb-2 pt-6">
    <Dialog.Title>Add-on Penjualan</Dialog.Title>
      <Dialog.Description>
        Tambahkan bentuk paket seperti set hijab. Model utama tetap berdiri sendiri dan stok baju mengikuti model yang sudah dikaitkan.
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex-1 space-y-4 overflow-y-auto px-6 py-5">
      <div class="rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-3 text-xs text-blue-800">
        Semua add-on memakai stok model sumber berdasarkan warna dan ukuran. Harga paket bisa mengikuti induk + add-on atau diatur custom per ukuran. Kebutuhan yard dan tarif tetap mengikuti model sumber, sedangkan stok hijab ikut berkurang sesuai jumlah per set.
      </div>

      <div class="space-y-2.5">
        <p class="text-sm font-semibold text-gray-800">Add-on tersimpan</p>
        {#each variantList as variant, index}
          <div class="rounded-lg border border-gray-200 bg-gray-50/70 p-3.5">
            <div class="grid gap-2.5 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end">
              <div>
                <label class="mb-1 block text-[11px] font-medium text-gray-600" for={`variant-name-${variant.id}`}>Nama add-on</label>
                <Input
                  id={`variant-name-${variant.id}`}
                  value={variant.nama_varian}
                  oninput={(event) => updateVariant(index, { nama_varian: (event.currentTarget as HTMLInputElement).value })}
                />
              </div>
              {#if $isOwner}
              <div>
                <label class="mb-1 block text-[11px] font-medium text-gray-600" for={`variant-price-mode-${variant.id}`}>Harga jual</label>
                <select
                  id={`variant-price-mode-${variant.id}`}
                  value={variantPriceMode(variant, "jual")}
                  onchange={(event) => updateVariantPriceMode(index, "jual", (event.currentTarget as HTMLSelectElement).value as ModeHargaVarian)}
                  class="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  <option value="induk_plus_addon">Induk + Add-on</option>
                  <option value="custom">Harga custom</option>
                </select>
              </div>
              <div>
                <label class="mb-1 block text-[11px] font-medium text-gray-600" for={`variant-production-price-mode-${variant.id}`}>Harga produksi</label>
                <select
                  id={`variant-production-price-mode-${variant.id}`}
                  value={variantPriceMode(variant, "produksi")}
                  onchange={(event) => updateVariantPriceMode(index, "produksi", (event.currentTarget as HTMLSelectElement).value as ModeHargaVarian)}
                  class="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  <option value="induk_plus_addon">Induk + Add-on</option>
                  <option value="custom">Harga custom</option>
                </select>
              </div>
              {/if}
              <button
                type="button"
                class="inline-flex h-9 items-center justify-center rounded-md border border-red-200 px-2.5 text-xs font-medium text-red-600 hover:bg-red-50"
                onclick={() => removeVariant(index)}
                aria-label={`Hapus add-on ${variant.nama_varian}`}
              >
                Hapus
              </button>
            </div>
            {#if $isOwner && variantPriceMode(variant, "jual") === "custom"}
              <div class="mt-2 rounded-md border border-gray-200 bg-white p-2.5">
                <p class="mb-2 text-[11px] font-medium text-gray-600">Harga jual custom / ukuran</p>
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {#each variantModel?.ukuran_tersedia ?? [] as ukuran}
                    <div>
                      <label class="mb-1 block text-[10px] text-gray-500" for={`variant-selling-price-${variant.id}-${ukuran}`}>{ukuran}</label>
                      <Input
                        id={`variant-selling-price-${variant.id}-${ukuran}`}
                        type="number"
                        min="0"
                        value={variantPriceMap(variant, "jual")[ukuran] != null ? String(variantPriceMap(variant, "jual")[ukuran]) : ""}
                        oninput={(event) => updateVariantPrice(index, "jual", ukuran, (event.currentTarget as HTMLInputElement).value)}
                        class="h-8 text-xs"
                      />
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
            {#if $isOwner && variantPriceMode(variant, "produksi") === "custom"}
              <div class="mt-2 rounded-md border border-gray-200 bg-white p-2.5">
                <p class="mb-2 text-[11px] font-medium text-gray-600">Harga produksi custom / ukuran</p>
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {#each variantModel?.ukuran_tersedia ?? [] as ukuran}
                    <div>
                      <label class="mb-1 block text-[10px] text-gray-500" for={`variant-production-price-${variant.id}-${ukuran}`}>{ukuran}</label>
                      <Input
                        id={`variant-production-price-${variant.id}-${ukuran}`}
                        type="number"
                        min="0"
                        value={variantPriceMap(variant, "produksi")[ukuran] != null ? String(variantPriceMap(variant, "produksi")[ukuran]) : ""}
                        oninput={(event) => updateVariantPrice(index, "produksi", ukuran, (event.currentTarget as HTMLInputElement).value)}
                        class="h-8 text-xs"
                      />
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
            <div class="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
              <span class="rounded-md bg-white px-2 py-1">1x {variantModel?.nama_model}</span>
              {#each variant.komponen as component, componentIndex}
                {#if component.tipe === "aksesori"}
                  <div class="flex w-full flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-2">
                    <span class="shrink-0 font-medium text-gray-600">Hijab</span>
                    <Select.Root
                      type="single"
                      value={modelHijabIdForComponent(component) || "__none__"}
                      onValueChange={(value) => pilihModelHijabUntukKomponen(index, componentIndex, value ?? "__none__")}
                    >
                      <Select.Trigger class="h-8 min-w-48 flex-1 text-xs">
                        {modelHijabIdForComponent(component)
                          ? (modelHijabList.find((item) => item.id === modelHijabIdForComponent(component))?.nama_hijab ?? component.nama)
                          : "Pilih model hijab"}
                      </Select.Trigger>
                      <Select.Content class="max-h-60 overflow-y-auto">
                        <Select.Item value="__none__">Pilih model hijab</Select.Item>
                        {#each modelHijabList.filter((item) => item.aktif) as hijab}
                          <Select.Item value={hijab.id}>{hijab.nama_hijab} · {hijab.stok_tersedia.toLocaleString("id-ID")} pcs</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                    {#if modelHijabIdForComponent(component)}
                      <Select.Root
                        type="single"
                        value={stockIdForComponent(component) ? stockIdForComponent(component) : component.kelola_stok !== false ? "__auto__" : "__none__"}
                        onValueChange={(value) => pilihStokHijabUntukKomponen(index, componentIndex, value ?? "__none__")}
                      >
                        <Select.Trigger class="h-8 min-w-44 flex-1 text-xs">
                          {stockIdForComponent(component)
                            ? stokHijabList.find((item) => item.id === stockIdForComponent(component))
                            ? labelStokHijab(stokHijabList.find((item) => item.id === stockIdForComponent(component))!)
                            : "Stok tidak ditemukan"
                            : "Ikuti warna baju otomatis"}
                        </Select.Trigger>
                        <Select.Content class="max-h-60 overflow-y-auto">
                          <Select.Item value="__auto__">Ikuti warna baju otomatis</Select.Item>
                          <Select.Item value="__none__">Nonaktifkan pengurangan stok</Select.Item>
                          {#each stokUntukModelHijab(modelHijabIdForComponent(component)) as hijab}
                            <Select.Item value={hijab.id}>{labelStokHijab(hijab)} · {hijab.stok_tersedia.toLocaleString("id-ID")} pcs</Select.Item>
                          {/each}
                        </Select.Content>
                      </Select.Root>
                    {/if}
                    {#if (variantModel?.warna_tersedia ?? []).length > 1}
                      <div class="w-full rounded-md border border-gray-200 bg-white p-2">
                        <label class="mb-1 block text-[11px] font-medium text-gray-600" for={`variant-mapping-${variant.id}-${componentIndex}`}>
                          Pemetaan stok hijab
                        </label>
                        <Select.Root
                          type="single"
                          value={modePemetaanKomponen(component)}
                          onValueChange={(value) => pilihModePemetaanKomponen(index, componentIndex, value === "per_warna" ? "per_warna" : "global")}
                        >
                          <Select.Trigger id={`variant-mapping-${variant.id}-${componentIndex}`} class="h-8 w-full text-xs">
                            {modePemetaanKomponen(component) === "per_warna"
                              ? "Pilih stok per warna baju"
                              : stockIdForComponent(component)
                                ? "Satu stok untuk semua warna"
                                : "Ikuti warna baju otomatis"}
                          </Select.Trigger>
                          <Select.Content>
                            <Select.Item value="global">Ikuti warna baju otomatis</Select.Item>
                            <Select.Item value="per_warna">Pilih stok per warna baju</Select.Item>
                          </Select.Content>
                        </Select.Root>
                        {#if modePemetaanKomponen(component) === "per_warna"}
                          <div class="mt-2 grid gap-2 sm:grid-cols-2">
                            {#each (variantModel?.warna_tersedia ?? []) as warna}
                              {@const warnaKey = warnaMappingKey(warna.warna_id, warna.nama_warna)}
                              <div>
                                <label class="mb-1 block text-[11px] text-gray-500" for={`variant-stock-${variant.id}-${componentIndex}-${warnaKey}`}>
                                  {warna.nama_warna}
                                </label>
                                <Select.Root
                                  type="single"
                                  value={component.stok_hijab_per_warna?.[warnaKey] ?? "__none__"}
                                  onValueChange={(value) => pilihStokHijabPerWarna(index, componentIndex, warna, value ?? "__none__")}
                                >
                                  <Select.Trigger id={`variant-stock-${variant.id}-${componentIndex}-${warnaKey}`} class="h-8 w-full text-xs">
                                    {#if component.stok_hijab_per_warna?.[warnaKey]}
                                      {@const mappedStock = stokHijabList.find((item) => item.id === component.stok_hijab_per_warna?.[warnaKey])}
                                      {mappedStock ? labelStokHijab(mappedStock) : "Stok tidak ditemukan"}
                                    {:else}
                                      Pilih stok hijab
                                    {/if}
                                  </Select.Trigger>
                                  <Select.Content class="max-h-60 overflow-y-auto">
                                    <Select.Item value="__none__">Pilih stok hijab</Select.Item>
                                    {#each stokUntukModelHijab(modelHijabIdForComponent(component)) as hijab}
                                      <Select.Item value={hijab.id}>{labelStokHijab(hijab)} · {hijab.stok_tersedia.toLocaleString("id-ID")} pcs</Select.Item>
                                    {/each}
                                  </Select.Content>
                                </Select.Root>
                              </div>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {/if}
                    <Input
                      class="h-8 w-20 text-xs"
                      type="number"
                      min="1"
                      value={String(component.jumlah)}
                      aria-label={`Jumlah ${component.nama}`}
                      oninput={(event) => updateVariantComponent(index, componentIndex, { jumlah: Math.max(1, Number((event.currentTarget as HTMLInputElement).value) || 1) })}
                    />
                    <span class="shrink-0 text-gray-400">/ set</span>
                  </div>
                {/if}
              {/each}
              <span class="text-gray-400">Stok: model induk</span>
            </div>
          </div>
        {/each}
      </div>

      <div class="rounded-lg border border-dashed border-gray-300 p-3.5">
        <p class="mb-2.5 text-sm font-semibold text-gray-800">Tambah add-on</p>
        <div class="grid gap-2.5 sm:grid-cols-2">
          <div>
            <label class="mb-1 block text-[11px] font-medium text-gray-600" for="new-variant-name">Nama add-on</label>
            <Input id="new-variant-name" bind:value={fVariantName} placeholder="Contoh: Set Hijab" />
          </div>
          <div>
            <label class="mb-1 block text-[11px] font-medium text-gray-600" for="new-variant-sku">SKU (opsional)</label>
            <Input id="new-variant-sku" bind:value={fVariantSku} placeholder="Contoh: LUNA-SET" />
          </div>
          {#if $isOwner}
          <div>
            <label class="mb-1 block text-[11px] font-medium text-gray-600" for="new-variant-price-mode">Harga jual</label>
            <select
              id="new-variant-price-mode"
              value={fVariantSellingMode}
              onchange={(event) => updateNewVariantPriceMode("jual", (event.currentTarget as HTMLSelectElement).value as ModeHargaVarian)}
              class="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              <option value="induk_plus_addon">Induk + Add-on</option>
              <option value="custom">Harga custom</option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-[11px] font-medium text-gray-600" for="new-variant-production-price-mode">Harga produksi</label>
            <select
              id="new-variant-production-price-mode"
              value={fVariantProductionMode}
              onchange={(event) => updateNewVariantPriceMode("produksi", (event.currentTarget as HTMLSelectElement).value as ModeHargaVarian)}
              class="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              <option value="induk_plus_addon">Induk + Add-on</option>
              <option value="custom">Harga custom</option>
            </select>
          </div>
          {#if fVariantSellingMode === "custom"}
            <div class="rounded-md border border-gray-200 bg-gray-50 p-2.5 sm:col-span-2">
              <p class="mb-2 text-[11px] font-medium text-gray-600">Harga jual custom / ukuran</p>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {#each variantModel?.ukuran_tersedia ?? [] as ukuran}
                  <div>
                    <label class="mb-1 block text-[10px] text-gray-500" for={`new-variant-selling-price-${ukuran}`}>{ukuran}</label>
                    <Input
                      id={`new-variant-selling-price-${ukuran}`}
                      type="number"
                      min="0"
                      value={fVariantSellingPricesBySize[ukuran] ?? ""}
                      oninput={(event) => updateNewVariantPrice("jual", ukuran, (event.currentTarget as HTMLInputElement).value)}
                      class="h-8 text-xs"
                    />
                  </div>
                {/each}
              </div>
            </div>
          {/if}
          {#if fVariantProductionMode === "custom"}
            <div class="rounded-md border border-gray-200 bg-gray-50 p-2.5 sm:col-span-2">
              <p class="mb-2 text-[11px] font-medium text-gray-600">Harga produksi custom / ukuran</p>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {#each variantModel?.ukuran_tersedia ?? [] as ukuran}
                  <div>
                    <label class="mb-1 block text-[10px] text-gray-500" for={`new-variant-production-price-${ukuran}`}>{ukuran}</label>
                    <Input
                      id={`new-variant-production-price-${ukuran}`}
                      type="number"
                      min="0"
                      value={fVariantProductionPricesBySize[ukuran] ?? ""}
                      oninput={(event) => updateNewVariantPrice("produksi", ukuran, (event.currentTarget as HTMLInputElement).value)}
                      class="h-8 text-xs"
                    />
                  </div>
                {/each}
              </div>
            </div>
          {/if}
          {/if}
          <div>
            <label class="mb-1 block text-[11px] font-medium text-gray-600" for="new-variant-hijab">Model Hijab (wajib)</label>
            <Select.Root
              type="single"
              value={fVariantHijabId || "__none__"}
              onValueChange={(value) => pilihHijabBaru(value ?? "__none__")}
            >
              <Select.Trigger id="new-variant-hijab" class="w-full text-xs">
                {#if fVariantHijabId}
                  {modelHijabList.find((item) => item.id === fVariantHijabId)?.nama_hijab ?? "Pilih model hijab"}
                {:else}
                  Pilih model hijab
                {/if}
              </Select.Trigger>
              <Select.Content class="max-h-60 overflow-y-auto">
                <Select.Item value="__none__">Pilih model hijab</Select.Item>
                {#each modelHijabList.filter((item) => item.aktif) as hijab}
                  <Select.Item value={hijab.id}>{hijab.nama_hijab} · {hijab.stok_tersedia.toLocaleString("id-ID")} pcs</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            {#if modelHijabList.length === 0}
              <a class="mt-1 block text-[11px] text-blue-600 hover:underline" href="/stok-hijab">Tambah stok hijab terlebih dahulu →</a>
            {/if}
          </div>
          {#if fVariantHijabId}
            {#if (variantModel?.warna_tersedia ?? []).length > 1}
              <div class="sm:col-span-2">
                <label class="mb-1 block text-[11px] font-medium text-gray-600" for="new-variant-mapping">Pemetaan stok hijab</label>
                <Select.Root
                  type="single"
                  value={fVariantMappingMode}
                  onValueChange={(value) => pilihModePemetaanBaru(value === "per_warna" ? "per_warna" : "global")}
                >
                  <Select.Trigger id="new-variant-mapping" class="w-full text-xs">
                    {fVariantMappingMode === "per_warna" ? "Pilih stok per warna baju" : "Ikuti warna baju otomatis"}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="global">Ikuti warna baju otomatis</Select.Item>
                    <Select.Item value="per_warna">Pilih stok per warna baju</Select.Item>
                  </Select.Content>
                </Select.Root>
              </div>
            {/if}
            {#if fVariantMappingMode === "per_warna" && (variantModel?.warna_tersedia ?? []).length > 0}
              <div class="sm:col-span-2 rounded-md border border-gray-200 bg-gray-50 p-2.5">
                <p class="mb-2 text-[11px] text-gray-500">Pilih stok hijab yang dipakai untuk setiap warna baju.</p>
                <div class="grid gap-2 sm:grid-cols-2">
                  {#each (variantModel?.warna_tersedia ?? []) as warna}
                    {@const warnaKey = warnaMappingKey(warna.warna_id, warna.nama_warna)}
                    <div>
                      <label class="mb-1 block text-[11px] font-medium text-gray-600" for={`new-variant-stock-${warnaKey}`}>
                        {warna.nama_warna}
                      </label>
                      <Select.Root
                        type="single"
                        value={fVariantStockByWarna[warnaKey] || "__none__"}
                        onValueChange={(value) => (fVariantStockByWarna = { ...fVariantStockByWarna, [warnaKey]: value === "__none__" ? "" : (value ?? "") })}
                      >
                        <Select.Trigger id={`new-variant-stock-${warnaKey}`} class="w-full text-xs">
                          {#if fVariantStockByWarna[warnaKey]}
                            {@const mappedStock = stokHijabList.find((item) => item.id === fVariantStockByWarna[warnaKey])}
                            {mappedStock ? labelStokHijab(mappedStock) : "Stok tidak ditemukan"}
                          {:else}
                            Pilih stok hijab
                          {/if}
                        </Select.Trigger>
                        <Select.Content class="max-h-60 overflow-y-auto">
                          <Select.Item value="__none__">Pilih stok hijab</Select.Item>
                          {#each stokUntukModelHijab(fVariantHijabId) as hijab}
                            <Select.Item value={hijab.id}>{labelStokHijab(hijab)} · {hijab.stok_tersedia.toLocaleString("id-ID")} pcs</Select.Item>
                          {/each}
                        </Select.Content>
                      </Select.Root>
                    </div>
                  {/each}
                </div>
              </div>
            {:else}
              <div>
                <label class="mb-1 block text-[11px] font-medium text-gray-600" for="new-variant-stock">Stok hijab yang dipakai</label>
                <Select.Root
                  type="single"
                  value={fVariantAccessoryId || "__auto__"}
                        onValueChange={(value) => (fVariantAccessoryId = value === "__auto__" || value === "__none__" ? "" : (value ?? ""))}
                >
                  <Select.Trigger id="new-variant-stock" class="w-full text-xs">
                    {stokHijabList.find((item) => item.id === fVariantAccessoryId)
                      ? labelStokHijab(stokHijabList.find((item) => item.id === fVariantAccessoryId)!)
                      : "Ikuti warna baju otomatis"}
                  </Select.Trigger>
                  <Select.Content class="max-h-60 overflow-y-auto">
                    <Select.Item value="__auto__">Ikuti warna baju otomatis</Select.Item>
                    {#each stokUntukModelHijab(fVariantHijabId) as hijab}
                      <Select.Item value={hijab.id}>{labelStokHijab(hijab)} · {hijab.stok_tersedia.toLocaleString("id-ID")} pcs</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                {#if stokUntukModelHijab(fVariantHijabId).length === 0}
                  <a class="mt-1 block text-[11px] text-blue-600 hover:underline" href="/stok-hijab">Kaitkan stok hijab terlebih dahulu</a>
                {/if}
              </div>
            {/if}
            <div>
              <label class="mb-1 block text-[11px] font-medium text-gray-600" for="new-variant-accessory-qty">Jumlah hijab / set</label>
              <Input id="new-variant-accessory-qty" type="number" min="1" bind:value={fVariantAccessoryQty} />
            </div>
          {/if}
          </div>
        <Button variant="outline" size="sm" class="mt-3" onclick={addVariant}>
          Tambah ke daftar
        </Button>
      </div>

      {#if variantError}
        <p class="text-xs text-red-600">{variantError}</p>
      {/if}
    </div>

    <Dialog.Footer class="shrink-0 gap-2 border-t border-gray-100 px-6 py-4">
      <Button variant="outline" onclick={() => (openVarian = false)}>Batal</Button>
      <Button onclick={saveVariants} disabled={variantSaving}>
        {variantSaving ? "Menyimpan..." : "Simpan Add-on"}
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
