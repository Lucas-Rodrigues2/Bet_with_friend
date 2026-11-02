<script lang="ts">
	import Landing from '$lib/components/Landing.svelte';
	import { fr, en } from '$lib/landing/content';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const SITE = 'https://gentlewagers.com';
	const L = $derived(data.lang ?? 'fr');
	const content = $derived(L === 'en' ? en : fr);
	const canonical = $derived(L === 'en' ? `${SITE}/en` : `${SITE}/`);
	const title = $derived(
		L === 'en'
			? 'Gentle Wagers — Bet with friends online, no real money'
			: 'Gentle Wagers — Application de paris entre amis sans argent réel'
	);
	const description = $derived(
		L === 'en'
			? 'The free app to bet with friends: create challenges, stake virtual points or forfeits, let a jury decide. No credit card, never real money.'
			: "Application de paris entre amis : créez des défis, pariez en points virtuels ou en gages, laissez un jury trancher. Gratuit, sans carte bancaire, jamais d'argent réel."
	);

	const jsonLd = $derived({
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'WebSite',
				name: 'Gentle Wagers',
				url: canonical,
				description
			},
			{
				'@type': 'SoftwareApplication',
				name: 'Gentle Wagers',
				url: canonical,
				applicationCategory: 'GameApplication',
				operatingSystem: 'Web',
				description,
				offers: {
					'@type': 'Offer',
					price: '0',
					priceCurrency: 'EUR'
				}
			},
			{
				'@type': 'FAQPage',
				mainEntity: content.faq.items.map((i) => ({
					'@type': 'Question',
					name: i.q,
					acceptedAnswer: { '@type': 'Answer', text: i.a }
				}))
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
	<meta property="og:image" content="{SITE}/og.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Gentle Wagers" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Gentle Wagers" />
	<meta name="twitter:image" content="{SITE}/og.png" />
	<meta property="og:url" content={canonical} />
	<meta property="og:title" content="Gentle Wagers" />
	<meta property="og:description" content={description} />
	<meta property="og:locale" content={L === 'en' ? 'en_US' : 'fr_FR'} />
	<meta property="og:locale:alternate" content={L === 'en' ? 'fr_FR' : 'en_US'} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- balise JSON-LD statique, aucune donnée utilisateur -->
	{@html jsonLdTag}
</svelte:head>

<Landing {content} session={!!data.session} />
