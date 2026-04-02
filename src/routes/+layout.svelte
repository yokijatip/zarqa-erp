<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import "./layout.css";
  import favicon from "$lib/assets/favicon.svg";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import {
    initAuthListener,
    isLoggedIn,
    authLoading,
  } from "$lib/stores/auth.store";
  import { loadSettings, applySettings } from "$lib/stores/display.store";

  let { children } = $props();

  onMount(() => {
    initAuthListener();
    applySettings(loadSettings());
  });

  // Guard: redirect ke login jika belum login
  $effect(() => {
    if (!$authLoading) {
      const isAuthPage = $page.url.pathname.startsWith("/login");
      if (!$isLoggedIn && !isAuthPage) {
        goto("/login");
      }
      if ($isLoggedIn && isAuthPage) {
        goto("/dashboard");
      }
    }
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{#if $authLoading}
  <div class="flex h-screen w-full items-center justify-center bg-background">
    <div class="flex flex-col items-center gap-3">
      <div
        class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
      ></div>
      <p class="text-sm text-muted-foreground">Memuat...</p>
    </div>
  </div>
{:else}
  {@render children()}
{/if}
