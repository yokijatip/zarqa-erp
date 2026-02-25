<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import {
    getStokByModel,
    tambahStokBarangJadi,
    kurangiStokManual,
    setStokManual,
  } from "$lib/firebase/barang-jadi";
  import type { StokBarangJadi, UkuranBaju } from "$lib/types";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";

  const UKURAN_ORDER: UkuranBaju[] = ["S", "M", "L", "XL", "XXL"];
  const KRITIS_THRESHOLD = 5;
  const LOW_THRESHOLD = 15;

  // ── State ─────────────────────────────────────────────────────────
  let stokList = $state<StokBarangJadi[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);

  // Dialog state
  type DialogMode = "restock" | "kurangi" | "edit";
  let openDialog = $state(false);
  let dialogMode = $state<DialogMode>("restock");
  let selectedItem = $state<StokBarangJadi | null>(null);
  let fJumlah = $state(0);

  // ── Derived ───────────────────────────────────────────────────────
  let sorted = $derived(
    [...stokList].sort(
      (a, b) =>
        UKURAN_ORDER.indexOf(a.ukuran as UkuranBaju) -
        UKURAN_ORDER.indexOf(b.ukuran as UkuranBaju),
    ),
  );

  let namaModel     = $derived(stokList[0]?.nama_model ?? "");
  let namaWarna     = $derived(stokList[0]?.nama_warna);
  let kodeHexWarna  = $derived(stokList[0]?.kode_hex_warna);
  let totalTersedia = $derived(stokList.reduce((s, i) => s + i.stok_tersedia, 0));
  let totalMasuk    = $derived(stokList.reduce((s, i) => s + i.total_masuk, 0));
  let totalKeluar   = $derived(stokList.reduce((s, i) => s + i.total_keluar, 0));

  function getStatus(item: StokBarangJadi): "kosong" | "kritis" | "low" | "aman" {
    if (item.stok_tersedia === 0) return "kosong";
    if (item.stok_tersedia <= KRITIS_THRESHOLD) return "kritis";
    if (item.stok_tersedia <= LOW_THRESHOLD) return "low";
    return "aman";
  }

  const STATUS_STYLE = {
    kosong: { card: "border-gray-200 bg-gray-50",  badge: "bg-gray-100 text-gray-500",   label: "Habis",   num: "text-gray-400",  bar: "bg-gray-300",  ukuran: "bg-gray-100 text-gray-500" },
    kritis: { card: "border-red-200 bg-red-50",    badge: "bg-red-100 text-red-600",     label: "Kritis",  num: "text-red-600",   bar: "bg-red-400",   ukuran: "bg-red-100 text-red-700"   },
    low:    { card: "border-amber-200 bg-amber-50",badge: "bg-amber-100 text-amber-600", label: "Menipis", num: "text-amber-600", bar: "bg-amber-400", ukuran: "bg-amber-100 text-amber-700"},
    aman:   { card: "border-gray-100 bg-white",    badge: "bg-teal-100 text-teal-700",   label: "Aman",    num: "text-gray-900",  bar: "bg-teal-400",  ukuran: "bg-teal-100 text-teal-700" },
  };

  const DIALOG_TITLE: Record<DialogMode, string> = {
    restock: "Restock Barang",
    kurangi: "Kurangi Stok",
    edit:    "Set Stok Manual",
  };

  const DIALOG_DESC: Record<DialogMode, string> = {
    restock: "Tambah stok dari luar produksi (migrasi, restock manual).",
    kurangi: "Kurangi stok karena loss, kerusakan, atau koreksi.",
    edit:    "Set stok ke nilai absolut untuk koreksi fisik.",
  };

  // ── Helpers ───────────────────────────────────────────────────────
  function formatDate(ts: any): string {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
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
    try {
      stokList = await getStokByModel($page.params.model_id!);
    } catch {
      showError("Gagal memuat data stok.");
    } finally {
      loading = false;
    }
  }

  // ── Actions ───────────────────────────────────────────────────────
  function bukaDialog(mode: DialogMode, item: StokBarangJadi) {
    dialogMode = mode;
    selectedItem = item;
    fJumlah = mode === "edit" ? item.stok_tersedia : 0;
    openDialog = true;
  }

  async function submitDialog() {
    if (!selectedItem || fJumlah < 0 || saving) return;
    saving = true;
    try {
      if (dialogMode === "restock") {
        if (fJumlah <= 0) throw new Error("Jumlah harus lebih dari 0");
        await tambahStokBarangJadi(
          selectedItem.model_id,
          selectedItem.nama_model,
          [{ ukuran: selectedItem.ukuran, jumlah_pcs: fJumlah }],
        );
        showSuccess(`+${fJumlah} pcs berhasil ditambahkan ke stok ukuran ${selectedItem.ukuran}.`);
      } else if (dialogMode === "kurangi") {
        if (fJumlah <= 0) throw new Error("Jumlah harus lebih dari 0");
        await kurangiStokManual(selectedItem.id, fJumlah);
        showSuccess(`-${fJumlah} pcs berhasil dikurangi dari stok ukuran ${selectedItem.ukuran}.`);
      } else {
        if (fJumlah < 0) throw new Error("Stok tidak boleh negatif");
        await setStokManual(selectedItem.id, fJumlah);
        showSuccess(`Stok ukuran ${selectedItem.ukuran} diset ke ${fJumlah} pcs.`);
      }
      openDialog = false;
      await load();
    } catch (e: any) {
      showError(e?.message ?? "Gagal menyimpan perubahan.");
    } finally {
      saving = false;
    }
  }

  let formValid = $derived.by(() => {
    if (!selectedItem) return false;
    if (dialogMode === "restock") return fJumlah > 0;
    if (dialogMode === "kurangi") return fJumlah > 0 && fJumlah <= selectedItem.stok_tersedia;
    return fJumlah >= 0; // edit: boleh set ke 0
  });

  onMount(load);
</script>

<!-- ── Toasts ────────────────────────────────────────────────────── -->
{#if successMsg}
  <div class="fixed right-5 top-5 z-[9999] flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 shadow-lg">
    <svg class="h-4 w-4 shrink-0 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
    <p class="text-sm text-green-800">{successMsg}</p>
  </div>
{/if}
{#if errorMsg}
  <div class="fixed right-5 top-5 z-[9999] flex max-w-sm items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg">
    <svg class="mt-0.5 h-4 w-4 shrink-0 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
    <p class="text-sm text-red-800">{errorMsg}</p>
  </div>
{/if}

<!-- ── Header ─────────────────────────────────────────────────────── -->
<div class="mb-6">
  <Button
    variant="ghost"
    size="sm"
    onclick={() => goto("/barang-jadi")}
    class="mb-3 -ml-2 gap-1.5 text-gray-400 hover:text-gray-700"
  >
    <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
    </svg>
    Barang Jadi
  </Button>

  {#if loading}
    <div class="h-7 w-64 animate-pulse rounded bg-gray-100"></div>
  {:else}
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-xl font-semibold text-gray-900">{namaModel || "Model tidak ditemukan"}</h1>
          {#if namaWarna}
            <span class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-700 shadow-sm">
              {#if kodeHexWarna}
                <span class="inline-block h-3 w-3 rounded-full shrink-0" style="background-color: {kodeHexWarna}"></span>
              {/if}
              {namaWarna}
            </span>
          {/if}
        </div>
        <p class="mt-0.5 text-sm text-gray-500">Detail stok per ukuran</p>
      </div>
    </div>
  {/if}
</div>

{#if loading}
  <!-- ── Loading ──────────────────────────────────────────────────── -->
  <div class="space-y-4">
    <div class="grid grid-cols-4 gap-4">
      {#each Array(4) as _}
        <div class="h-20 animate-pulse rounded-xl bg-gray-100"></div>
      {/each}
    </div>
    <div class="grid grid-cols-3 gap-4 lg:grid-cols-5">
      {#each Array(3) as _}
        <div class="h-48 animate-pulse rounded-xl bg-gray-100"></div>
      {/each}
    </div>
  </div>

{:else if stokList.length === 0}
  <!-- ── Empty ─────────────────────────────────────────────────────── -->
  <div class="flex flex-col items-center gap-3 py-24 text-center">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
      <svg class="h-7 w-7 text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
      </svg>
    </div>
    <p class="font-medium text-gray-600">Belum ada stok untuk model ini</p>
    <p class="text-sm text-gray-400">Stok akan muncul setelah batch produksi selesai atau diisi manual.</p>
    <Button variant="outline" onclick={() => goto("/barang-jadi")}>← Kembali</Button>
  </div>

{:else}
  <!-- ── Summary Stats ──────────────────────────────────────────────── -->
  <div class="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
    <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Total Tersedia</p>
      <p class="mt-1.5 text-2xl font-bold text-teal-700">{totalTersedia.toLocaleString("id-ID")}</p>
      <p class="text-xs text-gray-400">pcs siap kirim</p>
    </div>
    <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Total Masuk</p>
      <p class="mt-1.5 text-2xl font-bold text-gray-900">{totalMasuk.toLocaleString("id-ID")}</p>
      <p class="text-xs text-gray-400">pcs dari produksi & restock</p>
    </div>
    <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Total Keluar</p>
      <p class="mt-1.5 text-2xl font-bold text-gray-900">{totalKeluar.toLocaleString("id-ID")}</p>
      <p class="text-xs text-gray-400">pcs sudah dikirim</p>
    </div>
    <div class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Jumlah Ukuran</p>
      <p class="mt-1.5 text-2xl font-bold text-gray-900">{stokList.length}</p>
      <p class="text-xs text-gray-400">ukuran terdaftar</p>
    </div>
  </div>

  <!-- ── Ukuran Cards ──────────────────────────────────────────────── -->
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
    {#each sorted as item}
      {@const status = getStatus(item)}
      {@const st = STATUS_STYLE[status]}
      {@const pct = item.total_masuk > 0 ? Math.round((item.stok_tersedia / item.total_masuk) * 100) : 0}

      <div class="overflow-hidden rounded-xl border {st.card} shadow-sm">
        <!-- Card header -->
        <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <span class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold {st.ukuran}">
            {item.ukuran}
          </span>
          <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold {st.badge}">
            {st.label}
          </span>
        </div>

        <!-- Stok besar -->
        <div class="px-4 py-4">
          <p class="text-3xl font-bold leading-none {st.num}">{item.stok_tersedia}</p>
          <p class="mt-0.5 text-xs text-gray-400">pcs tersedia</p>

          <!-- Progress bar -->
          {#if item.total_masuk > 0}
            <div class="mt-3 h-1.5 w-full rounded-full bg-gray-100">
              <div class="h-1.5 rounded-full {st.bar} transition-all" style="width: {pct}%"></div>
            </div>
            <p class="mt-0.5 text-[10px] text-gray-400">{pct}% dari total masuk</p>
          {/if}

          <!-- Mini stats -->
          <div class="mt-3 space-y-1 border-t border-gray-100 pt-3 text-xs text-gray-500">
            <div class="flex justify-between">
              <span>Total masuk</span>
              <span class="font-medium text-gray-700">{item.total_masuk} pcs</span>
            </div>
            <div class="flex justify-between">
              <span>Total keluar</span>
              <span class="font-medium text-gray-700">{item.total_keluar} pcs</span>
            </div>
            {#if item.updatedAt}
              <div class="flex justify-between pt-1">
                <span>Update</span>
                <span class="text-gray-400">{formatDate(item.updatedAt)}</span>
              </div>
            {/if}
          </div>
        </div>

        <!-- Action buttons -->
        <div class="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100">
          <button
            onclick={() => bukaDialog("restock", item)}
            class="py-2.5 text-center text-[11px] font-semibold text-teal-600 hover:bg-teal-50 transition"
          >
            + Restock
          </button>
          <button
            onclick={() => bukaDialog("kurangi", item)}
            class="py-2.5 text-center text-[11px] font-semibold text-red-500 hover:bg-red-50 transition"
          >
            − Kurangi
          </button>
          <button
            onclick={() => bukaDialog("edit", item)}
            class="py-2.5 text-center text-[11px] font-semibold text-gray-500 hover:bg-gray-50 transition"
          >
            ✎ Set
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<!-- ── Dialog: Restock / Kurangi / Set ──────────────────────────── -->
<Dialog.Root bind:open={openDialog}>
  <Dialog.Content class="max-w-sm">
    <Dialog.Header>
      <Dialog.Title>{selectedItem ? DIALOG_TITLE[dialogMode] : ""}</Dialog.Title>
      <Dialog.Description>
        {selectedItem ? DIALOG_DESC[dialogMode] : ""}
      </Dialog.Description>
    </Dialog.Header>

    {#if selectedItem}
      <div class="space-y-4">
        <!-- Info item -->
        <div class="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
            {selectedItem.ukuran}
          </span>
          <div>
            <p class="text-sm font-semibold text-gray-800">{selectedItem.nama_model}</p>
            <p class="text-xs text-gray-500">Stok saat ini: <strong>{selectedItem.stok_tersedia} pcs</strong></p>
          </div>
        </div>

        <!-- Preview hasil -->
        {#if fJumlah > 0 || dialogMode === "edit"}
          {@const preview =
            dialogMode === "restock" ? selectedItem.stok_tersedia + fJumlah :
            dialogMode === "kurangi" ? selectedItem.stok_tersedia - fJumlah :
            fJumlah}
          <div class="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
            Stok setelah disimpan:
            <span class="ml-1 font-bold text-blue-900">{preview} pcs</span>
            {#if dialogMode === "kurangi" && preview < 0}
              <span class="ml-2 font-semibold text-red-600">⚠ melebihi stok!</span>
            {/if}
          </div>
        {/if}

        <!-- Input jumlah -->
        <div>
          <label class="mb-1.5 block text-sm font-medium text-gray-700" for="dialog-jumlah">
            {dialogMode === "edit" ? "Stok Baru (pcs)" : "Jumlah (pcs)"}
            <span class="text-red-500">*</span>
          </label>
          <Input
            id="dialog-jumlah"
            type="number"
            min={dialogMode === "edit" ? 0 : 1}
            max={dialogMode === "kurangi" ? selectedItem.stok_tersedia : undefined}
            bind:value={fJumlah}
          />
          {#if dialogMode === "kurangi"}
            <p class="mt-1 text-xs text-gray-400">Maks: {selectedItem.stok_tersedia} pcs</p>
          {:else if dialogMode === "edit"}
            <p class="mt-1 text-xs text-gray-400">Set ke nilai absolut — cocok untuk koreksi stok fisik.</p>
          {/if}
        </div>
      </div>

      <Dialog.Footer class="gap-2">
        <Button variant="outline" onclick={() => (openDialog = false)}>Batal</Button>
        <Button
          onclick={submitDialog}
          disabled={saving || !formValid}
          class={dialogMode === "kurangi" ? "bg-red-600 text-white hover:bg-red-700" : dialogMode === "edit" ? "" : "bg-teal-600 text-white hover:bg-teal-700"}
        >
          {saving ? "Menyimpan..." : dialogMode === "restock" ? "Simpan Restock" : dialogMode === "kurangi" ? "Simpan Pengurangan" : "Simpan"}
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
