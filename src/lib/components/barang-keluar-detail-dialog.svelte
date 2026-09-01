<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { hargaJualUntukUkuran } from "$lib/sales/penjualan";
  import type { BarangKeluar, BarangKeluarItem, ModelBaju } from "$lib/types";

  let {
    open = $bindable(false),
    riwayat,
    modelList = [],
    onResolvePending,
    onCancelItem,
  }: {
    open: boolean;
    riwayat: BarangKeluar | null;
    modelList?: ModelBaju[];
    onResolvePending?: (itemIndex: number) => Promise<void>;
    onCancelItem?: (itemIndex: number) => Promise<void>;
  } = $props();

  type BarisPekerja = { uid: string; nama: string; jumlah_pcs: number };
  let resolvingIndex = $state<number | null>(null);
  let cancellingIndex = $state<number | null>(null);
  let resolveError = $state<string | null>(null);

  function listItems(r: BarangKeluar): BarangKeluarItem[] {
    return r.items && r.items.length > 0
      ? r.items
      : [
          {
            model_id: r.model_id,
            nama_model: r.nama_model,
            ...(r.nama_warna ? { nama_warna: r.nama_warna } : {}),
            ...(r.kode_hex_warna ? { kode_hex_warna: r.kode_hex_warna } : {}),
            detail_keluar: r.detail_keluar,
            total_pcs: r.total_pcs,
            status: "keluar",
          },
        ];
  }

  function itemSummary(item: BarangKeluarItem): string {
    return item.detail_keluar
      .map((d) => `${d.ukuran}: ${d.jumlah_pcs}`)
      .join(", ");
  }

  function escapeHtml(value: unknown): string {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatTanggal(ts: any): string {
    if (!ts) return "-";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function hargaModel(modelId: string) {
    const model = modelList.find((item) => item.id === modelId);
    return {
      jual: model?.harga_jual ?? 0,
      produksi: model?.harga_produksi ?? 0,
    };
  }

  function formatRupiah(value: number): string {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(value);
  }

  function printList() {
    if (!riwayat) return;
    const printItems = listItems(riwayat);
    const rows = printItems
      .map((item, index) => {
        const detail = item.detail_keluar
          .map((d) => `${escapeHtml(d.ukuran)}: ${d.jumlah_pcs} pcs`)
          .join("<br />");
        const harga = hargaModel(item.model_id);
        const model = modelList.find((entry) => entry.id === item.model_id);
        const totalJual = item.status === "pending" ? 0 : item.detail_keluar.reduce(
          (sum, d) => sum + d.jumlah_pcs * (d.harga_jual ?? hargaJualUntukUkuran(model, d.ukuran)),
          0,
        );
        const totalProduksi = item.status === "pending" ? 0 : item.total_pcs * harga.produksi;
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(item.nama_model)}${item.nama_warna ? `<br /><small>${escapeHtml(item.nama_warna)}</small>` : ""}</td>
            <td>${detail}</td>
            <td class="right">${item.total_pcs} pcs</td>
            <td>${item.status === "pending" ? "Pending" : "Keluar"}</td>
            <td class="right">${totalJual > 0 ? escapeHtml(formatRupiah(totalJual / item.total_pcs)) : "-"}</td>
            <td class="right">${harga.produksi > 0 ? escapeHtml(formatRupiah(harga.produksi)) : "-"}</td>
            <td class="right">${escapeHtml(formatRupiah(totalJual))}</td>
            <td class="right">${escapeHtml(formatRupiah(totalProduksi))}</td>
            <td class="right">${escapeHtml(formatRupiah(totalJual - totalProduksi))}</td>
          </tr>
        `;
      })
      .join("");
    const totalKeluar = printItems
      .filter((item) => item.status !== "pending")
      .reduce((sum, item) => sum + item.total_pcs, 0);
    const totalPending = printItems
      .filter((item) => item.status === "pending")
      .reduce((sum, item) => sum + item.total_pcs, 0);
    const totalJual = printItems
      .filter((item) => item.status !== "pending")
      .reduce((sum, item) => sum + item.detail_keluar.reduce(
        (detailSum, detail) => detailSum + detail.jumlah_pcs * (detail.harga_jual ?? hargaJualUntukUkuran(modelList.find((model) => model.id === item.model_id), detail.ukuran)),
        0,
      ), 0);
    const totalProduksi = printItems
      .filter((item) => item.status !== "pending")
      .reduce((sum, item) => sum + item.total_pcs * hargaModel(item.model_id).produksi, 0);
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>List Barang Keluar</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
            h1 { font-size: 18px; margin: 0 0 4px; }
            .muted { color: #6b7280; font-size: 12px; }
            .meta { display: grid; grid-template-columns: 120px 1fr; gap: 4px 12px; margin: 18px 0; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { background: #111827; color: white; text-align: left; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; vertical-align: top; }
            small { color: #6b7280; }
            .right { text-align: right; }
            .summary { margin-top: 14px; display: flex; justify-content: flex-end; gap: 18px; font-size: 13px; font-weight: 700; }
            @media print { body { margin: 18mm; } button { display: none; } }
          </style>
        </head>
        <body>
          <h1>Zarqa - List Barang Keluar</h1>
          <div class="muted">Dicetak: ${escapeHtml(new Date().toLocaleString("id-ID"))}</div>
          <div class="meta">
            <div class="muted">Tanggal</div><div>${escapeHtml(formatTanggal(riwayat.tanggal_keluar))}</div>
            <div class="muted">Tujuan</div><div>${escapeHtml(riwayat.tujuan)}</div>
            <div class="muted">Reseller</div><div>${escapeHtml(riwayat.nama_reseller || "-")}</div>
            <div class="muted">Keterangan</div><div>${escapeHtml(riwayat.keterangan || "-")}</div>
            <div class="muted">Status</div><div>${escapeHtml(riwayat.status === "pending" ? "Pending" : "Selesai")}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Barang</th>
                <th>Ukuran</th>
                <th class="right">Total</th>
                <th>Status</th>
                <th class="right">Harga Jual</th>
                <th class="right">Harga Produksi</th>
                <th class="right">Total Jual</th>
                <th class="right">Total Produksi</th>
                <th class="right">Laba Kotor</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="summary">
            <div>Keluar: ${totalKeluar} pcs</div>
            <div>Pending: ${totalPending} pcs</div>
            <div>Total Jual: ${escapeHtml(formatRupiah(totalJual))}</div>
            <div>Total Produksi: ${escapeHtml(formatRupiah(totalProduksi))}</div>
            <div>Laba Kotor: ${escapeHtml(formatRupiah(totalJual - totalProduksi))}</div>
          </div>
        </body>
      </html>
    `;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

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

  let items = $derived(riwayat ? listItems(riwayat) : []);
  let pendingItems = $derived(items.filter((item) => item.status === "pending"));
  let detailKeluarAktif = $derived(
    items
      .filter((item) => item.status !== "pending")
      .flatMap((item) => item.detail_keluar),
  );
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
          ...rekapTahap(detailKeluarAktif, t.key),
        }))
      : [],
  );

  async function resolvePendingItem(itemIndex: number) {
    if (!onResolvePending) return;
    resolvingIndex = itemIndex;
    resolveError = null;
    try {
      await onResolvePending(itemIndex);
    } catch (e: any) {
      resolveError = e?.message ?? "Gagal memproses pending.";
    } finally {
      resolvingIndex = null;
    }
  }

  async function cancelItem(itemIndex: number, item: BarangKeluarItem) {
    if (!onCancelItem) return;
    const confirmed = window.confirm(
      item.status === "pending"
        ? "Batalkan item pending ini?"
        : "Batalkan item ini? Stok akan dikembalikan.",
    );
    if (!confirmed) return;
    cancellingIndex = itemIndex;
    resolveError = null;
    try {
      await onCancelItem(itemIndex);
    } catch (e: any) {
      resolveError = e?.message ?? "Gagal membatalkan item.";
    } finally {
      cancellingIndex = null;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Detail List Barang Keluar</Dialog.Title>
      <Dialog.Description>
        {#if riwayat}
          Rekap list barang keluar: {riwayat.total_pcs}
          pcs keluar{(riwayat.total_pending_pcs ?? 0) > 0 ? `, ${riwayat.total_pending_pcs} pcs pending` : ""}
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if riwayat}
      <div class="max-h-[60vh] space-y-4 overflow-y-auto">
        <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
          <p class="text-sm font-medium text-gray-800">{riwayat.tujuan}</p>
          {#if riwayat.nama_reseller}
            <p class="mt-0.5 text-xs text-gray-500">
              Reseller: {riwayat.nama_reseller}
            </p>
          {/if}
          {#if riwayat.keterangan}
            <p class="mt-0.5 text-xs text-gray-400">{riwayat.keterangan}</p>
          {/if}
        </div>

        <div>
          <p
            class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400"
          >
            Barang
          </p>
          {#if pendingItems.length > 0}
            <div class="mb-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
              <p class="text-xs text-amber-700">
                Item pending bisa diproses saat stok sudah tersedia. Jika stok baru tersedia sebagian, sistem akan mengirim yang tersedia dan menyisakan sisanya tetap pending.
              </p>
              {#if resolveError}
                <p class="mt-1 text-xs font-medium text-red-600">{resolveError}</p>
              {/if}
            </div>
          {/if}
          <div class="space-y-2">
            {#each items as item, itemIndex}
              <div class="rounded-lg bg-gray-50 px-3 py-2">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-gray-800">
                      {item.nama_model}{item.nama_warna ? ` - ${item.nama_warna}` : ""}
                    </p>
                    <p class="mt-0.5 text-xs text-gray-500">
                      {itemSummary(item)}
                    </p>
                  </div>
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-medium {item.status === 'pending'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-green-100 text-green-700'}"
                  >
                    {item.status === "pending" ? "Pending" : "Keluar"}
                  </span>
                </div>
                {#if item.alasan_pending}
                  <p class="mt-1 text-xs text-amber-600">
                    {item.alasan_pending}
                  </p>
                {/if}
                {#if (item.status === "pending" && onResolvePending) || onCancelItem}
                  <div class="mt-2 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onclick={() => cancelItem(itemIndex, item)}
                      disabled={resolvingIndex !== null || cancellingIndex !== null}
                      class="h-8"
                    >
                      {cancellingIndex === itemIndex ? "Membatalkan..." : "Batal Item"}
                    </Button>
                    {#if item.status === "pending" && onResolvePending}
                      <Button
                        size="sm"
                        onclick={() => resolvePendingItem(itemIndex)}
                        disabled={resolvingIndex !== null || cancellingIndex !== null}
                        class="h-8"
                      >
                        {resolvingIndex === itemIndex ? "Memproses..." : "Proses Pending"}
                      </Button>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>

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

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={printList} disabled={!riwayat}>
        Print List
      </Button>
      <Button variant="outline" onclick={() => (open = false)}>Tutup</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
