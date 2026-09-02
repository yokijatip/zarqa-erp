<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { getBatchById, lengkapiKainBatchCutting } from "$lib/firebase/batch-produksi";
  import { batchCache, modelBajuCache, stokKainCache } from "$lib/stores/data-cache.svelte";
  import { currentUser } from "$lib/stores/auth.store";
  import {
    type BatchProduksi,
    type KainDigunakan,
    type ModelBaju,
    type StokKain,
    canonicalUkuran,
    type UkuranBaju,
  } from "$lib/types";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import LoaderIcon from "@lucide/svelte/icons/loader";

  type KainForm = {
    kain_id: string;
    jenis_kain: string;
    nama_kain: string;
    satuan: "yard" | "kg";
    jumlah_dipakai: string;
    yard_per_pcs: string;
  };

  const batchId = $derived($page.params.id);

  let batch = $state<BatchProduksi | null>(null);
  let model = $state<ModelBaju | null>(null);
  let stokKainList = $state<StokKain[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);
  let fUkuran = $state<UkuranBaju | "">("");
  let fCatatan = $state("");
  let fKain = $state<KainForm[]>([]);

  let stokKainGroups = $derived.by(() => {
    const map = new Map<string, StokKain[]>();
    for (const kain of stokKainList.filter((item) => item.stok_tersedia > 0)) {
      const list = map.get(kain.nama_kain) ?? [];
      list.push(kain);
      map.set(kain.nama_kain, list);
    }
    return Array.from(map.entries())
      .map(([nama_kain, items]) => ({
        nama_kain,
        total: items.reduce((sum, item) => sum + item.stok_tersedia, 0),
        items: [...items].sort((a, b) => (a.nama_warna ?? "").localeCompare(b.nama_warna ?? "")),
      }))
      .sort((a, b) => a.nama_kain.localeCompare(b.nama_kain));
  });

  function stokKainByJenis(namaKain: string) {
    return stokKainGroups.find((group) => group.nama_kain === namaKain)?.items ?? [];
  }

  function defaultYardPerPcs(): string {
    if (!model || !fUkuran) return "";
    const value = model.kebutuhan_yard_per_pcs?.[fUkuran];
    return value && value > 0 ? String(value) : "";
  }

  function addKain() {
    fKain = [
      ...fKain,
      {
        kain_id: "",
        jenis_kain: "",
        nama_kain: "",
        satuan: "yard",
        jumlah_dipakai: "",
        yard_per_pcs: defaultYardPerPcs(),
      },
    ];
  }

  let perKainEstimasi = $derived.by(() =>
    fKain
      .map((kain, index) => {
        const yard = Number(kain.jumlah_dipakai) || 0;
        const rasio = Number(kain.yard_per_pcs || defaultYardPerPcs()) || 0;
        if (yard <= 0 || rasio <= 0) return null;
        const pcs = Math.floor(yard / rasio);
        return {
          index,
          nama: kain.nama_kain || kain.jenis_kain || `Kain #${index + 1}`,
          pcs,
          sisa: yard - pcs * rasio,
        };
      })
      .filter(Boolean) as Array<{ index: number; nama: string; pcs: number; sisa: number }>,
  );

  let estimasiPcs = $derived(
    perKainEstimasi.length > 0 ? Math.min(...perKainEstimasi.map((item) => item.pcs)) : 0,
  );
  let kainPembatas = $derived(
    perKainEstimasi.length > 0
      ? perKainEstimasi.reduce((min, item) => (item.pcs < min.pcs ? item : min))
      : null,
  );
  let kainDibutuhkan = $derived(
    fKain
      .map((kain) => ({
        kain_id: kain.kain_id,
        nama_kain: kain.nama_kain,
        satuan: kain.satuan,
        jumlah_dipakai: Number(kain.jumlah_dipakai) || 0,
      }))
      .filter((kain) => kain.kain_id && kain.jumlah_dipakai > 0),
  ) as KainDigunakan[];
  let canSubmit = $derived(
    !!batch &&
      batch.status === "PENDING_KAIN" &&
      fUkuran !== "" &&
      kainDibutuhkan.length > 0 &&
      perKainEstimasi.length === fKain.length &&
      estimasiPcs > 0,
  );

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      const id = batchId;
      if (!id) throw new Error("ID batch tidak valid.");
      const [batchData, models, kain] = await Promise.all([
        getBatchById(id),
        modelBajuCache.get(),
        stokKainCache.get(true),
      ]);
      batch = batchData;
      model = models.find((item) => item.id === batchData?.model_id) ?? null;
      stokKainList = kain;
      fUkuran = batchData?.detail_ukuran[0]?.ukuran
        ? canonicalUkuran(batchData.detail_ukuran[0].ukuran)
        : "";
      fKain = [];
      addKain();
      if (!batchData) errorMsg = "Batch tidak ditemukan.";
      else if (batchData.status !== "PENDING_KAIN") errorMsg = "Batch ini sudah punya pembagian kain.";
    } catch (error: any) {
      errorMsg = error?.message ?? "Gagal memuat data pembagian kain.";
    } finally {
      loading = false;
    }
  }

  async function submit() {
    if (!batch || !$currentUser || !canSubmit || !fUkuran) return;
    saving = true;
    errorMsg = null;
    try {
      const nama = $currentUser.name || $currentUser.email || $currentUser.uid;
      await lengkapiKainBatchCutting(
        batch.id,
        [{ ukuran: fUkuran, jumlah_pcs: estimasiPcs }],
        kainDibutuhkan,
        $currentUser.uid,
        nama,
        fCatatan,
      );
      batchCache.invalidate();
      stokKainCache.invalidate();
      await goto(`/monitor-produksi/${batch.id}`);
    } catch (error: any) {
      errorMsg = error?.message ?? "Gagal menyimpan pembagian kain.";
    } finally {
      saving = false;
    }
  }

  onMount(load);
</script>

<div class="space-y-5">
  <Button variant="ghost" class="px-0" onclick={() => goto("/produksi/cutting")}>
    <ArrowLeftIcon class="mr-2 h-4 w-4" />
    Kembali
  </Button>

  <div class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-xl font-semibold text-gray-900">Pembagian Kain Cutting</h1>
      <p class="mt-1 text-sm text-gray-500">
        Isi kain yang benar-benar dibagikan ke tukang cutting, lalu stok kain akan langsung berkurang.
      </p>
    </div>
    {#if batch}
      <div class="rounded-xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-right">
        <p class="text-sm font-semibold text-cyan-900">{batch.nama_model}</p>
        <p class="text-xs text-cyan-700">{batch.nama_warna ?? "Tanpa warna"} · {fUkuran || "-"}</p>
      </div>
    {/if}
  </div>

  {#if loading}
    <div class="rounded-xl border border-gray-100 bg-white p-6 text-sm text-gray-500">
      Memuat data...
    </div>
  {:else if errorMsg}
    <div class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {errorMsg}
    </div>
  {:else if batch}
    <div class="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div class="space-y-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700">Ukuran</label>
            <Select.Root type="single" value={fUkuran || undefined} onValueChange={(value) => (fUkuran = (value ?? "") as UkuranBaju | "")}>
              <Select.Trigger class="w-full">{fUkuran || "Pilih ukuran"}</Select.Trigger>
              <Select.Content preventScroll={false}>
                {#each [...new Set((model?.ukuran_tersedia ?? []).map((ukuran) => canonicalUkuran(ukuran)))] as ukuran}
                  <Select.Item value={ukuran}>{ukuran}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700">Catatan</label>
            <Input bind:value={fCatatan} placeholder="Opsional" />
          </div>
        </div>

        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-sm font-semibold text-gray-900">Kain Dibagikan</p>
            <Button variant="outline" size="sm" onclick={addKain}>Tambah Kain</Button>
          </div>

          {#each fKain as kainEntry, i}
            {@const kainStok = stokKainList.find((kain) => kain.id === kainEntry.kain_id)}
            {@const pilihanWarnaKain = stokKainByJenis(kainEntry.jenis_kain)}
            {@const est = perKainEstimasi.find((item) => item.index === i)}
            <div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div class="mb-3 flex items-center justify-between">
                <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Kain #{i + 1}</p>
                {#if fKain.length > 1}
                  <button
                    type="button"
                    class="text-xs font-medium text-red-500"
                    onclick={() => (fKain = fKain.filter((_, index) => index !== i))}
                  >
                    Hapus
                  </button>
                {/if}
              </div>

              <div class="grid gap-3 md:grid-cols-2">
                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-600">Jenis kain</label>
                  <Select.Root
                    type="single"
                    value={kainEntry.jenis_kain || undefined}
                    onValueChange={(value) => {
                      kainEntry.jenis_kain = value ?? "";
                      kainEntry.kain_id = "";
                      kainEntry.nama_kain = "";
                    }}
                  >
                    <Select.Trigger class="w-full bg-white">
                      {kainEntry.jenis_kain || "Pilih jenis kain"}
                    </Select.Trigger>
                    <Select.Content preventScroll={false} class="max-h-60">
                      {#each stokKainGroups as group}
                        <Select.Item value={group.nama_kain}>
                          <span class="flex w-full items-center gap-2">
                            <span>{group.nama_kain}</span>
                            <span class="ml-auto text-xs text-gray-400">{group.items.length} warna</span>
                          </span>
                        </Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>

                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-600">Warna / stok</label>
                  <Select.Root
                    type="single"
                    value={kainEntry.kain_id || undefined}
                    onValueChange={(value) => {
                      const found = stokKainList.find((item) => item.id === value);
                      if (!found) return;
                      kainEntry.kain_id = found.id;
                      kainEntry.jenis_kain = found.nama_kain;
                      kainEntry.satuan = found.satuan;
                      kainEntry.nama_kain = found.nama_warna
                        ? `${found.nama_kain} (${found.nama_warna})`
                        : found.nama_kain;
                    }}
                  >
                    <Select.Trigger class="w-full bg-white" disabled={!kainEntry.jenis_kain}>
                      {#if kainStok}
                        <span class="flex min-w-0 items-center gap-2">
                          {#if kainStok.kode_hex_warna}
                            <span class="h-2.5 w-2.5 rounded-full" style="background-color: {kainStok.kode_hex_warna}"></span>
                          {/if}
                          <span class="truncate">{kainStok.nama_warna ?? "Tanpa warna"}</span>
                          <span class="ml-auto text-xs text-gray-400">{kainStok.stok_tersedia} {kainStok.satuan}</span>
                        </span>
                      {:else}
                        {kainEntry.jenis_kain ? "Pilih warna" : "Pilih jenis dulu"}
                      {/if}
                    </Select.Trigger>
                    <Select.Content preventScroll={false} class="max-h-60">
                      {#each pilihanWarnaKain as kain}
                        <Select.Item value={kain.id}>
                          <span class="flex w-full items-center gap-2">
                            {#if kain.kode_hex_warna}
                              <span class="h-2.5 w-2.5 rounded-full" style="background-color: {kain.kode_hex_warna}"></span>
                            {/if}
                            <span>{kain.nama_warna ?? "Tanpa warna"}</span>
                            <span class="ml-auto text-xs text-gray-400">{kain.stok_tersedia} {kain.satuan}</span>
                          </span>
                        </Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
              </div>

              <div class="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-600">Total kain dipakai ({kainEntry.satuan})</label>
                  <Input type="number" min="0" step="0.1" bind:value={kainEntry.jumlah_dipakai} placeholder="0" />
                </div>
                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-600">Yard per pcs</label>
                  <Input type="number" min="0" step="0.1" bind:value={kainEntry.yard_per_pcs} placeholder={defaultYardPerPcs() || "Opsional"} />
                </div>
              </div>

              {#if defaultYardPerPcs()}
                <p class="mt-2 text-xs text-cyan-700">Rasio master: {defaultYardPerPcs()} yard/pcs.</p>
              {/if}
              {#if est}
                <p class="mt-1 text-xs text-gray-500">
                  Estimasi {est.pcs} pcs dari kain ini · sisa {est.sisa.toFixed(2)} yard
                </p>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <div class="h-fit rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <p class="text-sm font-semibold text-gray-900">Estimasi Hasil</p>
        <p class="mt-3 text-4xl font-semibold text-cyan-700">{estimasiPcs}</p>
        <p class="text-sm text-gray-500">pcs ukuran {fUkuran || "-"}</p>
        {#if kainPembatas}
          <p class="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Dibatasi oleh {kainPembatas.nama}, sisa {kainPembatas.sisa.toFixed(2)} yard.
          </p>
        {/if}
        {#if fKain.length > 0 && perKainEstimasi.length < fKain.length}
          <p class="mt-3 text-xs text-amber-600">Lengkapi kain, jumlah dipakai, dan yard/pcs supaya estimasi bisa disimpan.</p>
        {/if}
        <Button class="mt-5 w-full" disabled={!canSubmit || saving} onclick={submit}>
          {#if saving}
            <LoaderIcon class="mr-2 h-4 w-4 animate-spin" />
            Menyimpan...
          {:else}
            Simpan Pembagian Kain
          {/if}
        </Button>
      </div>
    </div>
  {/if}
</div>
