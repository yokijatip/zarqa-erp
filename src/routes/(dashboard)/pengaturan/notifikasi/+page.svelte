<script lang="ts">
  import { onMount } from 'svelte';
  import BellIcon from '@lucide/svelte/icons/bell';
  import CheckCircle2Icon from '@lucide/svelte/icons/circle-check';
  import InfoIcon from '@lucide/svelte/icons/info';
  import MonitorSmartphoneIcon from '@lucide/svelte/icons/monitor-smartphone';
  import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
  import SendIcon from '@lucide/svelte/icons/send';
  import { Button } from '$lib/components/ui/button';
  import { currentUser } from '$lib/stores/auth.store';
  import {
    DEFAULT_NOTIFICATION_SETTINGS,
    NOTIFICATION_DEFINITIONS,
    getBrowserNotificationPermission,
    loadNotificationSettings,
    requestBrowserNotificationPermission,
    resetNotificationSettings,
    saveNotificationSettings,
    sendBrowserNotification,
    type NotificationSettings,
  } from '$lib/stores/notification.store';

  let settings = $state<NotificationSettings>({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    items: { ...DEFAULT_NOTIFICATION_SETTINGS.items },
  });
  let loadedUid = $state<string | undefined>(undefined);
  let permission = $state<NotificationPermission | 'unsupported'>('unsupported');
  let saving = $state(false);
  let feedback = $state<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  function loadForUser(uid?: string) {
    settings = loadNotificationSettings(uid);
    loadedUid = uid;
    permission = getBrowserNotificationPermission();
  }

  onMount(() => loadForUser($currentUser?.uid));

  $effect(() => {
    const uid = $currentUser?.uid;
    if (uid && loadedUid !== uid) loadForUser(uid);
  });

  function showFeedback(type: 'success' | 'error' | 'info', text: string) {
    feedback = { type, text };
    window.setTimeout(() => (feedback = null), 3500);
  }

  async function handleBrowserToggle() {
    if (!settings.browser) {
      permission = getBrowserNotificationPermission();
      return;
    }

    permission = await requestBrowserNotificationPermission();
    if (permission !== 'granted') {
      settings.browser = false;
      showFeedback(
        'error',
        permission === 'denied'
          ? 'Izin browser ditolak. Izinkan notifikasi dari pengaturan browser.'
          : 'Izin notifikasi belum diberikan.',
      );
    }
  }

  function simpan() {
    saving = true;
    saveNotificationSettings(
      { ...settings, items: { ...settings.items } },
      $currentUser?.uid,
    );
    saving = false;
    showFeedback('success', 'Preferensi notifikasi tersimpan.');
  }

  function reset() {
    settings = resetNotificationSettings($currentUser?.uid);
    permission = getBrowserNotificationPermission();
    showFeedback('info', 'Preferensi dikembalikan ke pengaturan awal.');
  }

  function kirimUji() {
    if (!settings.enabled || !settings.browser) {
      showFeedback('info', 'Aktifkan notifikasi browser dan simpan pengaturan terlebih dahulu.');
      return;
    }
    if (permission !== 'granted') {
      showFeedback('error', 'Izin notifikasi browser belum aktif.');
      return;
    }
    const sent = sendBrowserNotification('Zarqa ERP', 'Notifikasi browser berhasil diaktifkan.');
    showFeedback(sent ? 'success' : 'error', sent ? 'Notifikasi uji terkirim.' : 'Notifikasi uji gagal dikirim.');
  }

  const permissionLabel = $derived(
    permission === 'granted'
      ? 'Diizinkan'
      : permission === 'denied'
        ? 'Diblokir browser'
        : permission === 'unsupported'
          ? 'Tidak didukung'
          : 'Belum diatur',
  );
</script>

<div class="mx-auto w-full max-w-4xl space-y-6">
  <div>
    <h1 class="text-lg font-semibold text-gray-900">Notifikasi</h1>
    <p class="mt-0.5 text-sm text-gray-500">Atur pemberitahuan operasional dan kanal pengirimannya.</p>
  </div>

  {#if feedback}
    <div
      class={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
        feedback.type === 'success'
          ? 'border-green-200 bg-green-50 text-green-700'
          : feedback.type === 'error'
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-blue-200 bg-blue-50 text-blue-700'
      }`}
      role="status"
    >
      {#if feedback.type === 'success'}
        <CheckCircle2Icon class="mt-0.5 h-4 w-4 shrink-0" />
      {:else}
        <InfoIcon class="mt-0.5 h-4 w-4 shrink-0" />
      {/if}
      <span>{feedback.text}</span>
    </div>
  {/if}

  <section class="rounded-xl border border-gray-100 bg-white shadow-sm">
    <div class="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
      <div class="flex items-start gap-3">
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <BellIcon class="h-4 w-4" />
        </div>
        <div>
          <h2 class="text-sm font-semibold text-gray-900">Notifikasi aplikasi</h2>
          <p class="mt-0.5 text-xs text-gray-500">Kontrol utama untuk semua pemberitahuan Zarqa ERP.</p>
        </div>
      </div>
      <label class="relative mt-1 inline-flex shrink-0 cursor-pointer items-center">
        <span class="sr-only">Aktifkan semua notifikasi</span>
        <input type="checkbox" class="peer sr-only" bind:checked={settings.enabled} />
        <span class="h-6 w-11 rounded-full bg-gray-200 transition-colors peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/40"></span>
        <span class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"></span>
      </label>
    </div>

    <div class="divide-y divide-gray-100">
      {#each NOTIFICATION_DEFINITIONS as item}
        <label class={`flex items-start gap-4 px-5 py-4 transition-colors hover:bg-gray-50 ${!settings.enabled ? 'opacity-55' : ''}`}>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-gray-800">{item.label}</p>
            <p class="mt-0.5 text-xs leading-5 text-gray-500">{item.description}</p>
          </div>
          <input
            type="checkbox"
            class="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            bind:checked={settings.items[item.id]}
            disabled={!settings.enabled}
          />
        </label>
      {/each}
    </div>
  </section>

  <section class="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div class="mb-4 flex items-start gap-3">
      <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
        <MonitorSmartphoneIcon class="h-4 w-4" />
      </div>
      <div>
        <h2 class="text-sm font-semibold text-gray-900">Kanal notifikasi</h2>
        <p class="mt-0.5 text-xs text-gray-500">Pilih tempat pemberitahuan ditampilkan.</p>
      </div>
    </div>

    <div class="space-y-3">
      <label class="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
        <div>
          <p class="text-sm font-medium text-gray-800">Dalam aplikasi</p>
          <p class="mt-0.5 text-xs text-gray-500">Pemberitahuan di area aplikasi saat modul terkait tersedia.</p>
        </div>
        <input type="checkbox" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" bind:checked={settings.inApp} />
      </label>

      <label class="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
        <div>
          <p class="text-sm font-medium text-gray-800">Browser</p>
          <p class="mt-0.5 text-xs text-gray-500">Tampilkan notifikasi meski tab tidak sedang aktif.</p>
        </div>
        <input
          type="checkbox"
          class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          bind:checked={settings.browser}
          onchange={handleBrowserToggle}
          disabled={permission === 'unsupported'}
        />
      </label>
    </div>

    <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
      <p class="text-xs text-gray-500">Status izin browser: <span class="font-medium text-gray-700">{permissionLabel}</span></p>
      <Button variant="outline" size="sm" onclick={kirimUji} disabled={!settings.browser || permission !== 'granted'}>
        <SendIcon class="h-4 w-4" />
        Kirim notifikasi uji
      </Button>
    </div>
  </section>

  <div class="flex flex-wrap items-center justify-between gap-3">
    <Button variant="ghost" size="sm" onclick={reset}>
      <RotateCcwIcon class="h-4 w-4" />
      Kembalikan awal
    </Button>
    <Button onclick={simpan} disabled={saving} class="min-w-[140px]">
      {#if saving}
        Menyimpan...
      {:else}
        <CheckCircle2Icon class="h-4 w-4" />
        Simpan perubahan
      {/if}
    </Button>
  </div>
</div>
