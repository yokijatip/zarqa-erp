<script lang="ts">
  import { page } from '$app/stores';
  import { currentUser, isGudangAccess, isKaryawanManager } from '$lib/stores/auth.store';
  import { ROLE_LABEL } from '$lib/firebase/karyawan';
  import SettingsIcon from '@lucide/svelte/icons/settings';
  import UserCircleIcon from '@lucide/svelte/icons/user-circle';
  import UsersIcon from '@lucide/svelte/icons/users';
  import PaletteIcon from '@lucide/svelte/icons/palette';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

  let { children } = $props();

  type MenuItem = {
    label: string;
    hint: string;
    href: string;
    icon: typeof SettingsIcon;
    exact?: boolean;
    visible: boolean;
  };

  let menuItems = $derived.by((): MenuItem[] => {
    const items: MenuItem[] = [
      {
        label: 'Ikhtisar',
        hint: 'Ringkasan menu pengaturan',
        href: '/pengaturan',
        icon: SettingsIcon,
        exact: true,
        visible: true,
      },
      {
        label: 'Profil Saya',
        hint: 'Nama, email, dan password',
        href: '/pengaturan/profil',
        icon: UserCircleIcon,
        visible: true,
      },
      {
        label: 'Manajemen Pengguna',
        hint: 'Kelola akun karyawan',
        href: '/karyawan/data',
        icon: UsersIcon,
        visible: $isKaryawanManager,
      },
      {
        label: 'Master Warna',
        hint: 'Atur warna model baju',
        href: '/warna',
        icon: PaletteIcon,
        visible: $isGudangAccess,
      },
    ];
    return items.filter((item) => item.visible);
  });

  function isActiveItem(item: MenuItem): boolean {
    const pathname = $page.url.pathname;
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + '/');
  }
</script>

<section class="space-y-4">
  <div>
    <h1 class="text-xl font-semibold text-gray-900">Pengaturan</h1>
    <p class="mt-0.5 text-sm text-gray-500">Kelola profil, pengguna, dan data master sistem</p>
  </div>

  <div class="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
    <aside class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      {#if $currentUser}
        <div class="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
          <p class="text-sm font-semibold text-gray-900">{$currentUser.name}</p>
          <p class="truncate text-xs text-gray-500">{$currentUser.email}</p>
          <span class="mt-2 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
            {ROLE_LABEL[$currentUser.role] ?? $currentUser.role}
          </span>
        </div>
      {/if}

      <nav class="space-y-1">
        {#each menuItems as item}
          <a
            href={item.href}
            aria-current={isActiveItem(item) ? 'page' : undefined}
            class={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
              isActiveItem(item)
                ? 'bg-gray-900 text-white'
                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <item.icon class="h-4 w-4 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{item.label}</p>
              <p class={`truncate text-[11px] ${isActiveItem(item) ? 'text-gray-200' : 'text-gray-500'}`}>
                {item.hint}
              </p>
            </div>
            <ChevronRightIcon class={`h-4 w-4 shrink-0 ${isActiveItem(item) ? 'text-gray-200' : 'text-gray-400'}`} />
          </a>
        {/each}
      </nav>
    </aside>

    <div class="min-h-[540px] rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
      {@render children()}
    </div>
  </div>
</section>
