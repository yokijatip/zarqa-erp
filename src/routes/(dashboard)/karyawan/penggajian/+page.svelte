<script lang="ts">
  import { getPenggajianPeriode } from "$lib/firebase/penggajian";
  import { isKaryawanManager } from "$lib/stores/auth.store";
  import { type DateRange, getPeriodRange } from "$lib/period";
  import type { PenggajianKaryawan, DivisiProduksi } from "$lib/types";
  import PeriodSelector from "$lib/components/period-selector.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Table from "$lib/components/ui/table";
  import { Button } from "$lib/components/ui/button";
  import StatCard from "$lib/components/StatCard.svelte";
  import BanknoteIcon from "@lucide/svelte/icons/banknote";
  import ScissorsIcon from "@lucide/svelte/icons/scissors";
  import ShirtIcon from "@lucide/svelte/icons/shirt";
  import FlameIcon from "@lucide/svelte/icons/flame";
  import PackageIcon from "@lucide/svelte/icons/package";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import AlertTriangleIcon from "@lucide/svelte/icons/triangle-alert";

  // ── State ──────────────────────────────────────────────────────────
  let dateRange = $state<DateRange>(getPeriodRange("minggu_ini"));
  let data = $state<PenggajianKaryawan[]>([]);
  let loading = $state(true);
  let errorMsg = $state<string | null>(null);
  let exportingPdf = $state(false);

  let detailOpen = $state(false);
  let detailTarget = $state<PenggajianKaryawan | null>(null);

  const DIVISI_CONFIG: Record<DivisiProduksi, { label: string; icon: typeof ScissorsIcon; color: string }> = {
    Cutting: { label: "Cutting", icon: ScissorsIcon, color: "blue" },
    Jahit: { label: "Jahit", icon: ShirtIcon, color: "purple" },
    Steam: { label: "Steam", icon: FlameIcon, color: "orange" },
  };
  const DIVISI_ORDER: DivisiProduksi[] = ["Cutting", "Jahit", "Steam"];

  // ── Derived ────────────────────────────────────────────────────────
  let byDivisi = $derived.by(() => {
    const result: Record<DivisiProduksi, PenggajianKaryawan[]> = { Cutting: [], Jahit: [], Steam: [] };
    for (const d of data) result[d.divisi].push(d);
    return result;
  });

  let totalGajiSemua = $derived(data.reduce((s, d) => s + d.total_gaji, 0));
  let totalPcsSemua = $derived(data.reduce((s, d) => s + d.total_pcs, 0));
  let totalKaryawanDibayar = $derived(new Set(data.map((d) => d.uid)).size);
  let karyawanTanpaTarif = $derived(data.filter((d) => d.tarif_per_pcs <= 0 && d.total_pcs > 0));

  let periodeLabel = $derived.by(() => {
    if (!dateRange) return "Semua Data";
    const fmt = (d: Date) => d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
    return `${fmt(dateRange.start)} — ${fmt(dateRange.end)}`;
  });

  // ── Helpers ────────────────────────────────────────────────────────
  function rupiah(n: number): string {
    return `Rp${Math.round(n).toLocaleString("id-ID")}`;
  }

  function bukaDetail(k: PenggajianKaryawan) {
    detailTarget = k;
    detailOpen = true;
  }

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      data = await getPenggajianPeriode(dateRange);
    } catch (e) {
      console.error(e);
      errorMsg = "Gagal memuat data penggajian.";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    // Reload setiap kali periode berubah (juga jalan sekali saat mount)
    dateRange;
    load();
  });

  // ── Export PDF ─────────────────────────────────────────────────────
  async function exportPdf() {
    exportingPdf = true;
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const marginX = 14;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(20, 20, 20);
      doc.text("Zarqa — Laporan Penggajian Produksi", marginX, 18);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 90);
      doc.text("Moeslim Fashion", marginX, 24);
      doc.text(`Periode: ${periodeLabel}`, marginX, 30);
      doc.text(
        `Dicetak: ${new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`,
        pageWidth - marginX,
        30,
        { align: "right" },
      );
      doc.setDrawColor(230, 230, 230);
      doc.line(marginX, 34, pageWidth - marginX, 34);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.text(`Total Pcs: ${totalPcsSemua}`, marginX, 41);
      doc.text(`Total Gaji: ${rupiah(totalGajiSemua)}`, marginX + 60, 41);
      doc.text(`Karyawan Dibayar: ${totalKaryawanDibayar}`, marginX + 130, 41);

      let cursorY = 47;

      for (const divisi of ["Cutting", "Jahit", "Steam"] as DivisiProduksi[]) {
        const list = byDivisi[divisi];
        if (list.length === 0) continue;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(20, 20, 20);
        doc.text(`Divisi ${divisi}`, marginX, cursorY);

        const totalDivisi = list.reduce((s, k) => s + k.total_gaji, 0);
        const body = list.map((k) => [
          k.nama,
          String(k.total_pcs),
          rupiah(k.tarif_per_pcs),
          rupiah(k.total_gaji),
        ]);

        autoTable(doc, {
          startY: cursorY + 4,
          head: [["Nama Karyawan", "Total Pcs", "Tarif/Pcs", "Total Gaji"]],
          body,
          foot: [["Total", String(list.reduce((s, k) => s + k.total_pcs, 0)), "", rupiah(totalDivisi)]],
          theme: "grid",
          margin: { left: marginX, right: marginX },
          styles: { font: "helvetica", fontSize: 9, cellPadding: 3, lineColor: [230, 230, 230], lineWidth: 0.1 },
          headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: "bold", halign: "left" },
          footStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: "bold" },
          columnStyles: { 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" } },
          alternateRowStyles: { fillColor: [250, 250, 250] },
        });

        cursorY = ((doc as any).lastAutoTable?.finalY ?? cursorY) + 10;

        // ── Detail breakdown per karyawan (model/warna/ukuran + sumber) ──
        for (const k of list) {
          if (k.breakdown.length === 0) continue;
          if (cursorY > 260) {
            doc.addPage();
            cursorY = 18;
          }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(40, 40, 40);
          doc.text(`${k.nama} — rincian per model/warna/ukuran`, marginX, cursorY);

          const detailBody = k.breakdown.map((b) => {
            const sumberCutting = (b.sumber_cutting ?? [])
              .map((s) => `${s.nama_pekerja ?? "?"} (${s.jumlah_pcs})`)
              .join(", ");
            const sumberJahit = (b.sumber_jahit ?? [])
              .map((s) => `${s.nama_pekerja ?? "?"} (${s.jumlah_pcs})`)
              .join(", ");
            const sumberParts = [
              sumberJahit ? `Jahit: ${sumberJahit}` : "",
              sumberCutting ? `Cutting: ${sumberCutting}` : "",
            ].filter(Boolean);
            return [
              b.nama_model,
              b.nama_warna ?? "—",
              b.ukuran,
              String(b.jumlah_pcs),
              sumberParts.join(" | ") || "—",
            ];
          });

          autoTable(doc, {
            startY: cursorY + 3,
            head: [["Model", "Warna", "Ukuran", "Pcs", "Sumber"]],
            body: detailBody,
            theme: "grid",
            margin: { left: marginX, right: marginX },
            styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2, lineColor: [235, 235, 235], lineWidth: 0.1 },
            headStyles: { fillColor: [55, 65, 81], textColor: [255, 255, 255], fontStyle: "bold", halign: "left" },
            columnStyles: { 3: { halign: "center" } },
            alternateRowStyles: { fillColor: [250, 250, 250] },
          });

          cursorY = ((doc as any).lastAutoTable?.finalY ?? cursorY) + 8;
        }
      }

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const h = doc.internal.pageSize.getHeight();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Halaman ${i} dari ${pageCount} — Zarqa ERP`, pageWidth / 2, h - 8, { align: "center" });
      }

      const tanggal = new Date().toISOString().slice(0, 10);
      doc.save(`laporan-penggajian-${tanggal}.pdf`);
    } catch (e) {
      console.error("Gagal membuat PDF penggajian:", e);
      errorMsg = "Gagal membuat PDF laporan.";
    } finally {
      exportingPdf = false;
    }
  }
</script>

{#if !$isKaryawanManager}
  <div class="flex flex-col items-center justify-center gap-3 py-24 text-center">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
      <svg class="h-7 w-7 text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    </div>
    <p class="font-semibold text-gray-700">Akses Ditolak</p>
    <p class="text-sm text-gray-400">Halaman ini hanya dapat diakses oleh Owner, HR, atau Developer.</p>
  </div>
{:else}

<!-- ── Header ─────────────────────────────────────────────────────── -->
<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Penggajian Produksi</h1>
    <p class="mt-0.5 text-sm text-gray-500">
      Gaji dihitung dari jumlah pcs baju yang selesai per divisi (Cutting, Jahit, Steam) — periode: {periodeLabel}
    </p>
  </div>
  <div class="flex items-center gap-2">
    <PeriodSelector bind:dateRange defaultPeriod="minggu_ini" />
    <Button variant="outline" onclick={() => load()}>
      <svg class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
      Refresh
    </Button>
    <Button onclick={exportPdf} disabled={exportingPdf || data.length === 0}>
      <DownloadIcon class="h-4 w-4" />
      {exportingPdf ? "Membuat PDF..." : "Cetak Laporan"}
    </Button>
  </div>
</div>

{#if errorMsg}
  <div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>
{/if}

<!-- ── Stats ──────────────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
  <StatCard title="Total Gaji" value={rupiah(totalGajiSemua)} icon={BanknoteIcon} {loading} footerSubtext="periode berjalan" class="border-green-100 bg-green-50" valueClass="text-green-700" />
  <StatCard title="Total Pcs" value={totalPcsSemua} icon={PackageIcon} {loading} footerSubtext="pcs berhasil diselesaikan" />
  <StatCard title="Karyawan Dibayar" value={totalKaryawanDibayar} icon={BanknoteIcon} {loading} footerSubtext="karyawan produksi aktif" />
  <StatCard
    title="Belum Ada Tarif"
    value={karyawanTanpaTarif.length}
    icon={AlertTriangleIcon}
    {loading}
    footerSubtext={karyawanTanpaTarif.length > 0 ? "atur tarif per pcs dulu" : "semua sudah punya tarif"}
    class={karyawanTanpaTarif.length > 0 ? "border-red-100 bg-red-50" : ""}
    valueClass={karyawanTanpaTarif.length > 0 ? "text-red-600" : ""}
  />
</div>

{#if !loading && karyawanTanpaTarif.length > 0}
  <div class="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
    <AlertTriangleIcon class="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
    <div class="flex-1">
      <p class="text-sm font-semibold text-amber-800">
        {karyawanTanpaTarif.length} karyawan belum punya tarif per pcs
      </p>
      <p class="mt-0.5 text-xs text-amber-700">
        {karyawanTanpaTarif.map((k) => k.nama).join(", ")} — gajinya masih Rp0. Atur tarif per pcs di halaman Data Karyawan.
      </p>
    </div>
    <a href="/karyawan/data" class="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700">
      Atur Tarif →
    </a>
  </div>
{/if}

<!-- ── Tabel per Divisi ───────────────────────────────────────────── -->
{#each DIVISI_ORDER as divisi}
  {@const list = byDivisi[divisi]}
  {@const cfg = DIVISI_CONFIG[divisi]}
  {@const DivisiIcon = cfg.icon}
  <div class="mb-5 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
    <div class="flex items-center justify-between border-b border-gray-50 px-5 py-4">
      <div class="flex items-center gap-2">
        <DivisiIcon class="h-4 w-4 text-gray-400" />
        <h2 class="text-sm font-semibold text-gray-800">Divisi {cfg.label}</h2>
        <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">{list.length} karyawan</span>
      </div>
      <span class="text-sm font-semibold text-gray-700">
        {rupiah(list.reduce((s, k) => s + k.total_gaji, 0))}
      </span>
    </div>

    {#if loading}
      <div class="space-y-3 p-5">
        {#each Array(2) as _}
          <div class="h-4 w-full animate-pulse rounded bg-gray-100"></div>
        {/each}
      </div>
    {:else if list.length === 0}
      <div class="px-5 py-8 text-center text-sm text-gray-400">
        Belum ada pcs {cfg.label.toLowerCase()} yang selesai pada periode ini.
      </div>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row class="bg-gray-50 hover:bg-gray-50">
            <Table.Head>Nama Karyawan</Table.Head>
            <Table.Head class="text-center">Jumlah Batch</Table.Head>
            <Table.Head class="text-center">Total Pcs</Table.Head>
            <Table.Head class="text-right">Tarif/Pcs</Table.Head>
            <Table.Head class="text-right">Total Gaji</Table.Head>
            <Table.Head></Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each list as k}
            <Table.Row>
              <Table.Cell class="font-medium text-gray-800">{k.nama}</Table.Cell>
              <Table.Cell class="text-center text-gray-600">{k.jumlah_batch}</Table.Cell>
              <Table.Cell class="text-center font-semibold text-gray-800">{k.total_pcs}</Table.Cell>
              <Table.Cell class="text-right text-gray-600">
                {#if k.tarif_per_pcs > 0}
                  {rupiah(k.tarif_per_pcs)}
                {:else}
                  <span class="text-red-500">Belum diatur</span>
                {/if}
              </Table.Cell>
              <Table.Cell class="text-right font-semibold text-green-700">{rupiah(k.total_gaji)}</Table.Cell>
              <Table.Cell class="text-right">
                <Button variant="outline" size="sm" onclick={() => bukaDetail(k)}>
                  <EyeIcon class="h-3.5 w-3.5" />
                  Detail
                </Button>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {/if}
  </div>
{/each}

{/if}

<!-- ── Dialog Detail Breakdown ────────────────────────────────────── -->
<Dialog.Root bind:open={detailOpen}>
  <Dialog.Content class="max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>
        {detailTarget?.nama} — Divisi {detailTarget?.divisi}
      </Dialog.Title>
      <Dialog.Description>
        {#if detailTarget}
          Rincian {detailTarget.total_pcs} pcs pada periode {periodeLabel}, dipecah per model / warna / ukuran
          {detailTarget.divisi !== "Cutting" ? ", lengkap dengan sumbernya" : ""}.
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if detailTarget}
      <div class="max-h-[65vh] space-y-3 overflow-y-auto">
        {#each detailTarget.breakdown as b}
          <div class="rounded-lg border border-gray-100 p-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-gray-800">{b.nama_model}</p>
                <p class="text-xs text-gray-500">
                  {b.nama_warna ?? "Tanpa warna"} · Ukuran {b.ukuran}
                </p>
              </div>
              <span class="rounded-full bg-blue-50 px-2.5 py-1 text-sm font-semibold text-blue-700">
                {b.jumlah_pcs} pcs
              </span>
            </div>

            {#if b.sumber_jahit && b.sumber_jahit.length > 0}
              <div class="mt-2 border-t border-gray-50 pt-2">
                <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Dari Jahit</p>
                <div class="flex flex-wrap gap-1.5">
                  {#each b.sumber_jahit as s}
                    <span class="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700">
                      {s.nama_pekerja ?? "Tidak diketahui"} — {s.jumlah_pcs} pcs
                    </span>
                  {/each}
                </div>
              </div>
            {/if}

            {#if b.sumber_cutting && b.sumber_cutting.length > 0}
              <div class="mt-2 border-t border-gray-50 pt-2">
                <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Dari Cutting</p>
                <div class="flex flex-wrap gap-1.5">
                  {#each b.sumber_cutting as s}
                    <span class="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                      {s.nama_pekerja ?? "Tidak diketahui"} — {s.nama_model}{s.nama_warna ? ` (${s.nama_warna})` : ""} — {s.jumlah_pcs} pcs
                    </span>
                  {/each}
                </div>
              </div>
            {/if}

            {#if (detailTarget.divisi === "Jahit" && (!b.sumber_cutting || b.sumber_cutting.length === 0)) || (detailTarget.divisi === "Steam" && (!b.sumber_jahit || b.sumber_jahit.length === 0) && (!b.sumber_cutting || b.sumber_cutting.length === 0))}
              <p class="mt-2 border-t border-gray-50 pt-2 text-xs text-gray-400">
                Data sumber tidak tersedia (kemungkinan data lama sebelum fitur penelusuran ini aktif).
              </p>
            {/if}
          </div>
        {/each}
      </div>

      <div class="flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
        <span class="text-gray-500">Total Gaji</span>
        <span class="font-semibold text-green-700">{rupiah(detailTarget.total_gaji)}</span>
      </div>
    {/if}

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (detailOpen = false)}>Tutup</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
