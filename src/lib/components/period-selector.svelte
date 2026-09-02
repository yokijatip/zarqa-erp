<script lang="ts">
  import * as Popover from '$lib/components/ui/popover';
  import CalendarIcon from '@lucide/svelte/icons/calendar';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import CheckIcon from '@lucide/svelte/icons/check';
  import { type Period, type DateRange, PERIOD_LABEL, getPeriodRange } from '$lib/period';

  type PeriodOrCustom = Period | 'custom';

  let {
    dateRange = $bindable<DateRange>(null),
    defaultPeriod = 'bulan_ini' as PeriodOrCustom,
  }: {
    dateRange: DateRange;
    defaultPeriod?: PeriodOrCustom;
  } = $props();

  let open       = $state(false);
  let period     = $state<PeriodOrCustom>(defaultPeriod);
  let customStart = $state('');
  let customEnd   = $state('');

  // Sync dateRange ke parent saat preset berubah
  $effect(() => {
    if (period !== 'custom') {
      dateRange = getPeriodRange(period as Period);
    }
  });

  // Keep the label in sync when a parent changes the bound range externally.
  $effect(() => {
    const range = dateRange;
    if (!range) {
      if (period !== 'semua') period = 'semua';
      customStart = '';
      customEnd = '';
      return;
    }

    const matchingPreset = PRESETS.find((preset) => {
      const presetRange = getPeriodRange(preset.value);
      return presetRange?.start.getTime() === range.start.getTime() && presetRange.end.getTime() === range.end.getTime();
    });
    if (matchingPreset) {
      if (period !== matchingPreset.value) period = matchingPreset.value;
      customStart = '';
      customEnd = '';
      return;
    }

    if (period !== 'custom') period = 'custom';
    const inputDate = (value: Date) => {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    customStart = inputDate(range.start);
    customEnd = inputDate(range.end);
  });

  function selectPreset(p: Period) {
    period = p;
    open = false;
  }

  function applyCustom() {
    if (!customStart || !customEnd || customStart > customEnd) return;
    period = 'custom';
    dateRange = {
      start: new Date(customStart + 'T00:00:00'),
      end:   new Date(customEnd   + 'T23:59:59.999'),
    };
    open = false;
  }

  let canApply = $derived(
    !!customStart && !!customEnd && customStart <= customEnd,
  );

  let triggerLabel = $derived.by(() => {
    if (period === 'custom' && customStart && customEnd) {
      const fmt = (s: string) =>
        new Date(s + 'T00:00:00').toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
          year: '2-digit',
        });
      return `${fmt(customStart)} – ${fmt(customEnd)}`;
    }
    if (period === 'custom') return 'Custom';
    return PERIOD_LABEL[period as Period];
  });

  const PRESETS: { value: Period; label: string }[] = [
    { value: 'hari_ini',   label: 'Hari Ini' },
    { value: 'minggu_ini', label: 'Minggu Ini' },
    { value: 'bulan_ini',  label: 'Bulan Ini' },
    { value: 'tahun_ini',  label: 'Tahun Ini' },
    { value: 'semua',      label: 'Semua Data' },
  ];
</script>

<Popover.Root bind:open>
  <!-- ── Trigger ──────────────────────────────────────────────────── -->
  <Popover.Trigger
    class="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-sm text-gray-700 shadow-xs transition-colors hover:bg-gray-50 focus:outline-none"
  >
    <CalendarIcon class="h-3.5 w-3.5 shrink-0 text-gray-400" />
    <span class="max-w-36 truncate font-medium">{triggerLabel}</span>
    <ChevronDownIcon
      class="h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform {open ? 'rotate-180' : ''}"
    />
  </Popover.Trigger>

  <!-- ── Content ──────────────────────────────────────────────────── -->
  <Popover.Content
    align="start"
    sideOffset={6}
    class="w-48 p-1.5"
  >
    <!-- Preset list -->
    <div class="space-y-px">
      {#each PRESETS as preset (preset.value)}
        <button
          onclick={() => selectPreset(preset.value)}
          class="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-gray-100
            {period === preset.value
              ? 'bg-gray-100 font-semibold text-gray-900'
              : 'font-normal text-gray-700'}"
        >
          {preset.label}
          {#if period === preset.value}
            <CheckIcon class="h-3.5 w-3.5 text-blue-600" />
          {/if}
        </button>
      {/each}
    </div>

    <!-- Divider -->
    <div class="my-1.5 border-t border-gray-100"></div>

    <!-- Custom range -->
    <div class="px-1 pb-0.5">
      <p class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        Custom Range
      </p>
      <div class="space-y-1.5">
        <div>
          <label for="period-start" class="mb-0.5 block text-[11px] text-gray-500">Dari</label>
          <input
            id="period-start"
            type="date"
            bind:value={customStart}
            class="h-7 w-full rounded-md border border-gray-200 px-2 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
          />
        </div>
        <div>
          <label for="period-end" class="mb-0.5 block text-[11px] text-gray-500">Sampai</label>
          <input
            id="period-end"
            type="date"
            bind:value={customEnd}
            min={customStart}
            class="h-7 w-full rounded-md border border-gray-200 px-2 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
          />
        </div>
        <button
          onclick={applyCustom}
          disabled={!canApply}
          class="mt-0.5 w-full rounded-md bg-gray-900 py-1 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Terapkan
        </button>
      </div>
    </div>
  </Popover.Content>
</Popover.Root>
