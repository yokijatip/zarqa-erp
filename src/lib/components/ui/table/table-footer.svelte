<script lang="ts">
	import { cn } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let { class: className, children, ...restProps }: HTMLAttributes<HTMLTableSectionElement> = $props();
</script>

<tfoot
	data-slot="table-footer"
	class={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
	{...restProps}
>
	{@render children?.()}
</tfoot>
