<script lang="ts">
	// Relais de la mise en page ([[lang]]) pour l'espace /en : même en-tête,
	// mêmes styles globaux, langue anglaise.
	import Layout from '../[[lang]]/+layout.svelte';
	import type { ComponentProps, Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	const layoutProps = $derived({ data, children } as unknown as ComponentProps<typeof Layout>);
</script>

<Layout {...layoutProps} />
