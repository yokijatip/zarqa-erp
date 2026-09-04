<script lang="ts">
  import {
    collection,
    collectionGroup,
    getDocs,
    writeBatch,
    type DocumentReference,
  } from "firebase/firestore";
  import { db } from "$lib/firebase/config";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import AlertTriangleIcon from "@lucide/svelte/icons/triangle-alert";
  import DatabaseIcon from "@lucide/svelte/icons/database";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import LoaderIcon from "@lucide/svelte/icons/loader";
  import ShieldIcon from "@lucide/svelte/icons/shield";
  import CheckIcon from "@lucide/svelte/icons/check";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import LockKeyholeIcon from "@lucide/svelte/icons/lock-keyhole";
  import MinusIcon from "@lucide/svelte/icons/minus";

  type FlushTarget = {
    id?: string;
    collection: string;
    label: string;
    description: string;
    subcollections?: string[];
    warning?: string;
    collectionGroup?: boolean;
  };

  type ProtectedTarget = {
    label: string;
    description: string;
  };

  type FlushGroup = {
    key: string;
    label: string;
    description: string;
    targets: FlushTarget[];
    protectedTargets?: ProtectedTarget[];
  };

  const FLUSH_GROUPS: FlushGroup[] = [
    {
      key: "gudang",
      label: "Gudang",
      description: "Master produk, kain, potongan, dan stok barang jadi.",
      targets: [
        {
          collection: "master_kain",
          label: "Master Kain",
          description: "Jenis kain yang terdaftar di inventaris.",
        },
        {
          collection: "model_baju",
          label: "Model Baju",
          description: "Master model, ukuran, warna, dan harga jual.",
        },
        {
          collection: "stok_kain",
          label: "Stok Kain",
          description: "Saldo kain dan catatan pemakaian/restock.",
          subcollections: ["riwayat"],
          warning: "Stok kain dan riwayat restock/pemakaian akan dihapus.",
        },
        {
          collection: "model_hijab",
          label: "Model Hijab",
          description: "Master model hijab, foto, dan harga pusat.",
        },
        {
          collection: "stok_hijab",
          label: "Stok Hijab",
          description: "Saldo hijab dan catatan restock/pemakaian paket.",
          subcollections: ["riwayat"],
          warning: "Stok hijab dan riwayat restock/pemakaian paket akan dihapus.",
        },
        {
          collection: "stok_potongan",
          label: "Stok Potongan",
          description: "Sisa hasil cutting yang siap dipakai.",
        },
        {
          collection: "stok_barang_jadi",
          label: "Stok Barang Jadi",
          description: "Stok siap kirim berdasarkan model, warna, dan ukuran.",
        },
        {
          collection: "riwayat_barang_jadi",
          label: "Riwayat Barang Jadi",
          description: "Riwayat barang jadi masuk, keluar, dan koreksi stok.",
        },
      ],
      protectedTargets: [
        {
          label: "Warna",
          description: "Master warna produk tetap dipertahankan.",
        },
      ],
    },
    {
      key: "produksi",
      label: "Produksi",
      description: "Batch cutting, jahit, steam, dan data reject.",
      targets: [
        {
          collection: "batch_produksi",
          label: "Batch Produksi",
          description: "Antrean dan status seluruh proses produksi.",
          subcollections: ["riwayat_proses"],
          warning: "Semua batch dan riwayat proses produksi akan dihapus.",
        },
        {
          collection: "reject_items",
          label: "Data Reject",
          description: "Reject produksi yang menunggu atau sudah diselesaikan.",
          subcollections: ["riwayat_resolusi"],
          warning: "Pending reject dan riwayat penanganannya akan dihapus.",
        },
      ],
    },
    {
      key: "penjualan",
      label: "Penjualan",
      description: "Order dan barang keluar dari gudang.",
      targets: [
        {
          collection: "barang_keluar",
          label: "Barang Keluar / Order Penjualan",
          description: "Seluruh transaksi barang keluar dan penjualan.",
        },
      ],
    },
    {
      key: "keuangan",
      label: "Keuangan",
      description: "Transaksi, aset, budget, dan saldo migrasi.",
      targets: [
        {
          collection: "transaksi_keuangan",
          label: "Transaksi Keuangan",
          description: "Pemasukan, pengeluaran, dan pembelian bahan baku.",
          warning: "Riwayat keuangan akan dihapus permanen.",
        },
        {
          collection: "aset_perusahaan",
          label: "Aset Perusahaan",
          description: "Daftar aset dan data penyusutannya.",
        },
        {
          collection: "budget_bulanan",
          label: "Budget Bulanan",
          description: "Rencana anggaran bulanan perusahaan.",
        },
        {
          collection: "saldo_awal_keuangan",
          label: "Saldo Awal Migrasi",
          description: "Saldo kas dan modal awal saat cut-over.",
          warning: "Saldo awal migrasi akan dihapus.",
        },
      ],
    },
    {
      key: "karyawan",
      label: "Karyawan",
      description: "Data penggajian tanpa menghapus akun login.",
      targets: [
        {
          collection: "pembayaran_gaji",
          label: "Riwayat Pembayaran Gaji",
          description: "Riwayat pembayaran gaji karyawan.",
          warning: "Riwayat pembayaran gaji akan dihapus permanen.",
        },
      ],
      protectedTargets: [
        {
          label: "Akun Karyawan (Users)",
          description: "Profil, role, dan akses login tidak pernah dihapus.",
        },
      ],
    },
    {
      key: "laporan",
      label: "Laporan",
      description: "Log aktivitas yang tampil di halaman laporan akun.",
      targets: [
        {
          collection: "riwayat_proses",
          label: "Aktivitas Proses Produksi",
          description: "Log perubahan status batch cutting, jahit, dan steam.",
          collectionGroup: true,
          warning: "Hanya log aktivitas yang dihapus; batch produksinya tetap aman.",
        },
        {
          id: "laporan_riwayat_barang_jadi",
          collection: "riwayat_barang_jadi",
          label: "Aktivitas Barang Jadi",
          description: "Log stok barang jadi masuk, keluar, dan koreksi.",
          warning: "Hanya riwayat log yang dihapus; stok barang jadi tetap aman.",
        },
        {
          collection: "riwayat",
          label: "Aktivitas Stok Kain & Hijab",
          description: "Log pembelian, restock, pemakaian, dan penyesuaian stok kain atau hijab.",
          collectionGroup: true,
          warning: "Hanya log aktivitas yang dihapus; saldo stok kain tetap aman.",
        },
        {
          collection: "riwayat_resolusi",
          label: "Aktivitas Resolusi Reject",
          description: "Log penanganan reject produksi.",
          collectionGroup: true,
          warning: "Hanya log aktivitas yang dihapus; data reject tetap aman.",
        },
      ],
    },
  ];

  const FLUSH_TARGETS = FLUSH_GROUPS.flatMap((group) => group.targets);
  const SUBCOLLECTION_LABELS: Record<string, string> = {
    riwayat: "Riwayat kain",
    riwayat_proses: "Riwayat proses",
    riwayat_resolusi: "Riwayat resolusi reject",
  };
  const CORRECT_PASSWORD = "Yokijatiperkasa30!";
  const CONFIRM_TEXT = "HAPUS DATA";

  let password = $state("");
  let confirmText = $state("");
  let step = $state<"form" | "confirm" | "done">("form");
  let flushing = $state(false);
  let progress = $state("");
  let errorMsg = $state<string | null>(null);
  let deleted = $state<string[]>([]);
  let deletedCount = $state(0);
  let openGroups = $state(new Set(FLUSH_GROUPS.map((group) => group.key)));
  let selected = $state<Set<string>>(new Set());

  function targetKey(target: FlushTarget): string {
    return target.id ?? target.collection;
  }

  let selectedTargets = $derived(
    FLUSH_TARGETS.filter((target) => selected.has(targetKey(target))),
  );
  let selectedTargetCount = $derived(selectedTargets.length);
  let selectedGroupCount = $derived(
    FLUSH_GROUPS.filter((group) => group.targets.some((target) => selected.has(targetKey(target)))).length,
  );
  let allSelected = $derived(
    FLUSH_TARGETS.length > 0 && selected.size === FLUSH_TARGETS.length,
  );
  let noneSelected = $derived(selectedTargets.length === 0);
  let wrongPass = $derived(
    password.length > 0 && password !== CORRECT_PASSWORD,
  );
  let wrongConfirm = $derived(
    confirmText.length > 0 && confirmText.trim().toUpperCase() !== CONFIRM_TEXT,
  );
  let canFlush = $derived(
    password === CORRECT_PASSWORD &&
      confirmText.trim().toUpperCase() === CONFIRM_TEXT &&
      !noneSelected,
  );

  function groupSelectedCount(group: FlushGroup): number {
    return group.targets.filter((target) => selected.has(targetKey(target))).length;
  }

  function groupAllSelected(group: FlushGroup): boolean {
    return group.targets.length > 0 && groupSelectedCount(group) === group.targets.length;
  }

  function groupPartiallySelected(group: FlushGroup): boolean {
    const count = groupSelectedCount(group);
    return count > 0 && count < group.targets.length;
  }

  function toggleTarget(collectionName: string) {
    const next = new Set(selected);
    if (next.has(collectionName)) next.delete(collectionName);
    else next.add(collectionName);
    selected = next;
  }

  function toggleGroup(group: FlushGroup) {
    const next = new Set(selected);
    if (groupAllSelected(group)) {
      group.targets.forEach((target) => next.delete(targetKey(target)));
    } else {
      group.targets.forEach((target) => next.add(targetKey(target)));
    }
    selected = next;
  }

  function toggleAll() {
    selected = allSelected
      ? new Set()
      : new Set(FLUSH_TARGETS.map(targetKey));
  }

  function toggleGroupOpen(groupKey: string) {
    const next = new Set(openGroups);
    if (next.has(groupKey)) next.delete(groupKey);
    else next.add(groupKey);
    openGroups = next;
  }

  function subcollectionLabel(name: string): string {
    return SUBCOLLECTION_LABELS[name] ?? name;
  }

  async function deleteRefs(refs: DocumentReference[]): Promise<number> {
    let deletedRefs = 0;
    for (let i = 0; i < refs.length; i += 450) {
      const batch = writeBatch(db);
      const chunk = refs.slice(i, i + 450);
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
      deletedRefs += chunk.length;
    }
    return deletedRefs;
  }

  async function deleteTarget(target: FlushTarget): Promise<number> {
    const source = target.collectionGroup
      ? collectionGroup(db, target.collection)
      : collection(db, target.collection);
    const rootSnap = await getDocs(source);
    let count = 0;

    if (!target.collectionGroup) {
      for (const docSnap of rootSnap.docs) {
        for (const subcollection of target.subcollections ?? []) {
          const subSnap = await getDocs(
            collection(db, target.collection, docSnap.id, subcollection),
          );
          count += await deleteRefs(subSnap.docs.map((item) => item.ref));
        }
      }
    }

    count += await deleteRefs(rootSnap.docs.map((docSnap) => docSnap.ref));
    return count;
  }

  async function runFlush() {
    flushing = true;
    errorMsg = null;
    deleted = [];
    deletedCount = 0;

    try {
      const targets = [...selectedTargets];
      for (const target of targets) {
        progress = `Menghapus ${target.label}...`;
        const count = await deleteTarget(target);
        deletedCount += count;
        deleted = [...deleted, targetKey(target)];
      }
      progress = "";
      step = "done";
    } catch (error: unknown) {
      errorMsg =
        error instanceof Error ? error.message : "Terjadi kesalahan saat flush.";
      step = "form";
    } finally {
      flushing = false;
    }
  }

  function reset() {
    password = "";
    confirmText = "";
    step = "form";
    errorMsg = null;
    progress = "";
    deleted = [];
    deletedCount = 0;
    selected = new Set();
  }
</script>

<div class="mx-auto max-w-4xl space-y-6">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Flushing Database</h1>
    <p class="mt-1 text-sm text-gray-500">
      Hapus data operasional berdasarkan menu. Akun karyawan dan master warna tetap aman.
    </p>
  </div>

  <div class="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5">
    <AlertTriangleIcon class="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
    <p class="text-sm font-medium leading-6 text-red-700">
      Flush bersifat permanen dan tidak dapat dibatalkan. Pastikan backup sudah tersedia sebelum melanjutkan.
    </p>
  </div>

  {#if step === "form"}
    <section class="rounded-xl border border-red-100 bg-white">
      <div class="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div>
          <div class="flex items-center gap-2">
            <DatabaseIcon class="h-4 w-4 text-red-500" />
            <h2 class="text-sm font-semibold text-gray-900">Pilih Data yang Akan Dihapus</h2>
          </div>
          <p class="mt-1 text-xs leading-5 text-gray-500">
            Pilih satu submenu atau seluruh data dalam satu menu. Data yang tidak dipilih tidak akan disentuh.
          </p>
        </div>
        <Button variant="outline" size="sm" onclick={toggleAll} class="gap-2">
          {#if allSelected}
            <MinusIcon class="h-3.5 w-3.5" />
            Kosongkan pilihan
          {:else}
            <CheckIcon class="h-3.5 w-3.5" />
            Pilih semua data operasional
          {/if}
        </Button>
      </div>

      <div class="divide-y divide-gray-100">
        {#each FLUSH_GROUPS as group}
          {@const selectedCount = groupSelectedCount(group)}
          {@const isOpen = openGroups.has(group.key)}
          {@const isPartial = groupPartiallySelected(group)}
          <div>
            <div class="flex items-center gap-3 px-5 py-4">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-3 text-left"
                aria-expanded={isOpen}
                onclick={() => toggleGroupOpen(group.key)}
              >
                {#if isOpen}
                  <ChevronDownIcon class="h-4 w-4 shrink-0 text-gray-400" />
                {:else}
                  <ChevronRightIcon class="h-4 w-4 shrink-0 text-gray-400" />
                {/if}
                <span class="min-w-0">
                  <span class="block text-sm font-semibold text-gray-900">{group.label}</span>
                  <span class="mt-0.5 block text-xs text-gray-500">{group.description}</span>
                </span>
              </button>

              <span class="shrink-0 text-xs text-gray-400">
                {selectedCount}/{group.targets.length} dipilih
              </span>
              {#if group.targets.length > 0}
                <label class="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-gray-600">
                  <input
                    type="checkbox"
                    checked={groupAllSelected(group)}
                    aria-label={`Pilih semua data menu ${group.label}`}
                    onchange={() => toggleGroup(group)}
                    class="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  <span class={isPartial ? "text-red-600" : ""}>
                    {isPartial ? "Sebagian" : "Semua"}
                  </span>
                </label>
              {/if}
            </div>

            {#if isOpen}
              <div class="space-y-2 border-t border-gray-100 bg-gray-50/60 px-5 py-4 pl-12">
                {#each group.targets as target}
                  {@const checked = selected.has(targetKey(target))}
                  <label
                    class={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors ${
                      checked ? "border-red-200 bg-red-50" : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      {checked}
                      onchange={() => toggleTarget(targetKey(target))}
                      class="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    <span class="min-w-0 flex-1">
                      <span class={`block text-sm font-medium ${checked ? "text-red-800" : "text-gray-800"}`}>
                        {target.label}
                      </span>
                      <span class="mt-0.5 block text-xs leading-5 text-gray-500">{target.description}</span>
                      {#if target.subcollections?.length}
                        <span class="mt-2 flex flex-wrap gap-1.5">
                          {#each target.subcollections as subcollection}
                            <span class="rounded-md bg-gray-100 px-2 py-1 text-[11px] text-gray-600">
                              + {subcollectionLabel(subcollection)}
                            </span>
                          {/each}
                        </span>
                      {/if}
                      {#if target.warning && checked}
                        <span class="mt-2 block text-xs font-medium leading-5 text-red-600">{target.warning}</span>
                      {/if}
                    </span>
                    <code class="hidden shrink-0 text-[10px] text-gray-400 lg:block">{target.collectionGroup ? `group:${target.collection}` : target.collection}</code>
                  </label>
                {/each}

                {#each group.protectedTargets ?? [] as target}
                  <div class="flex items-start gap-3 rounded-lg border border-green-100 bg-green-50 px-3.5 py-3">
                    <LockKeyholeIcon class="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    <span class="min-w-0 flex-1">
                      <span class="block text-sm font-medium text-green-800">{target.label}</span>
                      <span class="mt-0.5 block text-xs leading-5 text-green-700">{target.description}</span>
                    </span>
                    <span class="shrink-0 text-[11px] font-medium text-green-700">Terlindungi</span>
                  </div>
                {/each}

                {#if group.targets.length === 0 && !group.protectedTargets?.length}
                  <p class="text-xs text-gray-500">Belum ada data flush untuk menu ini.</p>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-5 py-3">
        <div class="flex items-center gap-2 text-xs text-gray-600">
          <TrashIcon class="h-3.5 w-3.5 text-red-500" />
          <span><strong class="text-gray-900">{selectedTargetCount}</strong> submenu dari <strong class="text-gray-900">{selectedGroupCount}</strong> menu dipilih</span>
        </div>
        {#if noneSelected}
          <span class="text-xs font-medium text-amber-700">Pilih minimal satu submenu.</span>
        {/if}
      </div>
    </section>

    <section class="rounded-xl border border-gray-200 bg-white p-5">
      <div class="mb-4 flex items-start gap-3">
        <ShieldIcon class="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
        <div>
          <h2 class="text-sm font-semibold text-gray-900">Verifikasi Penghapusan</h2>
          <p class="mt-1 text-xs leading-5 text-gray-500">Masukkan password admin dan ketik teks konfirmasi secara persis.</p>
        </div>
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-gray-700">Password flush</span>
          <Input type="password" bind:value={password} placeholder="Masukkan password flush" autocomplete="off" />
          {#if wrongPass}
            <span class="mt-1.5 block text-xs text-red-500">Password salah.</span>
          {/if}
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-gray-700">Konfirmasi teks</span>
          <Input bind:value={confirmText} placeholder={`Ketik ${CONFIRM_TEXT}`} autocomplete="off" />
          {#if wrongConfirm}
            <span class="mt-1.5 block text-xs text-red-500">Ketik {CONFIRM_TEXT} untuk melanjutkan.</span>
          {/if}
        </label>
      </div>
    </section>

    {#if errorMsg}
      <p class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{errorMsg}</p>
    {/if}

    <div class="flex justify-end">
      <Button variant="destructive" disabled={!canFlush} onclick={() => (step = "confirm")} class="gap-2">
        <TrashIcon class="h-4 w-4" />
        Tinjau dan Flush
      </Button>
    </div>
  {:else if step === "confirm"}
    <section class="rounded-xl border border-red-200 bg-white p-5">
      <div class="mb-5 flex items-start gap-3">
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
          <AlertTriangleIcon class="h-5 w-5 text-red-600" />
        </div>
        <div>
          <h2 class="text-base font-semibold text-gray-900">Konfirmasi Flush Terakhir</h2>
          <p class="mt-1 text-sm leading-6 text-gray-500">Data berikut akan dihapus permanen dari database.</p>
        </div>
      </div>

      <div class="mb-5 space-y-4">
        {#each FLUSH_GROUPS as group}
          {@const targets = group.targets.filter((target) => selected.has(targetKey(target)))}
          {#if targets.length > 0}
            <div class="rounded-lg border border-red-100 bg-red-50/60 p-3.5">
              <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">{group.label}</p>
              <div class="space-y-1.5">
                {#each targets as target}
                  {@const done = deleted.includes(targetKey(target))}
                  <div class="flex items-center gap-2 text-sm {done ? 'text-green-700' : 'text-red-800'}">
                    {#if done}
                      <CheckIcon class="h-3.5 w-3.5 shrink-0" />
                    {:else if flushing && progress.includes(target.label)}
                      <LoaderIcon class="h-3.5 w-3.5 shrink-0 animate-spin" />
                    {:else}
                      <TrashIcon class="h-3.5 w-3.5 shrink-0" />
                    {/if}
                    <span class={done ? "line-through" : ""}>{target.label}</span>
                    {#if target.subcollections?.length}
                      <span class="text-xs text-gray-500">(+ {target.subcollections.map(subcollectionLabel).join(", ")})</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      </div>

      <div class="flex flex-wrap justify-end gap-3">
        <Button variant="outline" onclick={() => (step = "form")} disabled={flushing}>Batal</Button>
        <Button variant="destructive" onclick={runFlush} disabled={flushing} class="min-w-[180px] gap-2">
          {#if flushing}
            <LoaderIcon class="h-4 w-4 animate-spin" />
            {progress || "Memproses..."}
          {:else}
            <TrashIcon class="h-4 w-4" />
            Ya, hapus {selectedTargetCount} submenu
          {/if}
        </Button>
      </div>
    </section>
  {:else if step === "done"}
    <section class="rounded-xl border border-green-200 bg-green-50 p-6">
      <div class="mb-4 flex items-start gap-3">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
          <CheckIcon class="h-5 w-5 text-green-600" />
        </div>
        <div>
          <h2 class="font-semibold text-green-800">Flush berhasil</h2>
          <p class="mt-1 text-sm leading-6 text-green-700">
            {deleted.length} submenu selesai diproses, {deletedCount} dokumen dihapus.
          </p>
        </div>
      </div>

      <div class="mb-5 grid gap-2 sm:grid-cols-2">
        {#each FLUSH_GROUPS as group}
          {@const groupDeleted = group.targets.filter((target) => deleted.includes(targetKey(target)))}
          {#if groupDeleted.length > 0}
            <div class="rounded-lg border border-green-200 bg-white px-3 py-2.5">
              <p class="text-xs font-semibold text-green-800">{group.label}</p>
              <p class="mt-1 text-xs leading-5 text-green-700">{groupDeleted.map((target) => target.label).join(", ")}</p>
            </div>
          {/if}
        {/each}
      </div>

      <div class="rounded-lg border border-green-200 bg-white px-4 py-3 text-sm leading-6 text-green-700">
        <span class="font-medium">Tetap tersimpan:</span> akun karyawan, role/akses login, dan master warna.
      </div>
      <Button variant="outline" onclick={reset} class="mt-4">Kembali</Button>
    </section>
  {/if}
</div>
