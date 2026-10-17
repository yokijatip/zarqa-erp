<script lang="ts">
  import { onMount } from "svelte";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SaveIcon from "@lucide/svelte/icons/save";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { currentUser, userRole } from "$lib/stores/auth.store";
  import { getModelBajuList } from "$lib/firebase/model-baju";
  import { catatPekerjaanSteam, getPekerjaanSteamPeriode } from "$lib/firebase/pekerjaan-steam";
  import type { ModelBaju, PekerjaanSteam, UserRole } from "$lib/types";

  let models = $state<ModelBaju[]>([]);
  let pekerjaan = $state<PekerjaanSteam[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  let modelId = $state("");
  let warnaId = $state("");
  let ukuran = $state("");
  let pcs = $state("");
  let catatan = $state("");

  const allowedRoles: UserRole[] = ["kepala_steam", "admin_gudang", "owner", "developer"];
  let canUse = $derived(!!$userRole && allowedRoles.includes($userRole as UserRole));
  let selectedModel = $derived(models.find((model) => model.id === modelId) ?? null);
  let selectedWarna = $derived(selectedModel?.warna_tersedia?.find((warna) => warna.warna_id === warnaId) ?? null);
  let availableSizes = $derived(selectedModel?.ukuran_tersedia?.length ? selectedModel.ukuran_tersedia : ["All Size"]);

  function resetForm() {
    modelId = "";
    warnaId = "";
    ukuran = "";
    pcs = "";
    catatan = "";
  }

  function selectModel(value: string | undefined) {
    modelId = value ?? "";
    warnaId = "";
    ukuran = "";
  }

  async function load() {
    loading = true;
    error = null;
    try {
      const [modelList, workList] = await Promise.all([getModelBajuList(true), getPekerjaanSteamPeriode()]);
      models = modelList;
      pekerjaan = workList;
    } catch (cause: any) {
      error = cause?.message ?? "Gagal memuat pekerjaan Steam.";
    } finally {
      loading = false;
    }
  }

  async function save() {
    if (!$currentUser || !selectedModel || !ukuran || !Number(pcs) || Number(pcs) <= 0) {
      error = "Pilih model, ukuran, dan isi jumlah pcs lebih dari 0.";
      return;
    }
    saving = true;
    error = null;
    success = null;
    try {
      await catatPekerjaanSteam(
        {
          model_id: selectedModel.id,
          nama_model: selectedModel.nama_model,
          warna_id: selectedWarna?.warna_id,
          nama_warna: selectedWarna?.nama_warna,
          kode_hex_warna: selectedWarna?.kode_hex,
          ukuran,
          pcs: Number(pcs),
          tarif_steam_snapshot: selectedModel.tarif_steam,
          catatan,
        },
        $currentUser.uid,
        $currentUser.name || $currentUser.email || $currentUser.uid,
      );
      success = "Pekerjaan Steam tersimpan.";
      resetForm();
      await load();
    } catch (cause: any) {
      error = cause?.message ?? "Gagal menyimpan pekerjaan Steam.";
    } finally {
      saving = false;
    }
  }

  function formatDate(item: PekerjaanSteam): string {
    const timestamp = item.timestamp?.toDate?.();
    return timestamp ? timestamp.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "Menunggu waktu";
  }

  onMount(load);
</script>

<svelte:head><title>Pekerjaan Steam | Zarqa ERP</title></svelte:head>

<div class="space-y-6 p-4 md:p-6">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-sm font-medium text-blue-600">Produksi</p>
      <h1 class="text-2xl font-semibold tracking-tight">Pekerjaan Steam</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">Catat jumlah model yang benar-benar disteam. Pencatatan ini terpisah dari batch produksi dan tidak mengubah stok barang jadi.</p>
    </div>
    <Button variant="outline" size="sm" onclick={load} disabled={loading}><RefreshCwIcon class={loading ? "animate-spin" : ""} /> Refresh</Button>
  </div>

  {#if error}<div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>{/if}
  {#if success}<div class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>{/if}

  {#if canUse}
    <section class="rounded-xl border bg-card p-4 shadow-sm md:p-6">
      <div class="mb-5 flex items-center gap-2">
        <PlusIcon class="size-5 text-primary" />
        <div><h2 class="font-semibold">Catat pekerjaan</h2><p class="text-xs text-muted-foreground">Satu catatan boleh berisi beberapa pcs dengan model, warna, dan ukuran yang sama.</p></div>
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2">
          <label for="steam-model" class="text-sm font-medium">Model baju</label>
          <Select.Root type="single" value={modelId || undefined} onValueChange={selectModel}>
            <Select.Trigger id="steam-model" class="w-full"><span class={selectedModel ? "" : "text-muted-foreground"}>{selectedModel?.nama_model ?? "Pilih model"}</span></Select.Trigger>
            <Select.Content class="max-h-72">{#each models as model}<Select.Item value={model.id}>{model.nama_model}</Select.Item>{/each}</Select.Content>
          </Select.Root>
        </div>
        <div class="space-y-2">
          <label for="steam-warna" class="text-sm font-medium">Warna</label>
          <Select.Root type="single" value={warnaId || undefined} onValueChange={(value) => (warnaId = value ?? "")}>
            <Select.Trigger id="steam-warna" class="w-full"><span class={selectedWarna ? "" : "text-muted-foreground"}>{selectedWarna?.nama_warna ?? "Pilih warna (opsional)"}</span></Select.Trigger>
            <Select.Content class="max-h-72">
              {#if (selectedModel?.warna_tersedia ?? []).length === 0}<Select.Item value="__none__" disabled>Tidak ada warna terdaftar</Select.Item>{:else}{#each selectedModel?.warna_tersedia ?? [] as warna}<Select.Item value={warna.warna_id}>{warna.nama_warna}</Select.Item>{/each}{/if}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="space-y-2">
          <label for="steam-ukuran" class="text-sm font-medium">Ukuran</label>
          <Select.Root type="single" value={ukuran || undefined} onValueChange={(value) => (ukuran = value ?? "")}>
            <Select.Trigger id="steam-ukuran" class="w-full"><span class={ukuran ? "" : "text-muted-foreground"}>{ukuran || "Pilih ukuran"}</span></Select.Trigger>
            <Select.Content>{#each availableSizes as size}<Select.Item value={size}>{size}</Select.Item>{/each}</Select.Content>
          </Select.Root>
        </div>
        <div class="space-y-2"><label for="steam-pcs" class="text-sm font-medium">Jumlah pcs</label><Input id="steam-pcs" type="number" min="1" step="1" bind:value={pcs} placeholder="Contoh: 10" /></div>
        <div class="space-y-2 md:col-span-2"><label for="steam-catatan" class="text-sm font-medium">Catatan <span class="font-normal text-muted-foreground">(opsional)</span></label><textarea id="steam-catatan" bind:value={catatan} rows="2" placeholder="Catatan pekerjaan..." class="border-input bg-background flex min-h-20 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"></textarea></div>
      </div>
      <div class="mt-5 flex justify-end"><Button onclick={save} disabled={saving || !selectedModel || !ukuran || Number(pcs) <= 0}><SaveIcon /> {saving ? "Menyimpan..." : "Simpan pekerjaan"}</Button></div>
    </section>
  {/if}

  <section class="rounded-xl border bg-card shadow-sm">
    <div class="border-b px-4 py-4 md:px-6"><h2 class="font-semibold">Riwayat pekerjaan Steam</h2><p class="text-xs text-muted-foreground">Data ini menjadi dasar penggajian Steam tanpa mengubah HPP standar model.</p></div>
    {#if loading}<div class="p-6 text-sm text-muted-foreground">Memuat riwayat...</div>{:else if pekerjaan.length === 0}<div class="p-6 text-sm text-muted-foreground">Belum ada pekerjaan Steam.</div>{:else}
      <div class="divide-y">{#each pekerjaan as item (item.id)}<div class="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6"><div class="flex items-center gap-3"><span class="size-3 rounded-full border" style:background={item.kode_hex_warna ?? "#94a3b8"}></span><div><p class="font-medium">{item.nama_model}</p><p class="text-xs text-muted-foreground">{item.nama_warna ?? "Tanpa warna"} · {item.ukuran || "All Size"} · {item.nama}</p></div></div><div class="text-right"><p class="font-semibold">{item.pcs.toLocaleString("id-ID")} pcs</p><p class="text-xs text-muted-foreground">{formatDate(item)}</p></div></div>{/each}</div>
    {/if}
  </section>
</div>
