<script lang="ts">
  import {
    collection,
    collectionGroup,
    getDocs,
    writeBatch,
    type DocumentData,
    type QueryDocumentSnapshot,
  } from "firebase/firestore";
  import { db } from "$lib/firebase/config";
  import { getPeriodRange, type DateRange } from "$lib/period";
  import PeriodSelector from "$lib/components/period-selector.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Table from "$lib/components/ui/table";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import SearchIcon from "@lucide/svelte/icons/search";

  type ActivityCategory =
    | "produksi"
    | "stok_jadi"
    | "stok_kain"
    | "barang_keluar"
    | "keuangan"
    | "gaji"
    | "reject";

  type ActivityRow = {
    id: string;
    source: string;
    timeMs: number;
    tanggal: Date | null;
    userUid: string;
    userName: string;
    category: ActivityCategory;
    action: string;
    detail: string;
    reference: string;
  };

  const CATEGORY_OPTIONS: Array<{ value: "semua" | ActivityCategory; label: string }> = [
    { value: "semua", label: "Semua Kategori" },
    { value: "produksi", label: "Produksi" },
    { value: "stok_jadi", label: "Stok Barang Jadi" },
    { value: "stok_kain", label: "Stok Kain" },
    { value: "barang_keluar", label: "Barang Keluar" },
    { value: "keuangan", label: "Keuangan" },
    { value: "gaji", label: "Gaji" },
    { value: "reject", label: "Reject" },
  ];

  const CORRECT_PASSWORD = "Yokijatiperkasa30!";

  let dateRange = $state<DateRange>(getPeriodRange("hari_ini"));
  let allRows = $state<ActivityRow[]>([]);
  let loading = $state(true);
  let flushing = $state(false);
  let errorMsg = $state<string | null>(null);
  let flushMsg = $state<string | null>(null);
  let searchQuery = $state("");
  let userFilter = $state("semua");
  let categoryFilter = $state<"semua" | ActivityCategory>("semua");
  let flushPassword = $state("");
  let flushConfirm = $state(false);

  function toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function") return value.toDate();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function inRange(date: Date | null): boolean {
    if (!dateRange || !date) return true;
    return date >= dateRange.start && date <= dateRange.end;
  }

  function formatDateTime(date: Date | null): string {
    if (!date) return "-";
    return date.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function rupiah(value: number): string {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(Math.round(value || 0));
  }

  function escapeHtml(value: unknown): string {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function categoryLabel(category: ActivityCategory): string {
    return CATEGORY_OPTIONS.find((item) => item.value === category)?.label ?? category;
  }

  function statusLabel(status?: string): string {
    const labels: Record<string, string> = {
      PENDING_KAIN: "Menunggu kain",
      PENDING_CUTTING: "Menunggu cutting",
      CUTTING_IN_PROGRESS: "Mulai cutting",
      CUTTING_DONE: "Cutting selesai",
      JAHIT_IN_PROGRESS: "Mulai jahit",
      JAHIT_DONE: "Jahit selesai",
      STEAM_IN_PROGRESS: "Mulai steam",
      STEAM_DONE: "Steam selesai",
      COMPLETED: "Selesai produksi",
    };
    return status ? labels[status] ?? status : "-";
  }

  function stockActionLabel(tipe?: string): string {
    const labels: Record<string, string> = {
      masuk_produksi: "Masuk dari produksi",
      masuk_restock: "Restock barang jadi",
      masuk_stok_awal: "Stok awal barang jadi",
      kurangi_manual: "Kurangi manual",
      set_manual: "Set stok manual",
      barang_keluar: "Barang keluar",
      batal_keluar: "Batal barang keluar",
      reject_diperbaiki: "Reject diperbaiki",
      restock: "Restock kain",
      pemakaian_produksi: "Pakai kain produksi",
    };
    return tipe ? labels[tipe] ?? tipe.replaceAll("_", " ") : "-";
  }

  function detailUkuranText(value: any): string {
    if (!Array.isArray(value) || value.length === 0) return "";
    return value
      .map((item) => {
        const ukuran = item.ukuran ?? "-";
        const pcs = item.jumlah_pcs ?? item.pcs ?? item.jumlah ?? 0;
        return `${ukuran} ${pcs} pcs`;
      })
      .join(", ");
  }

  function rowId(source: string, snap: QueryDocumentSnapshot<DocumentData>): string {
    return `${source}:${snap.ref.path}`;
  }

  function makeUserName(data: any, uidKeys: string[], nameKeys: string[]): { uid: string; name: string } {
    const uid = uidKeys.map((key) => data[key]).find(Boolean) ?? "";
    const name = nameKeys.map((key) => data[key]).find(Boolean) ?? uid;
    return { uid: String(uid || "-"), name: String(name || "Sistem") };
  }

  function normalizeRiwayatProses(snap: QueryDocumentSnapshot<DocumentData>): ActivityRow {
    const data = snap.data();
    const tanggal = toDate(data.timestamp ?? data.createdAt ?? data.updatedAt);
    const user = makeUserName(data, ["updated_by_uid", "dicatat_oleh_uid"], ["updated_by_nama", "dicatat_oleh_nama"]);
    const berhasil = Number(data.pcs_berhasil ?? data.jumlah_berhasil ?? 0);
    const reject = Number(data.pcs_reject ?? data.jumlah_reject ?? 0);
    const detail = [
      detailUkuranText(data.detail_ukuran),
      berhasil ? `${berhasil} pcs berhasil` : "",
      reject ? `${reject} pcs reject` : "",
      data.catatan ? `"${data.catatan}"` : "",
    ].filter(Boolean).join(" - ");
    return {
      id: rowId("riwayat_proses", snap),
      source: "riwayat_proses",
      timeMs: tanggal?.getTime() ?? 0,
      tanggal,
      userUid: user.uid,
      userName: user.name,
      category: "produksi",
      action: data.status_dari
        ? `${statusLabel(data.status_dari)} -> ${statusLabel(data.status_ke)}`
        : statusLabel(data.status_ke),
      detail: detail || "Perubahan proses produksi",
      reference: snap.ref.parent.parent?.id ? `Batch ${snap.ref.parent.parent.id}` : snap.id,
    };
  }

  function normalizeRiwayatBarangJadi(snap: QueryDocumentSnapshot<DocumentData>): ActivityRow {
    const data = snap.data();
    const tanggal = toDate(data.timestamp ?? data.createdAt ?? data.updatedAt);
    const user = makeUserName(data, ["dicatat_oleh_uid"], ["dicatat_oleh_nama"]);
    const jumlah = Number(data.jumlah ?? 0);
    return {
      id: rowId("riwayat_barang_jadi", snap),
      source: "riwayat_barang_jadi",
      timeMs: tanggal?.getTime() ?? 0,
      tanggal,
      userUid: user.uid,
      userName: user.name,
      category: "stok_jadi",
      action: stockActionLabel(data.tipe),
      detail: `${data.nama_model ?? "-"}${data.nama_warna ? ` - ${data.nama_warna}` : ""} ${data.ukuran ?? ""}: ${jumlah > 0 ? "+" : ""}${jumlah} pcs (${data.stok_sebelum ?? 0} -> ${data.stok_sesudah ?? 0})${data.catatan ? ` - ${data.catatan}` : ""}`,
      reference: data.batch_id ? `Batch ${data.batch_id}` : snap.id,
    };
  }

  function normalizeStokKainHistory(snap: QueryDocumentSnapshot<DocumentData>): ActivityRow {
    const data = snap.data();
    const tanggal = toDate(data.timestamp ?? data.createdAt ?? data.updatedAt);
    const user = makeUserName(data, ["dicatat_oleh_uid", "dibuat_oleh_uid"], ["dicatat_oleh_nama", "dibuat_oleh_nama"]);
    return {
      id: rowId("stok_kain_riwayat", snap),
      source: "stok_kain_riwayat",
      timeMs: tanggal?.getTime() ?? 0,
      tanggal,
      userUid: user.uid,
      userName: user.name,
      category: "stok_kain",
      action: stockActionLabel(data.tipe),
      detail: `${data.nama_kain ?? data.nama_model ?? "Kain"}${data.nama_warna ? ` - ${data.nama_warna}` : ""}: ${data.jumlah ?? 0} ${data.satuan ?? "yard"} (${data.stok_sebelum ?? 0} -> ${data.stok_sesudah ?? 0})${data.supplier ? ` - supplier ${data.supplier}` : ""}${data.catatan ? ` - ${data.catatan}` : ""}`,
      reference: snap.ref.parent.parent?.id ? `Kain ${snap.ref.parent.parent.id}` : snap.id,
    };
  }

  function normalizeBarangKeluar(snap: QueryDocumentSnapshot<DocumentData>): ActivityRow {
    const data = snap.data();
    const tanggal = toDate(data.tanggal_keluar ?? data.createdAt ?? data.updatedAt);
    const items = Array.isArray(data.items) ? data.items : [];
    const label = items.length > 1 ? `${items.length} item` : data.nama_model ?? "Barang keluar";
    return {
      id: rowId("barang_keluar", snap),
      source: "barang_keluar",
      timeMs: tanggal?.getTime() ?? 0,
      tanggal,
      userUid: String(data.dicatat_oleh ?? "-"),
      userName: String(data.dicatat_oleh_nama ?? data.dicatat_oleh ?? "Admin"),
      category: "barang_keluar",
      action: "Catat barang keluar",
      detail: `${label} ke ${data.tujuan ?? "-"}${data.nama_reseller ? ` / ${data.nama_reseller}` : ""}: ${data.total_pcs ?? 0} pcs, pending ${data.total_pending_pcs ?? 0}${data.keterangan ? ` - ${data.keterangan}` : ""}`,
      reference: snap.id,
    };
  }

  function normalizeTransaksiKeuangan(snap: QueryDocumentSnapshot<DocumentData>): ActivityRow {
    const data = snap.data();
    const tanggal = toDate(data.tanggal ?? data.createdAt ?? data.updatedAt);
    const user = makeUserName(data, ["dibuat_oleh_uid"], ["dibuat_oleh_nama"]);
    return {
      id: rowId("transaksi_keuangan", snap),
      source: "transaksi_keuangan",
      timeMs: tanggal?.getTime() ?? 0,
      tanggal,
      userUid: user.uid,
      userName: user.name,
      category: "keuangan",
      action: `${data.tipe === "pemasukan" ? "Pemasukan" : "Pengeluaran"} ${String(data.kategori ?? "").replaceAll("_", " ")}`,
      detail: `${data.deskripsi ?? "-"}: ${rupiah(Number(data.nominal ?? 0))}${data.metode ? ` via ${data.metode}` : ""}${data.catatan ? ` - ${data.catatan}` : ""}`,
      reference: data.referensi ?? snap.id,
    };
  }

  function normalizePembayaranGaji(snap: QueryDocumentSnapshot<DocumentData>): ActivityRow {
    const data = snap.data();
    const tanggal = toDate(data.created_at ?? data.createdAt ?? data.updatedAt);
    const user = makeUserName(data, ["created_by_uid"], ["created_by_nama"]);
    return {
      id: rowId("pembayaran_gaji", snap),
      source: "pembayaran_gaji",
      timeMs: tanggal?.getTime() ?? 0,
      tanggal,
      userUid: user.uid,
      userName: user.name,
      category: "gaji",
      action: "Pembayaran gaji",
      detail: `${data.karyawan_nama ?? data.karyawan_uid ?? "-"} (${data.divisi ?? "-"}): ${rupiah(Number(data.total_gaji ?? 0))}, ${data.total_pcs ?? 0} pcs`,
      reference: `${data.periode_start ?? "-"} s/d ${data.periode_end ?? "-"}`,
    };
  }

  function normalizeReject(snap: QueryDocumentSnapshot<DocumentData>): ActivityRow {
    const data = snap.data();
    const tanggal = toDate(data.createdAt ?? data.updatedAt ?? data.timestamp);
    const user = makeUserName(data, ["dicatat_oleh_uid"], ["dicatat_oleh_nama"]);
    return {
      id: rowId("reject_items", snap),
      source: "reject_items",
      timeMs: tanggal?.getTime() ?? 0,
      tanggal,
      userUid: user.uid,
      userName: user.name,
      category: "reject",
      action: `Reject ${data.status ?? ""}`.trim(),
      detail: `${data.nama_model ?? "-"}${data.nama_warna ? ` - ${data.nama_warna}` : ""} ${data.ukuran ?? ""}: ${data.jumlah ?? 0} pcs, diperbaiki ${data.jumlah_diperbaiki ?? 0}, scrap ${data.jumlah_gagal ?? 0}${data.catatan ? ` - ${data.catatan}` : ""}`,
      reference: data.batch_id ? `Batch ${data.batch_id}` : snap.id,
    };
  }

  function normalizeRejectResolution(snap: QueryDocumentSnapshot<DocumentData>): ActivityRow {
    const data = snap.data();
    const tanggal = toDate(data.timestamp ?? data.createdAt ?? data.updatedAt);
    const user = makeUserName(data, ["dicatat_oleh_uid"], ["dicatat_oleh_nama"]);
    return {
      id: rowId("riwayat_resolusi", snap),
      source: "riwayat_resolusi",
      timeMs: tanggal?.getTime() ?? 0,
      tanggal,
      userUid: user.uid,
      userName: user.name,
      category: "reject",
      action: data.aksi === "tidak_bisa_diperbaiki" ? "Reject scrap" : "Reject diperbaiki",
      detail: `${data.jumlah ?? 0} pcs${data.catatan ? ` - ${data.catatan}` : ""}`,
      reference: snap.ref.parent.parent?.id ? `Reject ${snap.ref.parent.parent.id}` : snap.id,
    };
  }

  async function readRows(): Promise<ActivityRow[]> {
    const [
      prosesSnap,
      stokJadiSnap,
      stokKainHistorySnap,
      barangKeluarSnap,
      keuanganSnap,
      gajiSnap,
      rejectSnap,
      rejectResolutionSnap,
    ] = await Promise.all([
      getDocs(collectionGroup(db, "riwayat_proses")),
      getDocs(collection(db, "riwayat_barang_jadi")),
      getDocs(collectionGroup(db, "riwayat")),
      getDocs(collection(db, "barang_keluar")),
      getDocs(collection(db, "transaksi_keuangan")),
      getDocs(collection(db, "pembayaran_gaji")),
      getDocs(collection(db, "reject_items")),
      getDocs(collectionGroup(db, "riwayat_resolusi")),
    ]);

    return [
      ...prosesSnap.docs.map(normalizeRiwayatProses),
      ...stokJadiSnap.docs.map(normalizeRiwayatBarangJadi),
      ...stokKainHistorySnap.docs.map(normalizeStokKainHistory),
      ...barangKeluarSnap.docs.map(normalizeBarangKeluar),
      ...keuanganSnap.docs.map(normalizeTransaksiKeuangan),
      ...gajiSnap.docs.map(normalizePembayaranGaji),
      ...rejectSnap.docs.map(normalizeReject),
      ...rejectResolutionSnap.docs.map(normalizeRejectResolution),
    ].sort((a, b) => b.timeMs - a.timeMs);
  }

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      allRows = await readRows();
    } catch (e: any) {
      errorMsg = e?.message ?? "Gagal memuat aktivitas akun.";
    } finally {
      loading = false;
    }
  }

  const rowsInPeriod = $derived(allRows.filter((row) => inRange(row.tanggal)));
  const userOptions = $derived.by(() => {
    const map = new Map<string, string>();
    for (const row of rowsInPeriod) {
      map.set(row.userUid || row.userName, row.userName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  });
  const filteredRows = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    return rowsInPeriod.filter((row) => {
      const userOk = userFilter === "semua" || row.userUid === userFilter || row.userName === userFilter;
      const categoryOk = categoryFilter === "semua" || row.category === categoryFilter;
      const queryOk =
        !q ||
        [row.userName, row.action, row.detail, row.reference, categoryLabel(row.category)]
          .join(" ")
          .toLowerCase()
          .includes(q);
      return userOk && categoryOk && queryOk;
    });
  });

  const activeUserCount = $derived(new Set(filteredRows.map((row) => row.userUid || row.userName)).size);
  const activeCategoryCount = $derived(new Set(filteredRows.map((row) => row.category)).size);
  const lastActivity = $derived(filteredRows[0]?.tanggal ?? null);
  const categoryCounts = $derived.by(() =>
    CATEGORY_OPTIONS.filter((item) => item.value !== "semua")
      .map((item) => ({
        label: item.label,
        value: filteredRows.filter((row) => row.category === item.value).length,
      }))
      .filter((item) => item.value > 0),
  );

  async function deleteDocsByQuery(snapPromise: Promise<Awaited<ReturnType<typeof getDocs>>>) {
    const snap = await snapPromise;
    for (let i = 0; i < snap.docs.length; i += 499) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 499).forEach((docSnap) => batch.delete(docSnap.ref));
      await batch.commit();
    }
    return snap.docs.length;
  }

  async function flushActivity() {
    if (flushPassword !== CORRECT_PASSWORD || !flushConfirm) return;
    flushing = true;
    flushMsg = null;
    errorMsg = null;
    try {
      const counts = await Promise.all([
        deleteDocsByQuery(getDocs(collectionGroup(db, "riwayat_proses"))),
        deleteDocsByQuery(getDocs(collection(db, "riwayat_barang_jadi"))),
        deleteDocsByQuery(getDocs(collectionGroup(db, "riwayat"))),
        deleteDocsByQuery(getDocs(collectionGroup(db, "riwayat_resolusi"))),
      ]);
      flushMsg = `Flush selesai. ${counts.reduce((sum, n) => sum + n, 0)} log aktivitas dihapus. Data transaksi bisnis tetap aman.`;
      flushPassword = "";
      flushConfirm = false;
      await load();
    } catch (e: any) {
      errorMsg = e?.message ?? "Gagal flush aktivitas.";
    } finally {
      flushing = false;
    }
  }

  function printReport() {
    const rowsHtml = filteredRows
      .map(
        (row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(formatDateTime(row.tanggal))}</td>
            <td>${escapeHtml(row.userName)}</td>
            <td>${escapeHtml(categoryLabel(row.category))}</td>
            <td>${escapeHtml(row.action)}</td>
            <td>${escapeHtml(row.detail)}</td>
            <td>${escapeHtml(row.reference)}</td>
          </tr>
        `,
      )
      .join("");
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>Laporan Aktivitas Akun</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            body { font-family: Arial, sans-serif; color: #111827; margin: 20px; }
            h1 { font-size: 18px; margin: 0; }
            .muted { color: #6b7280; font-size: 12px; margin-top: 4px; }
            .summary { display: flex; gap: 18px; margin: 14px 0; font-size: 12px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
            th { background: #111827; color: #fff; text-align: left; }
            th, td { border: 1px solid #e5e7eb; padding: 6px; vertical-align: top; }
          </style>
        </head>
        <body>
          <h1>Zarqa - Laporan Aktivitas Akun</h1>
          <div class="muted">Dicetak ${escapeHtml(new Date().toLocaleString("id-ID"))}</div>
          <div class="summary">
            <div>Aktivitas: ${filteredRows.length}</div>
            <div>User: ${activeUserCount}</div>
            <div>Kategori: ${activeCategoryCount}</div>
            <div>Terakhir: ${escapeHtml(formatDateTime(lastActivity))}</div>
          </div>
          <table>
            <thead>
              <tr><th>No</th><th>Waktu</th><th>User</th><th>Kategori</th><th>Aktivitas</th><th>Detail</th><th>Referensi</th></tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="7">Tidak ada aktivitas.</td></tr>'}</tbody>
          </table>
        </body>
      </html>
    `;
    const win = window.open("", "_blank", "width=1100,height=700");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  $effect(() => {
    load();
  });
</script>

<svelte:head><title>Aktivitas Akun - Zarqa ERP</title></svelte:head>

<div class="min-w-0 max-w-full space-y-5 overflow-x-hidden p-6">
  <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
    <div>
      <p class="text-sm text-gray-400">Laporan</p>
      <h1 class="text-2xl font-semibold text-gray-900">Aktivitas Akun</h1>
      <p class="text-gray-500">Audit kegiatan user dari proses produksi, stok, penjualan, keuangan, reject, dan gaji.</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <PeriodSelector bind:dateRange defaultPeriod="hari_ini" />
      <Button variant="outline" onclick={load} disabled={loading}>
        <RefreshCwIcon class="h-4 w-4" />
        Refresh
      </Button>
      <Button onclick={printReport} disabled={filteredRows.length === 0}>
        <DownloadIcon class="h-4 w-4" />
        Cetak Laporan
      </Button>
    </div>
  </div>

  {#if errorMsg}
    <div class="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>
  {/if}
  {#if flushMsg}
    <div class="rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{flushMsg}</div>
  {/if}

  <div class="grid gap-3 md:grid-cols-4">
    <div class="rounded-lg border bg-white p-4 shadow-sm">
      <p class="text-sm text-gray-500">Total Aktivitas</p>
      <p class="mt-2 text-3xl font-semibold text-gray-900">{filteredRows.length}</p>
    </div>
    <div class="rounded-lg border bg-white p-4 shadow-sm">
      <p class="text-sm text-gray-500">User Aktif</p>
      <p class="mt-2 text-3xl font-semibold text-blue-700">{activeUserCount}</p>
    </div>
    <div class="rounded-lg border bg-white p-4 shadow-sm">
      <p class="text-sm text-gray-500">Kategori</p>
      <p class="mt-2 text-3xl font-semibold text-teal-700">{activeCategoryCount}</p>
    </div>
    <div class="rounded-lg border bg-white p-4 shadow-sm">
      <p class="text-sm text-gray-500">Aktivitas Terakhir</p>
      <p class="mt-2 text-lg font-semibold text-gray-900">{formatDateTime(lastActivity)}</p>
    </div>
  </div>

  <section class="rounded-lg border bg-white p-4 shadow-sm">
    <div class="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
      <div class="relative">
        <SearchIcon class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input bind:value={searchQuery} class="pl-9" placeholder="Cari aktivitas, detail, referensi..." />
      </div>
      <select bind:value={userFilter} class="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-xs">
        <option value="semua">Semua User</option>
        {#each userOptions as [uid, name] (uid)}
          <option value={uid}>{name}</option>
        {/each}
      </select>
      <select bind:value={categoryFilter} class="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-xs">
        {#each CATEGORY_OPTIONS as item (item.value)}
          <option value={item.value}>{item.label}</option>
        {/each}
      </select>
    </div>
    {#if categoryCounts.length}
      <div class="mt-4 flex flex-wrap gap-2">
        {#each categoryCounts as item (item.label)}
          <span class="rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">{item.label}: {item.value}</span>
        {/each}
      </div>
    {/if}
  </section>

  <section class="overflow-hidden rounded-lg border bg-white shadow-sm">
    <div class="flex items-center justify-between border-b px-4 py-3">
      <div>
        <h2 class="font-semibold text-gray-900">Daftar Aktivitas</h2>
        <p class="text-sm text-gray-500">Menampilkan aktivitas sesuai filter aktif.</p>
      </div>
      {#if loading}
        <span class="text-sm text-gray-400">Memuat...</span>
      {:else}
        <span class="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700">{filteredRows.length} aktivitas</span>
      {/if}
    </div>
    <div class="min-w-0 max-w-full overflow-x-auto">
      <Table.Root class="min-w-[980px]">
        <Table.Header>
          <Table.Row>
            <Table.Head class="w-44">Waktu</Table.Head>
            <Table.Head class="w-48">User</Table.Head>
            <Table.Head class="w-36">Kategori</Table.Head>
            <Table.Head class="w-48">Aktivitas</Table.Head>
            <Table.Head>Detail</Table.Head>
            <Table.Head class="w-44">Referensi</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#if filteredRows.length === 0}
            <Table.Row>
              <Table.Cell colspan={6} class="h-28 text-center text-gray-400">
                {loading ? "Memuat aktivitas..." : "Tidak ada aktivitas pada filter ini."}
              </Table.Cell>
            </Table.Row>
          {:else}
            {#each filteredRows as row (row.id)}
              <Table.Row>
                <Table.Cell class="text-sm text-gray-600">{formatDateTime(row.tanggal)}</Table.Cell>
                <Table.Cell>
                  <p class="font-medium text-gray-900">{row.userName}</p>
                  <p class="text-xs text-gray-400">{row.userUid}</p>
                </Table.Cell>
                <Table.Cell>
                  <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                    {categoryLabel(row.category)}
                  </span>
                </Table.Cell>
                <Table.Cell class="font-medium text-gray-900">{row.action}</Table.Cell>
                <Table.Cell class="text-sm text-gray-600">{row.detail}</Table.Cell>
                <Table.Cell class="text-xs text-gray-400">{row.reference}</Table.Cell>
              </Table.Row>
            {/each}
          {/if}
        </Table.Body>
      </Table.Root>
    </div>
  </section>

  <section class="rounded-lg border border-red-100 bg-red-50 p-4 shadow-sm">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div class="max-w-2xl">
        <h2 class="font-semibold text-red-900">Flush Aktivitas</h2>
        <p class="mt-1 text-sm text-red-700">
          Menghapus log riwayat proses, stok barang jadi, stok kain, dan resolusi reject. Data inti seperti barang keluar, transaksi keuangan, pembayaran gaji, stok, model, dan akun tidak dihapus.
        </p>
      </div>
      <div class="grid gap-2 sm:min-w-[360px]">
        <label class="flex items-center gap-2 text-sm font-medium text-red-800">
          <input type="checkbox" bind:checked={flushConfirm} class="h-4 w-4 rounded border-red-300" />
          Saya paham log aktivitas akan dihapus permanen
        </label>
        <div class="flex gap-2">
          <Input type="password" bind:value={flushPassword} placeholder="Password flush" class="bg-white" />
          <Button variant="destructive" onclick={flushActivity} disabled={flushing || !flushConfirm || flushPassword !== CORRECT_PASSWORD}>
            <TrashIcon class="h-4 w-4" />
            {flushing ? "Flush..." : "Flush"}
          </Button>
        </div>
      </div>
    </div>
  </section>
</div>
