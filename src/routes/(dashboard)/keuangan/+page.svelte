<script lang="ts">
  import { page } from "$app/stores";
  import { currentUser, userRole } from "$lib/stores/auth.store";
  import { getRiwayatBarangKeluarByPeriod, getStokBarangJadi } from "$lib/firebase/barang-jadi";
  import { getKaryawanList } from "$lib/firebase/karyawan";
  import { getModelBajuList } from "$lib/firebase/model-baju";
  import { getStokHijabList } from "$lib/firebase/stok-hijab";
  import { stokKainCache } from "$lib/stores/data-cache.svelte";
  import {
    addAsetPerusahaan,
    addTransaksiKeuangan,
    catatTutupBukuTahunan,
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
    DEFAULT_MASA_MANFAAT_BULAN,
    deleteSaldoAwalKeuangan,
    getSaldoAwalKeuangan,
    getTutupBukuTahunanList,
    hitungNilaiBukuAset,
    hitungPenyusutanPeriode,
    saveSaldoAwalKeuangan,
    transaksiBerdampakLabaRugi,
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
    StokKain,
    SaldoAwalKeuangan,
    SnapshotPersediaanKeuangan,
    StokHijab,
    TransaksiKeuangan,
    TipeTransaksiKeuangan,
    TutupBukuTahunan,
    PembagianLabaKaryawan,
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
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import { Chart, registerables } from "chart.js";
  Chart.register(...registerables);

  type FinanceLine = {
    source: "penjualan" | "manual" | "gaji";
    id?: string;
    tanggal: Date | null;
    tipe: TipeTransaksiKeuangan;
    kategori: string;
    deskripsi: string;
    nominal: number;
    nilaiBruto?: number;
    biayaAdmin?: number;
    kanal?: string;
    jenisGaji?: "produksi" | "reguler";
    karyawanUid?: string;
    hpp?: number;
    labaKotor?: number;
    referensi?: string;
    isInventoryPurchase?: boolean;
    isAssetPurchase?: boolean;
    isNonProfitIncome?: boolean;
    isEquityDistribution?: boolean;
    isLocked?: boolean;
  };

  let reportDateRange = $state<DateRange>(getPeriodRange("semua"));
  let transactionDateRange = $state<DateRange>(getPeriodRange("semua"));
  let overviewDateRange = $state<DateRange>(getPeriodRange("semua"));
  let barangKeluar = $state<BarangKeluar[]>([]);
  let modelList = $state<ModelBaju[]>([]);
  let transaksiManual = $state<TransaksiKeuangan[]>([]);
  let pembayaranGaji = $state<PembayaranGajiRecord[]>([]);
  let asetList = $state<AsetPerusahaan[]>([]);
  let saldoAwal = $state<SaldoAwalKeuangan | null>(null);
  let stokBarangJadi = $state<StokBarangJadi[]>([]);
  let stokKainList = $state<StokKain[]>([]);
  let stokHijabList = $state<StokHijab[]>([]);
  let karyawanList = $state<UserProfile[]>([]);
  let tutupBukuList = $state<TutupBukuTahunan[]>([]);
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
  let activePanel = $state<"transaksi" | "saldo_awal" | "aset" | "gudang" | "tutup_buku">("transaksi");
  let searchQuery = $state("");
  let expandedGudangModels = $state<Set<string>>(new Set());
  const transactionPageSize = 50;
  let transactionPage = $state(1);
  let cashflowCanvas = $state<HTMLCanvasElement | null>(null);
  let profitLossCanvas = $state<HTMLCanvasElement | null>(null);
  let cashflowChart: Chart | null = null;
  let profitLossChart: Chart | null = null;

  function inDateRange(value: Date | null, range: DateRange): boolean {
    if (!range || !value) return !range;
    return value >= range.start && value <= range.end;
  }

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
  let aMasaManfaat = $state(String(DEFAULT_MASA_MANFAAT_BULAN.komputer));
  let aNilaiResidu = $state("0");
  let aTanggalMulaiPenyusutan = $state(new Date().toISOString().slice(0, 10));
  let aLokasi = $state("");
  let aSupplier = $state("");
  let aMetode = $state<(typeof METODE_PEMBAYARAN)[number]>("transfer");
  let aInvoice = $state("");
  let aKondisi = $state<KondisiAset>("baik");
  let aCatatan = $state("");
  let aCatatPengeluaran = $state(true);

  let sTanggal = $state(new Date().toISOString().slice(0, 10));
  let sSaldoKas = $state("");
  let sModalAwal = $state("0");
  let sCatatan = $state("");

  let cTanggalTutup = $state(new Date().toISOString().slice(0, 10));
  let cPembagianLaba = $state("0");
  let cCatatan = $state("");
  let closeError = $state<string | null>(null);

  const canAccess = $derived(
    ["admin_keuangan", "owner", "developer"].includes($userRole ?? ""),
  );
  const canCloseBooks = $derived(["owner", "developer"].includes($userRole ?? ""));
  const modelMap = $derived(new Map(modelList.map((m) => [m.id, m])));
  const modelNameMap = $derived(
    new Map(modelList.map((m) => [m.nama_model.toLowerCase(), m])),
  );
  const kategoriOptions = $derived.by<Record<string, string>>(() => {
    const options = fTipe === "pemasukan" ? KATEGORI_PEMASUKAN : KATEGORI_PENGELUARAN;
    const kategoriKhusus = fTipe === "pemasukan"
      ? ["penjualan_manual"]
      : ["aset", "bahan_baku", "gaji", "pembagian_laba"];
    return Object.fromEntries(
      Object.entries(options).filter(([value]) => !kategoriKhusus.includes(value) || (editing && value === fKategori)),
    );
  });
  const canSubmit = $derived(
    fDeskripsi.trim() !== "" && Number(fNominal) > 0 && fTanggal !== "",
  );
  const canSubmitAset = $derived(
    aNama.trim() !== "" && Number(aJumlah) > 0 && Number(aHargaSatuan) >= 0 && Number(aMasaManfaat) > 0 && Number(aNilaiResidu) >= 0 && Number(aNilaiResidu) <= Number(aJumlah) * Number(aHargaSatuan) && aTanggal !== "" && aTanggalMulaiPenyusutan !== "",
  );
  const aTotalHarga = $derived(Math.max(0, Number(aJumlah) || 0) * Math.max(0, Number(aHargaSatuan) || 0));
  const aPenyusutanBulanan = $derived(aMasaManfaat && Number(aMasaManfaat) > 0 ? Math.max(0, (aTotalHarga - Math.min(aTotalHarga, Math.max(0, Number(aNilaiResidu) || 0))) / Number(aMasaManfaat)) : 0);
  const canSubmitSaldoAwal = $derived(
    sTanggal !== "" && String(sSaldoKas).trim() !== "" && String(sModalAwal).trim() !== "" && Number(sSaldoKas) >= 0 && Number(sModalAwal) >= 0,
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
      let nilaiBruto = 0;
      let biayaAdmin = 0;
      let hpp = 0;
      let totalPcs = 0;
      const modelNames = new Set<string>();
      for (const item of items) {
        const model =
          modelMap.get(item.model_id) ??
          modelNameMap.get(item.nama_model.toLowerCase());
        if (item.status === "pending") continue;

        if (item.jenis_produk === "hijab") {
          const pcs = Math.max(0, item.total_pcs);
          const hargaJual = Math.max(0, item.harga_jual_per_pcs ?? 0);
          const biayaAdminPersen = Math.min(100, Math.max(0, item.biaya_admin_persen ?? 0));
          const hargaBersih = Math.max(
            0,
            item.harga_jual_bersih_per_pcs ?? hargaJual * (1 - biayaAdminPersen / 100),
          );
          nilaiBruto += pcs * hargaJual;
          pendapatan += pcs * hargaBersih;
          biayaAdmin += pcs * Math.max(0, hargaJual - hargaBersih);
          hpp += pcs * Math.max(0, item.harga_produksi_per_pcs ?? 0);
          totalPcs += pcs;
          modelNames.add(item.nama_model);
          continue;
        }

        item.detail_keluar.forEach((detail) => {
          const hargaJual = detail.harga_jual && detail.harga_jual > 0
            ? detail.harga_jual
            : hargaJualUntukUkuran(model, detail.ukuran);
          const biayaAdminPersen = Math.min(100, Math.max(0, detail.biaya_admin_persen ?? item.biaya_admin_persen ?? 0));
          const hargaBersih = detail.harga_jual_bersih != null
            ? detail.harga_jual_bersih
            : hargaJual * (1 - biayaAdminPersen / 100);
          nilaiBruto += detail.jumlah_pcs * hargaJual;
          pendapatan += detail.jumlah_pcs * hargaBersih;
          biayaAdmin += detail.jumlah_pcs * Math.max(0, hargaJual - hargaBersih);
          hpp += detail.jumlah_pcs * (detail.harga_produksi && detail.harga_produksi > 0 ? detail.harga_produksi : hargaProduksiUntukUkuran(model, detail.ukuran));
        });
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
        nilaiBruto,
        biayaAdmin,
        kanal: tujuan,
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
      isInventoryPurchase: trx.tipe === "pengeluaran" && trx.kategori !== "aset" && (trx.kategori === "bahan_baku" || trx.jenis_transaksi === "pembelian_persediaan"),
      isAssetPurchase: trx.tipe === "pengeluaran" && (trx.kategori === "aset" || trx.jenis_transaksi === "pembelian_aset"),
      isNonProfitIncome: trx.tipe === "pemasukan" && (trx.dampak_laba_rugi === false || !transaksiBerdampakLabaRugi(trx.tipe, trx.kategori)),
      isEquityDistribution: trx.tipe === "pengeluaran" && trx.kategori === "pembagian_laba",
      isLocked: trx.tipe === "pengeluaran" && trx.kategori === "pembagian_laba" && (trx.referensi ?? "").startsWith("tutup_buku:"),
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
      jenisGaji: ["Cutting", "Jahit", "Steam"].includes(gaji.divisi) ? "produksi" : "reguler",
      karyawanUid: gaji.karyawan_uid,
      referensi: gaji.id,
    })),
  );

  let allLines = $derived.by(() =>
    [...salesLines, ...manualLines, ...payrollLines].sort(
      (a, b) => (b.tanggal?.getTime() ?? 0) - (a.tanggal?.getTime() ?? 0),
    ),
  );

  let reportLines = $derived(allLines.filter((line) => inDateRange(line.tanggal, reportDateRange)));
  let overviewLines = $derived(allLines.filter((line) => inDateRange(line.tanggal, overviewDateRange)));
  let overviewSummary = $derived.by(() => {
    const saldoAwalKas = saldoKasPembukaUntukRange(overviewDateRange);
    const cashLines = overviewLines.filter((line) => isCashMovementAfterCutover(line.tanggal));
    const penjualan = overviewLines.filter((line) => line.source === "penjualan").reduce((sum, line) => sum + line.nominal, 0);
    const biayaAdmin = overviewLines.filter((line) => line.source === "penjualan").reduce((sum, line) => sum + (line.biayaAdmin ?? 0), 0);
    const pemasukanManual = overviewLines
      .filter((line) => line.source === "manual" && line.tipe === "pemasukan" && !line.isNonProfitIncome)
      .reduce((sum, line) => sum + line.nominal, 0);
    const pemasukanKasManual = cashLines
      .filter((line) => line.source === "manual" && line.tipe === "pemasukan")
      .reduce((sum, line) => sum + line.nominal, 0);
    const pemasukanKasNonPendapatan = cashLines
      .filter((line) => line.source === "manual" && line.tipe === "pemasukan" && line.isNonProfitIncome)
      .reduce((sum, line) => sum + line.nominal, 0);
    const pemasukanKasPenjualan = cashLines
      .filter((line) => line.source === "penjualan")
      .reduce((sum, line) => sum + line.nominal, 0);
    const pemasukan = pemasukanKasPenjualan + pemasukanKasManual;
    const hpp = overviewLines.filter((line) => line.source === "penjualan").reduce((sum, line) => sum + (line.hpp ?? 0), 0);
    const pengeluaranOperasional = overviewLines
      .filter((line) => line.source === "manual" && line.tipe === "pengeluaran" && !line.isInventoryPurchase && !line.isAssetPurchase && !line.isEquityDistribution)
      .reduce((sum, line) => sum + line.nominal, 0);
    const pembelianPersediaan = overviewLines
      .filter((line) => line.isInventoryPurchase)
      .reduce((sum, line) => sum + line.nominal, 0);
    const pembelianAset = overviewLines
      .filter((line) => line.isAssetPurchase)
      .reduce((sum, line) => sum + line.nominal, 0);
    const gajiTerbayar = overviewLines
      .filter((line) => line.source === "gaji")
      .reduce((sum, line) => sum + line.nominal, 0);
    const gajiReguler = overviewLines
      .filter((line) => line.source === "gaji" && line.jenisGaji === "reguler")
      .reduce((sum, line) => sum + line.nominal, 0);
    const pengeluaran = pengeluaranOperasional + gajiReguler;
    const penyusutanAset = asetList.reduce((sum, aset) => sum + hitungPenyusutanPeriode(aset, overviewDateRange), 0);
    const labaKotor = penjualan - hpp;
    const kasPengeluaranOperasional = cashLines
      .filter((line) => line.source === "manual" && line.tipe === "pengeluaran" && !line.isInventoryPurchase && !line.isAssetPurchase && !line.isEquityDistribution)
      .reduce((sum, line) => sum + line.nominal, 0);
    const kasPembelianPersediaan = cashLines
      .filter((line) => line.isInventoryPurchase)
      .reduce((sum, line) => sum + line.nominal, 0);
    const kasPembelianAset = cashLines
      .filter((line) => line.isAssetPurchase)
      .reduce((sum, line) => sum + line.nominal, 0);
    const kasGajiTerbayar = cashLines
      .filter((line) => line.source === "gaji")
      .reduce((sum, line) => sum + line.nominal, 0);
    const pembagianLabaKas = cashLines
      .filter((line) => line.isEquityDistribution)
      .reduce((sum, line) => sum + line.nominal, 0);
    const kasTercatat = saldoAwalKas + pemasukan - kasPengeluaranOperasional - kasPembelianPersediaan - kasPembelianAset - kasGajiTerbayar - pembagianLabaKas;
    return {
      penjualan,
      biayaAdmin,
      pemasukanManual,
      pemasukanKasNonPendapatan,
      pemasukan,
      hpp,
      pengeluaran,
      pembelianPersediaan,
      pembelianAset,
      gajiReguler,
      saldoAwalKas,
      kasTercatat,
      kasMasuk: pemasukan,
      pembagianLabaKas,
      penyusutanAset,
      labaKotor,
      marginKotor: penjualan > 0 ? Math.round((labaKotor / penjualan) * 100) : 0,
      labaBersih: penjualan + pemasukanManual - hpp - pengeluaran - penyusutanAset,
    };
  });

  let filteredLines = $derived.by(() => {
    let list = allLines.filter((line) => inDateRange(line.tanggal, transactionDateRange));
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

  const transactionTotalPages = $derived(Math.max(1, Math.ceil(filteredLines.length / transactionPageSize)));
  const paginatedLines = $derived(
    filteredLines.slice((transactionPage - 1) * transactionPageSize, transactionPage * transactionPageSize),
  );

  $effect(() => {
    searchQuery;
    activeTab;
    transactionDateRange;
    transactionPage = Math.min(transactionPage, transactionTotalPages);
  });

  let incomeLines = $derived(
    reportLines.filter((line) => line.tipe === "pemasukan" && !line.isNonProfitIncome),
  );

  let expenseLines = $derived(
    reportLines.filter((line) => line.tipe === "pengeluaran"),
  );

  let summary = $derived.by(() => {
    const saldoAwalKas = saldoKasPembukaUntukRange(reportDateRange);
    const reportSalesLines = reportLines.filter((line) => line.source === "penjualan");
    const reportManualLines = reportLines.filter((line) => line.source === "manual");
    const reportPayrollLines = reportLines.filter((line) => line.source === "gaji");
    const cashSalesLines = reportSalesLines.filter((line) => isCashMovementAfterCutover(line.tanggal));
    const cashManualLines = reportManualLines.filter((line) => isCashMovementAfterCutover(line.tanggal));
    const cashPayrollLines = reportPayrollLines.filter((line) => isCashMovementAfterCutover(line.tanggal));
    const penjualan = reportSalesLines.reduce((sum, line) => sum + line.nominal, 0);
    const biayaAdmin = reportSalesLines.reduce((sum, line) => sum + (line.biayaAdmin ?? 0), 0);
    const hpp = reportSalesLines.reduce((sum, line) => sum + (line.hpp ?? 0), 0);
    const pemasukanManual = reportManualLines.filter((line) => line.tipe === "pemasukan" && !line.isNonProfitIncome).reduce((sum, line) => sum + line.nominal, 0);
    const pemasukanKasNonPendapatan = cashManualLines
      .filter((line) => line.tipe === "pemasukan" && line.isNonProfitIncome)
      .reduce((sum, line) => sum + line.nominal, 0);
    const pengeluaranOperasional = reportManualLines
      .filter((line) => line.tipe === "pengeluaran" && !line.isInventoryPurchase && !line.isAssetPurchase && !line.isEquityDistribution)
      .reduce((sum, line) => sum + line.nominal, 0);
    const pembelianPersediaan = reportManualLines.filter((line) => line.isInventoryPurchase).reduce((sum, line) => sum + line.nominal, 0);
    const pembelianAset = reportManualLines.filter((line) => line.isAssetPurchase).reduce((sum, line) => sum + line.nominal, 0);
    const gajiTerbayar = reportPayrollLines.reduce((sum, line) => sum + line.nominal, 0);
    const gajiProduksiTerbayar = reportPayrollLines.filter((line) => line.jenisGaji === "produksi").reduce((sum, line) => sum + line.nominal, 0);
    const gajiRegulerTerbayar = reportPayrollLines.filter((line) => line.jenisGaji === "reguler").reduce((sum, line) => sum + line.nominal, 0);
    const paidRegularUids = new Set(reportPayrollLines.filter((line) => line.jenisGaji === "reguler").map((line) => line.karyawanUid));
    const gajiRegulerEstimasi = regularSalaryRows.filter((line) => !paidRegularUids.has(line.uid)).reduce((sum, line) => sum + line.nominal, 0);
    const totalBebanGaji = gajiRegulerTerbayar + gajiRegulerEstimasi;
    const pembelianAsetKas = cashManualLines.filter((line) => line.isAssetPurchase).reduce((sum, line) => sum + line.nominal, 0);
    const pengeluaranOperasionalKas = cashManualLines
      .filter((line) => line.tipe === "pengeluaran" && !line.isInventoryPurchase && !line.isAssetPurchase && !line.isEquityDistribution)
      .reduce((sum, line) => sum + line.nominal, 0);
    const pembelianPersediaanKas = cashManualLines.filter((line) => line.isInventoryPurchase).reduce((sum, line) => sum + line.nominal, 0);
    const gajiTerbayarKas = cashPayrollLines.reduce((sum, line) => sum + line.nominal, 0);
    const pembagianLabaKas = cashManualLines.filter((line) => line.isEquityDistribution).reduce((sum, line) => sum + line.nominal, 0);
    const totalPengeluaranKas = pengeluaranOperasionalKas + pembelianPersediaanKas + pembelianAsetKas + gajiTerbayarKas + pembagianLabaKas;
    const kasMasukPenjualan = cashSalesLines.reduce((sum, line) => sum + line.nominal, 0);
    const kasMasukManual = cashManualLines.filter((line) => line.tipe === "pemasukan").reduce((sum, line) => sum + line.nominal, 0);
    const kasMasuk = kasMasukPenjualan + kasMasukManual;
    const penyusutanAset = asetList.reduce((sum, aset) => sum + hitungPenyusutanPeriode(aset, reportDateRange), 0);
    const labaKotor = penjualan - hpp;
    const labaBersih = labaKotor + pemasukanManual - pengeluaranOperasional - totalBebanGaji - penyusutanAset;
    const kasTercatat = saldoAwalKas + kasMasuk - totalPengeluaranKas;
    const totalAset = asetList.reduce((sum, aset) => sum + hitungNilaiBukuAset(aset), 0);
    const gudangProduksi = stokBarangJadi.reduce((sum, stok) => {
      const model = modelMap.get(stok.model_id) ?? modelNameMap.get(stok.nama_model.toLowerCase());
      return sum + stok.stok_tersedia * hargaProduksiUntukUkuran(model, stok.ukuran);
    }, 0);
    const gudangJual = stokBarangJadi.reduce((sum, stok) => {
      const model = modelMap.get(stok.model_id) ?? modelNameMap.get(stok.nama_model.toLowerCase());
      return sum + stok.stok_tersedia * hargaJualUntukUkuran(model, stok.ukuran);
    }, 0);
    const gudangKain = stokKainList.reduce((sum, kain) => sum + kain.stok_tersedia * (kain.harga_per_unit ?? 0), 0);
    const gudangHijab = stokHijabList.reduce((sum, hijab) => sum + hijab.stok_tersedia * (hijab.harga_per_unit ?? 0), 0);
    const marginKotor = penjualan > 0 ? Math.round((labaKotor / penjualan) * 100) : 0;
    return {
      penjualan,
      biayaAdmin,
      hpp,
      pemasukanManual,
      pemasukanKasNonPendapatan,
      pengeluaranOperasional,
      pembelianAset,
      pembelianAsetKas,
      pembelianPersediaan,
      gajiTerbayar,
      gajiProduksiTerbayar,
      gajiRegulerTerbayar,
      gajiRegulerEstimasi,
      totalBebanGaji,
      totalPengeluaranKas,
      pembagianLabaKas,
      kasMasuk,
      saldoAwalKas,
      labaKotor,
      labaBersih,
      kasTercatat,
      penyusutanAset,
      totalAset,
      gudangProduksi,
      gudangJual,
      gudangKain,
      gudangHijab,
      marginKotor,
      transaksi: allLines.length,
    };
  });

  let inventoryRows = $derived.by(() => {
    const map = new Map<
      string,
      {
        key: string;
        model: string;
        pcs: number;
        nilaiProduksi: number;
        nilaiJual: number;
        incompletePrice: boolean;
        linkedModels: Array<{ id: string; name: string }>;
        details: Array<{ ukuran: string; stok: number; nilaiProduksi: number; nilaiJual: number; hargaProduksi: number; hargaJual: number }>;
      }
    >();

    for (const model of modelList) {
      if (model.stok_model_id && model.stok_model_id !== model.id) continue;
      map.set(model.id, {
        key: model.id,
        model: model.nama_model,
        pcs: 0,
        nilaiProduksi: 0,
        nilaiJual: 0,
        incompletePrice: false,
        linkedModels: [],
        details: [],
      });
    }

    for (const stok of stokBarangJadi) {
      const model = modelMap.get(stok.model_id) ?? modelNameMap.get(stok.nama_model.toLowerCase());
      const sourceModel = model?.stok_model_id ? modelMap.get(model.stok_model_id) ?? model : model;
      const key = sourceModel?.id ?? stok.model_id ?? stok.nama_model;
      const row =
        map.get(key) ??
        {
          key,
          model: sourceModel?.nama_model ?? stok.nama_model,
          pcs: 0,
          nilaiProduksi: 0,
          nilaiJual: 0,
          incompletePrice: false,
          linkedModels: [],
          details: [],
        };
      const hargaProduksi = hargaProduksiUntukUkuran(sourceModel, stok.ukuran);
      const hargaJual = hargaJualUntukUkuran(sourceModel, stok.ukuran);
      row.pcs += stok.stok_tersedia;
      row.nilaiProduksi += stok.stok_tersedia * hargaProduksi;
      row.nilaiJual += stok.stok_tersedia * hargaJual;
      row.details.push({ ukuran: stok.ukuran, stok: stok.stok_tersedia, nilaiProduksi: stok.stok_tersedia * hargaProduksi, nilaiJual: stok.stok_tersedia * hargaJual, hargaProduksi, hargaJual });
      if (!hargaProduksi || !hargaJual) row.incompletePrice = true;
      map.set(key, row);
    }

    for (const model of modelList) {
      const sourceId = model.stok_model_id;
      if (!sourceId || sourceId === model.id || model.aktif === false) continue;
      const sourceRow = map.get(sourceId);
      if (sourceRow && !sourceRow.linkedModels.some((linked) => linked.id === model.id)) {
        sourceRow.linkedModels.push({ id: model.id, name: model.nama_model });
      }
    }

    return [...map.values()].sort((a, b) => b.nilaiProduksi - a.nilaiProduksi);
  });

  function toggleGudangModel(key: string) {
    const next = new Set(expandedGudangModels);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedGudangModels = next;
  }

  let snapshotPersediaan = $derived.by<SnapshotPersediaanKeuangan[]>(() => {
    const rows: SnapshotPersediaanKeuangan[] = [];
    for (const row of inventoryRows) {
      for (const detail of row.details) {
        if (detail.stok <= 0) continue;
        rows.push({
          id: `${row.key}:${detail.ukuran}`,
          tipe: "barang_jadi",
          nama: row.model,
          ukuran: detail.ukuran,
          satuan: "pcs",
          jumlah: detail.stok,
          harga_satuan: detail.hargaProduksi,
          nilai: detail.nilaiProduksi,
        });
      }
    }
    for (const kain of stokKainList) {
      if (kain.stok_tersedia <= 0) continue;
      const harga = kain.harga_per_unit ?? 0;
      rows.push({
        id: kain.id,
        tipe: "stok_kain",
        nama: kain.nama_kain,
        ...(kain.nama_warna ? { warna: kain.nama_warna } : {}),
        satuan: kain.satuan,
        jumlah: kain.stok_tersedia,
        harga_satuan: harga,
        nilai: kain.stok_tersedia * harga,
      });
    }
    for (const hijab of stokHijabList) {
      if (hijab.stok_tersedia <= 0) continue;
      const harga = hijab.harga_per_unit ?? 0;
      rows.push({
        id: hijab.id,
        tipe: "stok_hijab",
        nama: hijab.nama_hijab,
        ...(hijab.nama_warna ? { warna: hijab.nama_warna } : {}),
        satuan: "pcs",
        jumlah: hijab.stok_tersedia,
        harga_satuan: harga,
        nilai: hijab.stok_tersedia * harga,
      });
    }
    return rows;
  });

  const snapshotNilaiPersediaan = $derived.by(() => ({
    barangJadi: snapshotPersediaan.filter((item) => item.tipe === "barang_jadi").reduce((sum, item) => sum + item.nilai, 0),
    kain: snapshotPersediaan.filter((item) => item.tipe === "stok_kain").reduce((sum, item) => sum + item.nilai, 0),
    hijab: snapshotPersediaan.filter((item) => item.tipe === "stok_hijab").reduce((sum, item) => sum + item.nilai, 0),
  }));

  const closingDate = $derived(cTanggalTutup ? new Date(`${cTanggalTutup}T23:59:59`) : null);
  const closingYear = $derived(closingDate?.getFullYear() ?? 0);
  const closingRange = $derived.by<DateRange>(() => {
    if (!closingDate || !closingYear) return null;
    return {
      start: new Date(closingYear, 0, 1, 0, 0, 0, 0),
      end: closingDate,
    };
  });
  const closingAlreadySaved = $derived(tutupBukuList.some((book) => book.tahun === closingYear));
  const eligibleDistributionEmployees = $derived(
    karyawanList.filter((karyawan) => karyawan.role !== "owner" && (karyawan.status_kerja ?? "aktif") === "aktif"),
  );

  const closingOpening = $derived.by(() => {
    const previous = tutupBukuList
      .filter((book) => book.tahun < closingYear)
      .sort((a, b) => b.tahun - a.tahun)[0];
    if (previous) {
      return {
        saldoKas: previous.saldo_awal_tahun_berikutnya?.saldo_kas ?? previous.saldo_kas_akhir ?? 0,
        modalAwal: previous.saldo_awal_tahun_berikutnya?.modal_awal ?? 0,
        sumber: `Tutup buku ${previous.tahun}`,
      };
    }
    const cutover = saldoAwal?.tanggal ? toDate(saldoAwal.tanggal) : null;
    if (saldoAwal && cutover && closingDate && cutover <= closingDate) {
      return {
        saldoKas: saldoAwal.saldo_kas,
        modalAwal: saldoAwal.modal_awal,
        sumber: "Saldo awal migrasi",
      };
    }
    return { saldoKas: 0, modalAwal: 0, sumber: "Belum ada saldo pembuka" };
  });

  const closingLines = $derived.by(() => {
    if (!closingRange) return [] as FinanceLine[];
    const cutover = saldoAwal?.tanggal ? toDate(saldoAwal.tanggal) : null;
    const cutoverDay = cutover
      ? new Date(cutover.getFullYear(), cutover.getMonth(), cutover.getDate()).getTime()
      : null;
    return allLines.filter((line) => {
      if (!inDateRange(line.tanggal, closingRange)) return false;
      if (cutoverDay === null || !line.tanggal || closingYear > cutover!.getFullYear()) return true;
      return new Date(line.tanggal.getFullYear(), line.tanggal.getMonth(), line.tanggal.getDate()).getTime() >= cutoverDay;
    });
  });

  const closingSummary = $derived.by(() => {
    const sales = closingLines.filter((line) => line.source === "penjualan");
    const manualIncome = closingLines.filter((line) => line.source === "manual" && line.tipe === "pemasukan");
    const manualExpense = closingLines.filter((line) => line.source === "manual" && line.tipe === "pengeluaran");
    const regularPayroll = closingLines
      .filter((line) => line.source === "gaji" && line.jenisGaji === "reguler")
      .reduce((sum, line) => sum + line.nominal, 0);
    const penjualan = sales.reduce((sum, line) => sum + line.nominal, 0);
    const biayaAdmin = sales.reduce((sum, line) => sum + (line.biayaAdmin ?? 0), 0);
    const hpp = sales.reduce((sum, line) => sum + (line.hpp ?? 0), 0);
    const pemasukanManual = manualIncome
      .filter((line) => !line.isNonProfitIncome)
      .reduce((sum, line) => sum + line.nominal, 0);
    const bebanOperasional = manualExpense
      .filter((line) => !line.isInventoryPurchase && !line.isAssetPurchase && !line.isEquityDistribution)
      .reduce((sum, line) => sum + line.nominal, 0);
    const penyusutan = closingRange
      ? asetList.reduce((sum, aset) => sum + hitungPenyusutanPeriode(aset, closingRange), 0)
      : 0;
    const labaBersih = penjualan + pemasukanManual - hpp - bebanOperasional - regularPayroll - penyusutan;
    const kasMasuk = closingLines
      .filter((line) => line.source === "penjualan" || (line.source === "manual" && line.tipe === "pemasukan"))
      .reduce((sum, line) => sum + line.nominal, 0);
    const kasKeluar = closingLines
      .filter((line) => line.source === "gaji" || (line.source === "manual" && line.tipe === "pengeluaran"))
      .reduce((sum, line) => sum + line.nominal, 0);
    const saldoKasSebelumPembagian = closingOpening.saldoKas + kasMasuk - kasKeluar;
    const pembagianLaba = Math.max(0, Number(cPembagianLaba) || 0);
    return {
      penjualan,
      biayaAdmin,
      hpp,
      bebanOperasional: bebanOperasional + regularPayroll + penyusutan,
      labaBersih,
      kasMasuk,
      kasKeluar,
      saldoKasSebelumPembagian,
      pembagianLaba,
      saldoKasAkhir: saldoKasSebelumPembagian - pembagianLaba,
      modalAkhir: closingOpening.modalAwal + labaBersih - pembagianLaba,
    };
  });

  const pembagianKaryawan = $derived.by<PembagianLabaKaryawan[]>(() => {
    const total = closingSummary.pembagianLaba;
    const count = eligibleDistributionEmployees.length;
    if (total <= 0 || count <= 0) return [];
    const dasar = Math.floor(total / count);
    const sisa = total - dasar * count;
    return eligibleDistributionEmployees.map((karyawan, index) => ({
      uid: karyawan.uid,
      nama: karyawan.name,
      nominal: dasar + (index < sisa ? 1 : 0),
    }));
  });

  const canSubmitTutupBuku = $derived(
    canCloseBooks &&
      Boolean(closingDate && closingDate <= new Date()) &&
      !closingAlreadySaved &&
      closingYear >= 2000 &&
      closingSummary.saldoKasSebelumPembagian >= 0 &&
      closingSummary.pembagianLaba <= closingSummary.saldoKasSebelumPembagian &&
      (closingSummary.pembagianLaba === 0 || eligibleDistributionEmployees.length > 0),
  );

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
        nominal: estimateSalaryForRange(karyawan.gaji_pokok ?? 0, karyawan.tipe_penggajian ?? "bulanan", reportDateRange),
      }))
      .filter((row) => row.nominal > 0),
  );

  let cashflowChartRows = $derived.by(() => {
    const map = new Map<string, { label: string; pemasukan: number; pengeluaran: number }>();
    for (const line of overviewLines.filter((item) => isCashMovementAfterCutover(item.tanggal))) {
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
    for (const line of reportLines.filter((item) => item.source === "manual" && item.tipe === "pengeluaran" && !item.isInventoryPurchase && !item.isAssetPurchase && !item.isEquityDistribution)) {
      map.set(line.kategori, (map.get(line.kategori) ?? 0) + line.nominal);
    }
    if (summary.totalBebanGaji > 0) {
      map.set("Gaji Karyawan Reguler", (map.get("Gaji Karyawan Reguler") ?? 0) + summary.totalBebanGaji);
    }
    if (summary.penyusutanAset > 0) {
      map.set("Penyusutan Aset", (map.get("Penyusutan Aset") ?? 0) + summary.penyusutanAset);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  });

  $effect(() => {
    cashflowChartRows;
    cashflowCanvas;
    if (!cashflowCanvas) return;
    cashflowChart?.destroy();
    cashflowChart = new Chart(cashflowCanvas, {
      type: "bar",
      data: {
        labels: cashflowChartRows.map((row) => row.label),
        datasets: [
          { label: "Masuk", data: cashflowChartRows.map((row) => row.pemasukan), backgroundColor: "#22c55e", borderRadius: 4 },
          { label: "Keluar", data: cashflowChartRows.map((row) => row.pengeluaran), backgroundColor: "#ef4444", borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom" },
          tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${rupiah(Number(context.raw))}` } },
        },
        scales: { y: { beginAtZero: true, ticks: { callback: (value) => rupiah(Number(value)) } } },
      },
    });
  });

  $effect(() => {
    summary;
    profitLossCanvas;
    if (!profitLossCanvas) return;
    profitLossChart?.destroy();
    profitLossChart = new Chart(profitLossCanvas, {
      type: "bar",
      data: {
        labels: ["Pendapatan", "HPP", "Operasional", "Gaji Reguler", "Penyusutan", "Laba Bersih"],
        datasets: [{
          label: "Nilai",
          data: [summary.penjualan, summary.hpp, summary.pengeluaranOperasional, summary.totalBebanGaji, summary.penyusutanAset, summary.labaBersih],
          backgroundColor: ["#22c55e", "#f97316", "#ef4444", "#3b82f6", "#a855f7", summary.labaBersih >= 0 ? "#111827" : "#b91c1c"],
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (context) => rupiah(Number(context.raw)) } },
        },
        scales: { y: { ticks: { callback: (value) => rupiah(Number(value)) } } },
      },
    });
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

  function saldoKasPembukaUntukRange(range: DateRange): number {
    if (!range) return saldoAwal?.saldo_kas ?? 0;

    const startDay = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate()).getTime();
    const previousClose = tutupBukuList
      .map((book) => ({ book, tanggal: toDate(book.tanggal_tutup) }))
      .filter(({ tanggal }) => {
        if (!tanggal) return false;
        const closeDay = new Date(tanggal.getFullYear(), tanggal.getMonth(), tanggal.getDate()).getTime();
        return closeDay < startDay;
      })
      .sort((a, b) => (b.tanggal?.getTime() ?? 0) - (a.tanggal?.getTime() ?? 0))[0];

    if (previousClose) {
      return previousClose.book.saldo_awal_tahun_berikutnya?.saldo_kas ?? previousClose.book.saldo_kas_akhir ?? 0;
    }

    const cutover = saldoAwal?.tanggal ? toDate(saldoAwal.tanggal) : null;
    const endDay = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate()).getTime();
    if (saldoAwal && cutover) {
      const cutoverDay = new Date(cutover.getFullYear(), cutover.getMonth(), cutover.getDate()).getTime();
      if (cutoverDay <= endDay) return saldoAwal.saldo_kas;
    }
    return 0;
  }

  function isCashMovementAfterCutover(date: Date | null): boolean {
    const cutover = saldoAwal?.tanggal ? toDate(saldoAwal.tanggal) : null;
    if (!cutover || !date) return !cutover;
    const cutoverDay = new Date(cutover.getFullYear(), cutover.getMonth(), cutover.getDate()).getTime();
    const movementDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    return movementDay >= cutoverDay;
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
    fKategori = tipe === "pemasukan" ? "lainnya" : "operasional";
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
    aMasaManfaat = String(DEFAULT_MASA_MANFAAT_BULAN.komputer);
    aNilaiResidu = "0";
    aTanggalMulaiPenyusutan = new Date().toISOString().slice(0, 10);
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
    aMasaManfaat = String(aset.masa_manfaat_bulan ?? DEFAULT_MASA_MANFAAT_BULAN[aset.kategori] ?? DEFAULT_MASA_MANFAAT_BULAN.lainnya);
    aNilaiResidu = String(aset.nilai_residu ?? 0);
    aTanggalMulaiPenyusutan = toDate(aset.tanggal_mulai_penyusutan)?.toISOString().slice(0, 10) ?? aTanggal;
    aLokasi = aset.lokasi ?? "";
    aSupplier = aset.supplier ?? "";
    aMetode = aset.metode_pembayaran ?? "transfer";
    aInvoice = aset.nomor_invoice ?? "";
    aKondisi = aset.kondisi;
    aCatatan = aset.catatan ?? "";
    aCatatPengeluaran = false;
    openAsetForm = true;
  }

  function resetSaldoAwalForm() {
    sTanggal = saldoAwal?.tanggal
      ? toDate(saldoAwal.tanggal)?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    sSaldoKas = saldoAwal ? String(saldoAwal.saldo_kas) : "";
    sModalAwal = saldoAwal ? String(saldoAwal.modal_awal) : "0";
    sCatatan = saldoAwal?.catatan ?? "";
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
      const [keluar, models, transaksi, gaji, aset, stokJadi, stokKain, stokHijab, karyawan, saldo, tutupBuku] = await Promise.all([
        getRiwayatBarangKeluarByPeriod(null),
        getModelBajuList(false),
        getTransaksiKeuangan(null),
        getPembayaranGajiPeriode(null),
        getAsetPerusahaan(),
        getStokBarangJadi(),
        stokKainCache.get(),
        getStokHijabList(),
        getKaryawanList(),
        getSaldoAwalKeuangan(),
        getTutupBukuTahunanList(),
      ]);
      barangKeluar = keluar;
      modelList = models;
      transaksiManual = transaksi;
      pembayaranGaji = gaji;
      asetList = aset;
      stokBarangJadi = stokJadi;
      stokKainList = stokKain;
      stokHijabList = stokHijab;
      karyawanList = karyawan;
      saldoAwal = saldo;
      tutupBukuList = tutupBuku;
      if (saldo && sSaldoKas === "") resetSaldoAwalForm();
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
        metode_penyusutan: "garis_lurus" as const,
        masa_manfaat_bulan: Number(aMasaManfaat),
        nilai_residu: Number(aNilaiResidu),
        tanggal_mulai_penyusutan: new Date(`${aTanggalMulaiPenyusutan}T00:00:00`),
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

  async function submitSaldoAwal() {
    if (!canSubmitSaldoAwal || !$currentUser) return;
    saving = true;
    errorMsg = null;
    try {
      await saveSaldoAwalKeuangan(
        {
          tanggal: new Date(`${sTanggal}T00:00:00`),
          saldo_kas: Number(sSaldoKas),
          modal_awal: Number(sModalAwal),
          catatan: sCatatan,
          dibuat_oleh_uid: $currentUser.uid,
          dibuat_oleh_nama: $currentUser.name || $currentUser.email,
        },
        saldoAwal?.id,
      );
      showSuccess("Saldo awal migrasi disimpan.");
      await load();
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : "Gagal menyimpan saldo awal.";
    } finally {
      saving = false;
    }
  }

  async function submitTutupBuku() {
    if (!canSubmitTutupBuku || !$currentUser || !closingDate || !closingRange) return;
    saving = true;
    closeError = null;
    errorMsg = null;
    try {
      await catatTutupBukuTahunan({
        tahun: closingYear,
        tanggal_tutup: closingDate,
        saldo_kas_sebelum_pembagian: closingSummary.saldoKasSebelumPembagian,
        pembagian_laba: closingSummary.pembagianLaba,
        saldo_kas_akhir: closingSummary.saldoKasAkhir,
        penjualan: closingSummary.penjualan,
        hpp: closingSummary.hpp,
        beban_operasional: closingSummary.bebanOperasional,
        laba_bersih: closingSummary.labaBersih,
        nilai_persediaan_barang_jadi: snapshotNilaiPersediaan.barangJadi,
        nilai_persediaan_kain: snapshotNilaiPersediaan.kain,
        nilai_persediaan_hijab: snapshotNilaiPersediaan.hijab,
        nilai_persediaan_total: snapshotNilaiPersediaan.barangJadi + snapshotNilaiPersediaan.kain + snapshotNilaiPersediaan.hijab,
        snapshot_persediaan: snapshotPersediaan,
        pembagian_karyawan: pembagianKaryawan,
        saldo_awal_tahun_berikutnya: {
          tahun: closingYear + 1,
          saldo_kas: closingSummary.saldoKasAkhir,
          nilai_persediaan: snapshotNilaiPersediaan.barangJadi + snapshotNilaiPersediaan.kain + snapshotNilaiPersediaan.hijab,
          modal_awal: closingSummary.modalAkhir,
        },
        catatan: cCatatan,
        dibuat_oleh_uid: $currentUser.uid,
        dibuat_oleh_nama: $currentUser.name || $currentUser.email,
      });
      showSuccess(`Tutup buku tahun ${closingYear} berhasil disimpan.`);
      cPembagianLaba = "0";
      cCatatan = "";
      await load();
    } catch (error) {
      closeError = error instanceof Error ? error.message : "Gagal menyimpan tutup buku.";
    } finally {
      saving = false;
    }
  }

  async function hapusSaldoAwal() {
    if (!saldoAwal || !confirm("Hapus saldo awal migrasi? Ringkasan kas akan kembali menghitung dari transaksi yang tercatat.")) return;
    saving = true;
    errorMsg = null;
    try {
      await deleteSaldoAwalKeuangan(saldoAwal.id);
      saldoAwal = null;
      resetSaldoAwalForm();
      showSuccess("Saldo awal dihapus.");
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : "Gagal menghapus saldo awal.";
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
          ["Biaya admin marketplace (sudah dipotong)", rupiah(summary.biayaAdmin)],
          ["HPP / biaya produksi barang", rupiah(summary.hpp)],
          ["Laba kotor", rupiah(summary.labaKotor)],
          ["Pemasukan lain", rupiah(summary.pemasukanManual)],
          ["Pemasukan kas non-pendapatan", rupiah(summary.pemasukanKasNonPendapatan)],
          ["Pengeluaran operasional", rupiah(summary.pengeluaranOperasional)],
          ["Pembelian bahan baku (persediaan)", rupiah(summary.pembelianPersediaan)],
          ["Gaji produksi (sudah termasuk HPP)", rupiah(summary.gajiProduksiTerbayar)],
          ["Gaji karyawan reguler", rupiah(summary.totalBebanGaji)],
          ["Penyusutan aset (non-kas)", rupiah(summary.penyusutanAset)],
          ["Pembelian aset (arus kas, bukan beban laba rugi)", rupiah(summary.pembelianAsetKas)],
          ["Saldo awal kas (migrasi, bukan pendapatan)", rupiah(summary.saldoAwalKas)],
          ["Kas tercatat", rupiah(summary.kasTercatat)],
          ["Laba bersih", rupiah(summary.labaBersih)],
          ["Total aset perusahaan", rupiah(summary.totalAset)],
          ["Nilai stok gudang (harga produksi)", rupiah(summary.gudangProduksi)],
        ],
      });
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 8,
        head: [["Tanggal", "Tipe", "Kategori", "Deskripsi", "Bruto", "Admin", "Kas masuk bersih", "HPP", "Laba Kotor"]],
        body: filteredLines.map((line) => [
          formatDate(line.tanggal),
          line.tipe === "pemasukan" ? "Pemasukan" : "Pengeluaran",
          line.kategori,
          line.deskripsi,
          line.nilaiBruto != null ? rupiah(line.nilaiBruto) : "-",
          line.biayaAdmin != null ? rupiah(line.biayaAdmin) : "-",
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
    const key = rangeKey(reportDateRange);
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
      {#if pageMode === "ringkasan"}
        <PeriodSelector bind:dateRange={overviewDateRange} defaultPeriod="semua" />
      {/if}
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
    <div class="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <section class="rounded-xl border border-gray-900 bg-gray-950 p-5 text-white shadow-sm sm:col-span-2 xl:col-span-2">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm text-gray-300">Laba bersih estimasi</p>
            <p class="mt-3 text-3xl font-bold {overviewSummary.labaBersih < 0 ? 'text-red-300' : 'text-white'}">
              {rupiah(overviewSummary.labaBersih)}
            </p>
          </div>
          <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
            <WalletIcon class="h-5 w-5" />
          </div>
        </div>
        <div class="mt-5 grid grid-cols-3 gap-2 text-xs">
          <div class="rounded-lg bg-white/10 px-3 py-2">
            <p class="text-gray-400">Penjualan</p>
            <p class="mt-1 font-semibold text-green-300">{rupiah(overviewSummary.penjualan)}</p>
          </div>
          <div class="rounded-lg bg-white/10 px-3 py-2">
            <p class="text-gray-400">HPP</p>
            <p class="mt-1 font-semibold text-orange-300">{rupiah(overviewSummary.hpp)}</p>
          </div>
          <div class="rounded-lg bg-white/10 px-3 py-2">
            <p class="text-gray-400">Beban</p>
            <p class="mt-1 font-semibold text-red-300">{rupiah(overviewSummary.pengeluaran)}</p>
          </div>
        </div>
      </section>

      <StatCard
        title="Penjualan"
        value={rupiah(overviewSummary.penjualan)}
        icon={TrendingUpIcon}
        {loading}
        footerSubtext={`${overviewLines.filter((line) => line.source === "penjualan").length} transaksi penjualan`}
        class="border-green-100 bg-green-50"
        valueClass="text-green-700"
      />
      <StatCard
        title="HPP"
        value={rupiah(overviewSummary.hpp)}
        icon={BoxesIcon}
        {loading}
        footerSubtext="biaya produksi barang terjual"
        class="border-orange-100 bg-orange-50"
        valueClass="text-orange-700"
      />
      <StatCard
        title="Laba Kotor"
        value={rupiah(overviewSummary.labaKotor)}
        icon={TrendingUpIcon}
        {loading}
        footerSubtext="penjualan - HPP"
        valueClass={overviewSummary.labaKotor < 0 ? "text-red-600" : "text-gray-900"}
      />
      <StatCard
        title="Beban Operasional"
        value={rupiah(overviewSummary.pengeluaran)}
        icon={TrendingDownIcon}
        {loading}
        footerSubtext="beban yang mengurangi laba"
        class="border-red-100 bg-red-50"
        valueClass="text-red-700"
      />
      <StatCard
        title="Gaji Reguler"
        value={rupiah(overviewSummary.gajiReguler)}
        icon={ReceiptIcon}
        {loading}
        footerSubtext="gaji terbayar pada periode"
        class="border-blue-100 bg-blue-50"
        valueClass="text-blue-700"
      />
      <StatCard
        title="Saldo Kas Akhir"
        value={rupiah(overviewSummary.kasTercatat)}
        icon={BanknoteIcon}
        {loading}
        footerSubtext="saldo awal + arus kas periode"
        class={overviewSummary.kasTercatat < 0 ? "border-red-100 bg-red-50" : "border-blue-100 bg-blue-50"}
        valueClass={overviewSummary.kasTercatat < 0 ? "text-red-600" : "text-blue-700"}
      />
      <StatCard
        title="Margin Kotor"
        value={`${overviewSummary.marginKotor}%`}
        icon={ReceiptIcon}
        {loading}
        footerSubtext={rupiah(overviewSummary.labaKotor)}
        valueClass={overviewSummary.labaKotor < 0 ? "text-red-600" : "text-gray-900"}
      />
    </div>
  {:else if pageMode === "pengeluaran"}
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
        value={rupiah(summary.pembelianAsetKas)}
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
          <div class="mt-5 h-72 rounded-lg border border-gray-100 bg-gray-50 p-4">
            <canvas bind:this={cashflowCanvas} aria-label="Chart arus kas"></canvas>
          </div>
        {/if}
      </section>

      <section class="h-fit rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-800">Komposisi Nilai</h2>
        <div class="mt-5 space-y-4">
          {#each [["Kas", summary.kasTercatat, "bg-blue-500"], ["Aset", summary.totalAset, "bg-violet-500"], ["Barang jadi", summary.gudangProduksi, "bg-teal-500"], ["Kain", summary.gudangKain, "bg-cyan-500"]] as item}
            {@const totalKomposisi = Math.max(1, Math.abs(summary.kasTercatat) + summary.totalAset + summary.gudangProduksi + summary.gudangKain)}
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
        <PeriodSelector bind:dateRange={reportDateRange} defaultPeriod="semua" />
      </div>
      <div class="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-100">
        <div class="flex items-center justify-between px-4 py-3">
          <span class="text-sm text-gray-500">Pendapatan penjualan</span>
          <span class="font-semibold text-gray-900">{rupiah(summary.penjualan)}</span>
        </div>
        <div class="flex items-center justify-between bg-orange-50 px-4 py-3">
          <span class="text-sm text-orange-800">Biaya admin marketplace <span class="text-xs text-orange-600">(sudah dipotong dari penjualan)</span></span>
          <span class="font-semibold text-orange-700">{rupiah(summary.biayaAdmin)}</span>
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
          <span class="text-sm text-gray-500">Estimasi gaji reguler</span>
          <span class="font-semibold text-red-700">({rupiah(summary.gajiRegulerEstimasi)})</span>
        </div>
        <div class="flex items-center justify-between px-4 py-3">
          <span class="text-sm text-gray-500">Penyusutan aset</span>
          <span class="font-semibold text-violet-700">({rupiah(summary.penyusutanAset)})</span>
        </div>
        <div class="flex items-center justify-between bg-gray-900 px-4 py-3 text-white">
          <span class="text-sm font-semibold">Laba bersih estimasi</span>
          <span class="font-bold">{rupiah(summary.labaBersih)}</span>
        </div>
      </div>
      <div class="mt-5 border-t border-gray-100 pt-4">
        <h3 class="text-sm font-semibold text-gray-800">Grafik Laba Rugi</h3>
        <p class="mt-0.5 text-xs text-gray-400">Perbandingan pendapatan, HPP, beban, dan laba bersih pada periode terpilih.</p>
        <div class="mt-3 h-72 rounded-lg bg-gray-50 p-3">
          <canvas bind:this={profitLossCanvas} aria-label="Chart laporan laba rugi"></canvas>
        </div>
      </div>
      <p class="mt-3 text-xs text-gray-500">Pembelian bahan baku, pembayaran gaji produksi, dan pembelian aset hanya memengaruhi kas. Bahan baku serta gaji produksi masuk HPP saat produk terjual; aset masuk beban melalui penyusutan.</p>
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
          <PeriodSelector bind:dateRange={reportDateRange} defaultPeriod="semua" />
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
            <p class="text-xs text-gray-500">Total Kas Masuk</p>
            <p class="mt-2 text-xl font-bold text-gray-900">{rupiah(summary.kasMasuk)}</p>
            <p class="mt-1 text-[11px] text-gray-400">termasuk modal, piutang, dan refund</p>
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
            <p class="mt-0.5 text-xs text-gray-400">Beban operasional, gaji reguler, dan pembelian aset perusahaan.</p>
          </div>
          <PeriodSelector bind:dateRange={reportDateRange} defaultPeriod="semua" />
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
            <p class="mt-2 text-lg font-bold text-violet-800">{rupiah(summary.pembelianAsetKas)}</p>
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
          {#each [["transaksi", "Transaksi"], ["saldo_awal", "Saldo Awal"], ["aset", "Aset"], ["gudang", "Tabungan Gudang"], ["tutup_buku", "Tutup Buku"]] as panel}
            <Button
              size="sm"
              variant={activePanel === panel[0] ? "default" : "outline"}
              onclick={() => (activePanel = panel[0] as typeof activePanel)}
              class="gap-2"
            >
              {#if panel[0] === "transaksi"}
                <ReceiptIcon class="h-4 w-4" />
              {:else if panel[0] === "saldo_awal"}
                <BanknoteIcon class="h-4 w-4" />
              {:else if panel[0] === "aset"}
                <LandmarkIcon class="h-4 w-4" />
              {:else}
                <BoxesIcon class="h-4 w-4" />
              {/if}
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
    {#if pageMode === "ringkasan"}
      <div class="border-b border-gray-100 px-4 pt-4">
        <h2 class="text-sm font-semibold text-gray-800">Transaksi Terbaru</h2>
        <p class="mt-0.5 text-xs text-gray-400">Pendapatan dan pengeluaran terbaru dengan pagination.</p>
      </div>
    {/if}
    <div class="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4">
      <div class="min-w-[220px] flex-1">
        <Input placeholder="Cari transaksi, kategori, referensi..." bind:value={searchQuery} />
      </div>
      <PeriodSelector bind:dateRange={transactionDateRange} defaultPeriod="hari_ini" />
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
          {#each paginatedLines as line}
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
                    <p class="text-xs text-gray-400">Kanal {line.kanal ?? line.deskripsi} · bruto {rupiah(line.nilaiBruto ?? line.nominal)} · admin {rupiah(line.biayaAdmin ?? 0)} · kas masuk bersih {rupiah(line.nominal)}</p>
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
                    {#if line.isLocked}
                      <span class="text-xs text-gray-400">Terkunci oleh tutup buku</span>
                    {:else}
                      <div class="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label="Edit transaksi" onclick={() => openEdit(trx)}>
                          <PencilIcon class="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Hapus transaksi" class="text-red-600 hover:text-red-700" onclick={() => hapusTransaksi(trx)}>
                          <Trash2Icon class="h-4 w-4" />
                        </Button>
                      </div>
                    {/if}
                  {/if}
                {:else}
                  <span class="text-xs text-gray-300">Auto</span>
                {/if}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-sm text-gray-500">
        <span>Menampilkan {Math.min((transactionPage - 1) * transactionPageSize + 1, filteredLines.length)}-{Math.min(transactionPage * transactionPageSize, filteredLines.length)} dari {filteredLines.length} transaksi</span>
        <div class="flex items-center gap-2">
          <button class="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 px-2.5 text-xs font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Halaman sebelumnya" onclick={() => (transactionPage -= 1)} disabled={transactionPage <= 1}><ChevronLeftIcon class="h-4 w-4" /> Sebelumnya</button>
          <span class="min-w-20 text-center text-xs font-medium text-gray-700">Halaman {transactionPage} / {transactionTotalPages}</span>
          <button class="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 px-2.5 text-xs font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Halaman berikutnya" onclick={() => (transactionPage += 1)} disabled={transactionPage >= transactionTotalPages}>Berikutnya <ChevronRightIcon class="h-4 w-4" /></button>
        </div>
      </div>
    {/if}
  </section>
  {:else if activePanel === "saldo_awal"}
    <section class="rounded-xl border border-gray-100 bg-white shadow-sm">
      <div class="border-b border-gray-100 p-4">
        <h2 class="text-sm font-semibold text-gray-800">Saldo Awal Migrasi</h2>
        <p class="mt-0.5 text-xs text-gray-400">Masukkan posisi kas pada tanggal mulai memakai sistem. Simpan sekali untuk cut-over pertama.</p>
      </div>
      <div class="p-5">
        <div class="grid gap-4 md:grid-cols-3">
          <div>
            <label for="saldo-awal-tanggal" class="mb-1.5 block text-xs font-medium text-gray-600">Tanggal cut-over</label>
            <Input id="saldo-awal-tanggal" type="date" bind:value={sTanggal} />
          </div>
          <div>
            <label for="saldo-awal-kas" class="mb-1.5 block text-xs font-medium text-gray-600">Saldo kas dan bank</label>
            <Input id="saldo-awal-kas" type="number" min="0" bind:value={sSaldoKas} placeholder="0" />
          </div>
          <div>
            <label for="saldo-awal-modal" class="mb-1.5 block text-xs font-medium text-gray-600">Modal awal / penyeimbang</label>
            <Input id="saldo-awal-modal" type="number" min="0" bind:value={sModalAwal} placeholder="0" />
            <p class="mt-1 text-[11px] text-gray-400">Referensi ekuitas. Isi 0 bila belum dihitung.</p>
          </div>
        </div>
        <div class="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-800">
          Isi hanya kas dan bank yang benar-benar tersisa. Stok awal dicatat dari menu stok dan tetap menjadi persediaan, bukan kas. Saldo awal bukan pendapatan, beban, transaksi baru, atau bagian chart arus kas. Setelah tahun pertama selesai, gunakan panel Tutup Buku dan jangan mengganti saldo migrasi.
        </div>
        <div class="mt-4">
          <label for="saldo-awal-catatan" class="mb-1.5 block text-xs font-medium text-gray-600">Catatan migrasi</label>
          <textarea id="saldo-awal-catatan" bind:value={sCatatan} rows="3" class="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-gray-400" placeholder="Contoh: saldo kas hasil opname per 31 Desember 2025"></textarea>
        </div>
        <div class="mt-5 flex flex-wrap justify-end gap-2">
          {#if saldoAwal}
            <Button variant="outline" onclick={hapusSaldoAwal} disabled={saving}>
              <Trash2Icon class="h-4 w-4" />
              Hapus saldo awal
            </Button>
          {/if}
          <Button onclick={submitSaldoAwal} disabled={saving || !canSubmitSaldoAwal}>
            <BanknoteIcon class="h-4 w-4" />
            {saving ? "Menyimpan..." : saldoAwal ? "Perbarui Saldo Awal" : "Simpan Saldo Awal"}
          </Button>
        </div>
      </div>
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
              <Table.Head class="w-[14%] text-right">Nilai Buku Saat Ini</Table.Head>
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
                  {rupiah(hitungNilaiBukuAset(aset))}
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
  {:else if activePanel === "tutup_buku"}
    <section class="rounded-xl border border-gray-100 bg-white shadow-sm">
      <div class="border-b border-gray-100 p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-gray-800">Tutup Buku Tahunan</h2>
            <p class="mt-0.5 text-xs text-gray-400">Kunci hasil satu tahun dan siapkan saldo pembuka tahun berikutnya.</p>
          </div>
          <span class="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Owner / Developer</span>
        </div>
      </div>

      <div class="space-y-5 p-5">
        {#if !canCloseBooks}
          <div class="rounded-lg border border-yellow-100 bg-yellow-50 px-4 py-3 text-xs leading-relaxed text-yellow-800">
            Anda dapat melihat riwayat tutup buku, tetapi hanya Owner atau Developer yang dapat menyimpan penutupan periode.
          </div>
        {/if}

        <div class="grid gap-4 md:grid-cols-3">
          <div>
            <label for="tutup-buku-tanggal" class="mb-1.5 block text-xs font-medium text-gray-600">Tanggal tutup</label>
            <Input id="tutup-buku-tanggal" type="date" bind:value={cTanggalTutup} max={new Date().toISOString().slice(0, 10)} disabled={!canCloseBooks || closingAlreadySaved} />
            <p class="mt-1 text-[11px] text-gray-400">Periode dihitung dari 1 Januari sampai tanggal ini.</p>
          </div>
          <div>
            <label for="tutup-buku-pembagian" class="mb-1.5 block text-xs font-medium text-gray-600">Total pembagian laba</label>
            <Input id="tutup-buku-pembagian" type="number" min="0" bind:value={cPembagianLaba} placeholder="0" disabled={!canCloseBooks || closingAlreadySaved} />
            <p class="mt-1 text-[11px] text-gray-400">Dibagi rata kepada karyawan aktif non-owner.</p>
          </div>
          <div class="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
            <p class="text-[11px] text-blue-700">Saldo pembuka</p>
            <p class="mt-1 text-sm font-semibold text-blue-900">{rupiah(closingOpening.saldoKas)}</p>
            <p class="mt-0.5 text-[11px] text-blue-700">{closingOpening.sumber}</p>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p class="text-[11px] text-gray-400">Laba bersih</p>
            <p class="mt-1 font-semibold {closingSummary.labaBersih < 0 ? 'text-red-700' : 'text-gray-900'}">{rupiah(closingSummary.labaBersih)}</p>
          </div>
          <div class="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p class="text-[11px] text-gray-400">Kas sebelum pembagian</p>
            <p class="mt-1 font-semibold {closingSummary.saldoKasSebelumPembagian < 0 ? 'text-red-700' : 'text-gray-900'}">{rupiah(closingSummary.saldoKasSebelumPembagian)}</p>
          </div>
          <div class="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p class="text-[11px] text-gray-400">Persediaan akhir</p>
            <p class="mt-1 font-semibold text-teal-700">{rupiah(snapshotNilaiPersediaan.barangJadi + snapshotNilaiPersediaan.kain + snapshotNilaiPersediaan.hijab)}</p>
            <p class="mt-0.5 text-[11px] text-gray-400">Baju, kain, dan hijab</p>
          </div>
          <div class="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p class="text-[11px] text-gray-400">Kas tahun berikutnya</p>
            <p class="mt-1 font-semibold {closingSummary.saldoKasAkhir < 0 ? 'text-red-700' : 'text-blue-700'}">{rupiah(closingSummary.saldoKasAkhir)}</p>
          </div>
        </div>

        <div class="rounded-lg border border-gray-100 px-4 py-3 text-xs leading-relaxed text-gray-500">
          Stok tidak dikurangi atau dipindahkan saat tutup buku. Sistem hanya menyimpan snapshot nilai persediaan dan membawa kas, persediaan, serta estimasi ekuitas ke tahun berikutnya.
        </div>

        {#if closingSummary.pembagianLaba > 0}
          <div class="rounded-lg border border-gray-100">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
              <div>
                <p class="text-xs font-semibold text-gray-800">Rincian pembagian</p>
                <p class="mt-0.5 text-[11px] text-gray-400">{eligibleDistributionEmployees.length} karyawan aktif · dibulatkan dengan sisa ke urutan pertama</p>
              </div>
              <span class="text-sm font-semibold text-red-700">{rupiah(closingSummary.pembagianLaba)}</span>
            </div>
            {#if pembagianKaryawan.length > 0}
              <div class="grid gap-x-5 gap-y-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {#each pembagianKaryawan as bagian}
                  <div class="flex items-center justify-between gap-3 text-xs">
                    <span class="truncate text-gray-600">{bagian.nama}</span>
                    <span class="shrink-0 font-semibold text-gray-900">{rupiah(bagian.nominal)}</span>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="p-4 text-xs text-red-700">Belum ada karyawan aktif non-owner untuk menerima pembagian.</p>
            {/if}
          </div>
        {/if}

        {#if closingAlreadySaved}
          <div class="rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-xs leading-relaxed text-green-800">
            Tahun {closingYear} sudah ditutup. Pilih tanggal pada tahun lain untuk membuat tutup buku baru.
          </div>
        {:else if closingDate && closingDate > new Date()}
          <div class="rounded-lg border border-yellow-100 bg-yellow-50 px-4 py-3 text-xs leading-relaxed text-yellow-800">
            Tanggal tutup tidak boleh melewati hari ini.
          </div>
        {:else if closingSummary.saldoKasSebelumPembagian < 0}
          <div class="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-800">
            Kas hasil perhitungan periode ini negatif. Rekonsiliasi saldo awal dan transaksi sebelum menutup buku.
          </div>
        {:else if closingSummary.pembagianLaba > closingSummary.saldoKasSebelumPembagian}
          <div class="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-800">
            Pembagian laba tidak boleh lebih besar dari kas yang tersedia.
          </div>
        {/if}

        {#if closeError}
          <div class="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-800">{closeError}</div>
        {/if}

        <div>
          <label for="tutup-buku-catatan" class="mb-1.5 block text-xs font-medium text-gray-600">Catatan tutup buku</label>
          <textarea id="tutup-buku-catatan" rows="3" bind:value={cCatatan} disabled={!canCloseBooks || closingAlreadySaved} placeholder="Contoh: Opname 31 Desember dan pembagian laba tahun berjalan..." class="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-gray-400 disabled:cursor-not-allowed disabled:bg-gray-50"></textarea>
        </div>

        <div class="flex justify-end">
          <Button onclick={submitTutupBuku} disabled={saving || !canSubmitTutupBuku}>
            <BanknoteIcon class="h-4 w-4" />
            {saving ? "Menyimpan..." : `Tutup Buku ${closingYear}`}
          </Button>
        </div>

        <div class="border-t border-gray-100 pt-5">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-semibold text-gray-800">Riwayat tutup buku</h3>
              <p class="mt-0.5 text-xs text-gray-400">Setiap tahun disimpan sebagai snapshot terpisah.</p>
            </div>
            <span class="text-xs text-gray-400">{tutupBukuList.length} tahun</span>
          </div>
          {#if tutupBukuList.length === 0}
            <div class="rounded-lg border border-dashed border-gray-200 py-10 text-center text-xs text-gray-400">Belum ada tahun yang ditutup.</div>
          {:else}
            <div class="overflow-x-auto rounded-lg border border-gray-100">
              <Table.Root class="min-w-[760px]">
                <Table.Header>
                  <Table.Row class="bg-gray-50 hover:bg-gray-50">
                    <Table.Head>Tahun</Table.Head>
                    <Table.Head class="text-right">Laba bersih</Table.Head>
                    <Table.Head class="text-right">Pembagian</Table.Head>
                    <Table.Head class="text-right">Persediaan</Table.Head>
                    <Table.Head class="text-right">Kas tahun berikutnya</Table.Head>
                    <Table.Head>Karyawan</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each tutupBukuList as book}
                    <Table.Row>
                      <Table.Cell>
                        <p class="font-medium text-gray-900">{book.tahun}</p>
                        <p class="text-[11px] text-gray-400">{formatDate(toDate(book.tanggal_tutup))}</p>
                      </Table.Cell>
                      <Table.Cell class="text-right font-semibold {book.laba_bersih < 0 ? 'text-red-700' : 'text-gray-900'}">{rupiah(book.laba_bersih)}</Table.Cell>
                      <Table.Cell class="text-right text-red-700">{rupiah(book.pembagian_laba)}</Table.Cell>
                      <Table.Cell class="text-right text-teal-700">{rupiah(book.nilai_persediaan_total)}</Table.Cell>
                      <Table.Cell class="text-right text-blue-700">{rupiah(book.saldo_awal_tahun_berikutnya?.saldo_kas ?? book.saldo_kas_akhir)}</Table.Cell>
                      <Table.Cell class="text-sm text-gray-600">{book.pembagian_karyawan?.length ?? 0} orang</Table.Cell>
                    </Table.Row>
                  {/each}
                </Table.Body>
              </Table.Root>
            </div>
          {/if}
        </div>
      </div>
    </section>
  {:else}
    <section class="rounded-xl border border-gray-100 bg-white shadow-sm">
      <div class="flex items-center justify-between border-b border-gray-100 p-4">
        <div>
          <h2 class="text-sm font-semibold text-gray-800">Tabungan Gudang</h2>
          <p class="mt-0.5 text-xs text-gray-400">Nilai utama memakai harga produksi. Nilai jual hanya estimasi potensi omzet.</p>
        </div>
        <div class="flex flex-wrap justify-end gap-5 text-right">
          <div>
            <p class="text-xs text-gray-400">Estimasi nilai produksi</p>
            <p class="font-bold text-teal-700">{rupiah(summary.gudangProduksi)}</p>
          </div>
          <div>
            <p class="text-xs text-gray-400">Estimasi nilai jual</p>
            <p class="font-bold text-gray-900">{rupiah(summary.gudangJual)}</p>
          </div>
          <div>
            <p class="text-xs text-gray-400">Nilai stok kain</p>
            <p class="font-bold text-cyan-700">{rupiah(summary.gudangKain)}</p>
          </div>
          <div>
            <p class="text-xs text-gray-400">Nilai stok hijab</p>
            <p class="font-bold text-violet-700">{rupiah(summary.gudangHijab)}</p>
          </div>
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
              <Table.Head class="w-[16%] text-center">Kelengkapan Harga</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each inventoryRows as row}
              {@const isExpanded = expandedGudangModels.has(row.key)}
              <Table.Row
                class="cursor-pointer transition-colors hover:bg-gray-50"
                role="button"
                tabindex={0}
                onclick={() => toggleGudangModel(row.key)}
                onkeydown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleGudangModel(row.key);
                  }
                }}
              >
                <Table.Cell class="font-medium text-gray-900">
                  <span class="inline-flex items-center gap-2 hover:text-teal-700">
                    <ChevronDownIcon class="h-4 w-4 transition-transform {isExpanded ? 'rotate-180' : ''}" />
                    {row.model}
                  </span>
                  {#if row.linkedModels.length > 0}
                    <div class="ml-6 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-normal text-gray-400">
                      <span>Stok bersama:</span>
                      {#each row.linkedModels as linked}
                        <a
                          href={`/barang-jadi/${linked.id}`}
                          class="text-teal-700 hover:underline"
                          onclick={(event) => event.stopPropagation()}
                        >{linked.name}</a>
                      {/each}
                    </div>
                  {/if}
                </Table.Cell>
                <Table.Cell class="text-right">{row.pcs.toLocaleString("id-ID")} pcs</Table.Cell>
                <Table.Cell class="text-right font-semibold text-teal-700">{rupiah(row.nilaiProduksi)}</Table.Cell>
                <Table.Cell class="text-right text-gray-700">{rupiah(row.nilaiJual)}</Table.Cell>
                <Table.Cell class="text-center">
                  <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold {row.incompletePrice ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}">
                    {row.incompletePrice ? "Belum lengkap" : "Lengkap"}
                  </span>
                </Table.Cell>
              </Table.Row>
              {#if isExpanded}
                <Table.Row class="bg-gray-50/70">
                  <Table.Cell colspan={5} class="p-0">
                    <div class="grid gap-2 px-5 py-3 sm:grid-cols-2 lg:grid-cols-4">
                      {#each row.details as detail}
                        <a href={`/barang-jadi/${row.key}`} class="block rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs transition hover:border-teal-200 hover:bg-teal-50/30" onclick={(event) => event.stopPropagation()}>
                          <div class="flex items-center justify-between font-semibold text-gray-800">
                            <span>{detail.ukuran}</span>
                            <span>{detail.stok.toLocaleString("id-ID")} pcs</span>
                          </div>
                          <p class="mt-1 text-teal-700">Produksi: {rupiah(detail.nilaiProduksi)}</p>
                          <p class="text-gray-600">Jual: {rupiah(detail.nilaiJual)}</p>
                          <p class="mt-1 text-[11px] text-gray-400">{rupiah(detail.hargaProduksi)} produksi/pcs · {rupiah(detail.hargaJual)} jual/pcs</p>
                        </a>
                      {/each}
                    </div>
                  </Table.Cell>
                </Table.Row>
              {/if}
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
              fKategori = fTipe === "pemasukan" ? "lainnya" : "operasional";
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
          <Select.Root type="single" value={aKategori} onValueChange={(value) => { if (!value) return; aKategori = value as KategoriAset; if (!editingAset) aMasaManfaat = String(DEFAULT_MASA_MANFAAT_BULAN[aKategori] ?? DEFAULT_MASA_MANFAAT_BULAN.lainnya); }}>
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
          <label for="nilai-aset" class="block text-sm font-medium text-gray-700">Nilai buku bulan pertama</label>
          <div id="nilai-aset" class="flex h-9 items-center rounded-lg border border-gray-100 bg-gray-50 px-3 text-sm font-semibold text-gray-700">{rupiah(Math.max(0, aTotalHarga - aPenyusutanBulanan))}</div>
          <p class="mt-1 text-[11px] text-gray-400">Estimasi setelah 1 bulan.</p>
        </div>
        <div class="space-y-1.5">
          <label for="masa-manfaat-aset" class="block text-sm font-medium text-gray-700">Masa manfaat (bulan) <span class="text-red-500">*</span></label>
          <Input id="masa-manfaat-aset" type="number" min="1" bind:value={aMasaManfaat} placeholder="48" />
        </div>
        <div class="space-y-1.5">
          <label for="residu-aset" class="block text-sm font-medium text-gray-700">Nilai residu</label>
          <Input id="residu-aset" type="number" min="0" bind:value={aNilaiResidu} placeholder="0" />
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <div class="space-y-1.5">
          <label for="mulai-penyusutan-aset" class="block text-sm font-medium text-gray-700">Mulai penyusutan <span class="text-red-500">*</span></label>
          <input id="mulai-penyusutan-aset" type="date" bind:value={aTanggalMulaiPenyusutan} class="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          <p class="mt-1 text-[11px] text-gray-400">Biasanya saat aset siap dipakai.</p>
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

      <div class="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        Penyusutan garis lurus: {rupiah(aPenyusutanBulanan)} per bulan. Tidak mengurangi kas lagi; hanya dicatat sebagai beban sesuai masa manfaat aset.
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
