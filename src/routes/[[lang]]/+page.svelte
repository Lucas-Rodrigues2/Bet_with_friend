<script lang="ts">
	import Landing from '$lib/components/Landing.svelte';
	import { fr, en } from '$lib/landing/content';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const SITE = 'https://bet-with-friends.fly.dev';
	const L = $derived(data.lang ?? 'fr');
	const content = $derived(L === 'en' ? en : fr);
	const canonical = $derived(L === 'en' ? `${SITE}/en` : `${SITE}/`);
	const title = $derived(
		L === 'en'
			? 'Bet With Friends — Bets between friends, no real money'
			: 'Bet With Friends — Les paris entre amis, sans argent réel'
	);
	const description = $derived(
		L === 'en'
			? 'Create a group, start bets between friends with points or forfeits, then let your jury pick the winners.'
			: 'Créez un groupe, lancez des paris entre amis avec des points ou des gages, puis laissez votre jury désigner les gagnants.'
	);

	const jsonLd = $derived({
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'WebSite',
				name: 'Bet With Friends',
				url: canonical,
				description
			},
			{
				'@type': 'SoftwareApplication',
				name: 'Bet With Friends',
				url: canonical,
				applicationCategory: 'GameApplication',
				operatingSystem: 'Web',
				description,
				offers: {
					'@type': 'Offer',
					price: '0',
					priceCurrency: 'EUR'
				}
			}
		]
	});

	const jsonLdTag = $derived(
		'<script type="application/ld+json">' + JSON.stringify(jsonLd) + '</scr' + 'ipt>'
	);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
	<link rel="canonical" href={canonical} />
	<link rel="alternate" hreflang="fr" href="{SITE}/" />
	<link rel="alternate" hreflang="en" href="{SITE}/en" />
	<link rel="alternate" hreflang="x-default" href="{SITE}/" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={canonical} />
	<meta property="og:title" content="Bet With Friends" />
	<meta property="og:description" content={description} />
	<meta property="og:locale" content={L === 'en' ? 'en_US' : 'fr_FR'} />
	<meta property="og:locale:alternate" content={L === 'en' ? 'fr_FR' : 'en_US'} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- balise JSON-LD statique, aucune donnée utilisateur -->
	{@html jsonLdTag}
</svelte:head>

<Landing {content} session={!!data.session} />
