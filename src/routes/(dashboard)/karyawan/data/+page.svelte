<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import {
    getKaryawanList,
    createAkunKaryawan,
    updateKaryawan,
    hapusAkunKaryawan,
    ROLE_LABEL,
    ROLE_KARYAWAN,
    tipeKaryawanLabel,
  } from "$lib/firebase/karyawan";
  import { isKaryawanManager } from "$lib/stores/auth.store";
  import type { UserProfile, UserRole, TipePenggajian } from "$lib/types";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Table from "$lib/components/ui/table";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  // ── State ──────────────────────────────────────────────────────────
  let karyawanList = $state<UserProfile[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);
  let searchQuery = $state("");
  let filterTipe = $state<"semua" | "permanent" | "temporary">("semua");

  // Dialog state
  let openTambah = $state(false);
  let openEdit = $state(false);
  let openHapus = $state(false);
  let selectedKaryawan = $state<UserProfile | null>(null);

  // Form: tambah akun
  let fNama = $state("");
  let fEmail = $state("");
  let fPassword = $state("");
  let fRole = $state<UserRole>("kepala_jahit");
  let fKode = $state("");
  let fNoHp = $state("");
  let fJabatan = $state("");
  let fDivisi = $state("");
  let fTanggalMasuk = $state("");
  let fStatusKerja = $state<"aktif" | "cuti" | "nonaktif">("aktif");
  let fAlamat = $state("");
  let fKontakDarurat = $state("");
  let fCatatanHr = $state("");
  let fTipe = $state<"permanent" | "temporary">("permanent");
  let fExpired = $state("");
  let fTipePenggajian = $state<TipePenggajian>("bulanan");
  let fGajiPokok = $state("");

  // Form: edit
  let eNama = $state("");
  let eRole = $state<UserRole>("kepala_jahit");
  let eKode = $state("");
  let eNoHp = $state("");
  let eJabatan = $state("");
  let eDivisi = $state("");
  let eTanggalMasuk = $state("");
  let eStatusKerja = $state<"aktif" | "cuti" | "nonaktif">("aktif");
  let eAlamat = $state("");
  let eKontakDarurat = $state("");
  let eCatatanHr = $state("");
  let eTipe = $state<"permanent" | "temporary">("permanent");
  let eExpired = $state("");
  let eTipePenggajian = $state<TipePenggajian>("bulanan");
  let eGajiPokok = $state("");

  // ── Derived ────────────────────────────────────────────────────────
  let filteredList = $derived.by(() => {
    let list = karyawanList;
    if (filterTipe !== "semua")
      list = list.filter((k) => k.tipe_akun === filterTipe);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (k) =>
          k.name.toLowerCase().includes(q) ||
          k.email.toLowerCase().includes(q) ||
          (k.kode_karyawan ?? "").toLowerCase().includes(q) ||
          (k.no_hp ?? "").toLowerCase().includes(q) ||
          (k.divisi ?? "").toLowerCase().includes(q) ||
          (k.jabatan ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  });

  let canSubmitTambah = $derived(
    fNama.trim() !== "" &&
      fEmail.trim() !== "" &&
      fPassword.length >= 6 &&
      (fTipe === "permanent" || fExpired !== ""),
  );
  let canSubmitEdit = $derived(
    eNama.trim() !== "" && (eTipe === "permanent" || eExpired !== ""),
  );

  const TIPE_PENGGAJIAN_LABEL: Record<TipePenggajian, string> = {
    harian: "Harian",
    mingguan: "Mingguan",
    bulanan: "Bulanan",
    tahunan: "Tahunan",
  };
  const TIPE_PENGGAJIAN_OPTIONS: TipePenggajian[] = [
    "harian",
    "mingguan",
    "bulanan",
    "tahunan",
  ];
  const STATUS_KERJA_LABEL: Record<"aktif" | "cuti" | "nonaktif", string> = {
    aktif: "Aktif",
    cuti: "Cuti",
    nonaktif: "Nonaktif",
  };
  const STATUS_KERJA_OPTIONS: Array<"aktif" | "cuti" | "nonaktif"> = [
    "aktif",
    "cuti",
    "nonaktif",
  ];

  // ── Helpers ────────────────────────────────────────────────────────
  function showSuccess(msg: string) {
    successMsg = msg;
    setTimeout(() => (successMsg = null), 3000);
  }
  function showError(msg: string) {
    errorMsg = msg;
    setTimeout(() => (errorMsg = null), 6000);
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
  function isExpired(ts: any): boolean {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d < new Date();
  }
  function tsToInputDate(ts: any): string {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toISOString().slice(0, 10);
  }

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      karyawanList = await getKaryawanList();
    } catch {
      showError("Gagal memuat data karyawan.");
    } finally {
      loading = false;
    }
  }

  // ── Dialog helpers ──────────────────────────────────────────────────
  function bukaTambah() {
    fNama = "";
    fEmail = "";
    fPassword = "";
    fRole = "kepala_jahit";
    fKode = "";
    fNoHp = "";
    fJabatan = "";
    fDivisi = "";
    fTanggalMasuk = "";
    fStatusKerja = "aktif";
    fAlamat = "";
    fKontakDarurat = "";
    fCatatanHr = "";
    fTipe = "permanent";
    fExpired = "";
    fTipePenggajian = "bulanan";
    fGajiPokok = "";
    openTambah = true;
  }
  function bukaEdit(k: UserProfile) {
    selectedKaryawan = k;
    eNama = k.name;
    eRole = k.role;
    eKode = k.kode_karyawan ?? "";
    eNoHp = k.no_hp ?? "";
    eJabatan = k.jabatan ?? "";
    eDivisi = k.divisi ?? "";
    eTanggalMasuk = k.tanggal_masuk ?? "";
    eStatusKerja = k.status_kerja ?? "aktif";
    eAlamat = k.alamat ?? "";
    eKontakDarurat = k.kontak_darurat ?? "";
    eCatatanHr = k.catatan_hr ?? "";
    eTipe = k.tipe_akun ?? "permanent";
    eExpired = tsToInputDate(k.tanggal_expired);
    eTipePenggajian = k.tipe_penggajian ?? "bulanan";
    eGajiPokok = k.gaji_pokok ? String(k.gaji_pokok) : "";
    openEdit = true;
  }
  function bukaHapus(k: UserProfile) {
    selectedKaryawan = k;
    openHapus = true;
  }

  // ── Submit handlers ─────────────────────────────────────────────────
  async function submitTambah() {
    if (!canSubmitTambah) return;
    saving = true;
    try {
      await createAkunKaryawan({
        email: fEmail.trim(),
        password: fPassword,
        name: fNama.trim(),
        role: fRole,
        kode_karyawan: fKode,
        no_hp: fNoHp,
        jabatan: fJabatan,
        divisi: fDivisi,
        tanggal_masuk: fTanggalMasuk,
        status_kerja: fStatusKerja,
        alamat: fAlamat,
        kontak_darurat: fKontakDarurat,
        catatan_hr: fCatatanHr,
        tipe_akun: fTipe,
        tanggal_expired:
          fTipe === "temporary" && fExpired ? new Date(fExpired) : null,
        tipe_penggajian: fTipePenggajian,
        gaji_pokok: Number(fGajiPokok) || 0,
      });
      openTambah = false;
      showSuccess(`Akun "${fNama.trim()}" berhasil dibuat.`);
      await load();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Gagal membuat akun.");
    } finally {
      saving = false;
    }
  }

  async function submitEdit() {
    if (!canSubmitEdit || !selectedKaryawan) return;
    saving = true;
    try {
      await updateKaryawan(selectedKaryawan.uid, {
        name: eNama.trim(),
        role: eRole,
        kode_karyawan: eKode,
        no_hp: eNoHp,
        jabatan: eJabatan,
        divisi: eDivisi,
        tanggal_masuk: eTanggalMasuk,
        status_kerja: eStatusKerja,
        alamat: eAlamat,
        kontak_darurat: eKontakDarurat,
        catatan_hr: eCatatanHr,
        tipe_akun: eTipe,
        tanggal_expired:
          eTipe === "temporary" && eExpired ? new Date(eExpired) : null,
        tipe_penggajian: eTipePenggajian,
        gaji_pokok: Number(eGajiPokok) || 0,
      });
      openEdit = false;
      showSuccess("Data karyawan berhasil diperbarui.");
      await load();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Gagal memperbarui data.");
    } finally {
      saving = false;
    }
  }

  async function submitHapus() {
    if (!selectedKaryawan) return;
    saving = true;
    try {
      await hapusAkunKaryawan(selectedKaryawan.uid);
      openHapus = false;
      showSuccess(`Akun "${selectedKaryawan.name}" berhasil dihapus.`);
      await load();
    } catch (e: unknown) {
      openHapus = false;
      showError(e instanceof Error ? e.message : "Gagal menghapus akun.");
    } finally {
      saving = false;
    }
  }

  onMount(load);
</script>

<!-- ── Toast ─────────────────────────────────────────────────────── -->
{#if successMsg}
  <div
    class="fixed right-5 top-5 z-9999 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 shadow-lg"
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
    class="fixed right-5 top-5 z-9999 flex max-w-sm items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg"
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

{#if !$isKaryawanManager}
  <div
    class="flex flex-col items-center justify-center gap-3 py-24 text-center"
  >
    <div
      class="flex h-14 w-14 items-center justify-center rounded-full bg-red-100"
    >
      <svg
        class="h-7 w-7 text-red-400"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
        />
      </svg>
    </div>
    <p class="font-semibold text-gray-700">Akses Ditolak</p>
    <p class="text-sm text-gray-400">
      Halaman ini hanya dapat diakses oleh Owner, HR, atau Developer.
    </p>
  </div>
{:else}
  <!-- ── Header ─────────────────────────────────────────────────────── -->
  <div class="mb-5 flex flex-wrap items-start justify-between gap-4">
    <div>
      <div class="flex items-center gap-2">
        <a
          href="/karyawan"
          class="text-sm text-gray-400 hover:text-gray-600 hover:underline"
          >Dashboard Karyawan</a
        >
        <span class="text-gray-300">/</span>
        <span class="text-sm font-medium text-gray-700">Data Karyawan</span>
      </div>
      <h1 class="mt-1 text-xl font-semibold text-gray-900">Data Karyawan</h1>
      <p class="mt-0.5 text-sm text-gray-500">
        Kelola akun, kontrak, dan tipe penggajian karyawan
      </p>
    </div>
    <Button onclick={bukaTambah}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2.5"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 4.5v15m7.5-7.5h-15"
        />
      </svg>
      Tambah Akun
    </Button>
  </div>

  <!-- ── Filter Bar ─────────────────────────────────────────────────── -->
  <div class="mb-4 flex flex-wrap items-center gap-3">
    <div class="relative min-w-48 flex-1">
      <svg
        class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
        />
      </svg>
      <input
        type="text"
        placeholder="Cari nama, email, kode, divisi..."
        bind:value={searchQuery}
        class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
      />
    </div>

    <div class="flex items-center gap-1.5">
      <span class="text-xs text-gray-500">Tipe:</span>
      {#each [["semua", "Semua"], ["permanent", "Permanent"], ["temporary", "Temporary"]] as const as [val, lbl]}
        <Button
          size="sm"
          variant={filterTipe === val ? "default" : "outline"}
          onclick={() => (filterTipe = val)}>{lbl}</Button
        >
      {/each}
    </div>

    <Button variant="outline" size="sm" onclick={load} class="ml-auto">
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

  <!-- ── Table ──────────────────────────────────────────────────────── -->
  <div
    class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
  >
    {#if loading}
      <div class="space-y-0">
        {#each Array(5) as _}
          <div
            class="flex items-center gap-4 border-b border-gray-50 px-5 py-4"
          >
            <div class="h-4 w-32 animate-pulse rounded bg-gray-100"></div>
            <div class="h-4 w-40 animate-pulse rounded bg-gray-100"></div>
            <div
              class="ml-auto h-5 w-20 animate-pulse rounded-full bg-gray-100"
            ></div>
            <div class="h-5 w-20 animate-pulse rounded-full bg-gray-100"></div>
          </div>
        {/each}
      </div>
    {:else if filteredList.length === 0}
      <div class="flex flex-col items-center justify-center gap-3 py-16">
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
              d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
            />
          </svg>
        </div>
        {#if searchQuery || filterTipe !== "semua"}
          <p class="text-sm font-medium text-gray-500">
            Tidak ada karyawan yang cocok
          </p>
          <Button
            variant="link"
            size="sm"
            onclick={() => {
              searchQuery = "";
              filterTipe = "semua";
            }}
          >
            Hapus filter
          </Button>
        {:else}
          <p class="text-sm font-medium text-gray-500">
            Belum ada akun karyawan
          </p>
          <p class="text-xs text-gray-400">
            Mulai dengan menambahkan akun karyawan pertama
          </p>
          <Button onclick={bukaTambah} class="mt-1">+ Tambah Akun</Button>
        {/if}
      </div>
    {:else}
      <Table.Root class="table-fixed">
        <Table.Header>
          <Table.Row class="bg-gray-50 hover:bg-gray-50">
            <Table.Head class="w-[30%]">Karyawan</Table.Head>
            <Table.Head class="w-[16%]">Jabatan</Table.Head>
            <Table.Head class="w-[15%]">Info Kerja</Table.Head>
            <Table.Head class="w-[12%] text-center">Tipe Akun</Table.Head>
            <Table.Head class="w-[14%] text-center">Penggajian</Table.Head>
            <Table.Head class="w-[10%]">Expired</Table.Head>
            <Table.Head class="w-[13%]"></Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each filteredList as k}
            {@const expired = isExpired(k.tanggal_expired)}
            <Table.Row>
              <Table.Cell>
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-gray-800" title={k.name}>
                    {k.name}
                  </p>
                  <p class="mt-0.5 truncate text-xs text-gray-500" title={k.email}>
                    {k.email}
                  </p>
                  {#if k.kode_karyawan}
                    <p class="mt-1 text-[11px] font-medium text-gray-400">
                      ID: {k.kode_karyawan}
                    </p>
                  {/if}
                </div>
              </Table.Cell>
              <Table.Cell>
                <div class="space-y-1">
                  <span class="inline-flex max-w-full whitespace-nowrap rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    {ROLE_LABEL[k.role] ?? k.role}
                  </span>
                  <p class="text-[11px] text-gray-500">{tipeKaryawanLabel(k.role)}</p>
                </div>
              </Table.Cell>
              <Table.Cell>
                <div class="space-y-1">
                  <p class="truncate text-xs font-medium text-gray-700" title={k.jabatan || k.divisi || "-"}>
                    {k.jabatan || k.divisi || "-"}
                  </p>
                  <span
                    class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold {k.status_kerja === 'cuti'
                      ? 'bg-amber-100 text-amber-700'
                      : k.status_kerja === 'nonaktif'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'}"
                  >
                    {STATUS_KERJA_LABEL[k.status_kerja ?? "aktif"]}
                  </span>
                </div>
              </Table.Cell>
              <Table.Cell class="text-center">
                {#if k.tipe_akun === "temporary"}
                  <span
                    class="inline-flex whitespace-nowrap rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700"
                  >
                    Temporary
                  </span>
                {:else}
                  <span
                    class="inline-flex whitespace-nowrap rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700"
                  >
                    Permanent
                  </span>
                {/if}
              </Table.Cell>
              <Table.Cell class="text-center">
                <span
                  class="inline-flex whitespace-nowrap rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700"
                >
                  {TIPE_PENGGAJIAN_LABEL[k.tipe_penggajian ?? "bulanan"]}
                </span>
              </Table.Cell>
              <Table.Cell>
                {#if k.tipe_akun === "temporary" && k.tanggal_expired}
                  <span
                    class="text-xs {expired
                      ? 'font-semibold text-red-600'
                      : 'text-gray-500'}"
                  >
                    {expired ? "⚠ " : ""}{formatDate(k.tanggal_expired)}
                  </span>
                {:else}
                  <span class="text-xs text-gray-300">—</span>
                {/if}
              </Table.Cell>
              <Table.Cell class="text-right">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    {#snippet child({ props })}
                      <Button
                        variant="outline"
                        size="icon"
                        class="h-8 w-8"
                        aria-label={`Aksi ${k.name}`}
                        {...props}
                      >
                        <MoreHorizontalIcon class="h-4 w-4" />
                      </Button>
                    {/snippet}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="end" class="w-44">
                    <DropdownMenu.Item onclick={() => goto(`/karyawan/data/${k.uid}`)}>
                      <EyeIcon class="mr-2 h-4 w-4" />
                      Lihat Detail
                    </DropdownMenu.Item>
                    <DropdownMenu.Item onclick={() => bukaEdit(k)}>
                      <PencilIcon class="mr-2 h-4 w-4" />
                      Edit Data
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item
                      class="text-red-600 focus:bg-red-50 focus:text-red-700"
                      onclick={() => bukaHapus(k)}
                    >
                      <Trash2Icon class="mr-2 h-4 w-4" />
                      Hapus Akun
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>

      <div
        class="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-3"
      >
        <p class="text-xs text-gray-400">
          Menampilkan {filteredList.length} dari {karyawanList.length} karyawan
        </p>
      </div>
    {/if}
  </div>
{/if}

<!-- ── Dialog: Tambah Akun ────────────────────────────────────────── -->
<Dialog.Root bind:open={openTambah}>
  <Dialog.Content class="max-h-[92vh] max-w-2xl overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title>Tambah Akun Karyawan</Dialog.Title>
      <Dialog.Description
        >Buat akun login baru untuk karyawan.</Dialog.Description
      >
    </Dialog.Header>

    <div class="space-y-4">
      <div class="space-y-1.5">
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="t-nama"
        >
          Nama Lengkap <span class="text-red-500">*</span>
        </label>
        <Input id="t-nama" placeholder="cth: Budi Santoso" bind:value={fNama} />
      </div>
      <div class="space-y-1.5">
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="t-email"
        >
          Email <span class="text-red-500">*</span>
        </label>
        <Input
          id="t-email"
          type="email"
          placeholder="budi@zarqa.id"
          bind:value={fEmail}
        />
      </div>
      <div class="space-y-1.5">
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="t-password"
        >
          Password <span class="text-red-500">*</span>
          <span class="text-xs font-normal text-gray-400"
            >(minimal 6 karakter)</span
          >
        </label>
        <Input
          id="t-password"
          type="password"
          placeholder="••••••••"
          bind:value={fPassword}
        />
      </div>
      <div class="space-y-1.5">
        <label class="mb-1.5 block text-sm font-medium text-gray-700">
          Role <span class="text-red-500">*</span>
        </label>
        <Select.Root
          type="single"
          value={fRole}
          onValueChange={(val) => val && (fRole = val as UserRole)}
        >
          <Select.Trigger class="w-full">
            <span>{ROLE_LABEL[fRole]}</span>
          </Select.Trigger>
          <Select.Content preventScroll={false}>
            {#each ROLE_KARYAWAN as role}
              <Select.Item value={role}>{ROLE_LABEL[role]}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-1.5">
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="t-kode">
            Kode Karyawan
          </label>
          <Input id="t-kode" placeholder="cth: EMP-001" bind:value={fKode} />
        </div>
        <div class="space-y-1.5">
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="t-hp">
            No. HP
          </label>
          <Input id="t-hp" placeholder="08xx..." bind:value={fNoHp} />
        </div>
        <div class="space-y-1.5">
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="t-jabatan">
            Jabatan
          </label>
          <Input id="t-jabatan" placeholder="cth: Kepala Jahit" bind:value={fJabatan} />
        </div>
        <div class="space-y-1.5">
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="t-divisi">
            Divisi
          </label>
          <Input id="t-divisi" placeholder="cth: Produksi" bind:value={fDivisi} />
        </div>
        <div class="space-y-1.5">
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="t-masuk">
            Tanggal Masuk
          </label>
          <input
            id="t-masuk"
            type="date"
            bind:value={fTanggalMasuk}
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div class="space-y-1.5">
          <label class="mb-1.5 block text-sm font-medium text-gray-700">
            Status Kerja
          </label>
          <Select.Root
            type="single"
            value={fStatusKerja}
            onValueChange={(val) => val && (fStatusKerja = val as "aktif" | "cuti" | "nonaktif")}
          >
            <Select.Trigger class="w-full">
              <span>{STATUS_KERJA_LABEL[fStatusKerja]}</span>
            </Select.Trigger>
            <Select.Content preventScroll={false}>
              {#each STATUS_KERJA_OPTIONS as status}
                <Select.Item value={status}>{STATUS_KERJA_LABEL[status]}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>
      <div class="space-y-1.5">
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="t-alamat">
          Alamat
        </label>
        <textarea
          id="t-alamat"
          rows="2"
          placeholder="Alamat karyawan..."
          bind:value={fAlamat}
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        ></textarea>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-1.5">
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="t-darurat">
            Kontak Darurat
          </label>
          <Input id="t-darurat" placeholder="Nama / nomor keluarga" bind:value={fKontakDarurat} />
        </div>
        <div class="space-y-1.5">
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="t-catatan">
            Catatan HR
          </label>
          <Input id="t-catatan" placeholder="Catatan internal" bind:value={fCatatanHr} />
        </div>
      </div>
      <div class="space-y-1.5">
        <label class="mb-1.5 block text-sm font-medium text-gray-700">
          Tipe Akun <span class="text-red-500">*</span>
        </label>
        <div class="flex gap-3">
          <button
            type="button"
            onclick={() => (fTipe = "permanent")}
            class="flex-1 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition
              {fTipe === 'permanent'
              ? 'border-green-500 bg-green-50 text-green-700'
              : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}"
            >Permanent</button
          >
          <button
            type="button"
            onclick={() => (fTipe = "temporary")}
            class="flex-1 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition
              {fTipe === 'temporary'
              ? 'border-orange-500 bg-orange-50 text-orange-700'
              : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}"
            >Temporary</button
          >
        </div>
      </div>
      {#if fTipe === "temporary"}
        <div class="space-y-1.5">
          <label
            class="mb-1.5 block text-sm font-medium text-gray-700"
            for="t-expired"
          >
            Tanggal Berakhir Kontrak <span class="text-red-500">*</span>
          </label>
          <input
            id="t-expired"
            type="date"
            bind:value={fExpired}
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      {/if}
      <div class="space-y-1.5">
        <label class="mb-1.5 block text-sm font-medium text-gray-700">
          Tipe Penggajian <span class="text-red-500">*</span>
        </label>
        <div class="grid grid-cols-2 gap-2">
          {#each TIPE_PENGGAJIAN_OPTIONS as tipe}
            <button
              type="button"
              onclick={() => (fTipePenggajian = tipe)}
              class="flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition
                {fTipePenggajian === tipe
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}"
            >
              {TIPE_PENGGAJIAN_LABEL[tipe]}
            </button>
          {/each}
        </div>
        <p class="text-xs text-gray-400">
          {#if fTipePenggajian === "harian"}
            Gaji dihitung per hari kerja (borongan)
          {:else if fTipePenggajian === "mingguan"}
            Gaji dihitung per pcs (untuk tukang steam, jahit, cutting)
          {:else if fTipePenggajian === "tahunan"}
            Gaji tetap per tahun
          {:else}
            Gaji tetap per bulan
          {/if}
        </p>
      </div>
      <div class="space-y-1.5">
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="t-gaji-pokok">
          Gaji Tetap
          <span class="text-xs font-normal text-gray-400">(opsional)</span>
        </label>
        <Input id="t-gaji-pokok" type="number" min="0" placeholder="0" bind:value={fGajiPokok} />
        <p class="text-xs text-gray-400">
          Dipakai ke estimasi keuangan untuk karyawan reguler. Karyawan produksi memakai tarif per pcs.
        </p>
      </div>
    </div>

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openTambah = false)}
        >Batal</Button
      >
      <Button onclick={submitTambah} disabled={saving || !canSubmitTambah}>
        {saving ? "Membuat akun..." : "Buat Akun"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- ── Dialog: Edit Karyawan ─────────────────────────────────────── -->
<Dialog.Root bind:open={openEdit}>
  <Dialog.Content class="max-h-[92vh] max-w-2xl overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title>Edit Data Karyawan</Dialog.Title>
      <Dialog.Description
        >Perbarui nama, role, atau tipe kontrak.</Dialog.Description
      >
    </Dialog.Header>

    {#if selectedKaryawan}
      <div class="space-y-4">
        <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
          <p class="text-xs text-gray-400">Email</p>
          <p class="text-sm font-medium text-gray-700">
            {selectedKaryawan.email}
          </p>
        </div>
        <div class="space-y-1.5">
          <label
            class="mb-1.5 block text-sm font-medium text-gray-700"
            for="e-nama"
          >
            Nama Lengkap <span class="text-red-500">*</span>
          </label>
          <Input id="e-nama" bind:value={eNama} />
        </div>
        <div class="space-y-1.5">
          <label class="mb-1.5 block text-sm font-medium text-gray-700">
            Role <span class="text-red-500">*</span>
          </label>
          <Select.Root
            type="single"
            value={eRole}
            onValueChange={(val) => val && (eRole = val as UserRole)}
          >
            <Select.Trigger class="w-full">
              <span>{ROLE_LABEL[eRole]}</span>
            </Select.Trigger>
            <Select.Content preventScroll={false}>
              {#each ROLE_KARYAWAN as role}
                <Select.Item value={role}>{ROLE_LABEL[role]}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label class="mb-1.5 block text-sm font-medium text-gray-700" for="e-kode">
              Kode Karyawan
            </label>
            <Input id="e-kode" placeholder="cth: EMP-001" bind:value={eKode} />
          </div>
          <div class="space-y-1.5">
            <label class="mb-1.5 block text-sm font-medium text-gray-700" for="e-hp">
              No. HP
            </label>
            <Input id="e-hp" placeholder="08xx..." bind:value={eNoHp} />
          </div>
          <div class="space-y-1.5">
            <label class="mb-1.5 block text-sm font-medium text-gray-700" for="e-jabatan">
              Jabatan
            </label>
            <Input id="e-jabatan" placeholder="cth: Kepala Jahit" bind:value={eJabatan} />
          </div>
          <div class="space-y-1.5">
            <label class="mb-1.5 block text-sm font-medium text-gray-700" for="e-divisi">
              Divisi
            </label>
            <Input id="e-divisi" placeholder="cth: Produksi" bind:value={eDivisi} />
          </div>
          <div class="space-y-1.5">
            <label class="mb-1.5 block text-sm font-medium text-gray-700" for="e-masuk">
              Tanggal Masuk
            </label>
            <input
              id="e-masuk"
              type="date"
              bind:value={eTanggalMasuk}
              class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div class="space-y-1.5">
            <label class="mb-1.5 block text-sm font-medium text-gray-700">
              Status Kerja
            </label>
            <Select.Root
              type="single"
              value={eStatusKerja}
              onValueChange={(val) => val && (eStatusKerja = val as "aktif" | "cuti" | "nonaktif")}
            >
              <Select.Trigger class="w-full">
                <span>{STATUS_KERJA_LABEL[eStatusKerja]}</span>
              </Select.Trigger>
              <Select.Content preventScroll={false}>
                {#each STATUS_KERJA_OPTIONS as status}
                  <Select.Item value={status}>{STATUS_KERJA_LABEL[status]}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        </div>
        <div class="space-y-1.5">
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="e-alamat">
            Alamat
          </label>
          <textarea
            id="e-alamat"
            rows="2"
            placeholder="Alamat karyawan..."
            bind:value={eAlamat}
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          ></textarea>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label class="mb-1.5 block text-sm font-medium text-gray-700" for="e-darurat">
              Kontak Darurat
            </label>
            <Input id="e-darurat" placeholder="Nama / nomor keluarga" bind:value={eKontakDarurat} />
          </div>
          <div class="space-y-1.5">
            <label class="mb-1.5 block text-sm font-medium text-gray-700" for="e-catatan">
              Catatan HR
            </label>
            <Input id="e-catatan" placeholder="Catatan internal" bind:value={eCatatanHr} />
          </div>
        </div>
        <div class="space-y-1.5">
          <label class="mb-1.5 block text-sm font-medium text-gray-700"
            >Tipe Akun</label
          >
          <div class="flex gap-3">
            <button
              type="button"
              onclick={() => (eTipe = "permanent")}
              class="flex-1 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition
                {eTipe === 'permanent'
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}"
              >Permanent</button
            >
            <button
              type="button"
              onclick={() => (eTipe = "temporary")}
              class="flex-1 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition
                {eTipe === 'temporary'
                ? 'border-orange-500 bg-orange-50 text-orange-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}"
              >Temporary</button
            >
          </div>
        </div>
        {#if eTipe === "temporary"}
          <div class="space-y-1.5">
            <label
              class="mb-1.5 block text-sm font-medium text-gray-700"
              for="e-expired"
            >
              Tanggal Berakhir Kontrak <span class="text-red-500">*</span>
            </label>
            <input
              id="e-expired"
              type="date"
              bind:value={eExpired}
              class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        {/if}
        <div class="space-y-1.5">
          <label class="mb-1.5 block text-sm font-medium text-gray-700">
            Tipe Penggajian <span class="text-red-500">*</span>
          </label>
          <div class="grid grid-cols-2 gap-2">
            {#each TIPE_PENGGAJIAN_OPTIONS as tipe}
              <button
                type="button"
                onclick={() => (eTipePenggajian = tipe)}
                class="flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition
                  {eTipePenggajian === tipe
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}"
              >
                {TIPE_PENGGAJIAN_LABEL[tipe]}
              </button>
            {/each}
          </div>
        </div>
        <div class="space-y-1.5">
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="e-gaji-pokok">
            Gaji Tetap
            <span class="text-xs font-normal text-gray-400">(opsional)</span>
          </label>
          <Input id="e-gaji-pokok" type="number" min="0" placeholder="0" bind:value={eGajiPokok} />
          <p class="text-xs text-gray-400">
            Dipakai ke estimasi keuangan untuk karyawan reguler. Karyawan produksi memakai tarif per pcs.
          </p>
        </div>
      </div>
    {/if}

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openEdit = false)}>Batal</Button
      >
      <Button onclick={submitEdit} disabled={saving || !canSubmitEdit}>
        {saving ? "Menyimpan..." : "Simpan Perubahan"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- ── Dialog: Hapus Akun ─────────────────────────────────────────── -->
<Dialog.Root bind:open={openHapus}>
  <Dialog.Content class="max-w-sm">
    <Dialog.Header>
      <Dialog.Title>Hapus Akun Karyawan</Dialog.Title>
      <Dialog.Description
        >Tindakan ini tidak dapat dibatalkan.</Dialog.Description
      >
    </Dialog.Header>

    {#if selectedKaryawan}
      <div class="rounded-lg border border-gray-100 bg-gray-50 p-4">
        <p class="text-sm font-semibold text-gray-800">
          {selectedKaryawan.name}
        </p>
        <p class="text-xs text-gray-400">{selectedKaryawan.email}</p>
        <span
          class="mt-2 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
        >
          {ROLE_LABEL[selectedKaryawan.role]}
        </span>
      </div>
      <p class="text-sm text-gray-500">
        Karyawan ini tidak akan bisa login ke sistem setelah dihapus.
      </p>
    {/if}

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openHapus = false)}
        >Batal</Button
      >
      <Button variant="destructive" onclick={submitHapus} disabled={saving}>
        {saving ? "Menghapus..." : "Ya, Hapus Akun"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
