<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { track } from '$lib/analytics/client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const groupHref = $derived(resolveRoute('/app/groups/[id]', { id: data.group.id }));
	const betsBase = $derived(resolveRoute('/app/groups/[id]/bets', { id: data.group.id }));

	type FilterValue = 'all' | 'active' | 'judging' | 'resolved' | 'cancelled';

	const filters: { value: FilterValue; label: string }[] = [
		{ value: 'all', label: 'Tous' },
		{ value: 'active', label: 'En cours' },
		{ value: 'judging', label: 'En jugement' },
		{ value: 'resolved', label: 'Terminés' },
		{ value: 'cancelled', label: 'Annulés' }
	];

	// Reconstruit l'URL cible d'un filtre en conservant la recherche courante.
	function betsHref(filter: FilterValue, search: string): string {
		const parts: string[] = [];
		if (filter !== 'all') parts.push(`filter=${encodeURIComponent(filter)}`);
		const trimmed = search.trim();
		if (trimmed) parts.push(`q=${encodeURIComponent(trimmed)}`);
		return parts.length === 0 ? betsBase : `${betsBase}?${parts.join('&')}`;
	}

	const displayStatusLabels: Record<string, string> = {
		active: 'En cours',
		judging: 'En jugement',
		resolved: 'Terminé',
		cancelled: 'Annulé'
	};

	const displayStatusClasses: Record<string, string> = {
		active: 'bg-green-100 text-green-700',
		judging: 'bg-amber-100 text-amber-700',
		resolved: 'bg-blue-100 text-blue-700',
		cancelled: 'bg-muted text-muted-foreground'
	};

	function formatDate(d: Date | string): string {
		return new Date(d).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	// Track client-side view (complète l'event serveur group_bets_viewed).
	$effect(() => {
		track('group_bets_viewed_client', {
			group_id: data.group.id,
			filter: data.filter,
			search: data.search.length > 0
		});
	});
</script>

<div class="container mx-auto max-w-3xl px-4 py-10">
	<div class="mb-6">
		<a
			href={groupHref}
			class="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
		>
			← {data.group.name}
		</a>
	</div>

	<div class="mb-6 flex items-center justify-between gap-4">
		<h1 class="text-foreground text-2xl font-bold" data-testid="group-bets-title">Paris</h1>
	</div>

	<!-- Filtres -->
	<div class="mb-4 flex flex-wrap gap-2" data-testid="group-bets-filters">
		{#each filters as f (f.value)}
			{@const href = betsHref(f.value, data.search)}
			<a
				{href}
				class="rounded-full border px-3 py-1.5 text-sm font-medium transition-colors {data.filter ===
				f.value
					? 'bg-primary text-primary-foreground border-primary'
					: 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'}"
				data-testid={`group-bets-filter-${f.value}`}
				aria-current={data.filter === f.value ? 'page' : undefined}
			>
				{f.label}
			</a>
		{/each}
	</div>

	<!-- Recherche par titre (GET natif : conserve le filtre via champ caché) -->
	<form method="GET" action={betsBase} class="mb-6 flex gap-2" data-testid="group-bets-search-form">
		{#if data.filter !== 'all'}
			<input type="hidden" name="filter" value={data.filter} />
		{/if}
		<input
			type="text"
			name="q"
			value={data.search}
			placeholder="Rechercher un pari par titre…"
			class="border-border bg-background text-foreground flex-1 rounded-md border px-3 py-2 text-sm"
			data-testid="group-bets-search-input"
		/>
		<button
			type="submit"
			class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
			data-testid="group-bets-search-submit"
		>
			Rechercher
		</button>
		{#if data.search}
			<a
				href={betsHref(data.filter, '')}
				class="border-border text-foreground hover:bg-accent/30 rounded-md border px-3 py-2 text-sm"
				data-testid="group-bets-search-clear"
			>
				Effacer
			</a>
		{/if}
	</form>

	<!-- Liste -->
	{#if data.bets.length === 0}
		<div
			class="border-border rounded-lg border border-dashed p-10 text-center"
			data-testid="group-bets-empty"
		>
			<p class="text-muted-foreground text-sm">
				{#if data.search}
					Aucun pari ne correspond à votre recherche.
				{:else}
					Aucun pari dans cette catégorie.
				{/if}
			</p>
		</div>
	{:else}
		<ul class="flex flex-col gap-2" data-testid="group-bets-list">
			{#each data.bets as bet (bet.id)}
				<li data-testid="group-bet-item">
					<a
						href={resolveRoute('/app/groups/[id]/bets/[betId]', {
							id: data.group.id,
							betId: bet.id
						})}
						class="border-border bg-card hover:bg-accent/30 flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors"
					>
						<div class="min-w-0 flex-1">
							<p class="text-foreground truncate text-sm font-medium" data-testid="group-bet-title">
								{bet.title}
							</p>
							<p class="text-muted-foreground text-xs">
								{#if bet.type === 'yesno'}
									Duel Oui/Non
								{:else if bet.stakeType === 'points'}
									{bet.stakeAmount} pts
								{:else}
									Gage : {bet.forfeitDescription}
								{/if}
								· {formatDate(bet.createdAt)}
							</p>
						</div>
						<span
							class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {displayStatusClasses[
								bet.displayStatus
							] ?? 'bg-muted text-muted-foreground'}"
							data-testid="group-bet-status"
						>
							{displayStatusLabels[bet.displayStatus] ?? bet.displayStatus}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
