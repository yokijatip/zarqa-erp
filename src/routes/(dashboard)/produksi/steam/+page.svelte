<script lang="ts">
  import ProductionStagePage from "$lib/components/production-stage-page.svelte";
  import { PRODUCTION_STAGE_CONFIG } from "$lib/production-stages";
</script>

<ProductionStagePage config={PRODUCTION_STAGE_CONFIG.steam} />
