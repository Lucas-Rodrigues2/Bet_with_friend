<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { track } from '$lib/analytics/client';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

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
		judging: 'En jugement',
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

	// Closest bet participation logic
	const isClosest = $derived(data.bet.type === 'closest');
	const myParticipation = $derived(data.bet.myParticipation ?? null);
	const hasParticipated = $derived(myParticipation !== null);

	// Deadline check: is participation still open?
	const deadlinePassed = $derived(
		data.bet.participationDeadline ? new Date() > new Date(data.bet.participationDeadline) : false
	);

	const canParticipate = $derived(isClosest && data.bet.matchStatus === 'open' && !deadlinePassed);

	// Can submit to jury: must be closest, match open, and user is a participant
	const canSubmitToJury = $derived(
		isClosest && data.bet.matchStatus === 'open' && data.isParticipant
	);

	// Is judging
	const isJudging = $derived(data.bet.matchStatus === 'judging');

	// Stake label for participate button
	const stakeLabel = $derived(
		data.bet.stakeType === 'points'
			? `Miser ${data.bet.stakeAmount} points`
			: `Parier (gage : ${data.bet.forfeitDescription})`
	);

	// Participation form answer state — writable derived so it tracks data changes
	// but also allows the user to edit the field before submission
	let answerValue = $derived.by(() => data.bet.myParticipation?.answer ?? '');

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
							: data.bet.matchStatus === 'judging'
								? 'bg-amber-100 text-amber-700'
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
					{data.bet.hideAnswers && !isJudging
						? "Cachées jusqu'à la soumission au jury"
						: 'Visibles par tous'}
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

			<!-- Participants (closest) -->
			<div class="border-border bg-card rounded-lg border p-4" data-testid="bet-participants">
				<h2 class="text-foreground mb-2 text-sm font-semibold">
					Participants ({data.bet.participants.length})
				</h2>
				{#if data.bet.participants.length === 0}
					<p class="text-muted-foreground text-sm">Personne n'a encore participé.</p>
				{:else}
					<ul class="flex flex-col gap-2" data-testid="participants-list">
						{#each data.bet.participants as participant (participant.userId)}
							<li class="flex items-center justify-between gap-2" data-testid="participant-item">
								<div class="flex items-center gap-2">
									{#if participant.avatarUrl}
										<img
											src={participant.avatarUrl}
											alt={participant.pseudo}
											class="h-6 w-6 rounded-full object-cover"
										/>
									{:else}
										<div
											class="bg-muted text-muted-foreground flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium"
										>
											{participant.pseudo.charAt(0).toUpperCase()}
										</div>
									{/if}
									<span class="text-foreground text-sm">
										{participant.pseudo}{participant.userId === data.currentUserId ? ' (moi)' : ''}
									</span>
								</div>
								{#if participant.answer !== null}
									<span
										class="text-foreground text-sm font-medium"
										data-testid="participant-answer"
									>
										{participant.answer}
									</span>
								{:else}
									<span class="text-muted-foreground text-xs italic" data-testid="answer-hidden">
										Réponse cachée
									</span>
								{/if}
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
		{:else if isClosest}
			<!-- Bouton Soumettre au jury (uniquement pour les participants, match open) -->
			{#if canSubmitToJury}
				<div
					class="border-border bg-card mt-2 rounded-lg border p-4"
					data-testid="submit-to-jury-section"
				>
					<h2 class="text-foreground mb-1 text-sm font-semibold">Soumettre au jury</h2>
					<p class="text-muted-foreground mb-3 text-xs">
						Soumettre le pari au jury clôt les participations et révèle toutes les estimations.
					</p>
					{#if form?.submitError}
						<p class="text-destructive mb-3 text-sm" data-testid="submit-error">
							{form.submitError}
						</p>
					{/if}
					<form method="POST" action="?/submit_to_jury" use:enhance>
						<Button type="submit" variant="outline" data-testid="submit-to-jury-btn">
							Soumettre au jury
						</Button>
					</form>
				</div>
			{/if}

			<!-- Phase de jugement : placeholder vote jury (S-040) -->
			{#if isJudging && data.isJuror}
				<div
					class="border-amber-200 bg-amber-50 mt-2 rounded-lg border p-4"
					data-testid="jury-vote-section"
				>
					<h2 class="text-amber-800 mb-1 text-sm font-semibold">Vote du jury</h2>
					<p class="text-amber-700 text-sm" data-testid="jury-vote-placeholder">
						Le vote du jury sera disponible prochainement (S-040).
					</p>
				</div>
			{:else if isJudging}
				<div
					class="border-border bg-card mt-2 rounded-lg border p-4"
					data-testid="judging-info-section"
				>
					<p class="text-muted-foreground text-sm">
						Ce pari est en cours de jugement. En attente du verdict du jury.
					</p>
				</div>
			{/if}

			<!-- Participation closest -->
			{#if canParticipate}
				<div
					class="border-border bg-card rounded-lg border p-4 mt-2"
					data-testid="participate-section"
				>
					<h2 class="text-foreground mb-3 text-sm font-semibold">
						{hasParticipated ? 'Modifier mon estimation' : 'Mon estimation'}
					</h2>

					{#if form?.participateError}
						<p class="text-destructive mb-3 text-sm" data-testid="participate-error">
							{form.participateError}
						</p>
					{/if}

					<form method="POST" action="?/participate" use:enhance class="flex flex-col gap-3">
						<div>
							<label for="answer" class="text-foreground mb-1 block text-sm font-medium">
								Mon estimation
							</label>
							<input
								id="answer"
								name="answer"
								type="text"
								class="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1"
								placeholder="Votre estimation..."
								value={answerValue}
								data-testid="answer-input"
								required
							/>
						</div>
						<Button type="submit" data-testid="participate-btn">
							{hasParticipated ? 'Modifier' : stakeLabel}
						</Button>
					</form>
				</div>
			{:else if deadlinePassed && !hasParticipated && !isJudging}
				<!-- Spectator banner: deadline passed without participating -->
				<div
					class="bg-muted text-muted-foreground rounded-lg border p-4 mt-2"
					data-testid="spectator-banner"
				>
					<p class="text-sm">Tu n'as pas participé — spectateur</p>
				</div>
			{:else if hasParticipated && deadlinePassed && !isJudging}
				<!-- Participated, deadline passed — can only view -->
				<div
					class="border-border bg-card rounded-lg border p-4 mt-2"
					data-testid="participate-section"
				>
					<h2 class="text-foreground mb-1 text-sm font-semibold">Mon estimation</h2>
					<p class="text-foreground text-sm font-medium" data-testid="my-answer">
						{myParticipation?.answer}
					</p>
					<p class="text-muted-foreground mt-1 text-xs">
						La date limite est dépassée, ton estimation est figée.
					</p>
				</div>
			{:else if data.bet.matchStatus !== 'open' && !isJudging}
				<!-- Match closed or non-open (not judging) -->
				<div
					class="border-border bg-card rounded-lg border p-4 mt-2"
					data-testid="participate-section"
				>
					{#if hasParticipated}
						<h2 class="text-foreground mb-1 text-sm font-semibold">Mon estimation</h2>
						<p class="text-foreground text-sm font-medium" data-testid="my-answer">
							{myParticipation?.answer}
						</p>
					{:else}
						<Button disabled data-testid="participate-btn">Participer (pari clôturé)</Button>
					{/if}
				</div>
			{:else if isJudging && hasParticipated}
				<!-- In judging: show my answer (read-only) -->
				<div
					class="border-border bg-card rounded-lg border p-4 mt-2"
					data-testid="participate-section"
				>
					<h2 class="text-foreground mb-1 text-sm font-semibold">Mon estimation</h2>
					<p class="text-foreground text-sm font-medium" data-testid="my-answer">
						{myParticipation?.answer}
					</p>
					<p class="text-muted-foreground mt-1 text-xs">
						Le pari est en jugement, ton estimation est figée.
					</p>
				</div>
			{/if}
		{/if}
	</div>
</div>
