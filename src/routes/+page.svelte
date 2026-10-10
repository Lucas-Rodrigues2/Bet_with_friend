<script lang="ts">
	import Landing from '$lib/components/Landing.svelte';
	import { fr } from '$lib/landing/content';

	let { data } = $props();

	const SITE = 'https://bet-with-friends.fly.dev';

	const jsonLd = {
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'WebSite',
				name: 'Bet With Friends',
				url: `${SITE}/`,
				description:
					'Paris entre amis avec points virtuels ou gages, sans jamais d\u2019argent réel.'
			},
			{
				'@type': 'SoftwareApplication',
				name: 'Bet With Friends',
				url: `${SITE}/`,
				applicationCategory: 'GameApplication',
				operatingSystem: 'Web',
				description:
					'Créez un groupe, lancez des paris entre amis avec des points ou des gages, puis laissez votre jury désigner les gagnants.',
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
	<title>Bet With Friends — Les paris entre amis, sans argent réel</title>
	<meta
		name="description"
		content="Créez un groupe, lancez des paris entre amis avec des points ou des gages, puis laissez votre jury désigner les gagnants."
	/>
	<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
	<link rel="canonical" href="{SITE}/" />
	<link rel="alternate" hreflang="fr" href="{SITE}/" />
	<link rel="alternate" hreflang="en" href="{SITE}/en" />
	<link rel="alternate" hreflang="x-default" href="{SITE}/" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="{SITE}/" />
	<meta property="og:title" content="Bet With Friends" />
	<meta
		property="og:description"
		content="Paris entre amis avec points virtuels ou gages, sans jamais d'argent réel."
	/>
	<meta property="og:locale" content="fr_FR" />
	<meta property="og:locale:alternate" content="en_US" />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- balise JSON-LD statique, aucune donnée utilisateur -->
	{@html jsonLdTag}
</svelte:head>

<Landing content={fr} session={!!data.session} />
