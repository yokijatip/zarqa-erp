<script lang="ts">
  import {
    getPenggajianPeriode,
    hitungGajiKaryawan,
    simpanPembayaranGaji,
    getPembayaranGajiPeriode,
    type TarifCetakInput
  } from "$lib/firebase/penggajian";
  import { getKaryawanList } from "$lib/firebase/karyawan";
  import { getModelBajuList } from "$lib/firebase/model-baju";
  import { isKaryawanManager, currentUser } from "$lib/stores/auth.store";
  import { type DateRange, getPeriodRange } from "$lib/period";
  import type { UserProfile, DivisiProduksi, TipePenggajian, ModelBaju } from "$lib/types";
  import PeriodSelector from "$lib/components/period-selector.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Table from "$lib/components/ui/table";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import StatCard from "$lib/components/StatCard.svelte";
  import BanknoteIcon from "@lucide/svelte/icons/banknote";
  import ScissorsIcon from "@lucide/svelte/icons/scissors";
  import ShirtIcon from "@lucide/svelte/icons/shirt";
  import FlameIcon from "@lucide/svelte/icons/flame";
  import PackageIcon from "@lucide/svelte/icons/package";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import PrinterIcon from "@lucide/svelte/icons/printer";
  import CheckIcon from "@lucide/svelte/icons/check";
  import AlertTriangleIcon from "@lucide/svelte/icons/triangle-alert";

  // ── State ──────────────────────────────────────────────────────────
  let dateRange = $state<DateRange>(getPeriodRange("minggu_ini"));
  let data = $state<Awaited<ReturnType<typeof getPenggajianPeriode>>>([]);
  let karyawanList = $state<UserProfile[]>([]);
  let modelBajuList = $state<ModelBaju[]>([]);
  let pembayaranList = $state<Awaited<ReturnType<typeof getPembayaranGajiPeriode>>>([]);
  let loading = $state(true);
  let errorMsg = $state<string | null>(null);
  let exportingPdf = $state(false);
  let exportingRekap = $state(false);
  let payrollMode = $state<"produksi" | "reguler">("produksi");

  // Filter tabs
  let activeTab = $state<TipePenggajian | "all">("all");

  // Dialog cetak
  let cetakDialogOpen = $state(false);
  let selectedKaryawan = $state<(typeof data)[0] | null>(null);
  let regulerDialogOpen = $state(false);
  let selectedReguler = $state<UserProfile | null>(null);
  let nominalReguler = $state("");
  let catatanReguler = $state("");
  let tarifInputs = $state<Array<{ nama_model: string; tarif: string }>>([]);
  let calculatedSalary = $state<ReturnType<typeof hitungGajiKaryawan> | null>(null);

  // Status daftar gaji (sudah dicetak / belum)
  let printedSet = $state<Set<string>>(new Set());

  const DIVISI_CONFIG: Record<DivisiProduksi, { label: string; icon: typeof ScissorsIcon; color: string }> = {
    Cutting: { label: "Cutting", icon: ScissorsIcon, color: "blue" },
    Jahit: { label: "Jahit", icon: ShirtIcon, color: "purple" },
    Steam: { label: "Steam", icon: FlameIcon, color: "orange" },
  };

  const TIPE_LABEL: Record<TipePenggajian, string> = {
    harian: "Harian",
    mingguan: "Mingguan",
    bulanan: "Bulanan",
    tahunan: "Tahunan",
  };
  const TIPE_OPTIONS: TipePenggajian[] = [
    "harian",
    "mingguan",
    "bulanan",
    "tahunan",
  ];

  // ── Derived ────────────────────────────────────────────────────────
  let karyawanMap = $derived(new Map(karyawanList.map(k => [k.uid, k])));
  let modelBajuMap = $derived(new Map(modelBajuList.map(m => [m.nama_model, m])));

  const PRODUKSI_ROLES = new Set(["kepala_cutting", "kepala_jahit", "kepala_steam"]);

  let karyawanReguler = $derived.by(() =>
    karyawanList
      .filter((k) =>
        k.status_kerja !== "nonaktif" &&
        !PRODUKSI_ROLES.has(k.role) &&
        k.role !== "developer" &&
        k.role !== "owner"
      )
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  let filteredData = $derived.by(() => {
    if (activeTab === "all") return data;
    return data.filter(d => {
      const k = karyawanMap.get(d.uid);
      return k?.tipe_penggajian === activeTab;
    });
  });

  let stats = $derived.by(() => {
    // Hitung pcs baju unik per batch agar tidak berlipat 3x dari total pengerjaan divisi
    const batchPcsMap = new Map<string, number>();
    for (const d of data) {
      for (const b of d.breakdown) {
        const key = `${b.batch_id}__${b.nama_model}__${b.ukuran}`;
        batchPcsMap.set(key, Math.max(batchPcsMap.get(key) ?? 0, b.pcs));
      }
    }
    const totalPcs = [...batchPcsMap.values()].reduce((s, v) => s + v, 0);
    const totalKaryawan = new Set(data.map(d => d.uid)).size;
    const belumDicetak = data.filter(d => !printedSet.has(d.uid)).length;
    return { totalPcs, totalKaryawan, belumDicetak };
  });

  let regulerStats = $derived.by(() => {
    const totalKaryawan = karyawanReguler.length;
    const totalGaji = karyawanReguler.reduce((sum, k) => sum + (k.gaji_pokok ?? 0), 0);
    const belumDicetak = karyawanReguler.filter((k) => !printedSet.has(k.uid)).length;
    return { totalKaryawan, totalGaji, belumDicetak };
  });

  let periodeLabel = $derived.by(() => {
    if (!dateRange) return "Semua Data";
    const fmt = (d: Date) => d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
    return `${fmt(dateRange.start)} — ${fmt(dateRange.end)}`;
  });

  // ── Helpers ────────────────────────────────────────────────────────
  function rupiah(n: number): string {
    return `Rp${Math.round(n).toLocaleString("id-ID")}`;
  }

  function formatDate(dateStr: string): string {
    // Convert "09 Agt 2026 14:30" format to display
    return dateStr;
  }

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      const [penggajian, karyawan, pembayaran, models] = await Promise.all([
        getPenggajianPeriode(dateRange),
        getKaryawanList(),
        getPembayaranGajiPeriode(dateRange),
        getModelBajuList(),
      ]);
      data = penggajian;
      karyawanList = karyawan;
      pembayaranList = pembayaran;
      modelBajuList = models;

      const paidSet = new Set<string>();
      for (const p of pembayaran) {
        if (p.karyawan_uid) {
          paidSet.add(p.karyawan_uid);
        }
      }
      printedSet = paidSet;
    } catch (e) {
      console.error(e);
      errorMsg = "Gagal memuat data penggajian.";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    dateRange;
    load();
  });

  // ── Dialog Cetak ──────────────────────────────────────────────────
  function bukaDialogCetak(k: (typeof data)[0]) {
    selectedKaryawan = k;
    // Inisialisasi tarif inputs dari breakdown (unique per model)
    // Jika model baju memiliki tarif default per divisi, isi sebagai nilai awal
    const uniqueModels = [...new Set(k.breakdown.map(b => b.nama_model))];
    tarifInputs = uniqueModels.map(modelName => {
      const mObj = modelBajuMap.get(modelName);
      let defaultTarif = "";
      if (mObj) {
        if (k.divisi === "Cutting" && mObj.tarif_cutting) defaultTarif = String(mObj.tarif_cutting);
        else if (k.divisi === "Jahit" && mObj.tarif_jahit) defaultTarif = String(mObj.tarif_jahit);
        else if (k.divisi === "Steam" && mObj.tarif_steam) defaultTarif = String(mObj.tarif_steam);
      }
      return {
        nama_model: modelName,
        tarif: defaultTarif,
      };
    });
    calculatedSalary = null;
    cetakDialogOpen = true;
  }

  function bukaDialogReguler(k: UserProfile) {
    selectedReguler = k;
    nominalReguler = String(k.gaji_pokok ?? 0);
    catatanReguler = "";
    regulerDialogOpen = true;
  }

  function hitungTotal() {
    if (!selectedKaryawan) return;
    const tarifList: TarifCetakInput[] = tarifInputs.map(t => ({
      nama_model: t.nama_model,
      tarif_per_pcs: Number(t.tarif) || 0,
    }));
    calculatedSalary = hitungGajiKaryawan(selectedKaryawan, tarifList);
  }

  $effect(() => {
    // Recalculate whenever tarif changes
    tarifInputs;
    if (cetakDialogOpen) {
      hitungTotal();
    }
  });

  // ── Export PDF ─────────────────────────────────────────────────────
  async function exportPdf() {
    if (!selectedKaryawan || !calculatedSalary) return;

    exportingPdf = true;
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const marginX = 14;

      // Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(20, 20, 20);
      doc.text("Zarqa — Laporan Gaji Karyawan", marginX, 18);

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

      // Info Karyawan
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(20, 20, 20);
      doc.text(selectedKaryawan.nama, marginX, 42);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 90);
      doc.text(`Divisi: ${selectedKaryawan.divisi}`, marginX, 48);

      let cursorY = 54;

      // Tabel breakdown detail
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      doc.text("Rincian Per Model Baju", marginX, cursorY);

      const body = calculatedSalary.detail_per_model.flatMap(d =>
        d.detail_warna_ukuran.map(w => [
          d.nama_model,
          w.nama_warna ?? "—",
          w.ukuran,
          String(w.pcs),
          rupiah(d.tarif),
          rupiah(w.pcs * d.tarif),
        ])
      );

      // Add totals per model
      const modelTotals = calculatedSalary.detail_per_model.map(d => [
        d.nama_model,
        "", "", "",
        "Subtotal:",
        rupiah(d.subtotal),
      ]);

      autoTable(doc, {
        startY: cursorY + 4,
        head: [["Model", "Warna", "Ukuran", "Pcs", "Tarif/Pcs", "Subtotal"]],
        body: [...body, ...modelTotals],
        foot: [
          ["", "", "", String(selectedKaryawan.total_pcs), "TOTAL GAJI:", rupiah(calculatedSalary.total_gaji)],
        ],
        theme: "grid",
        margin: { left: marginX, right: marginX },
        styles: { font: "helvetica", fontSize: 8, cellPadding: 2, lineColor: [230, 230, 230], lineWidth: 0.1 },
        headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: "bold" },
        footStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 25 }, 2: { cellWidth: 20 }, 3: { halign: "center", cellWidth: 15 }, 4: { halign: "right", cellWidth: 30 }, 5: { halign: "right", cellWidth: 35 } },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        didParseCell: function(data: any) {
          // Style subtotal rows
          if (data.row.index >= body.length && data.row.index < body.length + modelTotals.length) {
            data.cell.styles.fillColor = [240, 240, 245];
            data.cell.styles.fontStyle = "bold";
          }
        },
      });

      cursorY = ((doc as any).lastAutoTable?.finalY ?? cursorY) + 10;

      // Tanda tangan
      if (cursorY > 230) {
        doc.addPage();
        cursorY = 18;
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      doc.text("Hormat kami,", pageWidth - marginX - 50, cursorY + 20);
      doc.text("(....................)", pageWidth - marginX - 50, cursorY + 35);
      doc.text("Penerima", pageWidth - marginX - 50, cursorY + 42);

      // Footer
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
      doc.save(`gaji-${selectedKaryawan.nama.replace(/\s+/g, '-')}-${tanggal}.pdf`);

      // Simpan status pembayaran ke Firestore agar persisten setelah refresh
      let activeUser: any = null;
      const unsub = currentUser.subscribe(u => (activeUser = u));
      unsub();

      await simpanPembayaranGaji({
        karyawan_uid: selectedKaryawan.uid,
        karyawan_nama: selectedKaryawan.nama,
        divisi: selectedKaryawan.divisi,
        periode_start: dateRange ? dateRange.start.toISOString() : new Date().toISOString(),
        periode_end: dateRange ? dateRange.end.toISOString() : new Date().toISOString(),
        total_pcs: selectedKaryawan.total_pcs,
        total_gaji: calculatedSalary.total_gaji,
        detail_per_model: calculatedSalary.detail_per_model.map(d => ({
          nama_model: d.nama_model,
          total_pcs: d.total_pcs,
          tarif: d.tarif,
          subtotal: d.subtotal,
        })),
        created_by_uid: activeUser?.uid,
        created_by_nama: activeUser?.displayName || activeUser?.nama || activeUser?.email || "Admin",
      });

      // Tandai sudah dicetak
      printedSet.add(selectedKaryawan.uid);
      printedSet = new Set(printedSet);
      cetakDialogOpen = false;
    } catch (e) {
      console.error("Gagal membuat PDF:", e);
      errorMsg = "Gagal membuat PDF.";
    } finally {
      exportingPdf = false;
    }
  }

  async function exportRegulerPdf() {
    if (!selectedReguler) return;
    const nominal = Number(nominalReguler) || 0;
    if (nominal <= 0) {
      errorMsg = "Nominal gaji reguler harus lebih dari 0.";
      return;
    }

    exportingPdf = true;
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const marginX = 14;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Zarqa - Slip Gaji Karyawan Reguler", marginX, 18);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Periode: ${periodeLabel}`, marginX, 28);
      doc.text(`Dicetak: ${new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`, pageWidth - marginX, 28, { align: "right" });

      autoTable(doc, {
        startY: 38,
        head: [["Komponen", "Keterangan"]],
        body: [
          ["Nama", selectedReguler.name],
          ["Email", selectedReguler.email],
          ["Role", selectedReguler.role.replaceAll("_", " ")],
          ["Divisi/Jabatan", selectedReguler.divisi || selectedReguler.jabatan || "-"],
          ["Tipe Penggajian", selectedReguler.tipe_penggajian ? TIPE_LABEL[selectedReguler.tipe_penggajian] : "Reguler"],
          ["Catatan", catatanReguler || "-"],
          ["Total Gaji", rupiah(nominal)],
        ],
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [17, 24, 39] },
      });

      doc.text("Penerima,", pageWidth - marginX - 45, 105);
      doc.text("(....................)", pageWidth - marginX - 45, 125);

      const tanggal = new Date().toISOString().slice(0, 10);
      doc.save(`gaji-reguler-${selectedReguler.name.replace(/\s+/g, "-")}-${tanggal}.pdf`);

      let activeUser: any = null;
      const unsub = currentUser.subscribe(u => (activeUser = u));
      unsub();

      await simpanPembayaranGaji({
        karyawan_uid: selectedReguler.uid,
        karyawan_nama: selectedReguler.name,
        divisi: selectedReguler.divisi || selectedReguler.jabatan || "Staff",
        periode_start: dateRange ? dateRange.start.toISOString() : new Date().toISOString(),
        periode_end: dateRange ? dateRange.end.toISOString() : new Date().toISOString(),
        total_pcs: 0,
        total_gaji: nominal,
        detail_per_model: [],
        created_by_uid: activeUser?.uid,
        created_by_nama: activeUser?.displayName || activeUser?.nama || activeUser?.email || "Admin",
      });

      printedSet.add(selectedReguler.uid);
      printedSet = new Set(printedSet);
      regulerDialogOpen = false;
    } catch (e) {
      console.error("Gagal membuat PDF reguler:", e);
      errorMsg = "Gagal membuat PDF gaji reguler.";
    } finally {
      exportingPdf = false;
    }
  }

  // ── Export PDF Rekap Keseluruhan ───────────────────────────────────
  async function exportRekapKeseluruhanPdf() {
    if (data.length === 0) return;
    exportingRekap = true;
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const marginX = 14;

      // Header Laporan
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(20, 20, 20);
      doc.text("ZARQA — Laporan Rekapitulasi Gaji Keseluruhan", marginX, 18);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 90);
      doc.text("Konveksi Busana Muslim", marginX, 24);
      doc.text(`Periode: ${periodeLabel}`, marginX, 30);
      doc.text(
        `Dicetak: ${new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`,
        pageWidth - marginX,
        30,
        { align: "right" }
      );
      doc.setDrawColor(230, 230, 230);
      doc.line(marginX, 34, pageWidth - marginX, 34);

      // Ringkasan Atas
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      doc.text("Ringkasan Penggajian Karyawan", marginX, 42);

      let totalGajiSemua = 0;
      const totalPcsSemua = stats.totalPcs;

      const rows = data.map((d, index) => {
        const k = karyawanMap.get(d.uid);
        const sudahDibayar = printedSet.has(d.uid);
        const pembayaranRec = pembayaranList.find(p => p.karyawan_uid === d.uid);

        let totalGajiKaryawan = 0;
        let rincianTarifStr = "";

        if (pembayaranRec) {
          totalGajiKaryawan = pembayaranRec.total_gaji;
          rincianTarifStr = (pembayaranRec.detail_per_model || [])
            .map(m => `${m.nama_model} (${m.total_pcs} pcs @ ${rupiah(m.tarif)})`)
            .join(", ");
        } else {
          // Hitung dari tarif default model jika ada
          const uniqueModels = [...new Set(d.breakdown.map(b => b.nama_model))];
          const tarifList: TarifCetakInput[] = uniqueModels.map(modelName => {
            const mObj = modelBajuMap.get(modelName);
            let t = 0;
            if (mObj) {
              if (d.divisi === "Cutting") t = mObj.tarif_cutting ?? 0;
              else if (d.divisi === "Jahit") t = mObj.tarif_jahit ?? 0;
              else if (d.divisi === "Steam") t = mObj.tarif_steam ?? 0;
            }
            return { nama_model: modelName, tarif_per_pcs: t };
          });
          const cal = hitungGajiKaryawan(d, tarifList);
          totalGajiKaryawan = cal.total_gaji;
          rincianTarifStr = cal.detail_per_model
            .map(m => `${m.nama_model} (${m.total_pcs} pcs${m.tarif > 0 ? ` @ ${rupiah(m.tarif)}` : ""})`)
            .join(", ");
        }

        totalGajiSemua += totalGajiKaryawan;

        return [
          String(index + 1),
          d.nama,
          d.divisi,
          k?.tipe_penggajian ? TIPE_LABEL[k.tipe_penggajian] : "—",
          `${d.total_pcs} pcs`,
          rincianTarifStr || "—",
          rupiah(totalGajiKaryawan),
          sudahDibayar ? "Sudah Dibayar" : "Belum Dibayar",
        ];
      });

      autoTable(doc, {
        startY: 46,
        head: [["No", "Nama Karyawan", "Divisi", "Tipe", "Total Pcs", "Rincian Pekerjaan & Tarif", "Total Gaji", "Status"]],
        body: rows,
        foot: [
          ["", "TOTAL", "", "", `${totalPcsSemua} pcs`, "", rupiah(totalGajiSemua), `${printedSet.size}/${data.length} Dibayar`],
        ],
        theme: "grid",
        margin: { left: marginX, right: marginX },
        styles: { font: "helvetica", fontSize: 8, cellPadding: 2.5, lineColor: [230, 230, 230], lineWidth: 0.1 },
        headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: "bold" },
        footStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: "bold" },
        columnStyles: {
          0: { halign: "center", cellWidth: 10 },
          1: { cellWidth: 32 },
          2: { cellWidth: 18 },
          3: { cellWidth: 18 },
          4: { halign: "center", cellWidth: 20 },
          5: { cellWidth: 45 },
          6: { halign: "right", cellWidth: 25 },
          7: { halign: "center", cellWidth: 22 },
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
      });

      let cursorY = ((doc as any).lastAutoTable?.finalY ?? 100) + 14;

      if (cursorY > 230) {
        doc.addPage();
        cursorY = 18;
      }

      // Area Tanda Tangan
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      doc.text("Disetujui Oleh,", marginX + 10, cursorY + 10);
      doc.text("( Owner / Manager )", marginX + 10, cursorY + 26);

      doc.text("Dibuat Oleh,", pageWidth - marginX - 50, cursorY + 10);
      doc.text("( Keuangan / HR )", pageWidth - marginX - 50, cursorY + 26);

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
      doc.save(`rekap-gaji-keseluruhan-${tanggal}.pdf`);
    } catch (e) {
      console.error("Gagal membuat PDF rekap:", e);
      errorMsg = "Gagal membuat PDF rekapitulasi gaji.";
    } finally {
      exportingRekap = false;
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
    <h1 class="text-xl font-semibold text-gray-900">Penggajian</h1>
    <p class="mt-0.5 text-sm text-gray-500">
      {payrollMode === "produksi"
        ? `Karyawan produksi berbasis hasil pcs pada periode: ${periodeLabel}`
        : `Karyawan reguler/staff berbasis gaji pokok pada periode: ${periodeLabel}`}
    </p>
  </div>
  <div class="flex items-center gap-2 flex-wrap">
    <Button
      variant="default"
      class="bg-indigo-600 hover:bg-indigo-700 text-white"
      onclick={exportRekapKeseluruhanPdf}
      disabled={payrollMode !== "produksi" || exportingRekap || data.length === 0}
    >
      <PrinterIcon class="h-4 w-4" />
      {exportingRekap ? "Memproses PDF..." : "Cetak Rekap Gaji Keseluruhan"}
    </Button>
    <PeriodSelector bind:dateRange defaultPeriod="minggu_ini" />
    <Button variant="outline" onclick={() => load()}>
      <svg class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
      Refresh
    </Button>
  </div>
</div>

{#if errorMsg}
  <div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>
{/if}

<div class="mb-5 flex flex-wrap gap-2 rounded-xl border border-gray-100 bg-white p-2 shadow-sm sm:w-fit">
  <Button
    variant={payrollMode === "produksi" ? "default" : "ghost"}
    onclick={() => (payrollMode = "produksi")}
  >
    Produksi / Borongan
  </Button>
  <Button
    variant={payrollMode === "reguler" ? "default" : "ghost"}
    onclick={() => (payrollMode = "reguler")}
  >
    Reguler / Staff
  </Button>
</div>

<!-- ── Stats ──────────────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
  {#if payrollMode === "produksi"}
    <StatCard title="Total Pcs" value={stats.totalPcs} icon={PackageIcon} {loading} footerSubtext="pcs diselesaikan" />
    <StatCard title="Karyawan Produksi" value={stats.totalKaryawan} icon={BanknoteIcon} {loading} footerSubtext="dalam periode ini" />
    <StatCard
      title="Belum Dibayar"
      value={stats.belumDicetak}
      icon={AlertTriangleIcon}
      {loading}
      footerSubtext={stats.belumDicetak > 0 ? "klik cetak untuk bayar" : "semua sudah dibayar"}
      class={stats.belumDicetak > 0 ? "border-amber-100 bg-amber-50" : "border-green-100 bg-green-50"}
      valueClass={stats.belumDicetak > 0 ? "text-amber-600" : "text-green-700"}
    />
  {:else}
    <StatCard title="Karyawan Reguler" value={regulerStats.totalKaryawan} icon={BanknoteIcon} {loading} footerSubtext="staff aktif" />
    <StatCard title="Estimasi Gaji" value={rupiah(regulerStats.totalGaji)} icon={PackageIcon} {loading} footerSubtext="dari gaji pokok" />
    <StatCard
      title="Belum Dibayar"
      value={regulerStats.belumDicetak}
      icon={AlertTriangleIcon}
      {loading}
      footerSubtext={regulerStats.belumDicetak > 0 ? "klik bayar untuk proses" : "semua sudah dibayar"}
      class={regulerStats.belumDicetak > 0 ? "border-amber-100 bg-amber-50" : "border-green-100 bg-green-50"}
      valueClass={regulerStats.belumDicetak > 0 ? "text-amber-600" : "text-green-700"}
    />
  {/if}
</div>

<!-- ── Filter Tabs ─────────────────────────────────────────────────── -->
{#if payrollMode === "produksi"}
<div class="mb-4 flex items-center gap-2 border-b border-gray-200">
  <button
    onclick={() => (activeTab = "all")}
    class="px-4 py-2 text-sm font-medium transition {activeTab === 'all' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}"
  >
    Semua ({data.length})
  </button>
  {#each TIPE_OPTIONS as tipe}
    {@const count = data.filter(d => karyawanMap.get(d.uid)?.tipe_penggajian === tipe).length}
    <button
      onclick={() => (activeTab = tipe)}
      class="px-4 py-2 text-sm font-medium transition {activeTab === tipe ? 'border-b-2 border-purple-600 text-purple-600' : 'text-gray-500 hover:text-gray-700'}"
    >
      {TIPE_LABEL[tipe]} ({count})
    </button>
  {/each}
</div>

<!-- ── Tabel Karyawan ─────────────────────────────────────────────── -->
{#if loading}
  <div class="rounded-xl border border-gray-100 bg-white p-8">
    <div class="space-y-3">
      {#each Array(3) as _}
        <div class="h-12 w-full animate-pulse rounded bg-gray-100"></div>
      {/each}
    </div>
  </div>
{:else if filteredData.length === 0}
  <div class="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-100 bg-white py-16">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
      <BanknoteIcon class="h-7 w-7 text-gray-300" />
    </div>
    <p class="text-sm font-medium text-gray-500">Belum ada karyawan yang menyelesaikan pcs</p>
    <p class="text-xs text-gray-400">pada periode ini</p>
  </div>
{:else}
  <div class="space-y-4">
    {#each filteredData as k}
      {@const karyawan = karyawanMap.get(k.uid)}
      {@const cfg = DIVISI_CONFIG[k.divisi]}
      {@const DivisiIcon = cfg.icon}
      {@const sudahDicetak = printedSet.has(k.uid)}
      <div class="rounded-xl border {sudahDicetak ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-white'} p-4 shadow-sm">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-full {sudahDicetak ? 'bg-green-100' : 'bg-gray-100'}">
              {#if sudahDicetak}
                <CheckIcon class="h-5 w-5 text-green-600" />
              {:else}
                <DivisiIcon class="h-5 w-5 text-gray-500" />
              {/if}
            </div>
            <div>
              <p class="font-semibold text-gray-800">{k.nama}</p>
              <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                <span class="rounded-full bg-{cfg.color}-50 px-2 py-0.5 text-xs font-medium text-{cfg.color}-700">
                  {cfg.label}
                </span>
                {#if karyawan?.tipe_penggajian}
                  <span class="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                    {TIPE_LABEL[karyawan.tipe_penggajian]}
                  </span>
                {/if}
                {#if sudahDicetak}
                  <span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Sudah Dibayar
                  </span>
                {:else}
                  <span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Belum Dibayar
                  </span>
                {/if}
              </div>
            </div>
          </div>
          <div class="text-right">
            <p class="text-sm font-semibold text-gray-800">{k.total_pcs} pcs</p>
            <p class="text-xs text-gray-500">{k.jumlah_batch} batch</p>
          </div>
        </div>

        <!-- Breakdown detail per model, warna, ukuran, tanggal -->
        {#if k.breakdown.length > 0}
          <div class="mt-3 border-t border-gray-100 pt-3">
            <p class="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Detail pekerjaan:</p>
            <div class="overflow-x-auto">
              <Table.Root>
                <Table.Header>
                  <Table.Row class="bg-gray-50">
                    <Table.Head>Model</Table.Head>
                    <Table.Head>Warna</Table.Head>
                    <Table.Head class="text-center">Ukuran</Table.Head>
                    <Table.Head class="text-center">Pcs</Table.Head>
                    <Table.Head>Tanggal</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each k.breakdown as b}
                    <Table.Row>
                      <Table.Cell class="font-medium">{b.nama_model}</Table.Cell>
                      <Table.Cell class="text-gray-600">{b.nama_warna ?? "—"}</Table.Cell>
                      <Table.Cell class="text-center text-gray-600">{b.ukuran}</Table.Cell>
                      <Table.Cell class="text-center font-semibold">{b.pcs}</Table.Cell>
                      <Table.Cell class="text-xs text-gray-500">{formatDate(b.tanggal)}</Table.Cell>
                    </Table.Row>
                  {/each}
                </Table.Body>
              </Table.Root>
            </div>
          </div>
        {/if}

        <!-- Action -->
        <div class="mt-3 flex justify-end">
          <Button onclick={() => bukaDialogCetak(k)} variant={sudahDicetak ? "outline" : "default"}>
            <DownloadIcon class="h-4 w-4" />
            {sudahDicetak ? "Cetak Ulang PDF" : "Cetak & Bayar"}
          </Button>
        </div>
      </div>
    {/each}
  </div>
{/if}

{:else}
{#if loading}
  <div class="rounded-xl border border-gray-100 bg-white p-8">
    <div class="space-y-3">
      {#each Array(3) as _}
        <div class="h-12 w-full animate-pulse rounded bg-gray-100"></div>
      {/each}
    </div>
  </div>
{:else if karyawanReguler.length === 0}
  <div class="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-100 bg-white py-16">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
      <BanknoteIcon class="h-7 w-7 text-gray-300" />
    </div>
    <p class="text-sm font-medium text-gray-500">Belum ada karyawan reguler atau staff aktif</p>
    <p class="text-xs text-gray-400">atur role dan gaji pokok dari data karyawan</p>
  </div>
{:else}
  <div class="rounded-xl border border-gray-100 bg-white shadow-sm">
    <Table.Root>
      <Table.Header>
        <Table.Row class="bg-gray-50">
          <Table.Head>Karyawan</Table.Head>
          <Table.Head>Role</Table.Head>
          <Table.Head>Info Kerja</Table.Head>
          <Table.Head>Tipe</Table.Head>
          <Table.Head class="text-right">Gaji Pokok</Table.Head>
          <Table.Head>Status</Table.Head>
          <Table.Head class="text-right">Aksi</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each karyawanReguler as k}
          {@const sudahDicetak = printedSet.has(k.uid)}
          <Table.Row class={sudahDicetak ? "bg-green-50/70" : ""}>
            <Table.Cell>
              <div>
                <p class="font-semibold text-gray-900">{k.name}</p>
                <p class="text-xs text-gray-500">{k.email}</p>
              </div>
            </Table.Cell>
            <Table.Cell>
              <span class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                {k.role.replaceAll("_", " ")}
              </span>
            </Table.Cell>
            <Table.Cell class="text-sm text-gray-600">
              {k.divisi || k.jabatan || "-"}
            </Table.Cell>
            <Table.Cell>
              <span class="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                {k.tipe_penggajian ? TIPE_LABEL[k.tipe_penggajian] : "Reguler"}
              </span>
            </Table.Cell>
            <Table.Cell class="text-right font-semibold">
              {rupiah(k.gaji_pokok ?? 0)}
            </Table.Cell>
            <Table.Cell>
              {#if sudahDicetak}
                <span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Sudah Dibayar</span>
              {:else}
                <span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Belum Dibayar</span>
              {/if}
            </Table.Cell>
            <Table.Cell class="text-right">
              <Button size="sm" variant={sudahDicetak ? "outline" : "default"} onclick={() => bukaDialogReguler(k)}>
                <DownloadIcon class="h-4 w-4" />
                {sudahDicetak ? "Cetak Ulang" : "Bayar"}
              </Button>
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
{/if}
{/if}

{/if}

<!-- ── Dialog: Cetak Gaji ─────────────────────────────────────────── -->
<Dialog.Root bind:open={cetakDialogOpen}>
  <Dialog.Content class="max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>
        Cetak Gaji: {selectedKaryawan?.nama}
      </Dialog.Title>
      <Dialog.Description>
        Masukkan tarif per pcs untuk setiap model baju yang dikerjakan.
      </Dialog.Description>
    </Dialog.Header>

    {#if selectedKaryawan}
      <div class="max-h-[65vh] space-y-4 overflow-y-auto pr-2">
        <!-- Info Karyawan -->
        <div class="rounded-lg bg-gray-50 p-3">
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500">Divisi</span>
              <span class="font-medium">{selectedKaryawan.divisi}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Total Pcs</span>
              <span class="font-medium">{selectedKaryawan.total_pcs} pcs</span>
            </div>
            <div class="flex justify-between col-span-2">
              <span class="text-gray-500">Periode</span>
              <span class="font-medium">{periodeLabel}</span>
            </div>
          </div>
        </div>

        <!-- Detail Pekerjaan -->
        {#if selectedKaryawan.breakdown.length > 0}
          <div>
            <p class="text-sm font-semibold text-gray-700 mb-2">Detail Pekerjaan:</p>
            <div class="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
              <Table.Root>
                <Table.Header>
                  <Table.Row class="bg-gray-50">
                    <Table.Head>Model</Table.Head>
                    <Table.Head>Warna</Table.Head>
                    <Table.Head class="text-center">Ukuran</Table.Head>
                    <Table.Head class="text-center">Pcs</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each selectedKaryawan.breakdown as b}
                    <Table.Row>
                      <Table.Cell class="text-sm">{b.nama_model}</Table.Cell>
                      <Table.Cell class="text-sm text-gray-600">{b.nama_warna ?? "—"}</Table.Cell>
                      <Table.Cell class="text-center text-sm text-gray-600">{b.ukuran}</Table.Cell>
                      <Table.Cell class="text-center text-sm font-semibold">{b.pcs}</Table.Cell>
                    </Table.Row>
                  {/each}
                </Table.Body>
              </Table.Root>
            </div>
          </div>
        {/if}

        <!-- Input Tarif per Model -->
        <div>
          <p class="text-sm font-semibold text-gray-700 mb-2">Tarif per Model Baju</p>
          <div class="space-y-3">
            {#each tarifInputs as input, i}
              {@const modelData = calculatedSalary?.detail_per_model.find(d => d.nama_model === input.nama_model)}
              <div class="rounded-lg border border-gray-200 p-3">
                <div class="flex justify-between items-center mb-2">
                  <p class="font-medium text-gray-800">{input.nama_model}</p>
                  {#if modelData}
                    <span class="text-sm text-gray-500">{modelData.total_pcs} pcs</span>
                  {/if}
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-sm text-gray-500">Tarif/pcs:</span>
                  <div class="relative flex-1">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">Rp</span>
                    <Input
                      type="number"
                      min="0"
                      bind:value={tarifInputs[i].tarif}
                      placeholder="0"
                      class="pl-8"
                    />
                  </div>
                  {#if modelData && Number(input.tarif) > 0}
                    <span class="text-sm font-medium text-green-600 whitespace-nowrap">
                      = {rupiah(Number(input.tarif) * modelData.total_pcs)}
                    </span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Total -->
        {#if calculatedSalary}
          <div class="rounded-lg border-2 border-green-200 bg-green-50 p-4">
            <div class="flex justify-between items-center">
              <span class="text-lg font-semibold text-gray-800">Total Gaji</span>
              <span class="text-2xl font-bold text-green-700">{rupiah(calculatedSalary.total_gaji)}</span>
            </div>
            {#if calculatedSalary.total_gaji === 0}
              <p class="text-xs text-amber-600 mt-1">Belum ada tarif yang diisi</p>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (cetakDialogOpen = false)}>Batal</Button>
      <Button onclick={exportPdf} disabled={exportingPdf || !calculatedSalary || calculatedSalary.total_gaji === 0}>
        <DownloadIcon class="h-4 w-4" />
        {exportingPdf ? "Membuat PDF..." : "Cetak & Bayar"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={regulerDialogOpen}>
  <Dialog.Content class="max-w-lg">
    <Dialog.Header>
      <Dialog.Title>
        Bayar Gaji Reguler: {selectedReguler?.name}
      </Dialog.Title>
      <Dialog.Description>
        Gaji reguler memakai nominal tetap dari data karyawan dan tidak dihitung dari hasil pcs.
      </Dialog.Description>
    </Dialog.Header>

    {#if selectedReguler}
      <div class="space-y-4">
        <div class="rounded-lg bg-gray-50 p-3 text-sm">
          <div class="flex justify-between gap-4">
            <span class="text-gray-500">Karyawan</span>
            <span class="text-right font-medium">{selectedReguler.name}</span>
          </div>
          <div class="mt-2 flex justify-between gap-4">
            <span class="text-gray-500">Role</span>
            <span class="text-right font-medium">{selectedReguler.role.replaceAll("_", " ")}</span>
          </div>
          <div class="mt-2 flex justify-between gap-4">
            <span class="text-gray-500">Periode</span>
            <span class="text-right font-medium">{periodeLabel}</span>
          </div>
        </div>

        <div>
          <label for="nominal-reguler" class="mb-1 block text-sm font-medium text-gray-700">Nominal Gaji</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">Rp</span>
            <Input
              id="nominal-reguler"
              type="number"
              min="0"
              bind:value={nominalReguler}
              class="pl-8"
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <label for="catatan-reguler" class="mb-1 block text-sm font-medium text-gray-700">Catatan</label>
          <textarea
            id="catatan-reguler"
            bind:value={catatanReguler}
            rows="3"
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder="Opsional"
          ></textarea>
        </div>

        <div class="rounded-lg border border-green-200 bg-green-50 p-4">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-gray-800">Total Dibayar</span>
            <span class="text-xl font-bold text-green-700">{rupiah(Number(nominalReguler) || 0)}</span>
          </div>
        </div>
      </div>
    {/if}

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (regulerDialogOpen = false)}>Batal</Button>
      <Button onclick={exportRegulerPdf} disabled={exportingPdf || (Number(nominalReguler) || 0) <= 0}>
        <DownloadIcon class="h-4 w-4" />
        {exportingPdf ? "Membuat PDF..." : "Cetak & Bayar"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
