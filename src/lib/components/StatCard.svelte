<script lang="ts">
  import TrendingDownIcon from "@lucide/svelte/icons/trending-down";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import type { Component } from "svelte";

  type TrendDirection = "up" | "down" | "neutral";

  interface Props {
    // === REQUIRED ===
    title: string;
    value: string | number;

    // === BADGE (opsional) ===
    badge?: string;
    badgeVariant?: "default" | "secondary" | "destructive" | "outline";
    trendDirection?: TrendDirection;

    // === ICON (opsional) ===
    icon?: Component;
    iconBg?: string; // misal "bg-orange-50"
    iconColor?: string; // misal "text-orange-500"

    // === LOADING SKELETON (opsional) ===
    loading?: boolean;

    // === FOOTER (opsional) ===
    footerText?: string;
    footerTextClass?: string; // override warna footerText, misal "text-red-500"
    footerLink?: string; // jika diisi, footerText jadi link
    footerSubtext?: string;
    footerSubtextClass?: string;
    footerSubtextHref?: string;
    showFooterIcon?: boolean;

    // === STYLE (opsional) ===
    class?: string;
    titleClass?: string; // override warna label title
    valueClass?: string; // override warna nilai utama
  }

  let {
    title,
    value,
    badge,
    badgeVariant = "outline",
    trendDirection = "neutral",
    icon: CustomIcon,
    iconBg = "bg-muted",
    iconColor = "text-muted-foreground",
    loading = false,
    footerText,
    footerTextClass = "",
    footerLink,
    footerSubtext,
    footerSubtextClass = "",
    footerSubtextHref,
    showFooterIcon = false,
    class: className = "",
    titleClass = "",
    valueClass = "",
  }: Props = $props();

  const TrendIcon = $derived(
    trendDirection === "up"
      ? TrendingUpIcon
      : trendDirection === "down"
        ? TrendingDownIcon
        : null,
  );

  const FooterIcon = $derived(CustomIcon ?? TrendIcon);
  const BadgeIcon = $derived(CustomIcon ?? TrendIcon);
</script>

<Card.Root class="@container/card {className}">
  <Card.Header>
    <div class="flex items-start justify-between">
      <Card.Description class={titleClass}>{title}</Card.Description>
      {#if CustomIcon}
        <span
          class="flex h-7 w-7 items-center justify-center rounded-lg {iconBg}"
        >
          <CustomIcon class="size-3.5 {iconColor}" />
        </span>
      {/if}
    </div>

    {#if loading}
      <div class="mt-3 h-8 w-16 animate-pulse rounded bg-muted"></div>
      <div class="mt-1.5 h-3 w-32 animate-pulse rounded bg-muted"></div>
    {:else}
      <Card.Title
        class="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl {valueClass}"
      >
        {value}
      </Card.Title>
    {/if}

    {#if badge && !loading}
      <Card.Action>
        <Badge variant={badgeVariant}>
          {#if BadgeIcon}
            <BadgeIcon class="size-3.5" />
          {/if}
          {badge}
        </Badge>
      </Card.Action>
    {/if}
  </Card.Header>

  {#if (footerText || footerSubtext) && !loading}
    <Card.Footer class="flex-col items-start gap-1.5 text-sm">
      {#if footerText}
        {#if footerLink}
          <a
            href={footerLink}
            class="line-clamp-1 flex gap-2 font-medium hover:underline {footerTextClass}"
          >
            {footerText}
            {#if showFooterIcon && FooterIcon}
              <FooterIcon class="size-4" />
            {/if}
          </a>
        {:else}
          <div class="line-clamp-1 flex gap-2 font-medium {footerTextClass}">
            {footerText}
            {#if showFooterIcon && FooterIcon}
              <FooterIcon class="size-4" />
            {/if}
          </div>
        {/if}
      {/if}

      {#if footerSubtext}
        {#if footerSubtextHref}
          <a
            href={footerSubtextHref}
            class="text-muted-foreground hover:underline {footerSubtextClass}"
          >
            {footerSubtext}
          </a>
        {:else}
          <div class="text-muted-foreground {footerSubtextClass}">
            {footerSubtext}
          </div>
        {/if}
      {/if}
    </Card.Footer>
  {/if}
</Card.Root>
