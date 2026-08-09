<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import type { BarangKeluar } from "$lib/types";

  let {
    open = $bindable(false),
    riwayat,
  }: {
    open: boolean;
    riwayat: BarangKeluar | null;
  } = $props();

  type BarisPekerja = { uid: string; nama: string; jumlah_pcs: number };

  // Gabungkan semua lot (dari semua ukuran) jadi rekap per tahap: siapa saja
  // yang berkontribusi & berapa pcs masing-masing. Pcs yang tidak punya data
  // lot (stok lama dari sebelum fitur ini ada) dihitung terpisah sebagai
  // "data lama".
  function rekapTahap(
    detailKeluar: BarangKeluar["detail_keluar"],
    tahap: "cutting" | "jahit" | "steam",
  ): { pekerja: BarisPekerja[]; dataLama: number } {
    const map = new Map<string, BarisPekerja>();
    let totalPcs = 0;

    for (const d of detailKeluar) {
      totalPcs += d.jumlah_pcs;
      for (const lot of d.sumber ?? []) {
        const worker = lot.penugasan?.[tahap];
        if (!worker) continue;
        const existing = map.get(worker.uid) ?? {
          uid: worker.uid,
          nama: worker.nama,
          jumlah_pcs: 0,
        };
        existing.jumlah_pcs += lot.jumlah_pcs;
        map.set(worker.uid, existing);
      }
    }

    const pekerja = [...map.values()].sort(
      (a, b) => b.jumlah_pcs - a.jumlah_pcs,
    );
    const totalTerlacak = pekerja.reduce((s, p) => s + p.jumlah_pcs, 0);
    return { pekerja, dataLama: Math.max(0, totalPcs - totalTerlacak) };
  }

  let tahapList = $derived(
    riwayat
      ? (
          [
            { key: "cutting", label: "Cutting" },
            { key: "jahit", label: "Jahit" },
            { key: "steam", label: "Steam" },
          ] as const
        ).map((t) => ({
          ...t,
          ...rekapTahap(riwayat!.detail_keluar, t.key),
        }))
      : [],
  );
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Detail Pekerja</Dialog.Title>
      <Dialog.Description>
        {#if riwayat}
          Rekap pekerja per tahap untuk pengiriman {riwayat.nama_model} — {riwayat.total_pcs}
          pcs
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if riwayat}
      <div class="max-h-[60vh] space-y-4 overflow-y-auto">
        {#each tahapList as tahap}
          <div>
            <p
              class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400"
            >
              {tahap.label}
            </p>
            {#if tahap.pekerja.length === 0 && tahap.dataLama === 0}
              <p class="text-xs text-gray-400">Tidak ada data.</p>
            {:else}
              <div class="space-y-1">
                {#each tahap.pekerja as p}
                  <div
                    class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                  >
                    <p class="text-sm text-gray-700">{p.nama}</p>
                    <p class="text-sm font-semibold text-gray-800">
                      {p.jumlah_pcs} pcs
                    </p>
                  </div>
                {/each}
                {#if tahap.dataLama > 0}
                  <div
                    class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                  >
                    <p class="text-sm text-gray-400">Data lama</p>
                    <p class="text-sm font-medium text-gray-400">
                      {tahap.dataLama} pcs
                    </p>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Tutup</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
