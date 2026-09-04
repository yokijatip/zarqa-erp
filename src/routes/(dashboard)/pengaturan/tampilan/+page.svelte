<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { applySettings, loadSettings, saveSettings, type Tema, type Densitas } from '$lib/stores/display.store';

  // Load dari localStorage saat halaman dibuka
  const stored = loadSettings();

  let tema     = $state<Tema>(stored.tema);
  let densitas = $state<Densitas>(stored.densitas);
  let animasi  = $state<boolean>(stored.animasi);

  let saved = $state(false);

  $effect(() => {
    applySettings({ tema, densitas, animasi });
  });

  function simpan() {
    saveSettings({ tema, densitas, animasi });
    saved = true;
    setTimeout(() => (saved = false), 2500);
  }

  const temaOptions: { value: Tema; label: string; desc: string }[] = [
    { value: 'light',  label: 'Terang',  desc: 'Latar putih' },
    { value: 'dark',   label: 'Gelap',   desc: 'Latar gelap' },
    { value: 'system', label: 'Sistem',  desc: 'Ikuti perangkat' },
  ];

  const densitasOptions: { value: Densitas; label: string; desc: string }[] = [
    { value: 'default', label: 'Default', desc: 'Jarak & font normal' },
    { value: 'compact', label: 'Kompak',  desc: 'Lebih rapat, lebih banyak konten' },
  ];
</script>

<div class="mx-auto w-full max-w-4xl space-y-6">

  <div>
    <h1 class="text-lg font-semibold text-gray-900">Tampilan</h1>
    <p class="mt-0.5 text-sm text-gray-500">Sesuaikan tema, kepadatan, dan animasi sistem.</p>
  </div>

  <!-- ── Tema ─────────────────────────────────────────────────────── -->
  <div class="rounded-xl border border-gray-100 bg-white p-5">
    <h2 class="mb-3 text-sm font-semibold text-gray-800">Tema Warna</h2>
    <div class="grid grid-cols-3 gap-2">
      {#each temaOptions as opt}
        <button
          type="button"
          onclick={() => (tema = opt.value)}
          class={`rounded-xl border-2 p-3 text-left transition-colors ${
            tema === opt.value
              ? 'border-gray-900 bg-gray-900 text-white'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
          }`}
        >
          <!-- Mini preview -->
          <div class={`mb-2 h-8 w-full rounded-md border ${
            opt.value === 'light'  ? 'bg-white border-gray-200' :
            opt.value === 'dark'   ? 'bg-gray-900 border-gray-700' :
            'bg-gradient-to-r from-white to-gray-900 border-gray-300'
          }`}></div>
          <p class="text-sm font-medium">{opt.label}</p>
          <p class={`text-[11px] ${tema === opt.value ? 'text-gray-300' : 'text-gray-400'}`}>
            {opt.desc}
          </p>
        </button>
      {/each}
    </div>
  </div>

  <!-- ── Densitas ──────────────────────────────────────────────────── -->
  <div class="rounded-xl border border-gray-100 bg-white p-5">
    <h2 class="mb-3 text-sm font-semibold text-gray-800">Kepadatan Tampilan</h2>
    <div class="grid grid-cols-2 gap-2">
      {#each densitasOptions as opt}
        <button
          type="button"
          onclick={() => (densitas = opt.value)}
          class={`rounded-xl border-2 p-3 text-left transition-colors ${
            densitas === opt.value
              ? 'border-gray-900 bg-gray-900 text-white'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
          }`}
        >
          <!-- Mini preview lines -->
          <div class="mb-2 space-y-1">
            {#each Array(opt.value === 'compact' ? 4 : 3) as _}
              <div class={`rounded ${opt.value === 'compact' ? 'h-1.5' : 'h-2'} ${densitas === opt.value ? 'bg-gray-600' : 'bg-gray-200'}`}></div>
            {/each}
          </div>
          <p class="text-sm font-medium">{opt.label}</p>
          <p class={`text-[11px] ${densitas === opt.value ? 'text-gray-300' : 'text-gray-400'}`}>
            {opt.desc}
          </p>
        </button>
      {/each}
    </div>
  </div>

  <!-- ── Animasi ───────────────────────────────────────────────────── -->
  <div class="rounded-xl border border-gray-100 bg-white p-5">
    <h2 class="mb-3 text-sm font-semibold text-gray-800">Lainnya</h2>
    <label class="flex cursor-pointer items-center justify-between">
      <div>
        <p class="text-sm font-medium text-gray-800">Animasi & Transisi</p>
        <p class="mt-0.5 text-xs text-gray-500">
          Nonaktifkan jika tampilan terasa lambat atau ingin hemat baterai.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={animasi}
        onclick={() => (animasi = !animasi)}
        class={`relative ml-4 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none ${animasi ? 'bg-gray-900' : 'bg-gray-200'}`}
      >
        <span
          class={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${animasi ? 'translate-x-5' : 'translate-x-0'}`}
        ></span>
      </button>
    </label>
  </div>

  <!-- ── Simpan ────────────────────────────────────────────────────── -->
  <div class="flex items-center justify-between">
    <p class="text-xs text-gray-400">Perubahan diterapkan langsung ke seluruh halaman.</p>
    <Button onclick={simpan} class="min-w-[120px]">
      {#if saved}
        ✓ Tersimpan
      {:else}
        Simpan
      {/if}
    </Button>
  </div>

</div>
