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

  function isGroupActive(item: NavItem): boolean {
    if (!item.items || item.items.length === 0) {
      return $page.url.pathname === item.url;
    }
    return (
      item.items.some((sub) => $page.url.pathname.startsWith(sub.url)) ?? false
    );
  }
</script>

<Sidebar.Group>
  <Sidebar.GroupLabel>Platform</Sidebar.GroupLabel>
  <Sidebar.Menu>
    {#each items as item}
      {#if !item.items || item.items.length === 0}
        <!-- Menu tanpa submenu -->
        <Sidebar.MenuItem>
          <Sidebar.MenuButton
            isActive={$page.url.pathname === item.url}
            tooltipContent={item.title}
            class={$page.url.pathname === item.url
              ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
              : ""}
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
        <!-- Menu dengan submenu -->
        <Collapsible.Root open={isGroupActive(item)} class="group/collapsible">
          <Sidebar.MenuItem>
            <div class="flex w-full items-center">
              <Sidebar.MenuButton
                isActive={isGroupActive(item)}
                tooltipContent={item.title}
                class="flex-1 {isGroupActive(item) && !item.comingSoon
                  ? 'font-medium text-foreground'
                  : ''}"
              >
                {#snippet child({ props })}
                  <a
                    href={item.comingSoon ? undefined : item.url}
                    class:pointer-events-none={item.comingSoon}
                    class:opacity-50={item.comingSoon}
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

              <Collapsible.Trigger>
                {#snippet child({ props })}
                  <button
                    {...props}
                    class="flex h-8 w-8 items-center justify-center rounded-md hover:bg-sidebar-accent shrink-0 text-muted-foreground"
                  >
                    <ChevronRightIcon
                      class="h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                    />
                  </button>
                {/snippet}
              </Collapsible.Trigger>
            </div>

            <Collapsible.Content>
              <Sidebar.MenuSub>
                {#each item.items as sub}
                  {@const subActive = $page.url.pathname === sub.url}
                  <Sidebar.MenuSubItem>
                    <Sidebar.MenuSubButton
                      isActive={subActive}
                      class={subActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                        : ""}
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
