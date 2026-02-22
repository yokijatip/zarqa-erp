<script lang="ts">
  import { onMount } from "svelte";
  import {
    getStokKainList,
    addStokKain,
    restockKain,
  } from "$lib/firebase/stok-kain";
  import type { StokKain } from "$lib/types";
  import * as Sheet from "$lib/components/ui/sheet/index.js";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import StatCard from "$lib/components/StatCard.svelte";
  import LayersIcon from "@lucide/svelte/icons/layers";
  import BoxIcon from "@lucide/svelte/icons/box";
  import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";

  // ── State ──────────────────────────────────────────────────────────
  let stokList = $state<StokKain[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);
  let searchQuery = $state("");
  let sortBy = $state<"nama" | "tersedia_asc" | "tersedia_desc">(
    "tersedia_asc",
  );

  // Sheet state
  let openTambah = $state(false);
  let openRestock = $state(false);
  let selectedKain = $state<StokKain | null>(null);

  // Form: tambah kain
  let fNama = $state("");
  let fStok = $state<number | "">("");
  let fCatatan = $state("");

  // Form: restock
  let rYard = $state<number | "">("");
  let rCatatan = $state("");

  // ── Derived ────────────────────────────────────────────────────────
  let totalYard = $derived(stokList.reduce((s, k) => s + k.stok_tersedia, 0));
  let totalJenis = $derived(stokList.length);
  let kritisCount = $derived(
    stokList.filter((k) => k.stok_tersedia < 100).length,
  );

  let filteredList = $derived.by(() => {
    let list = stokList.filter(
      (k) =>
        !searchQuery ||
        k.nama_kain.toLowerCase().includes(searchQuery.toLowerCase()),
    );
    if (sortBy === "nama")
      list = [...list].sort((a, b) => a.nama_kain.localeCompare(b.nama_kain));
    if (sortBy === "tersedia_asc")
      list = [...list].sort((a, b) => a.stok_tersedia - b.stok_tersedia);
    if (sortBy === "tersedia_desc")
      list = [...list].sort((a, b) => b.stok_tersedia - a.stok_tersedia);
    return list;
  });

  // ── Helpers ────────────────────────────────────────────────────────
  function statusKain(tersedia: number) {
    if (tersedia < 100)
      return {
        label: "Kritis",
        cls: "bg-red-100 text-red-700",
        bar: "bg-red-400",
      };
    if (tersedia < 250)
      return {
        label: "Perhatian",
        cls: "bg-amber-100 text-amber-700",
        bar: "bg-amber-400",
      };
    return {
      label: "Aman",
      cls: "bg-green-100 text-green-700",
      bar: "bg-blue-400",
    };
  }

  function persen(tersedia: number, terpakai: number) {
    const total = tersedia + terpakai;
    return total > 0 ? Math.min((tersedia / total) * 100, 100) : 0;
  }

  function showSuccess(msg: string) {
    successMsg = msg;
    setTimeout(() => (successMsg = null), 3000);
  }

  function showError(msg: string) {
    errorMsg = msg;
    setTimeout(() => (errorMsg = null), 4000);
  }

  // ── Data ────────────────────────────────────────────────────────────
  async function load() {
    loading = true;
    errorMsg = null;
    try {
      stokList = await getStokKainList();
    } catch {
      showError("Gagal memuat data. Periksa koneksi Firebase.");
    } finally {
      loading = false;
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────
  async function submitTambah() {
    if (!fNama.trim() || fStok === "" || Number(fStok) <= 0) return;
    saving = true;
    try {
      await addStokKain({
        nama_kain: fNama.trim(),
        satuan: "yard",
        stok_tersedia: Number(fStok),
        ...(fCatatan.trim() ? { catatan: fCatatan.trim() } : {}),
      });
      const namaKain = fNama.trim();
      await load();
      openTambah = false;
      fNama = "";
      fStok = "";
      fCatatan = "";
      showSuccess(`Kain "${namaKain}" berhasil ditambahkan.`);
    } catch {
      showError("Gagal menyimpan data kain.");
    } finally {
      saving = false;
    }
  }

  async function submitRestock() {
    if (!selectedKain || rYard === "" || Number(rYard) <= 0) return;
    saving = true;
    try {
      await restockKain(
        selectedKain.id,
        Number(rYard),
        rCatatan.trim() || undefined,
      );
      const nama = selectedKain.nama_kain;
      await load();
      openRestock = false;
      selectedKain = null;
      rYard = "";
      rCatatan = "";
      showSuccess(`Restock ${nama} sebesar ${rYard} yard berhasil.`);
    } catch {
      showError("Gagal melakukan restock.");
    } finally {
      saving = false;
    }
  }

  function bukaTambah() {
    fNama = "";
    fStok = "";
    fCatatan = "";
    openTambah = true;
  }

  function bukaRestock(kain: StokKain) {
    selectedKain = kain;
    rYard = "";
    rCatatan = "";
    openRestock = true;
  }

  onMount(load);
</script>

<!-- ── Toast Notification ──────────────────────────────────────── -->
{#if successMsg}
  <div
    class="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 shadow-lg"
  >
    <svg
      class="h-4 w-4 text-green-600"
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
    class="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg"
  >
    <svg
      class="h-4 w-4 text-red-500"
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

<!-- ── Header ──────────────────────────────────────────────────── -->
<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Stok Kain</h1>
    <p class="mt-0.5 text-sm text-gray-500">
      Kelola inventaris kain untuk produksi
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
    Tambah Kain
  </Button>
</div>

<!-- ── Stats Row ──────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-3 gap-4">
  <StatCard
    title="Total Jenis"
    value={totalJenis}
    icon={LayersIcon}
    footerSubtext="jenis kain terdaftar"
  />

  <StatCard
    title="Total Stok"
    value={totalYard.toLocaleString("id-ID")}
    icon={BoxIcon}
    footerSubtext="yard tersedia"
  />

  <StatCard
    title="Kain Kritis"
    value={kritisCount}
    icon={AlertTriangleIcon}
    footerSubtext="di bawah 100 yard"
    class={kritisCount > 0 ? "border-red-200 bg-red-50" : ""}
    valueClass={kritisCount > 0 ? "text-red-700" : ""}
  />
</div>

<!-- ── Filter & Sort Bar ──────────────────────────────────────── -->
<div class="mb-4 flex flex-wrap items-center gap-3">
  <!-- Search -->
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
      placeholder="Cari nama kain..."
      bind:value={searchQuery}
      class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
    />
  </div>

  <!-- Sort -->
  <div class="flex items-center gap-1.5">
    <span class="text-xs text-gray-500">Urutkan:</span>
    {#each [["tersedia_asc", "Kritis Dulu"], ["tersedia_desc", "Terbanyak"], ["nama", "A–Z"]] as const as [val, lbl]}
      <Button
        size="sm"
        variant={sortBy === val ? "default" : "outline"}
        onclick={() => (sortBy = val)}
      >
        {lbl}
      </Button>
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

<!-- ── Table ──────────────────────────────────────────────────── -->
<div
  class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
>
  {#if loading}
    <div class="space-y-0">
      {#each Array(5) as _}
        <div class="flex items-center gap-4 border-b border-gray-50 px-5 py-4">
          <div class="h-4 w-40 animate-pulse rounded bg-gray-100"></div>
          <div class="ml-auto h-4 w-20 animate-pulse rounded bg-gray-100"></div>
          <div class="h-4 w-20 animate-pulse rounded bg-gray-100"></div>
          <div class="h-6 w-16 animate-pulse rounded-full bg-gray-100"></div>
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
            d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3"
          />
        </svg>
      </div>
      {#if searchQuery}
        <p class="text-sm font-medium text-gray-500">
          Kain "{searchQuery}" tidak ditemukan
        </p>
        <Button variant="link" size="sm" onclick={() => (searchQuery = "")}>
          Hapus filter
        </Button>
      {:else}
        <p class="text-sm font-medium text-gray-500">
          Belum ada data stok kain
        </p>
        <p class="text-xs text-gray-400">
          Mulai dengan menambahkan jenis kain pertama
        </p>
        <Button onclick={bukaTambah} class="mt-1">+ Tambah Kain</Button>
      {/if}
    </div>
  {:else}
    <table class="w-full border-collapse">
      <thead>
        <tr
          class="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-400"
        >
          <th class="px-5 py-3 text-left">Nama Kain</th>
          <th class="px-5 py-3 text-right">Tersedia</th>
          <th class="px-5 py-3 text-right">Terpakai</th>
          <th class="px-5 py-3 text-center">Status</th>
          <th class="px-5 py-3 text-left">Catatan</th>
          <th class="px-5 py-3"></th>
        </tr>
      </thead>
      <tbody>
        {#each filteredList as kain}
          {@const st = statusKain(kain.stok_tersedia)}
          {@const pct = persen(kain.stok_tersedia, kain.stok_terpakai)}
          <tr
            class="border-b border-gray-50 transition last:border-0 hover:bg-gray-50/50"
          >
            <!-- Nama + Progress bar -->
            <td class="px-5 py-4">
              <p class="text-sm font-medium text-gray-800">{kain.nama_kain}</p>
              <div class="mt-1.5 flex items-center gap-2">
                <div class="h-1.5 w-24 shrink-0 rounded-full bg-gray-100">
                  <div
                    class="h-1.5 rounded-full {st.bar}"
                    style="width: {pct.toFixed(0)}%"
                  ></div>
                </div>
                <span class="text-[10px] text-gray-400">{pct.toFixed(0)}%</span>
              </div>
            </td>

            <!-- Tersedia -->
            <td class="px-5 py-4 text-right">
              <p
                class="text-sm font-semibold tabular-nums {kain.stok_tersedia <
                100
                  ? 'text-red-600'
                  : 'text-gray-800'}"
              >
                {kain.stok_tersedia.toLocaleString("id-ID")}
              </p>
              <p class="text-xs text-gray-400">yard</p>
            </td>

            <!-- Terpakai -->
            <td class="px-5 py-4 text-right">
              <p class="text-sm tabular-nums text-gray-600">
                {kain.stok_terpakai.toLocaleString("id-ID")}
              </p>
              <p class="text-xs text-gray-400">yard</p>
            </td>

            <!-- Status badge -->
            <td class="px-5 py-4 text-center">
              <span
                class="inline-block rounded-full px-2.5 py-1 text-xs font-semibold {st.cls}"
              >
                {st.label}
              </span>
            </td>

            <!-- Catatan -->
            <td class="px-5 py-4 max-w-45">
              <p class="truncate text-xs text-gray-500">
                {kain.catatan ?? "—"}
              </p>
            </td>

            <!-- Action -->
            <td class="px-5 py-4">
              <div class="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => bukaRestock(kain)}
                >
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
                  Restock
                </Button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    <!-- Footer -->
    <div
      class="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-3"
    >
      <p class="text-xs text-gray-400">
        Menampilkan {filteredList.length} dari {totalJenis} jenis kain
      </p>
      <p class="text-xs text-gray-400">
        Total tersedia: <span class="font-semibold text-gray-700"
          >{totalYard.toLocaleString("id-ID")} yard</span
        >
      </p>
    </div>
  {/if}
</div>

<!-- ── Dialog: Tambah Kain ──────────────────────────────────────── -->
<Dialog.Root bind:open={openTambah}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Tambah Kain Baru</Dialog.Title>
      <Dialog.Description>
        Daftarkan jenis kain baru ke inventaris gudang.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      <!-- Nama Kain -->
      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="nama-kain"
        >
          Nama Kain <span class="text-red-500">*</span>
        </label>
        <input
          id="nama-kain"
          type="text"
          placeholder="Contoh: Katun Premium, Wolfis, Jersey..."
          bind:value={fNama}
          class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        />
      </div>

      <!-- Stok Awal + Satuan -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label
            class="mb-1.5 block text-sm font-medium text-gray-700"
            for="stok-awal"
          >
            Stok Awal <span class="text-red-500">*</span>
          </label>
          <input
            id="stok-awal"
            type="number"
            min="1"
            placeholder="0"
            bind:value={fStok}
            class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
          />
        </div>
        <div>
          <p class="mb-1.5 block text-sm font-medium text-gray-700">Satuan</p>
          <div
            class="flex h-10.5 items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 text-sm text-gray-400"
          >
            Yard (tetap)
          </div>
        </div>
      </div>

      <!-- Catatan -->
      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="catatan-tambah"
        >
          Catatan
          <span class="text-xs font-normal text-gray-400">(opsional)</span>
        </label>
        <textarea
          id="catatan-tambah"
          rows="3"
          placeholder="Catatan tambahan tentang kain ini..."
          bind:value={fCatatan}
          class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        ></textarea>
      </div>
    </div>

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openTambah = false)}>
        Batal
      </Button>
      <Button
        onclick={submitTambah}
        disabled={saving || !fNama.trim() || fStok === "" || Number(fStok) <= 0}
      >
        {#if saving}
          <svg
            class="animate-spin"
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
          Menyimpan...
        {:else}
          Simpan Kain
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- ── Sheet: Restock ────────────────────────────────────────────── -->
<Sheet.Root bind:open={openRestock}>
  <Sheet.Content side="right" class="w-full max-w-md">
    <Sheet.Header>
      <Sheet.Title>Restock Kain</Sheet.Title>
      <Sheet.Description
        >Tambah stok kain yang sudah terdaftar.</Sheet.Description
      >
    </Sheet.Header>

    <div class="mt-6 space-y-4 px-6">
      <!-- Info kain -->
      {#if selectedKain}
        <div class="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p class="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Kain yang di-restock
          </p>
          <p class="mt-1 text-base font-semibold text-gray-800">
            {selectedKain.nama_kain}
          </p>
          <div class="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <span
              >Saat ini: <strong class="text-gray-700"
                >{selectedKain.stok_tersedia.toLocaleString("id-ID")} yard</strong
              ></span
            >
            <span
              >Terpakai: <strong class="text-gray-700"
                >{selectedKain.stok_terpakai.toLocaleString("id-ID")} yard</strong
              ></span
            >
          </div>
          <span
            class="mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold {statusKain(
              selectedKain.stok_tersedia,
            ).cls}"
          >
            {statusKain(selectedKain.stok_tersedia).label}
          </span>
        </div>
      {/if}

      <!-- Jumlah Restock -->
      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="restock-yard"
        >
          Tambah Stok (yard) <span class="text-red-500">*</span>
        </label>
        <input
          id="restock-yard"
          type="number"
          min="1"
          placeholder="0"
          bind:value={rYard}
          class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        />
        {#if selectedKain && rYard !== "" && Number(rYard) > 0}
          <p class="mt-1.5 text-xs text-green-600">
            Stok setelah restock: <strong
              >{(selectedKain.stok_tersedia + Number(rYard)).toLocaleString(
                "id-ID",
              )} yard</strong
            >
          </p>
        {/if}
      </div>

      <!-- Catatan -->
      <div>
        <label
          class="mb-1.5 block text-sm font-medium text-gray-700"
          for="catatan-restock"
        >
          Catatan <span class="text-xs font-normal text-gray-400"
            >(opsional)</span
          >
        </label>
        <textarea
          id="catatan-restock"
          rows="3"
          placeholder="Contoh: Pembelian dari supplier X..."
          bind:value={rCatatan}
          class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        ></textarea>
      </div>
    </div>

    <Sheet.Footer class="mt-6 gap-2 px-6">
      <Button
        variant="outline"
        class="flex-1"
        onclick={() => (openRestock = false)}
      >
        Batal
      </Button>
      <Button
        onclick={submitRestock}
        disabled={saving || rYard === "" || Number(rYard) <= 0}
        class="flex-1"
      >
        {saving ? "Menyimpan..." : "Restock Sekarang"}
      </Button>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>
