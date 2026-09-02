<script lang="ts">
  import { getBatchListByDateRange } from "$lib/firebase/batch-produksi";
  import { getRiwayatBarangKeluarByPeriod, getStokBarangJadi } from "$lib/firebase/barang-jadi";
  import { getStokKainList } from "$lib/firebase/stok-kain";
  import { getStokPotonganList } from "$lib/firebase/stok-potongan";
  import { getModelBajuList } from "$lib/firebase/model-baju";
  import { getKaryawanList } from "$lib/firebase/karyawan";
  import { getPembayaranGajiPeriode, type PembayaranGajiRecord } from "$lib/firebase/penggajian";
  import { getTransaksiKeuangan, kategoriLabel } from "$lib/firebase/keuangan";
  import { type DateRange, getPeriodRange } from "$lib/period";
  import type {
    BarangKeluar,
    BarangKeluarItem,
    BatchProduksi,
    ModelBaju,
    StokBarangJadi,
    StokKain,
    StokPotongan,
    TransaksiKeuangan,
    UserProfile,
  } from "$lib/types";
  import PeriodSelector from "$lib/components/period-selector.svelte";
  import StatCard from "$lib/components/StatCard.svelte";
  import * as Table from "$lib/components/ui/table";
  import { Button } from "$lib/components/ui/button";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import WalletIcon from "@lucide/svelte/icons/wallet";
  import FactoryIcon from "@lucide/svelte/icons/factory";
  import BoxesIcon from "@lucide/svelte/icons/boxes";
  import { hargaJualUntukUkuran, hargaProduksiUntukUkuran } from "$lib/sales/penjualan";

  type ReportTab = "ringkasan" | "keuangan" | "produksi" | "barang_keluar" | "stok" | "karyawan";
  type MoneyRow = { label: string; value: number; color: string };

  let dateRange = $state<DateRange>(getPeriodRange("bulan_ini"));
  let activeTab = $state<ReportTab>("ringkasan");
  let loading = $state(true);
  let exporting = $state(false);
  let errorMsg = $state<string | null>(null);

  let batches = $state<BatchProduksi[]>([]);
  let barangKeluar = $state<BarangKeluar[]>([]);
  let stokJadi = $state<StokBarangJadi[]>([]);
  let stokKain = $state<StokKain[]>([]);
  let stokPotongan = $state<StokPotongan[]>([]);
  let models = $state<ModelBaju[]>([]);
  let transaksi = $state<TransaksiKeuangan[]>([]);
  let gaji = $state<PembayaranGajiRecord[]>([]);
  let karyawan = $state<UserProfile[]>([]);

  const tabs: Array<{ id: ReportTab; label: string }> = [
    { id: "ringkasan", label: "Ringkasan" },
    { id: "keuangan", label: "Keuangan" },
    { id: "produksi", label: "Produksi" },
    { id: "barang_keluar", label: "Barang Keluar" },
    { id: "stok", label: "Stok" },
    { id: "karyawan", label: "Karyawan" },
  ];

  function toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function") return value.toDate();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function rupiah(value: number): string {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(Math.round(value || 0));
  }

  function formatDate(value: Date | null): string {
    if (!value) return "-";
    return value.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  }

  function roleLabel(role?: string): string {
    if (!role) return "-";
    return role.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function normalizeItems(keluar: BarangKeluar): BarangKeluarItem[] {
    if (keluar.items?.length) return keluar.items;
    return [{
      model_id: keluar.model_id,
      nama_model: keluar.nama_model,
      nama_warna: keluar.nama_warna,
      kode_hex_warna: keluar.kode_hex_warna,
      detail_keluar: keluar.detail_keluar ?? [],
      total_pcs: keluar.total_pcs,
      status: keluar.status === "pending" ? "pending" : "keluar",
      tujuan: keluar.tujuan,
      nama_reseller: keluar.nama_reseller,
      keterangan: keluar.keterangan,
    }];
  }

  function statusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING_KAIN: "Menunggu Kain",
      PENDING_CUTTING: "Menunggu Cutting",
      CUTTING_IN_PROGRESS: "Proses Cutting",
      CUTTING_DONE: "Selesai Cutting",
      JAHIT_IN_PROGRESS: "Proses Jahit",
      JAHIT_DONE: "Selesai Jahit",
      STEAM_IN_PROGRESS: "Proses Steam",
      STEAM_DONE: "Selesai Steam",
      COMPLETED: "Selesai Produksi",
    };
    return labels[status] ?? status;
  }

  function maxValue(rows: MoneyRow[]): number {
    return Math.max(1, ...rows.map((row) => row.value));
  }

  function pieStyle(rows: MoneyRow[]): string {
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    if (total <= 0) return "background: #eef2f7";
    let current = 0;
    const parts = rows.map((row) => {
      const start = current;
      current += (row.value / total) * 100;
      return `${row.color} ${start}% ${current}%`;
    });
    return `background: conic-gradient(${parts.join(", ")})`;
  }

  const modelMap = $derived(new Map(models.map((m) => [m.id, m])));
  const modelNameMap = $derived(new Map(models.map((m) => [m.nama_model.toLowerCase(), m])));

  const listBarangKeluarRows = $derived.by(() =>
    barangKeluar.map((keluar) => {
      const items = normalizeItems(keluar);
      let pcsKeluar = 0;
      let pcsPending = 0;
      let nilaiJual = 0;
      let hppList = 0;
      const modelsSet = new Set<string>();
      const colorsSet = new Set<string>();

      for (const item of items) {
        modelsSet.add(item.nama_model);
        if (item.nama_warna) colorsSet.add(item.nama_warna);
        if (item.status === "pending") {
          pcsPending += item.total_pcs;
          continue;
        }
        const model = modelMap.get(item.model_id) ?? modelNameMap.get(item.nama_model.toLowerCase());
        pcsKeluar += item.total_pcs;
        nilaiJual += item.detail_keluar.reduce(
          (sum, detail) => sum + detail.jumlah_pcs * (detail.harga_jual && detail.harga_jual > 0 ? detail.harga_jual : hargaJualUntukUkuran(model, detail.ukuran)),
          0,
        );
        hppList += item.detail_keluar.reduce((sum, detail) => sum + detail.jumlah_pcs * hargaProduksiUntukUkuran(model, detail.ukuran), 0);
      }

      return {
        id: keluar.id,
        tanggal: toDate(keluar.tanggal_keluar),
        tujuan: keluar.tujuan || "-",
        reseller: keluar.nama_reseller ?? "-",
        itemCount: items.length,
        modelCount: modelsSet.size,
        warnaCount: colorsSet.size,
        pcsKeluar,
        pcsPending,
        nilaiJual,
        hpp: hppList,
        labaKotor: nilaiJual - hppList,
      };
    }),
  );

  const penjualan = $derived(listBarangKeluarRows.reduce((sum, row) => sum + row.nilaiJual, 0));
  const hpp = $derived(listBarangKeluarRows.reduce((sum, row) => sum + row.hpp, 0));
  const totalKeluarPcs = $derived(listBarangKeluarRows.reduce((sum, row) => sum + row.pcsKeluar, 0));
  const totalPendingPcs = $derived(listBarangKeluarRows.reduce((sum, row) => sum + row.pcsPending, 0));
  const pemasukanManual = $derived(transaksi.filter((t) => t.tipe === "pemasukan").reduce((s, t) => s + t.nominal, 0));
  const pengeluaranManual = $derived(transaksi.filter((t) => t.tipe === "pengeluaran").reduce((s, t) => s + t.nominal, 0));
  const gajiTerbayar = $derived(gaji.reduce((s, item) => s + item.total_gaji, 0));
  const labaKotor = $derived(penjualan - hpp);
  const labaBersih = $derived(labaKotor + pemasukanManual - pengeluaranManual - gajiTerbayar);
  const kasMasuk = $derived(penjualan + pemasukanManual);
  const kasKeluar = $derived(pengeluaranManual + gajiTerbayar);
  const kasBersih = $derived(kasMasuk - kasKeluar);
  const stokJadiPcs = $derived(stokJadi.reduce((s, item) => s + item.stok_tersedia, 0));
  const stokPotonganPcs = $derived(stokPotongan.reduce((s, item) => s + item.stok_tersedia, 0));
  const stokKainTotal = $derived(stokKain.reduce((s, item) => s + item.stok_tersedia, 0));
  const nilaiGudang = $derived(stokJadi.reduce((s, item) => s + item.stok_tersedia * hargaProduksiUntukUkuran(modelMap.get(item.model_id), item.ukuran), 0));

  const incomeRows = $derived.by<MoneyRow[]>(() => {
    const map = new Map<string, number>();
    map.set("Penjualan barang keluar", penjualan);
    for (const item of transaksi.filter((t) => t.tipe === "pemasukan")) {
      const label = kategoriLabel(item.tipe, item.kategori);
      map.set(label, (map.get(label) ?? 0) + item.nominal);
    }
    return [...map.entries()].map(([label, value], index) => ({
      label,
      value,
      color: ["#16a34a", "#2563eb", "#0d9488", "#7c3aed"][index % 4],
    })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
  });

  const expenseRows = $derived.by<MoneyRow[]>(() => {
    const map = new Map<string, number>();
    map.set("HPP produksi barang keluar", hpp);
    map.set("Gaji terbayar", gajiTerbayar);
    for (const item of transaksi.filter((t) => t.tipe === "pengeluaran")) {
      const label = kategoriLabel(item.tipe, item.kategori);
      map.set(label, (map.get(label) ?? 0) + item.nominal);
    }
    return [...map.entries()].map(([label, value], index) => ({
      label,
      value,
      color: ["#dc2626", "#ea580c", "#ca8a04", "#9333ea", "#475569"][index % 5],
    })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
  });

  const transaksiByKategori = $derived.by(() => {
    const map = new Map<string, { kategori: string; masuk: number; keluar: number }>();
    for (const item of transaksi) {
      const label = kategoriLabel(item.tipe, item.kategori);
      const row = map.get(label) ?? { kategori: label, masuk: 0, keluar: 0 };
      if (item.tipe === "pemasukan") row.masuk += item.nominal;
      else row.keluar += item.nominal;
      map.set(label, row);
    }
    return [...map.values()].sort((a, b) => b.masuk + b.keluar - (a.masuk + a.keluar));
  });

  const produksiByStatus = $derived.by(() => {
    const map = new Map<string, { status: string; batch: number; pcs: number }>();
    for (const batch of batches) {
      const row = map.get(batch.status) ?? { status: statusLabel(batch.status), batch: 0, pcs: 0 };
      row.batch += 1;
      row.pcs += batch.total_pcs ?? 0;
      map.set(batch.status, row);
    }
    return [...map.values()].sort((a, b) => b.batch - a.batch);
  });

  const produksiRows = $derived(batches.map((batch) => ({
    tanggal: toDate(batch.createdAt),
    model: batch.nama_model,
    warna: batch.nama_warna ?? "-",
    ukuran: batch.detail_ukuran.map((u) => `${u.ukuran} ${u.jumlah_pcs}`).join(", ") || "-",
    pcs: batch.total_pcs ?? 0,
    status: statusLabel(batch.status),
    cutting: batch.penugasan?.cutting?.nama ?? "-",
    jahit: batch.penugasan?.jahit?.nama ?? "-",
    steam: batch.penugasan?.steam?.nama ?? "-",
    kain: batch.kain_digunakan.map((k) => `${k.nama_kain} ${k.jumlah_dipakai} ${k.satuan}`).join(", ") || "-",
  })));

  const keluarByTujuan = $derived.by(() => {
    const map = new Map<string, { tujuan: string; list: number; pcs: number; pending: number; nilai: number }>();
    for (const row of listBarangKeluarRows) {
      const item = map.get(row.tujuan) ?? { tujuan: row.tujuan, list: 0, pcs: 0, pending: 0, nilai: 0 };
      item.list += 1;
      item.pcs += row.pcsKeluar;
      item.pending += row.pcsPending;
      item.nilai += row.nilaiJual;
      map.set(row.tujuan, item);
    }
    return [...map.values()].sort((a, b) => b.pcs - a.pcs);
  });

  const stokJadiByModel = $derived.by(() => {
    const map = new Map<string, { model: string; pcs: number; nilaiProduksi: number; nilaiJual: number }>();
    for (const item of stokJadi) {
      const model = modelMap.get(item.model_id) ?? modelNameMap.get(item.nama_model.toLowerCase());
      const row = map.get(item.model_id) ?? { model: item.nama_model, pcs: 0, nilaiProduksi: 0, nilaiJual: 0 };
      row.pcs += item.stok_tersedia;
      row.nilaiProduksi += item.stok_tersedia * hargaProduksiUntukUkuran(model, item.ukuran);
      row.nilaiJual += item.stok_tersedia * hargaJualUntukUkuran(model, item.ukuran);
      map.set(item.model_id, row);
    }
    return [...map.values()].sort((a, b) => b.pcs - a.pcs);
  });

  const stokKainByJenis = $derived.by(() => {
    const map = new Map<string, { nama: string; total: number; warna: number; nilai: number }>();
    for (const item of stokKain) {
      const row = map.get(item.nama_kain) ?? { nama: item.nama_kain, total: 0, warna: 0, nilai: 0 };
      row.total += item.stok_tersedia;
      row.warna += 1;
      row.nilai += item.stok_tersedia * (item.harga_per_unit ?? 0);
      map.set(item.nama_kain, row);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  });

  const karyawanRows = $derived(karyawan.map((item) => ({
    nama: item.name,
    email: item.email,
    kode: item.kode_karyawan ?? "-",
    role: roleLabel(item.role),
    divisi: item.divisi ?? "-",
    status: item.status_kerja ?? "aktif",
    tipeGaji: item.tipe_penggajian ?? "-",
    gajiPokok: item.gaji_pokok ?? 0,
    tarif: item.tarif_per_pcs ?? 0,
  })).sort((a, b) => a.nama.localeCompare(b.nama)));

  const gajiRows = $derived(gaji.map((item) => ({
    nama: item.karyawan_nama,
    divisi: item.divisi,
    periode: `${formatDate(new Date(item.periode_start))} - ${formatDate(new Date(item.periode_end))}`,
    pcs: item.total_pcs,
    nominal: item.total_gaji,
    detail: item.detail_per_model.map((d) => `${d.nama_model}: ${d.total_pcs} pcs`).join(", "),
  })));

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      const from = dateRange?.start ?? new Date(0);
      const to = dateRange?.end ?? new Date();
      [batches, barangKeluar, stokJadi, stokKain, stokPotongan, models, transaksi, gaji, karyawan] = await Promise.all([
        getBatchListByDateRange(from, to),
        getRiwayatBarangKeluarByPeriod(dateRange),
        getStokBarangJadi(),
        getStokKainList(),
        getStokPotonganList(),
        getModelBajuList(false),
        getTransaksiKeuangan(dateRange),
        getPembayaranGajiPeriode(dateRange),
        getKaryawanList(),
      ]);
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : "Gagal memuat laporan.";
    } finally {
      loading = false;
    }
  }

  async function exportPdf() {
    exporting = true;
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageHeight = doc.internal.pageSize.getHeight();
      let nextY = 30;

      function appendTable(title: string, head: string[], body: Array<Array<string | number>>) {
        if (nextY > pageHeight - 45) {
          doc.addPage();
          nextY = 18;
        }
        doc.setFontSize(11);
        doc.text(title, 14, nextY);
        autoTable(doc, {
          startY: nextY + 4,
          head: [head],
          body: body.length ? body : [[`Tidak ada data ${title.toLowerCase()}.`, ...Array(Math.max(0, head.length - 1)).fill("")]],
          theme: "grid",
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: [17, 24, 39] },
          margin: { left: 14, right: 14 },
        });
        nextY = ((doc as any).lastAutoTable?.finalY ?? nextY) + 8;
      }

      doc.setFontSize(16);
      doc.text("Zarqa - Laporan Operasional", 14, 16);
      doc.setFontSize(10);
      doc.text(`Periode: ${formatDate(dateRange?.start ?? null)} - ${formatDate(dateRange?.end ?? null)}`, 14, 23);

      appendTable(
        "Ringkasan Tutup Buku",
        ["Komponen", "Nilai"],
        [
          ["Penjualan", rupiah(penjualan)],
          ["HPP produksi", rupiah(hpp)],
          ["Laba kotor", rupiah(labaKotor)],
          ["Pemasukan manual", rupiah(pemasukanManual)],
          ["Pengeluaran manual", rupiah(pengeluaranManual)],
          ["Gaji terbayar", rupiah(gajiTerbayar)],
          ["Laba bersih estimasi", rupiah(labaBersih)],
          ["Kas masuk", rupiah(kasMasuk)],
          ["Kas keluar", rupiah(kasKeluar)],
          ["Kas bersih", rupiah(kasBersih)],
          ["Nilai gudang barang jadi", rupiah(nilaiGudang)],
        ],
      );

      appendTable(
        "Barang Keluar per List",
        ["Tanggal", "Tujuan", "Reseller", "Item", "Model", "Keluar", "Pending", "Penjualan", "HPP", "Laba"],
        listBarangKeluarRows.map((row) => [
          formatDate(row.tanggal),
          row.tujuan,
          row.reseller,
          row.itemCount,
          row.modelCount,
          row.pcsKeluar,
          row.pcsPending,
          rupiah(row.nilaiJual),
          rupiah(row.hpp),
          rupiah(row.labaKotor),
        ]),
      );

      appendTable(
        "Kategori Keuangan",
        ["Kategori", "Masuk", "Keluar"],
        transaksiByKategori.map((row) => [row.kategori, rupiah(row.masuk), rupiah(row.keluar)]),
      );

      appendTable(
        "Produksi",
        ["Tanggal", "Model", "Ukuran", "PCS", "Status", "Cutting", "Jahit", "Steam", "Kain"],
        produksiRows.map((row) => [
          formatDate(row.tanggal),
          `${row.model} - ${row.warna}`,
          row.ukuran,
          row.pcs,
          row.status,
          row.cutting,
          row.jahit,
          row.steam,
          row.kain,
        ]),
      );

      appendTable(
        "Stok Barang Jadi",
        ["Model", "PCS", "Nilai Produksi", "Estimasi Jual"],
        stokJadiByModel.map((row) => [row.model, `${row.pcs} pcs`, rupiah(row.nilaiProduksi), rupiah(row.nilaiJual)]),
      );

      appendTable(
        "Stok Kain",
        ["Jenis Kain", "Warna", "Total Stok", "Nilai Beli"],
        stokKainByJenis.map((row) => [row.nama, row.warna, row.total.toLocaleString("id-ID"), rupiah(row.nilai)]),
      );

      appendTable(
        "Karyawan",
        ["Nama", "Email", "Role", "Divisi", "Status", "Penggajian", "Nominal"],
        karyawanRows.map((row) => [
          row.nama,
          row.email,
          row.role,
          row.divisi,
          row.status,
          row.tipeGaji,
          row.tarif > 0 ? `${rupiah(row.tarif)} / pcs` : rupiah(row.gajiPokok),
        ]),
      );

      appendTable(
        "Gaji Terbayar",
        ["Nama", "Divisi", "Periode", "PCS", "Total", "Detail"],
        gajiRows.map((row) => [row.nama, row.divisi, row.periode, row.pcs, rupiah(row.nominal), row.detail]),
      );

      doc.save(`laporan-operasional-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      exporting = false;
    }
  }

  $effect(() => {
    load();
  });
</script>

<div class="space-y-5">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-xl font-semibold text-gray-900">Laporan</h1>
      <p class="mt-0.5 text-sm text-gray-500">Laporan operasional lengkap untuk produksi, barang keluar, stok, karyawan, dan tutup buku.</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <PeriodSelector bind:dateRange defaultPeriod="bulan_ini" />
      <Button variant="outline" onclick={load} disabled={loading}>
        <RefreshCwIcon class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
        Refresh
      </Button>
      <Button onclick={exportPdf} disabled={exporting}>
        <DownloadIcon class="h-4 w-4" />
        {exporting ? "Mencetak..." : "Export PDF"}
      </Button>
    </div>
  </div>

  {#if errorMsg}
    <div class="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>
  {/if}

  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
    <StatCard title="Penjualan" value={rupiah(penjualan)} icon={TrendingUpIcon} {loading} footerSubtext={`${listBarangKeluarRows.length} list / ${totalKeluarPcs} pcs`} class="border-green-100 bg-green-50" valueClass="text-green-700" />
    <StatCard title="Laba Bersih" value={rupiah(labaBersih)} icon={WalletIcon} {loading} footerSubtext="estimasi tutup buku" class={labaBersih < 0 ? "border-red-100 bg-red-50" : "border-blue-100 bg-blue-50"} valueClass={labaBersih < 0 ? "text-red-600" : "text-blue-700"} />
    <StatCard title="Produksi" value={batches.length} icon={FactoryIcon} {loading} footerSubtext={`${batches.reduce((s, b) => s + (b.total_pcs ?? 0), 0)} pcs batch`} />
    <StatCard title="Gudang Jadi" value={`${stokJadiPcs} pcs`} icon={BoxesIcon} {loading} footerSubtext={rupiah(nilaiGudang)} class="border-teal-100 bg-teal-50" valueClass="text-teal-700" />
  </div>

  <div class="flex flex-wrap gap-2 rounded-xl border border-gray-100 bg-white p-2 shadow-sm">
    {#each tabs as tab}
      <Button variant={activeTab === tab.id ? "default" : "ghost"} size="sm" onclick={() => (activeTab = tab.id)}>
        {tab.label}
      </Button>
    {/each}
  </div>

  {#if activeTab === "ringkasan"}
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
        <h2 class="text-sm font-semibold text-gray-800">Ikhtisar Tutup Buku</h2>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div class="rounded-lg bg-green-50 p-4"><p class="text-xs text-green-700">Kas Masuk</p><p class="mt-1 text-xl font-bold text-green-800">{rupiah(kasMasuk)}</p></div>
          <div class="rounded-lg bg-red-50 p-4"><p class="text-xs text-red-700">Kas Keluar</p><p class="mt-1 text-xl font-bold text-red-800">{rupiah(kasKeluar)}</p></div>
          <div class="rounded-lg bg-blue-50 p-4"><p class="text-xs text-blue-700">Kas Bersih</p><p class="mt-1 text-xl font-bold text-blue-800">{rupiah(kasBersih)}</p></div>
          <div class="rounded-lg bg-gray-50 p-4"><p class="text-xs text-gray-500">Laba Kotor</p><p class="mt-1 text-xl font-bold text-gray-900">{rupiah(labaKotor)}</p></div>
          <div class="rounded-lg bg-gray-50 p-4"><p class="text-xs text-gray-500">Pending Keluar</p><p class="mt-1 text-xl font-bold text-gray-900">{totalPendingPcs} pcs</p></div>
          <div class="rounded-lg bg-gray-50 p-4"><p class="text-xs text-gray-500">Stok Kain</p><p class="mt-1 text-xl font-bold text-gray-900">{stokKainTotal.toLocaleString("id-ID")}</p></div>
        </div>
      </section>
      <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-800">Barang Keluar per Tujuan</h2>
        <div class="mt-4 space-y-3">
          {#each keluarByTujuan.slice(0, 6) as row}
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0"><p class="truncate text-sm font-medium text-gray-800">{row.tujuan}</p><p class="text-xs text-gray-400">{row.list} list / pending {row.pending} pcs</p></div>
              <p class="shrink-0 text-sm font-bold text-gray-900">{row.pcs} pcs</p>
            </div>
          {:else}
            <p class="py-8 text-center text-sm text-gray-400">Belum ada barang keluar.</p>
          {/each}
        </div>
      </section>
    </div>
  {:else if activeTab === "keuangan"}
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-2">
        <h2 class="text-sm font-semibold text-gray-800">Laporan Laba Rugi</h2>
        <div class="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-100">
          <div class="flex justify-between px-4 py-3 text-sm"><span>Pendapatan penjualan</span><strong class="text-green-700">{rupiah(penjualan)}</strong></div>
          <div class="flex justify-between px-4 py-3 text-sm"><span>HPP produksi barang keluar</span><strong class="text-red-700">({rupiah(hpp)})</strong></div>
          <div class="flex justify-between bg-gray-50 px-4 py-3 text-sm"><span class="font-semibold">Laba kotor</span><strong>{rupiah(labaKotor)}</strong></div>
          <div class="flex justify-between px-4 py-3 text-sm"><span>Pemasukan manual/lainnya</span><strong class="text-green-700">{rupiah(pemasukanManual)}</strong></div>
          <div class="flex justify-between px-4 py-3 text-sm"><span>Pengeluaran perusahaan</span><strong class="text-red-700">({rupiah(pengeluaranManual)})</strong></div>
          <div class="flex justify-between px-4 py-3 text-sm"><span>Gaji terbayar</span><strong class="text-red-700">({rupiah(gajiTerbayar)})</strong></div>
          <div class="flex justify-between bg-gray-900 px-4 py-3 text-sm text-white"><span class="font-semibold">Laba bersih estimasi</span><strong>{rupiah(labaBersih)}</strong></div>
        </div>
      </section>

      <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-800">Komposisi Pengeluaran</h2>
        <div class="mx-auto mt-5 h-44 w-44 rounded-full" style={pieStyle(expenseRows)}></div>
        <div class="mt-5 space-y-3">
          {#each expenseRows.slice(0, 6) as row}
            <div>
              <div class="flex justify-between gap-3 text-sm"><span class="truncate text-gray-600">{row.label}</span><strong>{rupiah(row.value)}</strong></div>
              <div class="mt-1 h-2 rounded-full bg-gray-100"><div class="h-2 rounded-full bg-red-500" style={`width: ${Math.round((row.value / maxValue(expenseRows)) * 100)}%`}></div></div>
            </div>
          {:else}
            <p class="py-8 text-center text-sm text-gray-400">Belum ada pengeluaran.</p>
          {/each}
        </div>
      </section>

      <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-3">
        <div class="grid gap-5 lg:grid-cols-2">
          <div>
            <h2 class="text-sm font-semibold text-gray-800">Sumber Pemasukan</h2>
            <div class="mx-auto mt-5 h-36 w-36 rounded-full" style={pieStyle(incomeRows)}></div>
            <div class="mt-4 space-y-3">
              {#each incomeRows as row}
                <div class="flex items-center justify-between rounded-lg bg-green-50 px-4 py-3 text-sm"><span>{row.label}</span><strong class="text-green-700">{rupiah(row.value)}</strong></div>
              {:else}
                <p class="text-sm text-gray-400">Belum ada pemasukan.</p>
              {/each}
            </div>
          </div>
          <div>
            <h2 class="text-sm font-semibold text-gray-800">Transaksi Manual per Kategori</h2>
            <Table.Root class="mt-4">
              <Table.Header><Table.Row><Table.Head>Kategori</Table.Head><Table.Head>Masuk</Table.Head><Table.Head>Keluar</Table.Head></Table.Row></Table.Header>
              <Table.Body>
                {#each transaksiByKategori as row}
                  <Table.Row><Table.Cell>{row.kategori}</Table.Cell><Table.Cell>{rupiah(row.masuk)}</Table.Cell><Table.Cell>{rupiah(row.keluar)}</Table.Cell></Table.Row>
                {:else}
                  <Table.Row><Table.Cell colspan={3} class="text-center text-gray-400">Belum ada transaksi manual.</Table.Cell></Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        </div>
      </section>
    </div>
  {:else if activeTab === "produksi"}
    <div class="space-y-4">
      <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-800">Produksi per Status</h2>
        <div class="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          {#each produksiByStatus as row}
            <div class="rounded-lg bg-gray-50 p-4"><p class="text-sm font-semibold text-gray-800">{row.status}</p><p class="mt-2 text-2xl font-bold">{row.batch}</p><p class="text-xs text-gray-400">{row.pcs} pcs</p></div>
          {:else}
            <p class="text-sm text-gray-400">Belum ada produksi pada periode ini.</p>
          {/each}
        </div>
      </section>
      <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-800">Detail Batch Produksi</h2>
        <Table.Root class="mt-4">
          <Table.Header><Table.Row><Table.Head>Tanggal</Table.Head><Table.Head>Model</Table.Head><Table.Head>Ukuran</Table.Head><Table.Head>PCS</Table.Head><Table.Head>Status</Table.Head><Table.Head>Petugas</Table.Head><Table.Head>Kain</Table.Head></Table.Row></Table.Header>
          <Table.Body>
            {#each produksiRows as row}
              <Table.Row><Table.Cell>{formatDate(row.tanggal)}</Table.Cell><Table.Cell>{row.model}<p class="text-xs text-gray-400">{row.warna}</p></Table.Cell><Table.Cell>{row.ukuran}</Table.Cell><Table.Cell>{row.pcs}</Table.Cell><Table.Cell>{row.status}</Table.Cell><Table.Cell class="text-xs">Cut: {row.cutting}<br />Jahit: {row.jahit}<br />Steam: {row.steam}</Table.Cell><Table.Cell class="text-xs">{row.kain}</Table.Cell></Table.Row>
            {:else}
              <Table.Row><Table.Cell colspan={7} class="text-center text-gray-400">Belum ada batch produksi.</Table.Cell></Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </section>
    </div>
  {:else if activeTab === "barang_keluar"}
    <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 class="text-sm font-semibold text-gray-800">Laporan List Barang Keluar</h2>
      <Table.Root class="mt-4">
        <Table.Header><Table.Row><Table.Head>Tanggal</Table.Head><Table.Head>Tujuan</Table.Head><Table.Head>Reseller</Table.Head><Table.Head>Isi List</Table.Head><Table.Head>Keluar</Table.Head><Table.Head>Pending</Table.Head><Table.Head>Penjualan</Table.Head><Table.Head>HPP</Table.Head><Table.Head>Laba</Table.Head></Table.Row></Table.Header>
        <Table.Body>
          {#each listBarangKeluarRows as row}
            <Table.Row><Table.Cell>{formatDate(row.tanggal)}</Table.Cell><Table.Cell>{row.tujuan}</Table.Cell><Table.Cell>{row.reseller}</Table.Cell><Table.Cell>{row.itemCount} item / {row.modelCount} model / {row.warnaCount} warna</Table.Cell><Table.Cell>{row.pcsKeluar} pcs</Table.Cell><Table.Cell>{row.pcsPending} pcs</Table.Cell><Table.Cell>{rupiah(row.nilaiJual)}</Table.Cell><Table.Cell>{rupiah(row.hpp)}</Table.Cell><Table.Cell>{rupiah(row.labaKotor)}</Table.Cell></Table.Row>
          {:else}
            <Table.Row><Table.Cell colspan={9} class="text-center text-gray-400">Belum ada barang keluar.</Table.Cell></Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </section>
  {:else if activeTab === "stok"}
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-800">Stok Barang Jadi</h2>
        <Table.Root class="mt-4">
          <Table.Header><Table.Row><Table.Head>Model</Table.Head><Table.Head>PCS</Table.Head><Table.Head>Nilai Produksi</Table.Head><Table.Head>Estimasi Jual</Table.Head></Table.Row></Table.Header>
          <Table.Body>
            {#each stokJadiByModel as row}
              <Table.Row><Table.Cell>{row.model}</Table.Cell><Table.Cell>{row.pcs} pcs</Table.Cell><Table.Cell>{rupiah(row.nilaiProduksi)}</Table.Cell><Table.Cell>{rupiah(row.nilaiJual)}</Table.Cell></Table.Row>
            {:else}
              <Table.Row><Table.Cell colspan={4} class="text-center text-gray-400">Belum ada stok barang jadi.</Table.Cell></Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </section>
      <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-800">Stok Kain</h2>
        <Table.Root class="mt-4">
          <Table.Header><Table.Row><Table.Head>Jenis Kain</Table.Head><Table.Head>Warna</Table.Head><Table.Head>Total Stok</Table.Head><Table.Head>Nilai Beli</Table.Head></Table.Row></Table.Header>
          <Table.Body>
            {#each stokKainByJenis as row}
              <Table.Row><Table.Cell>{row.nama}</Table.Cell><Table.Cell>{row.warna}</Table.Cell><Table.Cell>{row.total.toLocaleString("id-ID")}</Table.Cell><Table.Cell>{rupiah(row.nilai)}</Table.Cell></Table.Row>
            {:else}
              <Table.Row><Table.Cell colspan={4} class="text-center text-gray-400">Belum ada stok kain.</Table.Cell></Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </section>
    </div>
  {:else}
    <div class="space-y-4">
      <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-800">Data Karyawan</h2>
        <Table.Root class="mt-4">
          <Table.Header><Table.Row><Table.Head>Nama</Table.Head><Table.Head>Role</Table.Head><Table.Head>Divisi</Table.Head><Table.Head>Status</Table.Head><Table.Head>Penggajian</Table.Head><Table.Head>Nominal</Table.Head></Table.Row></Table.Header>
          <Table.Body>
            {#each karyawanRows as row}
              <Table.Row><Table.Cell><p class="font-medium">{row.nama}</p><p class="text-xs text-gray-400">{row.email} / {row.kode}</p></Table.Cell><Table.Cell>{row.role}</Table.Cell><Table.Cell>{row.divisi}</Table.Cell><Table.Cell class="capitalize">{row.status}</Table.Cell><Table.Cell class="capitalize">{row.tipeGaji}</Table.Cell><Table.Cell>{row.tarif > 0 ? `${rupiah(row.tarif)} / pcs` : rupiah(row.gajiPokok)}</Table.Cell></Table.Row>
            {:else}
              <Table.Row><Table.Cell colspan={6} class="text-center text-gray-400">Belum ada data karyawan.</Table.Cell></Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </section>
      <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-800">Gaji Terbayar Periode Ini</h2>
        <Table.Root class="mt-4">
          <Table.Header><Table.Row><Table.Head>Nama</Table.Head><Table.Head>Divisi</Table.Head><Table.Head>Periode</Table.Head><Table.Head>PCS</Table.Head><Table.Head>Total</Table.Head><Table.Head>Detail</Table.Head></Table.Row></Table.Header>
          <Table.Body>
            {#each gajiRows as row}
              <Table.Row><Table.Cell>{row.nama}</Table.Cell><Table.Cell>{row.divisi}</Table.Cell><Table.Cell>{row.periode}</Table.Cell><Table.Cell>{row.pcs}</Table.Cell><Table.Cell>{rupiah(row.nominal)}</Table.Cell><Table.Cell class="text-xs">{row.detail}</Table.Cell></Table.Row>
            {:else}
              <Table.Row><Table.Cell colspan={6} class="text-center text-gray-400">Belum ada pembayaran gaji pada periode ini.</Table.Cell></Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </section>
    </div>
  {/if}
</div>
