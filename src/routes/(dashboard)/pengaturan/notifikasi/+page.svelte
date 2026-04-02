<script lang="ts">
  import { Button } from '$lib/components/ui/button';

  type NotifItem = {
    id: string;
    label: string;
    description: string;
    enabled: boolean;
  };

  let items = $state<NotifItem[]>([
    {
      id: 'batch_selesai',
      label: 'Batch produksi selesai',
      description: 'Kirim notifikasi saat sebuah batch mencapai status Selesai.',
      enabled: true,
    },
    {
      id: 'stok_menipis',
      label: 'Stok kain menipis',
      description: 'Ingatkan ketika stok kain tersedia di bawah ambang batas.',
      enabled: true,
    },
    {
      id: 'batch_pending',
      label: 'Batch baru menunggu',
      description: 'Notifikasi saat ada order produksi baru yang belum diproses.',
      enabled: false,
    },
    {
      id: 'laporan_harian',
      label: 'Ringkasan harian',
      description: 'Kirim ringkasan aktivitas produksi setiap hari pukul 18.00.',
      enabled: false,
    },
    {
      id: 'barang_keluar',
      label: 'Barang keluar dicatat',
      description: 'Notifikasi setiap kali ada pencatatan pengiriman barang.',
      enabled: false,
    },
  ]);

  let saving = $state(false);
  let saved  = $state(false);

  async function simpan() {
    saving = true;
    await new Promise((r) => setTimeout(r, 800));
    saving = false;
    saved  = true;
    setTimeout(() => (saved = false), 2500);
  }
</script>

<div class="mx-auto max-w-xl space-y-6">

  <div>
    <h1 class="text-lg font-semibold text-gray-900">Notifikasi</h1>
    <p class="mt-0.5 text-sm text-gray-500">Atur jenis pemberitahuan yang ingin Anda terima.</p>
  </div>

  <div class="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
    {#each items as item}
      <label class="flex cursor-pointer items-start gap-4 px-5 py-4 transition-colors hover:bg-gray-50/60">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-800">{item.label}</p>
          <p class="mt-0.5 text-xs text-gray-500">{item.description}</p>
        </div>
        <!-- Toggle switch -->
        <div class="relative mt-0.5 shrink-0">
          <input
            type="checkbox"
            class="peer sr-only"
            bind:checked={item.enabled}
          />
          <div
            class={`h-6 w-11 rounded-full transition-colors ${item.enabled ? 'bg-gray-900' : 'bg-gray-200'}`}
          ></div>
          <div
            class={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${item.enabled ? 'translate-x-5' : 'translate-x-0'}`}
          ></div>
        </div>
      </label>
    {/each}
  </div>

  <div class="flex items-center justify-between">
    <p class="text-xs text-gray-400">
      * Fitur pengiriman notifikasi sedang dalam pengembangan.
    </p>
    <Button onclick={simpan} disabled={saving} class="min-w-[120px]">
      {#if saving}
        Menyimpan...
      {:else if saved}
        ✓ Tersimpan
      {:else}
        Simpan
      {/if}
    </Button>
  </div>

</div>
