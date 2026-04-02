<script lang="ts">
	import { cn } from "$lib/utils.js";
	import type { SvelteHTMLElements } from "svelte/elements";

	let { class: className, children, ...restProps }: SvelteHTMLElements["caption"] = $props();
</script>

<caption
	data-slot="table-caption"
	class={cn("mt-4 text-sm text-muted-foreground", className)}
	{...restProps}
>
	{@render children?.()}
</caption>
