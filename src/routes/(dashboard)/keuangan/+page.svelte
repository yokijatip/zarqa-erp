<script lang="ts">
  import { page } from "$app/stores";
  import { currentUser, userRole } from "$lib/stores/auth.store";
  import { getRiwayatBarangKeluarByPeriod, getStokBarangJadi } from "$lib/firebase/barang-jadi";
  import { getKaryawanList } from "$lib/firebase/karyawan";
  import { getModelBajuList } from "$lib/firebase/model-baju";
  import {
    addAsetPerusahaan,
    addTransaksiKeuangan,
    deleteAsetPerusahaan,
    deleteTransaksiKeuangan,
    getAsetPerusahaan,
    getTransaksiKeuangan,
    KATEGORI_ASET,
    kategoriLabel,
    KATEGORI_PEMASUKAN,
    KATEGORI_PENGELUARAN,
    KONDISI_ASET,
    METODE_PEMBAYARAN,
    updateAsetPerusahaan,
    updateTransaksiKeuangan,
  } from "$lib/firebase/keuangan";
  import { getPembayaranGajiPeriode, type PembayaranGajiRecord } from "$lib/firebase/penggajian";
  import { type DateRange, getPeriodRange } from "$lib/period";
  import type {
    AsetPerusahaan,
    BarangKeluar,
    BarangKeluarItem,
    KategoriAset,
    KategoriTransaksiKeuangan,
    KondisiAset,
    ModelBaju,
    StokBarangJadi,
    TransaksiKeuangan,
    TipeTransaksiKeuangan,
    UserProfile,
  } from "$lib/types";
  import PeriodSelector from "$lib/components/period-selector.svelte";
  import StatCard from "$lib/components/StatCard.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Table from "$lib/components/ui/table";
  import { Button } from "$lib/components/ui/button";
  import { hargaJualUntukUkuran, hargaProduksiUntukUkuran } from "$lib/sales/penjualan";
  import { Input } from "$lib/components/ui/input";
  import WalletIcon from "@lucide/svelte/icons/wallet";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import TrendingDownIcon from "@lucide/svelte/icons/trending-down";
  import ReceiptIcon from "@lucide/svelte/icons/receipt";
  import BanknoteIcon from "@lucide/svelte/icons/banknote";
  import BoxesIcon from "@lucide/svelte/icons/boxes";
  import LandmarkIcon from "@lucide/svelte/icons/landmark";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  type FinanceLine = {
    source: "penjualan" | "manual" | "gaji";
    id?: string;
    tanggal: Date | null;
    tipe: TipeTransaksiKeuangan;
    kategori: string;
    deskripsi: string;
    nominal: number;
    hpp?: number;
    labaKotor?: number;
    referensi?: string;
  };

  let dateRange = $state<DateRange>(getPeriodRange("hari_ini"));
  let barangKeluar = $state<BarangKeluar[]>([]);
  let modelList = $state<ModelBaju[]>([]);
  let transaksiManual = $state<TransaksiKeuangan[]>([]);
  let pembayaranGaji = $state<PembayaranGajiRecord[]>([]);
  let asetList = $state<AsetPerusahaan[]>([]);
  let stokBarangJadi = $state<StokBarangJadi[]>([]);
  let karyawanList = $state<UserProfile[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let exporting = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);
  let openForm = $state(false);
  let openAsetForm = $state(false);
  let editing = $state<TransaksiKeuangan | null>(null);
  let editingAset = $state<AsetPerusahaan | null>(null);
  let activeTab = $state<"semua" | TipeTransaksiKeuangan>("semua");
  let activePanel = $state<"transaksi" | "aset" | "gudang">("transaksi");
  let searchQuery = $state("");

  let fTipe = $state<TipeTransaksiKeuangan>("pengeluaran");
  let fKategori = $state<KategoriTransaksiKeuangan>("operasional");
  let fTanggal = $state(new Date().toISOString().slice(0, 10));
  let fNominal = $state("");
  let fDeskripsi = $state("");
  let fMetode = $state<(typeof METODE_PEMBAYARAN)[number]>("transfer");
  let fReferensi = $state("");
  let fCatatan = $state("");

  let aNama = $state("");
  let aKategori = $state<KategoriAset>("komputer");
  let aTanggal = $state(new Date().toISOString().slice(0, 10));
  let aJumlah = $state("1");
  let aHargaSatuan = $state("");
  let aNilaiSaatIni = $state("");
  let aLokasi = $state("");
  let aSupplier = $state("");
  let aMetode = $state<(typeof METODE_PEMBAYARAN)[number]>("transfer");
  let aInvoice = $state("");
  let aKondisi = $state<KondisiAset>("baik");
  let aCatatan = $state("");
  let aCatatPengeluaran = $state(true);

  const canAccess = $derived(
    ["admin_keuangan", "owner", "developer"].includes($userRole ?? ""),
  );
  const modelMap = $derived(new Map(modelList.map((m) => [m.id, m])));
  const modelNameMap = $derived(
    new Map(modelList.map((m) => [m.nama_model.toLowerCase(), m])),
  );
  const kategoriOptions = $derived(
    fTipe === "pemasukan" ? KATEGORI_PEMASUKAN : KATEGORI_PENGELUARAN,
  );
  const canSubmit = $derived(
    fDeskripsi.trim() !== "" && Number(fNominal) > 0 && fTanggal !== "",
  );
  const canSubmitAset = $derived(
    aNama.trim() !== "" && Number(aJumlah) > 0 && Number(aHargaSatuan) >= 0 && aTanggal !== "",
  );
  const pageMode = $derived.by<"ringkasan" | "pemasukan" | "pengeluaran">(() => {
    const tipe = $page.url.searchParams.get("tipe");
    if (tipe === "pemasukan" || tipe === "pengeluaran") return tipe;
    return "ringkasan";
  });

  let salesLines = $derived.by<FinanceLine[]>(() => {
    const lines: FinanceLine[] = [];
    for (const keluar of barangKeluar) {
      const items = normalizeBarangKeluarItems(keluar).filter(
        (item) => item.status !== "pending",
      );
      let pendapatan = 0;
      let hpp = 0;
      let totalPcs = 0;
      const modelNames = new Set<string>();
      for (const item of items) {
        const model =
          modelMap.get(item.model_id) ??
          modelNameMap.get(item.nama_model.toLowerCase());
        pendapatan += item.detail_keluar.reduce(
          (sum, detail) => sum + detail.jumlah_pcs * (detail.harga_jual && detail.harga_jual > 0 ? detail.harga_jual : hargaJualUntukUkuran(model, detail.ukuran)),
          0,
        );
        hpp += item.detail_keluar.reduce(
          (sum, detail) => sum + detail.jumlah_pcs * (detail.harga_produksi && detail.harga_produksi > 0 ? detail.harga_produksi : hargaProduksiUntukUkuran(model, detail.ukuran)),
          0,
        );
        totalPcs += item.total_pcs;
        modelNames.add(item.nama_model);
      }
      if (totalPcs <= 0) continue;

      const tujuan = keluar.tujuan || items[0]?.tujuan || "-";
      const modelText =
        modelNames.size <= 1
          ? [...modelNames][0] ?? keluar.nama_model
          : `${modelNames.size} model`;
      lines.push({
        source: "penjualan",
        tanggal: toDate(keluar.tanggal_keluar),
        tipe: "pemasukan",
        kategori: "Penjualan",
        deskripsi: `List barang keluar ke ${tujuan}: ${modelText} (${totalPcs} pcs)`,
        nominal: pendapatan,
        hpp,
        labaKotor: pendapatan - hpp,
        referensi: keluar.id,
      });
    }
    return lines;
  });

  let manualLines = $derived<FinanceLine[]>(
    transaksiManual.map((trx) => ({
      source: "manual",
      id: trx.id,
      tanggal: toDate(trx.tanggal),
      tipe: trx.tipe,
      kategori: kategoriLabel(trx.tipe, trx.kategori),
      deskripsi: trx.deskripsi,
      nominal: trx.nominal,
      referensi: trx.referensi,
    })),
  );

  let payrollLines = $derived<FinanceLine[]>(
    pembayaranGaji.map((gaji) => ({
      source: "gaji",
      id: gaji.id,
      tanggal: gaji.created_at ? toDate(gaji.created_at) : new Date(gaji.periode_end),
      tipe: "pengeluaran",
      kategori: "Gaji",
      deskripsi: `Gaji ${gaji.karyawan_nama} (${gaji.divisi})`,
      nominal: gaji.total_gaji,
      referensi: gaji.id,
    })),
  );

  let allLines = $derived.by(() =>
    [...salesLines, ...manualLines, ...payrollLines].sort(
      (a, b) => (b.tanggal?.getTime() ?? 0) - (a.tanggal?.getTime() ?? 0),
    ),
  );

  let filteredLines = $derived.by(() => {
    let list = allLines;
    if (activeTab !== "semua") list = list.filter((line) => line.tipe === activeTab);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (line) =>
          line.deskripsi.toLowerCase().includes(q) ||
          line.kategori.toLowerCase().includes(q) ||
          (line.referensi ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  });

  let incomeLines = $derived(
    allLines.filter((line) => line.tipe === "pemasukan"),
  );

  let expenseLines = $derived(
    allLines.filter((line) => line.tipe === "pengeluaran"),
  );

  let summary = $derived.by(() => {
    const penjualan = salesLines.reduce((sum, line) => sum + line.nominal, 0);
    const hpp = salesLines.reduce((sum, line) => sum + (line.hpp ?? 0), 0);
    const pemasukanManual = transaksiManual
      .filter((trx) => trx.tipe === "pemasukan")
      .reduce((sum, trx) => sum + trx.nominal, 0);
    const pembelianAset = transaksiManual
      .filter((trx) => trx.tipe === "pengeluaran" && trx.kategori === "aset")
      .reduce((sum, trx) => sum + trx.nominal, 0);
    const pengeluaranOperasional = transaksiManual
      .filter((trx) => trx.tipe === "pengeluaran" && trx.kategori !== "aset")
      .reduce((sum, trx) => sum + trx.nominal, 0);
    const gajiTerbayar = payrollLines.reduce((sum, line) => sum + line.nominal, 0);
    const gajiRegulerEstimasi = regularSalaryRows.reduce((sum, line) => sum + line.nominal, 0);
    const totalBebanGaji = gajiTerbayar + gajiRegulerEstimasi;
    const totalPengeluaranKas = pengeluaranOperasional + pembelianAset + gajiTerbayar;
    const labaKotor = penjualan - hpp;
    const labaBersih = labaKotor + pemasukanManual - pengeluaranOperasional - totalBebanGaji;
    const kasTercatat = penjualan + pemasukanManual - totalPengeluaranKas;
    const totalAset = asetList.reduce((sum, aset) => sum + (aset.nilai_saat_ini ?? aset.total_harga ?? 0), 0);
    const gudangProduksi = stokBarangJadi.reduce((sum, stok) => {
      const model = modelMap.get(stok.model_id) ?? modelNameMap.get(stok.nama_model.toLowerCase());
      return sum + stok.stok_tersedia * hargaProduksiUntukUkuran(model, stok.ukuran);
    }, 0);
    const gudangJual = stokBarangJadi.reduce((sum, stok) => {
      const model = modelMap.get(stok.model_id) ?? modelNameMap.get(stok.nama_model.toLowerCase());
      return sum + stok.stok_tersedia * hargaJualUntukUkuran(model, stok.ukuran);
    }, 0);
    const marginKotor = penjualan > 0 ? Math.round((labaKotor / penjualan) * 100) : 0;
    return {
      penjualan,
      hpp,
      pemasukanManual,
      pengeluaranOperasional,
      pembelianAset,
      gajiTerbayar,
      gajiRegulerEstimasi,
      totalBebanGaji,
      totalPengeluaranKas,
      labaKotor,
      labaBersih,
      kasTercatat,
      totalAset,
      gudangProduksi,
      gudangJual,
      marginKotor,
      transaksi: allLines.length,
    };
  });

  let inventoryRows = $derived.by(() => {
    const map = new Map<
      string,
      { model: string; pcs: number; nilaiProduksi: number; nilaiJual: number; incompletePrice: boolean }
    >();
    for (const stok of stokBarangJadi) {
      const model = modelMap.get(stok.model_id) ?? modelNameMap.get(stok.nama_model.toLowerCase());
      const key = stok.model_id || stok.nama_model;
      const row =
        map.get(key) ??
        { model: stok.nama_model, pcs: 0, nilaiProduksi: 0, nilaiJual: 0, incompletePrice: false };
      row.pcs += stok.stok_tersedia;
      row.nilaiProduksi += stok.stok_tersedia * hargaProduksiUntukUkuran(model, stok.ukuran);
      row.nilaiJual += stok.stok_tersedia * hargaJualUntukUkuran(model, stok.ukuran);
      if (!hargaProduksiUntukUkuran(model, stok.ukuran) || !hargaJualUntukUkuran(model, stok.ukuran)) row.incompletePrice = true;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.nilaiProduksi - a.nilaiProduksi);
  });

  let regularSalaryRows = $derived.by(() =>
    karyawanList
      .filter((karyawan) => {
        const isProduction = ["kepala_cutting", "kepala_jahit", "kepala_steam"].includes(karyawan.role);
        return !isProduction && karyawan.role !== "owner" && (karyawan.status_kerja ?? "aktif") === "aktif" && (karyawan.gaji_pokok ?? 0) > 0;
      })
      .map((karyawan) => ({
        uid: karyawan.uid,
        nama: karyawan.name,
        role: karyawan.role,
        tipe: karyawan.tipe_penggajian ?? "bulanan",
        nominal: estimateSalaryForRange(karyawan.gaji_pokok ?? 0, karyawan.tipe_penggajian ?? "bulanan", dateRange),
      }))
      .filter((row) => row.nominal > 0),
  );

  let cashflowChartRows = $derived.by(() => {
    const map = new Map<string, { label: string; pemasukan: number; pengeluaran: number }>();
    for (const line of allLines) {
      const date = line.tanggal;
      if (!date) continue;
      const key = date.toISOString().slice(0, 10);
      const label = date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
      const row = map.get(key) ?? { label, pemasukan: 0, pengeluaran: 0 };
      if (line.tipe === "pemasukan") row.pemasukan += line.nominal;
      else row.pengeluaran += line.nominal;
      map.set(key, row);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10)
      .map(([, value]) => value);
  });

  let maxChartValue = $derived(
    Math.max(1, ...cashflowChartRows.map((row) => Math.max(row.pemasukan, row.pengeluaran))),
  );

  let incomeBreakdown = $derived.by(() => {
    const map = new Map<string, number>();
    for (const line of incomeLines) {
      map.set(line.kategori, (map.get(line.kategori) ?? 0) + line.nominal);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  });

  let expenseBreakdown = $derived.by(() => {
    const map = new Map<string, number>();
    for (const trx of transaksiManual.filter((item) => item.tipe === "pengeluaran")) {
      const label = kategoriLabel(trx.tipe, trx.kategori);
      map.set(label, (map.get(label) ?? 0) + trx.nominal);
    }
    if (summary.gajiTerbayar > 0) {
      map.set("Gaji Terbayar", (map.get("Gaji Terbayar") ?? 0) + summary.gajiTerbayar);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  });

  function estimateSalaryForRange(nominal: number, tipe: string, range: DateRange | null): number {
    if (!range) return nominal;
    const days = Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / 86_400_000) + 1);
    if (tipe === "harian") return nominal * days;
    if (tipe === "mingguan") return nominal * Math.ceil(days / 7);
    if (tipe === "tahunan") return Math.round((nominal / 365) * days);
    return Math.round((nominal / 30) * days);
  }

  function normalizeBarangKeluarItems(keluar: BarangKeluar): BarangKeluarItem[] {
    if (keluar.items?.length) return keluar.items;
    return [
      {
        model_id: keluar.model_id,
        nama_model: keluar.nama_model,
        nama_warna: keluar.nama_warna,
        kode_hex_warna: keluar.kode_hex_warna,
        detail_keluar: keluar.detail_keluar,
        total_pcs: keluar.total_pcs,
        status: "keluar",
        tujuan: keluar.tujuan,
        nama_reseller: keluar.nama_reseller,
        keterangan: keluar.keterangan,
      },
    ];
  }

  function toDate(value: any): Date | null {
    if (!value) return null;
    const date = value.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value: Date | null): string {
    if (!value) return "-";
    return value.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function rupiah(value: number): string {
    return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
  }

  function showSuccess(message: string) {
    successMsg = message;
    setTimeout(() => (successMsg = null), 3000);
  }

  function resetForm(tipe: TipeTransaksiKeuangan = "pengeluaran") {
    editing = null;
    fTipe = tipe;
    fKategori = tipe === "pemasukan" ? "penjualan_manual" : "operasional";
    fTanggal = new Date().toISOString().slice(0, 10);
    fNominal = "";
    fDeskripsi = "";
    fMetode = "transfer";
    fReferensi = "";
    fCatatan = "";
  }

  function openTambah(tipe: TipeTransaksiKeuangan) {
    resetForm(tipe);
    openForm = true;
  }

  function openEdit(trx: TransaksiKeuangan) {
    editing = trx;
    fTipe = trx.tipe;
    fKategori = trx.kategori;
    fTanggal = toDate(trx.tanggal)?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    fNominal = String(trx.nominal);
    fDeskripsi = trx.deskripsi;
    fMetode = trx.metode ?? "transfer";
    fReferensi = trx.referensi ?? "";
    fCatatan = trx.catatan ?? "";
    openForm = true;
  }

  function resetAsetForm() {
    editingAset = null;
    aNama = "";
    aKategori = "komputer";
    aTanggal = new Date().toISOString().slice(0, 10);
    aJumlah = "1";
    aHargaSatuan = "";
    aNilaiSaatIni = "";
    aLokasi = "";
    aSupplier = "";
    aMetode = "transfer";
    aInvoice = "";
    aKondisi = "baik";
    aCatatan = "";
    aCatatPengeluaran = true;
  }

  function openTambahAset() {
    resetAsetForm();
    openAsetForm = true;
  }

  function openEditAset(aset: AsetPerusahaan) {
    editingAset = aset;
    aNama = aset.nama_aset;
    aKategori = aset.kategori;
    aTanggal = toDate(aset.tanggal_beli)?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    aJumlah = String(aset.jumlah ?? 1);
    aHargaSatuan = String(aset.harga_satuan ?? 0);
    aNilaiSaatIni = String(aset.nilai_saat_ini ?? aset.total_harga ?? 0);
    aLokasi = aset.lokasi ?? "";
    aSupplier = aset.supplier ?? "";
    aMetode = aset.metode_pembayaran ?? "transfer";
    aInvoice = aset.nomor_invoice ?? "";
    aKondisi = aset.kondisi;
    aCatatan = aset.catatan ?? "";
    aCatatPengeluaran = false;
    openAsetForm = true;
  }

  function rangeKey(range: DateRange): string {
    if (!range) return "semua";
    return `${range.start.toISOString()}_${range.end.toISOString()}`;
  }

  let lastLoadKey = $state("");

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      const [keluar, models, transaksi, gaji, aset, stokJadi, karyawan] = await Promise.all([
        getRiwayatBarangKeluarByPeriod(dateRange),
        getModelBajuList(false),
        getTransaksiKeuangan(dateRange),
        getPembayaranGajiPeriode(dateRange),
        getAsetPerusahaan(),
        getStokBarangJadi(),
        getKaryawanList(),
      ]);
      barangKeluar = keluar;
      modelList = models;
      transaksiManual = transaksi;
      pembayaranGaji = gaji;
      asetList = aset;
      stokBarangJadi = stokJadi;
      karyawanList = karyawan;
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : "Gagal memuat data keuangan.";
    } finally {
      loading = false;
    }
  }

  async function submitTransaksi() {
    if (!canSubmit || !$currentUser) return;
    saving = true;
    errorMsg = null;
    try {
      const payload = {
        tipe: fTipe,
        kategori: fKategori,
        tanggal: new Date(`${fTanggal}T00:00:00`),
        nominal: Number(fNominal),
        deskripsi: fDeskripsi,
        metode: fMetode,
        referensi: fReferensi,
        catatan: fCatatan,
        dibuat_oleh_uid: $currentUser.uid,
        dibuat_oleh_nama: $currentUser.name || $currentUser.email,
      };
      if (editing) {
        await updateTransaksiKeuangan(editing.id, payload);
        showSuccess("Transaksi keuangan diperbarui.");
      } else {
        await addTransaksiKeuangan(payload);
        showSuccess("Transaksi keuangan dicatat.");
      }
      openForm = false;
      await load();
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : "Gagal menyimpan transaksi.";
    } finally {
      saving = false;
    }
  }

  async function hapusTransaksi(trx: TransaksiKeuangan) {
    if (!confirm(`Hapus transaksi "${trx.deskripsi}"?`)) return;
    saving = true;
    try {
      await deleteTransaksiKeuangan(trx.id);
      showSuccess("Transaksi dihapus.");
      await load();
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : "Gagal menghapus transaksi.";
    } finally {
      saving = false;
    }
  }

  async function submitAset() {
    if (!canSubmitAset || !$currentUser) return;
    saving = true;
    errorMsg = null;
    try {
      const payload = {
        nama_aset: aNama,
        kategori: aKategori,
        tanggal_beli: new Date(`${aTanggal}T00:00:00`),
        jumlah: Number(aJumlah),
        harga_satuan: Number(aHargaSatuan),
        nilai_saat_ini: aNilaiSaatIni === "" ? Number(aJumlah) * Number(aHargaSatuan) : Number(aNilaiSaatIni),
        lokasi: aLokasi,
        supplier: aSupplier,
        metode_pembayaran: aMetode,
        nomor_invoice: aInvoice,
        kondisi: aKondisi,
        catatan: aCatatan,
        dibuat_oleh_uid: $currentUser.uid,
        dibuat_oleh_nama: $currentUser.name || $currentUser.email,
      };
      if (editingAset) {
        await updateAsetPerusahaan(editingAset.id, payload);
        showSuccess("Aset perusahaan diperbarui.");
      } else {
        await addAsetPerusahaan(payload, { catatPengeluaran: aCatatPengeluaran });
        showSuccess(aCatatPengeluaran ? "Aset dan pengeluaran pembelian dicatat." : "Aset perusahaan dicatat.");
      }
      openAsetForm = false;
      await load();
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : "Gagal menyimpan aset.";
    } finally {
      saving = false;
    }
  }

  async function hapusAset(aset: AsetPerusahaan) {
    if (!confirm(`Hapus aset "${aset.nama_aset}"? Transaksi pembelian yang sudah dibuat tidak ikut dihapus.`)) return;
    saving = true;
    try {
      await deleteAsetPerusahaan(aset.id);
      showSuccess("Aset dihapus.");
      await load();
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : "Gagal menghapus aset.";
    } finally {
      saving = false;
    }
  }

  async function exportPdf() {
    exporting = true;
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      doc.setFontSize(16);
      doc.text("Laporan Keuangan", 14, 16);
      doc.setFontSize(10);
      doc.text(`Dicetak: ${new Date().toLocaleString("id-ID")}`, 14, 23);
      autoTable(doc, {
        startY: 30,
        head: [["Komponen", "Nominal"]],
        body: [
          ["Penjualan", rupiah(summary.penjualan)],
          ["HPP / biaya produksi barang", rupiah(summary.hpp)],
          ["Laba kotor", rupiah(summary.labaKotor)],
          ["Pemasukan lain", rupiah(summary.pemasukanManual)],
          ["Pengeluaran operasional", rupiah(summary.pengeluaranOperasional)],
          ["Gaji terbayar otomatis", rupiah(summary.gajiTerbayar)],
          ["Estimasi gaji reguler", rupiah(summary.gajiRegulerEstimasi)],
          ["Pembelian aset (arus kas, bukan beban laba rugi)", rupiah(summary.pembelianAset)],
          ["Kas tercatat", rupiah(summary.kasTercatat)],
          ["Laba bersih", rupiah(summary.labaBersih)],
          ["Total aset perusahaan", rupiah(summary.totalAset)],
          ["Nilai stok gudang (harga produksi)", rupiah(summary.gudangProduksi)],
        ],
      });
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 8,
        head: [["Tanggal", "Tipe", "Kategori", "Deskripsi", "Nominal", "HPP", "Laba Kotor"]],
        body: filteredLines.map((line) => [
          formatDate(line.tanggal),
          line.tipe === "pemasukan" ? "Pemasukan" : "Pengeluaran",
          line.kategori,
          line.deskripsi,
          rupiah(line.nominal),
          line.hpp ? rupiah(line.hpp) : "-",
          line.labaKotor !== undefined ? rupiah(line.labaKotor) : "-",
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [17, 24, 39] },
      });
      doc.save(`laporan-keuangan-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      exporting = false;
    }
  }

  $effect(() => {
    const tipe = $page.url.searchParams.get("tipe");
    if (tipe === "pemasukan" || tipe === "pengeluaran") {
      activeTab = tipe;
      activePanel = "transaksi";
    }
  });

  $effect(() => {
    const key = rangeKey(dateRange);
    if (!canAccess || lastLoadKey === key) return;
    lastLoadKey = key;
    void load();
  });
</script>

{#if successMsg}
  <div class="fixed right-5 top-5 z-9999 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 shadow-lg">
    {successMsg}
  </div>
{/if}

{#if errorMsg}
  <div class="fixed right-5 top-5 z-9999 max-w-sm rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg">
    {errorMsg}
  </div>
{/if}

{#if !canAccess}
  <div class="flex flex-col items-center justify-center gap-3 py-24 text-center">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
      <WalletIcon class="h-7 w-7 text-red-500" />
    </div>
    <p class="font-semibold text-gray-700">Akses Ditolak</p>
    <p class="text-sm text-gray-400">Halaman keuangan hanya untuk Owner, Developer, atau Admin Keuangan.</p>
  </div>
{:else}
  <div class="mb-5 flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-xl font-semibold text-gray-900">
        {#if pageMode === "pemasukan"}
          Pemasukan
        {:else if pageMode === "pengeluaran"}
          Pengeluaran
        {:else}
          Keuangan
        {/if}
      </h1>
      <p class="mt-0.5 text-sm text-gray-500">
        {#if pageMode === "pemasukan"}
          Pantau penjualan otomatis dari barang keluar dan pemasukan manual perusahaan.
        {:else if pageMode === "pengeluaran"}
          Catat beban operasional, pembelian aset, dan pembayaran yang keluar dari kas.
        {:else}
          Laba rugi, arus kas, aset, dan nilai gudang dari data operasional.
        {/if}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <Button variant="outline" onclick={load} disabled={loading}>
        <RefreshCwIcon class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
        Refresh
      </Button>
      <Button variant="outline" onclick={exportPdf} disabled={exporting}>
        <DownloadIcon class="h-4 w-4" />
        {exporting ? "Mencetak..." : "Export PDF"}
      </Button>
      <Button onclick={() => openTambah(pageMode === "pemasukan" ? "pemasukan" : "pengeluaran")}>
        <PlusIcon class="h-4 w-4" />
        {pageMode === "pemasukan" ? "Pemasukan" : "Transaksi"}
      </Button>
    </div>
  </div>

  {#if pageMode === "ringkasan"}
    <div class="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-5">
      <section class="rounded-xl border border-gray-900 bg-gray-950 p-5 text-white shadow-sm xl:col-span-2">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm text-gray-300">Laba bersih estimasi</p>
            <p class="mt-3 text-3xl font-bold {summary.labaBersih < 0 ? 'text-red-300' : 'text-white'}">
              {rupiah(summary.labaBersih)}
            </p>
          </div>
          <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
            <WalletIcon class="h-5 w-5" />
          </div>
        </div>
        <div class="mt-5 grid grid-cols-3 gap-2 text-xs">
          <div class="rounded-lg bg-white/10 px-3 py-2">
            <p class="text-gray-400">Penjualan</p>
            <p class="mt-1 font-semibold text-green-300">{rupiah(summary.penjualan)}</p>
          </div>
          <div class="rounded-lg bg-white/10 px-3 py-2">
            <p class="text-gray-400">HPP</p>
            <p class="mt-1 font-semibold text-orange-300">{rupiah(summary.hpp)}</p>
          </div>
          <div class="rounded-lg bg-white/10 px-3 py-2">
            <p class="text-gray-400">Beban</p>
            <p class="mt-1 font-semibold text-red-300">{rupiah(summary.pengeluaranOperasional + summary.totalBebanGaji)}</p>
          </div>
        </div>
      </section>

      <StatCard
        title="Penjualan"
        value={rupiah(summary.penjualan)}
        icon={TrendingUpIcon}
        {loading}
        footerSubtext={`${incomeLines.length} transaksi masuk`}
        class="border-green-100 bg-green-50"
        valueClass="text-green-700"
      />
      <StatCard
        title="Kas"
        value={rupiah(summary.kasTercatat)}
        icon={BanknoteIcon}
        {loading}
        footerSubtext="masuk - kas keluar"
        class={summary.kasTercatat < 0 ? "border-red-100 bg-red-50" : "border-blue-100 bg-blue-50"}
        valueClass={summary.kasTercatat < 0 ? "text-red-600" : "text-blue-700"}
      />
      <StatCard
        title="Margin"
        value={`${summary.marginKotor}%`}
        icon={ReceiptIcon}
        {loading}
        footerSubtext={rupiah(summary.labaKotor)}
        valueClass={summary.labaKotor < 0 ? "text-red-600" : "text-gray-900"}
      />
    </div>
  {:else if pageMode === "pemasukan"}
    <div class="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
      <StatCard
        title="Penjualan"
        value={rupiah(summary.penjualan)}
        icon={TrendingUpIcon}
        {loading}
        footerSubtext="otomatis dari barang keluar"
        class="border-green-100 bg-green-50"
        valueClass="text-green-700"
      />
      <StatCard
        title="Pemasukan Lain"
        value={rupiah(summary.pemasukanManual)}
        icon={BanknoteIcon}
        {loading}
        footerSubtext="input manual"
        class="border-blue-100 bg-blue-50"
        valueClass="text-blue-700"
      />
      <StatCard
        title="Total Masuk"
        value={rupiah(summary.penjualan + summary.pemasukanManual)}
        icon={WalletIcon}
        {loading}
        footerSubtext={`${incomeLines.length} transaksi`}
        valueClass="text-gray-900"
      />
    </div>
  {:else}
    <div class="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
      <StatCard
        title="Operasional"
        value={rupiah(summary.pengeluaranOperasional)}
        icon={TrendingDownIcon}
        {loading}
        footerSubtext="beban perusahaan"
        class="border-red-100 bg-red-50"
        valueClass="text-red-700"
      />
      <StatCard
        title="Gaji"
        value={rupiah(summary.totalBebanGaji)}
        icon={ReceiptIcon}
        {loading}
        footerSubtext="produksi & reguler"
        class="border-orange-100 bg-orange-50"
        valueClass="text-orange-700"
      />
      <StatCard
        title="Pembelian Aset"
        value={rupiah(summary.pembelianAset)}
        icon={LandmarkIcon}
        {loading}
        footerSubtext={`${asetList.length} aset tercatat`}
        class="border-violet-100 bg-violet-50"
        valueClass="text-violet-700"
      />
    </div>
  {/if}

  {#if pageMode === "ringkasan"}
    <div class="mb-5 grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-gray-800">Arus Kas</h2>
            <p class="mt-0.5 text-xs text-gray-400">Pemasukan dan pengeluaran per tanggal pada periode ini.</p>
          </div>
          <div class="flex items-center gap-3 text-xs">
            <span class="inline-flex items-center gap-1 text-green-700"><span class="h-2 w-2 rounded-full bg-green-500"></span>Masuk</span>
            <span class="inline-flex items-center gap-1 text-red-700"><span class="h-2 w-2 rounded-full bg-red-500"></span>Keluar</span>
          </div>
        </div>
        {#if cashflowChartRows.length === 0}
          <div class="py-16 text-center text-sm text-gray-400">Belum ada arus kas pada periode ini.</div>
        {:else}
          <div class="mt-5 flex h-56 items-end gap-3 overflow-x-auto rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            {#each cashflowChartRows as row}
              <div class="flex min-w-16 flex-1 flex-col items-center gap-2">
                <div class="flex h-40 w-full items-end justify-center gap-1.5">
                  <div
                    class="w-4 rounded-t bg-green-500"
                    title={`Pemasukan ${rupiah(row.pemasukan)}`}
                    style={`height: ${Math.max(4, (row.pemasukan / maxChartValue) * 100)}%`}
                  ></div>
                  <div
                    class="w-4 rounded-t bg-red-500"
                    title={`Pengeluaran ${rupiah(row.pengeluaran)}`}
                    style={`height: ${Math.max(4, (row.pengeluaran / maxChartValue) * 100)}%`}
                  ></div>
                </div>
                <span class="text-[11px] text-gray-500">{row.label}</span>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="h-fit rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-800">Komposisi Nilai</h2>
        <div class="mt-5 space-y-4">
          {#each [["Kas", summary.kasTercatat, "bg-blue-500"], ["Aset", summary.totalAset, "bg-violet-500"], ["Gudang", summary.gudangProduksi, "bg-teal-500"]] as item}
            {@const totalKomposisi = Math.max(1, Math.abs(summary.kasTercatat) + summary.totalAset + summary.gudangProduksi)}
            <div>
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="font-medium text-gray-700">{item[0]}</span>
                <span class="text-gray-500">{rupiah(Number(item[1]))}</span>
              </div>
              <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
                <div class="h-2 rounded-full {item[2]}" style={`width: ${Math.round((Math.abs(Number(item[1])) / totalKomposisi) * 100)}%`}></div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    </div>
  {/if}

  {#if pageMode === "ringkasan"}
  <div class="mb-5 grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
    <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-gray-800">Laporan Laba Rugi</h2>
          <p class="mt-0.5 text-xs text-gray-400">Format ringkas sesuai praktik dasar perusahaan.</p>
        </div>
        <PeriodSelector bind:dateRange defaultPeriod="hari_ini" />
      </div>
      <div class="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-100">
        <div class="flex items-center justify-between px-4 py-3">
          <span class="text-sm text-gray-500">Pendapatan penjualan</span>
          <span class="font-semibold text-gray-900">{rupiah(summary.penjualan)}</span>
        </div>
        <div class="flex items-center justify-between px-4 py-3">
          <span class="text-sm text-gray-500">HPP / biaya produksi barang</span>
          <span class="font-semibold text-orange-700">({rupiah(summary.hpp)})</span>
        </div>
        <div class="flex items-center justify-between bg-gray-50 px-4 py-3">
          <span class="text-sm font-semibold text-gray-700">Laba kotor</span>
          <span class="font-bold text-gray-900">{rupiah(summary.labaKotor)}</span>
        </div>
        <div class="flex items-center justify-between px-4 py-3">
          <span class="text-sm text-gray-500">Pemasukan lain</span>
          <span class="font-semibold text-green-700">{rupiah(summary.pemasukanManual)}</span>
        </div>
        <div class="flex items-center justify-between px-4 py-3">
          <span class="text-sm text-gray-500">Pengeluaran operasional</span>
          <span class="font-semibold text-red-700">({rupiah(summary.pengeluaranOperasional)})</span>
        </div>
        <div class="flex items-center justify-between px-4 py-3">
          <span class="text-sm text-gray-500">Gaji terbayar otomatis</span>
          <span class="font-semibold text-red-700">({rupiah(summary.gajiTerbayar)})</span>
        </div>
        <div class="flex items-center justify-between px-4 py-3">
          <span class="text-sm text-gray-500">Estimasi gaji reguler</span>
          <span class="font-semibold text-red-700">({rupiah(summary.gajiRegulerEstimasi)})</span>
        </div>
        <div class="flex items-center justify-between px-4 py-3">
          <span class="text-sm text-gray-500">Pembelian aset (kas, bukan beban laba rugi)</span>
          <span class="font-semibold text-violet-700">({rupiah(summary.pembelianAset)})</span>
        </div>
        <div class="flex items-center justify-between px-4 py-3">
          <span class="text-sm text-gray-500">Kas tercatat</span>
          <span class="font-semibold text-blue-700">{rupiah(summary.kasTercatat)}</span>
        </div>
        <div class="flex items-center justify-between bg-gray-900 px-4 py-3 text-white">
          <span class="text-sm font-semibold">Laba bersih estimasi</span>
          <span class="font-bold">{rupiah(summary.labaBersih)}</span>
        </div>
      </div>
    </section>

    <section class="h-fit rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 class="text-sm font-semibold text-gray-800">Pengeluaran Terbesar</h2>
      {#if expenseBreakdown.length === 0}
        <div class="py-10 text-center text-sm text-gray-400">Belum ada pengeluaran manual.</div>
      {:else}
        <div class="mt-4 space-y-3">
          {#each expenseBreakdown.slice(0, 6) as [label, total]}
            {@const pct = summary.totalPengeluaranKas > 0 ? Math.round((total / summary.totalPengeluaranKas) * 100) : 0}
            <div>
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="font-medium text-gray-700">{label}</span>
                <span class="text-gray-500">{rupiah(total)}</span>
              </div>
              <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
                <div class="h-2 rounded-full bg-red-400" style={`width: ${pct}%`}></div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      <div class="mt-5 border-t border-gray-100 pt-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-gray-800">Gaji Reguler</p>
            <p class="text-xs text-gray-400">{regularSalaryRows.length} karyawan aktif</p>
          </div>
          <p class="font-bold text-red-700">{rupiah(summary.gajiRegulerEstimasi)}</p>
        </div>
        {#if regularSalaryRows.length > 0}
          <div class="mt-3 space-y-2">
            {#each regularSalaryRows.slice(0, 4) as row}
              <div class="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span class="min-w-0 truncate text-gray-700">{row.nama}</span>
                <span class="shrink-0 font-semibold text-gray-900">{rupiah(row.nominal)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  </div>
  {:else if pageMode === "pemasukan"}
    <div class="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-gray-800">Sumber Pemasukan</h2>
            <p class="mt-0.5 text-xs text-gray-400">Penjualan otomatis dan pemasukan manual pada periode ini.</p>
          </div>
          <PeriodSelector bind:dateRange defaultPeriod="hari_ini" />
        </div>
        <div class="mt-5 grid gap-3 sm:grid-cols-3">
          <div class="rounded-xl bg-green-50 p-4">
            <p class="text-xs text-green-700">Penjualan Barang</p>
            <p class="mt-2 text-xl font-bold text-green-800">{rupiah(summary.penjualan)}</p>
          </div>
          <div class="rounded-xl bg-blue-50 p-4">
            <p class="text-xs text-blue-700">Pemasukan Manual</p>
            <p class="mt-2 text-xl font-bold text-blue-800">{rupiah(summary.pemasukanManual)}</p>
          </div>
          <div class="rounded-xl bg-gray-50 p-4">
            <p class="text-xs text-gray-500">Jumlah Transaksi</p>
            <p class="mt-2 text-xl font-bold text-gray-900">{incomeLines.length}</p>
          </div>
        </div>
        <div class="mt-5 space-y-3">
          {#each incomeBreakdown.slice(0, 6) as [label, total]}
            {@const pct = (summary.penjualan + summary.pemasukanManual) > 0 ? Math.round((total / (summary.penjualan + summary.pemasukanManual)) * 100) : 0}
            <div>
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="font-medium text-gray-700">{label}</span>
                <span class="text-gray-500">{rupiah(total)}</span>
              </div>
              <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
                <div class="h-2 rounded-full bg-green-500" style={`width: ${pct}%`}></div>
              </div>
            </div>
          {/each}
        </div>
      </section>
      <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-800">Aksi Pemasukan</h2>
        <div class="mt-4 space-y-3">
          <Button class="w-full justify-start" onclick={() => openTambah("pemasukan")}>
            <PlusIcon class="h-4 w-4" />
            Catat Pemasukan Manual
          </Button>
          <Button variant="outline" class="w-full justify-start" onclick={exportPdf} disabled={exporting}>
            <DownloadIcon class="h-4 w-4" />
            Export Laporan Pemasukan
          </Button>
        </div>
        <p class="mt-4 text-xs leading-relaxed text-gray-400">
          Penjualan dari barang keluar muncul otomatis. Gunakan pemasukan manual untuk modal, refund, atau piutang tertagih.
        </p>
      </section>
    </div>
  {:else}
    <div class="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-gray-800">Kontrol Pengeluaran</h2>
            <p class="mt-0.5 text-xs text-gray-400">Beban operasional, gaji, dan pembelian aset perusahaan.</p>
          </div>
          <PeriodSelector bind:dateRange defaultPeriod="hari_ini" />
        </div>
        <div class="mt-5 grid gap-3 sm:grid-cols-4">
          <div class="rounded-xl bg-red-50 p-4">
            <p class="text-xs text-red-700">Operasional</p>
            <p class="mt-2 text-lg font-bold text-red-800">{rupiah(summary.pengeluaranOperasional)}</p>
          </div>
          <div class="rounded-xl bg-orange-50 p-4">
            <p class="text-xs text-orange-700">Gaji</p>
            <p class="mt-2 text-lg font-bold text-orange-800">{rupiah(summary.totalBebanGaji)}</p>
          </div>
          <div class="rounded-xl bg-violet-50 p-4">
            <p class="text-xs text-violet-700">Aset</p>
            <p class="mt-2 text-lg font-bold text-violet-800">{rupiah(summary.pembelianAset)}</p>
          </div>
          <div class="rounded-xl bg-gray-50 p-4">
            <p class="text-xs text-gray-500">Kas Keluar</p>
            <p class="mt-2 text-lg font-bold text-gray-900">{rupiah(summary.totalPengeluaranKas)}</p>
          </div>
        </div>
        <div class="mt-5 space-y-3">
          {#each expenseBreakdown.slice(0, 8) as [label, total]}
            {@const pct = summary.totalPengeluaranKas > 0 ? Math.round((total / summary.totalPengeluaranKas) * 100) : 0}
            <div>
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="font-medium text-gray-700">{label}</span>
                <span class="text-gray-500">{rupiah(total)}</span>
              </div>
              <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
                <div class="h-2 rounded-full bg-red-500" style={`width: ${pct}%`}></div>
              </div>
            </div>
          {/each}
        </div>
      </section>
      <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-800">Aksi Pengeluaran</h2>
        <div class="mt-4 space-y-3">
          <Button class="w-full justify-start" onclick={() => openTambah("pengeluaran")}>
            <PlusIcon class="h-4 w-4" />
            Catat Pengeluaran
          </Button>
          <Button variant="outline" class="w-full justify-start" onclick={openTambahAset}>
            <LandmarkIcon class="h-4 w-4" />
            Beli / Tambah Aset
          </Button>
          <Button variant="outline" class="w-full justify-start" onclick={exportPdf} disabled={exporting}>
            <DownloadIcon class="h-4 w-4" />
            Export Laporan Pengeluaran
          </Button>
        </div>
        <div class="mt-5 rounded-lg bg-gray-50 p-3">
          <p class="text-xs text-gray-400">Estimasi gaji reguler</p>
          <p class="mt-1 font-bold text-gray-900">{rupiah(summary.gajiRegulerEstimasi)}</p>
        </div>
      </section>
    </div>
  {/if}

  {#if pageMode === "ringkasan"}
    <section class="mb-4 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          {#each [["transaksi", "Transaksi"], ["aset", "Aset"], ["gudang", "Tabungan Gudang"]] as panel}
            <Button
              size="sm"
              variant={activePanel === panel[0] ? "default" : "outline"}
              onclick={() => (activePanel = panel[0] as typeof activePanel)}
            >
              {panel[1]}
            </Button>
          {/each}
        </div>
        {#if activePanel === "aset"}
          <Button onclick={openTambahAset}>
            <PlusIcon class="h-4 w-4" />
            Tambah Aset
          </Button>
        {/if}
      </div>
    </section>
  {/if}

  {#if pageMode !== "ringkasan" || activePanel === "transaksi"}
  <section class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
    <div class="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4">
      <div class="min-w-[220px] flex-1">
        <Input placeholder="Cari transaksi, kategori, referensi..." bind:value={searchQuery} />
      </div>
      <PeriodSelector bind:dateRange defaultPeriod="hari_ini" />
      {#if pageMode === "ringkasan"}
        <div class="flex items-center gap-2">
          {#each [["semua", "Semua"], ["pemasukan", "Pemasukan"], ["pengeluaran", "Pengeluaran"]] as tab}
            <Button
              size="sm"
              variant={activeTab === tab[0] ? "default" : "outline"}
              onclick={() => (activeTab = tab[0] as typeof activeTab)}
            >
              {tab[1]}
            </Button>
          {/each}
        </div>
      {:else}
        <span class="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700">
          {filteredLines.length} transaksi
        </span>
      {/if}
      <Button variant="outline" onclick={() => openTambah("pemasukan")}>
        <TrendingUpIcon class="h-4 w-4" />
        Pemasukan
      </Button>
      <Button variant="outline" onclick={() => openTambah("pengeluaran")}>
        <TrendingDownIcon class="h-4 w-4" />
        Pengeluaran
      </Button>
    </div>

    {#if loading}
      <div class="space-y-3 p-5">
        {#each Array(5) as _}
          <div class="h-12 animate-pulse rounded-lg bg-gray-100"></div>
        {/each}
      </div>
    {:else if filteredLines.length === 0}
      <div class="py-16 text-center text-sm text-gray-400">Belum ada transaksi pada filter ini.</div>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row class="bg-gray-50 hover:bg-gray-50">
            <Table.Head class="w-[120px]">Tanggal</Table.Head>
            <Table.Head>Transaksi</Table.Head>
            <Table.Head class="w-[150px] text-right">Masuk</Table.Head>
            <Table.Head class="w-[150px] text-right">Keluar</Table.Head>
            <Table.Head class="w-[130px] text-right">Laba Kotor</Table.Head>
            <Table.Head class="w-[90px] text-right">Aksi</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each filteredLines as line}
            <Table.Row>
              <Table.Cell class="align-top text-sm text-gray-500">{formatDate(line.tanggal)}</Table.Cell>
              <Table.Cell>
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span
                      class="rounded-full px-2.5 py-0.5 text-xs font-semibold {line.tipe === 'pemasukan'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'}"
                    >
                      {line.tipe === "pemasukan" ? "Pemasukan" : "Pengeluaran"}
                    </span>
                    <span class="text-xs font-medium text-gray-500">{line.kategori}</span>
                  </div>
                  <p class="mt-1 text-sm font-medium text-gray-800">{line.deskripsi}</p>
                  {#if line.source === "penjualan"}
                    <p class="text-xs text-gray-400">
                      Otomatis barang keluar · HPP {rupiah(line.hpp ?? 0)} · laba kotor {rupiah(line.labaKotor ?? 0)}
                    </p>
                  {:else if line.referensi}
                    <p class="text-xs text-gray-400">Ref: {line.referensi}</p>
                  {/if}
                </div>
              </Table.Cell>
              <Table.Cell class="text-right align-top font-semibold text-green-700">
                {line.tipe === "pemasukan" ? rupiah(line.nominal) : "-"}
              </Table.Cell>
              <Table.Cell class="text-right align-top font-semibold text-red-700">
                {line.tipe === "pengeluaran" ? rupiah(line.nominal) : "-"}
              </Table.Cell>
              <Table.Cell class="text-right align-top font-semibold {line.labaKotor !== undefined && line.labaKotor < 0 ? 'text-red-700' : 'text-gray-700'}">
                {line.labaKotor !== undefined ? rupiah(line.labaKotor) : "-"}
              </Table.Cell>
              <Table.Cell class="text-right align-top">
                {#if line.source === "manual"}
                  {@const trx = transaksiManual.find((item) => item.id === line.id)}
                  {#if trx}
                    <div class="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label="Edit transaksi" onclick={() => openEdit(trx)}>
                        <PencilIcon class="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Hapus transaksi" class="text-red-600 hover:text-red-700" onclick={() => hapusTransaksi(trx)}>
                        <Trash2Icon class="h-4 w-4" />
                      </Button>
                    </div>
                  {/if}
                {:else}
                  <span class="text-xs text-gray-300">Auto</span>
                {/if}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {/if}
  </section>
  {:else if activePanel === "aset"}
    <section class="rounded-xl border border-gray-100 bg-white shadow-sm">
      <div class="flex items-center justify-between border-b border-gray-100 p-4">
        <div>
          <h2 class="text-sm font-semibold text-gray-800">Aset Perusahaan</h2>
          <p class="mt-0.5 text-xs text-gray-400">Pembelian aset tercatat sebagai pengeluaran kas dan daftar aset.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Total aset</p>
          <p class="font-bold text-violet-700">{rupiah(summary.totalAset)}</p>
        </div>
      </div>
      {#if asetList.length === 0}
        <div class="py-16 text-center text-sm text-gray-400">Belum ada aset perusahaan.</div>
      {:else}
        <Table.Root class="table-fixed">
          <Table.Header>
            <Table.Row class="bg-gray-50 hover:bg-gray-50">
              <Table.Head>Aset</Table.Head>
              <Table.Head class="w-[14%]">Kategori</Table.Head>
              <Table.Head class="w-[12%]">Kondisi</Table.Head>
              <Table.Head class="w-[12%]">Tanggal</Table.Head>
              <Table.Head class="w-[14%] text-right">Nilai Saat Ini</Table.Head>
              <Table.Head class="w-[12%] text-right">Aksi</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each asetList as aset}
              <Table.Row>
                <Table.Cell>
                  <p class="font-medium text-gray-900">{aset.nama_aset}</p>
                  <p class="text-xs text-gray-400">
                    {aset.jumlah} unit / beli {rupiah(aset.total_harga)}
                    {#if aset.lokasi} / {aset.lokasi}{/if}
                  </p>
                </Table.Cell>
                <Table.Cell class="text-sm text-gray-600">{KATEGORI_ASET[aset.kategori]}</Table.Cell>
                <Table.Cell>
                  <span class="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                    {KONDISI_ASET[aset.kondisi]}
                  </span>
                </Table.Cell>
                <Table.Cell class="text-sm text-gray-500">{formatDate(toDate(aset.tanggal_beli))}</Table.Cell>
                <Table.Cell class="text-right font-semibold text-gray-900">
                  {rupiah(aset.nilai_saat_ini ?? aset.total_harga)}
                </Table.Cell>
                <Table.Cell class="text-right">
                  <div class="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label="Edit aset" onclick={() => openEditAset(aset)}>
                      <PencilIcon class="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Hapus aset" class="text-red-600 hover:text-red-700" onclick={() => hapusAset(aset)}>
                      <Trash2Icon class="h-4 w-4" />
                    </Button>
                  </div>
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      {/if}
    </section>
  {:else}
    <section class="rounded-xl border border-gray-100 bg-white shadow-sm">
      <div class="flex items-center justify-between border-b border-gray-100 p-4">
        <div>
          <h2 class="text-sm font-semibold text-gray-800">Tabungan Gudang</h2>
          <p class="mt-0.5 text-xs text-gray-400">Nilai utama memakai harga produksi. Nilai jual hanya estimasi potensi omzet.</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Estimasi nilai jual</p>
          <p class="font-bold text-gray-900">{rupiah(summary.gudangJual)}</p>
        </div>
      </div>
      {#if inventoryRows.length === 0}
        <div class="py-16 text-center text-sm text-gray-400">Belum ada stok barang jadi.</div>
      {:else}
        <Table.Root class="table-fixed">
          <Table.Header>
            <Table.Row class="bg-gray-50 hover:bg-gray-50">
              <Table.Head>Model</Table.Head>
              <Table.Head class="w-[12%] text-right">Stok</Table.Head>
              <Table.Head class="w-[18%] text-right">Nilai Produksi</Table.Head>
              <Table.Head class="w-[18%] text-right">Estimasi Jual</Table.Head>
              <Table.Head class="w-[16%] text-center">Status Harga</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each inventoryRows as row}
              <Table.Row>
                <Table.Cell class="font-medium text-gray-900">{row.model}</Table.Cell>
                <Table.Cell class="text-right">{row.pcs.toLocaleString("id-ID")} pcs</Table.Cell>
                <Table.Cell class="text-right font-semibold text-teal-700">{rupiah(row.nilaiProduksi)}</Table.Cell>
                <Table.Cell class="text-right text-gray-700">{rupiah(row.nilaiJual)}</Table.Cell>
                <Table.Cell class="text-center">
                  <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold {row.incompletePrice ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}">
                    {row.incompletePrice ? "Ada harga 0" : "Lengkap"}
                  </span>
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      {/if}
    </section>
  {/if}
{/if}

<Dialog.Root bind:open={openForm}>
  <Dialog.Content class="max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{editing ? "Edit Transaksi" : "Catat Transaksi"}</Dialog.Title>
      <Dialog.Description>
        Catat pemasukan non-penjualan atau pengeluaran operasional perusahaan.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-1.5">
          <label class="block text-sm font-medium text-gray-700">Tipe <span class="text-red-500">*</span></label>
          <Select.Root
            type="single"
            value={fTipe}
            onValueChange={(value) => {
              if (!value) return;
              fTipe = value as TipeTransaksiKeuangan;
              fKategori = fTipe === "pemasukan" ? "penjualan_manual" : "operasional";
            }}
          >
            <Select.Trigger class="w-full">
              <span>{fTipe === "pemasukan" ? "Pemasukan" : "Pengeluaran"}</span>
            </Select.Trigger>
            <Select.Content preventScroll={false}>
              <Select.Item value="pemasukan">Pemasukan</Select.Item>
              <Select.Item value="pengeluaran">Pengeluaran</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>

        <div class="space-y-1.5">
          <label class="block text-sm font-medium text-gray-700">Kategori <span class="text-red-500">*</span></label>
          <Select.Root
            type="single"
            value={fKategori}
            onValueChange={(value) => value && (fKategori = value as KategoriTransaksiKeuangan)}
          >
            <Select.Trigger class="w-full">
              <span>{kategoriOptions[fKategori as keyof typeof kategoriOptions]}</span>
            </Select.Trigger>
            <Select.Content preventScroll={false}>
              {#each Object.entries(kategoriOptions) as [value, label]}
                <Select.Item value={value}>{label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-1.5">
          <label for="tanggal-transaksi" class="block text-sm font-medium text-gray-700">Tanggal <span class="text-red-500">*</span></label>
          <input
            id="tanggal-transaksi"
            type="date"
            bind:value={fTanggal}
            class="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div class="space-y-1.5">
          <label for="nominal-transaksi" class="block text-sm font-medium text-gray-700">Nominal <span class="text-red-500">*</span></label>
          <Input id="nominal-transaksi" type="number" min="0" bind:value={fNominal} placeholder="0" />
        </div>
      </div>

      <div class="space-y-1.5">
        <label for="deskripsi-transaksi" class="block text-sm font-medium text-gray-700">Deskripsi <span class="text-red-500">*</span></label>
        <Input id="deskripsi-transaksi" bind:value={fDeskripsi} placeholder="cth: Bayar listrik workshop" />
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-1.5">
          <label class="block text-sm font-medium text-gray-700">Metode</label>
          <Select.Root type="single" value={fMetode} onValueChange={(value) => value && (fMetode = value as typeof fMetode)}>
            <Select.Trigger class="w-full">
              <span class="capitalize">{fMetode}</span>
            </Select.Trigger>
            <Select.Content preventScroll={false}>
              {#each METODE_PEMBAYARAN as metode}
                <Select.Item value={metode}>
                  <span class="capitalize">{metode}</span>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="space-y-1.5">
          <label for="referensi-transaksi" class="block text-sm font-medium text-gray-700">Referensi</label>
          <Input id="referensi-transaksi" bind:value={fReferensi} placeholder="No invoice / nota" />
        </div>
      </div>

      <div class="space-y-1.5">
        <label for="catatan-transaksi" class="block text-sm font-medium text-gray-700">Catatan</label>
        <textarea
          id="catatan-transaksi"
          rows="3"
          bind:value={fCatatan}
          placeholder="Catatan tambahan..."
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        ></textarea>
      </div>
    </div>

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openForm = false)}>Batal</Button>
      <Button onclick={submitTransaksi} disabled={saving || !canSubmit}>
        {saving ? "Menyimpan..." : "Simpan Transaksi"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={openAsetForm}>
  <Dialog.Content class="max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>{editingAset ? "Edit Aset" : "Tambah Aset Perusahaan"}</Dialog.Title>
      <Dialog.Description>
        Catat aset seperti komputer, mesin, peralatan, kendaraan, atau inventaris kantor.
      </Dialog.Description>
    </Dialog.Header>

    <div class="max-h-[70vh] space-y-4 overflow-y-auto pr-2">
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-1.5">
          <label for="nama-aset" class="block text-sm font-medium text-gray-700">Nama aset <span class="text-red-500">*</span></label>
          <Input id="nama-aset" bind:value={aNama} placeholder="cth: Laptop admin gudang" />
        </div>
        <div class="space-y-1.5">
          <label class="block text-sm font-medium text-gray-700">Kategori <span class="text-red-500">*</span></label>
          <Select.Root type="single" value={aKategori} onValueChange={(value) => value && (aKategori = value as KategoriAset)}>
            <Select.Trigger class="w-full">
              <span>{KATEGORI_ASET[aKategori]}</span>
            </Select.Trigger>
            <Select.Content preventScroll={false}>
              {#each Object.entries(KATEGORI_ASET) as [value, label]}
                <Select.Item value={value}>{label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <div class="space-y-1.5">
          <label for="tanggal-aset" class="block text-sm font-medium text-gray-700">Tanggal beli <span class="text-red-500">*</span></label>
          <input
            id="tanggal-aset"
            type="date"
            bind:value={aTanggal}
            class="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div class="space-y-1.5">
          <label for="jumlah-aset" class="block text-sm font-medium text-gray-700">Jumlah <span class="text-red-500">*</span></label>
          <Input id="jumlah-aset" type="number" min="1" bind:value={aJumlah} placeholder="1" />
        </div>
        <div class="space-y-1.5">
          <label for="harga-aset" class="block text-sm font-medium text-gray-700">Harga satuan <span class="text-red-500">*</span></label>
          <Input id="harga-aset" type="number" min="0" bind:value={aHargaSatuan} placeholder="0" />
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <div class="space-y-1.5">
          <label for="nilai-aset" class="block text-sm font-medium text-gray-700">Nilai saat ini</label>
          <Input id="nilai-aset" type="number" min="0" bind:value={aNilaiSaatIni} placeholder={rupiah(Number(aJumlah || 0) * Number(aHargaSatuan || 0))} />
        </div>
        <div class="space-y-1.5">
          <label class="block text-sm font-medium text-gray-700">Kondisi</label>
          <Select.Root type="single" value={aKondisi} onValueChange={(value) => value && (aKondisi = value as KondisiAset)}>
            <Select.Trigger class="w-full">
              <span>{KONDISI_ASET[aKondisi]}</span>
            </Select.Trigger>
            <Select.Content preventScroll={false}>
              {#each Object.entries(KONDISI_ASET) as [value, label]}
                <Select.Item value={value}>{label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="space-y-1.5">
          <label class="block text-sm font-medium text-gray-700">Metode bayar</label>
          <Select.Root type="single" value={aMetode} onValueChange={(value) => value && (aMetode = value as typeof aMetode)}>
            <Select.Trigger class="w-full">
              <span class="capitalize">{aMetode}</span>
            </Select.Trigger>
            <Select.Content preventScroll={false}>
              {#each METODE_PEMBAYARAN as metode}
                <Select.Item value={metode}><span class="capitalize">{metode}</span></Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <div class="space-y-1.5">
          <label for="lokasi-aset" class="block text-sm font-medium text-gray-700">Lokasi</label>
          <Input id="lokasi-aset" bind:value={aLokasi} placeholder="Workshop / gudang" />
        </div>
        <div class="space-y-1.5">
          <label for="supplier-aset" class="block text-sm font-medium text-gray-700">Supplier</label>
          <Input id="supplier-aset" bind:value={aSupplier} placeholder="Nama toko/vendor" />
        </div>
        <div class="space-y-1.5">
          <label for="invoice-aset" class="block text-sm font-medium text-gray-700">No invoice</label>
          <Input id="invoice-aset" bind:value={aInvoice} placeholder="Opsional" />
        </div>
      </div>

      <div class="space-y-1.5">
        <label for="catatan-aset" class="block text-sm font-medium text-gray-700">Catatan</label>
        <textarea
          id="catatan-aset"
          rows="3"
          bind:value={aCatatan}
          placeholder="Garansi, spesifikasi, atau catatan aset..."
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        ></textarea>
      </div>

      {#if !editingAset}
        <label class="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
          <input type="checkbox" bind:checked={aCatatPengeluaran} class="mt-0.5 h-4 w-4 rounded border-blue-300" />
          <span>
            Catat pembelian ini juga sebagai pengeluaran kas kategori aset.
            <span class="block text-xs text-blue-700">Matikan jika aset lama hanya sedang dimigrasikan ke sistem.</span>
          </span>
        </label>
      {/if}
    </div>

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openAsetForm = false)}>Batal</Button>
      <Button onclick={submitAset} disabled={saving || !canSubmitAset}>
        {saving ? "Menyimpan..." : "Simpan Aset"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
