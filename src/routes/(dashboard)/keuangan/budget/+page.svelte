<script lang="ts">
  import { onMount } from "svelte";
  import { currentUser, userRole } from "$lib/stores/auth.store";
  import {
    addBudgetBulanan,
    deleteBudgetBulanan,
    getBudgetBulanan,
    getTransaksiKeuangan,
    KATEGORI_PENGELUARAN,
    updateBudgetBulanan,
  } from "$lib/firebase/keuangan";
  import type { BudgetBulanan, KategoriPengeluaran, TransaksiKeuangan } from "$lib/types";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import WalletCardsIcon from "@lucide/svelte/icons/wallet-cards";
  import TargetIcon from "@lucide/svelte/icons/target";

  let budgets = $state<BudgetBulanan[]>([]);
  let transaksi = $state<TransaksiKeuangan[]>([]);
  let bulan = $state(new Date().toISOString().slice(0, 7));
  let formOpen = $state(false);
  let editing = $state<BudgetBulanan | null>(null);
  let kategori = $state<KategoriPengeluaran>("operasional");
  let nominal = $state(0);
  let catatan = $state("");
  let loading = $state(true);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);

  const allowed = $derived(["admin_keuangan", "owner", "developer"].includes($userRole ?? ""));
  const bulanLabel = $derived(new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(`${bulan}-01T00:00:00`)));

  function isInventoryPurchase(item: TransaksiKeuangan) {
    return item.kategori !== "aset" && (item.kategori === "bahan_baku" || item.jenis_transaksi === "pembelian_persediaan" || item.dampak_laba_rugi === false);
  }

  function formatRupiah(value: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);
  }

  function spentFor(item: BudgetBulanan) {
    return transaksi
      .filter((trx) => {
        if (trx.tipe !== "pengeluaran" || isInventoryPurchase(trx) || trx.kategori !== item.kategori) return false;
        const date = trx.tanggal?.toDate?.() ?? new Date(trx.tanggal as unknown as string);
        return date.toISOString().slice(0, 7) === item.bulan;
      })
      .reduce((sum, trx) => sum + trx.nominal, 0);
  }

  const rows = $derived(budgets.filter((item) => item.bulan === bulan).map((item) => {
    const terpakai = spentFor(item);
    return { ...item, terpakai, sisa: item.nominal - terpakai, persen: item.nominal > 0 ? Math.round((terpakai / item.nominal) * 100) : 0 };
  }));
  const totalBudget = $derived(rows.reduce((sum, row) => sum + row.nominal, 0));
  const totalTerpakai = $derived(rows.reduce((sum, row) => sum + row.terpakai, 0));

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      [budgets, transaksi] = await Promise.all([getBudgetBulanan(), getTransaksiKeuangan(null)]);
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : "Gagal memuat budget.";
    } finally {
      loading = false;
    }
  }

  function openTambah() {
    editing = null;
    kategori = "operasional";
    nominal = 0;
    catatan = "";
    formOpen = true;
  }

  function openEdit(item: BudgetBulanan) {
    editing = item;
    bulan = item.bulan;
    kategori = item.kategori;
    nominal = item.nominal;
    catatan = item.catatan ?? "";
    formOpen = true;
  }

  async function save() {
    if (nominal <= 0) { errorMsg = "Nominal budget harus lebih dari 0."; return; }
    saving = true;
    errorMsg = null;
    try {
      const data = { bulan, kategori, nominal, catatan, dibuat_oleh_uid: $currentUser?.uid, dibuat_oleh_nama: $currentUser?.name };
      if (editing) await updateBudgetBulanan(editing.id, data);
      else await addBudgetBulanan(data);
      formOpen = false;
      successMsg = "Budget berhasil disimpan.";
      await load();
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : "Gagal menyimpan budget.";
    } finally {
      saving = false;
    }
  }

  async function remove(item: BudgetBulanan) {
    if (!confirm(`Hapus budget ${KATEGORI_PENGELUARAN[item.kategori]} bulan ${item.bulan}?`)) return;
    try { await deleteBudgetBulanan(item.id); await load(); successMsg = "Budget dihapus."; }
    catch (error) { errorMsg = error instanceof Error ? error.message : "Gagal menghapus budget."; }
  }

  $effect(() => { if (successMsg) setTimeout(() => (successMsg = null), 3000); });
  onMount(load);
</script>

{#if !allowed}
  <div class="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">Halaman budget hanya untuk Owner, Developer, atau Admin Keuangan.</div>
{:else}
  <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <div class="flex items-center gap-2 text-sm text-gray-500"><WalletCardsIcon class="h-4 w-4" /> Keuangan</div>
      <h1 class="mt-1 text-2xl font-semibold text-gray-900">Budget Bulanan</h1>
      <p class="mt-1 text-sm text-gray-500">Rencanakan batas pengeluaran dan pantau pemakaian per kategori.</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <input class="h-10 rounded-lg border border-gray-200 px-3 text-sm" type="month" bind:value={bulan} aria-label="Bulan budget" />
      <button class="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-medium hover:bg-gray-50" onclick={load} disabled={loading}><RefreshCwIcon class="h-4 w-4 {loading ? 'animate-spin' : ''}" /> Refresh</button>
      <button class="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800" onclick={openTambah}><PlusIcon class="h-4 w-4" /> Tambah Budget</button>
    </div>
  </div>

  {#if errorMsg}<div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>{/if}
  {#if successMsg}<div class="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{successMsg}</div>{/if}

  <div class="mb-5 grid gap-4 sm:grid-cols-2">
    <div class="rounded-xl border border-blue-100 bg-blue-50 p-5"><div class="flex items-center gap-2 text-sm text-blue-700"><TargetIcon class="h-4 w-4" /> Total budget {bulanLabel}</div><p class="mt-2 text-2xl font-bold text-blue-900">{formatRupiah(totalBudget)}</p></div>
    <div class="rounded-xl border border-gray-100 bg-white p-5"><p class="text-sm text-gray-500">Total terpakai</p><p class="mt-2 text-2xl font-bold text-gray-900">{formatRupiah(totalTerpakai)}</p><p class="mt-1 text-xs text-gray-500">Dari transaksi pengeluaran aktual, tanpa pembelian kain.</p></div>
  </div>

  <section class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
    <div class="border-b border-gray-100 px-5 py-4"><h2 class="font-semibold text-gray-900">Budget {bulanLabel}</h2><p class="mt-1 text-sm text-gray-500">Pengeluaran yang melebihi budget ditandai merah.</p></div>
    <div class="divide-y divide-gray-100">
      {#each rows as row}
        <div class="p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div><p class="font-semibold text-gray-900">{KATEGORI_PENGELUARAN[row.kategori]}</p><p class="mt-1 text-xs text-gray-500">{row.catatan || "Tanpa catatan"}</p></div>
            <div class="flex items-center gap-2"><div class="text-right text-sm"><p><strong>{formatRupiah(row.terpakai)}</strong> / {formatRupiah(row.nominal)}</p><p class="text-xs {row.sisa < 0 ? 'text-red-600' : 'text-gray-500'}">{row.sisa < 0 ? `Melebihi ${formatRupiah(Math.abs(row.sisa))}` : `Sisa ${formatRupiah(row.sisa)}`}</p></div><button class="rounded-md p-2 text-gray-500 hover:bg-gray-100" title="Edit budget" aria-label="Edit budget" onclick={() => openEdit(row)}><PencilIcon class="h-4 w-4" /></button><button class="rounded-md p-2 text-red-500 hover:bg-red-50" title="Hapus budget" aria-label="Hapus budget" onclick={() => remove(row)}><Trash2Icon class="h-4 w-4" /></button></div>
          </div>
          <div class="mt-3 h-2 overflow-hidden rounded-full bg-gray-100"><div class="h-full rounded-full {row.persen > 100 ? 'bg-red-500' : row.persen >= 80 ? 'bg-amber-500' : 'bg-green-500'}" style={`width: ${Math.min(100, row.persen)}%`}></div></div>
          <p class="mt-1 text-right text-xs text-gray-500">{row.persen}% terpakai</p>
        </div>
      {:else}
        <div class="px-5 py-14 text-center text-sm text-gray-500">Belum ada budget untuk bulan ini. Tambahkan listrik, WiFi, sewa, atau kebutuhan lainnya.</div>
      {/each}
    </div>
  </section>
{/if}

{#if formOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onclick={(event) => event.target === event.currentTarget && (formOpen = false)}>
    <div class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="budget-title">
      <h2 id="budget-title" class="text-lg font-semibold text-gray-900">{editing ? "Edit Budget" : "Tambah Budget"}</h2>
      <p class="mt-1 text-sm text-gray-500">Tetapkan batas pengeluaran untuk satu kategori dalam satu bulan.</p>
      <div class="mt-5 space-y-4">
        <label class="block text-sm font-medium text-gray-700">Bulan<input class="mt-1.5 h-10 w-full rounded-lg border border-gray-200 px-3" type="month" bind:value={bulan} /></label>
        <label class="block text-sm font-medium text-gray-700">Kategori<select class="mt-1.5 h-10 w-full rounded-lg border border-gray-200 bg-white px-3" bind:value={kategori}>{#each Object.entries(KATEGORI_PENGELUARAN).filter(([key]) => !["aset", "bahan_baku", "gaji"].includes(key)) as [key, label]}<option value={key}>{label}</option>{/each}</select></label>
        <label class="block text-sm font-medium text-gray-700">Nominal budget<input class="mt-1.5 h-10 w-full rounded-lg border border-gray-200 px-3" type="number" min="1" bind:value={nominal} /></label>
        <label class="block text-sm font-medium text-gray-700">Catatan<input class="mt-1.5 h-10 w-full rounded-lg border border-gray-200 px-3" placeholder="Contoh: WiFi kantor" bind:value={catatan} /></label>
      </div>
      <div class="mt-6 flex justify-end gap-2"><button class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium" onclick={() => (formOpen = false)}>Batal</button><button class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onclick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Budget"}</button></div>
    </div>
  </div>
{/if}
