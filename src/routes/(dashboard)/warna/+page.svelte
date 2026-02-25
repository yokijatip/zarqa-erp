<script lang="ts">
  import { onMount } from "svelte";
  import {
    getWarnaList,
    addWarna,
    updateWarna,
    deleteWarna,
  } from "$lib/firebase/warna";
  import type { Warna } from "$lib/types";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Table from "$lib/components/ui/table";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import StatCard from "$lib/components/StatCard.svelte";
  import PaletteIcon from "@lucide/svelte/icons/palette";

  // ── State ──────────────────────────────────────────────────────────
  let warnaList = $state<Warna[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);
  let successMsg = $state<string | null>(null);
  let searchQuery = $state("");

  // Dialog state
  let openTambah = $state(false);
  let openEdit = $state(false);
  let openHapus = $state(false);
  let selectedWarna = $state<Warna | null>(null);

  // Form: tambah warna
  let fNama = $state("");
  let fHex = $state("#000000");

  // Form: edit warna
  let eNama = $state("");
  let eHex = $state("#000000");

  // ── Derived ────────────────────────────────────────────────────────
  let filteredList = $derived(
    warnaList.filter(
      (w) =>
        !searchQuery ||
        w.nama_warna.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );

  let canSubmitTambah = $derived(fNama.trim() !== "" && fHex.trim() !== "");
  let canSubmitEdit = $derived(eNama.trim() !== "" && eHex.trim() !== "");

  // ── Helpers ────────────────────────────────────────────────────────
  function showSuccess(msg: string) {
    successMsg = msg;
    setTimeout(() => (successMsg = null), 3000);
  }

  function showError(msg: string) {
    errorMsg = msg;
    setTimeout(() => (errorMsg = null), 5000);
  }

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      warnaList = await getWarnaList();
    } catch {
      showError("Gagal memuat data warna. Periksa koneksi Firebase.");
    } finally {
      loading = false;
    }
  }

  // ── Dialog helpers ────────────────────────────────────────────────
  function bukaTambah() {
    fNama = "";
    fHex = "#000000";
    openTambah = true;
  }

  function bukaEdit(w: Warna) {
    selectedWarna = w;
    eNama = w.nama_warna;
    eHex = w.kode_hex;
    openEdit = true;
  }

  function bukaHapus(w: Warna) {
    selectedWarna = w;
    openHapus = true;
  }

  // ── Submit handlers ───────────────────────────────────────────────
  async function submitTambah() {
    if (!canSubmitTambah) return;
    saving = true;
    try {
      await addWarna({ nama_warna: fNama.trim(), kode_hex: fHex });
      openTambah = false;
      showSuccess(`Warna "${fNama.trim()}" berhasil ditambahkan.`);
      await load();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Gagal menambahkan warna.");
    } finally {
      saving = false;
    }
  }

  async function submitEdit() {
    if (!canSubmitEdit || !selectedWarna) return;
    saving = true;
    try {
      await updateWarna(selectedWarna.id, {
        nama_warna: eNama.trim(),
        kode_hex: eHex,
      });
      openEdit = false;
      showSuccess("Warna berhasil diperbarui.");
      await load();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Gagal memperbarui warna.");
    } finally {
      saving = false;
    }
  }

  async function submitHapus() {
    if (!selectedWarna) return;
    saving = true;
    try {
      await deleteWarna(selectedWarna.id);
      openHapus = false;
      showSuccess(`Warna "${selectedWarna.nama_warna}" berhasil dihapus.`);
      await load();
    } catch (e: unknown) {
      openHapus = false;
      showError(e instanceof Error ? e.message : "Gagal menghapus warna.");
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
      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
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

<!-- ── Header ─────────────────────────────────────────────────────── -->
<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Manajemen Warna</h1>
    <p class="mt-0.5 text-sm text-gray-500">
      Kelola master data warna untuk model baju
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
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
    Tambah Warna
  </Button>
</div>

<!-- ── Stats Row ──────────────────────────────────────────────────── -->
<div class="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
  <StatCard
    title="Total Warna"
    value={warnaList.length}
    icon={PaletteIcon}
    footerSubtext="warna terdaftar"
  />
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
      placeholder="Cari nama warna..."
      bind:value={searchQuery}
      class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
    />
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
<div class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
  {#if loading}
    <div class="space-y-0">
      {#each Array(5) as _}
        <div class="flex items-center gap-4 border-b border-gray-50 px-5 py-4">
          <div class="h-5 w-5 animate-pulse rounded-full bg-gray-100"></div>
          <div class="h-4 w-32 animate-pulse rounded bg-gray-100"></div>
          <div class="ml-auto h-4 w-20 animate-pulse rounded bg-gray-100"></div>
          <div class="h-7 w-16 animate-pulse rounded bg-gray-100"></div>
        </div>
      {/each}
    </div>
  {:else if filteredList.length === 0}
    <div class="flex flex-col items-center justify-center gap-3 py-16">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
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
            d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z"
          />
        </svg>
      </div>
      {#if searchQuery}
        <p class="text-sm font-medium text-gray-500">
          Warna "{searchQuery}" tidak ditemukan
        </p>
        <Button variant="link" size="sm" onclick={() => (searchQuery = "")}>
          Hapus filter
        </Button>
      {:else}
        <p class="text-sm font-medium text-gray-500">Belum ada data warna</p>
        <p class="text-xs text-gray-400">Mulai dengan menambahkan warna pertama</p>
        <Button onclick={bukaTambah} class="mt-1">+ Tambah Warna</Button>
      {/if}
    </div>
  {:else}
    <Table.Root>
      <Table.Header>
        <Table.Row class="bg-gray-50 hover:bg-gray-50">
          <Table.Head>Nama Warna</Table.Head>
          <Table.Head>Kode Hex</Table.Head>
          <Table.Head></Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each filteredList as w}
          <Table.Row>
            <Table.Cell>
              <div class="flex items-center gap-3">
                <span
                  class="inline-block h-6 w-6 shrink-0 rounded-full border border-gray-200 shadow-sm"
                  style="background-color: {w.kode_hex}"
                ></span>
                <p class="text-sm font-medium text-gray-800">{w.nama_warna}</p>
              </div>
            </Table.Cell>
            <Table.Cell>
              <code class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{w.kode_hex}</code>
            </Table.Cell>
            <Table.Cell class="text-right">
              <div class="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => bukaEdit(w)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
                    />
                  </svg>
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onclick={() => bukaHapus(w)}
                >
                  <svg
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
              </div>
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>

    <div class="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-3">
      <p class="text-xs text-gray-400">
        Menampilkan {filteredList.length} dari {warnaList.length} warna
      </p>
    </div>
  {/if}
</div>

<!-- ── Dialog: Tambah Warna ───────────────────────────────────────── -->
<Dialog.Root bind:open={openTambah}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Tambah Warna</Dialog.Title>
      <Dialog.Description>Tambahkan warna baru ke daftar master warna.</Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      <div class="space-y-1.5">
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="tambah-nama">
          Nama Warna <span class="text-red-500">*</span>
        </label>
        <Input
          id="tambah-nama"
          placeholder="cth: Merah Marun, Biru Navy, Hijau Toska"
          bind:value={fNama}
        />
      </div>

      <div class="space-y-1.5">
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="tambah-hex">
          Warna <span class="text-red-500">*</span>
        </label>
        <div class="flex items-center gap-3">
          <input
            id="tambah-hex"
            type="color"
            bind:value={fHex}
            class="h-10 w-16 cursor-pointer rounded-lg border border-gray-200 p-1"
          />
          <Input
            placeholder="#000000"
            bind:value={fHex}
            class="flex-1 font-mono text-sm"
            maxlength={7}
          />
          <span
            class="h-10 w-10 shrink-0 rounded-lg border border-gray-200 shadow-sm"
            style="background-color: {fHex}"
          ></span>
        </div>
        <p class="text-xs text-gray-400">Pilih warna dengan color picker atau masukkan kode hex (#RRGGBB).</p>
      </div>
    </div>

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openTambah = false)}>Batal</Button>
      <Button onclick={submitTambah} disabled={saving || !canSubmitTambah}>
        {saving ? "Menyimpan..." : "Simpan"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- ── Dialog: Edit Warna ────────────────────────────────────────── -->
<Dialog.Root bind:open={openEdit}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Edit Warna</Dialog.Title>
      <Dialog.Description>Perbarui nama atau kode warna.</Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      <div class="space-y-1.5">
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="edit-nama">
          Nama Warna <span class="text-red-500">*</span>
        </label>
        <Input
          id="edit-nama"
          placeholder="cth: Merah Marun, Biru Navy"
          bind:value={eNama}
        />
      </div>

      <div class="space-y-1.5">
        <label class="mb-1.5 block text-sm font-medium text-gray-700" for="edit-hex">
          Warna <span class="text-red-500">*</span>
        </label>
        <div class="flex items-center gap-3">
          <input
            id="edit-hex"
            type="color"
            bind:value={eHex}
            class="h-10 w-16 cursor-pointer rounded-lg border border-gray-200 p-1"
          />
          <Input
            placeholder="#000000"
            bind:value={eHex}
            class="flex-1 font-mono text-sm"
            maxlength={7}
          />
          <span
            class="h-10 w-10 shrink-0 rounded-lg border border-gray-200 shadow-sm"
            style="background-color: {eHex}"
          ></span>
        </div>
      </div>
    </div>

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openEdit = false)}>Batal</Button>
      <Button onclick={submitEdit} disabled={saving || !canSubmitEdit}>
        {saving ? "Menyimpan..." : "Simpan Perubahan"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- ── Dialog: Konfirmasi Hapus ───────────────────────────────────── -->
<Dialog.Root bind:open={openHapus}>
  <Dialog.Content class="max-w-sm">
    <Dialog.Header>
      <Dialog.Title>Hapus Warna</Dialog.Title>
      <Dialog.Description>Tindakan ini tidak dapat dibatalkan.</Dialog.Description>
    </Dialog.Header>

    {#if selectedWarna}
      <div class="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4">
        <span
          class="h-10 w-10 shrink-0 rounded-full border border-gray-200 shadow-sm"
          style="background-color: {selectedWarna.kode_hex}"
        ></span>
        <div>
          <p class="text-sm font-semibold text-gray-800">{selectedWarna.nama_warna}</p>
          <code class="text-xs text-gray-400">{selectedWarna.kode_hex}</code>
        </div>
      </div>
      <p class="text-sm text-gray-500">
        Pastikan warna ini tidak sedang digunakan oleh model baju manapun sebelum dihapus.
      </p>
    {/if}

    <Dialog.Footer class="gap-2">
      <Button variant="outline" onclick={() => (openHapus = false)}>Batal</Button>
      <Button variant="destructive" onclick={submitHapus} disabled={saving}>
        {saving ? "Menghapus..." : "Ya, Hapus"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
