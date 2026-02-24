<script lang="ts">
	import { cn } from "$lib/utils.js";
	import type { HTMLTdAttributes } from "svelte/elements";

	let { class: className, children, ...restProps }: HTMLTdAttributes = $props();
</script>

<td
	data-slot="table-cell"
	class={cn("px-4 py-3 align-middle", className)}
	{...restProps}
>
	{@render children?.()}
</td>
