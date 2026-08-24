<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { batchCache } from "$lib/stores/data-cache.svelte";
  import { STATUS_LABEL, type BatchProduksi, type KainDigunakan } from "$lib/types";
  import { Button } from "$lib/components/ui/button";
  import * as Table from "$lib/components/ui/table";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";

  let batchList = $state<BatchProduksi[]>([]);
  let loading = $state(true);
  let exporting = $state(false);
  let searchQuery = $state("");

  const CUTTING_STATUSES = new Set(["PENDING_CUTTING", "CUTTING_IN_PROGRESS", "CUTTING_DONE"]);

  type RekapGroup = {
    nama: string;
    rows: BatchProduksi[];
    totalPcs: number;
    totalKain: string;
  };

  function formatDate(ts: any): string {
    if (!ts) return "-";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatNumber(value: number): string {
    return Number.isInteger(value)
      ? value.toLocaleString("id-ID")
      : value.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  }

  function jenisKainText(items: KainDigunakan[]): string {
    if (!items?.length) return "-";
    return items
      .map((kain) => kain.nama_kain)
      .join(", ");
  }

  function totalKainText(items: KainDigunakan[]): string {
    if (!items?.length) return "-";
    return items
      .map((kain) => `${formatNumber(kain.jumlah_dipakai)} ${kain.satuan}`)
      .join(", ");
  }

  function ukuranText(batch: BatchProduksi): string {
    return (batch.detail_ukuran ?? [])
      .filter((item) => item.jumlah_pcs > 0)
      .map((item) => `${item.ukuran}: ${item.jumlah_pcs}`)
      .join(", ");
  }

  function estimasiYardPerPcs(batch: BatchProduksi): string {
    const totalYard = (batch.kain_digunakan ?? [])
      .filter((kain) => kain.satuan === "yard")
      .reduce((sum, kain) => sum + (kain.jumlah_dipakai ?? 0), 0);
    const totalPcs = batch.total_pcs || batch.pcs_saat_ini || 0;
    if (totalYard <= 0 || totalPcs <= 0) return "-";
    return `${formatNumber(totalYard / totalPcs)} yd/pcs`;
  }

  function totalKainGroupText(rows: BatchProduksi[]): string {
    const totals = new Map<string, { jumlah: number; satuan: string }>();
    for (const batch of rows) {
      for (const kain of batch.kain_digunakan ?? []) {
        const key = `${kain.nama_kain}__${kain.satuan}`;
        const current = totals.get(key) ?? { jumlah: 0, satuan: kain.satuan };
        current.jumlah += kain.jumlah_dipakai ?? 0;
        totals.set(key, current);
      }
    }
    return Array.from(totals.entries())
      .map(([key, value]) => `${key.split("__")[0]} ${formatNumber(value.jumlah)} ${value.satuan}`)
      .join(", ") || "-";
  }

  let rekapRows = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    return batchList
      .filter((batch) => CUTTING_STATUSES.has(batch.status))
      .filter((batch) => !batch.dari_potongan)
      .filter((batch) => {
        if (!q) return true;
        return [
          batch.nama_model,
          batch.nama_warna,
          batch.penugasan?.cutting?.nama,
          jenisKainText(batch.kain_digunakan),
          totalKainText(batch.kain_digunakan),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() ?? 0;
        const bTime = b.createdAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
  });

  let rekapGroups = $derived.by<RekapGroup[]>(() => {
    const groups = new Map<string, BatchProduksi[]>();
    for (const batch of rekapRows) {
      const nama = batch.penugasan?.cutting?.nama || "Belum ditugaskan";
      groups.set(nama, [...(groups.get(nama) ?? []), batch]);
    }
    return Array.from(groups.entries())
      .map(([nama, rows]) => ({
        nama,
        rows,
        totalPcs: rows.reduce((sum, batch) => sum + (batch.total_pcs ?? 0), 0),
        totalKain: totalKainGroupText(rows),
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama));
  });

  async function load(force = false) {
    loading = true;
    try {
      batchList = await batchCache.get(force);
    } finally {
      loading = false;
    }
  }

  async function exportPdf() {
    if (rekapRows.length === 0) return;
    exporting = true;
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const tanggal = new Date().toLocaleDateString("id-ID");

      doc.setFontSize(16);
      doc.text("Rekap Penugasan Cutting", 14, 16);
      doc.setFontSize(9);
      doc.text(`Dicetak: ${tanggal}`, 14, 22);

      let startY = 28;
      for (const group of rekapGroups) {
        if (startY > 178) {
          doc.addPage();
          startY = 16;
        }
        doc.setFontSize(11);
        doc.text(`${group.nama} - ${group.totalPcs} pcs`, 14, startY);
        doc.setFontSize(8);
        doc.text(`Total kain: ${group.totalKain}`, 14, startY + 5);

        autoTable(doc, {
          startY: startY + 9,
          head: [["Tanggal", "Model", "Warna", "Jenis Kain", "Total Kain", "Estimasi", "Ukuran", "Status"]],
          body: group.rows.map((batch) => [
            formatDate(batch.createdAt),
            batch.nama_model,
            batch.nama_warna ?? "-",
            jenisKainText(batch.kain_digunakan),
            totalKainText(batch.kain_digunakan),
            `${batch.total_pcs} pcs`,
            ukuranText(batch),
            STATUS_LABEL[batch.status] ?? batch.status,
          ]),
          styles: { fontSize: 8.5, cellPadding: 2, overflow: "linebreak" },
          headStyles: { fillColor: [17, 24, 39] },
          columnStyles: {
            0: { cellWidth: 28 },
            3: { cellWidth: 38 },
            4: { cellWidth: 30 },
            6: { cellWidth: 40 },
          },
        });
        startY = (doc as any).lastAutoTable.finalY + 12;
      }

      doc.save(`rekap-penugasan-cutting-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      exporting = false;
    }
  }

  onMount(() => load());
</script>

<div class="space-y-5">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <button
        type="button"
        class="mb-3 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
        onclick={() => goto("/produksi/cutting")}
      >
        <ArrowLeftIcon class="h-4 w-4" />
        Kembali ke Produksi Cutting
      </button>
      <h1 class="text-xl font-semibold text-gray-900">Rekap Penugasan Cutting</h1>
      <p class="mt-0.5 text-sm text-gray-500">
        Daftar batch cutting pertama kali ditugaskan, kain yang dibagi, dan estimasi hasil potong.
      </p>
    </div>
    <div class="flex gap-2">
      <Button variant="outline" onclick={() => load(true)} disabled={loading}>
        <RefreshCwIcon class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
        Refresh
      </Button>
      <Button onclick={exportPdf} disabled={exporting || rekapRows.length === 0}>
        <DownloadIcon class="h-4 w-4" />
        {exporting ? "Membuat PDF..." : "Export PDF"}
      </Button>
    </div>
  </div>

  <input
    type="text"
    bind:value={searchQuery}
    placeholder="Cari model, warna, petugas, atau kain..."
    class="w-full max-w-md rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
  />

  {#if loading}
    <div class="rounded-xl border border-gray-100 bg-white py-10 text-center text-sm text-gray-400 shadow-sm">Memuat rekap...</div>
  {:else if rekapRows.length === 0}
    <div class="rounded-xl border border-gray-100 bg-white py-10 text-center text-sm text-gray-400 shadow-sm">Belum ada penugasan cutting.</div>
  {:else}
    {#each rekapGroups as group}
      <section class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
          <div>
            <h2 class="font-semibold text-gray-900">{group.nama}</h2>
            <p class="text-xs text-gray-500">{group.rows.length} batch · {group.totalPcs} pcs</p>
          </div>
          <p class="max-w-xl text-right text-xs text-gray-500">Total kain: {group.totalKain}</p>
        </div>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Tanggal</Table.Head>
              <Table.Head>Model</Table.Head>
              <Table.Head>Warna</Table.Head>
              <Table.Head>Jenis Kain</Table.Head>
              <Table.Head>Total Kain Dipakai</Table.Head>
              <Table.Head class="text-center">Estimasi</Table.Head>
              <Table.Head>Yard/Pcs</Table.Head>
              <Table.Head>Ukuran</Table.Head>
              <Table.Head>Status</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each group.rows as batch}
              <Table.Row>
                <Table.Cell class="text-xs text-gray-500">{formatDate(batch.createdAt)}</Table.Cell>
                <Table.Cell>{batch.nama_model}</Table.Cell>
                <Table.Cell>{batch.nama_warna ?? "-"}</Table.Cell>
                <Table.Cell class="text-sm text-gray-600">{jenisKainText(batch.kain_digunakan)}</Table.Cell>
                <Table.Cell class="text-sm text-gray-600">{totalKainText(batch.kain_digunakan)}</Table.Cell>
                <Table.Cell class="text-center font-semibold">{batch.total_pcs} pcs</Table.Cell>
                <Table.Cell>{estimasiYardPerPcs(batch)}</Table.Cell>
                <Table.Cell class="text-sm text-gray-600">{ukuranText(batch)}</Table.Cell>
                <Table.Cell>{STATUS_LABEL[batch.status] ?? batch.status}</Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </section>
    {/each}
  {/if}
</div>
