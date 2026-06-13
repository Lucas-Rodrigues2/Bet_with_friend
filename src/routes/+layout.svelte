<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { resolveRoute } from '$app/paths';

	let { children } = $props();

	const homeHref = resolveRoute('/');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Bet With Friend</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<header class="border-border bg-background sticky top-0 z-50 border-b">
		<div class="container mx-auto flex h-14 items-center px-4">
			<a href={homeHref} class="flex items-center gap-2 font-semibold">
				<span class="text-primary text-xl">🎲</span>
				<span class="text-foreground text-lg font-bold">Bet With Friend</span>
			</a>
		</div>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>
</div>

<Toaster />
