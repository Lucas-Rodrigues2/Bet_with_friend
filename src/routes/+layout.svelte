<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { resolveRoute } from '$app/paths';
	import GuestBanner from '$lib/components/GuestBanner.svelte';

	let { children, data } = $props();

	const homeHref = resolveRoute('/');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Bet With Friend</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<header class="border-border bg-background sticky top-0 z-50 border-b">
		<div class="container mx-auto flex h-14 items-center justify-between px-4">
			<a href={homeHref} class="flex items-center gap-2 font-semibold">
				<span class="text-primary text-xl">🎲</span>
				<span class="text-foreground text-lg font-bold">Bet With Friend</span>
			</a>

			<nav class="flex items-center gap-3">
				{#if data.session && data.profile}
					<span class="text-muted-foreground text-sm">
						Bonjour, <strong class="text-foreground">{data.profile.pseudo}</strong>
					</span>
					<form method="POST" action="/logout">
						<Button type="submit" variant="outline" size="sm">Déconnexion</Button>
					</form>
				{:else if data.session}
					<form method="POST" action="/logout">
						<Button type="submit" variant="outline" size="sm">Déconnexion</Button>
					</form>
				{:else}
					<Button href="/login" variant="outline" size="sm">Se connecter</Button>
					<Button href="/signup" size="sm">Créer un compte</Button>
				{/if}
			</nav>
		</div>
	</header>

	{#if data.profile?.isAnonymous}
		<GuestBanner />
	{/if}

	<main class="flex-1">
		{@render children()}
	</main>
</div>

<Toaster />
