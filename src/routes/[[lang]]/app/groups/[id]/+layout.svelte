<script lang="ts">
	import { page } from '$app/state';
	import { resolveRoute } from '$lib/paths';
	import { isEnglishPath } from '$lib/i18n';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const isEnglish = $derived(isEnglishPath(page.url.pathname));
	const base = $derived(resolveRoute('/app/groups/[id]', { id: page.params.id ?? '' }));
	const links = $derived([
		{ key: 'overview', suffix: '', label: isEnglish ? 'Overview' : 'Vue d’ensemble' },
		{ key: 'bets', suffix: '/bets', label: isEnglish ? 'Bets' : 'Paris' },
		{ key: 'ledger', suffix: '/ledger', label: isEnglish ? 'Ledger' : 'Ardoise' },
		{ key: 'activity', suffix: '/activity', label: isEnglish ? 'Activity' : 'Activité' },
		{ key: 'leaderboard', suffix: '/leaderboard', label: isEnglish ? 'Leaderboard' : 'Classement' },
		{ key: 'members', suffix: '/members', label: isEnglish ? 'Members' : 'Membres' }
	]);
	const active = $derived(
		links.find((link) =>
			link.suffix
				? page.url.pathname === base + link.suffix ||
					page.url.pathname.startsWith(base + link.suffix + '/')
				: page.url.pathname === base
		)?.key
	);
</script>

<div class="container mx-auto max-w-3xl px-4 pt-8">
	<nav
		aria-label={isEnglish ? 'Group navigation' : 'Navigation du groupe'}
		class="flex gap-1 overflow-x-auto border-b border-[var(--bw-line)] pb-2"
		data-testid="group-tabs"
	>
		{#each links as link (link.key)}
			<a
				href={base + link.suffix}
				data-testid={`tab-${link.key}`}
				aria-current={active === link.key ? 'page' : undefined}
				class="shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bw-green)] {active ===
				link.key
					? 'bg-[var(--bw-ink)] text-white'
					: 'text-[var(--bw-muted)] hover:bg-[var(--bw-paper-deep)] hover:text-[var(--bw-ink)]'}"
			>
				{link.label}
			</a>
		{/each}
	</nav>
</div>

{@render children()}
