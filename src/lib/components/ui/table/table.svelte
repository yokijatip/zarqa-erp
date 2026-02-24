<script lang="ts">
	import { cn } from "$lib/utils.js";
	import type { HTMLTableAttributes } from "svelte/elements";

	let { class: className, children, ...restProps }: HTMLTableAttributes = $props();
</script>

<div class="relative w-full overflow-auto">
	<table
		data-slot="table"
		class={cn("w-full caption-bottom text-sm", className)}
		{...restProps}
	>
		{@render children?.()}
	</table>
</div>
