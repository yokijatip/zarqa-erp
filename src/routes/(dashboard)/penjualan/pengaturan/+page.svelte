<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { getKanalPenjualan, normalizeChannelKey, saveKanalPenjualan } from '$lib/firebase/penjualan';
  import { isOwnerOrDev } from '$lib/stores/auth.store';
  import type { KanalPenjualan } from '$lib/types';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import SaveIcon from '@lucide/svelte/icons/save';
  import StoreIcon from '@lucide/svelte/icons/store';
  import ChannelLogo from '$lib/components/channel-logo.svelte';

  let channels = $state<KanalPenjualan[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let saved = $state(false);
  let errorMsg = $state<string | null>(null);
  let newChannelName = $state('');
  let newChannelFee = $state('');

  const builtInIds = new Set(['gudang_central', 'shopee', 'tiktok', 'lazada', 'tokopedia', 'web_ecommerce']);
  let activeChannels = $derived(channels.filter((channel) => channel.aktif));

  function parseFee(value: string | number) {
    const normalized = String(value).trim().replace(',', '.');
    const parsed = normalized === '' ? 0 : Number(normalized);
    return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
  }

  function updateFee(id: string, event: Event) {
    const value = parseFee((event.currentTarget as HTMLInputElement).value);
    channels = channels.map((channel) => channel.id === id
      ? { ...channel, biaya_admin_persen: value }
      : channel);
  }

  function toggleChannel(id: string) {
    channels = channels.map((channel) => channel.id === id ? { ...channel, aktif: !channel.aktif } : channel);
  }

  function addChannel() {
    const nama = newChannelName.trim();
    if (!nama) {
      errorMsg = 'Nama e-commerce wajib diisi.';
      return;
    }
    if (channels.some((channel) => normalizeChannelKey(channel.nama) === normalizeChannelKey(nama))) {
      errorMsg = `E-commerce "${nama}" sudah tersedia.`;
      return;
    }
    const baseId = normalizeChannelKey(nama) || `kanal_${Date.now()}`;
    let id = baseId;
    let suffix = 2;
    while (channels.some((channel) => channel.id === id)) id = `${baseId}_${suffix++}`;
    const fee = parseFee(newChannelFee);
    channels = [
      ...channels,
      {
        id,
        nama,
        biaya_admin_persen: fee,
        aktif: true,
        bawaan: false,
      },
    ];
    newChannelName = '';
    newChannelFee = '';
    errorMsg = null;
  }

  async function load() {
    loading = true;
    errorMsg = null;
    try {
      channels = await getKanalPenjualan();
    } catch (error: any) {
      errorMsg = error?.message ?? 'Gagal memuat pengaturan kanal penjualan.';
    } finally {
      loading = false;
    }
  }

  async function save() {
    if (!$isOwnerOrDev || saving) return;
    saving = true;
    errorMsg = null;
    try {
      await saveKanalPenjualan(channels);
      saved = true;
      setTimeout(() => (saved = false), 2500);
    } catch (error: any) {
      errorMsg = error?.message ?? 'Gagal menyimpan pengaturan kanal penjualan.';
    } finally {
      saving = false;
    }
  }

  onMount(load);
</script>

<div class="mx-auto w-full max-w-4xl space-y-6">
  <div>
    <h1 class="text-lg font-semibold text-gray-900">Pengaturan Penjualan</h1>
    <p class="mt-0.5 text-sm text-gray-500">Atur kanal e-commerce dan biaya admin marketplace.</p>
  </div>

  {#if !$isOwnerOrDev}
    <section class="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      Pengaturan biaya admin hanya dapat diakses owner atau developer.
    </section>
  {:else if loading}
    <div class="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Memuat pengaturan kanal...</div>
  {:else}
    <section class="rounded-xl border border-gray-200 bg-white">
      <div class="flex items-start gap-3 border-b border-gray-200 p-5">
        <StoreIcon class="mt-0.5 h-5 w-5 text-gray-500" />
        <div>
          <h2 class="text-sm font-semibold text-gray-900">Biaya admin kanal</h2>
          <p class="mt-1 text-xs text-gray-500">Persentase dipotong dari harga jual bruto saat transaksi dicatat. Histori lama tidak berubah.</p>
        </div>
      </div>

      <div class="divide-y divide-gray-200">
        {#each channels as channel}
          <div class="flex flex-wrap items-center gap-4 px-5 py-4">
            <div class="flex min-w-[180px] flex-1 items-center gap-2">
              <ChannelLogo name={channel.nama} size="md" />
              <div>
                <p class="text-sm font-medium text-gray-900">{channel.nama}</p>
                <p class="mt-0.5 text-xs text-gray-500">{builtInIds.has(channel.id) ? 'Kanal bawaan' : 'Kanal tambahan'}</p>
              </div>
            </div>
            <label class="flex items-center gap-2 text-sm text-gray-600">
              <span>Admin</span>
              <div class="relative">
                <Input
                  type="text"
                  inputmode="decimal"
                  value={channel.biaya_admin_persen === 0 ? '' : channel.biaya_admin_persen}
                  placeholder="0"
                  onchange={(event) => updateFee(channel.id, event)}
                  class="w-24 pr-7"
                />
                <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">%</span>
              </div>
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={channel.aktif}
              aria-label={`${channel.aktif ? 'Nonaktifkan' : 'Aktifkan'} ${channel.nama}`}
              title={`${channel.aktif ? 'Nonaktifkan' : 'Aktifkan'} ${channel.nama}`}
              onclick={() => toggleChannel(channel.id)}
              disabled={saving}
              class={`relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${channel.aktif ? 'border-emerald-700 bg-emerald-600' : 'border-gray-400 bg-gray-200'}`}
            >
              <span class={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full border border-black/10 bg-white shadow-sm transition-transform ${channel.aktif ? 'translate-x-5' : 'translate-x-0'}`}></span>
            </button>
            <span class="w-16 text-right text-xs text-gray-500">{channel.aktif ? 'Aktif' : 'Nonaktif'}</span>
          </div>
        {/each}
      </div>
    </section>

    <section class="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5">
      <div class="mb-4">
        <h2 class="text-sm font-semibold text-gray-900">Tambah e-commerce</h2>
        <p class="mt-1 text-xs text-gray-500">Kanal baru akan tersedia di form barang keluar dan dapat dipilih pada harga model.</p>
      </div>
      <div class="grid gap-3 sm:grid-cols-[1fr_150px_auto] sm:items-end">
        <label class="space-y-1.5 text-xs font-medium text-gray-700">
          Nama e-commerce
          <Input bind:value={newChannelName} placeholder="Contoh: Blibli" />
        </label>
        <label class="space-y-1.5 text-xs font-medium text-gray-700">
          Biaya admin
          <div class="relative">
            <Input bind:value={newChannelFee} type="text" inputmode="decimal" placeholder="0" class="pr-7" />
            <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">%</span>
          </div>
        </label>
        <Button type="button" variant="outline" onclick={addChannel}>
          <PlusIcon class="mr-1.5 h-4 w-4" />
          Tambah kanal
        </Button>
      </div>
    </section>

    {#if errorMsg}
      <p class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</p>
    {/if}

    <div class="flex items-center justify-between">
      <p class="text-xs text-gray-500">Kanal aktif: {activeChannels.length}</p>
      <Button type="button" onclick={save} disabled={saving}>
        <SaveIcon class="mr-1.5 h-4 w-4" />
        {saving ? 'Menyimpan...' : saved ? 'Tersimpan' : 'Simpan pengaturan'}
      </Button>
    </div>
  {/if}
</div>
