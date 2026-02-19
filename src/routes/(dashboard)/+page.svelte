<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  // Redirect otomatis dari / ke /dashboard
  onMount(() => {
    goto("/dashboard");
  });
</script>
