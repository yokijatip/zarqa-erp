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

    // === BADGE / COMPARISON (opsional) ===
    badge?: string; // contoh: "+12.5%" atau "NEW"
    badgeVariant?: "default" | "secondary" | "destructive" | "outline";
    trendDirection?: TrendDirection; // menentukan ikon di badge

    // === FOOTER (opsional) ===
    footerText?: string; // contoh: "Trending up this month"
    footerSubtext?: string; // contoh: "Visitors for the last 6 months"
    showFooterIcon?: boolean; // tampilkan ikon trend di footer

    // === CUSTOM ICON (opsional) ===
    // Gunakan ini untuk override ikon dengan ikon custom selain trending
    icon?: Component;

    // === STYLE (opsional) ===
    class?: string;
    valueClass?: string;
  }

  let {
    title,
    value,
    badge,
    badgeVariant = "outline",
    trendDirection = "neutral",
    footerText,
    footerSubtext,
    showFooterIcon = true,
    icon: CustomIcon,
    class: className = "",
    valueClass = "",
  }: Props = $props();

  // Tentukan ikon berdasarkan trendDirection
  const TrendIcon = $derived(
    trendDirection === "up"
      ? TrendingUpIcon
      : trendDirection === "down"
        ? TrendingDownIcon
        : null,
  );

  // Gunakan CustomIcon jika disediakan, fallback ke TrendIcon
  const FooterIcon = $derived(CustomIcon ?? TrendIcon);
  const BadgeIcon = $derived(CustomIcon ?? TrendIcon);
</script>

<Card.Root class="@container/card {className}">
  <Card.Header>
    <Card.Description>{title}</Card.Description>
    <Card.Title
      class="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl {valueClass}"
    >
      {value}
    </Card.Title>

    {#if badge}
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

  {#if footerText || footerSubtext}
    <Card.Footer class="flex-col items-start gap-1.5 text-sm">
      {#if footerText}
        <div class="line-clamp-1 flex gap-2 font-medium">
          {footerText}
          {#if showFooterIcon && FooterIcon}
            <FooterIcon class="size-4" />
          {/if}
        </div>
      {/if}
      {#if footerSubtext}
        <div class="text-muted-foreground">{footerSubtext}</div>
      {/if}
    </Card.Footer>
  {/if}
</Card.Root>
