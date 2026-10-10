<script lang="ts">
	import Landing from '$lib/components/Landing.svelte';
	import { en } from '$lib/landing/content';

	let { data } = $props();

	const SITE = 'https://bet-with-friends.fly.dev';

	const jsonLd = {
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'WebSite',
				name: 'Bet With Friends',
				url: `${SITE}/en`,
				description: 'Bets between friends with virtual points or forfeits \u2014 never real money.'
			},
			{
				'@type': 'SoftwareApplication',
				name: 'Bet With Friends',
				url: `${SITE}/en`,
				applicationCategory: 'GameApplication',
				operatingSystem: 'Web',
				description:
					'Create a group, start bets between friends with points or forfeits, then let your jury pick the winners.',
				offers: {
					'@type': 'Offer',
					price: '0',
					priceCurrency: 'EUR'
				}
			}
		]
	};

	const jsonLdTag =
		'<script type="application/ld+json">' + JSON.stringify(jsonLd) + '</scr' + 'ipt>';
</script>

<svelte:head>
	<title>Bet With Friends — Bets between friends, no real money</title>
	<meta
		name="description"
		content="Create a group, start bets between friends with points or forfeits, then let your jury pick the winners."
	/>
	<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
	<link rel="canonical" href="{SITE}/en" />
	<link rel="alternate" hreflang="fr" href="{SITE}/" />
	<link rel="alternate" hreflang="en" href="{SITE}/en" />
	<link rel="alternate" hreflang="x-default" href="{SITE}/" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="{SITE}/en" />
	<meta property="og:title" content="Bet With Friends" />
	<meta
		property="og:description"
		content="Bets between friends with virtual points or forfeits — never real money."
	/>
	<meta property="og:locale" content="en_US" />
	<meta property="og:locale:alternate" content="fr_FR" />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- balise JSON-LD statique, aucune donnée utilisateur -->
	{@html jsonLdTag}
</svelte:head>

<Landing content={en} session={!!data.session} />
