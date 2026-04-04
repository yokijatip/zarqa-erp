<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import {
    getBatchById,
    getRiwayatBatch,
    updateStatusBatch,
    completeBatchProduksi,
    deleteBatchProduksi,
    editKuantitasBatch,
    updatePenugasanBatch,
  } from "$lib/firebase/batch-produksi";
  import { getKaryawanList } from "$lib/firebase/karyawan";
  import { currentUser, userRole } from "$lib/stores/auth.store";
  import type {
    BatchProduksi,
    RiwayatProses,
    StatusBatch,
    UserRole,
    UserProfile,
    UkuranBaju,
    DetailUkuran,
  } from "$lib/types";
  import { STATUS_LABEL } from "$lib/types";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";

  // ── Stage & Role Config ───────────────────────────────────────────
  type StageConf = {
    status: StatusBatch;
    short: string;
    dot: string;
    bg: string;
    border: string;
    text: string;
    ring: string;
  };

  const STAGES: StageConf[] = [
    {
      status: "PENDING_CUTTING",
      short: "Antri",
      dot: "bg-slate-400",
      bg: "bg-slate-50",
      border: "border-slate-200",
      text: "text-slate-700",
      ring: "ring-slate-300",
    },
    {
      status: "CUTTING_IN_PROGRESS",
      short: "Cutting",
      dot: "bg-orange-500",
      bg: "bg-orange-50",
      border: "border-orange-200",
      text: "text-orange-700",
      ring: "ring-orange-300",
    },
    {
      status: "CUTTING_DONE",
      short: "Cut ✓",
      dot: "bg-yellow-500",
      bg: "bg-yellow-50",
      border: "border-yellow-200",
      text: "text-yellow-700",
      ring: "ring-yellow-300",
    },
    {
      status: "JAHIT_IN_PROGRESS",
      short: "Jahit",
      dot: "bg-blue-500",
      bg: "bg-blue-50",
      border: "border-blue-200",
      text: "text-blue-700",
      ring: "ring-blue-300",
    },
    {
      status: "JAHIT_DONE",
      short: "Jahit ✓",
      dot: "bg-teal-500",
      bg: "bg-teal-50",
      border: "border-teal-200",
      text: "text-teal-700",
      ring: "ring-teal-300",
    },
    {
      status: "STEAM_IN_PROGRESS",
      short: "Steam",
      dot: "bg-purple-500",
      bg: "bg-purple-50",
      border: "border-purple-200",
      text: "text-purple-700",
      ring: "ring-purple-300",
    },
    {
      status: "STEAM_DONE",
      short: "Steam ✓",
      dot: "bg-emerald-500",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      text: "text-emerald-700",
      ring: "ring-emerald-300",
    },
    {
      status: "COMPLETED",
      short: "Selesai",
      dot: "bg-green-500",
      bg: "bg-green-50",
      border: "border-green-200",
      text: "text-green-700",
      ring: "ring-green-300",
    },
  ];

  const STAGE_MAP = Object.fromEntries(
    STAGES.map((s) => [s.status, s]),
  ) as Record<StatusBatch, StageConf>;

  const NEXT_STATUS: Partial<Record<StatusBatch, StatusBatch>> = {
    PENDING_CUTTING: "CUTTING_IN_PROGRESS",
    CUTTING_IN_PROGRESS: "CUTTING_DONE",
    CUTTING_DONE: "JAHIT_IN_PROGRESS",
    JAHIT_IN_PROGRESS: "JAHIT_DONE",
    JAHIT_DONE: "STEAM_IN_PROGRESS",
    STEAM_IN_PROGRESS: "STEAM_DONE",
    STEAM_DONE: "COMPLETED",
  };

  const STATUS_ORDER: StatusBatch[] = [
    "PENDING_CUTTING", "CUTTING_IN_PROGRESS", "CUTTING_DONE",
    "JAHIT_IN_PROGRESS", "JAHIT_DONE", "STEAM_IN_PROGRESS", "STEAM_DONE", "COMPLETED",
  ];

  const ACTION_LABEL: Partial<Record<StatusBatch, string>> = {
    PENDING_CUTTING: "Mulai Cutting",
    CUTTING_IN_PROGRESS: "Cutting Selesai",
    CUTTING_DONE: "Mulai Jahit",
    JAHIT_IN_PROGRESS: "Jahit Selesai",
    JAHIT_DONE: "Mulai Steam",
    STEAM_IN_PROGRESS: "Steam Selesai",
    STEAM_DONE: "Tandai Selesai",
  };

  const ROLE_DESC: Partial<Record<UserRole, string>> = {
    kepala_cutting: "Kepala Cutting",
    kepala_jahit: "Kepala Jahit",
    kepala_steam: "Kepala Steam",
    kepala_keluar: "Kepala Barang Keluar",
    admin_gudang: "Admin Gudang",
    owner: "Owner",
    developer: "Developer",
  };

  const ALLOWED_ROLES: Partial<Record<StatusBatch, UserRole[]>> = {
    PENDING_CUTTING: ["kepala_cutting", "admin_gudang", "owner", "developer"],
    CUTTING_IN_PROGRESS: ["kepala_cutting", "admin_gudang", "owner", "developer"],
    CUTTING_DONE: ["kepala_jahit", "admin_gudang", "owner", "developer"],
    JAHIT_IN_PROGRESS: ["kepala_jahit", "admin_gudang", "owner", "developer"],
    JAHIT_DONE: ["kepala_steam", "admin_gudang", "owner", "developer"],
    STEAM_IN_PROGRESS: ["kepala_steam", "admin_gudang", "owner", "developer"],
    STEAM_DONE: ["kepala_keluar", "admin_gudang", "owner", "developer"],
  };

  function hasFullAccess(role: UserRole | null | undefined): boolean {
    return role === "admin_gudang" || role === "owner" || role === "developer";
  }

  // Status transisi yang membutuhkan pemilihan worker, beserta role-nya
  const PENUGASAN_ROLE: Partial<Record<StatusBatch, UserRole>> = {
    CUTTING_IN_PROGRESS: "kepala_cutting",
    JAHIT_IN_PROGRESS:   "kepala_jahit",
    STEAM_IN_PROGRESS:   "kepala_steam",
  };

  const PENUGASAN_LABEL: Partial<Record<StatusBatch, string>> = {
    CUTTING_IN_PROGRESS: "Kepala Cutting",
    JAHIT_IN_PROGRESS:   "Kepala Jahit",
    STEAM_IN_PROGRESS:   "Kepala Steam",
  };

  // ── State ──────────────────────────────────────────────────────────
  let batch = $state<BatchProduksi | null>(null);
  let riwayat = $state<RiwayatProses[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let notFound = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);
  let openUpdate = $state(false);
  let openHapus = $state(false);
  let deletingSaving = $state(false);

  // Update form
  let fPcsBerhasil = $state<number>(0);
  let fPcsReject = $state<number>(0);
  let fCatatan = $state("");
  let fPenugasanUid = $state("");
  let fTargetStatus = $state<StatusBatch | null>(null);

  // Edit kuantitas form
  let openEditKuantitas = $state(false);
  let fEditUkuran = $state<Partial<Record<UkuranBaju, number>>>({});
  let fCatatanEdit = $state("");
  let savingEdit = $state(false);

  // Karyawan untuk picker penugasan
  let karyawanList = $state<UserProfile[]>([]);

  // Edit penugasan
  let openEditPenugasan = $state(false);
  let fEditCuttingUid = $state("");
  let fEditJahitUid = $state("");
  let fEditSteamUid = $state("");
  let savingPenugasan = $state(false);;

  // ── Derived ────────────────────────────────────────────────────────
  let currentStage = $derived(batch ? STAGE_MAP[batch.status] : null);
  let stageIndex = $derived(
    batch ? STAGES.findIndex((s) => s.status === batch!.status) : -1,
  );
  let nextStatus = $derived(batch ? (NEXT_STATUS[batch.status] ?? null) : null);
  let actionLabel = $derived(batch ? (ACTION_LABEL[batch.status] ?? "") : "");

  // Status yang tersedia untuk admin loncat proses
  let availableTargets = $derived.by((): StatusBatch[] => {
    if (!batch || !hasFullAccess($userRole)) return [];
    const idx = STATUS_ORDER.indexOf(batch.status);
    return STATUS_ORDER.slice(idx + 1);
  });

  // Status tujuan efektif: admin bisa pilih, role lain selalu nextStatus
  let effectiveNext = $derived<StatusBatch | null>(
    hasFullAccess($userRole)
      ? (fTargetStatus ?? nextStatus)
      : nextStatus,
  );
  let effectiveNextStage = $derived(effectiveNext ? STAGE_MAP[effectiveNext] : null);

  let canUpdate = $derived.by(() => {
    if (!batch || !$userRole) return false;
    if (batch.status === "COMPLETED") return false;
    if (hasFullAccess($userRole))
      return availableTargets.length > 0;
    if (!nextStatus) return false;
    const allowed = (ALLOWED_ROLES[batch.status] ?? []) as string[];
    return allowed.includes($userRole);
  });

  let canDelete = $derived.by(() => {
    if (!batch || !$userRole) return false;
    if (batch.status === "COMPLETED") return false;
    return hasFullAccess($userRole);
  });

  let canEditKuantitas = $derived(
    hasFullAccess($userRole) &&
      batch !== null &&
      batch.status !== "COMPLETED",
  );

  // pcs_saat_ini mencerminkan jumlah PCS aktual setelah reject tiap tahap
  let pcsSaatIni = $derived(batch?.pcs_saat_ini ?? batch?.total_pcs ?? 0);

  let totalMasukForm = $derived(fPcsBerhasil + fPcsReject);
  let sisaBelumInput = $derived(pcsSaatIni - totalMasukForm);
  let formValid = $derived(
    fPcsBerhasil >= 0 &&
      fPcsReject >= 0 &&
      totalMasukForm <= pcsSaatIni &&
      totalMasukForm > 0,
  );

  // Apakah transisi ini membutuhkan pilihan worker (pakai effectiveNext)
  let needsPenugasan = $derived(effectiveNext ? effectiveNext in PENUGASAN_ROLE : false);
  // Daftar worker yang tersedia untuk transisi ini
  let filteredWorkers = $derived.by(() => {
    if (!effectiveNext) return [];
    const role = PENUGASAN_ROLE[effectiveNext];
    if (!role) return [];
    return karyawanList.filter((k) => k.role === role);
  });

  // Workers per role untuk dialog edit penugasan
  let cuttingWorkers = $derived(karyawanList.filter((k) => k.role === "kepala_cutting"));
  let jahitWorkers   = $derived(karyawanList.filter((k) => k.role === "kepala_jahit"));
  let steamWorkers   = $derived(karyawanList.filter((k) => k.role === "kepala_steam"));

  // Preview perubahan kain untuk edit kuantitas (proporsional, hanya display)
  let fEditTotal = $derived(
    Object.values(fEditUkuran).reduce((s, v) => s + (v ?? 0), 0),
  );
  let editKainPreview = $derived.by(() => {
    if (!batch || batch.total_pcs === 0) return [];
    return batch.kain_digunakan.map((k) => {
      const jumlahBaru = parseFloat(
        (k.jumlah_dipakai * (fEditTotal / batch!.total_pcs)).toFixed(2),
      );
      return {
        ...k,
        jumlah_baru: jumlahBaru,
        selisih: parseFloat((k.jumlah_dipakai - jumlahBaru).toFixed(2)),
      };
    });
  });

  // ── Helpers ────────────────────────────────────────────────────────
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

  function hitungHari(createdAt: any): number {
    if (!createdAt) return 0;
    const d = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  }

  function showSuccess(msg: string) {
    successMsg = msg;
    setTimeout(() => (successMsg = null), 3500);
  }

  function showError(msg: string) {
    errorMsg = msg;
    setTimeout(() => (errorMsg = null), 4000);
  }

  // ── Data ──────────────────────────────────────────────────────────
  async function load() {
    loading = true;
    errorMsg = null;
    try {
      const id = $page.params.id!;
      [batch, karyawanList] = await Promise.all([
        getBatchById(id),
        getKaryawanList(),
      ]);
      if (!batch) {
        notFound = true;
        return;
      }
      riwayat = await getRiwayatBatch(id);
    } catch {
      errorMsg = "Gagal memuat data order produksi.";
    } finally {
      loading = false;
    }
  }

  // ── Actions ──────────────────────────────────────────────────────
  function bukaUpdate() {
    fPcsBerhasil = batch?.pcs_saat_ini ?? batch?.total_pcs ?? 0;
    fPcsReject = 0;
    fCatatan = "";
    fPenugasanUid = "";
    fTargetStatus = nextStatus; // default ke step berikutnya
    openUpdate = true;
  }

  async function submitUpdate() {
    if (!canUpdate || !$currentUser || !batch || !effectiveNext || !formValid)
      return;

    // Snapshot nilai batch sebelum async agar TypeScript tidak null
    const snapshotBatch = batch;
    const snapshotNextStatus = effectiveNext;

    saving = true;
    try {
      const catatanTrimmed = fCatatan.trim();
      const namaPencatat =
        $currentUser.name || $currentUser.email || $currentUser.uid;

      // Siapkan data penugasan jika transisi ini membutuhkan pilihan worker
      const selectedWorker = needsPenugasan && fPenugasanUid
        ? karyawanList.find((k) => k.uid === fPenugasanUid)
        : undefined;

      if (snapshotNextStatus === "COMPLETED" && fPcsBerhasil > 0) {
        await completeBatchProduksi(
          snapshotBatch.id,
          $currentUser.uid,
          namaPencatat,
          {
            status_dari: snapshotBatch.status,
            pcs_berhasil: fPcsBerhasil,
            pcs_reject: fPcsReject,
            ...(catatanTrimmed ? { catatan: catatanTrimmed } : {}),
          },
        );
      } else {
        await updateStatusBatch(
          snapshotBatch.id,
          snapshotNextStatus,
          $currentUser.uid,
          namaPencatat,
          {
            status_dari: snapshotBatch.status,
            pcs_berhasil: fPcsBerhasil,
            pcs_reject: fPcsReject,
            ...(catatanTrimmed ? { catatan: catatanTrimmed } : {}),
          },
          selectedWorker ? { uid: selectedWorker.uid, nama: selectedWorker.name } : undefined,
        );
      }

      await load();
      openUpdate = false;
      showSuccess(
        snapshotNextStatus === "COMPLETED"
          ? `Batch selesai! ${fPcsBerhasil} pcs ditambahkan ke stok barang jadi.`
          : `Status diperbarui ke "${STATUS_LABEL[snapshotNextStatus]}".`,
      );
    } catch (e: any) {
      showError(e?.message ?? "Gagal memperbarui status.");
    } finally {
      saving = false;
    }
  }

  async function submitHapus() {
    if (!batch) return;
    deletingSaving = true;
    try {
      await deleteBatchProduksi(batch.id);
      goto("/order-produksi");
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Gagal menghapus batch.");
      openHapus = false;
    } finally {
      deletingSaving = false;
    }
  }

  function bukaEditKuantitas() {
    if (!batch) return;
    fEditUkuran = Object.fromEntries(
      batch.detail_ukuran.map((du) => [du.ukuran, du.jumlah_pcs]),
    );
    fCatatanEdit = "";
    savingEdit = false;
    openEditKuantitas = true;
  }

  function bukaEditPenugasan() {
    if (!batch) return;
    fEditCuttingUid = batch.penugasan?.cutting?.uid ?? "";
    fEditJahitUid   = batch.penugasan?.jahit?.uid   ?? "";
    fEditSteamUid   = batch.penugasan?.steam?.uid   ?? "";
    savingPenugasan = false;
    openEditPenugasan = true;
  }

  async function submitEditPenugasan() {
    if (!batch || savingPenugasan) return;
    savingPenugasan = true;
    try {
      const penugasan: { cutting?: { uid: string; nama: string }; jahit?: { uid: string; nama: string }; steam?: { uid: string; nama: string } } = {};
      const cutting = cuttingWorkers.find((w) => w.uid === fEditCuttingUid);
      const jahit   = jahitWorkers.find((w) => w.uid === fEditJahitUid);
      const steam   = steamWorkers.find((w) => w.uid === fEditSteamUid);
      if (cutting) penugasan.cutting = { uid: cutting.uid, nama: cutting.name };
      if (jahit)   penugasan.jahit   = { uid: jahit.uid, nama: jahit.name };
      if (steam)   penugasan.steam   = { uid: steam.uid, nama: steam.name };
      await updatePenugasanBatch(batch.id, penugasan);
      await load();
      openEditPenugasan = false;
      showSuccess("Penugasan berhasil diperbarui.");
    } catch (e: any) {
      showError(e?.message ?? "Gagal memperbarui penugasan.");
    } finally {
      savingPenugasan = false;
    }
  }

  async function submitEditKuantitas() {
    if (!batch || !$currentUser || fEditTotal <= 0 || savingEdit) return;
    const snapshotBatch = batch;
    savingEdit = true;
    try {
      const newDetailUkuran: DetailUkuran[] = Object.entries(fEditUkuran)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([ukuran, jumlah_pcs]) => ({
          ukuran: ukuran as UkuranBaju,
          jumlah_pcs: Math.round(Number(jumlah_pcs)),
        }));
      const namaPencatat =
        $currentUser.name || $currentUser.email || $currentUser.uid;
      await editKuantitasBatch(
        snapshotBatch.id,
        newDetailUkuran,
        $currentUser.uid,
        namaPencatat,
        fCatatanEdit || undefined,
      );
      await load();
      openEditKuantitas = false;
      showSuccess(`Kuantitas berhasil diubah menjadi ${fEditTotal} pcs.`);
    } catch (e: any) {
      showError(e?.message ?? "Gagal mengubah kuantitas.");
    } finally {
      savingEdit = false;
    }
  }

  onMount(load);
</script>

<!-- ── Toast ─────────────────────────────────────────────────────── -->
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

<!-- ── Loading ────────────────────────────────────────────────────── -->
{#if loading}
  <div class="space-y-5">
    <div class="flex items-center gap-3">
      <div class="h-4 w-24 animate-pulse rounded bg-gray-100"></div>
    </div>
    <div class="h-10 w-64 animate-pulse rounded-xl bg-gray-100"></div>
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {#each Array(4) as _}
        <div class="h-24 animate-pulse rounded-xl bg-gray-100"></div>
      {/each}
    </div>
    <div class="h-20 animate-pulse rounded-xl bg-gray-100"></div>
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div class="h-48 animate-pulse rounded-xl bg-gray-100"></div>
      <div class="h-48 animate-pulse rounded-xl bg-gray-100"></div>
    </div>
  </div>

  <!-- ── Not Found ──────────────────────────────────────────────────── -->
{:else if notFound}
  <div class="flex flex-col items-center justify-center gap-4 py-24">
    <div
      class="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100"
    >
      <svg
        class="h-8 w-8 text-gray-300"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
        />
      </svg>
    </div>
    <p class="text-sm font-medium text-gray-600">Order tidak ditemukan</p>
    <Button variant="outline" onclick={() => goto("/order-produksi")}>
      ← Kembali ke Daftar
    </Button>
  </div>

  <!-- ── Error ──────────────────────────────────────────────────────── -->
{:else if errorMsg && !batch}
  <div class="flex flex-col items-center justify-center gap-4 py-24">
    <p class="text-sm text-red-600">{errorMsg}</p>
    <Button variant="outline" onclick={load}>Coba Lagi</Button>
  </div>

  <!-- ── Main Content ───────────────────────────────────────────────── -->
{:else if batch}
  {@const hari = hitungHari(batch.createdAt)}
  {@const lambat = hari > 5}
  {@const selesai = batch.status === "COMPLETED"}

  <!-- Back + Header -->
  <div class="mb-6">
    <Button
      variant="ghost"
      size="sm"
      onclick={() => goto("/order-produksi")}
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
      Order Produksi
    </Button>

    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-2 flex-wrap">
          <h1 class="text-xl font-semibold text-gray-900">{batch.nama_model}</h1>
          {#if batch.nama_warna}
            <span class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-700 shadow-sm">
              <span class="inline-block h-3 w-3 rounded-full shrink-0" style="background-color: {batch.kode_hex_warna}"></span>
              {batch.nama_warna}
            </span>
          {/if}
        </div>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <span class="text-sm text-gray-500">Order Produksi</span>
          {#if lambat && !selesai}
            <span
              class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600"
            >
              <svg
                class="h-3 w-3"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                />
              </svg>
              {hari} hari berjalan
            </span>
          {/if}
        </div>
      </div>
      <div class="flex items-center gap-2">
        {#if currentStage}
          <span
            class="inline-flex rounded-full px-3 py-1.5 text-sm font-semibold {currentStage.bg} {currentStage.border} {currentStage.text} border"
          >
            {STATUS_LABEL[batch.status]}
          </span>
        {/if}
        <Button variant="outline" size="sm" onclick={load}>
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
        {#if canEditKuantitas}
          <Button
            variant="outline"
            onclick={bukaEditKuantitas}
            class="border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
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
                d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
              />
            </svg>
            Edit Jumlah
          </Button>
        {/if}
        {#if canDelete}
          <Button
            variant="outline"
            onclick={() => (openHapus = true)}
            class="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
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
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
              />
            </svg>
            Hapus
          </Button>
        {/if}
      </div>
    </div>
  </div>

  <!-- Action Banner -->
  {#if canUpdate && effectiveNextStage && currentStage}
    <div
      class="mb-5 flex items-center justify-between rounded-xl border {currentStage.border} {currentStage.bg} px-5 py-4"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 items-center justify-center rounded-full {currentStage.dot} text-white"
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
              d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold {currentStage.text}">
            Tindakan Tersedia untuk {ROLE_DESC[$userRole as UserRole] ??
              $userRole}
          </p>
          <p class="text-xs {currentStage.text} opacity-80">
            {STATUS_LABEL[batch.status]}
            <span class="mx-1">→</span>
            {STATUS_LABEL[effectiveNext!]}
          </p>
        </div>
      </div>
      <button
        onclick={bukaUpdate}
        class="shrink-0 rounded-lg {currentStage.dot} px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
      >
        Mulai Proses
      </button>
    </div>
  {/if}

  <!-- Progress Bar -->
  <Card.Root class="mb-5 border-gray-100">
    <Card.Header>
      <Card.Title class="text-xs font-semibold uppercase tracking-wider text-gray-400 font-medium">
        Progress Produksi
      </Card.Title>
      <Card.Action>
        <p class="text-xs text-gray-400">Tahap {stageIndex + 1} dari {STAGES.length}</p>
      </Card.Action>
    </Card.Header>
    <Card.Content>
      <div class="flex gap-1">
        {#each STAGES as s, i}
          {@const done = i < stageIndex}
          {@const current = i === stageIndex}
          <div class="flex flex-1 flex-col items-center gap-1.5">
            <div
              class="h-2 w-full rounded-full {done
                ? s.dot
                : current
                  ? s.dot + ' opacity-80'
                  : 'bg-gray-100'}"
            ></div>
            <p
              class="text-center text-[9px] font-medium leading-tight {done || current
                ? s.text
                : 'text-gray-300'}"
            >
              {s.short}
            </p>
          </div>
        {/each}
      </div>
    </Card.Content>
  </Card.Root>

  <!-- KPI Cards -->
  <div class="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
    <Card.Root class="border-gray-100 gap-1 p-4">
      <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Total PCS</p>
      <p class="mt-1 text-2xl font-bold text-gray-900">{batch.total_pcs.toLocaleString("id-ID")}</p>
      <p class="text-xs text-gray-400">pcs diproduksi</p>
    </Card.Root>
    <Card.Root class="border-gray-100 gap-1 p-4">
      <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Varian Ukuran</p>
      <p class="mt-1 text-2xl font-bold text-gray-900">{batch.detail_ukuran.length}</p>
      <p class="text-xs text-gray-400">ukuran berbeda</p>
    </Card.Root>
    <Card.Root class="border-gray-100 gap-1 p-4">
      <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Dibuat</p>
      <p class="mt-1 text-sm font-bold text-gray-900">{formatDate(batch.createdAt)}</p>
      <p class="text-xs text-gray-400">{hari} hari lalu</p>
    </Card.Root>
    <Card.Root class="gap-1 p-4 {selesai ? 'border-green-100 bg-green-50' : 'border-gray-100'}">
      <p class="text-xs font-medium uppercase tracking-wider {selesai ? 'text-green-600' : 'text-gray-400'}">Riwayat</p>
      <p class="mt-1 text-2xl font-bold {selesai ? 'text-green-700' : 'text-gray-900'}">{riwayat.length}</p>
      <p class="text-xs {selesai ? 'text-green-600' : 'text-gray-400'}">proses tercatat</p>
    </Card.Root>
  </div>

  <!-- Penugasan -->
  {#if canEditKuantitas || (batch.penugasan && (batch.penugasan.cutting || batch.penugasan.jahit || batch.penugasan.steam))}
    <Card.Root class="mb-5 border-gray-100">
      <Card.Header>
        <Card.Title class="text-sm text-gray-800">Penugasan Produksi</Card.Title>
        {#if canEditKuantitas}
          <Card.Action>
            <Button variant="ghost" size="sm" onclick={bukaEditPenugasan} class="h-7 gap-1.5 text-xs text-gray-500 hover:text-gray-800">
              <svg class="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
              </svg>
              Edit Petugas
            </Button>
          </Card.Action>
        {/if}
      </Card.Header>
      <Card.Content>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <!-- Cutting -->
        <div class="flex items-center gap-3 rounded-lg px-4 py-3 {batch.penugasan?.cutting ? 'bg-orange-50' : 'border border-dashed border-gray-200 bg-gray-50'}">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full {batch.penugasan?.cutting ? 'bg-orange-100' : 'bg-gray-100'}">
            <svg class="h-4 w-4 {batch.penugasan?.cutting ? 'text-orange-600' : 'text-gray-400'}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <div class="min-w-0">
            <p class="text-[10px] font-semibold uppercase tracking-wider {batch.penugasan?.cutting ? 'text-orange-600' : 'text-gray-400'}">Cutting</p>
            <p class="truncate text-sm font-medium {batch.penugasan?.cutting ? 'text-gray-800' : 'text-gray-400'}">
              {batch.penugasan?.cutting?.nama ?? '—'}
            </p>
          </div>
        </div>

        <!-- Jahit -->
        <div class="flex items-center gap-3 rounded-lg px-4 py-3 {batch.penugasan?.jahit ? 'bg-blue-50' : 'border border-dashed border-gray-200 bg-gray-50'}">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full {batch.penugasan?.jahit ? 'bg-blue-100' : 'bg-gray-100'}">
            <svg class="h-4 w-4 {batch.penugasan?.jahit ? 'text-blue-600' : 'text-gray-400'}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <div class="min-w-0">
            <p class="text-[10px] font-semibold uppercase tracking-wider {batch.penugasan?.jahit ? 'text-blue-600' : 'text-gray-400'}">Jahit</p>
            <p class="truncate text-sm font-medium {batch.penugasan?.jahit ? 'text-gray-800' : 'text-gray-400'}">
              {batch.penugasan?.jahit?.nama ?? '—'}
            </p>
          </div>
        </div>

        <!-- Steam -->
        <div class="flex items-center gap-3 rounded-lg px-4 py-3 {batch.penugasan?.steam ? 'bg-purple-50' : 'border border-dashed border-gray-200 bg-gray-50'}">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full {batch.penugasan?.steam ? 'bg-purple-100' : 'bg-gray-100'}">
            <svg class="h-4 w-4 {batch.penugasan?.steam ? 'text-purple-600' : 'text-gray-400'}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <div class="min-w-0">
            <p class="text-[10px] font-semibold uppercase tracking-wider {batch.penugasan?.steam ? 'text-purple-600' : 'text-gray-400'}">Steam</p>
            <p class="truncate text-sm font-medium {batch.penugasan?.steam ? 'text-gray-800' : 'text-gray-400'}">
              {batch.penugasan?.steam?.nama ?? '—'}
            </p>
          </div>
        </div>
      </div>
      </Card.Content>
    </Card.Root>
  {/if}

  <!-- Detail: Ukuran + Kain -->
  <div class="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
    <Card.Root class="border-gray-100">
      <Card.Header>
        <Card.Title class="text-sm text-gray-800">Breakdown Ukuran</Card.Title>
      </Card.Header>
      <Card.Content>
      <div class="space-y-3">
        {#each batch.detail_ukuran as du}
          {@const pct = Math.round((du.jumlah_pcs / batch.total_pcs) * 100)}
          <div class="flex items-center gap-3">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700"
            >
              {du.ukuran}
            </div>
            <div class="flex-1">
              <div class="mb-1 flex justify-between text-xs">
                <span class="font-medium text-gray-700"
                  >{du.jumlah_pcs} pcs</span
                >
                <span class="text-gray-400">{pct}%</span>
              </div>
              <div class="h-1.5 w-full rounded-full bg-gray-100">
                <div
                  class="h-1.5 rounded-full bg-blue-400"
                  style="width: {pct}%"
                ></div>
              </div>
            </div>
          </div>
        {/each}
      </div>
      </Card.Content>
    </Card.Root>

    <Card.Root class="border-gray-100">
      <Card.Header>
        <Card.Title class="text-sm text-gray-800">Kain Digunakan</Card.Title>
      </Card.Header>
      <Card.Content>
      {#if batch.kain_digunakan.length === 0}
        <p class="italic text-sm text-gray-400">Tidak ada data kain.</p>
      {:else}
        <div class="space-y-2">
          {#each batch.kain_digunakan as kain}
            <div
              class="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3"
            >
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-amber-400"></span>
                <span class="text-sm text-gray-700">{kain.nama_kain}</span>
              </div>
              <span class="text-sm font-semibold text-gray-800"
                >{kain.jumlah_dipakai} {kain.satuan ?? "yard"}</span
              >
            </div>
          {/each}
        </div>
        <p class="mt-3 text-xs text-gray-400">
          Total kain: <span class="font-medium text-gray-600"
            >{batch.kain_digunakan.length} jenis</span
          >
        </p>
      {/if}
      </Card.Content>
    </Card.Root>
  </div>

  <!-- Catatan Admin -->
  {#if batch.catatan_admin}
    <div class="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
      <p
        class="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-500"
      >
        Catatan Admin
      </p>
      <p class="text-sm text-blue-800">{batch.catatan_admin}</p>
    </div>
  {/if}

  <!-- Riwayat Proses -->
  <Card.Root class="border-gray-100">
    <Card.Header>
      <Card.Title class="text-sm text-gray-800">Riwayat Proses</Card.Title>
    </Card.Header>
    <Card.Content>

    {#if riwayat.length === 0}
      <div class="flex flex-col items-center gap-2 py-10">
        <svg
          class="h-8 w-8 text-gray-200"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
        <p class="text-sm text-gray-400">Belum ada riwayat proses</p>
        {#if canUpdate}
          <p class="text-xs text-gray-400">
            Mulai dengan menekan tombol "{actionLabel}"
          </p>
        {:else}
          <p class="text-xs text-gray-400">
            Riwayat akan muncul setelah status diperbarui oleh divisi terkait
          </p>
        {/if}
      </div>
    {:else}
      <div class="relative">
        {#each riwayat as r, i}
          {@const isEditKuantitas = r.tipe === 'edit_kuantitas'}
          {@const rStage = isEditKuantitas ? null : STAGE_MAP[r.status_ke]}
          <div class="flex gap-4">
            <div class="flex flex-col items-center">
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border {isEditKuantitas
                  ? 'bg-amber-50 border-amber-200'
                  : (rStage?.bg ?? 'bg-gray-100') + ' ' + (rStage?.border ?? 'border-gray-200')}"
              >
                {#if isEditKuantitas}
                  <svg
                    class="h-3.5 w-3.5 text-amber-600"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="2.5"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"
                    />
                  </svg>
                {:else}
                  <svg
                    class="h-3.5 w-3.5 {rStage?.text ?? 'text-gray-400'}"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="2.5"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="m4.5 12.75 6 6 9-13.5"
                    />
                  </svg>
                {/if}
              </div>
              {#if i < riwayat.length - 1}
                <div class="mt-1 min-h-6 w-px flex-1 bg-gray-200"></div>
              {/if}
            </div>

            <div class="min-w-0 flex-1 pb-5">
              {#if isEditKuantitas}
                <!-- Edit Kuantitas entry -->
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-sm font-semibold text-gray-800">
                    Edit Kuantitas
                  </p>
                  <span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    Edit Jumlah
                  </span>
                </div>
                <p class="mt-0.5 text-xs text-gray-500">
                  <span class="font-medium text-gray-700">{r.updated_by_nama}</span>
                  · {formatDateTime(r.timestamp)}
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-3">
                  <div class="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5">
                    <span class="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
                    <span class="text-xs text-amber-700">Jumlah baru: <strong>{r.pcs_berhasil} pcs</strong></span>
                  </div>
                </div>
                {#if r.catatan}
                  <p class="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs italic text-gray-500">
                    "{r.catatan}"
                  </p>
                {/if}
              {:else}
                <!-- Status update entry -->
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-sm font-semibold text-gray-800">
                    {STATUS_LABEL[r.status_dari]}
                    <span class="mx-1 font-normal text-gray-400">→</span>
                    {STATUS_LABEL[r.status_ke]}
                  </p>
                  {#if rStage}
                    <span
                      class="rounded-full px-2 py-0.5 text-[10px] font-semibold {rStage.bg} {rStage.text}"
                    >
                      {rStage.short}
                    </span>
                  {/if}
                </div>
                <p class="mt-0.5 text-xs text-gray-500">
                  <span class="font-medium text-gray-700">{r.updated_by_nama}</span>
                  · {formatDateTime(r.timestamp)}
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-3">
                  <div class="flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1.5">
                    <span class="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                    <span class="text-xs text-green-700">Berhasil: <strong>{r.pcs_berhasil} pcs</strong></span>
                  </div>
                  {#if r.pcs_reject > 0}
                    <div class="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5">
                      <span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                      <span class="text-xs text-red-700">Reject: <strong>{r.pcs_reject} pcs</strong></span>
                    </div>
                  {/if}
                </div>
                {#if r.catatan}
                  <p class="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs italic text-gray-500">
                    "{r.catatan}"
                  </p>
                {/if}
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
    </Card.Content>
  </Card.Root>
{/if}

<!-- ── Dialog: Perbarui Status ────────────────────────────────────── -->
<Dialog.Root bind:open={openUpdate}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Perbarui Status</Dialog.Title>
    </Dialog.Header>

    {#if batch && effectiveNext && currentStage}
      {@const effStage = STAGE_MAP[effectiveNext]}
      <div class="max-h-[60vh] space-y-4 overflow-y-auto px-1 pt-1 pb-0">

        <!-- Pill selector (admin only) -->
        {#if availableTargets.length > 1}
          <div class="flex flex-wrap gap-1.5">
            {#each availableTargets as s}
              {@const sConf = STAGE_MAP[s]}
              <button
                type="button"
                onclick={() => { fTargetStatus = s; fPenugasanUid = ""; }}
                class="rounded-full border px-3 py-1 text-xs font-semibold transition {effectiveNext === s
                  ? `${sConf.bg} ${sConf.text} ${sConf.border} ring-2 ${sConf.ring}`
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}"
              >
                {STATUS_LABEL[s]}
              </button>
            {/each}
          </div>
        {/if}

        <!-- Status + info -->
        <div class="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <div class="flex items-center gap-2">
            <span class="rounded-full px-2.5 py-1 text-xs font-semibold {currentStage.bg} {currentStage.text}">
              {STATUS_LABEL[batch.status]}
            </span>
            <svg class="h-3.5 w-3.5 shrink-0 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
            <span class="rounded-full px-2.5 py-1 text-xs font-semibold {effStage.bg} {effStage.text}">
              {STATUS_LABEL[effectiveNext]}
            </span>
          </div>
          <span class="text-xs text-gray-400">{pcsSaatIni} pcs</span>
        </div>

        <!-- Worker picker (hanya untuk *_IN_PROGRESS) -->
        {#if needsPenugasan && effectiveNext}
          <div>
            <p class="mb-1.5 text-sm font-medium text-gray-700">
              {PENUGASAN_LABEL[effectiveNext] ?? "Petugas"}
              <span class="ml-1 text-xs font-normal text-gray-400">(opsional)</span>
            </p>
            {#if filteredWorkers.length === 0}
              <p class="text-xs text-amber-600">Belum ada akun {PENUGASAN_LABEL[effectiveNext]} di sistem.</p>
            {:else}
              <Select.Root
                type="single"
                value={fPenugasanUid || undefined}
                onValueChange={(val) => { fPenugasanUid = val ?? ""; }}
              >
                <Select.Trigger class="w-full">
                  {#if fPenugasanUid}
                    <span>{filteredWorkers.find(w => w.uid === fPenugasanUid)?.name ?? "—"}</span>
                  {:else}
                    <span class="text-muted-foreground">— Pilih petugas —</span>
                  {/if}
                </Select.Trigger>
                <Select.Content preventScroll={false}>
                  {#each filteredWorkers as w}
                    <Select.Item value={w.uid}>{w.name}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            {/if}
          </div>
        {/if}

        <!-- PCS inputs -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700" for="pcs-berhasil">
              Berhasil <span class="text-red-500">*</span>
            </label>
            <Input id="pcs-berhasil" type="number" min="0" max={pcsSaatIni} bind:value={fPcsBerhasil} />
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700" for="pcs-reject">
              Reject
            </label>
            <Input id="pcs-reject" type="number" min="0" max={pcsSaatIni} bind:value={fPcsReject} />
          </div>
        </div>

        <!-- Validasi total -->
        {#if totalMasukForm > 0}
          <div class="rounded-lg border {sisaBelumInput < 0 ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'} px-3 py-2">
            <div class="flex justify-between text-xs">
              <span class="text-gray-500">Diinput / Total</span>
              <span class="font-semibold {sisaBelumInput < 0 ? 'text-red-700' : 'text-gray-800'}">
                {totalMasukForm} / {pcsSaatIni} pcs
                {#if sisaBelumInput < 0}— melebihi!{/if}
              </span>
            </div>
          </div>
        {/if}

        {#if effectiveNext === "COMPLETED"}
          <p class="text-xs text-green-700">
            ✓ {fPcsBerhasil} pcs akan ditambahkan ke stok Barang Jadi.
          </p>
        {/if}

        <!-- Catatan -->
        <div>
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="catatan-update">
            Catatan <span class="text-xs font-normal text-gray-400">(opsional)</span>
          </label>
          <textarea
            id="catatan-update"
            rows="2"
            placeholder="Kendala, keterangan tambahan..."
            bind:value={fCatatan}
            class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
          ></textarea>
        </div>
      </div>

      <Dialog.Footer class="gap-2">
        <Button variant="outline" onclick={() => (openUpdate = false)}>Batal</Button>
        <Button onclick={submitUpdate} disabled={saving || !formValid}>
          {saving ? "Menyimpan..." : "Simpan"}
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<!-- ── Dialog: Edit Kuantitas ────────────────────────────────────── -->
<Dialog.Root bind:open={openEditKuantitas}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Edit Jumlah Order</Dialog.Title>
      <Dialog.Description>
        Ubah jumlah pcs per ukuran. Stok kain akan disesuaikan otomatis.
      </Dialog.Description>
    </Dialog.Header>

    {#if batch}
      <div class="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
        <!-- Info batch -->
        <div class="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
          <p class="text-xs text-amber-800">
            <span class="font-semibold">{batch.nama_model}</span>
            <span class="mx-1">·</span>
            {STATUS_LABEL[batch.status]}
            <span class="mx-1">·</span>
            Saat ini: <span class="font-bold">{pcsSaatIni} pcs</span>
          </p>
        </div>

        <!-- Input pcs per ukuran -->
        <div>
          <p class="mb-3 text-sm font-medium text-gray-700">Jumlah per Ukuran</p>
          <div class="space-y-3">
            {#each batch.detail_ukuran as du}
              <div class="flex items-center gap-3">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
                  {du.ukuran}
                </div>
                <Input
                  type="number"
                  min="0"
                  bind:value={fEditUkuran[du.ukuran]}
                  class="flex-1"
                />
                <span class="text-xs text-gray-400">pcs</span>
              </div>
            {/each}
          </div>
          <div class="mt-3 flex justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
            <span class="text-gray-500">Total baru</span>
            <span class="font-bold {fEditTotal <= 0 ? 'text-red-600' : 'text-gray-800'}">
              {fEditTotal} pcs
            </span>
          </div>
        </div>

        <!-- Preview kain -->
        {#if editKainPreview.length > 0 && fEditTotal > 0}
          <div>
            <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Perkiraan Perubahan Kain
            </p>
            <div class="overflow-hidden rounded-lg border border-gray-100">
              <table class="w-full text-xs">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-3 py-2 text-left font-medium text-gray-500">Kain</th>
                    <th class="px-3 py-2 text-right font-medium text-gray-500">Lama</th>
                    <th class="px-3 py-2 text-right font-medium text-gray-500">Baru</th>
                    <th class="px-3 py-2 text-right font-medium text-gray-500">Selisih</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  {#each editKainPreview as kp}
                    <tr class="bg-white">
                      <td class="px-3 py-2 text-gray-700">{kp.nama_kain}</td>
                      <td class="px-3 py-2 text-right text-gray-600">{kp.jumlah_dipakai} {kp.satuan}</td>
                      <td class="px-3 py-2 text-right text-gray-600">{kp.jumlah_baru} {kp.satuan}</td>
                      <td class="px-3 py-2 text-right font-semibold {kp.selisih > 0 ? 'text-green-600' : kp.selisih < 0 ? 'text-red-600' : 'text-gray-400'}">
                        {kp.selisih > 0 ? '+' : ''}{kp.selisih} {kp.satuan}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            <p class="mt-1.5 text-[10px] text-gray-400">
              * Perkiraan proporsional. Nilai aktual dihitung berdasarkan kebutuhan kain per ukuran model.
            </p>
          </div>
        {/if}

        <!-- Catatan -->
        <div>
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="catatan-edit">
            Alasan / Catatan
            <span class="ml-1 text-xs font-normal text-gray-400">(opsional)</span>
          </label>
          <textarea
            id="catatan-edit"
            rows="2"
            placeholder="Alasan perubahan jumlah..."
            bind:value={fCatatanEdit}
            class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
          ></textarea>
        </div>
      </div>

      <Dialog.Footer class="gap-2">
        <Button variant="outline" onclick={() => (openEditKuantitas = false)}>
          Batal
        </Button>
        <Button
          onclick={submitEditKuantitas}
          disabled={savingEdit || fEditTotal <= 0}
          class="bg-amber-600 text-white hover:bg-amber-700"
        >
          {savingEdit ? "Menyimpan..." : "Simpan Perubahan"}
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<!-- ── Dialog: Edit Penugasan ────────────────────────────────────── -->
<Dialog.Root bind:open={openEditPenugasan}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Edit Penugasan Petugas</Dialog.Title>
      <Dialog.Description>
        Atur siapa yang mengerjakan setiap tahap produksi.
      </Dialog.Description>
    </Dialog.Header>

    {#if batch}
      <div class="space-y-4 py-1">

        <!-- Cutting -->
        <div>
          <p class="mb-1.5 text-sm font-medium text-gray-700">Kepala Cutting</p>
          {#if cuttingWorkers.length === 0}
            <p class="text-xs text-amber-600">Belum ada akun Kepala Cutting di sistem.</p>
          {:else}
            <Select.Root
              type="single"
              value={fEditCuttingUid || undefined}
              onValueChange={(val) => { fEditCuttingUid = val ?? ""; }}
            >
              <Select.Trigger class="w-full">
                {#if fEditCuttingUid}
                  <span>{cuttingWorkers.find((w) => w.uid === fEditCuttingUid)?.name ?? "—"}</span>
                {:else}
                  <span class="text-muted-foreground">— Tidak ada / Kosongkan —</span>
                {/if}
              </Select.Trigger>
              <Select.Content preventScroll={false}>
                {#each cuttingWorkers as w}
                  <Select.Item value={w.uid}>{w.name}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          {/if}
        </div>

        <!-- Jahit -->
        <div>
          <p class="mb-1.5 text-sm font-medium text-gray-700">Kepala Jahit</p>
          {#if jahitWorkers.length === 0}
            <p class="text-xs text-amber-600">Belum ada akun Kepala Jahit di sistem.</p>
          {:else}
            <Select.Root
              type="single"
              value={fEditJahitUid || undefined}
              onValueChange={(val) => { fEditJahitUid = val ?? ""; }}
            >
              <Select.Trigger class="w-full">
                {#if fEditJahitUid}
                  <span>{jahitWorkers.find((w) => w.uid === fEditJahitUid)?.name ?? "—"}</span>
                {:else}
                  <span class="text-muted-foreground">— Tidak ada / Kosongkan —</span>
                {/if}
              </Select.Trigger>
              <Select.Content preventScroll={false}>
                {#each jahitWorkers as w}
                  <Select.Item value={w.uid}>{w.name}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          {/if}
        </div>

        <!-- Steam -->
        <div>
          <p class="mb-1.5 text-sm font-medium text-gray-700">Kepala Steam</p>
          {#if steamWorkers.length === 0}
            <p class="text-xs text-amber-600">Belum ada akun Kepala Steam di sistem.</p>
          {:else}
            <Select.Root
              type="single"
              value={fEditSteamUid || undefined}
              onValueChange={(val) => { fEditSteamUid = val ?? ""; }}
            >
              <Select.Trigger class="w-full">
                {#if fEditSteamUid}
                  <span>{steamWorkers.find((w) => w.uid === fEditSteamUid)?.name ?? "—"}</span>
                {:else}
                  <span class="text-muted-foreground">— Tidak ada / Kosongkan —</span>
                {/if}
              </Select.Trigger>
              <Select.Content preventScroll={false}>
                {#each steamWorkers as w}
                  <Select.Item value={w.uid}>{w.name}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          {/if}
        </div>

        <p class="text-xs text-gray-400">
          Worker yang tidak dipilih akan dikosongkan dari penugasan batch ini.
        </p>
      </div>

      <Dialog.Footer class="gap-2">
        <Button variant="outline" onclick={() => (openEditPenugasan = false)}>Batal</Button>
        <Button onclick={submitEditPenugasan} disabled={savingPenugasan}>
          {savingPenugasan ? "Menyimpan..." : "Simpan"}
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<!-- ── Dialog: Konfirmasi Hapus ──────────────────────────────────── -->
<Dialog.Root bind:open={openHapus}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Hapus Order Produksi?</Dialog.Title>
      <Dialog.Description>
        Tindakan ini tidak dapat dibatalkan.
      </Dialog.Description>
    </Dialog.Header>

    {#if batch}
      <div class="rounded-xl border border-red-100 bg-red-50 p-4 text-sm">
        <p class="font-semibold text-red-800">{batch.nama_model}</p>
        <p class="mt-1 text-red-700">
          {batch.total_pcs} pcs · {STATUS_LABEL[batch.status]}
        </p>
        <ul class="mt-3 space-y-1 text-xs text-red-600">
          <li>• Stok kain akan dikembalikan otomatis</li>
          <li>• Seluruh riwayat proses akan dihapus</li>
          <li>• Order produksi tidak bisa dipulihkan</li>
        </ul>
      </div>
    {/if}

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openHapus = false)}>
        Batal
      </Button>
      <Button
        onclick={submitHapus}
        disabled={deletingSaving}
        class="bg-red-600 text-white hover:bg-red-700"
      >
        {#if deletingSaving}
          <svg
            class="h-4 w-4 animate-spin"
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
          Menghapus...
        {:else}
          Ya, Hapus Batch
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
