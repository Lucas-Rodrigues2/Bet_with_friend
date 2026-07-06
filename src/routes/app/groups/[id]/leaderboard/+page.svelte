<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { track } from '$lib/analytics/client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const groupHref = $derived(resolveRoute('/app/groups/[id]', { id: data.group.id }));

	// Track client-side view (complète l'event serveur leaderboard_viewed).
	$effect(() => {
		track('leaderboard_viewed_client', {
			group_id: data.group.id,
			period: data.period
		});
	});

	function formatNet(amount: number): string {
		return `${amount >= 0 ? '+' : ''}${amount.toFixed(2)} ${data.group.currency}`;
	}

	function rankClass(index: number): string {
		if (index === 0) return 'text-amber-600';
		if (index === 1) return 'text-slate-500';
		if (index === 2) return 'text-orange-700';
		return 'text-muted-foreground';
	}
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
		<h1 class="text-foreground text-2xl font-bold" data-testid="leaderboard-title">Classement</h1>

		<a
			href={data.period === 'all'
				? resolveRoute('/app/groups/[id]/leaderboard', { id: data.group.id }) + '?period=30d'
				: resolveRoute('/app/groups/[id]/leaderboard', { id: data.group.id }) + '?period=all'}
			class="border-border text-foreground hover:bg-accent/30 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
			data-testid="period-toggle"
		>
			{data.period === 'all' ? '30 derniers jours' : 'Tout temps'}
		</a>
	</div>

	{#if !data.hasResolvedMatches}
		<div
			class="border-border rounded-lg border border-dashed p-10 text-center"
			data-testid="empty-leaderboard"
		>
			<p class="text-muted-foreground text-sm">
				Aucun pari résolu pour le moment — le classement apparaîtra dès le premier résultat.
			</p>
		</div>
	{:else}
		<div class="overflow-x-auto" data-testid="leaderboard-table">
			<table class="w-full border-collapse">
				<thead>
					<tr class="border-border border-b text-left">
						<th class="text-muted-foreground px-2 py-2 text-xs font-medium">#</th>
						<th class="text-muted-foreground px-2 py-2 text-xs font-medium">Membre</th>
						<th class="text-muted-foreground px-2 py-2 text-right text-xs font-medium"
							>Gains nets</th
						>
						<th class="text-muted-foreground px-2 py-2 text-right text-xs font-medium">Joués</th>
						<th class="text-muted-foreground px-2 py-2 text-right text-xs font-medium">Gagnés</th>
						<th class="text-muted-foreground px-2 py-2 text-right text-xs font-medium">%</th>
						<th class="text-muted-foreground px-2 py-2 text-right text-xs font-medium">Gages</th>
					</tr>
				</thead>
				<tbody>
					{#each data.leaderboard as row, i (row.userId)}
						<tr
							class="border-border border-b text-sm {row.isRemoved ? 'opacity-50' : ''}"
							data-testid="leaderboard-row"
						>
							<td class="px-2 py-3 font-semibold {rankClass(i)}" data-testid="leaderboard-rank">
								{i + 1}
							</td>
							<td class="px-2 py-3" data-testid="leaderboard-pseudo">
								<span class="text-foreground font-medium">{row.pseudo}</span>
								{#if row.isRemoved}
									<span class="text-muted-foreground ml-1 text-xs italic">(parti)</span>
								{/if}
							</td>
							<td
								class="px-2 py-3 text-right font-semibold {row.netGains > 0
									? 'text-green-600'
									: row.netGains < 0
										? 'text-red-600'
										: 'text-foreground'}"
								data-testid="leaderboard-net"
							>
								{formatNet(row.netGains)}
							</td>
							<td
								class="text-muted-foreground px-2 py-3 text-right"
								data-testid="leaderboard-played"
							>
								{row.played}
							</td>
							<td class="text-foreground px-2 py-3 text-right" data-testid="leaderboard-won">
								{row.won}
							</td>
							<td
								class="text-muted-foreground px-2 py-3 text-right"
								data-testid="leaderboard-winrate"
							>
								{row.played > 0 ? `${row.winRate}%` : '—'}
							</td>
							<td
								class="text-muted-foreground px-2 py-3 text-right"
								data-testid="leaderboard-forfeits"
							>
								{row.forfeitsDone}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
