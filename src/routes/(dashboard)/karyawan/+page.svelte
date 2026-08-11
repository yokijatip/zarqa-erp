<script lang="ts">
  import { onMount } from "svelte";
  import { karyawanCache } from "$lib/stores/data-cache.svelte";
  import { isKaryawanManager } from "$lib/stores/auth.store";
  import { ROLE_LABEL } from "$lib/firebase/karyawan";
  import { getPenggajianPeriode } from "$lib/firebase/penggajian";
  import { getPeriodRange } from "$lib/period";
  import type { UserProfile } from "$lib/types";
  import StatCard from "$lib/components/StatCard.svelte";
  import { Button } from "$lib/components/ui/button";
  import UsersIcon from "@lucide/svelte/icons/users";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
  import AlertTriangleIcon from "@lucide/svelte/icons/triangle-alert";
  import BanknoteIcon from "@lucide/svelte/icons/banknote";
  import PieChartIcon from "@lucide/svelte/icons/pie-chart";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import UsersRoundIcon from "@lucide/svelte/icons/users-round";

  // ── State ──────────────────────────────────────────────────────────
  let karyawanList = $state<UserProfile[]>([]);
  let loading = $state(true);
  let penggajianMingguIni = $state<Awaited<ReturnType<typeof getPenggajianPeriode>>>([]);
  let loadingGaji = $state(true);

  const bulanIni = new Date().toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });

  // ── Derived ────────────────────────────────────────────────────────
  let totalPermanent = $derived(
    karyawanList.filter((k) => k.tipe_akun === "permanent").length,
  );
  let totalTemporary = $derived(
    karyawanList.filter((k) => k.tipe_akun === "temporary").length,
  );
  let totalExpired = $derived(
    karyawanList.filter(
      (k) => k.tipe_akun === "temporary" && isExpired(k.tanggal_expired),
    ).length,
  );

  let totalPcsMingguIni = $derived(
    penggajianMingguIni.reduce((s, d) => s + d.total_pcs, 0),
  );
  let karyawanAktifMingguIni = $derived(
    new Set(penggajianMingguIni.map((d) => d.uid)).size,
  );

  let topKaryawanTerproduktif = $derived.by(() => {
    if (penggajianMingguIni.length === 0) return [];
    return [...penggajianMingguIni]
      .sort((a, b) => b.total_pcs - a.total_pcs)
      .slice(0, 5);
  });

  let maxPcsMingguIni = $derived(
    topKaryawanTerproduktif.length > 0 ? topKaryawanTerproduktif[0].total_pcs : 1
  );

  // ── Helpers ────────────────────────────────────────────────────────
  function isExpired(ts: any): boolean {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d < new Date();
  }

  function rupiah(n: number): string {
    return `Rp${Math.round(n).toLocaleString("id-ID")}`;
  }

  async function load(force = false) {
    loading = true;
    try {
      karyawanList = await karyawanCache.get(force);
    } finally {
      loading = false;
    }
  }

  async function loadGaji() {
    loadingGaji = true;
    try {
      penggajianMingguIni = await getPenggajianPeriode(
        getPeriodRange("minggu_ini"),
      );
    } catch {
      penggajianMingguIni = [];
    } finally {
      loadingGaji = false;
    }
  }

  onMount(() => {
    load();
    loadGaji();
  });
</script>

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
      <h1 class="text-xl font-semibold text-gray-900">Dashboard Karyawan</h1>
      <p class="mt-0.5 text-sm text-gray-500">
        Ringkasan data SDM & penggajian — {bulanIni}
      </p>
    </div>
    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        onclick={() => {
          load(true);
          loadGaji();
        }}
      >
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
      <a
        href="/karyawan/data"
        class="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
      >
        <UsersRoundIcon class="h-4 w-4" />
        Kelola Data Karyawan →
      </a>
    </div>
  </div>

  <!-- ── Stats ──────────────────────────────────────────────────────── -->
  <div class="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
    <StatCard
      title="Total Karyawan"
      value={karyawanList.length}
      icon={UsersIcon}
      {loading}
      footerSubtext="akun terdaftar di sistem"
    />
    <StatCard
      title="Permanent"
      value={totalPermanent}
      icon={ShieldCheckIcon}
      {loading}
      footerSubtext="karyawan tetap"
      class="border-green-100 bg-green-50"
      valueClass="text-green-700"
    />
    <StatCard
      title="Temporary"
      value={totalTemporary}
      icon={ClockIcon}
      {loading}
      footerSubtext="kontrak / maklun"
      class="border-orange-100 bg-orange-50"
      valueClass="text-orange-700"
    />
    <StatCard
      title="Kontrak Expired"
      value={totalExpired}
      icon={AlertTriangleIcon}
      {loading}
      footerSubtext={totalExpired > 0
        ? "perlu diperbarui segera"
        : "semua aktif"}
      class={totalExpired > 0 ? "border-red-100 bg-red-50" : ""}
      valueClass={totalExpired > 0 ? "text-red-600" : ""}
    />
  </div>

  <!-- ── Distribusi + Penggajian ────────────────────────────────────── -->
  <div class="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
    <!-- Top Karyawan Terproduktif (Minggu Ini) -->
    <div
      class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
    >
      <div
        class="flex items-center justify-between border-b border-gray-50 px-5 py-4"
      >
        <div class="flex items-center gap-2">
          <TrophyIcon class="h-4 w-4 text-amber-500" />
          <h2 class="text-sm font-semibold text-gray-800">
            Top Karyawan Terproduktif
          </h2>
          <span class="text-xs text-gray-400">Minggu Ini</span>
        </div>
        <a
          href="/karyawan/penggajian"
          class="text-xs font-medium text-blue-600 hover:underline"
        >
          Lihat semua →
        </a>
      </div>
      {#if loadingGaji}
        <div class="space-y-3 p-5">
          {#each Array(4) as _}
            <div class="flex items-center gap-3">
              <div class="h-4 w-6 animate-pulse rounded bg-gray-100"></div>
              <div class="h-4 flex-1 animate-pulse rounded bg-gray-100"></div>
              <div class="h-4 w-12 animate-pulse rounded bg-gray-100"></div>
            </div>
          {/each}
        </div>
      {:else if topKaryawanTerproduktif.length === 0}
        <div
          class="flex flex-col items-center justify-center gap-2 py-10 text-center"
        >
          <TrophyIcon class="h-8 w-8 text-gray-300" />
          <p class="text-sm font-medium text-gray-500">
            Belum Ada Data Produktivitas
          </p>
          <p class="max-w-xs text-xs text-gray-400">
            Pcs yang diselesaikan karyawan minggu ini akan muncul sebagai peringkat di sini.
          </p>
        </div>
      {:else}
        <div class="divide-y divide-gray-50 px-5 py-2">
          {#each topKaryawanTerproduktif as k, index}
            {@const pct = Math.round((k.total_pcs / maxPcsMingguIni) * 100)}
            <div class="flex items-center gap-3 py-2.5">
              <!-- Rank Badge -->
              <span
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold {index === 0
                  ? 'bg-amber-100 text-amber-700'
                  : index === 1
                    ? 'bg-slate-200 text-slate-700'
                    : index === 2
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-500'}"
              >
                {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : index + 1}
              </span>

              <!-- Name & Division -->
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate text-sm font-medium text-gray-800"
                    >{k.nama}</span
                  >
                  <span
                    class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider {k.divisi === 'Cutting'
                      ? 'border border-blue-100 bg-blue-50 text-blue-700'
                      : k.divisi === 'Jahit'
                        ? 'border border-purple-100 bg-purple-50 text-purple-700'
                        : 'border border-orange-100 bg-orange-50 text-orange-700'}"
                  >
                    {k.divisi}
                  </span>
                </div>
                <!-- Micro Progress Bar -->
                <div
                  class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100"
                >
                  <div
                    class="h-1.5 rounded-full transition-all {index === 0
                      ? 'bg-amber-400'
                      : index === 1
                        ? 'bg-blue-400'
                        : 'bg-indigo-400'}"
                    style="width: {pct}%"
                  ></div>
                </div>
              </div>

              <!-- Output Pcs -->
              <div class="text-right">
                <span class="text-sm font-bold text-gray-900"
                  >{k.total_pcs.toLocaleString("id-ID")}</span
                >
                <span class="text-xs text-gray-400"> pcs</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Rekap Penggajian Minggu Ini (data real) -->
    <div
      class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
    >
      <div
        class="flex items-center justify-between border-b border-gray-50 px-5 py-4"
      >
        <div class="flex items-center gap-2">
          <BanknoteIcon class="h-4 w-4 text-gray-400" />
          <h2 class="text-sm font-semibold text-gray-800">Rekap Penggajian</h2>
          <span class="text-xs text-gray-400">Minggu Ini</span>
        </div>
        <a
          href="/karyawan/penggajian"
          class="text-xs font-medium text-blue-600 hover:underline"
        >
          Lihat detail →
        </a>
      </div>
      {#if loadingGaji}
        <div class="space-y-3 p-5">
          {#each Array(3) as _}
            <div class="h-4 w-full animate-pulse rounded bg-gray-100"></div>
          {/each}
        </div>
      {:else}
        <div class="divide-y divide-gray-50">
          <div class="flex items-center justify-between px-5 py-3.5">
            <span class="text-sm text-gray-500">Total Pcs Selesai</span>
            <span class="text-sm font-semibold text-gray-800"
              >{totalPcsMingguIni} pcs</span
            >
          </div>
          <div class="flex items-center justify-between px-5 py-3.5">
            <span class="text-sm text-gray-500">Karyawan Produksi Aktif</span>
            <span class="text-sm font-semibold text-gray-800"
              >{karyawanAktifMingguIni} orang</span
            >
          </div>
          {#if penggajianMingguIni.length === 0}
            <div class="px-5 py-6 text-center">
              <p class="text-xs text-gray-400">
                Belum ada pcs cutting/jahit/steam yang selesai minggu ini.
              </p>
            </div>
          {:else}
            <div class="px-5 py-3.5">
              <a
                href="/karyawan/penggajian"
                class="block w-full rounded-lg bg-gray-900 py-2 text-center text-xs font-semibold text-white transition hover:bg-gray-800"
              >
                Lihat Rincian & Cetak Laporan
              </a>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- ── Shortcut ke Expired ─────────────────────────────────────────── -->
  {#if !loading && totalExpired > 0}
    <div
      class="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
    >
      <svg
        class="mt-0.5 h-5 w-5 shrink-0 text-red-500"
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
      <div class="flex-1">
        <p class="text-sm font-semibold text-red-800">
          {totalExpired} Kontrak Temporary Sudah Expired
        </p>
        <p class="mt-0.5 text-xs text-red-700">
          Perlu diperbarui atau akun tersebut tidak lagi bisa login.
        </p>
      </div>
      <a
        href="/karyawan/data?filter=temporary"
        class="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
      >
        Kelola Akun →
      </a>
    </div>
  {/if}
{/if}
