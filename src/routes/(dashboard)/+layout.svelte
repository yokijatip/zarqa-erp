<script lang="ts">
  import { page } from '$app/stores';
  import AppSidebar from '$lib/components/app-sidebar.svelte';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';

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
    '/pengaturan':       [{ label: 'Pengaturan' }],
    '/pengaturan/profil': [{ label: 'Pengaturan', href: '/pengaturan' }, { label: 'Profil' }],
  };

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

    <main class="flex flex-1 flex-col gap-4 p-6">
      {@render children()}
    </main>
  </Sidebar.Inset>
</Sidebar.Provider>
