<script lang="ts">
  import {
    getRejectItemsByBatch,
    resolveRejectItem,
  } from "$lib/firebase/reject-items";
  import { currentUser } from "$lib/stores/auth.store";
  import type { RejectItem, AksiResolusiReject } from "$lib/types";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import LoaderIcon from "@lucide/svelte/icons/loader-2";

  let {
    open = $bindable(false),
    batchId,
    onResolved,
  }: {
    open: boolean;
    batchId: string | null;
    onResolved?: () => void;
  } = $props();

  let items = $state<RejectItem[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Form kecil per item: jumlah yang mau diproses + catatan (opsional)
  let jumlahInput = $state<Record<string, number>>({});
  let catatanInput = $state<Record<string, string>>({});
  let savingId = $state<string | null>(null);

  $effect(() => {
    if (open && batchId) {
      load(batchId);
    } else if (!open) {
      items = [];
      error = null;
    }
  });

  async function load(id: string) {
    loading = true;
    error = null;
    try {
      items = await getRejectItemsByBatch(id);
      for (const item of items) {
        const sisa = item.jumlah - item.jumlah_diperbaiki - item.jumlah_gagal;
        jumlahInput[item.id!] = sisa;
      }
    } catch (e: any) {
      error = e?.message ?? "Gagal memuat data reject.";
    } finally {
      loading = false;
    }
  }

  function sisaOf(item: RejectItem): number {
    return item.jumlah - item.jumlah_diperbaiki - item.jumlah_gagal;
  }

  async function handleAksi(item: RejectItem, aksi: AksiResolusiReject) {
    if (!$currentUser || !item.id) return;
    const jumlah = Number(jumlahInput[item.id]) || 0;
    const sisa = sisaOf(item);
    if (jumlah <= 0 || jumlah > sisa) {
      error = `Jumlah untuk ukuran ${item.ukuran} harus antara 1–${sisa} pcs`;
      return;
    }
    savingId = item.id;
    error = null;
    try {
      await resolveRejectItem(item.id, aksi, jumlah, {
        uid: $currentUser.uid,
        nama: $currentUser.name || $currentUser.email || $currentUser.uid,
        catatan: catatanInput[item.id]?.trim() || undefined,
      });
      if (batchId) await load(batchId);
      onResolved?.();
    } catch (e: any) {
      error = e?.message ?? "Gagal menyimpan resolusi reject.";
    } finally {
      savingId = null;
    }
  }

  let belumSelesai = $derived(items.filter((i) => sisaOf(i) > 0));
  let sudahSelesai = $derived(items.filter((i) => sisaOf(i) === 0));
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Tindak Lanjut Reject</Dialog.Title>
      <Dialog.Description>
        Tentukan nasib setiap pcs reject: diperbaiki (masuk stok gudang) atau
        tidak bisa diperbaiki (dibuang/scrap).
      </Dialog.Description>
    </Dialog.Header>

    {#if error}
      <p
        class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {error}
      </p>
    {/if}

    {#if loading}
      <div class="flex items-center justify-center py-8 text-gray-400">
        <LoaderIcon class="h-5 w-5 animate-spin" />
      </div>
    {:else if items.length === 0}
      <p class="py-6 text-center text-sm text-gray-400">
        Tidak ada data reject untuk batch ini.
      </p>
    {:else}
      <div class="max-h-[60vh] space-y-3 overflow-y-auto">
        {#each belumSelesai as item (item.id)}
          <div class="rounded-lg border border-red-200 bg-red-50/50 p-3">
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold text-gray-800">
                Ukuran {item.ukuran}
              </p>
              <p class="text-xs text-red-600">
                Sisa {sisaOf(item)} / {item.jumlah} pcs
              </p>
            </div>
            <div class="mt-2 flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max={sisaOf(item)}
                bind:value={jumlahInput[item.id!]}
                class="h-8 w-20 text-sm"
                disabled={savingId === item.id}
              />
              <span class="text-xs text-gray-500">pcs</span>
            </div>
            <Input
              type="text"
              placeholder="Catatan (opsional)"
              bind:value={catatanInput[item.id!]}
              class="mt-2 h-8 text-xs"
              disabled={savingId === item.id}
            />
            <div class="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                class="flex-1 text-red-700"
                disabled={savingId === item.id}
                onclick={() => handleAksi(item, "tidak_bisa_diperbaiki")}
              >
                {#if savingId === item.id}<LoaderIcon
                    class="mr-1 h-3.5 w-3.5 animate-spin"
                  />{/if}
                Tidak Bisa Diperbaiki
              </Button>
              <Button
                size="sm"
                class="flex-1"
                disabled={savingId === item.id}
                onclick={() => handleAksi(item, "diperbaiki")}
              >
                {#if savingId === item.id}<LoaderIcon
                    class="mr-1 h-3.5 w-3.5 animate-spin"
                  />{/if}
                Selesai Diperbaiki
              </Button>
            </div>
          </div>
        {/each}

        {#if sudahSelesai.length > 0}
          <div class="pt-1">
            <p class="mb-1.5 text-xs font-medium text-gray-400">
              Sudah selesai
            </p>
            {#each sudahSelesai as item (item.id)}
              <div
                class="mb-1.5 flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
              >
                <p class="text-xs text-gray-600">Ukuran {item.ukuran}</p>
                <p class="text-xs text-gray-500">
                  {#if item.jumlah_diperbaiki > 0}
                    <span class="text-emerald-600"
                      >{item.jumlah_diperbaiki} diperbaiki</span
                    >
                  {/if}
                  {#if item.jumlah_diperbaiki > 0 && item.jumlah_gagal > 0}
                    ·
                  {/if}
                  {#if item.jumlah_gagal > 0}
                    <span class="text-gray-500"
                      >{item.jumlah_gagal} dibuang</span
                    >
                  {/if}
                </p>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Tutup</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
