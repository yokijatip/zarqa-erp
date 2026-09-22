<script lang="ts">
  import StarIcon from "@lucide/svelte/icons/star";
  import Music2Icon from "@lucide/svelte/icons/music-2";
  import ShoppingBagIcon from "@lucide/svelte/icons/shopping-bag";
  import StoreIcon from "@lucide/svelte/icons/store";
  import Globe2Icon from "@lucide/svelte/icons/globe-2";
  import PackageIcon from "@lucide/svelte/icons/package";

  let { name, size = "sm" }: { name: string; size?: "sm" | "md" } = $props();

  const kind = $derived.by(() => {
    const key = name.trim().toLowerCase();
    return key.includes("shopee")
      ? "shopee"
      : key.includes("tiktok")
        ? "tiktok"
        : key.includes("lazada")
          ? "lazada"
          : key.includes("tokopedia")
            ? "tokopedia"
            : key.includes("web")
              ? "web"
              : key.includes("gudang")
                ? "gudang"
                : "custom";
  });
</script>

<span class={`channel-logo channel-logo-${kind} channel-logo-${size}`} aria-hidden="true">
  {#if kind === "shopee"}
    <StarIcon class="h-full w-full" fill="currentColor" stroke-width={1.8} />
  {:else if kind === "tiktok"}
    <Music2Icon class="h-full w-full" stroke-width={2.2} />
  {:else if kind === "lazada"}
    <ShoppingBagIcon class="h-full w-full" stroke-width={2.1} />
  {:else if kind === "tokopedia"}
    <StoreIcon class="h-full w-full" stroke-width={2.1} />
  {:else if kind === "web"}
    <Globe2Icon class="h-full w-full" stroke-width={2} />
  {:else if kind === "gudang"}
    <PackageIcon class="h-full w-full" stroke-width={2} />
  {:else}
    <StoreIcon class="h-full w-full" stroke-width={2} />
  {/if}
</span>

<style>
  .channel-logo {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border: 1px solid currentColor;
    border-radius: 0.35rem;
  }

  .channel-logo-sm {
    width: 1.15rem;
    height: 1.15rem;
    padding: 0.18rem;
  }

  .channel-logo-md {
    width: 1.65rem;
    height: 1.65rem;
    padding: 0.28rem;
  }

  .channel-logo-shopee {
    color: #ee4d2d;
    background: #fff1ed;
  }

  .channel-logo-tiktok {
    color: #111827;
    background: #e6fffb;
  }

  .channel-logo-lazada {
    color: #1464d2;
    background: #edf5ff;
  }

  .channel-logo-tokopedia {
    color: #008c4a;
    background: #eafaf1;
  }

  .channel-logo-web {
    color: #6d28d9;
    background: #f4efff;
  }

  .channel-logo-gudang,
  .channel-logo-custom {
    color: #475569;
    background: #f1f5f9;
  }
</style>
