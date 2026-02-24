<script lang="ts">
	import { cn } from "$lib/utils.js";
	import type { HTMLThAttributes } from "svelte/elements";

	let { class: className, children, ...restProps }: HTMLThAttributes = $props();
</script>

<th
	data-slot="table-head"
	class={cn(
		"h-10 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</th>
