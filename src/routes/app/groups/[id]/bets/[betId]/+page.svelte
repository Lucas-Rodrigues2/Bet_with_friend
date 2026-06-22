<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { track } from '$lib/analytics/client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const groupHref = $derived(resolveRoute('/app/groups/[id]', { id: data.bet.groupId }));

	function formatDatetime(d: Date | string | null): string {
		if (!d) return 'Aucune';
		return new Date(d).toLocaleString('fr-FR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDate(d: Date | string): string {
		return new Date(d).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}

	const statusLabels: Record<string, string> = {
		open: 'Ouvert',
		closed: 'Clôturé',
		judging: 'En jury',
		resolved: 'Résolu',
		contested: 'Contesté',
		cancelled: 'Annulé'
	};

	const propositionStatusLabels: Record<string, string> = {
		negotiating: 'En attente de réponse',
		accepted: 'Acceptée',
		refused: 'Refusée',
		cancelled: 'Annulée',
		expired: 'Expirée'
	};

	const matchStatusLabel = $derived(
		data.bet.matchStatus ? (statusLabels[data.bet.matchStatus] ?? data.bet.matchStatus) : null
	);

	const juryModeLabel = $derived(data.bet.juryMode === 'unanimous' ? 'Unanimité' : 'Majorité');

	const forfeitScopeLabel = $derived(
		data.bet.forfeitScope === 'all_losers'
			? 'Tous les perdants'
			: data.bet.forfeitScope === 'last_one'
				? 'Le dernier seulement'
				: null
	);

	const isYesno = $derived(data.bet.type === 'yesno');
	const yesno = $derived(data.bet.yesno ?? null);
	const proposition = $derived(data.bet.proposition ?? null);

	// For yesno: determine who is A and who is B
	const creatorIsA = $derived(yesno?.creatorSide === 'a');
	const creatorInfo = $derived(
		data.bet.visibility.find((v) => v.userId === data.bet.creatorId) ?? null
	);
	const targetInfo = $derived(
		proposition
			? {
					userId: proposition.targetId,
					pseudo: proposition.targetPseudo,
					avatarUrl: proposition.targetAvatarUrl
				}
			: null
	);

	const campA = $derived(
		creatorIsA
			? { player: creatorInfo, label: yesno?.choiceA ?? 'Camp A' }
			: { player: targetInfo, label: yesno?.choiceA ?? 'Camp A' }
	);
	const campB = $derived(
		creatorIsA
			? { player: targetInfo, label: yesno?.choiceB ?? 'Camp B' }
			: { player: creatorInfo, label: yesno?.choiceB ?? 'Camp B' }
	);

	const propStatusLabel = $derived(
		proposition ? (propositionStatusLabels[proposition.status] ?? proposition.status) : null
	);

	const isCurrentUserTarget = $derived(
		proposition ? proposition.targetId === data.currentUserId : false
	);

	// Track bet viewed — read bet properties reactively so Svelte doesn't optimize away
	$effect(() => {
		const betId = data.bet.id;
		const betType = data.bet.type;
		const groupId = data.bet.groupId;
		track('bet_viewed', {
			bet_id: betId,
			bet_type: betType,
			group_id: groupId
		});
	});
</script>

<div class="container mx-auto max-w-2xl px-4 py-10">
	<!-- Navigation retour -->
	<div class="mb-6">
		<a
			href={groupHref}
			class="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
		>
			← Retour au groupe
		</a>
	</div>

	<!-- En-tête du pari -->
	<div class="mb-6 flex items-start justify-between gap-4">
		<div>
			<div class="mb-1 flex flex-wrap items-center gap-2">
				{#if isYesno}
					<span
						class="bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 text-xs font-medium"
						data-testid="bet-type-badge"
					>
						Duel Oui / Non
					</span>
				{:else}
					<span
						class="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium"
						data-testid="bet-type-badge"
					>
						Au plus proche
					</span>
				{/if}

				{#if isYesno && proposition}
					<span
						class="rounded-full px-2 py-0.5 text-xs font-medium {proposition.status ===
						'negotiating'
							? 'bg-amber-100 text-amber-700'
							: proposition.status === 'accepted'
								? 'bg-green-100 text-green-700'
								: 'bg-muted text-muted-foreground'}"
						data-testid="bet-status-badge"
					>
						{propStatusLabel}
					</span>
					{#if isCurrentUserTarget && proposition.status === 'negotiating'}
						<span
							class="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs font-medium"
							data-testid="proposition-received-badge"
						>
							Proposition reçue
						</span>
					{/if}
				{:else if matchStatusLabel}
					<span
						class="rounded-full px-2 py-0.5 text-xs font-medium {data.bet.matchStatus === 'open'
							? 'bg-green-100 text-green-700'
							: 'bg-muted text-muted-foreground'}"
						data-testid="bet-status-badge"
					>
						{matchStatusLabel}
					</span>
				{/if}
			</div>
			<h1 class="text-foreground text-2xl font-bold" data-testid="bet-title">{data.bet.title}</h1>
			{#if data.bet.description}
				<p class="text-muted-foreground mt-2 text-sm" data-testid="bet-description">
					{data.bet.description}
				</p>
			{/if}
		</div>
	</div>

	<!-- Informations du pari -->
	<div class="flex flex-col gap-4">
		<!-- Section yesno : les deux camps -->
		{#if isYesno && yesno}
			<div class="border-border bg-card rounded-lg border p-4" data-testid="yesno-camps">
				<h2 class="text-foreground mb-3 text-sm font-semibold">Les deux camps</h2>
				<div class="grid grid-cols-2 gap-3">
					<!-- Camp A -->
					<div
						class="flex flex-col gap-1 rounded-md border p-3 {data.currentUserId ===
						campA.player?.userId
							? 'border-primary bg-primary/5'
							: 'border-border'}"
						data-testid="camp-a"
					>
						<span
							class="text-xs font-semibold uppercase tracking-wide text-blue-600"
							data-testid="camp-a-label"
						>
							Camp A
						</span>
						<p class="text-foreground text-sm font-medium" data-testid="camp-a-choice">
							{yesno.choiceA}
						</p>
						{#if campA.player}
							<p class="text-muted-foreground text-xs" data-testid="camp-a-player">
								{campA.player.pseudo}{campA.player.userId === data.currentUserId ? ' (moi)' : ''}
							</p>
						{/if}
					</div>
					<!-- Camp B -->
					<div
						class="flex flex-col gap-1 rounded-md border p-3 {data.currentUserId ===
						campB.player?.userId
							? 'border-primary bg-primary/5'
							: 'border-border'}"
						data-testid="camp-b"
					>
						<span
							class="text-xs font-semibold uppercase tracking-wide text-rose-600"
							data-testid="camp-b-label"
						>
							Camp B
						</span>
						<p class="text-foreground text-sm font-medium" data-testid="camp-b-choice">
							{yesno.choiceB}
						</p>
						{#if campB.player}
							<p class="text-muted-foreground text-xs" data-testid="camp-b-player">
								{campB.player.pseudo}{campB.player.userId === data.currentUserId ? ' (moi)' : ''}
							</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- Mise / Gages (yesno) -->
			{#if proposition}
				<div class="border-border bg-card rounded-lg border p-4" data-testid="yesno-stakes">
					<h2 class="text-foreground mb-2 text-sm font-semibold">Mises</h2>
					{#if data.bet.stakeType === 'points'}
						<div class="grid grid-cols-2 gap-3">
							<div>
								<p class="text-muted-foreground text-xs">
									{creatorInfo?.pseudo ?? 'Créateur'}
								</p>
								<p class="text-foreground text-lg font-bold" data-testid="stake-creator">
									{proposition.stakeCreator} pts
								</p>
							</div>
							<div>
								<p class="text-muted-foreground text-xs">
									{targetInfo?.pseudo ?? 'Cible'}
								</p>
								<p class="text-foreground text-lg font-bold" data-testid="stake-target">
									{proposition.stakeTarget} pts
								</p>
							</div>
						</div>
					{:else}
						<div class="flex flex-col gap-2">
							<div>
								<p class="text-muted-foreground text-xs">
									Gage de {creatorInfo?.pseudo ?? 'Créateur'} (si perd)
								</p>
								<p class="text-foreground text-sm" data-testid="forfeit-creator">
									{proposition.forfeitCreator}
								</p>
							</div>
							<div>
								<p class="text-muted-foreground text-xs">
									Gage de {targetInfo?.pseudo ?? 'Cible'} (si perd)
								</p>
								<p class="text-foreground text-sm" data-testid="forfeit-target">
									{proposition.forfeitTarget}
								</p>
							</div>
						</div>
					{/if}
				</div>

				<!-- Échéance de la proposition -->
				<div class="border-border bg-card rounded-lg border p-4" data-testid="proposition-expiry">
					<h2 class="text-foreground mb-1 text-sm font-semibold">Échéance de la proposition</h2>
					<p class="text-foreground text-sm" data-testid="expiry-value">
						{formatDatetime(proposition.expiresAt)}
					</p>
				</div>

				<!-- Jury proposé -->
				{#if proposition.jurors.length > 0}
					<div class="border-border bg-card rounded-lg border p-4" data-testid="bet-jury">
						<h2 class="text-foreground mb-2 text-sm font-semibold">
							Jury proposé — {juryModeLabel}
						</h2>
						<ul class="flex flex-col gap-1" data-testid="jury-members-list">
							{#each proposition.jurors as juror (juror.userId)}
								<li class="flex items-center gap-2" data-testid="jury-member">
									{#if juror.avatarUrl}
										<img
											src={juror.avatarUrl}
											alt={juror.pseudo}
											class="h-6 w-6 rounded-full object-cover"
										/>
									{:else}
										<div
											class="bg-muted text-muted-foreground flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium"
										>
											{juror.pseudo.charAt(0).toUpperCase()}
										</div>
									{/if}
									<span class="text-foreground text-sm">
										{juror.pseudo}{juror.userId === data.currentUserId ? ' (moi)' : ''}
									</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}
		{:else}
			<!-- closest bet: stake info -->
			<div class="border-border bg-card rounded-lg border p-4" data-testid="bet-stake">
				<h2 class="text-foreground mb-2 text-sm font-semibold">Mise</h2>
				{#if data.bet.stakeType === 'points'}
					<p class="text-foreground text-lg font-bold" data-testid="stake-amount">
						{data.bet.stakeAmount} points
					</p>
				{:else}
					<p class="text-foreground font-medium" data-testid="forfeit-description">
						Gage : {data.bet.forfeitDescription}
					</p>
					{#if forfeitScopeLabel}
						<p class="text-muted-foreground mt-1 text-sm" data-testid="forfeit-scope">
							Périmètre : {forfeitScopeLabel}
						</p>
					{/if}
				{/if}
			</div>

			<!-- Deadline (closest) -->
			<div class="border-border bg-card rounded-lg border p-4" data-testid="bet-deadline">
				<h2 class="text-foreground mb-1 text-sm font-semibold">Date limite de participation</h2>
				<p class="text-foreground text-sm" data-testid="deadline-value">
					{formatDatetime(data.bet.participationDeadline)}
				</p>
			</div>

			<!-- Réponses cachées (closest) -->
			<div class="border-border bg-card rounded-lg border p-4" data-testid="bet-hide-answers">
				<h2 class="text-foreground mb-1 text-sm font-semibold">Réponses</h2>
				<p class="text-foreground text-sm">
					{data.bet.hideAnswers ? "Cachées jusqu'à la clôture" : 'Visibles par tous'}
				</p>
			</div>

			<!-- Jury (closest — from match_jurors) -->
			<div class="border-border bg-card rounded-lg border p-4" data-testid="bet-jury">
				<h2 class="text-foreground mb-2 text-sm font-semibold">
					Jury — {juryModeLabel}
				</h2>
				{#if data.bet.jurors.length === 0}
					<p class="text-muted-foreground text-sm">Aucun juré.</p>
				{:else}
					<ul class="flex flex-col gap-1" data-testid="jury-members-list">
						{#each data.bet.jurors as juror (juror.userId)}
							<li class="flex items-center gap-2" data-testid="jury-member">
								{#if juror.avatarUrl}
									<img
										src={juror.avatarUrl}
										alt={juror.pseudo}
										class="h-6 w-6 rounded-full object-cover"
									/>
								{:else}
									<div
										class="bg-muted text-muted-foreground flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium"
									>
										{juror.pseudo.charAt(0).toUpperCase()}
									</div>
								{/if}
								<span class="text-foreground text-sm">
									{juror.pseudo}{juror.userId === data.currentUserId ? ' (moi)' : ''}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		<!-- Qui peut voir (always shown) -->
		<div class="border-border bg-card rounded-lg border p-4" data-testid="bet-visibility">
			<h2 class="text-foreground mb-2 text-sm font-semibold">
				Visibilité ({data.bet.visibility.length} participant{data.bet.visibility.length > 1
					? 's'
					: ''})
			</h2>
			<p class="text-muted-foreground mb-2 text-xs">
				La liste de visibilité est figée à la création et ne peut pas être modifiée.
			</p>
			<ul class="flex flex-col gap-1" data-testid="visibility-members-list">
				{#each data.bet.visibility as member (member.userId)}
					<li class="flex items-center gap-2" data-testid="visibility-member">
						{#if member.avatarUrl}
							<img
								src={member.avatarUrl}
								alt={member.pseudo}
								class="h-6 w-6 rounded-full object-cover"
							/>
						{:else}
							<div
								class="bg-muted text-muted-foreground flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium"
							>
								{member.pseudo.charAt(0).toUpperCase()}
							</div>
						{/if}
						<span class="text-foreground text-sm">
							{member.pseudo}{member.userId === data.currentUserId ? ' (moi)' : ''}
						</span>
					</li>
				{/each}
			</ul>
		</div>

		<!-- Créé le -->
		<p class="text-muted-foreground text-xs">
			Créé le {formatDate(data.bet.createdAt)}
		</p>

		<!-- Actions -->
		{#if isYesno && proposition && proposition.status === 'negotiating' && isCurrentUserTarget}
			<!-- La cible peut accepter/refuser (S-031) -->
			<div class="mt-2" data-testid="proposition-actions">
				<Button disabled data-testid="accept-btn">Accepter (disponible en S-031)</Button>
			</div>
		{:else if !isYesno}
			<!-- Bouton Participer closest (placeholder S-021) -->
			<div class="mt-2" data-testid="participate-section">
				<Button disabled data-testid="participate-btn">Participer (bientôt disponible)</Button>
			</div>
		{/if}
	</div>
</div>
