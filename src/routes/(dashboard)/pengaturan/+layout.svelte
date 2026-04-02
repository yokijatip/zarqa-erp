<script lang="ts">
  import { page } from '$app/stores';
  import { currentUser, isOwnerOrDev } from '$lib/stores/auth.store';
  import { ROLE_LABEL } from '$lib/firebase/karyawan';
  import UserCircleIcon from '@lucide/svelte/icons/user-circle';
  import BellIcon from '@lucide/svelte/icons/bell';
  import GlobeIcon from '@lucide/svelte/icons/globe';
  import MonitorIcon from '@lucide/svelte/icons/monitor';
  import LinkIcon from '@lucide/svelte/icons/link';
  import DatabaseIcon from '@lucide/svelte/icons/database';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

  let { children } = $props();

  type MenuItem = {
    label: string;
    hint: string;
    href: string;
    icon: typeof UserCircleIcon;
    visible: boolean;
    danger?: boolean;
  };

  let menuItems = $derived.by((): MenuItem[] => {
    const items: MenuItem[] = [
      {
        label: 'Profil Saya',
        hint: '',
        href: '/pengaturan/profil',
        icon: UserCircleIcon,
        visible: true,
      },
      {
        label: 'Notifikasi',
        hint: '',
        href: '/pengaturan/notifikasi',
        icon: BellIcon,
        visible: true,
      },
      {
        label: 'Bahasa & Wilayah',
        hint: '',
        href: '/pengaturan/bahasa',
        icon: GlobeIcon,
        visible: true,
      },
      {
        label: 'Tampilan',
        hint: '',
        href: '/pengaturan/tampilan',
        icon: MonitorIcon,
        visible: true,
      },
      {
        label: 'Integrasi API',
        hint: '',
        href: '/pengaturan/integrasi',
        icon: LinkIcon,
        visible: true,
      },
      {
        label: 'Flushing Database',
        hint: '',
        href: '/pengaturan/flushing',
        icon: DatabaseIcon,
        visible: $isOwnerOrDev,
        danger: true,
      },
    ];
    return items.filter((item) => item.visible);
  });

  function isActive(href: string): boolean {
    const pathname = $page.url.pathname;
    return pathname === href || pathname.startsWith(href + '/');
  }

  function getInitials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
  }
</script>

<div class="flex min-h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

  <!-- ── Left: Settings Sidebar ──────────────────────────────────── -->
  <aside class="flex w-[230px] shrink-0 flex-col border-r border-gray-100">

    <!-- Section label -->
    <div class="border-b border-gray-100 px-5 py-4">
      <p class="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Pengaturan</p>
    </div>

    <!-- User card -->
    {#if $currentUser}
      <div class="border-b border-gray-100 px-4 py-4">
        <div class="flex items-center gap-3">
          {#if $currentUser.photoURL}
            <img src={$currentUser.photoURL} alt="Foto profil" class="h-9 w-9 shrink-0 rounded-full object-cover" />
          {:else}
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold text-white">
              {getInitials($currentUser.name)}
            </div>
          {/if}
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-gray-900">{$currentUser.name}</p>
            <p class="truncate text-[11px] text-gray-500">{$currentUser.email}</p>
          </div>
        </div>
        <span
          class="mt-2.5 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
        >
          {ROLE_LABEL[$currentUser.role] ?? $currentUser.role}
        </span>
      </div>
    {/if}

    <!-- Nav -->
    <nav class="flex-1 space-y-0.5 p-3">
      {#each menuItems as item}
        <a
          href={item.href}
          aria-current={isActive(item.href) ? 'page' : undefined}
          class={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
            isActive(item.href)
              ? item.danger ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'
              : item.danger
                ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <item.icon class="h-4 w-4 shrink-0" />
          <p class="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</p>
          <ChevronRightIcon
            class={`h-3.5 w-3.5 shrink-0 ${isActive(item.href) ? 'text-gray-400' : 'text-gray-300'}`}
          />
        </a>
      {/each}
    </nav>
  </aside>

  <!-- ── Right: Content Area ─────────────────────────────────────── -->
  <div class="flex-1 overflow-y-auto p-6 sm:p-8">
    {@render children()}
  </div>
</div>
