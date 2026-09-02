<script lang="ts">
  import { page } from '$app/stores';
  import AppSidebar from '$lib/components/app-sidebar.svelte';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
  import { userRole } from '$lib/stores/auth.store';
  import { ROLE_LABEL } from '$lib/firebase/karyawan';
  import LockIcon from '@lucide/svelte/icons/lock-keyhole';
  import type { UserRole } from '$lib/types';

  let { children } = $props();

  type Crumb = { label: string; href?: string };

  const ROUTE_MAP: Record<string, Crumb[]> = {
    '/dashboard':        [{ label: 'Dashboard' }],
    '/gudang':           [{ label: 'Gudang' }],
    '/stok-kain':        [{ label: 'Gudang', href: '/gudang' }, { label: 'Stok Kain' }],
    '/model-baju':       [{ label: 'Gudang', href: '/gudang' }, { label: 'Model Baju' }],
    '/monitor-produksi': [{ label: 'Monitor Produksi' }],
    '/produksi/cutting': [{ label: 'Monitor Produksi', href: '/monitor-produksi' }, { label: 'Produksi Cutting' }],
    '/produksi/jahit':   [{ label: 'Monitor Produksi', href: '/monitor-produksi' }, { label: 'Produksi Jahit' }],
    '/produksi/steam':   [{ label: 'Monitor Produksi', href: '/monitor-produksi' }, { label: 'Produksi Steam' }],
    '/stok-potongan':    [{ label: 'Gudang', href: '/gudang' }, { label: 'Stok Potongan' }],
    '/barang-jadi':      [{ label: 'Gudang', href: '/gudang' }, { label: 'Barang Jadi' }],
    '/barang-keluar':    [{ label: 'Gudang', href: '/gudang' }, { label: 'Barang Keluar' }],
    '/barang-keluar/catat': [{ label: 'Gudang', href: '/gudang' }, { label: 'Barang Keluar', href: '/barang-keluar' }, { label: 'Input' }],
    '/keuangan':         [{ label: 'Keuangan' }],
    '/keuangan/budget':  [{ label: 'Keuangan', href: '/keuangan' }, { label: 'Budget Bulanan' }],
    '/laporan':          [{ label: 'Laporan' }],
    '/laporan/aktivitas': [{ label: 'Laporan', href: '/laporan' }, { label: 'Aktivitas Akun' }],
    '/penjualan':        [{ label: 'Penjualan' }],
    '/penjualan/order':  [{ label: 'Penjualan', href: '/penjualan' }, { label: 'Order Penjualan' }],
    '/penjualan/buyer':  [{ label: 'Penjualan', href: '/penjualan' }, { label: 'Data Buyer' }],
    '/karyawan':         [{ label: 'Karyawan' }],
    '/karyawan/data':    [{ label: 'Karyawan', href: '/karyawan' }, { label: 'Data Karyawan' }],
    '/karyawan/penggajian': [{ label: 'Karyawan', href: '/karyawan' }, { label: 'Penggajian' }],
    '/pengaturan':       [{ label: 'Pengaturan' }],
    '/pengaturan/profil': [{ label: 'Pengaturan', href: '/pengaturan' }, { label: 'Profil' }],
  };

  const SUPER_ROLES: UserRole[] = ['owner', 'developer'];
  const WEB_ROLES: UserRole[] = ['admin_gudang', 'admin_hr', 'admin_keuangan', 'owner', 'developer'];

  function hasRole(role: UserRole | null, allowed: UserRole[]): boolean {
    return !!role && (allowed.includes(role) || SUPER_ROLES.includes(role));
  }

  function canAccess(pathname: string, role: UserRole | null): boolean {
    if (!role) return false;
    if (SUPER_ROLES.includes(role)) return true;
    if (!WEB_ROLES.includes(role)) return false;

    if (pathname === '/dashboard' || pathname === '/') return true;
    if (pathname.startsWith('/pengaturan/flushing')) return false;
    if (pathname.startsWith('/keuangan/budget')) return false;
    if (pathname.startsWith('/pengaturan')) return true;

    if (
      pathname.startsWith('/gudang') ||
      pathname.startsWith('/stok-kain') ||
      pathname.startsWith('/model-baju') ||
      pathname.startsWith('/stok-potongan') ||
      pathname.startsWith('/barang-jadi') ||
      pathname.startsWith('/barang-keluar') ||
      pathname.startsWith('/monitor-produksi') ||
      pathname.startsWith('/produksi')
    ) {
      return hasRole(role, ['admin_gudang']);
    }

    if (pathname.startsWith('/penjualan')) {
      return hasRole(role, ['admin_gudang', 'admin_keuangan']);
    }

    if (pathname.startsWith('/keuangan')) {
      return hasRole(role, ['admin_keuangan']);
    }

    if (pathname.startsWith('/karyawan')) {
      return hasRole(role, ['admin_hr']);
    }

    if (pathname.startsWith('/laporan/aktivitas')) {
      return hasRole(role, ['owner', 'developer']);
    }

    if (pathname.startsWith('/laporan')) {
      return hasRole(role, ['admin_hr', 'admin_keuangan']);
    }

    return true;
  }

  const accessAllowed = $derived(canAccess($page.url.pathname, $userRole));
  const roleName = $derived($userRole ? (ROLE_LABEL[$userRole] ?? $userRole) : '-');

  let crumbs = $derived.by((): Crumb[] => {
    const pathname = $page.url.pathname;
    if (ROUTE_MAP[pathname]) return ROUTE_MAP[pathname];
    // Handle dynamic routes like /model-baju/[id]
    const base = Object.keys(ROUTE_MAP).find(
      (k) => k !== '/' && pathname.startsWith(k + '/')
    );
    if (base) return [...ROUTE_MAP[base], { label: 'Detail' }];
    return [{ label: 'Halaman' }];
  });
</script>

<Sidebar.Provider>
  <AppSidebar />
  <Sidebar.Inset>
    <header class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <Sidebar.Trigger class="-ms-1" />
      <Separator orientation="vertical" class="me-2 data-[orientation=vertical]:h-4" />

      <Breadcrumb.Root>
        <Breadcrumb.List>
          {#each crumbs as crumb, i}
            {#if i < crumbs.length - 1}
              <Breadcrumb.Item>
                {#if crumb.href}
                  <Breadcrumb.Link href={crumb.href}>{crumb.label}</Breadcrumb.Link>
                {:else}
                  <span class="text-sm text-muted-foreground">{crumb.label}</span>
                {/if}
              </Breadcrumb.Item>
              <Breadcrumb.Separator />
            {:else}
              <Breadcrumb.Item>
                <Breadcrumb.Page>{crumb.label}</Breadcrumb.Page>
              </Breadcrumb.Item>
            {/if}
          {/each}
        </Breadcrumb.List>
      </Breadcrumb.Root>
    </header>

    <main class="flex min-w-0 flex-1 flex-col gap-4 overflow-x-hidden p-6">
      {#if accessAllowed}
        {@render children()}
      {:else}
        <div class="flex min-h-[60vh] items-center justify-center">
          <div class="max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
              <LockIcon class="h-7 w-7" />
            </div>
            <h1 class="mt-4 text-xl font-semibold text-gray-900">Tidak Bisa Akses</h1>
            <p class="mt-2 text-sm leading-6 text-gray-500">
              Role kamu saat ini <span class="font-semibold text-gray-700">{roleName}</span>.
              Halaman ini hanya bisa dibuka oleh role yang punya otoritas.
            </p>
            <a
              href="/dashboard"
              class="mt-5 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Kembali ke Dashboard
            </a>
          </div>
        </div>
      {/if}
    </main>
  </Sidebar.Inset>
</Sidebar.Provider>
