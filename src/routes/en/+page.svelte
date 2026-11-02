<script lang="ts">
	// Page d'accueil anglaise (route historique /en).
	// Même composant partagé que la page française — contenu 100 % anglais.
	import Landing from '$lib/components/Landing.svelte';
	import { en } from '$lib/landing/content';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const SITE = 'https://gentlewagers.com';
	const jsonLd = {
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'WebSite',
				name: 'Gentle Wagers',
				url: `${SITE}/en`,
				description: 'Bet with friends online: virtual points or forfeits \u2014 never real money.'
			},
			{
				'@type': 'SoftwareApplication',
				name: 'Gentle Wagers',
				url: `${SITE}/en`,
				applicationCategory: 'GameApplication',
				operatingSystem: 'Web',
				description:
					'The free app to bet with friends: create challenges, stake virtual points or forfeits, let a jury decide. No credit card, never real money.',
				offers: {
					'@type': 'Offer',
					price: '0',
					priceCurrency: 'EUR'
				}
			},
			{
				'@type': 'FAQPage',
				mainEntity: en.faq.items.map((i) => ({
					'@type': 'Question',
					name: i.q,
					acceptedAnswer: { '@type': 'Answer', text: i.a }
				}))
			}
		]
	};
	const jsonLdTag =
		'<script type="application/ld+json">' + JSON.stringify(jsonLd) + '</scr' + 'ipt>';
</script>

<svelte:head>
	<title>Gentle Wagers — Bet with friends online, no real money</title>
	<meta
		name="description"
		content="The free app to bet with friends: create challenges, stake virtual points or forfeits, let a jury decide. No credit card, never real money."
	/>
	<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
	<link rel="canonical" href="{SITE}/en" />
	<link rel="alternate" hreflang="fr" href="{SITE}/" />
	<link rel="alternate" hreflang="en" href="{SITE}/en" />
	<link rel="alternate" hreflang="x-default" href="{SITE}/" />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="{SITE}/og.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Gentle Wagers" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Gentle Wagers" />
	<meta name="twitter:image" content="{SITE}/og.png" />
	<meta property="og:url" content="{SITE}/en" />
	<meta property="og:title" content="Gentle Wagers" />
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
