<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { track } from '$lib/analytics/client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const appHref = resolveRoute('/app');

	let showNewBetMenu = $state(false);

	function toggleNewBetMenu() {
		const opening = !showNewBetMenu;
		showNewBetMenu = opening;
		if (opening) {
			track('new_bet_menu_opened', { group_id: data.group.id });
		}
	}

	function closeNewBetMenu() {
		showNewBetMenu = false;
	}

	function selectBetType(type: 'closest' | 'yesno') {
		track('new_bet_type_selected', { group_id: data.group.id, type });
		closeNewBetMenu();
	}
</script>

<svelte:window onclick={closeNewBetMenu} />

<div class="container mx-auto max-w-3xl px-4 py-10">
	<!-- Navigation retour -->
	<div class="mb-6">
		<a
			href={appHref}
			class="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
		>
			← Mes groupes
		</a>
	</div>

	<!-- En-tête du groupe -->
	<div class="mb-8 flex items-start justify-between gap-4">
		<div class="flex items-start gap-4">
			{#if data.group.imageUrl}
				<img
					src={data.group.imageUrl}
					alt={data.group.name}
					class="h-14 w-14 rounded-full object-cover"
					data-testid="group-image"
				/>
			{/if}
			<div>
				<div class="flex items-center gap-3">
					<h1 class="text-foreground text-2xl font-bold" data-testid="group-name">
						{data.group.name}
					</h1>
					{#if data.group.role === 'admin'}
						<span
							class="bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-xs font-medium"
							data-testid="admin-badge"
						>
							Admin
						</span>
					{/if}
				</div>

				{#if data.group.description}
					<p class="text-muted-foreground mt-1 text-sm" data-testid="group-description">
						{data.group.description}
					</p>
				{/if}

				<p class="text-muted-foreground mt-1 text-xs" data-testid="group-currency">
					Devise : {data.group.currency}
				</p>
			</div>
		</div>
	</div>

	<!-- Section Paris -->
	<section class="mb-8" data-testid="bets-section">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-foreground text-lg font-semibold">Paris en cours</h2>

			<!-- Bouton Nouveau pari avec menu déroulant -->
			<div class="relative">
				<Button
					data-testid="new-bet-btn"
					onclick={(e: MouseEvent) => {
						e.stopPropagation();
						toggleNewBetMenu();
					}}
				>
					Nouveau pari ▾
				</Button>

				{#if showNewBetMenu}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="bg-popover border-border absolute right-0 top-full z-10 mt-1 w-44 rounded-md border shadow-md"
						onclick={(e: MouseEvent) => e.stopPropagation()}
					>
						<a
							href={resolveRoute('/app/groups/[id]/bets/new', { id: data.group.id }) +
								'?type=closest'}
							class="hover:bg-accent block px-4 py-2 text-sm"
							data-testid="new-bet-closest"
							onclick={() => selectBetType('closest')}
						>
							Au plus proche
						</a>
						<a
							href={resolveRoute('/app/groups/[id]/bets/new', { id: data.group.id }) +
								'?type=yesno'}
							class="hover:bg-accent block px-4 py-2 text-sm"
							data-testid="new-bet-yesno"
							onclick={() => selectBetType('yesno')}
						>
							Oui / Non
						</a>
					</div>
				{/if}
			</div>
		</div>

		<!-- État vide paris -->
		<div
			class="border-border rounded-lg border border-dashed p-10 text-center"
			data-testid="empty-bets"
		>
			<p class="text-muted-foreground text-sm">Aucun pari — crée le premier !</p>
		</div>
	</section>

	<!-- Section Membres -->
	<section class="mb-8" data-testid="members-section">
		<h2 class="text-foreground mb-4 text-lg font-semibold">
			Membres ({data.members.length})
		</h2>
		<ul class="flex flex-col gap-2">
			{#each data.members as member (member.userId)}
				<li
					class="border-border bg-card flex items-center gap-3 rounded-lg border p-3"
					data-testid="member-item"
				>
					{#if member.avatarUrl}
						<img
							src={member.avatarUrl}
							alt={member.pseudo}
							class="h-8 w-8 rounded-full object-cover"
						/>
					{:else}
						<div
							class="bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium"
						>
							{member.pseudo.charAt(0).toUpperCase()}
						</div>
					{/if}
					<span class="text-foreground flex-1 text-sm font-medium">{member.pseudo}</span>
					{#if member.role === 'admin'}
						<span class="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
							Admin
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<!-- Section Ardoise -->
	<section data-testid="ledger-section">
		<h2 class="text-foreground mb-4 text-lg font-semibold">Ardoise</h2>
		<div class="border-border bg-card rounded-lg border p-5">
			<p class="text-muted-foreground mb-1 text-sm">Solde personnel</p>
			<p class="text-foreground text-2xl font-bold" data-testid="ledger-balance">
				0 {data.group.currency}
			</p>
			<p class="text-muted-foreground mt-2 text-xs">
				L'ardoise complète sera disponible prochainement.
			</p>
		</div>
	</section>
</div>
