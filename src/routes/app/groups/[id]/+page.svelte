<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { track } from '$lib/analytics/client';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const appHref = resolveRoute('/app');

	let showNewBetMenu = $state(false);
	let showInviteForm = $state(false);
	let inviteLoading = $state(false);
	let copiedToken = $state<string | null>(null);
	// Token du lien d'invitation fraîchement créé — persisté côté client
	let persistedInviteToken = $state<string | null>(null);

	// Résultats du formulaire
	const f = $derived(
		form as {
			inviteToken?: string;
			revoked?: boolean;
			error?: string;
			canInviteUpdated?: boolean;
			kicked?: boolean;
			promoted?: boolean;
		} | null
	);

	// URL de base pour les liens d'invitation
	const baseUrl = $derived(typeof window !== 'undefined' ? window.location.origin : '');

	// Persister le token du lien fraîchement créé + toast après toggle can_invite
	$effect(() => {
		if (f?.inviteToken) {
			persistedInviteToken = f.inviteToken;
		}
		if (f?.canInviteUpdated) {
			toast.success("Droits d'invitation mis à jour.");
		}
	});

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

	const newClosestHref = $derived(
		resolveRoute('/app/groups/[id]/bets/new/closest', { id: data.group.id })
	);
	const newYesnoHref = $derived(
		resolveRoute('/app/groups/[id]/bets/new/yesno', { id: data.group.id })
	);
	const settingsHref = $derived(resolveRoute('/app/groups/[id]/settings', { id: data.group.id }));
	const ledgerHref = $derived(resolveRoute('/app/groups/[id]/ledger', { id: data.group.id }));

	function canGenerateInvite() {
		return data.group.role === 'admin' || data.group.canInvite;
	}

	async function copyInviteLink(token: string) {
		const url = `${window.location.origin}/invite/${token}`;
		// Track the copy intent regardless of clipboard API success
		track('invite_link_copied', { group_id: data.group.id });
		try {
			await navigator.clipboard.writeText(url);
			copiedToken = token;
			setTimeout(() => {
				copiedToken = null;
			}, 2000);
		} catch {
			// Fallback: select the text
		}
	}

	function inviteLink(token: string) {
		return `${baseUrl}/invite/${token}`;
	}

	// Track judging section viewed when juror has bets to judge
	onMount(() => {
		if (data.betsToJudge && data.betsToJudge.length > 0) {
			track('judging_section_viewed', {
				group_id: data.group.id,
				bets_count: data.betsToJudge.length
			});
		}
	});

	function formatExpiry(expiresAt: Date | string | null): string {
		if (!expiresAt) return 'Jamais';
		const d = new Date(expiresAt);
		return d.toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function isActive(inv: {
		revokedAt: Date | string | null;
		expiresAt: Date | string | null;
		maxUses: number | null;
		usesCount: number;
	}): boolean {
		if (inv.revokedAt) return false;
		if (inv.expiresAt && new Date(inv.expiresAt) < new Date()) return false;
		if (inv.maxUses !== null && inv.usesCount >= inv.maxUses) return false;
		return true;
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

		<!-- Lien Paramètres (admin uniquement) -->
		{#if data.group.role === 'admin'}
			<a
				href={settingsHref}
				class="text-muted-foreground hover:text-foreground shrink-0 text-sm underline-offset-4 hover:underline"
				data-testid="settings-link"
			>
				Paramètres
			</a>
		{/if}
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
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						class="bg-popover border-border absolute right-0 top-full z-10 mt-1 w-44 rounded-md border shadow-md"
						onclick={(e: MouseEvent) => e.stopPropagation()}
					>
						<a
							href={newClosestHref}
							class="hover:bg-accent block px-4 py-2 text-sm"
							data-testid="new-bet-closest"
							onclick={() => selectBetType('closest')}
						>
							Au plus proche
						</a>
						<a
							href={newYesnoHref}
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

		<!-- Liste des paris -->
		{#if data.bets && data.bets.length > 0}
			<ul class="flex flex-col gap-2" data-testid="bets-list">
				{#each data.bets as bet (bet.id)}
					{@const isPropositionReceived =
						bet.type === 'yesno' &&
						bet.propositionStatus === 'negotiating' &&
						bet.propositionTargetId === data.group.currentUserId}
					<li data-testid="bet-item">
						<a
							href={resolveRoute('/app/groups/[id]/bets/[betId]', {
								id: data.group.id,
								betId: bet.id
							})}
							class="border-border bg-card hover:bg-accent/30 flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors"
						>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<p class="text-foreground text-sm font-medium" data-testid="bet-title">
										{bet.title}
									</p>
									{#if isPropositionReceived}
										<span
											class="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs font-medium"
											data-testid="proposition-received-badge"
										>
											Proposition reçue
										</span>
									{/if}
								</div>
								<p class="text-muted-foreground text-xs">
									{#if bet.type === 'yesno'}
										Duel Oui/Non
									{:else if bet.stakeType === 'points'}
										{bet.stakeAmount} pts
									{:else}
										Gage : {bet.forfeitDescription}
									{/if}
								</p>
							</div>
							<span
								class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {bet.status === 'open'
									? 'bg-green-100 text-green-700'
									: 'bg-muted text-muted-foreground'}"
							>
								{bet.status === 'open' ? 'Ouvert' : bet.status}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<!-- État vide paris -->
			<div
				class="border-border rounded-lg border border-dashed p-10 text-center"
				data-testid="empty-bets"
			>
				<p class="text-muted-foreground text-sm">Aucun pari — crée le premier !</p>
			</div>
		{/if}
	</section>

	<!-- Section À juger (jurés uniquement, hors liste de visibilité) -->
	{#if data.betsToJudge && data.betsToJudge.length > 0}
		<section class="mb-8" data-testid="bets-to-judge-section">
			<h2 class="text-foreground mb-4 text-lg font-semibold">À juger</h2>
			<ul class="flex flex-col gap-2" data-testid="bets-to-judge-list">
				{#each data.betsToJudge as bet (bet.id)}
					<li data-testid="bet-to-judge-item">
						<a
							href={resolveRoute('/app/groups/[id]/bets/[betId]', {
								id: data.group.id,
								betId: bet.id
							})}
							class="border-amber-200 bg-amber-50 hover:bg-amber-100 flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors"
						>
							<div class="min-w-0 flex-1">
								<p class="text-foreground text-sm font-medium" data-testid="bet-to-judge-title">
									{bet.title}
								</p>
								<p class="text-muted-foreground text-xs">Vous êtes juré de ce pari</p>
							</div>
							<span
								class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
								data-testid="bet-to-judge-status"
							>
								En jugement
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- Section Membres -->
	<section class="mb-8" data-testid="members-section">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-foreground text-lg font-semibold">
				Membres ({data.members.length})
			</h2>
			<div class="flex items-center gap-2">
				<a
					href={resolveRoute('/app/groups/[id]/members', { id: data.group.id })}
					class="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
					data-testid="members-page-link"
				>
					Gérer les membres
				</a>
				{#if canGenerateInvite()}
					<Button
						variant="outline"
						size="sm"
						data-testid="invite-btn"
						onclick={() => (showInviteForm = !showInviteForm)}
					>
						Inviter
					</Button>
				{/if}
			</div>
		</div>

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
					{:else if data.group.role === 'admin'}
						<!-- L'admin peut toggler can_invite sur les membres non-admin -->
						<form
							method="POST"
							action="?/toggleCanInvite"
							use:enhance={() => {
								return async ({ update }) => {
									await update({ reset: false });
								};
							}}
						>
							<input type="hidden" name="targetUserId" value={member.userId} />
							<input type="hidden" name="canInvite" value={member.canInvite ? 'false' : 'true'} />
							<button
								type="submit"
								class="text-xs rounded-full px-2 py-0.5 font-medium transition-colors {member.canInvite
									? 'bg-green-100 text-green-700 hover:bg-green-200'
									: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
								data-testid="toggle-can-invite-{member.userId}"
								title={member.canInvite ? "Retirer le droit d'inviter" : 'Autoriser à inviter'}
							>
								{member.canInvite ? 'Peut inviter' : 'Ne peut pas inviter'}
							</button>
						</form>
					{:else if member.canInvite}
						<span class="bg-green-100 text-green-700 rounded-full px-2 py-0.5 text-xs font-medium">
							Peut inviter
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<!-- Section Invitations -->
	{#if canGenerateInvite()}
		<section class="mb-8" data-testid="invitations-section">
			<h2 class="text-foreground mb-4 text-lg font-semibold">Liens d'invitation</h2>

			<!-- Formulaire de création -->
			{#if showInviteForm}
				<div class="border-border bg-card mb-4 rounded-lg border p-4" data-testid="invite-form">
					<h3 class="text-foreground mb-3 text-sm font-medium">Générer un lien</h3>

					{#if f?.error}
						<div class="bg-destructive/10 text-destructive mb-3 rounded px-3 py-2 text-sm">
							{f.error}
						</div>
					{/if}

					<form
						method="POST"
						action="?/createInvite"
						use:enhance={() => {
							inviteLoading = true;
							return async ({ update }) => {
								inviteLoading = false;
								showInviteForm = false;
								await update({ reset: false });
							};
						}}
						class="flex flex-col gap-3"
					>
						<div class="flex flex-col gap-1">
							<label for="expiration" class="text-foreground text-sm font-medium">Expiration</label>
							<select
								id="expiration"
								name="expiration"
								class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm"
								data-testid="invite-expiration"
							>
								<option value="never">Jamais</option>
								<option value="24h">24 heures</option>
								<option value="7d">7 jours</option>
							</select>
						</div>

						<div class="flex flex-col gap-1">
							<label for="maxUses" class="text-foreground text-sm font-medium"
								>Limite d'usages</label
							>
							<select
								id="maxUses"
								name="maxUses"
								class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm"
								data-testid="invite-max-uses"
							>
								<option value="unlimited">Illimité</option>
								<option value="1">1 utilisation</option>
								<option value="5">5 utilisations</option>
								<option value="10">10 utilisations</option>
								<option value="25">25 utilisations</option>
								<option value="50">50 utilisations</option>
							</select>
						</div>

						<div class="flex gap-2">
							<Button
								type="submit"
								size="sm"
								disabled={inviteLoading}
								data-testid="create-invite-btn"
							>
								{inviteLoading ? 'Génération…' : 'Générer le lien'}
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onclick={() => (showInviteForm = false)}
							>
								Annuler
							</Button>
						</div>
					</form>
				</div>
			{/if}

			<!-- Lien nouvellement créé -->
			{#if persistedInviteToken}
				<div class="border-border bg-card mb-4 rounded-lg border p-4" data-testid="new-invite-link">
					<p class="text-foreground mb-2 text-sm font-medium">Lien créé :</p>
					<div class="flex items-center gap-2">
						<input
							type="text"
							readonly
							value={`${baseUrl}/invite/${persistedInviteToken}`}
							class="border-border bg-muted text-foreground flex-1 rounded-md border px-3 py-2 text-sm"
							data-testid="invite-link-input"
						/>
						<Button
							variant="outline"
							size="sm"
							onclick={() => persistedInviteToken && copyInviteLink(persistedInviteToken)}
							data-testid="copy-invite-btn"
						>
							{copiedToken === persistedInviteToken ? 'Copié !' : 'Copier'}
						</Button>
					</div>
				</div>
			{/if}

			<!-- Liste des invitations existantes -->
			{#if data.invitations.length > 0}
				<ul class="flex flex-col gap-2" data-testid="invitations-list">
					{#each data.invitations as inv (inv.id)}
						{@const active = isActive(inv)}
						<li
							class="border-border bg-card rounded-lg border p-3 {active ? '' : 'opacity-60'}"
							data-testid="invitation-item"
						>
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2 flex-wrap">
										<span
											class="text-xs rounded-full px-2 py-0.5 font-medium {active
												? 'bg-green-100 text-green-700'
												: 'bg-muted text-muted-foreground'}"
											data-testid="invite-status-badge"
										>
											{active ? 'Actif' : 'Inactif'}
										</span>
										<span class="text-muted-foreground text-xs">
											Expire : {formatExpiry(inv.expiresAt)}
										</span>
										<span class="text-muted-foreground text-xs">
											Utilisations : {inv.usesCount}{inv.maxUses !== null ? `/${inv.maxUses}` : ''}
										</span>
									</div>
									{#if active}
										<div class="mt-2 flex items-center gap-2">
											<input
												type="text"
												readonly
												value={inviteLink(inv.token)}
												class="border-border bg-muted text-foreground min-w-0 flex-1 rounded border px-2 py-1 text-xs"
												data-testid="invite-url-field"
											/>
											<Button
												variant="outline"
												size="sm"
												onclick={() => copyInviteLink(inv.token)}
												data-testid="copy-existing-invite-btn"
											>
												{copiedToken === inv.token ? 'Copié !' : 'Copier'}
											</Button>
										</div>
									{/if}
								</div>
								{#if data.group.role === 'admin' && active}
									<form
										method="POST"
										action="?/revokeInvite"
										use:enhance={() => {
											return async ({ update }) => {
												await update({ reset: false });
											};
										}}
									>
										<input type="hidden" name="invitationId" value={inv.id} />
										<button
											type="submit"
											class="text-destructive hover:text-destructive/80 text-xs hover:underline whitespace-nowrap"
											data-testid="revoke-invite-btn"
										>
											Révoquer
										</button>
									</form>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{:else if !showInviteForm}
				<div class="border-border rounded-lg border border-dashed p-6 text-center">
					<p class="text-muted-foreground text-sm">
						Aucun lien d'invitation —
						<button class="text-primary hover:underline" onclick={() => (showInviteForm = true)}>
							créer le premier
						</button>
					</p>
				</div>
			{/if}
		</section>
	{/if}

	<!-- Section Ardoise -->
	<section data-testid="ledger-section">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-foreground text-lg font-semibold">Ardoise</h2>
			<a
				href={ledgerHref}
				class="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
				data-testid="ledger-link"
			>
				Voir l'ardoise complète →
			</a>
		</div>
		<a
			href={ledgerHref}
			class="border-border bg-card hover:bg-accent/30 block rounded-lg border p-5 transition-colors"
			data-testid="ledger-card"
		>
			<p class="text-muted-foreground mb-1 text-sm">Solde personnel</p>
			<p
				class="text-2xl font-bold {data.group.myNetBalance > 0
					? 'text-green-600'
					: data.group.myNetBalance < 0
						? 'text-red-600'
						: 'text-foreground'}"
				data-testid="ledger-balance"
			>
				{data.group.myNetBalance >= 0 ? '+' : ''}{data.group.myNetBalance.toFixed(2)}
				{data.group.currency}
			</p>
			{#if data.group.myNetBalance > 0}
				<p class="text-muted-foreground mt-1 text-xs">On te doit de l'argent</p>
			{:else if data.group.myNetBalance < 0}
				<p class="text-muted-foreground mt-1 text-xs">Tu dois de l'argent</p>
			{:else}
				<p class="text-muted-foreground mt-1 text-xs">Aucune dette en cours</p>
			{/if}
		</a>
	</section>
</div>
