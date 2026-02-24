<script lang="ts">
	import { cn } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let { class: className, children, ...restProps }: HTMLAttributes<HTMLTableSectionElement> = $props();
</script>

<tbody data-slot="table-body" class={cn("[&_tr:last-child]:border-0", className)} {...restProps}>
	{@render children?.()}
</tbody>
