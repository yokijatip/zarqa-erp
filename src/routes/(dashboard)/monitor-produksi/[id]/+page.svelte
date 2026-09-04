<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import {
    getBatchById,
    getRiwayatBatch,
    updateStatusBatch,
    completeBatchProduksi,
    sinkronStokPotonganBatch,
    deleteBatchProduksi,
    editKuantitasBatch,
    updatePenugasanBatch,
    splitJahitPartialToSteam,
  } from "$lib/firebase/batch-produksi";
  import {
    karyawanCache,
    batchCache,
    stokKainCache,
  } from "$lib/stores/data-cache.svelte";
  import { userRole, currentUser } from "$lib/stores/auth.store";
  import type {
    BatchProduksi,
    PenugasanWorker,
    RiwayatProses,
    StatusBatch,
    UserProfile,
    UserRole,
  } from "$lib/types";
  import { STATUS_LABEL } from "$lib/types";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import RejectResolveDialog from "$lib/components/reject-resolve-dialog.svelte";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import UsersIcon from "@lucide/svelte/icons/users";
  import ScissorsIcon from "@lucide/svelte/icons/scissors";
  import PackageIcon from "@lucide/svelte/icons/package";
  import ZapIcon from "@lucide/svelte/icons/zap";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
  import CircleIcon from "@lucide/svelte/icons/circle";
  import LoaderIcon from "@lucide/svelte/icons/loader";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";

  const STATUS_STYLE: Record<StatusBatch, string> = {
    PENDING_KAIN: "bg-cyan-100 text-cyan-700",
    PENDING_CUTTING: "bg-slate-100 text-slate-600",
    CUTTING_IN_PROGRESS: "bg-orange-100 text-orange-700",
    CUTTING_DONE: "bg-yellow-100 text-yellow-700",
    JAHIT_IN_PROGRESS: "bg-blue-100 text-blue-700",
    JAHIT_DONE: "bg-teal-100 text-teal-700",
    STEAM_IN_PROGRESS: "bg-purple-100 text-purple-700",
    STEAM_DONE: "bg-emerald-100 text-emerald-700",
    COMPLETED: "bg-green-100 text-green-700",
  };

  // Urutan stage untuk progress bar
  const STAGES: StatusBatch[] = [
    "PENDING_KAIN",
    "PENDING_CUTTING",
    "CUTTING_IN_PROGRESS",
    "CUTTING_DONE",
    "JAHIT_IN_PROGRESS",
    "JAHIT_DONE",
    "STEAM_IN_PROGRESS",
    "STEAM_DONE",
    "COMPLETED",
  ];

  const STAGE_STEPS = [
    {
      label: "Cutting",
      statuses: [
        "PENDING_KAIN",
        "PENDING_CUTTING",
        "CUTTING_IN_PROGRESS",
        "CUTTING_DONE",
      ] as StatusBatch[],
      icon: ScissorsIcon,
    },
    {
      label: "Jahit",
      statuses: ["JAHIT_IN_PROGRESS", "JAHIT_DONE"] as StatusBatch[],
      icon: PackageIcon,
    },
    {
      label: "Steam",
      statuses: ["STEAM_IN_PROGRESS", "STEAM_DONE"] as StatusBatch[],
      icon: ZapIcon,
    },
    {
      label: "Selesai",
      statuses: ["COMPLETED"] as StatusBatch[],
      icon: CheckCircleIcon,
    },
  ];

  // ─── Action config ────────────────────────────────────────────────
  type ActionInfo = {
    label: string;
    nextStatus: StatusBatch;
    needsWorker: boolean;
    workerRole?: UserRole;
    needsPcs: boolean;
    isFinal: boolean;
  };

  // Maps current status → what action can be taken
  function getAction(b: BatchProduksi): ActionInfo | null {
    switch (b.status) {
      case "PENDING_CUTTING":
        return {
          label: "Mulai Cutting",
          nextStatus: "CUTTING_IN_PROGRESS",
          needsWorker: true,
          workerRole: "kepala_cutting",
          needsPcs: false,
          isFinal: false,
        };
      case "CUTTING_IN_PROGRESS":
        // Cutting selesai di sini juga (CUTTING_DONE), BUKAN final ke Barang Jadi.
        // pcs berhasil boleh lebih kecil dari rencana awal (mis. kain kurang dari
        // perkiraan) — batch tetap dituntaskan dengan jumlah pcs aktual, tanpa
        // wajib mencapai jumlah rencana. Reject tidak relevan di tahap ini.
        return {
          label: "Selesaikan Cutting",
          nextStatus: "CUTTING_DONE",
          needsWorker: false,
          needsPcs: true,
          isFinal: false,
        };
      case "CUTTING_DONE":
        // Batch baju dari stok potongan dan batch hijab original sama-sama
        // diteruskan ke Jahit. Batch cutting baju original tetap masuk stok
        // potongan terlebih dahulu.
        if (!b.dari_potongan) return null;
        return {
          label: "Mulai Jahit",
          nextStatus: "JAHIT_IN_PROGRESS",
          needsWorker: true,
          workerRole: "kepala_jahit",
          needsPcs: false,
          isFinal: false,
        };
      case "JAHIT_IN_PROGRESS":
        return {
          label: "Selesaikan Jahit",
          nextStatus: "JAHIT_DONE",
          needsWorker: false,
          needsPcs: true,
          isFinal: false,
        };
      case "JAHIT_DONE":
        return {
          label: "Mulai Steam",
          nextStatus: "STEAM_IN_PROGRESS",
          needsWorker: true,
          workerRole: "kepala_steam",
          needsPcs: false,
          isFinal: false,
        };
      case "STEAM_IN_PROGRESS":
        // Langsung ke COMPLETED, skip STEAM_DONE
        return {
          label: b.jenis_produk === "hijab" ? "Selesaikan Steam & Kirim ke Stok Hijab" : "Selesaikan Steam & Kirim ke Barang Jadi",
          nextStatus: "COMPLETED",
          needsWorker: false,
          needsPcs: true,
          isFinal: true,
        };
      case "STEAM_DONE":
        // Recovery: batch stuck di STEAM_DONE
        return {
          label: b.jenis_produk === "hijab" ? "Selesaikan & Kirim ke Stok Hijab" : "Selesaikan & Kirim ke Barang Jadi",
          nextStatus: "COMPLETED",
          needsWorker: false,
          needsPcs: false,
          isFinal: true,
        };
      default:
        return null;
    }
  }

  const ACTION_ROLES: UserRole[] = [
    "kepala_cutting",
    "kepala_jahit",
    "kepala_steam",
    "admin_gudang",
    "owner",
    "developer",
  ];

  // ─── State ────────────────────────────────────────────────────────
  let batch = $state<BatchProduksi | null>(null);
  let riwayat = $state<RiwayatProses[]>([]);
  let sourceCuttingBatches = $state<BatchProduksi[]>([]);
  let sourceCuttingRiwayat = $state<RiwayatProses[]>([]);
  let loading = $state(true);
  let notFound = $state(false);
  let loadError = $state<string | null>(null);
  let karyawanList = $state<UserProfile[]>([]);

  // Action dialog
  let actionOpen = $state(false);
  let actionSaving = $state(false);
  let actionError = $state<string | null>(null);
  let actionWorkerUid = $state("");
  let directSteamSaving = $state(false);
  // Per-ukuran PCS aktual yang berhasil di tahap ini.
  let actionUkuranBerhasil = $state<number[]>([]);
  let actionUkuranReject = $state<number[]>([]);
  let actionJumlahHijab = $state(0);
  let actionRejectHijab = $state(0);

  let canAction = $derived(
    !!$userRole &&
      ACTION_ROLES.includes($userRole as UserRole) &&
      !!batch &&
      getAction(batch) !== null,
  );

  let currentAction = $derived(batch ? getAction(batch) : null);
  let combinedRiwayat = $derived(
    [...sourceCuttingRiwayat, ...riwayat].sort((a, b) => {
      const ta = a.timestamp?.toMillis
        ? a.timestamp.toMillis()
        : a.timestamp
          ? new Date(a.timestamp as any).getTime()
          : 0;
      const tb = b.timestamp?.toMillis
        ? b.timestamp.toMillis()
        : b.timestamp
          ? new Date(b.timestamp as any).getTime()
          : 0;
      return ta - tb;
    }),
  );

  const MANAGE_ROLES: UserRole[] = ["admin_gudang", "owner", "developer"];
  let canManage = $derived(
    !!$userRole &&
      MANAGE_ROLES.includes($userRole as UserRole) &&
      !!batch &&
      batch.status !== "COMPLETED",
  );
  let canDelete = $derived(
    !!$userRole &&
      (["owner", "developer"] as UserRole[]).includes($userRole as UserRole) &&
      !!batch &&
      batch.status !== "COMPLETED",
  );

  // ── Delete dialog ─────────────────────────────────────────────────
  let deleteOpen = $state(false);
  let deleteSaving = $state(false);
  let deleteError = $state<string | null>(null);

  function openDeleteDialog() {
    deleteError = null;
    deleteOpen = true;
  }

  function goToInputKain() {
    if (!batch) return;
    goto(`/produksi/cutting/${batch.id}/kain`);
  }

  async function submitDelete() {
    if (!batch) return;
    deleteSaving = true;
    deleteError = null;
    try {
      await deleteBatchProduksi(batch.id);
      batchCache.invalidate();
      stokKainCache.invalidate();
      goto("/monitor-produksi");
    } catch (e: any) {
      deleteError = e?.message ?? "Gagal menghapus batch.";
    } finally {
      deleteSaving = false;
    }
  }

  // ── Edit kuantitas dialog ─────────────────────────────────────────
  let editOpen = $state(false);
  let editUkuranJumlah = $state<number[]>([]);
  let editJumlahHijab = $state(0);
  let editAlasan = $state("");
  let editSaving = $state(false);
  let editError = $state<string | null>(null);

  let editTotal = $derived(
    batch?.jenis_produk === "hijab"
      ? Math.max(0, Number(editJumlahHijab) || 0)
      : editUkuranJumlah.reduce((s, n) => s + (Number(n) || 0), 0),
  );
  let editFormValid = $derived(editTotal > 0);

  function openEditDialog() {
    if (!batch) return;
    editUkuranJumlah = batch.detail_ukuran.map((du) => du.jumlah_pcs);
    editJumlahHijab = batch.jenis_produk === "hijab" ? batch.jumlah_target ?? batch.total_pcs : 0;
    editAlasan = "";
    editError = null;
    editOpen = true;
  }

  async function submitEdit() {
    if (!batch || !$currentUser || !editFormValid) return;
    editSaving = true;
    editError = null;
    try {
      const newDetail = batch.detail_ukuran
        .map((du, i) => ({
          ukuran: du.ukuran,
          jumlah_pcs: Number(editUkuranJumlah[i]) || 0,
        }))
        .filter((du) => du.jumlah_pcs > 0);
      const uid = $currentUser.uid;
      const nama = $currentUser.name || $currentUser.email || uid;
      await editKuantitasBatch(
        batch.id,
        newDetail,
        uid,
        nama,
        editAlasan.trim() || undefined,
        batch.jenis_produk === "hijab" ? editTotal : undefined,
      );
      batchCache.invalidate();
      editOpen = false;
      const id = $page.params.id ?? "";
      const [b, r] = await Promise.all([getBatchById(id), getRiwayatBatch(id)]);
      if (b) {
        batch = b;
        riwayat = r;
      }
    } catch (e: any) {
      editError = e?.message ?? "Gagal mengubah kuantitas.";
    } finally {
      editSaving = false;
    }
  }

  // ── Ganti penugasan dialog ────────────────────────────────────────
  let penugasanOpen = $state(false);
  let penugasanCuttingUid = $state("");
  let penugasanJahitUid = $state("");
  let penugasanSteamUid = $state("");
  let penugasanSaving = $state(false);
  let penugasanError = $state<string | null>(null);

  let workersCutting = $derived(
    karyawanList.filter((k) => k.role === "kepala_cutting"),
  );
  let workersJahit = $derived(
    karyawanList.filter((k) => k.role === "kepala_jahit"),
  );
  let workersSteam = $derived(
    karyawanList.filter((k) => k.role === "kepala_steam"),
  );

  function openPenugasanDialog() {
    if (!batch) return;
    penugasanCuttingUid = batch.penugasan?.cutting?.uid ?? "";
    penugasanJahitUid = batch.penugasan?.jahit?.uid ?? "";
    penugasanSteamUid = batch.penugasan?.steam?.uid ?? "";
    penugasanError = null;
    penugasanOpen = true;
  }

  async function submitPenugasan() {
    if (!batch) return;
    penugasanSaving = true;
    penugasanError = null;
    try {
      const toWorker = (uid: string, list: UserProfile[]) => {
        const u = list.find((k) => k.uid === uid);
        return u ? { uid: u.uid, nama: u.name } : undefined;
      };
      await updatePenugasanBatch(batch.id, {
        ...(penugasanCuttingUid
          ? { cutting: toWorker(penugasanCuttingUid, workersCutting)! }
          : {}),
        ...(penugasanJahitUid
          ? { jahit: toWorker(penugasanJahitUid, workersJahit)! }
          : {}),
        ...(penugasanSteamUid
          ? { steam: toWorker(penugasanSteamUid, workersSteam)! }
          : {}),
      });
      batchCache.invalidate();
      penugasanOpen = false;
      const id = $page.params.id ?? "";
      const b = await getBatchById(id);
      if (b) batch = b;
    } catch (e: any) {
      penugasanError = e?.message ?? "Gagal memperbarui penugasan.";
    } finally {
      penugasanSaving = false;
    }
  }

  let actionWorkers = $derived(
    currentAction?.workerRole
      ? karyawanList.filter((k) => k.role === currentAction!.workerRole)
      : [],
  );

  function assignedWorkerForStatus(
    b: BatchProduksi,
    status: StatusBatch,
  ): PenugasanWorker | undefined {
    if (
      status === "PENDING_CUTTING" ||
      status === "CUTTING_IN_PROGRESS" ||
      status === "CUTTING_DONE"
    ) {
      return b.penugasan?.cutting;
    }
    if (status === "JAHIT_IN_PROGRESS" || status === "JAHIT_DONE") {
      return b.penugasan?.jahit;
    }
    if (
      status === "STEAM_IN_PROGRESS" ||
      status === "STEAM_DONE" ||
      status === "COMPLETED"
    ) {
      return b.penugasan?.steam;
    }
    return undefined;
  }

  function assignedWorkerForAction(
    b: BatchProduksi,
    action: ActionInfo,
  ): PenugasanWorker | undefined {
    return assignedWorkerForStatus(
      b,
      action.needsWorker ? action.nextStatus : b.status,
    );
  }

  function sourceCuttingWorker(): PenugasanWorker | undefined {
    return sourceCuttingBatches.find((source) => source.penugasan?.cutting)
      ?.penugasan?.cutting;
  }

  function displayRiwayatWorkerName(r: RiwayatProses): string {
    if (
      !batch ||
      (r.tipe && r.tipe !== "status_update" && r.tipe !== "setor_proses")
    ) {
      return r.updated_by_nama;
    }
    if (
      r.status_ke === "CUTTING_IN_PROGRESS" ||
      r.status_ke === "CUTTING_DONE"
    ) {
      return (
        sourceCuttingBatches.find((source) => source.penugasan?.cutting)
          ?.penugasan?.cutting?.nama ??
        batch.penugasan?.cutting?.nama ??
        r.updated_by_nama
      );
    }
    return (
      assignedWorkerForStatus(batch, r.status_ke)?.nama ?? r.updated_by_nama
    );
  }

  let currentAssignedWorker = $derived(
    batch && currentAction
      ? assignedWorkerForAction(batch, currentAction)
      : undefined,
  );

  function sumRiwayatDetail(
    status: StatusBatch,
    field: "detail_ukuran" | "detail_reject",
  ) {
    const totals = new Map<string, number>();
    for (const r of riwayat) {
      if (
        r.tipe !== "setor_proses" ||
        r.status_dari !== status ||
        r.status_ke !== status
      )
        continue;
      for (const item of r[field] ?? []) {
        totals.set(
          item.ukuran,
          (totals.get(item.ukuran) ?? 0) + item.jumlah_pcs,
        );
      }
    }
    return totals;
  }

  let actionSubmittedBySize = $derived(
    batch
      ? sumRiwayatDetail(batch.status, "detail_ukuran")
      : new Map<string, number>(),
  );
  let actionRejectedBySize = $derived(
    batch
      ? sumRiwayatDetail(batch.status, "detail_reject")
      : new Map<string, number>(),
  );
  let actionRemainingBySize = $derived(
    batch?.detail_ukuran.map((du) =>
      Math.max(
        0,
        du.jumlah_pcs -
          (actionSubmittedBySize.get(du.ukuran) ?? 0) -
          (actionRejectedBySize.get(du.ukuran) ?? 0),
      ),
    ) ?? [],
  );

  // Totals derived dari per-ukuran
  let actionTotalBerhasil = $derived(
    batch?.jenis_produk === "hijab"
      ? Math.max(0, Number(actionJumlahHijab) || 0)
      : actionUkuranBerhasil.reduce((s, n) => s + (Number(n) || 0), 0),
  );
  let actionTotalReject = $derived(
    batch?.jenis_produk === "hijab"
      ? Math.max(0, Number(actionRejectHijab) || 0)
      : actionUkuranReject.reduce((s, n) => s + (Number(n) || 0), 0),
  );
  let actionTotalSubmittedBefore = $derived(
    Array.from(actionSubmittedBySize.values()).reduce((s, n) => s + n, 0),
  );
  let actionTotalRejectedBefore = $derived(
    Array.from(actionRejectedBySize.values()).reduce((s, n) => s + n, 0),
  );
  let actionTotalRemaining = $derived(
    batch?.jenis_produk === "hijab"
      ? (batch.pcs_saat_ini ?? batch.total_pcs)
      : actionRemainingBySize.reduce((s, n) => s + n, 0),
  );
  let actionMaxPcs = $derived(
    batch ? (batch.pcs_saat_ini ?? batch.total_pcs) : 0,
  );
  let displayTotalPcsAwal = $derived.by(() => {
    if (!batch) return 0;
    return Math.max(
      batch.total_pcs,
      batch.pcs_saat_ini ?? 0,
      ...riwayat.map((r) => r.pcs_berhasil + (r.pcs_reject ?? 0)),
    );
  });
  let actionCompletesStage = $derived(
    currentAction?.needsPcs
      ? actionTotalBerhasil + actionTotalReject >= actionTotalRemaining
      : true,
  );
  // Hanya Jahit yang punya alur "setor parsial" (sebagian hasil lanjut ke Steam,
  // sisanya tetap dikerjakan). Cutting selalu dituntaskan sekali jalan dengan pcs
  // aktual yang didapat — tidak ada mekanisme lanjutan di backend untuk cutting.
  let actionCanPartial = $derived(
    !currentAction?.isFinal && batch?.status === "JAHIT_IN_PROGRESS" && batch?.jenis_produk !== "hijab",
  );

  let actionFormValid = $derived.by(() => {
    if (!currentAction) return false;
    if (currentAction.needsWorker && !actionWorkerUid && !currentAssignedWorker)
      return false;
    if (currentAction.needsPcs) {
      if (batch?.jenis_produk === "hijab") {
        if (actionTotalBerhasil + actionTotalReject <= 0) return false;
        if (actionTotalBerhasil + actionTotalReject > actionTotalRemaining) return false;
        if (actionTotalBerhasil < 0 || actionTotalReject < 0) return false;
        if ((currentAction.isFinal || batch?.status === "JAHIT_IN_PROGRESS") && actionTotalBerhasil + actionTotalReject !== actionTotalRemaining) return false;
        return true;
      }
      if (currentAction.isFinal && batch?.status === "STEAM_IN_PROGRESS") {
        // Steam: harus full completion
        if (actionTotalBerhasil + actionTotalReject > actionTotalRemaining)
          return false;
        if (actionTotalBerhasil <= 0 && actionTotalReject <= 0) return false;
        if (!actionCompletesStage) return false;
      } else {
        // Cutting dan Jahit: boleh partial, minimal 1 pcs
        if (actionTotalBerhasil <= 0) return false;
        if (
          batch?.detail_ukuran.some((_, i) => {
            const berhasil = Number(actionUkuranBerhasil[i]) || 0;
            return berhasil > (actionRemainingBySize[i] ?? 0);
          })
        )
          return false;
      }
      if (actionUkuranBerhasil.some((jumlah) => (Number(jumlah) || 0) < 0))
        return false;
      if (
        currentAction.isFinal &&
        batch?.status === "STEAM_IN_PROGRESS" &&
        actionUkuranReject.some((jumlah) => (Number(jumlah) || 0) < 0)
      )
        return false;
    }
    return true;
  });

  // ─── Helpers ──────────────────────────────────────────────────────
  function stepState(
    step: (typeof STAGE_STEPS)[0],
    currentStatus: StatusBatch,
  ): "done" | "active" | "pending" {
    const currentIdx = STAGES.indexOf(currentStatus);
    const stepMax = Math.max(...step.statuses.map((s) => STAGES.indexOf(s)));
    const stepMin = Math.min(...step.statuses.map((s) => STAGES.indexOf(s)));
    if (currentIdx > stepMax) return "done";
    if (currentIdx >= stepMin) return "active";
    return "pending";
  }

  function hitungHari(createdAt: any): number {
    if (!createdAt) return 0;
    const d = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  }

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
    return d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // ─── Reject dialog ──────────────────────────────────────────────
  let rejectDialogOpen = $state(false);
  function openRejectDialog() {
    rejectDialogOpen = true;
  }
  async function handleRejectResolved() {
    // Refresh riwayat supaya status batch (kalau ada perubahan stok) ikut update
    const id = $page.params.id ?? "";
    const [b, r] = await Promise.all([getBatchById(id), getRiwayatBatch(id)]);
    if (b) {
      batch = b;
      riwayat = r;
    }
  }

  // ─── Action handlers ──────────────────────────────────────────────
  function openActionDialog() {
    if (!batch) return;
    actionWorkerUid = currentAction
      ? (assignedWorkerForAction(batch, currentAction)?.uid ?? "")
      : "";
    actionUkuranBerhasil = batch.detail_ukuran.map(
      (_, i) => actionRemainingBySize[i] ?? 0,
    );
    actionUkuranReject = batch.detail_ukuran.map(() => 0);
    actionJumlahHijab = batch.jenis_produk === "hijab" ? actionRemainingBySize.reduce((s, n) => s + n, 0) || (batch.pcs_saat_ini ?? batch.total_pcs) : 0;
    actionRejectHijab = 0;
    actionError = null;
    actionOpen = true;
  }

  async function submitAction() {
    if (!batch || !currentAction || !$currentUser || !actionFormValid) return;
    actionSaving = true;
    actionError = null;
    const operatorUid = $currentUser.uid;
    const operatorNama =
      $currentUser.name || $currentUser.email || $currentUser.uid;
    try {
      const selectedWorker = currentAction.needsWorker
        ? actionWorkers.find((k) => k.uid === actionWorkerUid)
        : undefined;
      const assignedWorker = assignedWorkerForAction(batch, currentAction);
      const worker = selectedWorker
        ? { uid: selectedWorker.uid, nama: selectedWorker.name }
        : assignedWorker;
      const riwayatWorker =
        worker ?? assignedWorkerForStatus(batch, batch.status);
      const riwayatUid = riwayatWorker?.uid ?? operatorUid;
      const riwayatNama = riwayatWorker?.nama ?? operatorNama;
      const pcsBerhasil = currentAction.needsPcs
        ? actionTotalBerhasil
        : (batch.pcs_saat_ini ?? batch.total_pcs);
      const pcsReject = currentAction.needsPcs ? actionTotalReject : 0;
      const pcsBerhasilFinal =
        currentAction.needsPcs && actionCompletesStage
          ? actionTotalSubmittedBefore + actionTotalBerhasil
          : pcsBerhasil;
      const pcsRejectFinal =
        currentAction.needsPcs && actionCompletesStage
          ? actionTotalRejectedBefore + actionTotalReject
          : pcsReject;
      const submitDetailUkuran = batch.detail_ukuran
        .map((du, i) => ({
          ukuran: du.ukuran,
          jumlah_pcs: Number(actionUkuranBerhasil[i]) || 0,
        }))
        .filter((du) => du.jumlah_pcs > 0);
      const submitDetailReject = batch.detail_ukuran
        .map((du, i) => ({
          ukuran: du.ukuran,
          jumlah_pcs: Number(actionUkuranReject[i]) || 0,
        }))
        .filter((du) => du.jumlah_pcs > 0);

      const newDetailUkuran = currentAction.needsPcs
        ? batch.jenis_produk === "hijab"
          ? undefined
          : batch.detail_ukuran
            .map((du, i) => ({
              ukuran: du.ukuran,
              jumlah_pcs:
                (actionSubmittedBySize.get(du.ukuran) ?? 0) +
                (Number(actionUkuranBerhasil[i]) || 0),
            }))
            .filter((du) => du.jumlah_pcs > 0)
        : undefined;

      if (currentAction.needsPcs && actionCanPartial && !actionCompletesStage) {
        await splitJahitPartialToSteam(
          batch.id,
          riwayatUid,
          riwayatNama,
          submitDetailUkuran,
          submitDetailReject,
        );
      } else if (currentAction.isFinal) {
        // Steam selesai: langsung complete dalam satu operasi (skip STEAM_DONE)
        await completeBatchProduksi(
          batch.id,
          riwayatUid,
          riwayatNama,
          {
            status_dari: batch.status,
            pcs_berhasil: pcsBerhasilFinal,
            pcs_reject: pcsRejectFinal,
            detail_reject: submitDetailReject,
          },
          newDetailUkuran ?? undefined,
        );
      } else {
        await updateStatusBatch(
          batch.id,
          currentAction.nextStatus,
          riwayatUid,
          riwayatNama,
          {
            status_dari: batch.status,
            pcs_berhasil: pcsBerhasilFinal,
            pcs_reject: pcsRejectFinal,
            detail_reject: submitDetailReject,
          },
          worker,
          newDetailUkuran,
        );
      }

      // Setelah CUTTING_DONE, sinkronkan stok potongan (untuk batch original, bukan dari_potongan)
      if (currentAction.nextStatus === "CUTTING_DONE" && !batch.dari_potongan) {
        try {
          await sinkronStokPotonganBatch(batch.id);
        } catch {
          /* auto-sync will handle */
        }
      }

      batchCache.invalidate();
      if (currentAction.nextStatus === "CUTTING_DONE" && !batch.dari_potongan) {
        stokKainCache.invalidate();
      }
      actionOpen = false;

      // Reload data
      const id = $page.params.id ?? "";
      const [b, r] = await Promise.all([getBatchById(id), getRiwayatBatch(id)]);
      if (b) {
        batch = b;
        riwayat = r;
      }
    } catch (e: any) {
      actionError = e?.message ?? "Gagal memperbarui status.";
    } finally {
      actionSaving = false;
    }
  }

  async function completeSteamDirectly() {
    if (
      !batch ||
      !$currentUser ||
      batch.status !== "JAHIT_DONE" ||
      directSteamSaving
    )
      return;
    directSteamSaving = true;
    const operatorUid = $currentUser.uid;
    const operatorNama = $currentUser.name || $currentUser.email || operatorUid;
    const steamWorker = assignedWorkerForStatus(batch, "STEAM_IN_PROGRESS");
    const uid = steamWorker?.uid ?? operatorUid;
    const nama = steamWorker?.nama ?? operatorNama;
    const pcs = batch.pcs_saat_ini ?? batch.total_pcs;
    try {
      await updateStatusBatch(batch.id, "STEAM_IN_PROGRESS", uid, nama, {
        status_dari: batch.status,
        pcs_berhasil: pcs,
        pcs_reject: 0,
      });
      await completeBatchProduksi(batch.id, uid, nama, {
        status_dari: "STEAM_IN_PROGRESS",
        pcs_berhasil: pcs,
        pcs_reject: 0,
        catatan: "Steam diselesaikan langsung oleh admin",
      });
      batchCache.invalidate();
      const id = $page.params.id ?? "";
      const [b, r] = await Promise.all([getBatchById(id), getRiwayatBatch(id)]);
      if (b) {
        batch = b;
        riwayat = r;
      }
    } catch (e: any) {
      actionError = e?.message ?? "Gagal menyelesaikan steam langsung.";
      actionOpen = true;
    } finally {
      directSteamSaving = false;
    }
  }

  // ─── Load ─────────────────────────────────────────────────────────
  // Id batch yang sedang dimuat/ditampilkan saat ini. Dipakai sebagai "token"
  // untuk membuang hasil fetch yang basi (misalnya user sudah pindah ke batch
  // lain sebelum fetch batch sebelumnya selesai), supaya riwayat proses batch
  // yang lama tidak pernah ketimpa/tercampur ke batch yang baru dibuka.
  let loadedForId = "";

  async function load(id: string) {
    if (!id) return;
    loadedForId = id;
    loading = true;
    notFound = false;
    loadError = null;
    // Reset dulu supaya tidak sempat menampilkan riwayat batch sebelumnya
    // sekilas sebelum data batch baru selesai dimuat.
    batch = null;
    riwayat = [];
    sourceCuttingBatches = [];
    sourceCuttingRiwayat = [];

    try {
      const [b, r, karyawan] = await Promise.all([
        getBatchById(id),
        getRiwayatBatch(id),
        karyawanCache.get(),
      ]);

      // Kalau user sudah pindah ke batch lain selagi fetch ini berjalan,
      // buang hasilnya — jangan timpa state batch yang sedang aktif sekarang.
      if (loadedForId !== id) return;

      if (!b) {
        notFound = true;
        return;
      }
      batch = b;
      riwayat = r;
      karyawanList = karyawan;
      await loadSourceCuttingHistory(b);
      if (loadedForId !== id) return;

      // Auto-selesaikan batch yang stuck di STEAM_DONE dari alur lama
      if (b.status === "STEAM_DONE" && $currentUser) {
        try {
          const operatorUid = $currentUser.uid;
          const operatorNama =
            $currentUser.name || $currentUser.email || operatorUid;
          const steamWorker = assignedWorkerForStatus(b, "STEAM_DONE");
          const uid = steamWorker?.uid ?? operatorUid;
          const nama = steamWorker?.nama ?? operatorNama;
          await completeBatchProduksi(b.id, uid, nama, {
            status_dari: "STEAM_DONE",
            pcs_berhasil: b.pcs_saat_ini ?? b.total_pcs,
            pcs_reject: 0,
          });
          batchCache.invalidate();
          const [b2, r2] = await Promise.all([
            getBatchById(id),
            getRiwayatBatch(id),
          ]);
          if (loadedForId === id && b2) {
            batch = b2;
            riwayat = r2;
          }
        } catch (e) {
          console.error("[auto-complete-steam] Gagal complete batch", b.id, e);
        }
      }
    } catch (e) {
      console.error("[monitor-produksi] Gagal memuat batch", id, e);
      if (loadedForId === id) {
        loadError = e instanceof Error ? e.message : "Gagal memuat data batch.";
      }
      return;
    } finally {
      // Selalu matikan loading walau terjadi error, supaya halaman tidak
      // nyangkut di skeleton selamanya.
      if (loadedForId === id) loading = false;
    }
  }

  async function loadSourceCuttingHistory(currentBatch: BatchProduksi) {
    sourceCuttingBatches = [];
    sourceCuttingRiwayat = [];
    if (!currentBatch.dari_potongan) return;

    // Hanya ambil riwayat dari batch sumber yang TERCATAT EKSPLISIT di sumber_cutting
    // batch ini (diisi otomatis saat batch dibuat dari stok potongan, lihat
    // createBatchDariPotongan). JANGAN menebak batch sumber lain hanya berdasarkan
    // model + warna yang sama — jika ada beberapa batch cutting berbeda dengan
    // model & warna identik, cara tebak itu akan menggabungkan riwayat proses yang
    // sebenarnya tidak berkaitan (riwayat proses pertama & kedua tercampur).
    const sourceIds = Array.from(
      new Set(
        (currentBatch.sumber_cutting ?? []).map((source) => source.batch_id),
      ),
    );
    if (sourceIds.length === 0) return;

    const sourceBatches = await Promise.all(
      sourceIds.map((sourceId) => getBatchById(sourceId).catch(() => null)),
    );
    sourceCuttingBatches = sourceBatches.filter(Boolean) as BatchProduksi[];

    const histories = await Promise.all(
      sourceIds.map((sourceId) => getRiwayatBatch(sourceId).catch(() => [])),
    );
    sourceCuttingRiwayat = histories
      .flat()
      .filter(
        (item) =>
          item.status_ke === "CUTTING_IN_PROGRESS" ||
          item.status_ke === "CUTTING_DONE",
      );
  }

  // PENTING: pakai $effect (bukan onMount) supaya load() jalan ulang tiap kali
  // param [id] di URL berubah. SvelteKit TIDAK remount komponen ini saat
  // pindah antar batch di route yang sama (hanya param yang berubah), jadi
  // kalau cuma pakai onMount, pindah dari halaman batch A ke batch B lewat
  // link (tanpa reload) bisa membuat state lama (termasuk riwayat proses)
  // ketinggalan dan malah tertimpa/tercampur ke batch B. $effect ini memastikan
  // setiap batch selalu memuat & menampilkan riwayatnya masing-masing.
  $effect(() => {
    const id = $page.params.id ?? "";
    load(id);
  });
</script>

<!-- Back button -->
<div class="mb-5">
  <button
    onclick={() => goto("/monitor-produksi")}
    class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
  >
    <ArrowLeftIcon class="h-4 w-4" />
    Kembali ke Monitor Produksi
  </button>
</div>

{#if loading}
  <div class="space-y-4">
    <div class="h-8 w-48 animate-pulse rounded-lg bg-gray-100"></div>
    <div class="h-32 animate-pulse rounded-xl bg-gray-100"></div>
    <div class="h-48 animate-pulse rounded-xl bg-gray-100"></div>
  </div>
{:else if loadError}
  <div
    class="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-100 bg-red-50 py-20"
  >
    <p class="text-sm font-medium text-red-600">Gagal memuat data batch</p>
    <p class="text-xs text-red-500">{loadError}</p>
    <button
      onclick={() => load($page.params.id ?? "")}
      class="text-xs text-blue-600 hover:underline"
    >
      Coba lagi
    </button>
  </div>
{:else if notFound}
  <div
    class="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-100 bg-white py-20"
  >
    <p class="text-sm font-medium text-gray-500">Batch tidak ditemukan</p>
    <button
      onclick={() => goto("/monitor-produksi")}
      class="text-xs text-blue-600 hover:underline"
    >
      Kembali ke Monitor Produksi
    </button>
  </div>
{:else if batch}
  {@const hari = hitungHari(batch.createdAt)}
  {@const lambat = hari > 5}

  <!-- Header -->
  <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div>
      <div class="flex items-center gap-2">
        <h1 class="text-xl font-semibold text-gray-900">{batch.nama_model}</h1>
        <span class="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
          {batch.jenis_produk === "hijab" ? "Hijab" : "Baju"}
        </span>
        {#if batch.kode_hex_warna}
          <span
            class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-700"
          >
            <span
              class="h-3 w-3 rounded-full shrink-0"
              style="background:{batch.kode_hex_warna}"
            ></span>
            {batch.nama_warna ?? ""}
          </span>
        {/if}
      </div>
      <div class="mt-1 flex items-center gap-2">
        <span
          class="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold {STATUS_STYLE[
            batch.status
          ]}"
        >
          {STATUS_LABEL[batch.status]}
        </span>
        <span class="text-xs text-gray-400">·</span>
        <span
          class="inline-flex items-center gap-1 text-xs {lambat
            ? 'font-semibold text-red-600'
            : 'text-gray-400'}"
        >
          <ClockIcon class="h-3 w-3" />
          {hari} hari berjalan
        </span>
        {#if batch.dari_potongan && batch.jenis_produk !== "hijab"}
          <span
            class="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700"
            >dari potongan</span
          >
        {/if}
      </div>
    </div>
    <div class="flex items-center gap-3">
      <div class="text-right">
        <p class="text-2xl font-bold text-gray-900">
          {(batch.pcs_saat_ini ?? batch.total_pcs).toLocaleString("id-ID")}
        </p>
        <p class="text-xs text-gray-400">pcs saat ini</p>
      </div>
      <Button variant="outline" onclick={() => load($page.params.id ?? "")}>
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
      {#if canManage && batch && batch.status === "PENDING_KAIN"}
        <Button onclick={goToInputKain} class="shrink-0">
          Input Kain
        </Button>
      {/if}
      {#if canAction && currentAction}
        <Button onclick={openActionDialog} class="shrink-0">
          {currentAction.label}
        </Button>
      {/if}
      {#if canManage || canDelete}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button variant="outline" size="icon" {...props}>
                <MoreHorizontalIcon class="h-4 w-4" />
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end">
            {#if canManage}
              <DropdownMenu.Item onclick={openEditDialog}>
                <PencilIcon class="mr-2 h-4 w-4" />
                Edit Kuantitas
              </DropdownMenu.Item>
              <DropdownMenu.Item onclick={openPenugasanDialog}>
                <UsersIcon class="mr-2 h-4 w-4" />
                Ganti Penugasan
              </DropdownMenu.Item>
              {#if batch.status === "JAHIT_DONE"}
                <DropdownMenu.Item onclick={completeSteamDirectly}>
                  <ZapIcon class="mr-2 h-4 w-4" />
                  {directSteamSaving
                    ? "Menyelesaikan..."
                    : "Selesaikan Steam Langsung"}
                </DropdownMenu.Item>
              {/if}
            {/if}
            {#if canDelete}
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                class="text-red-600 focus:bg-red-50 focus:text-red-700"
                onclick={openDeleteDialog}
              >
                <Trash2Icon class="mr-2 h-4 w-4" />
                Batalkan Batch
              </DropdownMenu.Item>
            {/if}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}
    </div>
  </div>

  <!-- Progress Steps -->
  <div class="mb-5 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <p class="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
      Progress Produksi
    </p>
    <div class="flex items-center gap-0">
      {#each STAGE_STEPS as step, i}
        {@const state = stepState(step, batch.status)}
        {@const Icon = step.icon}
        <div class="flex flex-1 flex-col items-center gap-1.5">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-full border-2 transition
            {state === 'done'
              ? 'border-gray-800 bg-gray-800 text-white'
              : state === 'active'
                ? 'border-gray-800 bg-white text-gray-800'
                : 'border-gray-200 bg-white text-gray-300'}"
          >
            <Icon class="h-3.5 w-3.5" />
          </div>
          <p
            class="text-center text-[10px] font-medium
            {state === 'pending' ? 'text-gray-300' : 'text-gray-600'}"
          >
            {step.label}
          </p>
        </div>
        {#if i < STAGE_STEPS.length - 1}
          <div
            class="mb-5 h-0.5 flex-1 {stepState(
              STAGE_STEPS[i + 1],
              batch.status,
            ) !== 'pending'
              ? 'bg-gray-800'
              : 'bg-gray-200'}"
          ></div>
        {/if}
      {/each}
    </div>
  </div>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
    <!-- Left col: info + ukuran + penugasan + kain -->
    <div class="space-y-4 lg:col-span-2">
      <!-- Info umum -->
      <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <p
          class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400"
        >
          Informasi Batch
        </p>
        <div class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <p class="text-xs text-gray-400">Tanggal Dibuat</p>
            <p class="font-medium text-gray-800">
              {formatDate(batch.createdAt)}
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-400">Total PCS Awal</p>
            <p class="font-medium text-gray-800">
              {displayTotalPcsAwal.toLocaleString("id-ID")} pcs
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-400">PCS Saat Ini</p>
            <p class="font-medium text-gray-800">
              {(batch.pcs_saat_ini ?? batch.total_pcs).toLocaleString("id-ID")} pcs
            </p>
          </div>
          {#if batch.catatan_admin}
            <div class="col-span-full">
              <p class="text-xs text-gray-400">Catatan</p>
              <p class="font-medium text-gray-800">{batch.catatan_admin}</p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Ukuran hanya relevan untuk baju; hijab cukup menampilkan total pcs. -->
      {#if batch.jenis_produk !== "hijab"}
      <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <p
          class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400"
        >
          Detail Ukuran
        </p>
        <div class="flex flex-wrap gap-2">
          {#each batch.detail_ukuran as du}
            <div
              class="flex flex-col items-center rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5 min-w-[60px]"
            >
              <p class="text-xs font-semibold text-gray-500">{du.ukuran}</p>
              <p class="text-lg font-bold text-gray-900">{du.jumlah_pcs}</p>
              <p class="text-[10px] text-gray-400">pcs</p>
            </div>
          {/each}
        </div>
      </div>
      {:else}
      <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Produk Hijab</p>
        <div class="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
          <span class="text-sm text-gray-500">Jumlah produksi</span>
          <span class="text-lg font-bold text-gray-900">{(batch.pcs_saat_ini ?? batch.jumlah_target ?? batch.total_pcs).toLocaleString("id-ID")} pcs</span>
        </div>
        <p class="mt-2 text-xs text-gray-400">Produk hijab tidak menggunakan ukuran baju.</p>
      </div>
      {/if}

      <!-- Penugasan -->
      <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <p
          class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400"
        >
          Penugasan
        </p>
        <div class="space-y-2">
          {#each [{ label: "Cutting", worker: batch.penugasan?.cutting ?? sourceCuttingWorker(), icon: ScissorsIcon }, { label: "Jahit", worker: batch.penugasan?.jahit, icon: PackageIcon }, { label: "Steam", worker: batch.penugasan?.steam, icon: ZapIcon }] as p}
            {@const PIcon = p.icon}
            <div
              class="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
            >
              <div class="flex items-center gap-2">
                <PIcon class="h-3.5 w-3.5 text-gray-400" />
                <p class="text-sm text-gray-500">{p.label}</p>
              </div>
              {#if p.worker}
                <div class="flex items-center gap-1.5">
                  <UsersIcon class="h-3 w-3 text-gray-400" />
                  <p class="text-sm font-medium text-gray-800">
                    {p.worker.nama}
                  </p>
                </div>
              {:else}
                <p class="text-xs text-gray-300">Belum ditugaskan</p>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Kain digunakan -->
      {#if batch.kain_digunakan.length > 0}
        <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <p
            class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400"
          >
            Kain Digunakan
          </p>
          <div class="space-y-2">
            {#each batch.kain_digunakan as kain}
              <div
                class="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
              >
                <p class="text-sm font-medium text-gray-800">
                  {kain.nama_kain}
                </p>
                <span class="text-sm text-gray-600">
                  {kain.jumlah_dipakai}
                  {kain.satuan}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- Right col: riwayat -->
    <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <p
        class="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400"
      >
        Riwayat Proses
      </p>
      {#if combinedRiwayat.length === 0}
        <p class="text-center text-xs text-gray-400 py-6">Belum ada riwayat</p>
      {:else}
        <div class="relative">
          <!-- vertical line -->
          <div
            class="absolute left-[11px] top-3 bottom-3 w-px bg-gray-100"
          ></div>
          <div class="space-y-5">
            {#each combinedRiwayat as r}
              <div class="relative flex gap-3">
                <div
                  class="relative z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 border-gray-200 bg-white"
                >
                  <CircleIcon class="h-2 w-2 fill-gray-400 text-gray-400" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      class="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold {STATUS_STYLE[
                        r.status_ke
                      ]}"
                    >
                      {STATUS_LABEL[r.status_ke]}
                    </span>
                    {#if r.tipe === "edit_kuantitas"}
                      <span
                        class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500"
                        >edit</span
                      >
                    {:else if r.tipe === "setor_proses"}
                      <span
                        class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600"
                        >setor parsial</span
                      >
                    {/if}
                  </div>
                  <p class="mt-0.5 text-[11px] text-gray-400">
                    {formatDateTime(r.timestamp)}
                  </p>
                  <p class="mt-0.5 text-[11px] font-medium text-gray-600">
                    {displayRiwayatWorkerName(r)}
                  </p>
                  <div
                    class="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500"
                  >
                    <span>{r.pcs_berhasil} pcs berhasil</span>
                    {#if r.pcs_reject > 0}
                      <button
                        type="button"
                        class="font-medium text-red-500 underline decoration-dotted underline-offset-2 hover:text-red-600"
                        onclick={() => openRejectDialog()}
                      >
                        {r.pcs_reject} reject
                      </button>
                    {/if}
                  </div>
                  {#if r.catatan}
                    <p class="mt-0.5 text-[11px] italic text-gray-400">
                      "{r.catatan}"
                    </p>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- ── Delete Dialog ───────────────────────────────────────────────── -->
{#if batch}
  <RejectResolveDialog
    bind:open={rejectDialogOpen}
    batchId={batch.id}
    onResolved={handleRejectResolved}
  />
{/if}

{#if batch && canDelete}
  <Dialog.Root bind:open={deleteOpen}>
    <Dialog.Content class="max-w-sm">
      <Dialog.Header>
        <Dialog.Title class="text-red-700">Batalkan Batch?</Dialog.Title>
        <Dialog.Description>
          Batch <span class="font-semibold text-gray-800"
            >{batch.nama_model}</span
          >
          akan dihapus permanen.
          {#if ["CUTTING_DONE", "JAHIT_IN_PROGRESS", "JAHIT_DONE", "STEAM_IN_PROGRESS", "STEAM_DONE"].includes(batch.status)}
            <br /><span class="text-amber-700 text-xs font-medium"
              >Stok kain yang sudah dipotong akan dikembalikan otomatis.</span
            >
          {/if}
        </Dialog.Description>
      </Dialog.Header>
      {#if deleteError}
        <p
          class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {deleteError}
        </p>
      {/if}
      <Dialog.Footer class="gap-2">
        <Button
          variant="outline"
          onclick={() => (deleteOpen = false)}
          disabled={deleteSaving}>Batal</Button
        >
        <Button
          variant="destructive"
          onclick={submitDelete}
          disabled={deleteSaving}
        >
          {#if deleteSaving}<LoaderIcon
              class="mr-2 h-4 w-4 animate-spin"
            />{/if}
          Hapus Batch
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
{/if}

<!-- ── Edit Kuantitas Dialog ────────────────────────────────────────── -->
{#if batch && canManage}
  <Dialog.Root bind:open={editOpen}>
    <Dialog.Content class="max-w-sm">
      <Dialog.Header>
        <Dialog.Title>Edit Kuantitas</Dialog.Title>
        <Dialog.Description>
          Ubah jumlah pcs per ukuran untuk batch <span
            class="font-medium text-gray-800">{batch.nama_model}</span
          >.
        </Dialog.Description>
      </Dialog.Header>
      <div class="space-y-4 py-1">
        {#if batch.jenis_produk !== "hijab"}
        <div class="overflow-hidden rounded-lg border border-gray-200">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th
                  class="px-3 py-2 text-left text-xs font-semibold text-gray-500"
                  >Ukuran</th
                >
                <th
                  class="px-3 py-2 text-center text-xs font-semibold text-gray-500"
                  >Jumlah (pcs)</th
                >
              </tr>
            </thead>
            <tbody>
              {#each batch.detail_ukuran as du, i}
                <tr class="border-t border-gray-100">
                  <td class="px-3 py-2 font-semibold text-gray-700"
                    >{du.ukuran}</td
                  >
                  <td class="px-2 py-1.5">
                    <Input
                      type="number"
                      min="0"
                      class="h-8 text-center text-sm"
                      bind:value={editUkuranJumlah[i]}
                    />
                  </td>
                </tr>
              {/each}
            </tbody>
            <tfoot class="border-t border-gray-200 bg-gray-50">
              <tr>
                <td class="px-3 py-2 text-xs font-semibold text-gray-500"
                  >Total</td
                >
                <td
                  class="px-3 py-2 text-center text-xs font-semibold text-gray-700"
                  >{editTotal} pcs</td
                >
              </tr>
            </tfoot>
          </table>
        </div>
        {:else}
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <label class="block text-sm font-medium text-gray-700" for="edit-jumlah-hijab">Jumlah pcs target</label>
            <Input id="edit-jumlah-hijab" type="number" min="1" class="mt-2" bind:value={editJumlahHijab} />
            <p class="mt-1 text-xs text-gray-400">Tidak ada pembagian ukuran untuk batch hijab.</p>
            <p class="mt-2 text-sm font-semibold text-gray-700">Total: {editTotal} pcs</p>
          </div>
        {/if}
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700"
            >Alasan <span class="text-xs font-normal text-gray-400"
              >(opsional)</span
            ></label
          >
          <Input
            type="text"
            placeholder="Contoh: Koreksi pesanan..."
            bind:value={editAlasan}
          />
        </div>
        {#if editError}
          <p
            class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {editError}
          </p>
        {/if}
      </div>
      <Dialog.Footer class="gap-2">
        <Button
          variant="outline"
          onclick={() => (editOpen = false)}
          disabled={editSaving}>Batal</Button
        >
        <Button onclick={submitEdit} disabled={editSaving || !editFormValid}>
          {#if editSaving}<LoaderIcon class="mr-2 h-4 w-4 animate-spin" />{/if}
          Simpan
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>

  <!-- ── Ganti Penugasan Dialog ────────────────────────────────────── -->
  <Dialog.Root bind:open={penugasanOpen}>
    <Dialog.Content class="max-w-sm">
      <Dialog.Header>
        <Dialog.Title>Ganti Penugasan</Dialog.Title>
        <Dialog.Description
          >Ubah kepala yang ditugaskan untuk batch ini.</Dialog.Description
        >
      </Dialog.Header>
      <div class="space-y-4 py-1">
        {#each [{ label: "Kepala Cutting", icon: ScissorsIcon, workers: workersCutting, bind: penugasanCuttingUid }, { label: "Kepala Jahit", icon: PackageIcon, workers: workersJahit, bind: penugasanJahitUid }, { label: "Kepala Steam", icon: ZapIcon, workers: workersSteam, bind: penugasanSteamUid }] as row}
          {@const PIcon = row.icon}
          <div class="space-y-1.5">
            <div class="flex items-center gap-1.5">
              <PIcon class="h-3.5 w-3.5 text-gray-400" />
              <p class="text-sm font-medium text-gray-700">{row.label}</p>
            </div>
            <Select.Root
              type="single"
              value={row.label === "Kepala Cutting"
                ? penugasanCuttingUid || undefined
                : row.label === "Kepala Jahit"
                  ? penugasanJahitUid || undefined
                  : penugasanSteamUid || undefined}
              onValueChange={(val) => {
                if (row.label === "Kepala Cutting")
                  penugasanCuttingUid = val ?? "";
                else if (row.label === "Kepala Jahit")
                  penugasanJahitUid = val ?? "";
                else penugasanSteamUid = val ?? "";
              }}
            >
              <Select.Trigger class="w-full">
                {#if row.label === "Kepala Cutting" ? penugasanCuttingUid : row.label === "Kepala Jahit" ? penugasanJahitUid : penugasanSteamUid}
                  <span
                    >{row.workers.find(
                      (k) =>
                        k.uid ===
                        (row.label === "Kepala Cutting"
                          ? penugasanCuttingUid
                          : row.label === "Kepala Jahit"
                            ? penugasanJahitUid
                            : penugasanSteamUid),
                    )?.name ?? "—"}</span
                  >
                {:else}
                  <span class="text-muted-foreground">— Belum ditugaskan —</span
                  >
                {/if}
              </Select.Trigger>
              <Select.Content preventScroll={false}>
                {#if row.workers.length === 0}
                  <div class="px-3 py-2 text-xs text-gray-400">
                    Belum ada akun petugas
                  </div>
                {:else}
                  {#each row.workers as k}
                    <Select.Item value={k.uid}>{k.name}</Select.Item>
                  {/each}
                {/if}
              </Select.Content>
            </Select.Root>
          </div>
        {/each}
        {#if penugasanError}
          <p
            class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {penugasanError}
          </p>
        {/if}
      </div>
      <Dialog.Footer class="gap-2">
        <Button
          variant="outline"
          onclick={() => (penugasanOpen = false)}
          disabled={penugasanSaving}>Batal</Button
        >
        <Button onclick={submitPenugasan} disabled={penugasanSaving}>
          {#if penugasanSaving}<LoaderIcon
              class="mr-2 h-4 w-4 animate-spin"
            />{/if}
          Simpan
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
{/if}

<!-- Action Dialog -->
{#if batch && currentAction}
  <Dialog.Root bind:open={actionOpen}>
    <Dialog.Content class="max-w-md">
      <Dialog.Header>
        <Dialog.Title>{currentAction.label}</Dialog.Title>
        <Dialog.Description>
          <span class="font-medium text-gray-800">{batch.nama_model}</span>
          {#if batch.nama_warna}
            · <span class="text-gray-600">{batch.nama_warna}</span>
          {/if}
          · {batch.pcs_saat_ini ?? batch.total_pcs} pcs
        </Dialog.Description>
      </Dialog.Header>

      <div class="space-y-4 py-2">
        {#if currentAction.needsWorker}
          <div class="space-y-1.5">
            <p class="text-sm font-medium text-gray-700">
              Petugas {currentAction.workerRole === "kepala_cutting"
                ? "Cutting"
                : currentAction.workerRole === "kepala_jahit"
                  ? "Jahit"
                  : "Steam"}
            </p>
            {#if currentAssignedWorker}
              <div
                class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800"
              >
                {currentAssignedWorker.nama}
              </div>
            {:else if actionWorkers.length === 0}
              <p class="text-xs text-amber-600">
                Belum ada akun petugas yang sesuai di sistem.
              </p>
            {:else}
              <Select.Root
                type="single"
                value={actionWorkerUid || undefined}
                onValueChange={(val) => {
                  actionWorkerUid = val ?? "";
                }}
              >
                <Select.Trigger class="w-full">
                  {#if actionWorkerUid}
                    <span
                      >{actionWorkers.find((k) => k.uid === actionWorkerUid)
                        ?.name ?? "—"}</span
                    >
                  {:else}
                    <span class="text-muted-foreground">— Pilih petugas —</span>
                  {/if}
                </Select.Trigger>
                <Select.Content preventScroll={false}>
                  {#each actionWorkers as k}
                    <Select.Item value={k.uid}>{k.name}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            {/if}
          </div>
        {/if}

        {#if currentAction.needsPcs}
          {#if batch.jenis_produk === "hijab"}
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div class="flex items-center justify-between text-sm">
                <span class="font-medium text-gray-700">Sisa pekerjaan hijab</span>
                <span class="font-semibold text-gray-900">{actionTotalRemaining} pcs</span>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-gray-600" for="action-jumlah-hijab">Berhasil</label>
                  <Input id="action-jumlah-hijab" type="number" min="0" max={actionTotalRemaining} class="mt-1" bind:value={actionJumlahHijab} />
                </div>
                {#if currentAction.isFinal}
                  <div>
                    <label class="block text-xs font-medium text-gray-600" for="action-reject-hijab">Reject</label>
                    <Input id="action-reject-hijab" type="number" min="0" max={actionTotalRemaining} class="mt-1 text-red-600" bind:value={actionRejectHijab} />
                  </div>
                {/if}
              </div>
              <p class="mt-2 text-xs text-gray-400">Hijab tidak memakai ukuran. Total berhasil + reject harus menghabiskan sisa pekerjaan.</p>
            </div>
          {:else}
          <!-- Tabel per-ukuran -->
          <div class="overflow-hidden rounded-lg border border-gray-200">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th
                    class="px-3 py-2 text-left text-xs font-semibold text-gray-500"
                    >Ukuran</th
                  >
                  <th
                    class="px-3 py-2 text-center text-xs font-semibold text-gray-500"
                    >Stok</th
                  >
                  <th
                    class="px-3 py-2 text-center text-xs font-semibold text-gray-500"
                    >Sudah</th
                  >
                  <th
                    class="px-3 py-2 text-center text-xs font-semibold text-gray-500"
                    >Sisa</th
                  >
                  <th
                    class="px-3 py-2 text-center text-xs font-semibold text-gray-500"
                    >Berhasil</th
                  >
                  {#if currentAction?.isFinal}
                    <th
                      class="px-3 py-2 text-center text-xs font-semibold text-gray-500"
                      >Reject</th
                    >
                  {/if}
                </tr>
              </thead>
              <tbody>
                {#each batch.detail_ukuran as du, i}
                  {@const berhasil = Number(actionUkuranBerhasil[i]) || 0}
                  {@const reject = Number(actionUkuranReject[i]) || 0}
                  {@const sudah =
                    (actionSubmittedBySize.get(du.ukuran) ?? 0) +
                    (actionRejectedBySize.get(du.ukuran) ?? 0)}
                  {@const sisa = actionRemainingBySize[i] ?? 0}
                  {@const overLimit = currentAction?.isFinal
                    ? berhasil + reject > sisa
                    : berhasil > sisa}
                  <tr class="border-t border-gray-100">
                    <td class="px-3 py-2 font-semibold text-gray-700"
                      >{du.ukuran}</td
                    >
                    <td class="px-3 py-2 text-center text-gray-500"
                      >{du.jumlah_pcs}</td
                    >
                    <td class="px-3 py-2 text-center text-gray-500">{sudah}</td>
                    <td class="px-3 py-2 text-center font-medium text-gray-700"
                      >{sisa}</td
                    >
                    <td class="px-3 py-2 text-center">
                      <Input
                        type="number"
                        min="0"
                        max={currentAction?.isFinal ? sisa : undefined}
                        class="h-8 text-center text-sm {overLimit
                          ? 'border-red-400'
                          : ''}"
                        bind:value={actionUkuranBerhasil[i]}
                      />
                    </td>
                    {#if currentAction?.isFinal}
                      <td class="px-3 py-2 text-center">
                        <Input
                          type="number"
                          min="0"
                          max={sisa}
                          class="h-8 text-center text-sm text-red-600 {overLimit
                            ? 'border-red-400'
                            : ''}"
                          bind:value={actionUkuranReject[i]}
                        />
                      </td>
                    {/if}
                  </tr>
                {/each}
              </tbody>
              <tfoot class="border-t border-gray-200 bg-gray-50">
                <tr>
                  <td class="px-3 py-2 text-xs font-semibold text-gray-500"
                    >Total</td
                  >
                  <td
                    class="px-3 py-2 text-center text-xs font-semibold text-gray-700"
                    >{actionMaxPcs}</td
                  >
                  <td
                    class="px-3 py-2 text-center text-xs font-semibold text-gray-700"
                    >{actionTotalSubmittedBefore +
                      actionTotalRejectedBefore}</td
                  >
                  <td
                    class="px-3 py-2 text-center text-xs font-semibold text-gray-700"
                    >{actionTotalRemaining}</td
                  >
                  <td
                    class="px-3 py-2 text-center text-xs font-semibold text-gray-700"
                    >{actionTotalBerhasil}</td
                  >
                  {#if currentAction?.isFinal}
                    <td
                      class="px-3 py-2 text-center text-xs font-semibold text-red-600"
                      >{actionTotalReject}</td
                    >
                  {/if}
                </tr>
              </tfoot>
            </table>
          </div>
          {/if}
          {#if batch?.status === "STEAM_IN_PROGRESS" && actionTotalBerhasil + actionTotalReject > actionTotalRemaining}
            <p class="text-xs text-red-500">
              Total berhasil + reject melebihi sisa pekerjaan ({actionTotalRemaining}
              pcs)
            </p>
          {/if}
          {#if batch?.status === "STEAM_IN_PROGRESS"}
            <p class="text-xs text-emerald-600">
              Batch akan langsung diselesaikan dan masuk ke {batch?.jenis_produk === "hijab" ? "stok hijab" : "stok barang jadi"}.
            </p>
          {:else if currentAction?.needsPcs && !actionCanPartial}
            <p class="text-xs text-emerald-600">
              Batch akan diselesaikan dengan {actionTotalBerhasil} pcs.
            </p>
          {/if}
        {/if}

        {#if actionError}
          <p
            class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {actionError}
          </p>
        {/if}
      </div>

      <Dialog.Footer class="gap-2">
        <Button
          variant="outline"
          onclick={() => {
            actionOpen = false;
          }}
          disabled={actionSaving}
        >
          Batal
        </Button>
        <Button
          onclick={submitAction}
          disabled={actionSaving || !actionFormValid}
        >
          {#if actionSaving}
            <LoaderIcon class="mr-2 h-4 w-4 animate-spin" />
            Menyimpan...
          {:else}
            {currentAction.isFinal
              ? batch.jenis_produk === "hijab"
                ? "Selesaikan & Kirim ke Stok Hijab"
                : "Selesaikan & Kirim ke Barang Jadi"
              : currentAction.label}
          {/if}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
{/if}
