<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { isKaryawanManager } from "$lib/stores/auth.store";
  import {
    getKaryawanById,
    ROLE_KARYAWAN,
    ROLE_LABEL,
    tipeKaryawanLabel,
    updateKaryawan,
  } from "$lib/firebase/karyawan";
  import { getPenggajianPeriode } from "$lib/firebase/penggajian";
  import { getPeriodRange } from "$lib/period";
  import type { TipePenggajian, UserProfile, UserRole } from "$lib/types";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";

  let karyawan = $state<UserProfile | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);
  let payroll = $state<Awaited<ReturnType<typeof getPenggajianPeriode>>>([]);
  let openEdit = $state(false);
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

  const uid = $derived($page.params.uid ?? "");
  const payrollKaryawan = $derived(payroll.find((item) => item.uid === uid));
  const isProductionEmployee = $derived(
    !!karyawan &&
      ["kepala_cutting", "kepala_jahit", "kepala_steam"].includes(karyawan.role),
  );

  const TIPE_PENGGAJIAN_LABEL: Record<string, string> = {
    harian: "Harian",
    mingguan: "Mingguan",
    bulanan: "Bulanan",
    tahunan: "Tahunan",
  };

  const STATUS_KERJA_LABEL: Record<string, string> = {
    aktif: "Aktif",
    cuti: "Cuti",
    nonaktif: "Nonaktif",
  };
  const STATUS_KERJA_OPTIONS: Array<"aktif" | "cuti" | "nonaktif"> = [
    "aktif",
    "cuti",
    "nonaktif",
  ];
  const TIPE_PENGGAJIAN_OPTIONS: TipePenggajian[] = [
    "harian",
    "mingguan",
    "bulanan",
    "tahunan",
  ];
  const canSubmitEdit = $derived(
    eNama.trim() !== "" && (eTipe === "permanent" || eExpired !== ""),
  );

  function initial(name: string): string {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  }

  function formatDate(value: any): string {
    if (!value) return "-";
    const date = value.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function rupiah(value: number | undefined): string {
    return `Rp ${Math.round(value ?? 0).toLocaleString("id-ID")}`;
  }

  function isExpired(value: any): boolean {
    if (!value) return false;
    const date = value.toDate ? value.toDate() : new Date(value);
    return date < new Date();
  }

  function tsToInputDate(value: any): string {
    if (!value) return "";
    const date = value.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  function roleDivisi(role: string): string {
    if (role.includes("cutting")) return "Cutting";
    if (role.includes("jahit")) return "Jahit";
    if (role.includes("steam")) return "Steam";
    if (role.includes("gudang")) return "Gudang";
    if (role.includes("hr")) return "HR";
    if (role.includes("keuangan")) return "Keuangan";
    return "Manajemen";
  }

  function payrollUnitLabel(role: string): string {
    if (role.includes("cutting")) return "Cutting";
    if (role.includes("jahit")) return "Jahit";
    if (role.includes("steam")) return "Steam";
    return "Reguler";
  }

  function showSuccess(message: string) {
    successMsg = message;
    setTimeout(() => (successMsg = null), 3000);
  }

  function bukaEdit() {
    if (!karyawan) return;
    eNama = karyawan.name;
    eRole = karyawan.role;
    eKode = karyawan.kode_karyawan ?? "";
    eNoHp = karyawan.no_hp ?? "";
    eJabatan = karyawan.jabatan ?? "";
    eDivisi = karyawan.divisi ?? "";
    eTanggalMasuk = karyawan.tanggal_masuk ?? "";
    eStatusKerja = karyawan.status_kerja ?? "aktif";
    eAlamat = karyawan.alamat ?? "";
    eKontakDarurat = karyawan.kontak_darurat ?? "";
    eCatatanHr = karyawan.catatan_hr ?? "";
    eTipe = karyawan.tipe_akun ?? "permanent";
    eExpired = tsToInputDate(karyawan.tanggal_expired);
    eTipePenggajian = karyawan.tipe_penggajian ?? "bulanan";
    eGajiPokok = karyawan.gaji_pokok ? String(karyawan.gaji_pokok) : "";
    openEdit = true;
  }

  async function submitEdit() {
    if (!karyawan || !canSubmitEdit) return;
    saving = true;
    errorMsg = null;
    try {
      await updateKaryawan(karyawan.uid, {
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
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : "Gagal memperbarui data karyawan.";
    } finally {
      saving = false;
    }
  }

  async function load() {
    if (!uid) return;
    loading = true;
    errorMsg = null;
    try {
      const [profile, payrollData] = await Promise.all([
        getKaryawanById(uid),
        getPenggajianPeriode(getPeriodRange("bulan_ini")),
      ]);
      karyawan = profile;
      payroll = payrollData;
      if (!profile) errorMsg = "Data karyawan tidak ditemukan.";
    } catch {
      errorMsg = "Gagal memuat detail karyawan.";
    } finally {
      loading = false;
    }
  }

  onMount(load);
</script>

{#if successMsg}
  <div class="fixed right-5 top-5 z-9999 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 shadow-lg">
    {successMsg}
  </div>
{/if}

{#if !$isKaryawanManager}
  <div class="flex flex-col items-center justify-center gap-3 py-24 text-center">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
      <span class="text-xl font-bold text-red-500">!</span>
    </div>
    <p class="font-semibold text-gray-700">Akses Ditolak</p>
    <p class="text-sm text-gray-400">Halaman ini hanya dapat diakses oleh Owner, HR, atau Developer.</p>
  </div>
{:else if loading}
  <div class="space-y-4">
    <div class="h-28 animate-pulse rounded-xl bg-gray-100"></div>
    <div class="grid gap-4 lg:grid-cols-3">
      <div class="h-36 animate-pulse rounded-xl bg-gray-100"></div>
      <div class="h-36 animate-pulse rounded-xl bg-gray-100"></div>
      <div class="h-36 animate-pulse rounded-xl bg-gray-100"></div>
    </div>
  </div>
{:else if errorMsg || !karyawan}
  <div class="flex flex-col items-center justify-center gap-3 py-24 text-center">
    <p class="font-semibold text-gray-700">{errorMsg}</p>
    <a href="/karyawan/data" class="text-sm font-medium text-blue-600 hover:underline">Kembali ke data karyawan</a>
  </div>
{:else}
  <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-2 text-sm">
      <a href="/karyawan" class="text-gray-400 hover:text-gray-600 hover:underline">Dashboard Karyawan</a>
      <span class="text-gray-300">/</span>
      <a href="/karyawan/data" class="text-gray-400 hover:text-gray-600 hover:underline">Data Karyawan</a>
      <span class="text-gray-300">/</span>
      <span class="font-medium text-gray-700">Detail</span>
    </div>
    <div class="flex items-center gap-2">
      <Button onclick={bukaEdit}>Edit Karyawan</Button>
      <Button variant="outline" onclick={load}>Refresh</Button>
      <a
        href="/karyawan/data"
        class="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
      >
        Kembali
      </a>
    </div>
  </div>

  <section class="mb-5 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
    <div class="flex flex-wrap items-center gap-4 border-b border-gray-100 px-5 py-5">
      <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 text-xl font-bold text-white">
        {initial(karyawan.name)}
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="truncate text-2xl font-semibold text-gray-900">{karyawan.name}</h1>
          <span
            class="rounded-full px-2.5 py-1 text-xs font-semibold {karyawan.status_kerja === 'cuti'
              ? 'bg-amber-100 text-amber-700'
              : karyawan.status_kerja === 'nonaktif'
                ? 'bg-red-100 text-red-700'
                : 'bg-green-100 text-green-700'}"
          >
            {STATUS_KERJA_LABEL[karyawan.status_kerja ?? "aktif"]}
          </span>
        </div>
        <p class="mt-1 truncate text-sm text-gray-500">{karyawan.email}</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <span class="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            {ROLE_LABEL[karyawan.role] ?? karyawan.role}
          </span>
          <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
            {karyawan.divisi || roleDivisi(karyawan.role)}
          </span>
          {#if karyawan.kode_karyawan}
            <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
              {karyawan.kode_karyawan}
            </span>
          {/if}
        </div>
      </div>
      <div class="text-right">
        <p class="text-xs text-gray-400">Masuk Kerja</p>
        <p class="text-sm font-semibold text-gray-800">{formatDate(karyawan.tanggal_masuk)}</p>
      </div>
    </div>
  </section>

  <div class="grid gap-4 lg:grid-cols-4">
    <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Informasi Kerja</h2>
      <dl class="mt-4 space-y-3">
        <div>
          <dt class="text-xs text-gray-400">Jabatan</dt>
          <dd class="text-sm font-medium text-gray-800">{karyawan.jabatan || "-"}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-400">Divisi</dt>
          <dd class="text-sm font-medium text-gray-800">{karyawan.divisi || roleDivisi(karyawan.role)}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-400">Tipe Akun</dt>
          <dd class="text-sm font-medium text-gray-800">
            {karyawan.tipe_akun === "temporary" ? "Temporary" : "Permanent"}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-gray-400">Expired Kontrak</dt>
          <dd class="text-sm font-medium {isExpired(karyawan.tanggal_expired) ? 'text-red-600' : 'text-gray-800'}">
            {karyawan.tipe_akun === "temporary" ? formatDate(karyawan.tanggal_expired) : "-"}
          </dd>
        </div>
      </dl>
    </section>

    <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Kontak</h2>
      <dl class="mt-4 space-y-3">
        <div>
          <dt class="text-xs text-gray-400">No. HP</dt>
          <dd class="text-sm font-medium text-gray-800">{karyawan.no_hp || "-"}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-400">Alamat</dt>
          <dd class="whitespace-pre-wrap text-sm font-medium text-gray-800">{karyawan.alamat || "-"}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-400">Kontak Darurat</dt>
          <dd class="text-sm font-medium text-gray-800">{karyawan.kontak_darurat || "-"}</dd>
        </div>
      </dl>
    </section>

    <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Absensi</h2>
      <div class="mt-4 grid grid-cols-2 gap-3">
        <div class="rounded-lg bg-gray-50 p-3">
          <p class="text-xs text-gray-400">Bulan Ini</p>
          <p class="mt-1 text-sm font-semibold text-gray-800">Belum aktif</p>
        </div>
        <div class="rounded-lg bg-gray-50 p-3">
          <p class="text-xs text-gray-400">Status</p>
          <p class="mt-1 text-sm font-semibold text-gray-800">
            {STATUS_KERJA_LABEL[karyawan.status_kerja ?? "aktif"]}
          </p>
        </div>
      </div>
      <p class="mt-4 text-xs leading-relaxed text-gray-400">
        Riwayat hadir, izin, sakit, dan cuti akan tampil di sini setelah modul absensi diaktifkan.
      </p>
    </section>

    <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-400">
        {isProductionEmployee ? "Penggajian Produksi" : "Penggajian"}
      </h2>
      <div class="mt-4 grid grid-cols-2 gap-3">
        <div class="rounded-lg bg-gray-50 p-3">
          <p class="text-xs text-gray-400">Tipe</p>
          <p class="mt-1 text-sm font-semibold text-gray-800">
            {TIPE_PENGGAJIAN_LABEL[karyawan.tipe_penggajian ?? "bulanan"]}
          </p>
        </div>
        {#if isProductionEmployee}
          <div class="rounded-lg bg-gray-50 p-3">
            <p class="text-xs text-gray-400">Hasil {payrollUnitLabel(karyawan.role)}</p>
            <p class="mt-1 text-sm font-semibold text-gray-800">
              {payrollKaryawan?.total_pcs ?? 0} pcs
            </p>
          </div>
        {:else}
          <div class="rounded-lg bg-gray-50 p-3">
            <p class="text-xs text-gray-400">Gaji Tetap</p>
            <p class="mt-1 text-sm font-semibold text-gray-800">{rupiah(karyawan.gaji_pokok)}</p>
          </div>
        {/if}
      </div>
      <a
        href="/karyawan/penggajian"
        class="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
      >
        Buka Penggajian
      </a>
    </section>
  </div>

  <section class="mt-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Administrasi</h2>
      <Button variant="outline" size="sm" onclick={bukaEdit}>Edit Data</Button>
    </div>
    <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-lg bg-gray-50 p-3">
        <p class="text-xs text-gray-400">Dibuat</p>
        <p class="mt-1 text-sm font-semibold text-gray-800">{formatDate(karyawan.createdAt)}</p>
      </div>
      <div class="rounded-lg bg-gray-50 p-3">
        <p class="text-xs text-gray-400">Update Terakhir</p>
        <p class="mt-1 text-sm font-semibold text-gray-800">{formatDate(karyawan.updatedAt)}</p>
      </div>
      <div class="rounded-lg bg-gray-50 p-3">
        <p class="text-xs text-gray-400">Role Sistem</p>
        <p class="mt-1 truncate text-sm font-semibold text-gray-800">{ROLE_LABEL[karyawan.role] ?? karyawan.role}</p>
        <p class="mt-0.5 text-xs text-gray-500">{tipeKaryawanLabel(karyawan.role)}</p>
      </div>
      <div class="rounded-lg bg-gray-50 p-3">
        <p class="text-xs text-gray-400">Akses Login</p>
        <p class="mt-1 text-sm font-semibold {karyawan.status_kerja === 'nonaktif' ? 'text-red-600' : 'text-gray-800'}">
          {karyawan.status_kerja === "nonaktif" ? "Nonaktif" : "Aktif"}
        </p>
      </div>
    </div>
  </section>

  {#if isProductionEmployee}
    <section class="mt-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-400">
          Hasil Kerja Bulan Ini
        </h2>
        <span class="text-xs text-gray-400">{payrollKaryawan?.jumlah_batch ?? 0} batch</span>
      </div>
      {#if !payrollKaryawan || payrollKaryawan.breakdown.length === 0}
        <div class="py-8 text-center text-sm text-gray-400">
          Belum ada hasil kerja bulan ini.
        </div>
      {:else}
        <div class="mt-4 overflow-hidden rounded-lg border border-gray-100">
          <table class="w-full table-fixed text-sm">
            <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th class="px-4 py-3 text-left">Model</th>
                <th class="px-4 py-3 text-left">Warna</th>
                <th class="px-4 py-3 text-left">Ukuran</th>
                <th class="px-4 py-3 text-right">Pcs</th>
                <th class="px-4 py-3 text-right">Tanggal</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              {#each payrollKaryawan.breakdown.slice(0, 12) as item}
                <tr>
                  <td class="truncate px-4 py-3 font-medium text-gray-800">{item.nama_model}</td>
                  <td class="truncate px-4 py-3 text-gray-600">{item.nama_warna || "-"}</td>
                  <td class="px-4 py-3 text-gray-600">{item.ukuran}</td>
                  <td class="px-4 py-3 text-right font-semibold text-gray-900">{item.pcs}</td>
                  <td class="px-4 py-3 text-right text-gray-500">{item.tanggal}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}

  {#if karyawan.catatan_hr}
    <section class="mt-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-400">Catatan HR</h2>
      <p class="mt-3 whitespace-pre-wrap text-sm text-gray-700">{karyawan.catatan_hr}</p>
    </section>
  {/if}
{/if}

<Dialog.Root bind:open={openEdit}>
  <Dialog.Content class="max-h-[92vh] max-w-2xl overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title>Edit Karyawan</Dialog.Title>
      <Dialog.Description>Perbarui profil, kontrak, kontak, dan penggajian karyawan.</Dialog.Description>
    </Dialog.Header>

    {#if karyawan}
      <div class="space-y-4">
        <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
          <p class="text-xs text-gray-400">Email login</p>
          <p class="text-sm font-medium text-gray-700">{karyawan.email}</p>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label class="block text-sm font-medium text-gray-700" for="e-nama">Nama Lengkap <span class="text-red-500">*</span></label>
            <Input id="e-nama" bind:value={eNama} />
          </div>
          <div class="space-y-1.5">
            <label class="block text-sm font-medium text-gray-700">Role <span class="text-red-500">*</span></label>
            <Select.Root type="single" value={eRole} onValueChange={(val) => val && (eRole = val as UserRole)}>
              <Select.Trigger class="w-full"><span>{ROLE_LABEL[eRole]}</span></Select.Trigger>
              <Select.Content preventScroll={false}>
                {#each ROLE_KARYAWAN as role}
                  <Select.Item value={role}>{ROLE_LABEL[role]}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <div class="space-y-1.5">
            <label class="block text-sm font-medium text-gray-700" for="e-kode">Kode Karyawan</label>
            <Input id="e-kode" bind:value={eKode} placeholder="cth: EMP-001" />
          </div>
          <div class="space-y-1.5">
            <label class="block text-sm font-medium text-gray-700" for="e-hp">No. HP</label>
            <Input id="e-hp" bind:value={eNoHp} placeholder="08xx..." />
          </div>
          <div class="space-y-1.5">
            <label class="block text-sm font-medium text-gray-700" for="e-jabatan">Jabatan</label>
            <Input id="e-jabatan" bind:value={eJabatan} placeholder="cth: Kepala Jahit" />
          </div>
          <div class="space-y-1.5">
            <label class="block text-sm font-medium text-gray-700" for="e-divisi">Divisi</label>
            <Input id="e-divisi" bind:value={eDivisi} placeholder="cth: Produksi" />
          </div>
          <div class="space-y-1.5">
            <label class="block text-sm font-medium text-gray-700" for="e-masuk">Tanggal Masuk</label>
            <input
              id="e-masuk"
              type="date"
              bind:value={eTanggalMasuk}
              class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div class="space-y-1.5">
            <label class="block text-sm font-medium text-gray-700">Status Kerja</label>
            <Select.Root type="single" value={eStatusKerja} onValueChange={(val) => val && (eStatusKerja = val as "aktif" | "cuti" | "nonaktif")}>
              <Select.Trigger class="w-full"><span>{STATUS_KERJA_LABEL[eStatusKerja]}</span></Select.Trigger>
              <Select.Content preventScroll={false}>
                {#each STATUS_KERJA_OPTIONS as status}
                  <Select.Item value={status}>{STATUS_KERJA_LABEL[status]}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="block text-sm font-medium text-gray-700" for="e-alamat">Alamat</label>
          <textarea
            id="e-alamat"
            rows="2"
            bind:value={eAlamat}
            placeholder="Alamat karyawan..."
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          ></textarea>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label class="block text-sm font-medium text-gray-700">Tipe Akun <span class="text-red-500">*</span></label>
            <div class="flex gap-2">
              <button
                type="button"
                onclick={() => (eTipe = "permanent")}
                class="flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition {eTipe === 'permanent' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}"
              >
                Permanent
              </button>
              <button
                type="button"
                onclick={() => (eTipe = "temporary")}
                class="flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition {eTipe === 'temporary' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}"
              >
                Temporary
              </button>
            </div>
          </div>
          <div class="space-y-1.5">
            <label class="block text-sm font-medium text-gray-700">Tipe Penggajian <span class="text-red-500">*</span></label>
            <Select.Root type="single" value={eTipePenggajian} onValueChange={(val) => val && (eTipePenggajian = val as TipePenggajian)}>
              <Select.Trigger class="w-full"><span>{TIPE_PENGGAJIAN_LABEL[eTipePenggajian]}</span></Select.Trigger>
              <Select.Content preventScroll={false}>
                {#each TIPE_PENGGAJIAN_OPTIONS as tipe}
                  <Select.Item value={tipe}>{TIPE_PENGGAJIAN_LABEL[tipe]}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="block text-sm font-medium text-gray-700" for="e-gaji-pokok">
            Gaji Tetap <span class="text-xs font-normal text-gray-400">(opsional)</span>
          </label>
          <Input id="e-gaji-pokok" type="number" min="0" bind:value={eGajiPokok} placeholder="0" />
          <p class="text-xs text-gray-400">
            Dipakai untuk estimasi beban gaji reguler di halaman keuangan.
          </p>
        </div>

        {#if eTipe === "temporary"}
          <div class="space-y-1.5">
            <label class="block text-sm font-medium text-gray-700" for="e-expired">Tanggal Berakhir Kontrak <span class="text-red-500">*</span></label>
            <input
              id="e-expired"
              type="date"
              bind:value={eExpired}
              class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        {/if}

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label class="block text-sm font-medium text-gray-700" for="e-darurat">Kontak Darurat</label>
            <Input id="e-darurat" bind:value={eKontakDarurat} placeholder="Nama / nomor keluarga" />
          </div>
          <div class="space-y-1.5">
            <label class="block text-sm font-medium text-gray-700" for="e-catatan">Catatan HR</label>
            <Input id="e-catatan" bind:value={eCatatanHr} placeholder="Catatan internal" />
          </div>
        </div>
      </div>
    {/if}

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openEdit = false)}>Batal</Button>
      <Button onclick={submitEdit} disabled={saving || !canSubmitEdit}>
        {saving ? "Menyimpan..." : "Simpan Perubahan"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
