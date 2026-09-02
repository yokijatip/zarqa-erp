<script lang="ts">
  import { getPenggajianPeriode, getPembayaranGajiPeriode, type PembayaranGajiRecord } from "$lib/firebase/penggajian";
  import { getKaryawanList, ROLE_LABEL, tipeKaryawanLabel } from "$lib/firebase/karyawan";
  import { isKaryawanManager } from "$lib/stores/auth.store";
  import { type DateRange, getPeriodRange } from "$lib/period";
  import PeriodSelector from "$lib/components/period-selector.svelte";
  import StatCard from "$lib/components/StatCard.svelte";
  import * as Table from "$lib/components/ui/table";
  import { Button } from "$lib/components/ui/button";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import BanknoteIcon from "@lucide/svelte/icons/banknote";
  import UsersIcon from "@lucide/svelte/icons/users";
  import PackageIcon from "@lucide/svelte/icons/package";
  import Clock3Icon from "@lucide/svelte/icons/clock-3";
  import type { UserProfile } from "$lib/types";

  type PayrollRow = Awaited<ReturnType<typeof getPenggajianPeriode>>[number];
  type ReportRow = { uid: string; nama: string; jabatan: string; tipe: string; divisi: string; total_pcs: number; gaji_pokok: number };

  let dateRange = $state<DateRange>(getPeriodRange("semua"));
  let rows = $state<PayrollRow[]>([]);
  let payments = $state<PembayaranGajiRecord[]>([]);
  let employees = $state<UserProfile[]>([]);
  let loading = $state(true);
  let exporting = $state(false);
  let errorMsg = $state<string | null>(null);

  function rupiah(value: number): string {
    return `Rp ${Math.round(value || 0).toLocaleString("id-ID")}`;
  }

  function formatDate(value: string | Date | undefined): string {
    if (!value) return "-";
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  }

  function paymentFor(uid: string): PembayaranGajiRecord | undefined {
    return payments.find((payment) => payment.karyawan_uid === uid);
  }

  const productionRoles = new Set(["kepala_cutting", "kepala_jahit", "kepala_steam"]);
  const productionJabatan: Record<string, string> = { Cutting: "Kepala Cutting", Jahit: "Kepala Jahit", Steam: "Kepala Steam" };
  let reportRows = $derived.by<ReportRow[]>(() => {
    const production = rows.map((row) => ({ uid: row.uid, nama: row.nama, jabatan: productionJabatan[row.divisi] ?? row.divisi, tipe: "Karyawan Produksi", divisi: row.divisi, total_pcs: row.total_pcs, gaji_pokok: 0 }));
    const productionUids = new Set(production.map((row) => row.uid));
    const regular = employees
      .filter((employee) => employee.status_kerja !== "nonaktif" && !productionRoles.has(employee.role) && employee.role !== "owner" && employee.role !== "developer")
      .filter((employee) => !productionUids.has(employee.uid))
      .map((employee) => ({ uid: employee.uid, nama: employee.name, jabatan: employee.jabatan ?? ROLE_LABEL[employee.role] ?? employee.role, tipe: tipeKaryawanLabel(employee.role), divisi: employee.divisi ?? "-", total_pcs: 0, gaji_pokok: employee.gaji_pokok ?? 0 }));
    return [...production, ...regular].sort((a, b) => a.nama.localeCompare(b.nama));
  });
  let totalPcs = $derived(reportRows.reduce((sum, row) => sum + row.total_pcs, 0));
  let totalWorkers = $derived(reportRows.length);
  let paidWorkers = $derived(reportRows.filter((row) => !!paymentFor(row.uid)).length);
  let totalPaid = $derived(payments.reduce((sum, payment) => sum + payment.total_gaji, 0));
  let byDivision = $derived.by(() => {
    const result = new Map<string, { divisi: string; pekerja: number; pcs: number; dibayar: number }>();
    for (const row of reportRows) {
      const item = result.get(row.divisi) ?? { divisi: row.divisi, pekerja: 0, pcs: 0, dibayar: 0 };
      item.pekerja += 1;
      item.pcs += row.total_pcs;
      const payment = paymentFor(row.uid);
      item.dibayar += payment?.total_gaji ?? 0;
      result.set(row.divisi, item);
    }
    return [...result.values()].sort((a, b) => b.pcs - a.pcs);
  });

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      const [payrollRows, paymentRows, employeeRows] = await Promise.all([
        getPenggajianPeriode(dateRange),
        getPembayaranGajiPeriode(dateRange),
        getKaryawanList(),
      ]);
      rows = payrollRows;
      payments = paymentRows;
      employees = employeeRows;
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : "Gagal memuat laporan gaji.";
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
      doc.setFontSize(16);
      doc.text("Zarqa - Laporan Gaji", 14, 16);
      doc.setFontSize(10);
      doc.text(`Periode: ${dateRange ? `${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}` : "Semua data"}`, 14, 23);
      autoTable(doc, {
        startY: 30,
        head: [["Nama", "Divisi", "PCS", "Periode Pembayaran", "Total Dibayar", "Status"]],
        body: reportRows.map((row) => {
          const payment = paymentFor(row.uid);
          return [row.nama, row.jabatan, row.tipe, `${row.total_pcs} pcs`, payment ? `${formatDate(payment.periode_start)} - ${formatDate(payment.periode_end)}` : "-", payment ? rupiah(payment.total_gaji) : rupiah(row.gaji_pokok), payment ? "Sudah Dibayar" : "Belum Dibayar"];
        }),
        theme: "grid",
        styles: { fontSize: 8 },
        headStyles: { fillColor: [17, 24, 39] },
      });
      doc.save(`laporan-gaji-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      exporting = false;
    }
  }

  $effect(() => {
    dateRange;
    load();
  });
</script>

{#if !$isKaryawanManager}
  <div class="flex min-h-[50vh] items-center justify-center text-center">
    <div><h1 class="text-lg font-semibold text-gray-900">Tidak Bisa Mengakses</h1><p class="mt-1 text-sm text-gray-500">Anda tidak memiliki akses ke laporan gaji.</p></div>
  </div>
{:else}
  <div class="space-y-5">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div><p class="text-sm text-gray-500">Laporan</p><h1 class="text-xl font-semibold text-gray-900">Laporan Gaji</h1><p class="mt-1 text-sm text-gray-500">Rekap pekerjaan, status pembayaran, dan riwayat gaji berdasarkan periode.</p></div>
      <div class="flex flex-wrap items-center gap-2"><PeriodSelector bind:dateRange defaultPeriod="semua" /><Button variant="outline" onclick={load} disabled={loading}><RefreshCwIcon class="h-4 w-4 {loading ? 'animate-spin' : ''}" /> Refresh</Button><Button onclick={exportPdf} disabled={exporting}><DownloadIcon class="h-4 w-4" /> {exporting ? "Mencetak..." : "Export PDF"}</Button></div>
    </div>

    {#if errorMsg}<div class="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>{/if}

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard title="Total PCS" value={totalPcs.toLocaleString("id-ID")} icon={PackageIcon} {loading} footerSubtext="pekerjaan selesai" />
      <StatCard title="Total Karyawan" value={String(totalWorkers)} icon={UsersIcon} {loading} footerSubtext="produksi dan reguler" />
      <StatCard title="Sudah Dibayar" value={String(paidWorkers)} icon={BanknoteIcon} {loading} footerSubtext={rupiah(totalPaid)} class="border-green-100 bg-green-50" valueClass="text-green-700" />
      <StatCard title="Belum Dibayar" value={String(Math.max(0, totalWorkers - paidWorkers))} icon={Clock3Icon} {loading} footerSubtext="perlu diproses" class="border-amber-100 bg-amber-50" valueClass="text-amber-700" />
    </div>

    <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 class="text-sm font-semibold text-gray-800">Rekap per Divisi</h2>
      <Table.Root class="mt-4"><Table.Header><Table.Row><Table.Head>Divisi</Table.Head><Table.Head>Karyawan</Table.Head><Table.Head>Total PCS</Table.Head><Table.Head>Total Dibayar</Table.Head></Table.Row></Table.Header><Table.Body>{#each byDivision as row}<Table.Row><Table.Cell class="font-medium">{row.divisi}</Table.Cell><Table.Cell>{row.pekerja}</Table.Cell><Table.Cell>{row.pcs.toLocaleString("id-ID")} pcs</Table.Cell><Table.Cell class="text-green-700">{rupiah(row.dibayar)}</Table.Cell></Table.Row>{:else}<Table.Row><Table.Cell colspan={4} class="text-center text-gray-400">Belum ada data gaji.</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
    </section>

    <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 class="text-sm font-semibold text-gray-800">Daftar Laporan Gaji</h2>
      <Table.Root class="mt-4"><Table.Header><Table.Row><Table.Head>Nama</Table.Head><Table.Head>Jabatan</Table.Head><Table.Head>Tipe Karyawan</Table.Head><Table.Head>Total PCS</Table.Head><Table.Head>Periode</Table.Head><Table.Head>Total Gaji</Table.Head><Table.Head>Status</Table.Head></Table.Row></Table.Header><Table.Body>{#each reportRows as row}{@const payment = paymentFor(row.uid)}<Table.Row><Table.Cell class="font-medium">{row.nama}</Table.Cell><Table.Cell>{row.jabatan}</Table.Cell><Table.Cell>{row.tipe}</Table.Cell><Table.Cell>{row.total_pcs > 0 ? `${row.total_pcs.toLocaleString("id-ID")} pcs` : "-"}</Table.Cell><Table.Cell>{payment ? `${formatDate(payment.periode_start)} - ${formatDate(payment.periode_end)}` : "-"}</Table.Cell><Table.Cell>{payment ? rupiah(payment.total_gaji) : row.gaji_pokok > 0 ? rupiah(row.gaji_pokok) : "-"}</Table.Cell><Table.Cell><span class="rounded-full px-2.5 py-1 text-xs font-medium {payment ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}">{payment ? "Sudah Dibayar" : "Belum Dibayar"}</span></Table.Cell></Table.Row>{:else}<Table.Row><Table.Cell colspan={7} class="text-center text-gray-400">Belum ada data gaji.</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
    </section>

    <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 class="text-sm font-semibold text-gray-800">Riwayat Pembayaran Gaji</h2>
      <Table.Root class="mt-4"><Table.Header><Table.Row><Table.Head>Tanggal</Table.Head><Table.Head>Karyawan</Table.Head><Table.Head>Divisi</Table.Head><Table.Head>Periode</Table.Head><Table.Head>Total</Table.Head></Table.Row></Table.Header><Table.Body>{#each payments as payment}<Table.Row><Table.Cell>{formatDate(payment.created_at?.toDate ? payment.created_at.toDate() : payment.created_at)}</Table.Cell><Table.Cell class="font-medium">{payment.karyawan_nama}</Table.Cell><Table.Cell>{payment.divisi}</Table.Cell><Table.Cell>{formatDate(payment.periode_start)} - {formatDate(payment.periode_end)}</Table.Cell><Table.Cell class="text-green-700">{rupiah(payment.total_gaji)}</Table.Cell></Table.Row>{:else}<Table.Row><Table.Cell colspan={5} class="text-center text-gray-400">Belum ada pembayaran gaji.</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
    </section>
  </div>
{/if}
