<!-- src/lib/components/nav-main.svelte -->
<script lang="ts">
  import { page } from "$app/stores";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import type { Component } from "svelte";

  type NavItem = {
    title: string;
    url: string;
    icon: Component;
    isActive?: boolean;
    comingSoon?: boolean;
    items?: { title: string; url: string }[];
  };

  let { items }: { items: NavItem[] } = $props();

  // Cek apakah item atau salah satu sub-itemnya aktif
  function isGroupActive(item: NavItem): boolean {
    if ($page.url.pathname === item.url) return true;
    return (
      item.items?.some((sub) => $page.url.pathname.startsWith(sub.url)) ?? false
    );
  }
</script>

<Sidebar.Group>
  <Sidebar.GroupLabel>Platform</Sidebar.GroupLabel>
  <Sidebar.Menu>
    {#each items as item}
      {#if !item.items || item.items.length === 0}
        <!-- Menu tanpa submenu: langsung navigasi -->
        <Sidebar.MenuItem>
          <Sidebar.MenuButton
            isActive={$page.url.pathname === item.url}
            tooltipContent={item.title}
          >
            {#snippet child({ props })}
              <a href={item.url} {...props}>
                <item.icon />
                <span>{item.title}</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      {:else}
        <!-- Menu dengan submenu: collapsible -->
        <Collapsible.Root open={isGroupActive(item)} class="group/collapsible">
          <Sidebar.MenuItem>
            <div class="flex w-full items-center">
              <!-- Klik judul/icon → navigasi ke url -->
              <Sidebar.MenuButton
                isActive={isGroupActive(item)}
                tooltipContent={item.title}
                class="flex-1"
              >
                {#snippet child({ props })}
                  <a
                    href={item.comingSoon ? undefined : item.url}
                    class:pointer-events-none={item.comingSoon}
                    class:opacity-60={item.comingSoon}
                    {...props}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                    {#if item.comingSoon}
                      <Badge
                        variant="secondary"
                        class="ml-auto text-[10px] py-0">Soon</Badge
                      >
                    {/if}
                  </a>
                {/snippet}
              </Sidebar.MenuButton>

              <!-- Klik panah → toggle submenu -->
              <Collapsible.Trigger>
                {#snippet child({ props })}
                  <button
                    {...props}
                    class="flex h-8 w-8 items-center justify-center rounded-md hover:bg-sidebar-accent shrink-0"
                  >
                    <ChevronRightIcon
                      class="h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                    />
                  </button>
                {/snippet}
              </Collapsible.Trigger>
            </div>

            <!-- Sub menu items -->
            <Collapsible.Content>
              <Sidebar.MenuSub>
                {#each item.items as sub}
                  <Sidebar.MenuSubItem>
                    <Sidebar.MenuSubButton
                      isActive={$page.url.pathname === sub.url}
                    >
                      {#snippet child({ props })}
                        <a
                          href={item.comingSoon ? undefined : sub.url}
                          class:pointer-events-none={item.comingSoon}
                          {...props}
                        >
                          {sub.title}
                        </a>
                      {/snippet}
                    </Sidebar.MenuSubButton>
                  </Sidebar.MenuSubItem>
                {/each}
              </Sidebar.MenuSub>
            </Collapsible.Content>
          </Sidebar.MenuItem>
        </Collapsible.Root>
      {/if}
    {/each}
  </Sidebar.Menu>
</Sidebar.Group>
