<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { getModelBajuById, getModelBajuList } from "$lib/firebase/model-baju";
  import { getKanalPenjualan } from "$lib/firebase/penjualan";
  import { modelBajuCache, warnaCache } from "$lib/stores/data-cache.svelte";
  import type { KanalPenjualan, ModelBaju, Warna } from "$lib/types";
  import ModelBajuEditForm from "$lib/components/model-baju-edit-form.svelte";
  import { Button } from "$lib/components/ui/button";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ShirtIcon from "@lucide/svelte/icons/shirt";

  let model = $state<ModelBaju | null>(null);
  let modelList = $state<ModelBaju[]>([]);
  let warnaList = $state<Warna[]>([]);
  let kanalList = $state<KanalPenjualan[]>([]);
  let loading = $state(true);
  let errorMsg = $state<string | null>(null);

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      const id = $page.params.id;
      if (!id) {
        errorMsg = "ID model baju tidak valid.";
        return;
      }
      const [loadedModel, loadedModels, loadedWarna, loadedKanal] = await Promise.all([
        getModelBajuById(id),
        getModelBajuList(false),
        warnaCache.get(),
        getKanalPenjualan(),
      ]);
      if (!loadedModel) {
        errorMsg = "Model baju tidak ditemukan.";
        return;
      }
      model = loadedModel;
      modelList = loadedModels;
      warnaList = loadedWarna;
      kanalList = loadedKanal;
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : "Gagal memuat model baju.";
    } finally {
      loading = false;
    }
  }

  function showError(message: string) {
    errorMsg = message;
  }

  async function handleSaved() {
    modelBajuCache.invalidate();
    await goto("/model-baju");
  }

  onMount(load);
</script>

<svelte:head><title>Edit Model Baju - Zarqa ERP</title></svelte:head>

<div class="space-y-6 p-6">
  <div class="flex flex-col gap-4 border-b border-gray-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-start gap-3">
      <Button variant="outline" size="icon" aria-label="Kembali ke Model Baju" title="Kembali ke Model Baju" onclick={() => goto("/model-baju")}>
        <ArrowLeftIcon class="h-4 w-4" />
      </Button>
      <div>
        <p class="text-sm text-gray-400">Gudang / Model Baju</p>
        <h1 class="mt-1 text-2xl font-semibold text-gray-900">Edit Model Baju</h1>
        {#if model}<p class="mt-1 text-sm text-gray-500">Perbarui informasi {model.nama_model}.</p>{/if}
      </div>
    </div>
    {#if model}
      <div class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
        <ShirtIcon class="h-4 w-4" />
        <span class="max-w-52 truncate font-medium text-gray-900">{model.nama_model}</span>
        <span class="rounded-full border border-gray-200 px-2 py-0.5 text-xs">{model.aktif ? "Aktif" : "Nonaktif"}</span>
      </div>
    {/if}
  </div>

  {#if errorMsg}
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span>{errorMsg}</span>
      {#if !model}<Button variant="outline" size="sm" onclick={load}>Coba lagi</Button>{/if}
    </div>
  {/if}

  {#if loading}
    <div class="space-y-4">
      <div class="h-48 animate-pulse rounded-xl bg-gray-100"></div>
      <div class="h-56 animate-pulse rounded-xl bg-gray-100"></div>
      <div class="h-72 animate-pulse rounded-xl bg-gray-100"></div>
    </div>
  {:else if model}
    <ModelBajuEditForm {model} {modelList} {warnaList} {kanalList} onSaved={handleSaved} onError={showError} />
  {/if}
</div>
