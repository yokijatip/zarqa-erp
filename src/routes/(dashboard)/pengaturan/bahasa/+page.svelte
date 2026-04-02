<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Select from '$lib/components/ui/select';
  import {
    loadLocale, saveLocale,
    type Bahasa, type ZonaWaktu, type FormatTanggal, type FormatAngka,
  } from '$lib/stores/locale.store';

  const stored = loadLocale();

  let bahasa  = $state<Bahasa>(stored.bahasa);
  let zona    = $state<ZonaWaktu>(stored.zona);
  let tanggal = $state<FormatTanggal>(stored.tanggal);
  let angka   = $state<FormatAngka>(stored.angka);

  let saved = $state(false);

  function simpan() {
    saveLocale({ bahasa, zona, tanggal, angka });
    saved = true;
    setTimeout(() => (saved = false), 2500);
  }

  // ── Label maps ──────────────────────────────────────────────────────
  const bahasaOpts: { value: Bahasa; label: string }[] = [
    { value: 'id', label: 'Bahasa Indonesia' },
    { value: 'en', label: 'English' },
  ];

  const zonaOpts: { value: ZonaWaktu; label: string }[] = [
    { value: 'Asia/Jakarta',  label: 'WIB — Waktu Indonesia Barat (UTC+7)' },
    { value: 'Asia/Makassar', label: 'WITA — Waktu Indonesia Tengah (UTC+8)' },
    { value: 'Asia/Jayapura', label: 'WIT — Waktu Indonesia Timur (UTC+9)' },
  ];

  const tanggalOpts: { value: FormatTanggal; label: string }[] = [
    { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY — contoh: 13/03/2026' },
    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY — contoh: 03/13/2026' },
    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD — contoh: 2026-03-13' },
  ];

  const angkaOpts: { value: FormatAngka; label: string }[] = [
    { value: 'id', label: '1.000,50 — titik ribuan, koma desimal' },
    { value: 'en', label: '1,000.50 — koma ribuan, titik desimal' },
  ];

  // ── Teks UI dinamis (id / en) ────────────────────────────────────────
  const ui = $derived(bahasa === 'en' ? {
    title:       'Language & Region',
    subtitle:    'Customize the display language, time zone, and data formats.',
    labelBahasa: 'Display Language',
    labelZona:   'Time Zone',
    labelTanggal:'Date Format',
    labelAngka:  'Number Format',
    note:        '* These settings will be applied throughout the system.',
    btnSave:     'Save',
    btnSaved:    '✓ Saved',
  } : {
    title:       'Bahasa & Wilayah',
    subtitle:    'Sesuaikan bahasa tampilan, zona waktu, dan format data.',
    labelBahasa: 'Bahasa Tampilan',
    labelZona:   'Zona Waktu',
    labelTanggal:'Format Tanggal',
    labelAngka:  'Format Angka',
    note:        '* Pengaturan ini akan diterapkan di seluruh tampilan sistem.',
    btnSave:     'Simpan',
    btnSaved:    '✓ Tersimpan',
  });
</script>

<div class="mx-auto max-w-xl space-y-6">

  <div>
    <h1 class="text-lg font-semibold text-gray-900">{ui.title}</h1>
    <p class="mt-0.5 text-sm text-gray-500">{ui.subtitle}</p>
  </div>

  <div class="space-y-4 rounded-xl border border-gray-100 bg-white p-5">

    <!-- Bahasa -->
    <div class="space-y-1.5">
      <label class="block text-sm font-medium text-gray-700">{ui.labelBahasa}</label>
      <Select.Root
        type="single"
        value={bahasa}
        onValueChange={(v) => (bahasa = v as Bahasa)}
      >
        <Select.Trigger class="w-full">
          {bahasaOpts.find((o) => o.value === bahasa)?.label}
        </Select.Trigger>
        <Select.Content>
          {#each bahasaOpts as opt}
            <Select.Item value={opt.value}>{opt.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <!-- Zona Waktu -->
    <div class="space-y-1.5">
      <label class="block text-sm font-medium text-gray-700">{ui.labelZona}</label>
      <Select.Root
        type="single"
        value={zona}
        onValueChange={(v) => (zona = v as ZonaWaktu)}
      >
        <Select.Trigger class="w-full">
          {zonaOpts.find((o) => o.value === zona)?.label}
        </Select.Trigger>
        <Select.Content>
          {#each zonaOpts as opt}
            <Select.Item value={opt.value}>{opt.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <!-- Format Tanggal -->
    <div class="space-y-1.5">
      <label class="block text-sm font-medium text-gray-700">{ui.labelTanggal}</label>
      <Select.Root
        type="single"
        value={tanggal}
        onValueChange={(v) => (tanggal = v as FormatTanggal)}
      >
        <Select.Trigger class="w-full">
          {tanggalOpts.find((o) => o.value === tanggal)?.label}
        </Select.Trigger>
        <Select.Content>
          {#each tanggalOpts as opt}
            <Select.Item value={opt.value}>{opt.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <!-- Format Angka -->
    <div class="space-y-1.5">
      <label class="block text-sm font-medium text-gray-700">{ui.labelAngka}</label>
      <Select.Root
        type="single"
        value={angka}
        onValueChange={(v) => (angka = v as FormatAngka)}
      >
        <Select.Trigger class="w-full">
          {angkaOpts.find((o) => o.value === angka)?.label}
        </Select.Trigger>
        <Select.Content>
          {#each angkaOpts as opt}
            <Select.Item value={opt.value}>{opt.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

  </div>

  <div class="flex items-center justify-between">
    <p class="text-xs text-gray-400">{ui.note}</p>
    <Button onclick={simpan} class="min-w-[120px]">
      {saved ? ui.btnSaved : ui.btnSave}
    </Button>
  </div>

</div>
