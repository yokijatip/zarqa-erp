<script lang="ts">
  import { goto } from "$app/navigation";
  import { catatBarangKeluar } from "$lib/firebase/barang-jadi";
  import { barangJadiCache, modelBajuCache, barangKeluarCache } from "$lib/stores/data-cache.svelte";
  import { currentUser } from "$lib/stores/auth.store";
  import {
    TUJUAN_PENGIRIMAN_OPTIONS,
    UKURAN_ORDER,
    type BarangKeluarItem,
    type ModelBaju,
    type StokBarangJadi,
    type UkuranBaju,
  } from "$lib/types";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Badge } from "$lib/components/ui/badge";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  type ModelOption = {
    key: string;
    model_id: string;
    nama_model: string;
    ukuran_tersedia: UkuranBaju[];
    warna_tersedia: ModelBaju["warna_tersedia"];
    stok: StokBarangJadi[];
  };

  type WarnaOption = {
    key: string;
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

  let loading = $state(true);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);

  let stokList = $state<StokBarangJadi[]>([]);
  let modelList = $state<ModelBaju[]>([]);

  let fTujuan = $state("");
  let fNamaReseller = $state("");
  let fKeterangan = $state("");
  let fModelKey = $state("");
  let fWarnaKeys = $state<string[]>([]);
  let fJumlahByWarna = $state<Record<string, Partial<Record<UkuranBaju, number>>>>({});
  let draftItems = $state<DraftBarangKeluarItem[]>([]);

  let modelOptions = $derived.by<ModelOption[]>(() => {
    const map = new Map<string, ModelOption>();
    for (const model of modelList.filter((m) => m.aktif)) {
      map.set(model.id, {
        key: model.id,
        model_id: model.id,
        nama_model: model.nama_model,
        ukuran_tersedia: model.ukuran_tersedia,
        warna_tersedia: model.warna_tersedia,
        stok: [],
      });
    }
    for (const stok of stokList) {
      map.get(stok.model_id)?.stok.push(stok);
    }
    return [...map.values()].sort((a, b) =>
      a.nama_model.localeCompare(b.nama_model),
    );
  });

  let selectedModel = $derived(
    modelOptions.find((m) => m.key === fModelKey) ?? null,
  );

  let selectedUkuranList = $derived(
    selectedModel?.ukuran_tersedia?.length
      ? selectedModel.ukuran_tersedia
      : UKURAN_ORDER,
  );

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
    for (const warna of selectedWarnaList) {
      for (const ukuran of selectedUkuranList) {
        total += Math.min(jumlahWarna(warna.key, ukuran), stokTersedia(warna, ukuran));
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

  let canAdd = $derived(!!selectedModel && selectedWarnaList.length > 0 && inputTotal > 0 && fTujuan.trim() !== "");
  let canSubmit = $derived(draftItems.length > 0);

  function itemSummary(item: BarangKeluarItem): string {
    return item.detail_keluar.map((d) => `${d.ukuran}: ${d.jumlah_pcs}`).join(", ");
  }

  function resetItemForm() {
    fModelKey = "";
    fWarnaKeys = [];
    fJumlahByWarna = {};
  }

  function tambahKeDaftar() {
    if (!selectedModel || !canAdd) return;
    const tujuanSnapshot = fTujuan.trim();
    const resellerSnapshot = fNamaReseller.trim();
    const keteranganSnapshot = fKeterangan.trim();
    const keluarItems: DraftBarangKeluarItem[] = [];
    const pendingItems: DraftBarangKeluarItem[] = [];
    const modelHarga = modelList.find((entry) => entry.id === selectedModel.model_id);
    const hargaJual = (ukuran: UkuranBaju) => modelHarga?.harga_jual_per_ukuran?.[ukuran] ?? modelHarga?.harga_jual ?? 0;
    const hargaProduksi = modelHarga?.harga_produksi ?? 0;

    for (const warna of selectedWarnaList) {
      const detailKeluar: BarangKeluarItem["detail_keluar"] = [];
      const detailPending: BarangKeluarItem["detail_keluar"] = [];

      for (const ukuran of selectedUkuranList) {
        const jumlah = jumlahWarna(warna.key, ukuran);
        if (jumlah <= 0) continue;
        const tersedia = stokTersedia(warna, ukuran);
        const jumlahKeluar = Math.min(jumlah, tersedia);
        const jumlahPending = Math.max(0, jumlah - tersedia);

        if (jumlahKeluar > 0) {
          detailKeluar.push({ ukuran, jumlah_pcs: jumlahKeluar, harga_jual: hargaJual(ukuran), harga_produksi: hargaProduksi });
        }
        if (jumlahPending > 0) {
          detailPending.push({ ukuran, jumlah_pcs: jumlahPending, harga_jual: hargaJual(ukuran), harga_produksi: hargaProduksi });
        }
      }

      const base = {
        model_id: selectedModel.model_id,
        nama_model: selectedModel.nama_model,
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
      [stokList, modelList] = await Promise.all([
        barangJadiCache.get(),
        modelBajuCache.get(),
      ]);
    } catch {
      errorMsg = "Gagal memuat data model dan stok.";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
  });
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
                {#each TUJUAN_PENGIRIMAN_OPTIONS as t}
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

        <div class="mb-4">
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="model-keluar">
            Model Baju <span class="text-red-500">*</span>
          </label>
          <Select.Root
            type="single"
            value={fModelKey || undefined}
            onValueChange={(val) => {
              fModelKey = val ?? "";
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
