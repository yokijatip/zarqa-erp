<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { Chart, registerables } from "chart.js";
  import type {
    BatchProduksi,
    StokKain,
    StokBarangJadi,
    BarangKeluar,
    StatusBatch,
  } from "$lib/types";
  import { STATUS_LABEL } from "$lib/types";

  Chart.register(...registerables);

  // ── Helpers ──────────────────────────────────────────────────────
  function fakeTs(date: Date) {
    return { toDate: () => date } as any;
  }
  function daysAgo(n: number, hour = 12): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(hour, 0, 0, 0);
    return d;
  }
  function monthsAgo(m: number, day = 15): Date {
    const d = new Date();
    d.setMonth(d.getMonth() - m, day);
    d.setHours(10, 0, 0, 0);
    return d;
  }
  function formatDate(d: Date): string {
    return d.toISOString().split("T")[0];
  }
  function formatRupiah(val: number): string {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(val);
  }

  // ── Dummy Data ────────────────────────────────────────────────────
  const DUMMY_BATCHES: BatchProduksi[] = [
    {
      id: "b01",
      model_id: "m1",
      nama_model: "Gamis Syar'i Polos",
      detail_ukuran: [
        { ukuran: "M", jumlah_pcs: 40 },
        { ukuran: "L", jumlah_pcs: 35 },
        { ukuran: "XL", jumlah_pcs: 25 },
      ],
      total_pcs: 100,
      kain_digunakan: [
        { kain_id: "k1", nama_kain: "Katun Premium", satuan: "yard", jumlah_dipakai: 200 },
      ],
      status: "CUTTING_IN_PROGRESS",
      dibuat_oleh: "admin",
      createdAt: fakeTs(daysAgo(3)),
    },
    {
      id: "b02",
      model_id: "m2",
      nama_model: "Tunik Batik Modern",
      detail_ukuran: [
        { ukuran: "S", jumlah_pcs: 20 },
        { ukuran: "M", jumlah_pcs: 30 },
        { ukuran: "L", jumlah_pcs: 20 },
      ],
      total_pcs: 70,
      kain_digunakan: [
        { kain_id: "k2", nama_kain: "Batik Sogan", satuan: "yard", jumlah_dipakai: 140 },
      ],
      status: "JAHIT_IN_PROGRESS",
      dibuat_oleh: "admin",
      createdAt: fakeTs(daysAgo(7)),
    },
    {
      id: "b03",
      model_id: "m3",
      nama_model: "Baju Koko Premium",
      detail_ukuran: [
        { ukuran: "M", jumlah_pcs: 25 },
        { ukuran: "L", jumlah_pcs: 25 },
        { ukuran: "XL", jumlah_pcs: 10 },
      ],
      total_pcs: 60,
      kain_digunakan: [
        { kain_id: "k1", nama_kain: "Katun Premium", satuan: "yard", jumlah_dipakai: 120 },
      ],
      status: "STEAM_IN_PROGRESS",
      dibuat_oleh: "admin",
      createdAt: fakeTs(daysAgo(10)),
    },
    {
      id: "b04",
      model_id: "m4",
      nama_model: "Dress Muslim Casual",
      detail_ukuran: [
        { ukuran: "M", jumlah_pcs: 30 },
        { ukuran: "L", jumlah_pcs: 30 },
      ],
      total_pcs: 60,
      kain_digunakan: [
        { kain_id: "k4", nama_kain: "Jersey", satuan: "yard", jumlah_dipakai: 120 },
      ],
      status: "PENDING_CUTTING",
      dibuat_oleh: "admin",
      createdAt: fakeTs(daysAgo(1)),
    },
    {
      id: "b05",
      model_id: "m5",
      nama_model: "Abaya Elegan",
      detail_ukuran: [
        { ukuran: "M", jumlah_pcs: 20 },
        { ukuran: "L", jumlah_pcs: 20 },
        { ukuran: "XL", jumlah_pcs: 20 },
      ],
      total_pcs: 60,
      kain_digunakan: [
        { kain_id: "k5", nama_kain: "Balotelly", satuan: "yard", jumlah_dipakai: 180 },
      ],
      status: "JAHIT_DONE",
      dibuat_oleh: "admin",
      createdAt: fakeTs(daysAgo(14)),
    },
    {
      id: "b06",
      model_id: "m1",
      nama_model: "Gamis Syar'i Polos",
      detail_ukuran: [
        { ukuran: "L", jumlah_pcs: 50 },
        { ukuran: "XL", jumlah_pcs: 30 },
      ],
      total_pcs: 80,
      kain_digunakan: [
        { kain_id: "k1", nama_kain: "Katun Premium", satuan: "yard", jumlah_dipakai: 160 },
      ],
      status: "COMPLETED",
      dibuat_oleh: "admin",
      createdAt: fakeTs(daysAgo(20)),
    },
    {
      id: "b07",
      model_id: "m2",
      nama_model: "Tunik Batik Modern",
      detail_ukuran: [
        { ukuran: "S", jumlah_pcs: 25 },
        { ukuran: "M", jumlah_pcs: 35 },
      ],
      total_pcs: 60,
      kain_digunakan: [
        { kain_id: "k2", nama_kain: "Batik Sogan", satuan: "yard", jumlah_dipakai: 120 },
      ],
      status: "COMPLETED",
      dibuat_oleh: "admin",
      createdAt: fakeTs(daysAgo(30)),
    },
    {
      id: "b08",
      model_id: "m3",
      nama_model: "Baju Koko Premium",
      detail_ukuran: [
        { ukuran: "M", jumlah_pcs: 40 },
        { ukuran: "L", jumlah_pcs: 30 },
      ],
      total_pcs: 70,
      kain_digunakan: [
        { kain_id: "k1", nama_kain: "Katun Premium", satuan: "yard", jumlah_dipakai: 140 },
      ],
      status: "COMPLETED",
      dibuat_oleh: "admin",
      createdAt: fakeTs(daysAgo(45)),
    },
    {
      id: "b09",
      model_id: "m4",
      nama_model: "Dress Muslim Casual",
      detail_ukuran: [
        { ukuran: "S", jumlah_pcs: 15 },
        { ukuran: "M", jumlah_pcs: 25 },
        { ukuran: "L", jumlah_pcs: 20 },
      ],
      total_pcs: 60,
      kain_digunakan: [
        { kain_id: "k4", nama_kain: "Jersey", satuan: "yard", jumlah_dipakai: 120 },
      ],
      status: "CUTTING_DONE",
      dibuat_oleh: "admin",
      createdAt: fakeTs(daysAgo(5)),
    },
    {
      id: "b10",
      model_id: "m5",
      nama_model: "Abaya Elegan",
      detail_ukuran: [
        { ukuran: "L", jumlah_pcs: 25 },
        { ukuran: "XL", jumlah_pcs: 25 },
      ],
      total_pcs: 50,
      kain_digunakan: [
        { kain_id: "k5", nama_kain: "Balotelly", satuan: "yard", jumlah_dipakai: 150 },
      ],
      status: "STEAM_DONE",
      dibuat_oleh: "admin",
      createdAt: fakeTs(daysAgo(12)),
    },
    {
      id: "b11",
      model_id: "m1",
      nama_model: "Gamis Syar'i Polos",
      detail_ukuran: [
        { ukuran: "M", jumlah_pcs: 30 },
        { ukuran: "L", jumlah_pcs: 40 },
      ],
      total_pcs: 70,
      kain_digunakan: [
        { kain_id: "k1", nama_kain: "Katun Premium", satuan: "yard", jumlah_dipakai: 140 },
      ],
      status: "PENDING_CUTTING",
      dibuat_oleh: "admin",
      createdAt: fakeTs(daysAgo(2)),
    },
    {
      id: "b12",
      model_id: "m2",
      nama_model: "Tunik Batik Modern",
      detail_ukuran: [
        { ukuran: "S", jumlah_pcs: 20 },
        { ukuran: "M", jumlah_pcs: 30 },
      ],
      total_pcs: 50,
      kain_digunakan: [
        { kain_id: "k2", nama_kain: "Batik Sogan", satuan: "yard", jumlah_dipakai: 100 },
      ],
      status: "JAHIT_IN_PROGRESS",
      dibuat_oleh: "admin",
      createdAt: fakeTs(daysAgo(8)),
    },
  ];

  const DUMMY_STOK_KAIN: StokKain[] = [
    {
      id: "k1",
      nama_kain: "Katun Premium",
      satuan: "yard",
      stok_tersedia: 850,
      stok_terpakai: 1200,
    },
    {
      id: "k2",
      nama_kain: "Batik Sogan",
      satuan: "yard",
      stok_tersedia: 450,
      stok_terpakai: 600,
    },
    {
      id: "k3",
      nama_kain: "Wolfis",
      satuan: "yard",
      stok_tersedia: 75,
      stok_terpakai: 400,
    },
    {
      id: "k4",
      nama_kain: "Jersey",
      satuan: "yard",
      stok_tersedia: 320,
      stok_terpakai: 280,
    },
    {
      id: "k5",
      nama_kain: "Balotelly",
      satuan: "yard",
      stok_tersedia: 200,
      stok_terpakai: 350,
    },
    {
      id: "k6",
      nama_kain: "Linen",
      satuan: "yard",
      stok_tersedia: 90,
      stok_terpakai: 180,
    },
  ];

  const DUMMY_BARANG_JADI: StokBarangJadi[] = [
    {
      id: "bj1",
      model_id: "m1",
      nama_model: "Gamis Syar'i Polos",
      ukuran: "M",
      stok_tersedia: 45,
      total_masuk: 150,
      total_keluar: 105,
    },
    {
      id: "bj2",
      model_id: "m1",
      nama_model: "Gamis Syar'i Polos",
      ukuran: "L",
      stok_tersedia: 38,
      total_masuk: 130,
      total_keluar: 92,
    },
    {
      id: "bj3",
      model_id: "m1",
      nama_model: "Gamis Syar'i Polos",
      ukuran: "XL",
      stok_tersedia: 22,
      total_masuk: 80,
      total_keluar: 58,
    },
    {
      id: "bj4",
      model_id: "m2",
      nama_model: "Tunik Batik Modern",
      ukuran: "S",
      stok_tersedia: 30,
      total_masuk: 90,
      total_keluar: 60,
    },
    {
      id: "bj5",
      model_id: "m2",
      nama_model: "Tunik Batik Modern",
      ukuran: "M",
      stok_tersedia: 55,
      total_masuk: 130,
      total_keluar: 75,
    },
    {
      id: "bj6",
      model_id: "m3",
      nama_model: "Baju Koko Premium",
      ukuran: "M",
      stok_tersedia: 40,
      total_masuk: 110,
      total_keluar: 70,
    },
    {
      id: "bj7",
      model_id: "m3",
      nama_model: "Baju Koko Premium",
      ukuran: "L",
      stok_tersedia: 25,
      total_masuk: 90,
      total_keluar: 65,
    },
    {
      id: "bj8",
      model_id: "m4",
      nama_model: "Dress Muslim Casual",
      ukuran: "M",
      stok_tersedia: 18,
      total_masuk: 60,
      total_keluar: 42,
    },
    {
      id: "bj9",
      model_id: "m5",
      nama_model: "Abaya Elegan",
      ukuran: "L",
      stok_tersedia: 35,
      total_masuk: 80,
      total_keluar: 45,
    },
  ];

  const DUMMY_KELUAR: BarangKeluar[] = [
    // 5 bulan lalu
    {
      id: "kl01",
      model_id: "m1",
      nama_model: "Gamis Syar'i Polos",
      detail_keluar: [
        { ukuran: "M", jumlah_pcs: 20 },
        { ukuran: "L", jumlah_pcs: 15 },
      ],
      total_pcs: 35,
      tujuan: "Bandung",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(monthsAgo(5, 8)),
    },
    {
      id: "kl02",
      model_id: "m2",
      nama_model: "Tunik Batik Modern",
      detail_keluar: [{ ukuran: "M", jumlah_pcs: 18 }],
      total_pcs: 18,
      tujuan: "Jakarta",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(monthsAgo(5, 20)),
    },
    {
      id: "kl03",
      model_id: "m3",
      nama_model: "Baju Koko Premium",
      detail_keluar: [{ ukuran: "L", jumlah_pcs: 12 }],
      total_pcs: 12,
      tujuan: "Surabaya",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(monthsAgo(5, 25)),
    },
    // 4 bulan lalu
    {
      id: "kl04",
      model_id: "m1",
      nama_model: "Gamis Syar'i Polos",
      detail_keluar: [
        { ukuran: "M", jumlah_pcs: 25 },
        { ukuran: "L", jumlah_pcs: 20 },
      ],
      total_pcs: 45,
      tujuan: "Bandung",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(monthsAgo(4, 5)),
    },
    {
      id: "kl05",
      model_id: "m4",
      nama_model: "Dress Muslim Casual",
      detail_keluar: [{ ukuran: "M", jumlah_pcs: 22 }],
      total_pcs: 22,
      tujuan: "Jakarta",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(monthsAgo(4, 15)),
    },
    {
      id: "kl06",
      model_id: "m2",
      nama_model: "Tunik Batik Modern",
      detail_keluar: [
        { ukuran: "S", jumlah_pcs: 20 },
        { ukuran: "M", jumlah_pcs: 15 },
      ],
      total_pcs: 35,
      tujuan: "Medan",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(monthsAgo(4, 22)),
    },
    // 3 bulan lalu
    {
      id: "kl07",
      model_id: "m1",
      nama_model: "Gamis Syar'i Polos",
      detail_keluar: [
        { ukuran: "M", jumlah_pcs: 30 },
        { ukuran: "L", jumlah_pcs: 25 },
        { ukuran: "XL", jumlah_pcs: 15 },
      ],
      total_pcs: 70,
      tujuan: "Bandung",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(monthsAgo(3, 7)),
    },
    {
      id: "kl08",
      model_id: "m3",
      nama_model: "Baju Koko Premium",
      detail_keluar: [
        { ukuran: "M", jumlah_pcs: 25 },
        { ukuran: "L", jumlah_pcs: 20 },
      ],
      total_pcs: 45,
      tujuan: "Yogyakarta",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(monthsAgo(3, 18)),
    },
    {
      id: "kl09",
      model_id: "m5",
      nama_model: "Abaya Elegan",
      detail_keluar: [
        { ukuran: "L", jumlah_pcs: 18 },
        { ukuran: "XL", jumlah_pcs: 12 },
      ],
      total_pcs: 30,
      tujuan: "Solo",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(monthsAgo(3, 28)),
    },
    // 2 bulan lalu
    {
      id: "kl10",
      model_id: "m1",
      nama_model: "Gamis Syar'i Polos",
      detail_keluar: [
        { ukuran: "M", jumlah_pcs: 35 },
        { ukuran: "L", jumlah_pcs: 30 },
      ],
      total_pcs: 65,
      tujuan: "Bandung",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(monthsAgo(2, 10)),
    },
    {
      id: "kl11",
      model_id: "m2",
      nama_model: "Tunik Batik Modern",
      detail_keluar: [
        { ukuran: "M", jumlah_pcs: 30 },
        { ukuran: "L", jumlah_pcs: 20 },
      ],
      total_pcs: 50,
      tujuan: "Jakarta",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(monthsAgo(2, 15)),
    },
    {
      id: "kl12",
      model_id: "m4",
      nama_model: "Dress Muslim Casual",
      detail_keluar: [{ ukuran: "M", jumlah_pcs: 25 }],
      total_pcs: 25,
      tujuan: "Semarang",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(monthsAgo(2, 20)),
    },
    // 1 bulan lalu
    {
      id: "kl13",
      model_id: "m1",
      nama_model: "Gamis Syar'i Polos",
      detail_keluar: [
        { ukuran: "M", jumlah_pcs: 40 },
        { ukuran: "L", jumlah_pcs: 35 },
        { ukuran: "XL", jumlah_pcs: 20 },
      ],
      total_pcs: 95,
      tujuan: "Bandung",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(monthsAgo(1, 5)),
    },
    {
      id: "kl14",
      model_id: "m3",
      nama_model: "Baju Koko Premium",
      detail_keluar: [
        { ukuran: "M", jumlah_pcs: 35 },
        { ukuran: "L", jumlah_pcs: 25 },
      ],
      total_pcs: 60,
      tujuan: "Jakarta",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(monthsAgo(1, 12)),
    },
    {
      id: "kl15",
      model_id: "m5",
      nama_model: "Abaya Elegan",
      detail_keluar: [
        { ukuran: "L", jumlah_pcs: 22 },
        { ukuran: "XL", jumlah_pcs: 18 },
      ],
      total_pcs: 40,
      tujuan: "Surabaya",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(monthsAgo(1, 20)),
    },
    {
      id: "kl16",
      model_id: "m2",
      nama_model: "Tunik Batik Modern",
      detail_keluar: [
        { ukuran: "S", jumlah_pcs: 20 },
        { ukuran: "M", jumlah_pcs: 30 },
      ],
      total_pcs: 50,
      tujuan: "Medan",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(monthsAgo(1, 25)),
    },
    // Bulan ini
    {
      id: "kl17",
      model_id: "m1",
      nama_model: "Gamis Syar'i Polos",
      detail_keluar: [
        { ukuran: "M", jumlah_pcs: 30 },
        { ukuran: "L", jumlah_pcs: 25 },
      ],
      total_pcs: 55,
      tujuan: "Bandung",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(daysAgo(18)),
    },
    {
      id: "kl18",
      model_id: "m2",
      nama_model: "Tunik Batik Modern",
      detail_keluar: [
        { ukuran: "M", jumlah_pcs: 20 },
        { ukuran: "L", jumlah_pcs: 15 },
      ],
      total_pcs: 35,
      tujuan: "Jakarta",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(daysAgo(12)),
    },
    {
      id: "kl19",
      model_id: "m3",
      nama_model: "Baju Koko Premium",
      detail_keluar: [
        { ukuran: "M", jumlah_pcs: 15 },
        { ukuran: "L", jumlah_pcs: 12 },
      ],
      total_pcs: 27,
      tujuan: "Bogor",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(daysAgo(7)),
    },
    {
      id: "kl20",
      model_id: "m4",
      nama_model: "Dress Muslim Casual",
      detail_keluar: [{ ukuran: "M", jumlah_pcs: 18 }],
      total_pcs: 18,
      tujuan: "Depok",
      dicatat_oleh: "admin",
      tanggal_keluar: fakeTs(daysAgo(3)),
    },
  ];

  // ── Date Range State ──────────────────────────────────────────────
  const TODAY = new Date();
  let dateFrom = $state(
    formatDate(
      new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, TODAY.getDate()),
    ),
  );
  let dateTo = $state(formatDate(TODAY));

  type QuickRange = "hari_ini" | "minggu_ini" | "7h" | "30h" | "tahun";
  let activeQuick = $state<QuickRange | null>("30h");

  function applyQuick(key: QuickRange) {
    activeQuick = key;
    const to = new Date();
    const from = new Date();
    if (key === "hari_ini") {
      /* from = today, range covers just today */
    }
    if (key === "minggu_ini") {
      from.setDate(from.getDate() - from.getDay()); // Sunday start
    }
    if (key === "7h") {
      from.setDate(from.getDate() - 7);
    }
    if (key === "30h") {
      from.setDate(from.getDate() - 30);
    }
    if (key === "tahun") {
      from.setMonth(0);
      from.setDate(1);
    }
    dateFrom = formatDate(from);
    dateTo = formatDate(to);
  }

  function onManualChange() {
    activeQuick = null;
  }

  // ── Derived: filtered by date range ──────────────────────────────
  let keluarFiltered = $derived.by(() => {
    const from = new Date(dateFrom + "T00:00:00");
    const to = new Date(dateTo + "T23:59:59");
    return DUMMY_KELUAR.filter((k) => {
      const d = k.tanggal_keluar?.toDate?.();
      return d && d >= from && d <= to;
    });
  });

  // ── Derived KPIs ─────────────────────────────────────────────────
  let batchAktif = $derived(
    DUMMY_BATCHES.filter((b) => b.status !== "COMPLETED"),
  );
  let batchSelesai = $derived(
    DUMMY_BATCHES.filter((b) => b.status === "COMPLETED").length,
  );
  let totalStokPcs = $derived(
    DUMMY_BARANG_JADI.reduce((s, b) => s + b.stok_tersedia, 0),
  );
  let totalKainYard = $derived(
    DUMMY_STOK_KAIN.reduce((s, k) => s + k.stok_tersedia, 0),
  );
  let totalKeluarPcs = $derived(
    keluarFiltered.reduce((s, k) => s + k.total_pcs, 0),
  );
  let stokKainKritis = $derived(
    DUMMY_STOK_KAIN.filter((k) => k.stok_tersedia < 100),
  );

  // ── Derived: Estimasi Keuangan (Demo) ────────────────────────────
  const HARGA_PER_PCS = 85_000;
  const BIAYA_PER_PCS = 42_000;

  let estPendapatan = $derived(totalKeluarPcs * HARGA_PER_PCS);
  let estBiaya = $derived(totalKeluarPcs * BIAYA_PER_PCS);
  let estLaba = $derived(estPendapatan - estBiaya);
  let marginPersen = $derived(
    estPendapatan > 0 ? Math.round((estLaba / estPendapatan) * 100) : 0,
  );

  // Compare to previous same-length period
  let prevKeluarPcs = $derived.by(() => {
    const from = new Date(dateFrom + "T00:00:00");
    const to = new Date(dateTo + "T23:59:59");
    const diffMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - diffMs);
    const prevTo = new Date(from.getTime() - 1);
    return DUMMY_KELUAR.filter((k) => {
      const d = k.tanggal_keluar?.toDate?.();
      return d && d >= prevFrom && d <= prevTo;
    }).reduce((s, k) => s + k.total_pcs, 0);
  });

  let growthPersen = $derived.by(() => {
    if (prevKeluarPcs === 0) return null;
    return Math.round(((totalKeluarPcs - prevKeluarPcs) / prevKeluarPcs) * 100);
  });

  // ── Chart Canvas Refs ─────────────────────────────────────────────
  let canvasStatus = $state<HTMLCanvasElement | undefined>(undefined);
  let canvasModel = $state<HTMLCanvasElement | undefined>(undefined);
  let canvasTrend = $state<HTMLCanvasElement | undefined>(undefined);
  let chartStatus: Chart | null = null;
  let chartModel: Chart | null = null;
  let chartTrend: Chart | null = null;

  // ── Chart Config ─────────────────────────────────────────────────
  const STATUS_CHART_COLORS: Record<StatusBatch, string> = {
    PENDING_CUTTING: "#e2e8f0",
    CUTTING_IN_PROGRESS: "#fb923c",
    CUTTING_DONE: "#fbbf24",
    JAHIT_IN_PROGRESS: "#60a5fa",
    JAHIT_DONE: "#34d399",
    STEAM_IN_PROGRESS: "#c084fc",
    STEAM_DONE: "#6ee7b7",
    COMPLETED: "#22c55e",
  };

  const BADGE_COLOR: Record<StatusBatch, string> = {
    PENDING_CUTTING: "bg-slate-100 text-slate-600",
    CUTTING_IN_PROGRESS: "bg-orange-100 text-orange-700",
    CUTTING_DONE: "bg-yellow-100 text-yellow-700",
    JAHIT_IN_PROGRESS: "bg-blue-100 text-blue-700",
    JAHIT_DONE: "bg-teal-100 text-teal-700",
    STEAM_IN_PROGRESS: "bg-purple-100 text-purple-700",
    STEAM_DONE: "bg-emerald-100 text-emerald-700",
    COMPLETED: "bg-green-100 text-green-700",
  };

  const MONTHS_ID = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];

  function buildStatusDist() {
    const map: Partial<Record<StatusBatch, number>> = {};
    for (const b of DUMMY_BATCHES) map[b.status] = (map[b.status] ?? 0) + 1;
    const entries = Object.entries(map) as [StatusBatch, number][];
    return {
      labels: entries.map(([k]) => STATUS_LABEL[k]),
      data: entries.map(([, v]) => v),
      colors: entries.map(([k]) => STATUS_CHART_COLORS[k]),
    };
  }

  function buildTopModels(source: BarangKeluar[], limit = 6) {
    const map: Record<string, number> = {};
    for (const k of source)
      map[k.nama_model] = (map[k.nama_model] ?? 0) + k.total_pcs;
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  }

  function buildTrend() {
    const now = new Date();
    const labels: string[] = [];
    const data: number[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(
        `${MONTHS_ID[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`,
      );
      data.push(
        DUMMY_KELUAR.filter((k) => {
          const kd = k.tanggal_keluar?.toDate?.();
          return (
            kd &&
            kd.getMonth() === d.getMonth() &&
            kd.getFullYear() === d.getFullYear()
          );
        }).reduce((s, k) => s + k.total_pcs, 0),
      );
    }
    return { labels, data };
  }

  // ── Chart Builders ────────────────────────────────────────────────
  function buildStatusChart() {
    chartStatus?.destroy();
    chartStatus = null;
    if (!canvasStatus) return;
    const sd = buildStatusDist();
    chartStatus = new Chart(canvasStatus, {
      type: "doughnut",
      data: {
        labels: sd.labels,
        datasets: [
          {
            data: sd.data,
            backgroundColor: sd.colors,
            borderWidth: 3,
            borderColor: "#fff",
            hoverOffset: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "70%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              padding: 12,
              usePointStyle: true,
              boxWidth: 9,
              font: { size: 11 },
            },
          },
        },
      },
    });
  }

  function buildModelChart(source: BarangKeluar[]) {
    chartModel?.destroy();
    chartModel = null;
    if (!canvasModel) return;
    const tops = buildTopModels(source);
    const hasData = tops.length > 0;
    chartModel = new Chart(canvasModel, {
      type: "bar",
      data: {
        labels: hasData ? tops.map(([n]) => n) : ["Tidak ada data"],
        datasets: [
          {
            label: "Total Keluar (pcs)",
            data: hasData ? tops.map(([, v]) => v) : [0],
            backgroundColor: "#3b82f6",
            borderRadius: 7,
            borderSkipped: false,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { color: "#f8fafc" },
            border: { display: false },
            ticks: { precision: 0, font: { size: 11 } },
            beginAtZero: true,
          },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { size: 11 } },
          },
        },
      },
    });
  }

  function buildTrendChart() {
    chartTrend?.destroy();
    chartTrend = null;
    if (!canvasTrend) return;
    const trend = buildTrend();
    chartTrend = new Chart(canvasTrend, {
      type: "line",
      data: {
        labels: trend.labels,
        datasets: [
          {
            label: "Pcs Keluar",
            data: trend.data,
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59,130,246,0.07)",
            borderWidth: 2.5,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: "#fff",
            pointBorderColor: "#3b82f6",
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { size: 11 } },
          },
          y: {
            grid: { color: "#f1f5f9" },
            border: { display: false },
            ticks: { precision: 0, font: { size: 11 } },
            beginAtZero: true,
          },
        },
      },
    });
  }

  // Rebuild only the date-filtered chart when range changes
  $effect(() => {
    const filtered = keluarFiltered; // track dependency
    if (canvasModel) buildModelChart(filtered);
  });

  onMount(async () => {
    await tick();
    buildStatusChart();
    buildModelChart(keluarFiltered);
    buildTrendChart();
  });

  onDestroy(() => {
    chartStatus?.destroy();
    chartModel?.destroy();
    chartTrend?.destroy();
  });
</script>

<!-- ── Page Header ────────────────────────────────────────────────── -->
<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Dashboard Utama</h1>
    <p class="mt-0.5 text-sm text-gray-500">Ringkasan operasional Zarqa ERP</p>
  </div>

  <!-- Badge Demo -->
  <span
    class="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
  >
    <svg
      class="h-3 w-3"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fill-rule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clip-rule="evenodd"
      />
    </svg>
    Mode Demo — Data Dummy
  </span>
</div>

<!-- ── Date Range Picker ───────────────────────────────────────────── -->
<div
  class="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
>
  <div class="flex items-center gap-1.5 text-sm font-medium text-gray-600">
    <svg
      class="h-4 w-4 text-gray-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="1.5"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
      />
    </svg>
    Periode:
  </div>

  <!-- Quick buttons -->
  <div class="flex items-center gap-1.5 flex-wrap">
    {#each [["hari_ini", "Hari Ini"], ["minggu_ini", "Minggu Ini"], ["7h", "7 Hari"], ["30h", "30 Hari"], ["tahun", "Tahun Ini"]] as const as [key, label]}
      <button
        onclick={() => applyQuick(key)}
        class="rounded-lg px-3 py-1.5 text-xs font-medium transition
          {activeQuick === key
          ? 'bg-blue-600 text-white shadow-sm'
          : 'border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'}"
      >
        {label}
      </button>
    {/each}
  </div>

  <div class="flex items-center gap-2 ml-auto flex-wrap">
    <input
      type="date"
      bind:value={dateFrom}
      onchange={onManualChange}
      class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
    <span class="text-sm text-gray-400">s/d</span>
    <input
      type="date"
      bind:value={dateTo}
      onchange={onManualChange}
      class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </div>
</div>

<!-- ── KPI Cards ──────────────────────────────────────────────────── -->
<div class="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
  <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="flex items-start justify-between">
      <p class="text-xs font-medium uppercase tracking-wider text-gray-400">
        Batch Aktif
      </p>
      <span
        class="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50"
      >
        <svg
          class="h-3.5 w-3.5 text-orange-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"
          /></svg
        >
      </span>
    </div>
    <p class="mt-3 text-3xl font-bold tracking-tight text-gray-900">
      {batchAktif.length}
    </p>
    <p class="mt-0.5 text-xs text-gray-500">Dalam proses produksi</p>
    <div class="mt-3 h-1 w-full rounded-full bg-gray-100">
      <div
        class="h-1 rounded-full bg-orange-400"
        style="width: {DUMMY_BATCHES.length
          ? Math.round((batchAktif.length / DUMMY_BATCHES.length) * 100)
          : 0}%"
      ></div>
    </div>
    <p class="mt-1 text-xs text-gray-400">{batchSelesai} batch selesai</p>
  </div>

  <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="flex items-start justify-between">
      <p class="text-xs font-medium uppercase tracking-wider text-gray-400">
        Stok Barang Jadi
      </p>
      <span
        class="flex h-7 w-7 items-center justify-center rounded-lg bg-green-50"
      >
        <svg
          class="h-3.5 w-3.5 text-green-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
          /></svg
        >
      </span>
    </div>
    <p class="mt-3 text-3xl font-bold tracking-tight text-gray-900">
      {totalStokPcs.toLocaleString("id-ID")}
    </p>
    <p class="mt-0.5 text-xs text-gray-500">pcs tersedia di gudang</p>
    <p class="mt-3 text-xs text-gray-400">
      {DUMMY_BARANG_JADI.length} varian model &amp; ukuran
    </p>
  </div>

  <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="flex items-start justify-between">
      <p class="text-xs font-medium uppercase tracking-wider text-gray-400">
        Stok Kain
      </p>
      <span
        class="flex h-7 w-7 items-center justify-center rounded-lg {stokKainKritis.length >
        0
          ? 'bg-amber-50'
          : 'bg-blue-50'}"
      >
        <svg
          class="h-3.5 w-3.5 {stokKainKritis.length > 0
            ? 'text-amber-500'
            : 'text-blue-500'}"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3"
          /></svg
        >
      </span>
    </div>
    <p class="mt-3 text-3xl font-bold tracking-tight text-gray-900">
      {totalKainYard.toLocaleString("id-ID")}
    </p>
    <p class="mt-0.5 text-xs text-gray-500">yard tersedia</p>
    {#if stokKainKritis.length > 0}
      <p class="mt-3 text-xs font-semibold text-amber-600">
        ⚠ {stokKainKritis.length} jenis kain kritis
      </p>
    {:else}
      <p class="mt-3 text-xs text-gray-400">
        {DUMMY_STOK_KAIN.length} jenis kain
      </p>
    {/if}
  </div>

  <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="flex items-start justify-between">
      <p class="text-xs font-medium uppercase tracking-wider text-gray-400">
        Keluar (Periode)
      </p>
      <span
        class="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50"
      >
        <svg
          class="h-3.5 w-3.5 text-violet-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
          /></svg
        >
      </span>
    </div>
    <p class="mt-3 text-3xl font-bold tracking-tight text-gray-900">
      {totalKeluarPcs.toLocaleString("id-ID")}
    </p>
    <p class="mt-0.5 text-xs text-gray-500">pcs dikirimkan</p>
    {#if growthPersen !== null}
      <p
        class="mt-3 text-xs font-medium {growthPersen >= 0
          ? 'text-green-600'
          : 'text-red-500'}"
      >
        {growthPersen >= 0 ? "↑" : "↓"}
        {Math.abs(growthPersen)}% vs periode sebelumnya
      </p>
    {:else}
      <p class="mt-3 text-xs text-gray-400">
        {keluarFiltered.length} transaksi
      </p>
    {/if}
  </div>
</div>

<!-- ── Keuangan Summary ────────────────────────────────────────────── -->
<div class="mb-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
  <div class="mb-4 flex items-center gap-3">
    <div>
      <div class="flex items-center gap-2">
        <h2 class="text-sm font-semibold text-gray-800">Ringkasan Keuangan</h2>
        <span
          class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
          >ESTIMASI DEMO</span
        >
      </div>
      <p class="text-xs text-gray-400">
        Berdasarkan volume keluar pada periode yang dipilih · Harga estimasi Rp
        85.000/pcs
      </p>
    </div>
    <span
      class="ml-auto text-xs text-gray-300 cursor-not-allowed"
      title="Modul keuangan belum tersedia"
    >
      Lihat Laporan →
    </span>
  </div>

  <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
    <div class="rounded-lg bg-blue-50 p-4">
      <p class="text-xs font-medium text-blue-600">Est. Pendapatan</p>
      <p class="mt-1.5 text-xl font-bold text-blue-700">
        {formatRupiah(estPendapatan)}
      </p>
      <p class="mt-0.5 text-xs text-blue-500">
        {totalKeluarPcs} pcs × Rp 85.000
      </p>
    </div>
    <div class="rounded-lg bg-red-50 p-4">
      <p class="text-xs font-medium text-red-600">Est. Biaya Produksi</p>
      <p class="mt-1.5 text-xl font-bold text-red-700">
        {formatRupiah(estBiaya)}
      </p>
      <p class="mt-0.5 text-xs text-red-500">
        {totalKeluarPcs} pcs × Rp 42.000
      </p>
    </div>
    <div class="rounded-lg bg-green-50 p-4">
      <p class="text-xs font-medium text-green-600">Est. Laba Kotor</p>
      <p class="mt-1.5 text-xl font-bold text-green-700">
        {formatRupiah(estLaba)}
      </p>
      <p class="mt-0.5 text-xs text-green-500">Pendapatan − Biaya</p>
    </div>
    <div class="rounded-lg bg-violet-50 p-4">
      <p class="text-xs font-medium text-violet-600">Margin Laba</p>
      <p class="mt-1.5 text-xl font-bold text-violet-700">{marginPersen}%</p>
      <div class="mt-1.5 h-1.5 w-full rounded-full bg-violet-100">
        <div
          class="h-1.5 rounded-full bg-violet-400"
          style="width: {Math.min(marginPersen, 100)}%"
        ></div>
      </div>
    </div>
  </div>
</div>

<!-- ── Charts Row ─────────────────────────────────────────────────── -->
<div class="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
  <!-- Doughnut: Status Batch (always current state) -->
  <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <h2 class="text-sm font-semibold text-gray-800">
      Distribusi Status Produksi
    </h2>
    <p class="mb-4 text-xs text-gray-400">
      {DUMMY_BATCHES.length} batch total — status saat ini
    </p>
    <div class="relative h-64">
      <canvas bind:this={canvasStatus}></canvas>
    </div>
  </div>

  <!-- Horizontal Bar: Top Model (filtered by date range) -->
  <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <h2 class="text-sm font-semibold text-gray-800">Top Model Terlaris</h2>
    <p class="mb-4 text-xs text-gray-400">
      Berdasarkan pcs keluar pada periode dipilih
    </p>
    <div class="relative h-64">
      {#if keluarFiltered.length === 0}
        <div class="flex h-full flex-col items-center justify-center gap-2">
          <p class="text-sm text-gray-400">Tidak ada data pada periode ini</p>
        </div>
      {:else}
        <canvas bind:this={canvasModel}></canvas>
      {/if}
    </div>
  </div>
</div>

<!-- ── Trend Line (always 6 months) ──────────────────────────────── -->
<div class="mb-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
  <div class="mb-4 flex items-center justify-between">
    <div>
      <h2 class="text-sm font-semibold text-gray-800">Tren Barang Keluar</h2>
      <p class="text-xs text-gray-400">
        6 bulan terakhir — total pcs dikirimkan (tampilan tetap)
      </p>
    </div>
  </div>
  <div class="relative h-52">
    <canvas bind:this={canvasTrend}></canvas>
  </div>
</div>

<!-- ── Bottom Row ─────────────────────────────────────────────────── -->
<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
  <!-- Batch Aktif -->
  <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h2 class="text-sm font-semibold text-gray-800">Produksi Berjalan</h2>
        <p class="text-xs text-gray-400">{batchAktif.length} batch aktif</p>
      </div>
      <a
        href="/order-produksi"
        class="text-xs font-medium text-blue-600 hover:underline"
        >Lihat semua →</a
      >
    </div>

    {#if batchAktif.length === 0}
      <div class="flex flex-col items-center justify-center py-10 gap-2">
        <p class="text-sm text-gray-400">Semua batch sudah selesai</p>
      </div>
    {:else}
      <div class="space-y-2">
        {#each batchAktif.slice(0, 5) as batch}
          <div
            class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5 gap-3"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-gray-800">
                {batch.nama_model}
              </p>
              <p class="text-xs text-gray-400">{batch.total_pcs} pcs</p>
            </div>
            <span
              class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium {BADGE_COLOR[
                batch.status
              ]}"
            >
              {STATUS_LABEL[batch.status]}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Stok Kain Progress -->
  <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h2 class="text-sm font-semibold text-gray-800">Stok Kain</h2>
        <p class="text-xs text-gray-400">{DUMMY_STOK_KAIN.length} jenis kain</p>
      </div>
      <a
        href="/stok-kain"
        class="text-xs font-medium text-blue-600 hover:underline"
        >Lihat semua →</a
      >
    </div>
    <div class="space-y-3">
      {#each DUMMY_STOK_KAIN as kain}
        {@const total = kain.stok_tersedia + kain.stok_terpakai}
        {@const persen = total > 0 ? (kain.stok_tersedia / total) * 100 : 0}
        {@const kritis = kain.stok_tersedia < 100}
        <div>
          <div class="mb-1.5 flex items-center justify-between">
            <span class="text-sm text-gray-700 truncate max-w-[60%]"
              >{kain.nama_kain}</span
            >
            <span
              class="text-xs {kritis
                ? 'font-semibold text-amber-600'
                : 'text-gray-500'}"
            >
              {kain.stok_tersedia.toLocaleString("id-ID")} {kain.satuan}{kritis
                ? " ⚠"
                : ""}
            </span>
          </div>
          <div class="h-1.5 w-full rounded-full bg-gray-100">
            <div
              class="h-1.5 rounded-full {kritis
                ? 'bg-amber-400'
                : 'bg-blue-400'}"
              style="width: {Math.min(persen, 100).toFixed(1)}%"
            ></div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
