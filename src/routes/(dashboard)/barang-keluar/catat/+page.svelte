<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { catatBarangKeluar } from "$lib/firebase/barang-jadi";
  import { getKanalPenjualan } from "$lib/firebase/penjualan";
  import { barangJadiCache, modelBajuCache, barangKeluarCache, modelHijabCache, stokHijabCache } from "$lib/stores/data-cache.svelte";
  import { currentUser } from "$lib/stores/auth.store";
  import {
    TUJUAN_PENGIRIMAN_OPTIONS,
    UKURAN_ORDER,
    resolveStokHijabIdUntukWarna,
    getVarianPenjualan,
    type BarangKeluarItem,
    type ModelBaju,
    type ModelHijab,
    type KomponenVarianPenjualan,
    type StokBarangJadi,
    type StokHijab,
    type UkuranBaju,
    type VarianPenjualan,
    type KanalPenjualan,
} from "$lib/types";
  import { hargaCustomVarianUntukUkuran } from "$lib/sales/penjualan";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Badge } from "$lib/components/ui/badge";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import {
    BARANG_KELUAR_IMPORT_DRAFT_KEY,
    type BarangKeluarImportDraft,
  } from "$lib/import/barang-keluar";

  type ModelOption = {
    key: string;
    model_id: string;
    stok_model_id: string;
    nama_model: string;
    ukuran_tersedia: UkuranBaju[];
    warna_tersedia: ModelBaju["warna_tersedia"];
    varian_penjualan: ModelBaju["varian_penjualan"];
    stok: StokBarangJadi[];
  };

  type WarnaOption = {
    key: string;
    warna_id?: string;
    nama_warna?: string;
    kode_hex_warna?: string;
    stok: StokBarangJadi[];
    total_stok: number;
  };

  type DraftBarangKeluarItem = BarangKeluarItem & {
    tujuan: string;
    nama_reseller?: string;
    keterangan?: string;
  };

  type JenisProduk = "baju" | "hijab";

  let loading = $state(true);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);

  let stokList = $state<StokBarangJadi[]>([]);
  let stokHijabList = $state<StokHijab[]>([]);
  let modelHijabList = $state<ModelHijab[]>([]);
  let modelList = $state<ModelBaju[]>([]);
  let kanalList = $state<KanalPenjualan[]>([]);

  let fTujuan = $state("");
  let fNamaReseller = $state("");
  let fKeterangan = $state("");
  let fJenisProduk = $state<JenisProduk>("baju");
  let fModelKey = $state("");
  let fVariantId = $state("");
  let fModelHijabId = $state("");
  let fStokHijabId = $state("");
  let fJumlahHijab = $state("");
  let fWarnaKeys = $state<string[]>([]);
  let fJumlahByWarna = $state<Record<string, Partial<Record<UkuranBaju, number>>>>({});
  let draftItems = $state<DraftBarangKeluarItem[]>([]);
  let importFileName = $state("");
  let importWarningLines = $state<string[]>([]);
  let tujuanOptions = $derived.by(() => {
    const options: string[] = [];
    const configuredNames = new Set(kanalList.map((channel) => channel.nama.trim().toLowerCase()));
    const values = [
      ...kanalList.filter((channel) => channel.aktif).map((channel) => channel.nama),
      ...TUJUAN_PENGIRIMAN_OPTIONS.filter((value) => !configuredNames.has(value.trim().toLowerCase())),
    ];
    for (const value of values) {
      if (!options.some((existing) => existing.trim().toLowerCase() === value.trim().toLowerCase())) options.push(value);
    }
    return options;
  });

  let modelOptions = $derived.by<ModelOption[]>(() => {
    const map = new Map<string, ModelOption>();
    for (const model of modelList.filter((m) => m.aktif)) {
      map.set(model.id, {
        key: model.id,
        model_id: model.id,
        stok_model_id: model.stok_model_id ?? model.id,
        nama_model: model.nama_model,
        ukuran_tersedia: modelList.find((item) => item.id === (model.stok_model_id ?? model.id))?.ukuran_tersedia ?? model.ukuran_tersedia,
        warna_tersedia: modelList.find((item) => item.id === (model.stok_model_id ?? model.id))?.warna_tersedia ?? model.warna_tersedia,
        varian_penjualan: model.varian_penjualan,
        stok: [],
      });
    }
    for (const stok of stokList) {
      for (const option of map.values()) {
        if (option.stok_model_id === stok.model_id) option.stok.push(stok);
      }
    }
    return [...map.values()].sort((a, b) =>
      a.nama_model.localeCompare(b.nama_model),
    );
  });

  let selectedModel = $derived(
    modelOptions.find((m) => m.key === fModelKey) ?? null,
  );

  function normalizedName(value?: string): string {
    return (value ?? "").trim().toLowerCase();
  }

  let selectedModelHijab = $derived(
    modelHijabList.find((model) => model.id === fModelHijabId) ?? null,
  );

  let hijabStockOptions = $derived.by<StokHijab[]>(() => {
    if (!selectedModelHijab) return [];
    const modelName = normalizedName(selectedModelHijab.nama_hijab);
    return stokHijabList
      .filter(
        (stock) =>
          stock.model_hijab_id === selectedModelHijab.id ||
          (!stock.model_hijab_id && normalizedName(stock.nama_hijab) === modelName),
      )
      .sort((a, b) =>
        (a.nama_warna ?? "Tanpa warna").localeCompare(b.nama_warna ?? "Tanpa warna"),
      );
  });

  let selectedHijabStock = $derived(
    hijabStockOptions.find((stock) => stock.id === fStokHijabId) ?? null,
  );
  let jumlahHijab = $derived(Math.max(0, Math.floor(Number(fJumlahHijab) || 0)));
  let hijabKeluarTotal = $derived(
    Math.min(jumlahHijab, selectedHijabStock?.stok_tersedia ?? 0),
  );
  let hijabPendingTotal = $derived(Math.max(0, jumlahHijab - hijabKeluarTotal));

  let variantOptions = $derived<VarianPenjualan[]>(
    selectedModel
      ? getVarianPenjualan({
          id: selectedModel.model_id,
          nama_model: selectedModel.nama_model,
          varian_penjualan: selectedModel.varian_penjualan,
          stok_model_id: selectedModel.stok_model_id,
        })
      : [],
  );

  let selectedVariant = $derived(
    variantOptions.find((variant) => variant.id === fVariantId) ??
      variantOptions.find((variant) =>
        variant.komponen.some((component) => component.tipe === "aksesori"),
      ) ??
      variantOptions[0] ??
      null,
  );

  let selectedUkuranList = $derived(
    selectedModel?.ukuran_tersedia?.length
      ? selectedModel.ukuran_tersedia
      : UKURAN_ORDER,
  );

  $effect(() => {
    const firstVariant = variantOptions[0];
    if (!firstVariant) {
      fVariantId = "";
    } else if (!variantOptions.some((variant) => variant.id === fVariantId)) {
      fVariantId = variantOptions.find((variant) =>
        variant.komponen.some((component) => component.tipe === "aksesori"),
      )?.id ?? firstVariant.id;
    }
  });

  function warnaKey(namaWarna?: string): string {
    return namaWarna?.trim() || "__tanpa_warna__";
  }

  let warnaOptions = $derived.by<WarnaOption[]>(() => {
    if (!selectedModel) return [];
    const map = new Map<string, WarnaOption>();
    for (const warna of selectedModel.warna_tersedia ?? []) {
      const key = warnaKey(warna.nama_warna);
      map.set(key, {
        key,
        warna_id: warna.warna_id,
        nama_warna: warna.nama_warna,
        kode_hex_warna: warna.kode_hex,
        stok: [],
        total_stok: 0,
      });
    }
    if (map.size === 0) {
        map.set("__tanpa_warna__", {
        key: "__tanpa_warna__",
        stok: [],
        total_stok: 0,
      });
    }
    for (const stok of selectedModel.stok) {
      const key = warnaKey(stok.nama_warna);
      if (!map.has(key)) {
        map.set(key, {
          key,
          warna_id: selectedModel.warna_tersedia?.find((warna) => warna.nama_warna === stok.nama_warna)?.warna_id,
          nama_warna: stok.nama_warna,
          kode_hex_warna: stok.kode_hex_warna,
          stok: [],
          total_stok: 0,
        });
      }
      const warna = map.get(key)!;
      warna.stok.push(stok);
      warna.total_stok += stok.stok_tersedia;
    }
    return [...map.values()].sort((a, b) =>
      (a.nama_warna ?? "Tanpa warna").localeCompare(
        b.nama_warna ?? "Tanpa warna",
      ),
    );
  });

  let selectedWarnaList = $derived(
    warnaOptions.filter((w) => fWarnaKeys.includes(w.key)),
  );

  function stokTersedia(warna: WarnaOption, ukuran: UkuranBaju): number {
    return warna.stok.find((s) => s.ukuran === ukuran)?.stok_tersedia ?? 0;
  }

  function jumlahWarna(warnaKey: string, ukuran: UkuranBaju): number {
    return fJumlahByWarna[warnaKey]?.[ukuran] ?? 0;
  }

  function setJumlahWarna(warnaKey: string, ukuran: UkuranBaju, value: number) {
    fJumlahByWarna = {
      ...fJumlahByWarna,
      [warnaKey]: {
        ...(fJumlahByWarna[warnaKey] ?? {}),
        [ukuran]: Number.isFinite(value) && value > 0 ? value : 0,
      },
    };
  }

  function toggleWarna(key: string, checked: boolean) {
    fWarnaKeys = checked
      ? [...new Set([...fWarnaKeys, key])]
      : fWarnaKeys.filter((k) => k !== key);
  }

  let inputTotal = $derived.by(() => {
    let total = 0;
    for (const warna of selectedWarnaList) {
      for (const ukuran of selectedUkuranList) {
        total += jumlahWarna(warna.key, ukuran);
      }
    }
    return total;
  });

  let inputKeluarTotal = $derived.by(() => {
    let total = 0;
    const sisaHijab = new Map(stokHijabList.map((item) => [item.id, item.stok_tersedia]));
    for (const warna of selectedWarnaList) {
      for (const ukuran of selectedUkuranList) {
        let kapasitasPaket = Number.POSITIVE_INFINITY;
        for (const component of selectedVariant?.komponen ?? []) {
          const stockId = hijabStockId(component, warna);
          if (component.tipe !== "aksesori" || component.kelola_stok === false || !stockId || component.jumlah <= 0) continue;
          kapasitasPaket = Math.min(
            kapasitasPaket,
            Math.floor((sisaHijab.get(stockId) ?? 0) / component.jumlah),
          );
        }
        const keluar = Math.min(jumlahWarna(warna.key, ukuran), stokTersedia(warna, ukuran), kapasitasPaket);
        total += keluar;
        for (const component of selectedVariant?.komponen ?? []) {
          const stockId = hijabStockId(component, warna);
          if (component.tipe !== "aksesori" || component.kelola_stok === false || !stockId || component.jumlah <= 0) continue;
          sisaHijab.set(stockId, (sisaHijab.get(stockId) ?? 0) - keluar * component.jumlah);
        }
      }
    }
    return total;
  });

  let inputPendingTotal = $derived(inputTotal - inputKeluarTotal);

  let totalDraftKeluarPcs = $derived(
    draftItems
      .filter((item) => item.status !== "pending")
      .reduce((sum, item) => sum + item.total_pcs, 0),
  );
  let totalDraftPendingPcs = $derived(
    draftItems
      .filter((item) => item.status === "pending")
      .reduce((sum, item) => sum + item.total_pcs, 0),
  );

  let canAdd = $derived(
    fTujuan.trim() !== "" &&
      (fJenisProduk === "hijab"
        ? !!selectedModelHijab && !!selectedHijabStock && jumlahHijab > 0
        : !!selectedModel && selectedWarnaList.length > 0 && inputTotal > 0),
  );
  let canSubmit = $derived(draftItems.length > 0);

  function itemSummary(item: BarangKeluarItem): string {
    if (item.jenis_produk === "hijab") return "ALL SIZE";
    return item.detail_keluar.map((d) => `${d.ukuran}: ${d.jumlah_pcs}`).join(", ");
  }

  function hijabStockId(component: KomponenVarianPenjualan, warna?: WarnaOption): string | undefined {
    return resolveStokHijabIdUntukWarna(component, warna, stokHijabList);
  }

  function komponenUntukWarna(warna: WarnaOption): KomponenVarianPenjualan[] {
    return (selectedVariant?.komponen ?? []).map((component) => {
      if (component.tipe !== "aksesori") return { ...component };
      const stockId = hijabStockId(component, warna);
      return stockId
        ? { ...component, ref_id: stockId, stok_hijab_id: stockId }
        : { ...component };
    });
  }

  function hargaHijabKomponen(componentType: "harga_jual" | "harga_produksi"): number {
    return (selectedVariant?.komponen ?? [])
      .filter((component) => component.tipe === "aksesori" && component.jumlah > 0)
      .reduce((total, component) => {
        const stockId = hijabStockId(component);
        const stock = stokHijabList.find((item) => item.id === stockId);
        const modelId = component.model_hijab_id ?? stock?.model_hijab_id;
        const model = modelHijabList.find((item) => item.id === modelId);
        return total + (model?.[componentType] ?? 0) * component.jumlah;
      }, 0);
  }

  function setJenisProduk(jenis: JenisProduk) {
    fJenisProduk = jenis;
    fModelKey = "";
    fVariantId = "";
    fModelHijabId = "";
    fStokHijabId = "";
    fJumlahHijab = "";
    fWarnaKeys = [];
    fJumlahByWarna = {};
  }

  function resetItemForm() {
    fModelKey = "";
    fVariantId = "";
    fModelHijabId = "";
    fStokHijabId = "";
    fJumlahHijab = "";
    fWarnaKeys = [];
    fJumlahByWarna = {};
  }

  function tambahKeDaftar() {
    if (fJenisProduk === "hijab") {
      if (!selectedModelHijab || !selectedHijabStock || !canAdd) return;
      const tujuanSnapshot = fTujuan.trim();
      const resellerSnapshot = fNamaReseller.trim();
      const keteranganSnapshot = fKeterangan.trim();
      const base = {
        jenis_produk: "hijab" as const,
        model_id: selectedModelHijab.id,
        model_hijab_id: selectedModelHijab.id,
        stok_hijab_id: selectedHijabStock.id,
        nama_model: selectedModelHijab.nama_hijab,
        nama_hijab: selectedModelHijab.nama_hijab,
        ...(selectedHijabStock.warna_id ? { warna_id: selectedHijabStock.warna_id } : {}),
        ...(selectedHijabStock.nama_warna ? { nama_warna: selectedHijabStock.nama_warna } : {}),
        ...(selectedHijabStock.kode_hex_warna
          ? { kode_hex_warna: selectedHijabStock.kode_hex_warna }
          : {}),
        detail_keluar: [],
        tujuan: tujuanSnapshot,
        ...(resellerSnapshot ? { nama_reseller: resellerSnapshot } : {}),
        ...(keteranganSnapshot ? { keterangan: keteranganSnapshot } : {}),
        harga_jual_per_pcs: selectedModelHijab.harga_jual ?? 0,
        harga_produksi_per_pcs: selectedModelHijab.harga_produksi ?? 0,
      };
      const hijabItems: DraftBarangKeluarItem[] = [];
      if (hijabKeluarTotal > 0) {
        hijabItems.push({
          ...base,
          total_pcs: hijabKeluarTotal,
          status: "keluar",
        });
      }
      if (hijabPendingTotal > 0) {
        hijabItems.push({
          ...base,
          total_pcs: hijabPendingTotal,
          status: "pending",
          alasan_pending: "Stok hijab belum tersedia",
        });
      }
      draftItems = [...draftItems, ...hijabItems];
      resetItemForm();
      return;
    }

    if (!selectedModel || !canAdd) return;
    const tujuanSnapshot = fTujuan.trim();
    const resellerSnapshot = fNamaReseller.trim();
    const keteranganSnapshot = fKeterangan.trim();
    const keluarItems: DraftBarangKeluarItem[] = [];
    const pendingItems: DraftBarangKeluarItem[] = [];
    const sisaHijab = new Map(stokHijabList.map((item) => [item.id, item.stok_tersedia]));
    const modelHarga = modelList.find((entry) => entry.id === (selectedModel.stok_model_id ?? selectedModel.model_id));
    const hargaJual = (ukuran: UkuranBaju) =>
      hargaCustomVarianUntukUkuran(selectedVariant, "jual", ukuran) ??
      (modelHarga?.harga_jual_per_ukuran?.[ukuran] ?? modelHarga?.harga_jual ?? 0) + hargaHijabKomponen("harga_jual");
    const hargaProduksi = (ukuran: UkuranBaju) =>
      hargaCustomVarianUntukUkuran(selectedVariant, "produksi", ukuran) ??
      (modelHarga?.harga_produksi_per_ukuran?.[ukuran] ?? modelHarga?.harga_produksi ?? 0) + hargaHijabKomponen("harga_produksi");

    for (const warna of selectedWarnaList) {
      const detailKeluar: BarangKeluarItem["detail_keluar"] = [];
      const detailPending: BarangKeluarItem["detail_keluar"] = [];
      const komponenWarna = komponenUntukWarna(warna);

      for (const ukuran of selectedUkuranList) {
        const jumlah = jumlahWarna(warna.key, ukuran);
        if (jumlah <= 0) continue;
        const tersedia = stokTersedia(warna, ukuran);
        let kapasitasPaket = Number.POSITIVE_INFINITY;
        for (const component of komponenWarna) {
          const stockId = hijabStockId(component, warna);
          if (component.tipe !== "aksesori" || component.kelola_stok === false || !stockId || component.jumlah <= 0) continue;
          kapasitasPaket = Math.min(
            kapasitasPaket,
            Math.floor((sisaHijab.get(stockId) ?? 0) / component.jumlah),
          );
        }
        const jumlahKeluar = Math.min(jumlah, tersedia, kapasitasPaket);
        const jumlahPending = Math.max(0, jumlah - jumlahKeluar);

        for (const component of komponenWarna) {
          const stockId = hijabStockId(component, warna);
          if (component.tipe !== "aksesori" || component.kelola_stok === false || !stockId || component.jumlah <= 0) continue;
          sisaHijab.set(
            stockId,
            (sisaHijab.get(stockId) ?? 0) - jumlahKeluar * component.jumlah,
          );
        }

        if (jumlahKeluar > 0) {
          detailKeluar.push({ ukuran, jumlah_pcs: jumlahKeluar, harga_jual: hargaJual(ukuran), harga_produksi: hargaProduksi(ukuran) });
        }
        if (jumlahPending > 0) {
          detailPending.push({ ukuran, jumlah_pcs: jumlahPending, harga_jual: hargaJual(ukuran), harga_produksi: hargaProduksi(ukuran) });
        }
      }

      const base = {
        model_id: selectedModel.model_id,
        stok_model_id: selectedModel.stok_model_id,
        nama_model: selectedModel.nama_model,
        ...(selectedVariant
          ? {
              varian_id: selectedVariant.id,
              nama_varian: selectedVariant.nama_varian,
              komponen_varian: komponenWarna,
            }
          : {}),
        ...(warna.warna_id ? { warna_id: warna.warna_id } : {}),
        ...(warna.nama_warna ? { nama_warna: warna.nama_warna } : {}),
        ...(warna.kode_hex_warna ? { kode_hex_warna: warna.kode_hex_warna } : {}),
        tujuan: tujuanSnapshot,
        ...(resellerSnapshot ? { nama_reseller: resellerSnapshot } : {}),
        ...(keteranganSnapshot ? { keterangan: keteranganSnapshot } : {}),
      };

      if (detailKeluar.length > 0) {
        keluarItems.push({
          ...base,
          detail_keluar: detailKeluar,
          total_pcs: detailKeluar.reduce((sum, d) => sum + d.jumlah_pcs, 0),
          status: "keluar",
        });
      }

        if (detailPending.length > 0) {
        pendingItems.push({
          ...base,
          detail_keluar: detailPending,
          total_pcs: detailPending.reduce((sum, d) => sum + d.jumlah_pcs, 0),
          status: "pending",
          alasan_pending: "Stok belum tersedia",
        });
      }
    }

    draftItems = [...draftItems, ...keluarItems, ...pendingItems];
    resetItemForm();
  }

  function hapusDraftItem(index: number) {
    draftItems = draftItems.filter((_, i) => i !== index);
  }

  async function submit() {
    if (!canSubmit || !$currentUser) return;
    saving = true;
    errorMsg = null;
    try {
      const groups = new Map<string, DraftBarangKeluarItem[]>();
      for (const item of draftItems) {
        const key = [item.tujuan, item.nama_reseller ?? "", item.keterangan ?? ""].join("||");
        groups.set(key, [...(groups.get(key) ?? []), item]);
      }

      for (const groupItems of groups.values()) {
        const itemPertama = groupItems[0];
        await catatBarangKeluar(
          {
            model_id: itemPertama.model_id,
            nama_model:
              groupItems.length > 1 ? `${groupItems.length} barang` : itemPertama.nama_model,
            ...(groupItems.length === 1 && itemPertama.nama_warna
              ? { nama_warna: itemPertama.nama_warna }
              : {}),
            ...(groupItems.length === 1 && itemPertama.kode_hex_warna
              ? { kode_hex_warna: itemPertama.kode_hex_warna }
              : {}),
            detail_keluar: itemPertama.detail_keluar,
            items: groupItems,
            tujuan: itemPertama.tujuan,
            ...(itemPertama.nama_reseller ? { nama_reseller: itemPertama.nama_reseller } : {}),
            ...(itemPertama.keterangan ? { keterangan: itemPertama.keterangan } : {}),
          },
          $currentUser.uid,
        );
      }
      barangJadiCache.invalidate();
      stokHijabCache.invalidate();
      barangKeluarCache.invalidate();
      successMsg = "List barang keluar berhasil disimpan.";
      await goto("/barang-keluar");
    } catch (e: any) {
      errorMsg = e?.message ?? "Gagal menyimpan list barang keluar.";
    } finally {
      saving = false;
    }
  }

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      [stokList, modelList, stokHijabList, modelHijabList] = await Promise.all([
        barangJadiCache.get(),
        modelBajuCache.get(),
        stokHijabCache.get(),
        modelHijabCache.get(),
      ]);
      try {
        kanalList = await getKanalPenjualan();
      } catch {
        kanalList = [];
      }
    } catch {
      errorMsg = "Gagal memuat data model dan stok.";
    } finally {
      loading = false;
    }
  }

  function loadImportDraft() {
    const raw = sessionStorage.getItem(BARANG_KELUAR_IMPORT_DRAFT_KEY);
    if (!raw) return;

    sessionStorage.removeItem(BARANG_KELUAR_IMPORT_DRAFT_KEY);
    try {
      const draft = JSON.parse(raw) as BarangKeluarImportDraft;
      importFileName = draft.fileName ?? "";
      importWarningLines = Array.isArray(draft.unmatchedLines) ? draft.unmatchedLines : [];
      fTujuan = draft.tujuan ?? "";
      fNamaReseller = draft.namaReseller ?? "";
      fKeterangan = draft.keterangan ?? "";
      draftItems = (draft.items ?? []).map((rawItem) => {
        const { tujuan_import, ...item } = rawItem;
        return {
          ...item,
          tujuan: tujuan_import ?? draft.tujuan ?? "",
          ...(draft.namaReseller ? { nama_reseller: draft.namaReseller } : {}),
          ...(draft.keterangan ? { keterangan: draft.keterangan } : {}),
        };
      });
    } catch {
      errorMsg = "Hasil import tidak dapat dimuat. Silakan ulangi import file.";
    }
  }

  $effect(() => {
    load();
  });

  onMount(loadImportDraft);
</script>

{#if successMsg}
  <div class="fixed right-5 top-5 z-[9999] rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 shadow-lg">
    {successMsg}
  </div>
{/if}

<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
  <div>
    <Button href="/barang-keluar" variant="ghost" size="sm" class="mb-2">
      <ArrowLeftIcon class="h-4 w-4" />
      Kembali
    </Button>
    <h1 class="text-xl font-semibold text-gray-900">Input Barang Keluar</h1>
    <p class="mt-0.5 text-sm text-gray-500">
      Stok yang tersedia dicatat keluar, kekurangan stok otomatis menjadi pending.
    </p>
  </div>
  <div class="rounded-lg border border-gray-100 bg-white px-4 py-3 text-right shadow-sm">
    <p class="text-xs text-gray-400">Draft</p>
    <p class="text-sm font-semibold text-gray-800">
      {totalDraftKeluarPcs} keluar · {totalDraftPendingPcs} pending
    </p>
  </div>
</div>

{#if errorMsg}
  <div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
    {errorMsg}
  </div>
{/if}

{#if importFileName}
  <div class="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900">
    <p class="text-sm font-semibold">Hasil import: {importFileName}</p>
    <p class="mt-0.5 text-xs">
      Baris yang cocok sudah dimasukkan ke Daftar Barang. Periksa kembali sebelum menyimpan.
    </p>
    {#if importWarningLines.length > 0}
      <div class="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
        <p class="text-sm font-semibold">
          {importWarningLines.length} baris dilewati karena model belum cocok.
        </p>
        <p class="mt-0.5 text-xs">
          Baris berikut tidak dimasukkan dan tidak mengubah stok:
        </p>
        <ul class="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-5 text-xs">
          {#each importWarningLines as line}
            <li class="break-words">{line}</li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}

{#if loading}
  <div class="rounded-lg border border-gray-100 bg-white p-6 text-sm text-gray-400 shadow-sm">
    Memuat data...
  </div>
{:else}
  <div class="grid gap-5 xl:grid-cols-[1fr_380px]">
    <div class="space-y-5">
      <div class="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
        <h2 class="mb-4 text-sm font-semibold text-gray-800">Informasi List</h2>
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700" for="tujuan-keluar">
              Tujuan Pengiriman <span class="text-red-500">*</span>
            </label>
            <Select.Root
              type="single"
              value={fTujuan || undefined}
              onValueChange={(val) => (fTujuan = val ?? "")}
            >
              <Select.Trigger id="tujuan-keluar" class="w-full">
                {#if fTujuan}
                  <span>{fTujuan}</span>
                {:else}
                  <span class="text-muted-foreground">-- Pilih tujuan --</span>
                {/if}
              </Select.Trigger>
              <Select.Content preventScroll={false}>
                {#each tujuanOptions as t}
                  <Select.Item value={t}>{t}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>

          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700" for="nama-reseller">
              Nama Reseller <span class="text-xs font-normal text-gray-400">(opsional)</span>
            </label>
            <Input id="nama-reseller" bind:value={fNamaReseller} placeholder="Nama reseller atau toko" />
          </div>
        </div>

        <div class="mt-4">
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="keterangan-keluar">
            Keterangan <span class="text-xs font-normal text-gray-400">(opsional)</span>
          </label>
          <textarea
            id="keterangan-keluar"
            rows="3"
            bind:value={fKeterangan}
            placeholder="Catatan tambahan..."
            class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
          ></textarea>
        </div>
      </div>

      <div class="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
        <h2 class="mb-4 text-sm font-semibold text-gray-800">Tambah Barang</h2>

        <div class="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-1">
          <button
            type="button"
            onclick={() => setJenisProduk("baju")}
            class="rounded-md px-3 py-2 text-sm font-medium transition {fJenisProduk === 'baju'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-800'}"
          >
            Baju
          </button>
          <button
            type="button"
            onclick={() => setJenisProduk("hijab")}
            class="rounded-md px-3 py-2 text-sm font-medium transition {fJenisProduk === 'hijab'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-800'}"
          >
            Hijab
          </button>
        </div>

        {#if fJenisProduk === "baju"}
          <div class="mb-4">
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="model-keluar">
            Model Baju <span class="text-red-500">*</span>
          </label>
          <Select.Root
            type="single"
            value={fModelKey || undefined}
            onValueChange={(val) => {
              fModelKey = val ?? "";
              fVariantId = "";
              fWarnaKeys = [];
              fJumlahByWarna = {};
            }}
          >
            <Select.Trigger id="model-keluar" class="w-full">
              {#if selectedModel}
                <span>{selectedModel.nama_model}</span>
              {:else}
                <span class="text-muted-foreground">-- Pilih model --</span>
              {/if}
            </Select.Trigger>
            <Select.Content preventScroll={false}>
              {#each modelOptions as model}
                <Select.Item value={model.key}>{model.nama_model}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          </div>

          {#if selectedModel}
          {#if selectedVariant?.komponen.some((component) => component.tipe === "aksesori")}
            <div class="mb-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p class="text-xs font-medium text-gray-600">
                Add-on: {selectedVariant.komponen
                  .filter((component) => component.tipe === "aksesori")
                  .map((component) => `${component.jumlah}x ${component.nama}`)
                  .join(", ")}
              </p>
              {#each selectedVariant.komponen.filter((component) => component.tipe === "aksesori" && component.kelola_stok !== false) as component}
                {#if component.stok_hijab_per_warna && Object.keys(component.stok_hijab_per_warna).length > 0}
                  <p class="mt-1 text-xs text-gray-400">
                    Stok {component.nama}: mengikuti warna baju
                  </p>
                {:else if !component.stok_hijab_id && !component.ref_id}
                  <p class="mt-1 text-xs text-gray-400">
                    Stok {component.nama}: otomatis mengikuti warna baju
                  </p>
                {:else}
                  {@const hijab = stokHijabList.find((item) => item.id === hijabStockId(component))}
                  <p class="mt-1 text-xs {hijab && hijab.stok_tersedia < component.jumlah ? 'text-amber-600' : 'text-gray-400'}">
                    Stok {component.nama}: {hijab ? `${hijab.stok_tersedia.toLocaleString("id-ID")} pcs · cukup ${Math.floor(hijab.stok_tersedia / component.jumlah).toLocaleString("id-ID")} set` : "tidak ditemukan"}
                  </p>
                {/if}
              {/each}
            </div>
          {/if}
        {/if}

          {#if selectedModel}
          <div class="mb-4">
            <p class="mb-2 text-sm font-medium text-gray-700">
              Warna <span class="text-red-500">*</span>
            </p>
            <div class="grid gap-2 md:grid-cols-2">
              {#each warnaOptions as warna}
                {@const checked = fWarnaKeys.includes(warna.key)}
                <label
                  class="flex cursor-pointer items-center gap-3 rounded-lg border {checked
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-100 bg-gray-50'} px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onchange={(e) =>
                      toggleWarna(warna.key, (e.currentTarget as HTMLInputElement).checked)}
                    class="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  {#if warna.kode_hex_warna}
                    <span
                      class="h-3 w-3 rounded-full ring-1 ring-black/10"
                      style="background:{warna.kode_hex_warna}"
                    ></span>
                  {/if}
                  <span class="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">
                    {warna.nama_warna ?? "Tanpa warna"}
                  </span>
                  <span class="text-xs text-gray-400">{warna.total_stok} stok</span>
                </label>
              {/each}
            </div>
          </div>
          {/if}

          {#if selectedWarnaList.length > 0}
          <div class="space-y-4">
            {#each selectedWarnaList as warna}
              <div class="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <p class="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-800">
                    {#if warna.kode_hex_warna}
                      <span
                        class="h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                        style="background:{warna.kode_hex_warna}"
                      ></span>
                    {/if}
                    {warna.nama_warna ?? "Tanpa warna"}
                  </p>
                  <p class="text-xs text-gray-400">{warna.total_stok} pcs stok</p>
                </div>

                <div class="grid gap-2 md:grid-cols-2">
                  {#each selectedUkuranList as ukuran}
                    {@const stok = stokTersedia(warna, ukuran)}
                    {@const jumlah = jumlahWarna(warna.key, ukuran)}
                    {@const pending = Math.max(0, jumlah - stok)}
                    <div class="rounded-lg border border-gray-100 bg-white px-3 py-2">
                      <div class="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <p class="text-sm font-semibold text-gray-800">{ukuran}</p>
                          <p class="text-xs text-gray-400">Stok: {stok} pcs</p>
                        </div>
                        <Input
                          type="number"
                          min="0"
                          value={jumlah || ""}
                          oninput={(e) =>
                            setJumlahWarna(
                              warna.key,
                              ukuran,
                              Number((e.currentTarget as HTMLInputElement).value || 0),
                            )}
                          class="w-24 text-center"
                          placeholder="0"
                        />
                      </div>
                      {#if jumlah > 0}
                        <p class="text-xs text-gray-500">
                          Keluar: {Math.min(jumlah, stok)} pcs
                          {#if pending > 0}
                            · <span class="text-amber-600">Pending: {pending} pcs</span>
                          {/if}
                        </p>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/each}

            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <p class="text-sm text-gray-600">
                Input: <span class="font-semibold text-gray-800">{inputTotal} pcs</span>
                · Keluar: <span class="font-semibold text-green-700">{inputKeluarTotal} pcs</span>
                · Pending: <span class="font-semibold text-amber-700">{inputPendingTotal} pcs</span>
              </p>
              <Button onclick={tambahKeDaftar} disabled={!canAdd}>
                <PlusIcon class="h-4 w-4" />
                Tambah ke Daftar
              </Button>
            </div>
          </div>
          {/if}
        {:else}
          <div class="space-y-4">
            <div>
              <label class="mb-1.5 block text-sm font-medium text-gray-700" for="model-hijab-keluar">
                Model Hijab <span class="text-red-500">*</span>
              </label>
              <Select.Root
                type="single"
                value={fModelHijabId || undefined}
                onValueChange={(val) => {
                  fModelHijabId = val ?? "";
                  fStokHijabId = "";
                  fJumlahHijab = "";
                }}
              >
                <Select.Trigger id="model-hijab-keluar" class="w-full">
                  {#if selectedModelHijab}
                    <span>{selectedModelHijab.nama_hijab}</span>
                  {:else}
                    <span class="text-muted-foreground">-- Pilih model hijab --</span>
                  {/if}
                </Select.Trigger>
                <Select.Content class="max-h-60 overflow-y-auto" preventScroll={false}>
                  {#each modelHijabList.filter((model) => model.aktif) as model}
                    <Select.Item value={model.id}>{model.nama_hijab}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>

            {#if selectedModelHijab}
              <div>
                <label class="mb-1.5 block text-sm font-medium text-gray-700" for="stok-hijab-keluar">
                  Warna / Stok Hijab <span class="text-red-500">*</span>
                </label>
                {#if hijabStockOptions.length > 0}
                  <Select.Root
                    type="single"
                    value={fStokHijabId || undefined}
                    onValueChange={(val) => {
                      fStokHijabId = val ?? "";
                      fJumlahHijab = "";
                    }}
                  >
                    <Select.Trigger id="stok-hijab-keluar" class="w-full">
                      {#if selectedHijabStock}
                        <span>
                          {selectedHijabStock.nama_warna ?? "Tanpa warna"} · {selectedHijabStock.stok_tersedia.toLocaleString("id-ID")} pcs
                        </span>
                      {:else}
                        <span class="text-muted-foreground">-- Pilih warna stok --</span>
                      {/if}
                    </Select.Trigger>
                    <Select.Content class="max-h-60 overflow-y-auto" preventScroll={false}>
                      {#each hijabStockOptions as stock}
                        <Select.Item value={stock.id}>
                          {stock.nama_warna ?? "Tanpa warna"} · {stock.stok_tersedia.toLocaleString("id-ID")} pcs
                        </Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                {:else}
                  <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Belum ada stok hijab untuk model ini.
                  </p>
                {/if}
              </div>
            {/if}

            {#if selectedHijabStock}
              <div class="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-gray-800">Jumlah Keluar</p>
                    <p class="text-xs text-gray-400">
                      Stok tersedia: {selectedHijabStock.stok_tersedia.toLocaleString("id-ID")} pcs
                    </p>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    value={fJumlahHijab}
                    oninput={(e) => (fJumlahHijab = (e.currentTarget as HTMLInputElement).value)}
                    class="w-28 text-center"
                    placeholder="0"
                  />
                </div>
                {#if jumlahHijab > 0}
                  <p class="text-xs text-gray-500">
                    Keluar: {hijabKeluarTotal} pcs
                    {#if hijabPendingTotal > 0}
                      · <span class="text-amber-600">Pending: {hijabPendingTotal} pcs</span>
                    {/if}
                  </p>
                {/if}
              </div>
            {/if}

            <div class="flex justify-end">
              <Button onclick={tambahKeDaftar} disabled={!canAdd}>
                <PlusIcon class="h-4 w-4" />
                Tambah ke Daftar
              </Button>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <aside class="space-y-4">
      <div class="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold text-gray-800">Daftar Barang</h2>
        {#if draftItems.length === 0}
          <p class="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-400">
            Belum ada barang ditambahkan.
          </p>
        {:else}
          <div class="space-y-2">
            {#each draftItems as item, index}
              <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <div class="flex items-start gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <p class="truncate text-sm font-medium text-gray-800">
                        {item.nama_model}{item.nama_warna ? ` - ${item.nama_warna}` : ""}
                      </p>
                      <Badge
                        variant="outline"
                        class={item.status === "pending"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-green-200 bg-green-50 text-green-700"}
                      >
                        {item.status === "pending" ? "Pending" : "Keluar"}
                      </Badge>
                    </div>
                    <p class="mt-1 text-xs text-gray-500">
                      {itemSummary(item)} · {item.total_pcs} pcs
                    </p>
                    <p class="mt-0.5 text-xs text-gray-400">
                      {item.tujuan}{item.nama_reseller ? ` · ${item.nama_reseller}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onclick={() => hapusDraftItem(index)}
                    class="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
                    title="Hapus item"
                  >
                    <Trash2Icon class="h-4 w-4" />
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
        <div class="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div class="rounded-lg bg-green-50 px-3 py-2">
            <p class="text-xs text-green-700">Keluar</p>
            <p class="text-lg font-semibold text-green-800">{totalDraftKeluarPcs}</p>
          </div>
          <div class="rounded-lg bg-amber-50 px-3 py-2">
            <p class="text-xs text-amber-700">Pending</p>
            <p class="text-lg font-semibold text-amber-800">{totalDraftPendingPcs}</p>
          </div>
        </div>
        <Button class="w-full" onclick={submit} disabled={saving || !canSubmit}>
          {saving ? "Menyimpan..." : "Simpan List Barang Keluar"}
        </Button>
      </div>
    </aside>
  </div>
{/if}
