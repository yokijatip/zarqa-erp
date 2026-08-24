<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import {
    getStokByModel,
    tambahStokBarangJadi,
    kurangiStokManual,
    setStokManual,
    getRiwayatKeluarByModel,
    getRiwayatBarangJadiByModel,
  } from "$lib/firebase/barang-jadi";
  import { getRiwayatBatch, getBatchById } from "$lib/firebase/batch-produksi";
  import { currentUser } from "$lib/stores/auth.store";
  import {
    UKURAN_ORDER,
    type StokBarangJadi,
    type UkuranBaju,
    type BarangKeluar,
    type BarangKeluarItem,
    type RiwayatBarangJadi,
    type SumberCutting,
  } from "$lib/types";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import RejectResolveDialog from "$lib/components/reject-resolve-dialog.svelte";
  import StatCard from "$lib/components/StatCard.svelte";
  import PackageCheckIcon from "@lucide/svelte/icons/package-check";
  import PackagePlusIcon from "@lucide/svelte/icons/package-plus";
  import PackageMinusIcon from "@lucide/svelte/icons/package-minus";
  import RulerIcon from "@lucide/svelte/icons/ruler";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";

  const KRITIS_THRESHOLD = 5;
  const LOW_THRESHOLD = 15;

  // ── State ─────────────────────────────────────────────────────────
  let stokList = $state<StokBarangJadi[]>([]);
  let riwayatKeluar = $state<BarangKeluar[]>([]);
  let riwayatMasuk = $state<RiwayatBarangJadi[]>([]);

  // Filter tanggal untuk Riwayat Masuk (dari — sampai), kosong = tampilkan semua
  let filterDari = $state("");
  let filterSampai = $state("");

  // Cache detail batch (nama tukang cutting + timeline lengkap) per batch_id, di-fetch lazy saat card di-expand
  type BatchTimelineEntry = {
    status_ke: string;
    timestamp: any;
    updated_by_nama: string;
    pcs_berhasil: number;
    pcs_reject: number;
    catatan?: string;
    dariSumberLain?: boolean; // true kalau entry ini ditarik dari batch cutting asal (dari_potongan)
  };
  type BatchDetail = {
    cuttingNama: string | null;
    timeline: BatchTimelineEntry[];
  };
  let batchDetailCache = $state<Record<string, BatchDetail>>({});
  let batchWarnaCache = $state<Record<string, { nama_warna?: string; kode_hex_warna?: string } | null>>({});
  let loadingBatchId = $state<string | null>(null);
  let expandedBatchId = $state<string | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);

  type DialogMode = "restock" | "kurangi" | "edit";
  let openDialog = $state(false);
  let dialogMode = $state<DialogMode>("restock");
  let selectedItem = $state<StokBarangJadi | null>(null);
let fJumlah = $state(0);

  // Selected color from URL query param
  let selectedColor = $state<string | null>(null);

  // ── Derived ───────────────────────────────────────────────────────
  let allColors = $derived.by(() => {
    const map = new Map<string, { nama_warna?: string; kode_hex_warna?: string }>();
    for (const item of stokList) {
      const key = item.nama_warna ?? '';
      if (!map.has(key)) {
        map.set(key, { nama_warna: item.nama_warna, kode_hex_warna: item.kode_hex_warna });
      }
    }
    return [...map.entries()].map(([key, val]) => ({ key, ...val }));
  });

  let filteredItems = $derived.by(() => {
    if (selectedColor) {
      const items = stokList.filter((i) => (i.nama_warna ?? '') === selectedColor);
      items.sort(
        (a, b) =>
          UKURAN_ORDER.indexOf(a.ukuran as UkuranBaju) -
          UKURAN_ORDER.indexOf(b.ukuran as UkuranBaju),
      );
      return items;
    }

    const map = new Map<string, StokBarangJadi>();
    for (const item of stokList) {
      const existing = map.get(item.ukuran);
      if (!existing) {
        map.set(item.ukuran, {
          ...item,
          id: `all__${item.ukuran}`,
          nama_warna: undefined,
          kode_hex_warna: undefined,
        });
        continue;
      }
      map.set(item.ukuran, {
        ...existing,
        stok_tersedia: existing.stok_tersedia + item.stok_tersedia,
        total_masuk: existing.total_masuk + item.total_masuk,
        total_keluar: existing.total_keluar + item.total_keluar,
        updatedAt:
          tsMillis(item.updatedAt) > tsMillis(existing.updatedAt)
            ? item.updatedAt
            : existing.updatedAt,
      });
    }

    const items = [...map.values()];
    items.sort(
      (a, b) =>
        UKURAN_ORDER.indexOf(a.ukuran as UkuranBaju) -
        UKURAN_ORDER.indexOf(b.ukuran as UkuranBaju),
    );
    return items;
  });

  let sorted = $derived(filteredItems);

  let namaModel = $derived(stokList[0]?.nama_model ?? "");
  let activeColorEntry = $derived.by(() => {
    if (selectedColor) {
      return allColors.find((c) => c.key === selectedColor) ?? allColors[0] ?? null;
    }
    return null;
  });
  let namaWarna = $derived(activeColorEntry?.nama_warna);
  let kodeHexWarna = $derived(activeColorEntry?.kode_hex_warna);
  let totalTersedia = $derived(filteredItems.reduce((s, i) => s + i.stok_tersedia, 0));
  let totalMasuk = $derived(filteredItems.reduce((s, i) => s + i.total_masuk, 0));
  let totalKeluar = $derived(filteredItems.reduce((s, i) => s + i.total_keluar, 0));
  let jumlahKritis = $derived(filteredItems.filter((i) => getStatus(i) === "kritis").length);

  function getStatus(
    item: StokBarangJadi,
  ): "kosong" | "kritis" | "low" | "aman" {
    if (item.stok_tersedia === 0) return "kosong";
    if (item.stok_tersedia <= KRITIS_THRESHOLD) return "kritis";
    if (item.stok_tersedia <= LOW_THRESHOLD) return "low";
    return "aman";
  }

  const STATUS_BADGE: Record<string, string> = {
    kosong: "bg-gray-100 text-gray-500",
    kritis: "bg-red-100 text-red-600",
    low: "bg-amber-100 text-amber-600",
    aman: "bg-teal-100 text-teal-700",
  };
  const STATUS_LABEL: Record<string, string> = {
    kosong: "Habis",
    kritis: "Kritis",
    low: "Menipis",
    aman: "Aman",
  };
  const STATUS_NUM: Record<string, string> = {
    kosong: "text-gray-400",
    kritis: "text-red-600",
    low: "text-amber-600",
    aman: "text-gray-900",
  };
  const STATUS_STYLE: Record<string, { badge: string; label: string; num: string; ukuran: string }> = {
    kosong: { badge: "bg-gray-100 text-gray-500", label: "Habis", num: "text-gray-400", ukuran: "bg-gray-100 text-gray-600" },
    kritis: { badge: "bg-red-100 text-red-600", label: "Kritis", num: "text-red-600", ukuran: "bg-gray-100 text-gray-700" },
    low:    { badge: "bg-amber-100 text-amber-600", label: "Menipis", num: "text-amber-600", ukuran: "bg-gray-100 text-gray-700" },
    aman:   { badge: "bg-teal-100 text-teal-700", label: "Aman", num: "text-gray-900", ukuran: "bg-gray-100 text-gray-700" },
  };

  function itemMatchesCurrentView(item: BarangKeluarItem): boolean {
    const modelId = $page.params.model_id;
    if (item.model_id !== modelId) return false;
    if (selectedColor && (item.nama_warna ?? "") !== selectedColor) return false;
    return true;
  }

  function itemsForCurrentView(r: BarangKeluar): BarangKeluarItem[] {
    if (r.items && r.items.length > 0) {
      return r.items.filter(itemMatchesCurrentView);
    }
    const legacyItem: BarangKeluarItem = {
      model_id: r.model_id,
      nama_model: r.nama_model,
      ...(r.nama_warna ? { nama_warna: r.nama_warna } : {}),
      ...(r.kode_hex_warna ? { kode_hex_warna: r.kode_hex_warna } : {}),
      detail_keluar: r.detail_keluar,
      total_pcs: r.total_pcs,
      status: "keluar",
    };
    return itemMatchesCurrentView(legacyItem) ? [legacyItem] : [];
  }

  let riwayatKeluarTampil = $derived.by(() =>
    riwayatKeluar.filter((r) => itemsForCurrentView(r).length > 0),
  );

  function totalItemPcsByStatus(
    items: BarangKeluarItem[],
    status: BarangKeluarItem["status"],
  ): number {
    return items
      .filter((item) => item.status === status)
      .reduce((sum, item) => sum + item.total_pcs, 0);
  }

  function statusItemLabel(status: BarangKeluarItem["status"]): string {
    return status === "pending" ? "Pending" : "Keluar";
  }

  function statusItemClass(status: BarangKeluarItem["status"]): string {
    return status === "pending"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  const DIALOG_TITLE: Record<DialogMode, string> = {
    restock: "Restock Barang",
    kurangi: "Kurangi Stok",
    edit: "Set Stok Manual",
  };
  const DIALOG_DESC: Record<DialogMode, string> = {
    restock: "Tambah stok dari luar produksi (migrasi, restock manual).",
    kurangi: "Kurangi stok karena loss, kerusakan, atau koreksi.",
    edit: "Set stok ke nilai absolut untuk koreksi fisik.",
  };

  function formatDate(ts: any): string {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatDateTime(ts: any): string {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function showSuccess(msg: string) {
    successMsg = msg;
    setTimeout(() => (successMsg = null), 3500);
  }
  function showError(msg: string) {
    errorMsg = msg;
    setTimeout(() => (errorMsg = null), 4000);
  }

  // ── Reject dialog ────────────────────────────────────────────────
  let rejectDialogOpen = $state(false);
  let rejectDialogBatchId = $state<string | null>(null);
  function openRejectDialog(batchId: string) {
    rejectDialogBatchId = batchId;
    rejectDialogOpen = true;
  }
  async function handleRejectResolved() {
    // Reject yang "diperbaiki" menambah stok_barang_jadi → muat ulang stok & riwayat masuk
    await load();
  }

  async function load() {
    // Sync selectedColor from URL query param
    const urlParams = new URLSearchParams(window.location.search);
    const warnaParam = urlParams.get('warna');
    selectedColor = warnaParam ?? null;

    loading = true;
    try {
      const modelId = $page.params.model_id!;
      const [stokResult, keluarResult, masukResult] = await Promise.allSettled([
        getStokByModel(modelId),
        getRiwayatKeluarByModel(modelId),
        getRiwayatBarangJadiByModel(modelId),
      ]);

      stokList = stokResult.status === "fulfilled" ? stokResult.value : [];
      riwayatKeluar =
        keluarResult.status === "fulfilled" ? keluarResult.value : [];
      riwayatMasuk =
        masukResult.status === "fulfilled" ? masukResult.value : [];

      if (stokResult.status === "rejected") {
        console.error("getStokByModel failed:", stokResult.reason);
        showError("Gagal memuat data stok.");
      }
      if (keluarResult.status === "rejected") {
        console.error("getRiwayatKeluarByModel failed:", keluarResult.reason);
      }
      if (masukResult.status === "rejected") {
        console.error(
          "getRiwayatBarangJadiByModel failed:",
          masukResult.reason,
        );
        showError("Gagal memuat riwayat masuk (cek index Firestore).");
      }
    } finally {
      loading = false;
    }
  }

  // ── Riwayat Masuk: grouping per batch + filter tanggal ────────────

  type RiwayatMasukGroup = {
    // key unik: batch_id untuk hasil produksi, atau id riwayat itu sendiri untuk entry manual
    key: string;
    batch_id?: string;
    tipe: RiwayatBarangJadi["tipe"];
    items: RiwayatBarangJadi[]; // bisa lebih dari satu kalau 1 batch hasilkan >1 ukuran
    totalJumlah: number;
    timestamp: any;
  };

  const TIPE_LABEL: Record<string, string> = {
    masuk_produksi: "Dari Produksi",
    masuk_restock: "Restock",
    masuk_stok_awal: "Stok Awal",
    kurangi_manual: "Kurangi Manual",
    set_manual: "Set Manual",
    reject_diperbaiki: "Reject Diperbaiki",
  };
  const TIPE_STYLE: Record<string, string> = {
    masuk_produksi: "bg-teal-100 text-teal-700",
    masuk_restock: "bg-blue-100 text-blue-700",
    masuk_stok_awal: "bg-purple-100 text-purple-700",
    kurangi_manual: "bg-red-100 text-red-600",
    set_manual: "bg-gray-100 text-gray-600",
    reject_diperbaiki: "bg-teal-100 text-teal-700",
  };

  // Tipe yang MENAMBAH stok (ditampilkan hijau/teal dengan tanda "+").
  // Selain yang diawali "masuk", reject_diperbaiki juga menambah stok
  // (pcs reject yang berhasil diperbaiki masuk balik ke stok_tersedia).
  function isTipeMasuk(tipe: string): boolean {
    return tipe.startsWith("masuk") || tipe === "reject_diperbaiki";
  }

  const PROSES_LABEL: Record<string, string> = {
    PENDING_CUTTING: "Menunggu Cutting",
    CUTTING_IN_PROGRESS: "Cutting",
    CUTTING_DONE: "Cutting Selesai",
    JAHIT_IN_PROGRESS: "Jahit",
    JAHIT_DONE: "Jahit Selesai",
    STEAM_IN_PROGRESS: "Steam",
    STEAM_DONE: "Steam Selesai",
    COMPLETED: "Selesai → Masuk Gudang",
  };
  const PROSES_DOT: Record<string, string> = {
    CUTTING_IN_PROGRESS: "bg-sky-500",
    CUTTING_DONE: "bg-sky-500",
    JAHIT_IN_PROGRESS: "bg-violet-500",
    JAHIT_DONE: "bg-violet-500",
    STEAM_IN_PROGRESS: "bg-amber-500",
    STEAM_DONE: "bg-amber-500",
    COMPLETED: "bg-teal-500",
  };

  function tsMillis(ts: any): number {
    return ts?.toMillis ? ts.toMillis() : ts ? new Date(ts).getTime() : 0;
  }

  function warnaRiwayat(r: RiwayatBarangJadi): string {
    if (r.nama_warna) return r.nama_warna;
    if (r.batch_id && batchWarnaCache[r.batch_id]?.nama_warna) {
      return batchWarnaCache[r.batch_id]?.nama_warna ?? "";
    }

    const warnaUntukUkuran = new Set(
      stokList
        .filter((stok) => stok.ukuran === r.ukuran && stok.nama_warna)
        .map((stok) => stok.nama_warna as string),
    );

    // Riwayat lama belum punya field warna. Kalau ukuran ini hanya punya satu
    // warna di stok sekarang, warna itu aman dipakai sebagai fallback.
    if (warnaUntukUkuran.size === 1) return [...warnaUntukUkuran][0];
    return "";
  }

  let riwayatMasukUntukWarna = $derived.by(() => {
    if (!selectedColor) return riwayatMasuk;
    return riwayatMasuk.filter((r) => warnaRiwayat(r) === selectedColor);
  });

  // Filter berdasarkan warna aktif + rentang tanggal (kalau diisi)
  let riwayatMasukTerfilter = $derived.by(() => {
    if (!filterDari && !filterSampai) return riwayatMasukUntukWarna;
    const dari = filterDari
      ? new Date(filterDari + "T00:00:00").getTime()
      : -Infinity;
    const sampai = filterSampai
      ? new Date(filterSampai + "T23:59:59").getTime()
      : Infinity;
    return riwayatMasukUntukWarna.filter((r) => {
      const t = tsMillis(r.timestamp);
      return t >= dari && t <= sampai;
    });
  });

  // Group: entry masuk_produksi dengan batch_id yang sama digabung jadi 1 card;
  // entry manual (restock/stok_awal/kurangi/set) berdiri sendiri.
  let riwayatMasukGrouped = $derived.by(() => {
    const map = new Map<string, RiwayatMasukGroup>();
    for (const r of riwayatMasukTerfilter) {
      const key =
        r.tipe === "masuk_produksi" && r.batch_id
          ? `batch__${r.batch_id}`
          : `single__${r.id}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          batch_id: r.batch_id,
          tipe: r.tipe,
          items: [],
          totalJumlah: 0,
          timestamp: r.timestamp,
        });
      }
      const g = map.get(key)!;
      g.items.push(r);
      g.totalJumlah += r.jumlah;
      // Pakai timestamp paling baru dari item-item dalam grup
      if (tsMillis(r.timestamp) > tsMillis(g.timestamp))
        g.timestamp = r.timestamp;
    }
    return [...map.values()].sort(
      (a, b) => tsMillis(b.timestamp) - tsMillis(a.timestamp),
    );
  });

  // Prefetch nama tukang cutting untuk tiap batch begitu muncul di list,
  // supaya judul card langsung tampil tanpa perlu diklik/expand dulu.
  let batchNamaCache = $state<Record<string, string | null>>({});

  $effect(() => {
    for (const group of riwayatMasukGrouped) {
      if (group.batch_id && !(group.batch_id in batchNamaCache)) {
        prefetchCuttingNama(group.batch_id);
      }
    }
  });

  $effect(() => {
    for (const item of riwayatMasuk) {
      if (
        item.batch_id &&
        !item.nama_warna &&
        !(item.batch_id in batchWarnaCache)
      ) {
        prefetchBatchWarna(item.batch_id);
      }
    }
  });

  async function prefetchBatchWarna(batchId: string) {
    batchWarnaCache = {
      ...batchWarnaCache,
      [batchId]: null,
    };
    try {
      const batch = await getBatchById(batchId);
      batchWarnaCache = {
        ...batchWarnaCache,
        [batchId]: {
          nama_warna: batch?.nama_warna,
          kode_hex_warna: batch?.kode_hex_warna,
        },
      };
    } catch {
      batchWarnaCache = { ...batchWarnaCache, [batchId]: null };
    }
  }

  async function prefetchCuttingNama(batchId: string) {
    // Tandai sedang di-fetch (value undefined) agar tidak dobel-fetch
    batchNamaCache = {
      ...batchNamaCache,
      [batchId]: undefined as unknown as null,
    };
    try {
      const batch = await getBatchById(batchId);
      let nama: string | null = batch?.penugasan?.cutting?.nama ?? null;
      if (!nama && batch?.sumber_cutting?.length) {
        nama = batch.sumber_cutting[0].penugasan?.cutting?.nama ?? null;
      }
      batchNamaCache = { ...batchNamaCache, [batchId]: nama };
    } catch (e) {
      console.error("prefetchCuttingNama failed:", e);
      batchNamaCache = { ...batchNamaCache, [batchId]: null };
    }
  }

  async function toggleExpand(group: RiwayatMasukGroup) {
    if (expandedBatchId === group.key) {
      expandedBatchId = null;
      return;
    }
    expandedBatchId = group.key;
    if (group.batch_id && !batchDetailCache[group.batch_id]) {
      loadingBatchId = group.batch_id;
      try {
        batchDetailCache = {
          ...batchDetailCache,
          [group.batch_id]: await loadBatchDetail(group.batch_id),
        };
      } catch (e) {
        console.error("loadBatchDetail failed:", e);
        showError("Gagal memuat riwayat proses batch.");
      } finally {
        loadingBatchId = null;
      }
    }
  }

  // Ambil timeline lengkap sebuah batch, termasuk tahap Cutting.
  // Kalau batch ini dibuat dari stok potongan (dari_potongan), tahap Cutting-nya
  // ada di batch ASAL (sumber_cutting) — bukan di riwayat_proses batch ini sendiri.
  async function loadBatchDetail(batchId: string): Promise<BatchDetail> {
    const [batch, ownProses] = await Promise.all([
      getBatchById(batchId),
      getRiwayatBatch(batchId),
    ]);

    const timeline: BatchTimelineEntry[] = ownProses.map((p) => ({
      status_ke: p.status_ke,
      timestamp: p.timestamp,
      updated_by_nama: p.updated_by_nama,
      pcs_berhasil: p.pcs_berhasil,
      pcs_reject: p.pcs_reject,
      catatan: p.catatan,
    }));

    let cuttingNama: string | null = batch?.penugasan?.cutting?.nama ?? null;

    if (
      batch?.dari_potongan &&
      batch.sumber_cutting &&
      batch.sumber_cutting.length > 0
    ) {
      // Dedupe by batch_id: satu batch sumber cutting bisa muncul lebih dari satu
      // kali sebagai lot berbeda (misalnya penarikan dari pool yang terpecah jadi
      // beberapa lot dari sumber yang sama). Riwayat proses batch itu hanya perlu
      // diambil & ditampilkan SEKALI, bukan sebanyak jumlah lot-nya.
      const sumberUnik = new Map<string, SumberCutting>();
      for (const sumber of batch.sumber_cutting) {
        if (!sumberUnik.has(sumber.batch_id))
          sumberUnik.set(sumber.batch_id, sumber);
      }

      for (const sumber of sumberUnik.values()) {
        if (!cuttingNama) cuttingNama = sumber.penugasan?.cutting?.nama ?? null;
        try {
          const sumberProses = await getRiwayatBatch(sumber.batch_id);
          const cuttingEntries = sumberProses.filter(
            (p) =>
              p.status_ke === "CUTTING_IN_PROGRESS" ||
              p.status_ke === "CUTTING_DONE",
          );
          for (const p of cuttingEntries) {
            timeline.push({
              status_ke: p.status_ke,
              timestamp: p.timestamp,
              updated_by_nama: p.updated_by_nama,
              pcs_berhasil: p.pcs_berhasil,
              pcs_reject: p.pcs_reject,
              catatan: p.catatan,
              dariSumberLain: true,
            });
          }
        } catch (e) {
          console.error(
            `Gagal ambil riwayat batch sumber cutting ${sumber.batch_id}:`,
            e,
          );
          // Fallback: tetap tampilkan bahwa cutting pernah terjadi, walau tanpa waktu pasti
          timeline.push({
            status_ke: "CUTTING_DONE",
            timestamp: null,
            updated_by_nama:
              sumber.penugasan?.cutting?.nama ?? "Tidak diketahui",
            pcs_berhasil: 0,
            pcs_reject: 0,
            catatan:
              "Riwayat proses cutting asli tidak ditemukan (batch sumber mungkin sudah dihapus)",
            dariSumberLain: true,
          });
        }
      }
    }

    timeline.sort((a, b) => tsMillis(a.timestamp) - tsMillis(b.timestamp));
    // Sinkronkan ke cache nama juga (bisa lebih akurat dari hasil prefetch cepat)
    batchNamaCache = { ...batchNamaCache, [batchId]: cuttingNama };
    return { cuttingNama, timeline };
  }

  function bukaDialog(mode: DialogMode, item: StokBarangJadi) {
    dialogMode = mode;
    selectedItem = item;
    fJumlah = mode === "edit" ? item.stok_tersedia : 0;
    openDialog = true;
  }

  async function submitDialog() {
    if (!selectedItem || fJumlah < 0 || saving) return;
    saving = true;
    try {
      const uid = $currentUser?.uid ?? "";
      const nama = $currentUser?.name || $currentUser?.email || uid;

      if (dialogMode === "restock") {
        if (fJumlah <= 0) throw new Error("Jumlah harus lebih dari 0");
        await tambahStokBarangJadi(
          selectedItem.model_id,
          selectedItem.nama_model,
          [{ ukuran: selectedItem.ukuran, jumlah_pcs: fJumlah }],
          {
            nama_warna: selectedItem.nama_warna,
            kode_hex_warna: selectedItem.kode_hex_warna,
          },
          { uid, nama, tipe: "masuk_restock", catatan: "Restock manual" },
        );
        showSuccess(
          `+${fJumlah} pcs berhasil ditambahkan ke stok ukuran ${selectedItem.ukuran}.`,
        );
      } else if (dialogMode === "kurangi") {
        if (fJumlah <= 0) throw new Error("Jumlah harus lebih dari 0");
        await kurangiStokManual(selectedItem.id, fJumlah, {
          uid,
          nama,
          tipe: "kurangi_manual",
        });
        showSuccess(
          `-${fJumlah} pcs berhasil dikurangi dari stok ukuran ${selectedItem.ukuran}.`,
        );
      } else {
        if (fJumlah < 0) throw new Error("Stok tidak boleh negatif");
        await setStokManual(selectedItem.id, fJumlah, {
          uid,
          nama,
          tipe: "set_manual",
        });
        showSuccess(
          `Stok ukuran ${selectedItem.ukuran} diset ke ${fJumlah} pcs.`,
        );
      }
      openDialog = false;
      await load();
    } catch (e: any) {
      showError(e?.message ?? "Gagal menyimpan perubahan.");
    } finally {
      saving = false;
    }
  }

  let formValid = $derived.by(() => {
    if (!selectedItem) return false;
    if (dialogMode === "restock") return fJumlah > 0;
    if (dialogMode === "kurangi")
      return fJumlah > 0 && fJumlah <= selectedItem.stok_tersedia;
    return fJumlah >= 0;
  });

  onMount(load);
</script>

<!-- ── Toasts ────────────────────────────────────────────────────── -->
{#if successMsg}
  <div
    class="fixed right-5 top-5 z-[9999] flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 shadow-lg"
  >
    <svg
      class="h-4 w-4 shrink-0 text-green-600"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m4.5 12.75 6 6 9-13.5"
      />
    </svg>
    <p class="text-sm text-green-800">{successMsg}</p>
  </div>
{/if}
{#if errorMsg}
  <div
    class="fixed right-5 top-5 z-[9999] flex max-w-sm items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg"
  >
    <svg
      class="mt-0.5 h-4 w-4 shrink-0 text-red-500"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
      />
    </svg>
    <p class="text-sm text-red-800">{errorMsg}</p>
  </div>
{/if}

<!-- ── Header ─────────────────────────────────────────────────────── -->
<div class="mb-6">
  <Button
    variant="ghost"
    size="sm"
    onclick={() => goto("/barang-jadi")}
    class="mb-3 -ml-2 gap-1.5 text-gray-400 hover:text-gray-700"
  >
    <svg
      class="h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
      />
    </svg>
    Barang Jadi
  </Button>

  {#if loading}
    <div class="flex flex-wrap items-center gap-2">
      <div class="h-7 w-48 animate-pulse rounded bg-gray-100"></div>
      <div class="h-7 w-32 animate-pulse rounded bg-gray-100"></div>
    </div>
  {:else}
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="text-xl font-semibold text-gray-900">
          {namaModel || "Model tidak ditemukan"}
        </h1>
        {#if allColors.length > 1}
          <Select.Root
            type="single"
            value={selectedColor ?? ""}
            onValueChange={(val) => {
              selectedColor = val || null;
              const url = new URL(window.location.href);
              if (val) {
                url.searchParams.set('warna', val);
              } else {
                url.searchParams.delete('warna');
              }
              window.history.replaceState({}, '', url.toString());
            }}
          >
            <Select.Trigger class="h-7 gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-0 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50">
              {#if selectedColor && activeColorEntry?.kode_hex_warna}
                <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style="background-color: {activeColorEntry.kode_hex_warna}"></span>
              {/if}
              {selectedColor ? (activeColorEntry?.nama_warna ?? selectedColor) : 'Semua warna'}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="">
                Semua warna
              </Select.Item>
              {#each allColors as color}
                <Select.Item value={color.key}>
                  <span class="flex items-center gap-2">
                    {#if color.kode_hex_warna}
                      <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style="background-color: {color.kode_hex_warna}"></span>
                    {/if}
                    {color.nama_warna ?? 'Tanpa warna'}
                  </span>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        {:else if namaWarna}
          <span
            class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-700 shadow-sm"
          >
            {#if kodeHexWarna}
              <span
                class="inline-block h-3 w-3 shrink-0 rounded-full"
                style="background-color: {kodeHexWarna}"
              ></span>
            {/if}
            {namaWarna}
          </span>
        {/if}
        {#if jumlahKritis > 0}
          <span
            class="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-600"
          >
            {jumlahKritis} ukuran kritis
          </span>
        {/if}
      </div>

      <Button variant="outline" onclick={load}>
        <svg
          class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
          />
        </svg>
        Refresh
      </Button>
    </div>
  {/if}
</div>

{#if loading}
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {#each Array(4) as _}
        <div class="h-24 animate-pulse rounded-xl bg-gray-100"></div>
      {/each}
    </div>
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
      {#each Array(5) as _}
        <div class="h-40 animate-pulse rounded-xl bg-gray-100"></div>
      {/each}
    </div>
  </div>
{:else if stokList.length === 0}
  <div class="flex flex-col items-center gap-3 py-24 text-center">
    <div
      class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100"
    >
      <svg
        class="h-7 w-7 text-gray-300"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
        />
      </svg>
    </div>
    <p class="font-medium text-gray-600">Belum ada stok untuk model ini</p>
    <p class="text-sm text-gray-400">
      Stok akan muncul setelah batch produksi selesai atau diisi manual.
    </p>
    <Button variant="outline" onclick={() => goto("/barang-jadi")}
      >← Kembali</Button
    >
  </div>
{:else}
  <!-- ── Summary Stats ──────────────────────────────────────────────── -->
  <div class="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
    <StatCard
      title="Stok Tersedia"
      value={totalTersedia.toLocaleString("id-ID")}
      icon={PackageCheckIcon}
      footerSubtext="pcs siap kirim"
      class="border-teal-100 bg-teal-50"
      valueClass="text-teal-700"
    />
    <StatCard
      title="Total Masuk"
      value={totalMasuk.toLocaleString("id-ID")}
      icon={PackagePlusIcon}
      footerSubtext="pcs dari produksi & restock"
    />
    <StatCard
      title="Total Keluar"
      value={totalKeluar.toLocaleString("id-ID")}
      icon={PackageMinusIcon}
      footerSubtext="pcs sudah dikirim"
    />
    <StatCard
      title="Jumlah Ukuran"
      value={stokList.length}
      icon={RulerIcon}
      footerSubtext="ukuran terdaftar"
    />
  </div>

  <!-- ── Size Grid Strip ────────────────────────────────────────────── -->
  {#if filteredItems.length > 0}
    <div class="mb-5 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <!-- Strip header -->
      <div class="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        {#if selectedColor && kodeHexWarna}
          <span class="inline-block h-3 w-3 shrink-0 rounded-full" style="background-color: {kodeHexWarna}"></span>
        {/if}
        <span class="text-sm font-semibold text-gray-800">{selectedColor ? namaWarna : "Semua warna"}</span>
        <span class="text-sm font-bold text-gray-800">{totalTersedia} pcs</span>

        {#if jumlahKritis > 0}
          <span class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
            Kritis ({jumlahKritis})
          </span>
        {/if}
      </div>

      <!-- Size columns -->
      <div class="grid" style="grid-template-columns: repeat({filteredItems.length}, minmax(0, 1fr))">
        {#each filteredItems as item}
          {@const status = getStatus(item)}
          {@const st = STATUS_STYLE[status]}
          <div class="flex flex-col items-center px-3 py-4 text-center {item !== filteredItems[filteredItems.length - 1] ? 'border-r border-gray-100' : ''}">
            <!-- Ukuran badge -->
            <div class="mb-2 flex items-center gap-1">
              <span class="flex h-7 w-7 items-center justify-center rounded-full {st.ukuran} text-xs font-bold">
                {item.ukuran}
              </span>
              {#if status === "kritis" || status === "kosong"}
                <span class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold {st.badge}">
                  {st.label}
                </span>
              {/if}
            </div>

            <!-- Pcs -->
            <p class="text-2xl font-bold leading-none {st.num}">
              {item.stok_tersedia}
            </p>
            <p class="mt-0.5 text-[11px] text-gray-400">pcs tersedia</p>

            <!-- Date -->
            {#if item.updatedAt}
              <p class="mt-2 text-[10px] text-gray-300">
                {formatDate(item.updatedAt)}
              </p>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Ukuran Rows ───────────────────────────────────────────────── -->
  <div
    class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
  >
    {#each sorted as item, i}
      {@const status = getStatus(item)}
      {@const pct =
        item.total_masuk > 0
          ? Math.round((item.stok_tersedia / item.total_masuk) * 100)
          : 0}

      <div
        class="flex items-center gap-4 px-5 py-4 {i > 0
          ? 'border-t border-gray-100'
          : ''}"
      >
        <!-- Ukuran badge -->
        <span
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-700"
        >
          {item.ukuran}
        </span>

        <!-- Status badge -->
        <span
          class="w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold {STATUS_BADGE[
            status
          ]}"
        >
          {STATUS_LABEL[status]}
        </span>

        <!-- Stok tersedia -->
        <div class="w-24 shrink-0">
          <p class="text-xl font-bold {STATUS_NUM[status]}">
            {item.stok_tersedia}
          </p>
          <p class="text-[10px] text-gray-400">pcs tersedia</p>
        </div>

        <!-- Progress bar + pct -->
        <div class="flex-1">
          {#if item.total_masuk > 0}
            <div class="h-1.5 w-full rounded-full bg-gray-100">
              <div
                class="h-1.5 rounded-full bg-gray-300 transition-all"
                style="width: {pct}%"
              ></div>
            </div>
            <p class="mt-0.5 text-[10px] text-gray-400">{pct}% sisa</p>
          {/if}
        </div>

        <!-- Update date -->
        {#if item.updatedAt}
          <p class="w-24 shrink-0 text-right text-[11px] text-gray-300">
            {formatDate(item.updatedAt)}
          </p>
        {/if}

        <!-- Actions -->
        {#if selectedColor}
        <div class="flex shrink-0 gap-1">
          <button
            onclick={() => bukaDialog("restock", item)}
            class="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-teal-600 hover:bg-teal-50 transition"
          >
            + Restock
          </button>
          <button
            onclick={() => bukaDialog("kurangi", item)}
            class="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-500 hover:bg-red-50 transition"
          >
            − Kurangi
          </button>
          <button
            onclick={() => bukaDialog("edit", item)}
            class="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 transition"
          >
            ✎ Set
          </button>
        </div>
        {:else}
          <p class="w-36 shrink-0 text-right text-[11px] text-gray-400">
            Pilih warna untuk aksi stok
          </p>
        {/if}
      </div>
    {/each}
  </div>
  <!-- ── Riwayat Masuk ────────────────────────────────────────────── -->
  <div class="mt-6">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-gray-700">Riwayat Masuk</h2>

      <!-- Filter tanggal -->
      <div class="flex items-center gap-2 text-xs">
        <span class="text-gray-400">Dari</span>
        <input
          type="date"
          bind:value={filterDari}
          class="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-teal-400 focus:outline-none"
        />
        <span class="text-gray-400">Sampai</span>
        <input
          type="date"
          bind:value={filterSampai}
          class="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-teal-400 focus:outline-none"
        />
        {#if filterDari || filterSampai}
          <button
            onclick={() => {
              filterDari = "";
              filterSampai = "";
            }}
            class="text-teal-600 hover:underline"
          >
            Reset
          </button>
        {/if}
      </div>
    </div>

    {#if riwayatMasukTerfilter.length === 0}
      <div
        class="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-5 py-6 text-sm text-gray-400 shadow-sm"
      >
        {riwayatMasukUntukWarna.length === 0
          ? selectedColor
            ? `Belum ada riwayat masuk untuk warna ${namaWarna ?? selectedColor}`
            : "Belum ada riwayat masuk untuk model ini"
          : "Tidak ada riwayat pada rentang tanggal ini"}
      </div>
    {:else}
      <div class="space-y-3">
        {#each riwayatMasukGrouped as group}
          {@const isBatch = group.tipe === "masuk_produksi" && !!group.batch_id}
          {@const isExpanded = expandedBatchId === group.key}
          {@const first = group.items[0]}
          {@const cuttingNama = group.batch_id
            ? batchNamaCache[group.batch_id]
            : undefined}

          <div
            class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
          >
            <!-- Header card: bisa diklik untuk expand kalau ini hasil produksi (punya batch) -->
            <button
              onclick={() => toggleExpand(group)}
              disabled={!isBatch}
              class="flex w-full items-center gap-4 px-5 py-3.5 text-left transition {isBatch
                ? 'hover:bg-gray-50'
                : 'cursor-default'}"
            >
              <span
                class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold shrink-0 {TIPE_STYLE[
                  group.tipe
                ] ?? 'bg-gray-100 text-gray-600'}"
              >
                {TIPE_LABEL[group.tipe] ?? group.tipe}
              </span>

              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-gray-800">
                  {#if isBatch}
                    {cuttingNama === undefined
                      ? "Memuat…"
                      : (cuttingNama ?? "Tukang cutting tidak tercatat")}
                  {:else}
                    {first.catatan ||
                      TIPE_LABEL[group.tipe] ||
                      "Penyesuaian Stok"}
                  {/if}
                </p>
                <p class="truncate text-xs text-gray-400">
                  {isBatch
                    ? "Tukang Cutting · klik untuk lihat proses lengkap"
                    : `oleh ${first.dicatat_oleh_nama ?? "—"}`}
                </p>
              </div>

              <!-- Ringkasan ukuran dalam grup -->
              <div class="hidden flex-wrap justify-end gap-1 sm:flex">
                {#each group.items as it}
                  <span
                    class="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-700"
                  >
                    {it.ukuran} ×{it.jumlah}
                  </span>
                {/each}
              </div>

              <div class="w-20 shrink-0 text-right">
                <span
                  class="text-sm font-semibold {isTipeMasuk(group.tipe)
                    ? 'text-teal-700'
                    : 'text-red-600'}"
                >
                  {isTipeMasuk(group.tipe) ? "+" : "−"}{group.totalJumlah} pcs
                </span>
              </div>

              <p class="w-28 shrink-0 text-right text-xs text-gray-400">
                {formatDateTime(group.timestamp)}
              </p>

              {#if isBatch}
                <ChevronDownIcon
                  class="h-4 w-4 shrink-0 text-gray-400 transition-transform {isExpanded
                    ? 'rotate-180'
                    : ''}"
                />
              {:else}
                <span class="w-4 shrink-0"></span>
              {/if}
            </button>

            <!-- Detail timeline proses (cutting → jahit → steam → selesai) -->
            {#if isBatch && isExpanded}
              {@const detail = batchDetailCache[group.batch_id!]}
              <div class="border-t border-gray-100 bg-gray-50 px-5 py-4">
                {#if loadingBatchId === group.batch_id}
                  <div
                    class="flex items-center gap-2 py-2 text-xs text-gray-400"
                  >
                    <svg
                      class="h-3.5 w-3.5 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="2"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                      />
                    </svg>
                    Memuat riwayat proses...
                  </div>
                {:else if !detail || detail.timeline.length === 0}
                  <p class="py-2 text-xs text-gray-400">
                    Riwayat proses batch tidak ditemukan.
                  </p>
                {:else}
                  <ol class="space-y-3">
                    {#each detail.timeline as p, i}
                      <li class="flex gap-3">
                        <div class="flex flex-col items-center">
                          <span
                            class="h-2.5 w-2.5 shrink-0 rounded-full {PROSES_DOT[
                              p.status_ke
                            ] ?? 'bg-gray-400'}"
                          ></span>
                          <span class="w-px flex-1 bg-gray-200"></span>
                        </div>
                        <div class="min-w-0 flex-1 pb-3">
                          <div
                            class="flex flex-wrap items-center justify-between gap-2"
                          >
                            <p class="text-xs font-semibold text-gray-700">
                              {PROSES_LABEL[p.status_ke] ?? p.status_ke}
                              {#if p.dariSumberLain}
                                <span
                                  class="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-600"
                                  >dari batch cutting asal</span
                                >
                              {/if}
                            </p>
                            <p class="text-[11px] text-gray-400">
                              {formatDateTime(p.timestamp)}
                            </p>
                          </div>
                          <p class="text-[11px] text-gray-500">
                            oleh <span class="font-medium text-gray-700"
                              >{p.updated_by_nama}</span
                            >
                            {#if p.pcs_berhasil > 0}
                              · {p.pcs_berhasil} pcs berhasil
                            {/if}
                            {#if p.pcs_reject > 0}
                              ·
                              <button
                                type="button"
                                class="font-medium text-red-500 underline decoration-dotted underline-offset-2 hover:text-red-600"
                                onclick={() =>
                                  openRejectDialog(group.batch_id!)}
                              >
                                {p.pcs_reject} reject
                              </button>
                            {/if}
                          </p>
                          {#if p.catatan}
                            <p class="mt-0.5 text-[11px] italic text-gray-400">
                              "{p.catatan}"
                            </p>
                          {/if}
                        </div>
                      </li>
                    {/each}
                    <!-- Tahap terakhir: masuk ke gudang -->
                    <li class="flex gap-3">
                      <span
                        class="h-2.5 w-2.5 shrink-0 rounded-full bg-teal-500"
                      ></span>
                      <div class="min-w-0 flex-1">
                        <div
                          class="flex flex-wrap items-center justify-between gap-2"
                        >
                          <p class="text-xs font-semibold text-teal-700">
                            Masuk Gudang (Barang Jadi)
                          </p>
                          <p class="text-[11px] text-gray-400">
                            {formatDateTime(first.timestamp)}
                          </p>
                        </div>
                        <p class="text-[11px] text-gray-500">
                          {#each group.items as it, gi}{gi > 0
                              ? ", "
                              : ""}{it.ukuran} +{it.jumlah} pcs{/each}
                        </p>
                      </div>
                    </li>
                  </ol>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
      <p class="mt-2 text-right text-[11px] text-gray-300">
        Menampilkan {riwayatMasukGrouped.length} entri ({riwayatMasukTerfilter.length}
        catatan)
      </p>
    {/if}
  </div>

  <!-- ── Riwayat Keluar ───────────────────────────────────────────── -->
  <div class="mt-6">
    <h2 class="mb-3 text-sm font-semibold text-gray-700">Riwayat Keluar</h2>

    {#if riwayatKeluarTampil.length === 0}
      <div
        class="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-5 py-6 text-sm text-gray-400 shadow-sm"
      >
        <svg
          class="h-4 w-4 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
          />
        </svg>
        Belum ada catatan pengiriman untuk model ini
      </div>
    {:else}
      <div
        class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
      >
        <!-- Header tabel -->
        <div
          class="grid grid-cols-[1fr_minmax(220px,auto)_auto_auto] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-gray-400"
        >
          <span>Tujuan</span>
          <span class="text-right">Ukuran & Jumlah</span>
          <span class="w-24 text-right">Keluar / Pending</span>
          <span class="w-28 text-right">Tanggal</span>
        </div>
        {#each riwayatKeluarTampil as r, i}
          {@const items = itemsForCurrentView(r)}
          {@const totalKeluarRecord = totalItemPcsByStatus(items, "keluar")}
          {@const totalPendingRecord = totalItemPcsByStatus(items, "pending")}
          <div
            class="grid grid-cols-[1fr_minmax(220px,auto)_auto_auto] items-start gap-4 px-5 py-3.5 text-sm {i >
            0
              ? 'border-t border-gray-100'
              : ''}"
          >
            <div>
              <p class="font-medium text-gray-800">{r.tujuan}</p>
              {#if r.nama_reseller}
                <p class="mt-0.5 text-xs font-medium text-gray-500">
                  Reseller: {r.nama_reseller}
                </p>
              {/if}
              {#if r.keterangan}
                <p class="mt-0.5 text-xs text-gray-400">{r.keterangan}</p>
              {/if}
            </div>
            <div class="flex max-w-md flex-col items-end gap-1.5">
              {#each items as item}
                <div class="flex flex-wrap justify-end gap-1.5">
                  {#if !selectedColor && item.nama_warna}
                    <span
                      class="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500"
                    >
                      {item.nama_warna}
                    </span>
                  {/if}
                  <span
                    class="rounded-md border px-2 py-0.5 text-[11px] font-semibold {statusItemClass(item.status)}"
                  >
                    {statusItemLabel(item.status)}
                  </span>
                {#each item.detail_keluar as d}
                  <span
                    class="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600"
                  >
                    {d.ukuran}
                    <span class="font-semibold text-gray-800"
                      >×{d.jumlah_pcs}</span
                    >
                  </span>
                {/each}
                </div>
                {#if item.status === "pending" && item.alasan_pending}
                  <p class="max-w-xs text-right text-[11px] text-amber-600">
                    {item.alasan_pending}
                  </p>
                {/if}
              {/each}
            </div>
            <div class="w-24 text-right">
              <p class="font-semibold text-gray-800">{totalKeluarRecord} pcs</p>
              {#if totalPendingRecord > 0}
                <p class="text-[11px] font-semibold text-amber-600">
                  {totalPendingRecord} pending
                </p>
              {/if}
            </div>
            <p class="w-28 text-right text-xs text-gray-400">
              {formatDateTime(r.tanggal_keluar)}
            </p>
          </div>
        {/each}
      </div>
      <p class="mt-2 text-right text-[11px] text-gray-300">
        Menampilkan {riwayatKeluarTampil.length} catatan terbaru
      </p>
    {/if}
  </div>
{/if}

<!-- ── Dialog: Restock / Kurangi / Set ──────────────────────────── -->
<RejectResolveDialog
  bind:open={rejectDialogOpen}
  batchId={rejectDialogBatchId}
  onResolved={handleRejectResolved}
/>

<Dialog.Root bind:open={openDialog}>
  <Dialog.Content class="max-w-sm">
    <Dialog.Header>
      <Dialog.Title>{selectedItem ? DIALOG_TITLE[dialogMode] : ""}</Dialog.Title
      >
      <Dialog.Description>
        {selectedItem ? DIALOG_DESC[dialogMode] : ""}
      </Dialog.Description>
    </Dialog.Header>

    {#if selectedItem}
      <div class="space-y-4">
        <div
          class="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-700"
          >
            {selectedItem.ukuran}
          </span>
          <div>
            <p class="text-sm font-semibold text-gray-800">
              {selectedItem.nama_model}
            </p>
            <p class="text-xs text-gray-500">
              Stok saat ini: <strong>{selectedItem.stok_tersedia} pcs</strong>
            </p>
          </div>
        </div>

        {#if fJumlah > 0 || dialogMode === "edit"}
          {@const preview =
            dialogMode === "restock"
              ? selectedItem.stok_tersedia + fJumlah
              : dialogMode === "kurangi"
                ? selectedItem.stok_tersedia - fJumlah
                : fJumlah}
          <div
            class="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700"
          >
            Stok setelah disimpan:
            <span class="ml-1 font-bold text-blue-900">{preview} pcs</span>
            {#if dialogMode === "kurangi" && preview < 0}
              <span class="ml-2 font-semibold text-red-600"
                >⚠ melebihi stok!</span
              >
            {/if}
          </div>
        {/if}

        <div>
          <label
            class="mb-1.5 block text-sm font-medium text-gray-700"
            for="dialog-jumlah"
          >
            {dialogMode === "edit" ? "Stok Baru (pcs)" : "Jumlah (pcs)"}
            <span class="text-red-500">*</span>
          </label>
          <Input
            id="dialog-jumlah"
            type="number"
            min={dialogMode === "edit" ? 0 : 1}
            max={dialogMode === "kurangi"
              ? selectedItem.stok_tersedia
              : undefined}
            bind:value={fJumlah}
          />
          {#if dialogMode === "kurangi"}
            <p class="mt-1 text-xs text-gray-400">
              Maks: {selectedItem.stok_tersedia} pcs
            </p>
          {:else if dialogMode === "edit"}
            <p class="mt-1 text-xs text-gray-400">
              Set ke nilai absolut — cocok untuk koreksi stok fisik.
            </p>
          {/if}
        </div>
      </div>

      <Dialog.Footer class="gap-2">
        <Button variant="outline" onclick={() => (openDialog = false)}
          >Batal</Button
        >
        <Button
          onclick={submitDialog}
          disabled={saving || !formValid}
          class={dialogMode === "kurangi"
            ? "bg-red-600 text-white hover:bg-red-700"
            : dialogMode === "edit"
              ? ""
              : "bg-teal-600 text-white hover:bg-teal-700"}
        >
          {saving
            ? "Menyimpan..."
            : dialogMode === "restock"
              ? "Simpan Restock"
              : dialogMode === "kurangi"
                ? "Simpan Pengurangan"
                : "Simpan"}
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
