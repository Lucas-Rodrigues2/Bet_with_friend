<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { track } from '$lib/analytics/client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const appHref = $derived(resolveRoute('/app'));
	const myBetsBase = $derived(resolveRoute('/app/my-bets'));

	type FilterValue = 'all' | 'won' | 'lost' | 'active';

	const filters: { value: FilterValue; label: string }[] = [
		{ value: 'all', label: 'Tous' },
		{ value: 'active', label: 'En cours' },
		{ value: 'won', label: 'Gagnés' },
		{ value: 'lost', label: 'Perdus' }
	];

	function hrefFor(filter: FilterValue): string {
		return filter === 'all' ? myBetsBase : `${myBetsBase}?filter=${encodeURIComponent(filter)}`;
	}

	const outcomeLabels: Record<string, string> = {
		won: 'Gagné',
		lost: 'Perdu',
		active: 'En cours'
	};

	const outcomeClasses: Record<string, string> = {
		won: 'bg-green-100 text-green-700',
		lost: 'bg-red-100 text-red-700',
		active: 'bg-blue-100 text-blue-700'
	};

	function formatDate(d: Date | string | null): string {
		if (!d) return '';
		return new Date(d).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	// Track client-side view (complète l'event serveur my_bets_viewed).
	$effect(() => {
		track('my_bets_viewed_client', {
			filter: data.filter
		});
	});
</script>

<div class="container mx-auto max-w-3xl px-4 py-10">
	<div class="mb-6">
		<a
			href={appHref}
			class="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
		>
			← Mes groupes
		</a>
	</div>

	<h1 class="text-foreground mb-6 text-2xl font-bold" data-testid="my-bets-title">Mes paris</h1>

	<!-- Filtres -->
	<div class="mb-6 flex flex-wrap gap-2" data-testid="my-bets-filters">
		{#each filters as f (f.value)}
			{@const href = hrefFor(f.value)}
			<a
				{href}
				class="rounded-full border px-3 py-1.5 text-sm font-medium transition-colors {data.filter ===
				f.value
					? 'bg-primary text-primary-foreground border-primary'
					: 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'}"
				data-testid={`my-bets-filter-${f.value}`}
				aria-current={data.filter === f.value ? 'page' : undefined}
			>
				{f.label}
			</a>
		{/each}
	</div>

	<!-- Liste -->
	{#if data.bets.length === 0}
		<div
			class="border-border rounded-lg border border-dashed p-10 text-center"
			data-testid="my-bets-empty"
		>
			<p class="text-muted-foreground text-sm">
				{#if data.filter === 'won'}
					Aucun pari gagné pour le moment.
				{:else if data.filter === 'lost'}
					Aucun pari perdu pour le moment.
				{:else if data.filter === 'active'}
					Aucun pari en cours.
				{:else}
					Aucun pari pour le moment.
				{/if}
			</p>
		</div>
	{:else}
		<ul class="flex flex-col gap-2" data-testid="my-bets-list">
			{#each data.bets as bet (bet.id)}
				<li data-testid="my-bet-item">
					<a
						href={resolveRoute('/app/groups/[id]/bets/[betId]', {
							id: bet.groupId,
							betId: bet.id
						})}
						class="border-border bg-card hover:bg-accent/30 flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors"
					>
						<div class="min-w-0 flex-1">
							<p class="text-foreground truncate text-sm font-medium" data-testid="my-bet-title">
								{bet.title}
							</p>
							<p class="text-muted-foreground text-xs">
								{bet.groupName}
								{#if bet.resolvedAt}· résolu le {formatDate(bet.resolvedAt)}{/if}
							</p>
						</div>
						<span
							class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {outcomeClasses[
								bet.outcome
							]}"
							data-testid="my-bet-outcome"
						>
							{outcomeLabels[bet.outcome]}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
