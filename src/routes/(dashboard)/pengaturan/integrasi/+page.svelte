<script lang="ts">
  import { Button } from '$lib/components/ui/button';

  // Dummy state — belum ada implementasi nyata
  type IntegrationStatus = 'disconnected' | 'connecting' | 'connected';

  type Integration = {
    id: string;
    name: string;
    description: string;
    usecases: string[];
    status: IntegrationStatus;
    bgColor: string;
    textColor: string;
    badgeBg: string;
    badgeText: string;
    abbr: string;
  };

  let integrations = $state<Integration[]>([
    {
      id: 'tiktok',
      name: 'TikTok Shop',
      description: 'Sinkronkan pesanan, produk, dan stok dari toko TikTok Shop Anda secara otomatis.',
      usecases: ['Impor data pesanan masuk', 'Sinkronisasi stok produk', 'Laporan penjualan harian'],
      status: 'disconnected',
      bgColor: 'bg-[#010101]',
      textColor: 'text-white',
      badgeBg: 'bg-gray-100',
      badgeText: 'text-gray-600',
      abbr: 'Tk',
    },
    {
      id: 'shopee',
      name: 'Shopee Seller',
      description: 'Tarik data pesanan dan produk dari Shopee Seller Center untuk pengelolaan stok terpusat.',
      usecases: ['Impor data pesanan masuk', 'Sinkronisasi stok produk', 'Laporan penjualan harian'],
      status: 'disconnected',
      bgColor: 'bg-[#EE4D2D]',
      textColor: 'text-white',
      badgeBg: 'bg-orange-50',
      badgeText: 'text-orange-600',
      abbr: 'Sp',
    },
  ]);

  let toastMsg = $state<string | null>(null);
  function showToast(msg: string) {
    toastMsg = msg;
    setTimeout(() => (toastMsg = null), 3500);
  }

  function handleConnect(id: string) {
    showToast('Fitur integrasi sedang dalam pengembangan. Segera hadir!');
  }
</script>

<!-- ── Toast ──────────────────────────────────────────────────────── -->
{#if toastMsg}
  <div class="fixed right-5 top-5 z-50 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-lg">
    <svg class="h-4 w-4 shrink-0 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
    </svg>
    <p class="text-sm text-blue-800">{toastMsg}</p>
  </div>
{/if}

<div class="mx-auto w-full max-w-4xl space-y-6">

  <!-- ── Header ───────────────────────────────────────────────────── -->
  <div>
    <h1 class="text-lg font-semibold text-gray-900">Integrasi API</h1>
    <p class="mt-0.5 text-sm text-gray-500">
      Hubungkan platform marketplace untuk mengambil data pesanan dan stok secara otomatis.
    </p>
  </div>

  <!-- ── Integration Cards ────────────────────────────────────────── -->
  <div class="space-y-4">
    {#each integrations as item}
      <div class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">

        <!-- Top row: logo + name + status -->
        <div class="flex items-start gap-4">

          <!-- Logo -->
          <div
            class={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${item.bgColor} ${item.textColor}`}
          >
            {item.abbr}
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="font-semibold text-gray-900">{item.name}</p>
              <!-- Status badge -->
              <span
                class={`rounded-full px-2 py-0.5 text-[11px] font-medium ${item.badgeBg} ${item.badgeText}`}
              >
                {item.status === 'connected' ? 'Terhubung' : 'Belum Terhubung'}
              </span>
            </div>
            <p class="mt-0.5 text-sm text-gray-500">{item.description}</p>
          </div>
        </div>

        <!-- Use cases -->
        <ul class="mt-4 space-y-1.5 rounded-lg bg-gray-50 px-4 py-3">
          {#each item.usecases as uc}
            <li class="flex items-center gap-2 text-sm text-gray-600">
              <svg class="h-3.5 w-3.5 shrink-0 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              {uc}
            </li>
          {/each}
        </ul>

        <!-- Action -->
        <div class="mt-4 flex items-center justify-between">
          <p class="text-[11px] text-gray-400">
            {item.status === 'connected'
              ? 'Terhubung sejak — / — / —'
              : 'Belum ada koneksi aktif'}
          </p>
          <Button
            variant={item.status === 'connected' ? 'outline' : 'default'}
            onclick={() => handleConnect(item.id)}
          >
            {item.status === 'connected' ? 'Kelola Koneksi' : 'Hubungkan'}
          </Button>
        </div>
      </div>
    {/each}
  </div>

  <!-- ── Coming Soon notice ────────────────────────────────────────── -->
  <div class="flex items-start gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3.5">
    <svg class="mt-0.5 h-4 w-4 shrink-0 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
    </svg>
    <p class="text-sm text-gray-500">
      Fitur integrasi API sedang dalam tahap pengembangan. Fungsionalitas penghubungan akun dan sinkronisasi data akan tersedia dalam waktu dekat.
    </p>
  </div>

</div>
