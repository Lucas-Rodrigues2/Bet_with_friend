<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const f = $derived(form as { settled?: boolean; error?: string } | null);

	$effect(() => {
		if (f?.settled) {
			toast.success('Dette marquée comme réglée.');
		}
		if (f?.error) {
			toast.error(f.error);
		}
	});

	// Pairs involving the current user (personal view)
	const myActivePairs = $derived(
		data.activePairs.filter(
			(p) => p.debtorId === data.group.currentUserId || p.creditorId === data.group.currentUserId
		)
	);

	// My total net balance computed from my active pairs
	const myNetBalance = $derived(
		myActivePairs.reduce((sum, pair) => {
			if (pair.creditorId === data.group.currentUserId) return sum + pair.netAmount;
			return sum - pair.netAmount;
		}, 0)
	);

	const groupHref = $derived(resolveRoute('/app/groups/[id]', { id: data.group.id }));

	function formatAmount(amount: number, currency: string): string {
		return `${amount.toFixed(2)} ${currency}`;
	}

	let settlingPair = $state<string | null>(null);

	function pairKey(debtorId: string, creditorId: string): string {
		return `${debtorId}:${creditorId}`;
	}
</script>

<div class="container mx-auto max-w-3xl px-4 py-10">
	<!-- Navigation retour -->
	<div class="mb-6">
		<a
			href={groupHref}
			class="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
		>
			← {data.group.name}
		</a>
	</div>

	<h1 class="text-foreground mb-8 text-2xl font-bold">Ardoise</h1>

	<!-- Section : Mon solde personnel -->
	<section class="mb-8" data-testid="personal-balance-section">
		<h2 class="text-foreground mb-4 text-lg font-semibold">Mon solde</h2>

		<div class="border-border bg-card mb-4 rounded-lg border p-5">
			<p class="text-muted-foreground mb-1 text-sm">Solde net global</p>
			<p
				class="text-2xl font-bold {myNetBalance > 0
					? 'text-green-600'
					: myNetBalance < 0
						? 'text-red-600'
						: 'text-foreground'}"
				data-testid="my-net-balance"
			>
				{myNetBalance >= 0 ? '+' : ''}{formatAmount(myNetBalance, data.group.currency)}
			</p>
			{#if myNetBalance > 0}
				<p class="text-muted-foreground mt-1 text-xs">On te doit de l'argent</p>
			{:else if myNetBalance < 0}
				<p class="text-muted-foreground mt-1 text-xs">Tu dois de l'argent</p>
			{:else}
				<p class="text-muted-foreground mt-1 text-xs">Tu es à jour !</p>
			{/if}
		</div>

		{#if myActivePairs.length > 0}
			<ul class="flex flex-col gap-3" data-testid="my-pairs-list">
				{#each myActivePairs as pair (pairKey(pair.debtorId, pair.creditorId))}
					{@const imCreditor = pair.creditorId === data.group.currentUserId}
					{@const otherUserId = imCreditor ? pair.debtorId : pair.creditorId}
					{@const otherPseudo = imCreditor ? pair.debtorPseudo : pair.creditorPseudo}
					{@const pairEntries = data.myEntries.filter(
						(e) => e.debtorId === otherUserId || e.creditorId === otherUserId
					)}
					<li class="border-border bg-card rounded-lg border p-4" data-testid="pair-card">
						<!-- En-tête de la paire -->
						<div class="mb-3 flex items-center justify-between gap-3">
							<p class="text-foreground font-medium" data-testid="pair-label">
								{#if imCreditor}
									<span class="text-green-600 font-semibold" data-testid="other-pseudo"
										>{otherPseudo}</span
									>
									te doit
									<span class="text-green-600 font-semibold" data-testid="pair-amount">
										{formatAmount(pair.netAmount, data.group.currency)}
									</span>
								{:else}
									Tu dois
									<span class="text-red-600 font-semibold" data-testid="pair-amount">
										{formatAmount(pair.netAmount, data.group.currency)}
									</span>
									à
									<span class="text-red-600 font-semibold" data-testid="other-pseudo"
										>{otherPseudo}</span
									>
								{/if}
							</p>

							{#if imCreditor}
								<form
									method="POST"
									action="?/settle"
									use:enhance={() => {
										settlingPair = pairKey(pair.debtorId, pair.creditorId);
										return async ({ update }) => {
											settlingPair = null;
											await update({ reset: false });
										};
									}}
								>
									<input type="hidden" name="debtorId" value={pair.debtorId} />
									<input type="hidden" name="creditorId" value={pair.creditorId} />
									<Button
										type="submit"
										variant="outline"
										size="sm"
										disabled={settlingPair === pairKey(pair.debtorId, pair.creditorId)}
										data-testid="settle-btn"
									>
										{settlingPair === pairKey(pair.debtorId, pair.creditorId)
											? 'En cours…'
											: 'Marquer réglé'}
									</Button>
								</form>
							{/if}
						</div>

						<!-- Écritures individuelles avec lien vers le pari -->
						{#if pairEntries.length > 0}
							<ul class="border-border mt-3 flex flex-col gap-1 border-t pt-3">
								{#each pairEntries as entry (entry.id)}
									<li
										class="flex items-start justify-between gap-2 text-sm"
										data-testid="entry-item"
									>
										<span class="text-muted-foreground">
											{#if entry.debtorId === data.group.currentUserId}
												Tu dois {formatAmount(entry.amount, data.group.currency)} à {otherPseudo}
											{:else}
												{otherPseudo} te doit {formatAmount(entry.amount, data.group.currency)}
											{/if}
											{#if entry.betId}
												— <a
													href={resolveRoute('/app/groups/[id]/bets/[betId]', {
														id: data.group.id,
														betId: entry.betId
													})}
													class="text-primary hover:underline"
													data-testid="bet-link">{entry.betTitle ?? 'Pari'}</a
												>
											{/if}
										</span>
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<div
				class="border-border rounded-lg border border-dashed p-8 text-center"
				data-testid="no-personal-debt"
			>
				<p class="text-muted-foreground text-sm">Aucune dette en cours — tu es à jour !</p>
			</div>
		{/if}
	</section>

	<!-- Section : Toutes les dettes du groupe -->
	<section class="mb-8" data-testid="all-pairs-section">
		<h2 class="text-foreground mb-4 text-lg font-semibold">Toutes les dettes du groupe</h2>

		{#if data.activePairs.length > 0}
			<ul class="flex flex-col gap-2" data-testid="all-pairs-list">
				{#each data.activePairs as pair (pairKey(pair.debtorId, pair.creditorId))}
					<li
						class="border-border bg-card flex items-center justify-between gap-3 rounded-lg border p-3"
						data-testid="all-pair-item"
					>
						<p class="text-foreground text-sm">
							<span class="font-medium" data-testid="all-pair-debtor">{pair.debtorPseudo}</span>
							<span class="text-muted-foreground"> doit </span>
							<span class="font-semibold" data-testid="all-pair-amount"
								>{formatAmount(pair.netAmount, data.group.currency)}</span
							>
							<span class="text-muted-foreground"> à </span>
							<span class="font-medium" data-testid="all-pair-creditor">{pair.creditorPseudo}</span>
						</p>
					</li>
				{/each}
			</ul>
		{:else}
			<div class="border-border rounded-lg border border-dashed p-6 text-center">
				<p class="text-muted-foreground text-sm">Aucune dette dans le groupe.</p>
			</div>
		{/if}
	</section>

	<!-- Section : Dettes réglées -->
	{#if data.settledPairs.length > 0}
		<section data-testid="settled-section">
			<h2 class="text-foreground mb-4 text-lg font-semibold">Réglées</h2>
			<ul class="flex flex-col gap-2" data-testid="settled-list">
				{#each data.settledPairs as pair (pairKey(pair.debtorId, pair.creditorId))}
					<li
						class="border-border bg-muted/30 flex items-center justify-between gap-3 rounded-lg border p-3 opacity-75"
						data-testid="settled-item"
					>
						<p class="text-muted-foreground text-sm">
							<span class="font-medium" data-testid="settled-debtor">{pair.debtorPseudo}</span>
							<span> devait </span>
							<span class="font-medium" data-testid="settled-amount"
								>{formatAmount(pair.netAmount, data.group.currency)}</span
							>
							<span> à </span>
							<span class="font-medium" data-testid="settled-creditor">{pair.creditorPseudo}</span>
						</p>
						<span class="text-xs font-medium text-green-600" data-testid="settled-badge">Réglé</span
						>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
