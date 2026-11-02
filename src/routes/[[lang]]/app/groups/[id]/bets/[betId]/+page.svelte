<script lang="ts">
	import { page } from '$app/state';
	const english = $derived(page.url.pathname === '/en' || page.url.pathname.startsWith('/en/'));
	function t(fr: string, en: string): string {
		return english ? en : fr;
	}
	// Server actions currently return French messages rather than stable error codes.
	// Translate known messages exactly; never expose unknown backend errors in either locale.
	const errorTranslations: Record<string, string> = {
		"L'estimation est obligatoire.": 'A guess is required.',
		'Estimation trop longue.': 'Your guess must be at most 500 characters.',
		'Proposition invalide.': 'Invalid proposal.',
		'UUID juré invalide.': 'Invalid juror ID.',
		'La mise du créateur doit être supérieure à 0.': "The creator's stake must be greater than 0.",
		'La mise de la cible doit être supérieure à 0.': "The opponent's stake must be greater than 0.",
		'Le gage du créateur est obligatoire.': "The creator's forfeit is required.",
		'Le gage de la cible est obligatoire.': "The opponent's forfeit is required.",
		'Le jury doit avoir au moins un membre.': 'The jury must have at least one member.',
		'Un ou plusieurs jurés sont invalides.': 'One or more jurors are invalid.',
		'Vous devez sélectionner au moins un gagnant.': 'Select at least one winner.',
		'Un seul gagnant possible pour un duel Oui/Non.': 'A yes/no duel can have only one winner.',
		'Verdict invalide.': 'Invalid verdict.',
		'Non authentifie.': 'Please sign in.',
		'Non authentifié.': 'Please sign in.',
		'Parametres invalides.': 'Invalid parameters.',
		'Paramètres invalides.': 'Invalid parameters.',
		'Acces refuse.': 'Access denied.',
		'Accès refusé.': 'Access denied.',
		'Pari introuvable.': 'Bet not found.',
		'Match introuvable.': 'Match not found.',
		'Proposition introuvable.': 'Proposal not found.',
		'Gage introuvable.': 'Forfeit not found.',
		'Aucun match associe a ce pari.': 'No match is associated with this bet.',
		'Aucun match associé à ce pari.': 'No match is associated with this bet.',
		'Ce pari est clôturé, tu ne peux plus participer.':
			'This bet is closed; you can no longer participate.',
		'La date limite de participation est dépassée.': 'The participation deadline has passed.',
		'Ce pari est déjà soumis au jury ou clôturé.':
			'This bet has already been submitted to the jury or closed.',
		'Ce pari est déjà soumis au jury.': 'This bet has already been submitted to the jury.',
		'Seuls les participants peuvent soumettre au jury.':
			'Only participants can submit to the jury.',
		"Vous n'êtes pas juré de ce match.": 'You are not a juror for this match.',
		"Vous n'êtes pas participant de ce match.": 'You are not a participant in this match.',
		"Cette proposition n'est plus en cours de négociation.":
			'This proposal is no longer under negotiation.',
		'Cette proposition a expiré.': 'This proposal has expired.',
		'Vous avez déjà fait la dernière offre. Attendez la réponse de votre adversaire.':
			'You made the last offer. Wait for your opponent to respond.',
		'Ce défi est clôturé, il ne peut plus être accepté.':
			'This challenge is closed and can no longer be accepted.',
		'Le créateur ne peut pas accepter son propre défi.':
			'The creator cannot accept their own challenge.',
		'Vous avez déjà accepté ce défi.': 'You have already accepted this challenge.',
		"Ce défi est complet, le nombre maximum d'adversaires est atteint.":
			'This challenge is full; the maximum number of opponents has been reached.',
		'Identifiant du gage invalide.': 'Invalid forfeit ID.',
		'Format de preuve invalide. Utilisez jpg, png, webp, gif, mp4 ou webm.':
			'Invalid proof format. Use jpg, png, webp, gif, mp4 or webm.',
		'La preuve ne doit pas dépasser 10 Mo.': 'Proof must not exceed 10 MB.',
		"Ce gage n'est plus en attente.": 'This forfeit is no longer pending.',
		"Le débiteur n'a pas encore déclaré avoir fait son gage.":
			'The debtor has not yet marked the forfeit complete.',
		'Ce pari nest pas un pari au plus proche.': 'This is not a closest-guess bet.',
		'Ce pari nest pas un duel Oui/Non.': 'This is not a yes/no duel.',
		"L'annulation n'est pas possible sur un match résolu ou déjà annulé.":
			'A resolved or cancelled match cannot be cancelled.',
		'Données yesno introuvables.': 'Challenge details not found.',
		"Ce pari n'est pas un défi ouvert.": 'This bet is not an open challenge.',
		"Vous n'êtes pas autorisé à accepter ce défi.": 'You are not allowed to accept this challenge.',
		"Le nombre maximum d'adversaires est atteint.":
			'The maximum number of opponents has been reached.',
		'La proposition a déjà été traitée (race condition).':
			'This proposal has already been processed.',
		'Vous avez déjà fait la dernière offre. Seule la cible peut refuser en ce moment.':
			'You made the last offer. Only the opponent can decline it now.',
		'Cette proposition ne peut plus être annulée.': 'This proposal can no longer be cancelled.',
		'Seul le créateur du pari peut annuler la proposition.':
			'Only the bet creator can cancel the proposal.',
		'Ce match nest pas en phase de jugement.': 'This match is not being judged.',
		'Un ou plusieurs gagnants sélectionnés ne sont pas des participants.':
			'One or more selected winners are not participants.',
		'Le perdant sélectionné nest pas un participant de ce match.':
			'The selected loser is not a participant in this match.',
		"L'annulation unanime n'est possible que sur un match en cours ou en jugement.":
			'Unanimous cancellation is only possible for an open match or one under review.',
		'Ce match est déjà annulé, le retrait est impossible.':
			'This match is already cancelled; the request cannot be withdrawn.',
		"Le retrait n'est possible que sur un match en cours ou en jugement.":
			'A request can only be withdrawn for an open match or one under review.',
		"Vous n'êtes pas le débiteur de ce gage.": 'You are not the debtor for this forfeit.',
		"Vous n'êtes pas gagnant de ce pari.": 'You are not a winner of this bet.',
		'Ce gage ne peut plus être modifié.': 'This forfeit can no longer be changed.'
	};
	function localizeError(message: string | undefined): string {
		if (message && Object.hasOwn(errorTranslations, message)) {
			return english ? errorTranslations[message] : message;
		}
		return t(
			"L'action n'a pas pu être effectuée. Veuillez réessayer.",
			'The action could not be completed. Please try again.'
		);
	}
	import { resolveRoute } from '$lib/paths';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { track } from '$lib/analytics/client';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const groupHref = $derived(resolveRoute('/app/groups/[id]', { id: data.bet.groupId }));

	function formatDatetime(d: Date | string | null): string {
		if (!d) return t('Aucune', 'None');
		return new Date(d).toLocaleString(english ? 'en-GB' : 'fr-FR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDate(d: Date | string): string {
		return new Date(d).toLocaleDateString(english ? 'en-GB' : 'fr-FR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}

	const statusLabels: Record<string, string> = $derived({
		open: t('Ouvert', 'Open'),
		closed: t('Clôturé', 'Closed'),
		judging: t('En jugement', 'Under review'),
		resolved: t('Résolu', 'Resolved'),
		contested: t('Contesté', 'Disputed'),
		cancelled: t('Annulé', 'Cancelled')
	});

	const propositionStatusLabels: Record<string, string> = $derived({
		negotiating: t('En négociation', 'Negotiating'),
		accepted: t('Acceptée', 'Accepted'),
		refused: t('Refusée', 'Declined'),
		cancelled: t('Annulée', 'Cancelled'),
		expired: t('Expirée', 'Expired')
	});

	const matchStatusLabel = $derived(
		data.bet.matchStatus
			? (statusLabels[data.bet.matchStatus] ?? t('Statut inconnu', 'Unknown status'))
			: null
	);

	const juryModeLabel = $derived(
		data.bet.juryMode === 'unanimous' ? t('Unanimité', 'Unanimity') : t('Majorité', 'Majority')
	);

	const forfeitScopeLabel = $derived(
		data.bet.forfeitScope === 'all_losers'
			? t('Tous les perdants', 'All losers')
			: data.bet.forfeitScope === 'last_one'
				? t('Le dernier seulement', 'Only the last player')
				: null
	);

	const isYesno = $derived(data.bet.type === 'yesno');
	const yesno = $derived(data.bet.yesno ?? null);
	const proposition = $derived(data.bet.proposition ?? null);

	const isCurrentUserCreator = $derived(data.bet.creatorId === data.currentUserId);

	// Is this an open challenge?
	const isOpenChallenge = $derived(isYesno && yesno?.mode === 'open');

	// Open challenge state
	const openMatches = $derived(data.bet.openMatches ?? []);
	const betJurorsList = $derived(data.bet.betJurorsList ?? []);
	const openAcceptedCount = $derived(yesno?.acceptedCount ?? 0);
	const openMaxOpponents = $derived(yesno?.maxOpponents ?? null);
	const openIsFull = $derived(openMaxOpponents !== null && openAcceptedCount >= openMaxOpponents);
	// Has the current user already accepted this challenge?
	const hasAlreadyAccepted = $derived(openMatches.some((m) => m.acceptorId === data.currentUserId));
	// Can the current user accept? Not creator, not already accepted, not full, bet is open
	const canAcceptOpen = $derived(
		isOpenChallenge &&
			!isCurrentUserCreator &&
			!hasAlreadyAccepted &&
			!openIsFull &&
			data.bet.status === 'open'
	);

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
			? { player: creatorInfo, label: yesno?.choiceA ?? t('Camp A', 'Side A') }
			: { player: targetInfo, label: yesno?.choiceA ?? t('Camp A', 'Side A') }
	);
	const campB = $derived(
		creatorIsA
			? { player: targetInfo, label: yesno?.choiceB ?? t('Camp B', 'Side B') }
			: { player: creatorInfo, label: yesno?.choiceB ?? t('Camp B', 'Side B') }
	);

	const propStatusLabel = $derived(
		proposition
			? (propositionStatusLabels[proposition.status] ?? t('Statut inconnu', 'Unknown status'))
			: null
	);

	const isCurrentUserTarget = $derived(
		proposition ? proposition.targetId === data.currentUserId : false
	);

	// Negotiation state
	const propIsNegotiating = $derived(proposition?.status === 'negotiating');
	const propIsAccepted = $derived(proposition?.status === 'accepted');

	// Who made the last offer
	const lastProposerId = $derived(proposition?.lastProposerId ?? null);
	const currentUserIsLastProposer = $derived(
		lastProposerId !== null && lastProposerId === data.currentUserId
	);

	// Can current user accept/refuse/counter-propose?
	// Only if propIsNegotiating AND they did NOT make the last offer AND they are creator or target
	const canNegotiate = $derived(
		propIsNegotiating && !currentUserIsLastProposer && (isCurrentUserCreator || isCurrentUserTarget)
	);

	// Can current user cancel? Only if creator, negotiating, and they ARE the last proposer
	// (i.e. they made the last offer and must wait — they can cancel instead)
	// Actually: creator can cancel at any time while negotiating (regardless of last proposer)
	const canCancel = $derived(propIsNegotiating && isCurrentUserCreator);

	// Counter-propose form state
	let showCounterForm = $state(false);
	let changeJury = $state(false);

	// Pre-fill counter-propose form with current terms
	let counterStakeCreator = $state('');
	let counterStakeTarget = $state('');
	let counterForfeitCreator = $state('');
	let counterForfeitTarget = $state('');

	// Selected jury IDs in counter form
	let counterJuryIds = $state<string[]>([]);

	$effect(() => {
		if (proposition && showCounterForm) {
			counterStakeCreator = proposition.stakeCreator ?? '';
			counterStakeTarget = proposition.stakeTarget ?? '';
			counterForfeitCreator = proposition.forfeitCreator ?? '';
			counterForfeitTarget = proposition.forfeitTarget ?? '';
			counterJuryIds = proposition.jurors.map((j) => j.userId);
		}
	});

	function toggleCounterJury(userId: string) {
		if (counterJuryIds.includes(userId)) {
			counterJuryIds = counterJuryIds.filter((id) => id !== userId);
		} else {
			counterJuryIds = [...counterJuryIds, userId];
		}
	}

	// Closest bet participation logic
	const isClosest = $derived(data.bet.type === 'closest');
	const myParticipation = $derived(data.bet.myParticipation ?? null);
	const hasParticipated = $derived(myParticipation !== null);

	// Deadline check: is participation still open?
	const deadlinePassed = $derived(
		data.bet.participationDeadline ? new Date() > new Date(data.bet.participationDeadline) : false
	);

	const canParticipate = $derived(isClosest && data.bet.matchStatus === 'open' && !deadlinePassed);

	// Can submit to jury (closest): must be closest, match open, and user is a participant
	const canSubmitToJury = $derived(
		isClosest && data.bet.matchStatus === 'open' && data.isParticipant
	);

	// Can submit to jury (yesno): must be yesno duel match open, and user is a participant
	const canSubmitToJuryYesno = $derived(
		isYesno && data.bet.matchStatus === 'open' && data.isParticipant
	);

	// Is judging
	const isJudging = $derived(data.bet.matchStatus === 'judging');

	// Is resolved
	const isResolved = $derived(data.bet.matchStatus === 'resolved');

	// Resolution data
	const resolution = $derived(data.bet.resolution ?? null);

	// Jury votes
	const juryVotes = $derived(data.bet.juryVotes ?? []);

	// My current vote (if any)
	const myVote = $derived(juryVotes.find((v) => v.jurorId === data.currentUserId) ?? null);

	// Vote form state
	let voteVerdict = $state<'winners_selected' | 'not_resolved' | ''>('');
	let voteWinnerIds = $state<string[]>([]);
	let voteLoserId = $state<string>('');

	// Pre-fill vote form with my existing vote
	$effect(() => {
		if (myVote) {
			voteVerdict = myVote.verdict;
			voteWinnerIds = myVote.winners.map((w) => w.userId);
			voteLoserId = myVote.losers[0]?.userId ?? '';
		}
	});

	// Toggle winner checkbox for closest (multi-winner)
	function toggleWinner(userId: string) {
		if (voteWinnerIds.includes(userId)) {
			voteWinnerIds = voteWinnerIds.filter((id) => id !== userId);
		} else {
			voteWinnerIds = [...voteWinnerIds, userId];
		}
	}

	const isLastOne = $derived(data.bet.forfeitScope === 'last_one');

	// Stake label for participate button
	const stakeLabel = $derived(
		data.bet.stakeType === 'points'
			? t(`Miser ${data.bet.stakeAmount} points`, `Stake ${data.bet.stakeAmount} points`)
			: t(
					`Parier (gage : ${data.bet.forfeitDescription})`,
					`Bet (forfeit: ${data.bet.forfeitDescription})`
				)
	);

	// Participation form answer state
	let answerValue = $derived.by(() => data.bet.myParticipation?.answer ?? '');

	// ─── Cancellation state ───────────────────────────────────────────────────

	const isCancelled = $derived(data.bet.matchStatus === 'cancelled');

	// Participants (for duel: from participants array; for closest: from participants array)
	// cancellationRequests: user IDs who have requested cancellation
	const cancellationRequests = $derived(data.bet.cancellationRequests ?? []);
	const totalParticipants = $derived(data.bet.participants.length);

	// Has the current user already requested cancellation?
	const hasCancellationRequest = $derived(cancellationRequests.includes(data.currentUserId));

	// Can request cancellation: must be a participant, match is open or judging, not yet cancelled, not resolved
	const canRequestCancellation = $derived(
		data.isParticipant &&
			!isCancelled &&
			data.bet.matchStatus !== 'resolved' &&
			(data.bet.matchStatus === 'open' || data.bet.matchStatus === 'judging')
	);

	// ─── Gages (forfeits) ─────────────────────────────────────────────────────

	// Is the current user a winner of the resolved match?
	const isCurrentUserWinner = $derived(
		resolution?.winners.some((w) => w.userId === data.currentUserId) ?? false
	);

	// State for claim forfeit form (show/hide per forfeit id)
	let claimingForfeitId = $state<string | null>(null);

	// Track bet viewed
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

	// Track jury section viewed (quand le panneau jury-vote-section devient visible)
	$effect(() => {
		if (isJudging && data.isJuror) {
			track('jury_section_viewed', {
				bet_id: data.bet.id,
				match_id: data.bet.matchId,
				bet_type: data.bet.type
			});
		}
	});

	// Track resolution section viewed (quand le verdict du jury est affiché)
	$effect(() => {
		if (isResolved && resolution) {
			track('resolution_section_viewed', {
				bet_id: data.bet.id,
				bet_type: data.bet.type,
				stake_type: data.bet.stakeType
			});
		}
	});
</script>

<div class="container mx-auto max-w-2xl px-4 py-10">
	<!-- Navigation retour -->
	<div class="mb-6">
		<a
			href={groupHref}
			class="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
		>
			{t('← Retour au groupe', '← Back to group')}
		</a>
	</div>

	<!-- En-tête du pari -->
	<div class="mb-6 flex items-start justify-between gap-4">
		<div>
			<div class="mb-1 flex flex-wrap items-center gap-2">
				{#if isYesno && isOpenChallenge}
					<span
						class="bg-purple-100 text-purple-700 rounded-full px-2 py-0.5 text-xs font-medium"
						data-testid="bet-type-badge"
					>
						{t('Défi ouvert', 'Open challenge')}
					</span>
				{:else if isYesno}
					<span
						class="bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 text-xs font-medium"
						data-testid="bet-type-badge"
					>
						{t('Défi', 'Challenge')}
					</span>
				{:else}
					<span
						class="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium"
						data-testid="bet-type-badge"
					>
						{t('Au plus proche', 'Closest guess')}
					</span>
				{/if}

				<!-- Open challenge: status badge -->
				{#if isOpenChallenge}
					<span
						class="rounded-full px-2 py-0.5 text-xs font-medium {data.bet.status === 'open'
							? 'bg-green-100 text-green-700'
							: data.bet.status === 'closed'
								? 'bg-muted text-muted-foreground'
								: 'bg-muted text-muted-foreground'}"
						data-testid="bet-status-badge"
					>
						{data.bet.status === 'open'
							? openIsFull
								? t('Complet', 'Full')
								: t('Ouvert', 'Open')
							: data.bet.status === 'closed'
								? t('Complet', 'Full')
								: (statusLabels[data.bet.status] ?? t('Statut inconnu', 'Unknown status'))}
					</span>
				{:else if isYesno && proposition}
					{#if propIsAccepted && (data.bet.matchStatus === 'judging' || data.bet.matchStatus === 'resolved')}
						<!-- Duel accepté + match en jugement ou résolu → badge statut match -->
						<span
							class="rounded-full px-2 py-0.5 text-xs font-medium {data.bet.matchStatus ===
							'resolved'
								? 'bg-blue-100 text-blue-700'
								: 'bg-amber-100 text-amber-700'}"
							data-testid="bet-status-badge"
						>
							{matchStatusLabel}
						</span>
					{:else}
						<!-- Négociation ou accepté (match open) → badge proposition -->
						<span
							class="rounded-full px-2 py-0.5 text-xs font-medium {propIsNegotiating
								? 'bg-amber-100 text-amber-700'
								: 'bg-green-100 text-green-700'}"
							data-testid="proposition-status-badge"
						>
							{propStatusLabel}
						</span>
						{#if propIsNegotiating && !currentUserIsLastProposer && (isCurrentUserCreator || isCurrentUserTarget)}
							<span
								class="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs font-medium"
								data-testid="proposition-received-badge"
							>
								{t('À toi de jouer', 'Your turn')}
							</span>
						{:else if propIsNegotiating && currentUserIsLastProposer}
							<span
								class="bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 text-xs font-medium"
								data-testid="proposition-waiting-badge"
							>
								{t('En attente de réponse', 'Awaiting response')}
							</span>
						{/if}
					{/if}
				{:else if matchStatusLabel}
					<span
						class="rounded-full px-2 py-0.5 text-xs font-medium {data.bet.matchStatus === 'open'
							? 'bg-green-100 text-green-700'
							: data.bet.matchStatus === 'judging'
								? 'bg-amber-100 text-amber-700'
								: data.bet.matchStatus === 'resolved'
									? 'bg-blue-100 text-blue-700'
									: 'bg-muted text-muted-foreground'}"
						data-testid="bet-status-badge"
					>
						{matchStatusLabel}
					</span>
				{/if}
			</div>
			<h1 class="text-foreground text-2xl font-bold bw-display" data-testid="bet-title">
				{data.bet.title}
			</h1>
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
				<h2 class="text-foreground mb-3 text-sm font-semibold">
					{t('Les deux camps', 'Both sides')}
				</h2>
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
							{t('Camp A', 'Side A')}
						</span>
						<p class="text-foreground text-sm font-medium" data-testid="camp-a-choice">
							{yesno.choiceA}
						</p>
						{#if campA.player}
							<p class="text-muted-foreground text-xs" data-testid="camp-a-player">
								{campA.player.pseudo}{campA.player.userId === data.currentUserId
									? t(' (moi)', ' (me)')
									: ''}
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
							{t('Camp B', 'Side B')}
						</span>
						<p class="text-foreground text-sm font-medium" data-testid="camp-b-choice">
							{yesno.choiceB}
						</p>
						{#if campB.player}
							<p class="text-muted-foreground text-xs" data-testid="camp-b-player">
								{campB.player.pseudo}{campB.player.userId === data.currentUserId
									? t(' (moi)', ' (me)')
									: ''}
							</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- ── OPEN CHALLENGE SECTION ──────────────────────────────────── -->
			{#if isOpenChallenge}
				<!-- Mises en jeu (open mode — termes fixes) -->
				<div class="border-border bg-card rounded-lg border p-4" data-testid="open-stakes">
					<h2 class="text-foreground mb-2 text-sm font-semibold">
						{t('Mises en jeu (termes fixes)', 'Stakes (fixed terms)')}
					</h2>
					{#if data.bet.stakeType === 'points'}
						<div class="grid grid-cols-2 gap-3">
							<div>
								<p class="text-muted-foreground text-xs">
									{creatorInfo?.pseudo ?? t('Créateur', 'Creator')} ({t('camp', 'side')}
									{yesno?.creatorSide?.toUpperCase()})
								</p>
								<p class="text-foreground text-lg font-bold" data-testid="open-stake-creator">
									{yesno?.openStakeCreator ?? '—'} pts
								</p>
							</div>
							<div>
								<p class="text-muted-foreground text-xs">
									{t('Adversaire', 'Opponent')} ({t('camp', 'side')}
									{yesno?.creatorSide === 'a' ? 'B' : 'A'})
								</p>
								<p class="text-foreground text-lg font-bold" data-testid="open-stake-opponent">
									{yesno?.openStakeOpponent ?? '—'} pts
								</p>
							</div>
						</div>
					{:else}
						<div class="flex flex-col gap-2">
							<div>
								<p class="text-muted-foreground text-xs">
									{t('Gage de', 'Forfeit for')}
									{creatorInfo?.pseudo ?? t('Créateur', 'Creator')}
									{t('(si perd)', '(if they lose)')}
								</p>
								<p class="text-foreground text-sm" data-testid="open-forfeit-creator">
									{yesno?.openForfeitCreator ?? '—'}
								</p>
							</div>
							<div>
								<p class="text-muted-foreground text-xs">
									{t(
										'Gage de chaque adversaire (si perd)',
										"Each opponent's forfeit (if they lose)"
									)}
								</p>
								<p class="text-foreground text-sm" data-testid="open-forfeit-opponent">
									{yesno?.openForfeitOpponent ?? '—'}
								</p>
							</div>
						</div>
					{/if}
				</div>

				<!-- Jury du défi ouvert -->
				{#if betJurorsList.length > 0}
					<div class="border-border bg-card rounded-lg border p-4" data-testid="open-jury">
						<h2 class="text-foreground mb-2 text-sm font-semibold">Jury — {juryModeLabel}</h2>
						<ul class="flex flex-col gap-1" data-testid="open-jury-members">
							{#each betJurorsList as juror (juror.userId)}
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
										{juror.pseudo}{juror.userId === data.currentUserId ? t(' (moi)', ' (me)') : ''}
									</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- Progression du défi ouvert -->
				<div
					class="border-border bg-card rounded-lg border p-4"
					data-testid="open-challenge-progress"
				>
					<h2 class="text-foreground mb-2 text-sm font-semibold">
						{t('Progression', 'Progress')} ({openAcceptedCount} / {openMaxOpponents ?? '∞'})
					</h2>
					{#if openIsFull}
						<p
							class="text-muted-foreground mb-3 text-sm font-medium"
							data-testid="open-challenge-full-msg"
						>
							{t(
								'Ce défi est complet — tous les adversaires ont rejoint.',
								'This challenge is full — all opponents have joined.'
							)}
						</p>
					{:else if data.bet.status === 'open'}
						<p class="text-muted-foreground mb-3 text-sm" data-testid="open-challenge-open-msg">
							{t(
								`${openAcceptedCount} adversaire${openAcceptedCount > 1 ? 's ont' : ' a'} accepté sur ${openMaxOpponents ?? '∞'} maximum.`,
								`${openAcceptedCount} opponent${openAcceptedCount === 1 ? ' has' : 's have'} accepted out of ${openMaxOpponents ?? '∞'} maximum.`
							)}
						</p>
					{/if}

					<!-- Bouton Accepter -->
					{#if canAcceptOpen}
						<div data-testid="accept-open-section">
							{#if (form as { challengeError?: string } | null)?.challengeError}
								<p class="text-destructive mb-2 text-sm" data-testid="challenge-error">
									{localizeError((form as { challengeError?: string }).challengeError)}
								</p>
							{/if}
							<form method="POST" action="?/accept_open_challenge" use:enhance>
								<Button
									type="submit"
									class="bg-green-600 hover:bg-green-700"
									data-testid="accept-open-btn"
								>
									{t('Accepter le défi', 'Accept challenge')}
								</Button>
							</form>
						</div>
					{:else if hasAlreadyAccepted}
						<p class="text-green-700 text-sm font-medium" data-testid="already-accepted-msg">
							{t('Vous avez déjà accepté ce défi.', 'You have already accepted this challenge.')}
						</p>
					{:else if isCurrentUserCreator}
						<p class="text-muted-foreground text-sm" data-testid="creator-cannot-accept-msg">
							{t('Vous êtes le créateur de ce défi.', 'You created this challenge.')}
						</p>
					{:else if openIsFull}
						<p class="text-muted-foreground text-sm" data-testid="open-challenge-full-static">
							{t(
								'Défi complet — vous ne pouvez plus accepter.',
								'The challenge is full — you can no longer accept.'
							)}
						</p>
					{/if}
				</div>

				<!-- Liste des duels créés -->
				{#if openMatches.length > 0}
					<div class="border-border bg-card rounded-lg border p-4" data-testid="open-matches-list">
						<h2 class="text-foreground mb-2 text-sm font-semibold">
							{t('Duels créés', 'Duels created')} ({openMatches.length})
						</h2>
						<ul class="flex flex-col gap-2">
							{#each openMatches as match (match.matchId)}
								<li
									class="flex items-center justify-between gap-2 rounded-md border p-2"
									data-testid="open-match-item"
								>
									<div class="flex items-center gap-2">
										{#if match.acceptorAvatarUrl}
											<img
												src={match.acceptorAvatarUrl}
												alt={match.acceptorPseudo}
												class="h-6 w-6 rounded-full object-cover"
											/>
										{:else}
											<div
												class="bg-muted text-muted-foreground flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium"
											>
												{match.acceptorPseudo.charAt(0).toUpperCase()}
											</div>
										{/if}
										<span class="text-foreground text-sm" data-testid="match-acceptor">
											{match.acceptorPseudo}{match.acceptorId === data.currentUserId
												? t(' (moi)', ' (me)')
												: ''}
										</span>
									</div>
									<span
										class="rounded-full px-2 py-0.5 text-xs font-medium {match.matchStatus ===
										'open'
											? 'bg-green-100 text-green-700'
											: match.matchStatus === 'judging'
												? 'bg-amber-100 text-amber-700'
												: 'bg-muted text-muted-foreground'}"
										data-testid="match-status"
									>
										{statusLabels[match.matchStatus] ?? t('Statut inconnu', 'Unknown status')}
									</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}

			<!-- Mise / Gages (yesno duel) — termes courants de la proposition -->
			{#if proposition}
				<div class="border-border bg-card rounded-lg border p-4" data-testid="yesno-stakes">
					<h2 class="text-foreground mb-2 text-sm font-semibold">{t('Mises en jeu', 'Stakes')}</h2>
					{#if data.bet.stakeType === 'points'}
						<div class="grid grid-cols-2 gap-3">
							<div>
								<p class="text-muted-foreground text-xs">
									{creatorInfo?.pseudo ?? t('Créateur', 'Creator')}
								</p>
								<p class="text-foreground text-lg font-bold" data-testid="stake-creator">
									{proposition.stakeCreator} pts
								</p>
							</div>
							<div>
								<p class="text-muted-foreground text-xs">
									{targetInfo?.pseudo ?? t('Cible', 'Opponent')}
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
									{t('Gage de', 'Forfeit for')}
									{creatorInfo?.pseudo ?? t('Créateur', 'Creator')}
									{t('(si perd)', '(if they lose)')}
								</p>
								<p class="text-foreground text-sm" data-testid="forfeit-creator">
									{proposition.forfeitCreator}
								</p>
							</div>
							<div>
								<p class="text-muted-foreground text-xs">
									{t('Gage de', 'Forfeit for')}
									{targetInfo?.pseudo ?? t('Cible', 'Opponent')}
									{t('(si perd)', '(if they lose)')}
								</p>
								<p class="text-foreground text-sm" data-testid="forfeit-target">
									{proposition.forfeitTarget}
								</p>
							</div>
						</div>
					{/if}
				</div>

				<!-- Échéance de la proposition (only when negotiating) -->
				{#if propIsNegotiating}
					<div class="border-border bg-card rounded-lg border p-4" data-testid="proposition-expiry">
						<h2 class="text-foreground mb-1 text-sm font-semibold">
							{t('Échéance de la proposition', 'Proposal deadline')}
						</h2>
						<p class="text-foreground text-sm" data-testid="expiry-value">
							{formatDatetime(proposition.expiresAt)}
						</p>
					</div>
				{/if}

				<!-- Jury proposé / final -->
				{#if proposition.jurors.length > 0}
					<div class="border-border bg-card rounded-lg border p-4" data-testid="bet-jury">
						<h2 class="text-foreground mb-2 text-sm font-semibold">
							{propIsAccepted ? 'Jury' : t('Jury proposé', 'Proposed jury')} — {juryModeLabel}
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
										{juror.pseudo}{juror.userId === data.currentUserId ? t(' (moi)', ' (me)') : ''}
									</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- Historique des offres -->
				{#if proposition.offers.length > 0}
					<div class="border-border bg-card rounded-lg border p-4" data-testid="offers-history">
						<h2 class="text-foreground mb-3 text-sm font-semibold">
							{t('Historique des offres', 'Offer history')} ({proposition.offers.length})
						</h2>
						<ol class="flex flex-col gap-3">
							{#each proposition.offers as offer, i (offer.id)}
								<li
									class="relative flex flex-col gap-1 rounded-md border p-3 {offer.authorId ===
									data.currentUserId
										? 'border-primary/40 bg-primary/5'
										: 'border-border'}"
									data-testid="offer-item"
								>
									<div class="flex items-center justify-between gap-2">
										<div class="flex items-center gap-2">
											{#if offer.authorAvatarUrl}
												<img
													src={offer.authorAvatarUrl}
													alt={offer.authorPseudo}
													class="h-5 w-5 rounded-full object-cover"
												/>
											{:else}
												<div
													class="bg-muted text-muted-foreground flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium"
												>
													{offer.authorPseudo.charAt(0).toUpperCase()}
												</div>
											{/if}
											<span class="text-foreground text-sm font-medium" data-testid="offer-author">
												{offer.authorPseudo}{offer.authorId === data.currentUserId
													? t(' (moi)', ' (me)')
													: ''}
											</span>
											{#if i === 0}
												<span
													class="text-muted-foreground rounded-full bg-gray-100 px-1.5 py-0.5 text-xs"
													>{t('Offre initiale', 'Initial offer')}</span
												>
											{/if}
										</div>
										<span class="text-muted-foreground text-xs" data-testid="offer-date">
											{formatDatetime(offer.createdAt)}
										</span>
									</div>
									<div class="mt-1" data-testid="offer-terms">
										{#if data.bet.stakeType === 'points'}
											<span class="text-foreground text-sm">
												{creatorInfo?.pseudo ?? t('Créateur', 'Creator')} :
												<strong data-testid="offer-stake-creator">{offer.stakeCreator} pts</strong>
												—
												{targetInfo?.pseudo ?? t('Cible', 'Opponent')} :
												<strong data-testid="offer-stake-target">{offer.stakeTarget} pts</strong>
											</span>
										{:else}
											<div class="flex flex-col gap-0.5">
												<span class="text-foreground text-sm">
													{t('Gage', 'Forfeit')}
													{creatorInfo?.pseudo ?? t('Créateur', 'Creator')} :
													<span data-testid="offer-forfeit-creator">{offer.forfeitCreator}</span>
												</span>
												<span class="text-foreground text-sm">
													{t('Gage', 'Forfeit')}
													{targetInfo?.pseudo ?? t('Cible', 'Opponent')} :
													<span data-testid="offer-forfeit-target">{offer.forfeitTarget}</span>
												</span>
											</div>
										{/if}
									</div>
								</li>
							{/each}
						</ol>
					</div>
				{/if}

				<!-- Message d'erreur négociation -->
				{#if form?.negotiateError}
					<div
						class="border-destructive/30 bg-destructive/10 rounded-lg border p-3"
						data-testid="negotiate-error"
					>
						<p class="text-destructive text-sm">{localizeError(form.negotiateError)}</p>
					</div>
				{/if}

				<!-- Actions de négociation -->
				{#if propIsNegotiating}
					<div
						class="border-border bg-card rounded-lg border p-4"
						data-testid="negotiation-actions"
					>
						<h2 class="text-foreground mb-3 text-sm font-semibold">Actions</h2>

						{#if canNegotiate}
							<!-- Accepter -->
							<div class="flex flex-wrap gap-2">
								<form method="POST" action="?/accept_proposition" use:enhance>
									<input type="hidden" name="propositionId" value={proposition.id} />
									<Button
										type="submit"
										variant="default"
										class="bg-green-600 hover:bg-green-700"
										data-testid="accept-btn"
									>
										{t('Accepter', 'Accept')}
									</Button>
								</form>

								<!-- Refuser -->
								<form method="POST" action="?/refuse_proposition" use:enhance>
									<input type="hidden" name="propositionId" value={proposition.id} />
									<Button type="submit" variant="outline" data-testid="refuse-btn"
										>{t('Refuser', 'Decline')}</Button
									>
								</form>

								<!-- Contre-proposer -->
								<Button
									variant="outline"
									onclick={() => (showCounterForm = !showCounterForm)}
									data-testid="counter-propose-btn"
								>
									{showCounterForm
										? t('Annuler la contre-offre', 'Cancel counteroffer')
										: t('Contre-proposer', 'Make counteroffer')}
								</Button>
							</div>

							<!-- Formulaire de contre-proposition -->
							{#if showCounterForm}
								<form
									method="POST"
									action="?/counter_propose"
									use:enhance
									class="mt-4 flex flex-col gap-3 border-t pt-4"
									data-testid="counter-propose-form"
								>
									<input type="hidden" name="propositionId" value={proposition.id} />
									<input type="hidden" name="stakeType" value={data.bet.stakeType} />
									<input type="hidden" name="changeJury" value={changeJury.toString()} />

									{#if data.bet.stakeType === 'points'}
										<div class="grid grid-cols-2 gap-3">
											<div>
												<label
													for="counterStakeCreator"
													class="text-foreground mb-1 block text-sm font-medium"
												>
													{t('Mise de', 'Stake for')}
													{creatorInfo?.pseudo ?? t('Créateur', 'Creator')} (pts)
												</label>
												<input
													id="counterStakeCreator"
													name="stakeCreator"
													type="number"
													min="0.01"
													step="0.01"
													class="border-input bg-background text-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1"
													bind:value={counterStakeCreator}
													data-testid="counter-stake-creator"
													required
												/>
											</div>
											<div>
												<label
													for="counterStakeTarget"
													class="text-foreground mb-1 block text-sm font-medium"
												>
													{t('Mise de', 'Stake for')}
													{targetInfo?.pseudo ?? t('Cible', 'Opponent')} (pts)
												</label>
												<input
													id="counterStakeTarget"
													name="stakeTarget"
													type="number"
													min="0.01"
													step="0.01"
													class="border-input bg-background text-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1"
													bind:value={counterStakeTarget}
													data-testid="counter-stake-target"
													required
												/>
											</div>
										</div>
									{:else}
										<div>
											<label
												for="counterForfeitCreator"
												class="text-foreground mb-1 block text-sm font-medium"
											>
												{t('Gage de', 'Forfeit for')}
												{creatorInfo?.pseudo ?? t('Créateur', 'Creator')}
												{t('(si perd)', '(if they lose)')}
											</label>
											<input
												id="counterForfeitCreator"
												name="forfeitCreator"
												type="text"
												class="border-input bg-background text-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1"
												bind:value={counterForfeitCreator}
												data-testid="counter-forfeit-creator"
												required
											/>
										</div>
										<div>
											<label
												for="counterForfeitTarget"
												class="text-foreground mb-1 block text-sm font-medium"
											>
												{t('Gage de', 'Forfeit for')}
												{targetInfo?.pseudo ?? t('Cible', 'Opponent')}
												{t('(si perd)', '(if they lose)')}
											</label>
											<input
												id="counterForfeitTarget"
												name="forfeitTarget"
												type="text"
												class="border-input bg-background text-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1"
												bind:value={counterForfeitTarget}
												data-testid="counter-forfeit-target"
												required
											/>
										</div>
									{/if}

									<!-- Option de modifier le jury -->
									<div>
										<label class="flex cursor-pointer items-center gap-2">
											<input
												type="checkbox"
												class="rounded"
												bind:checked={changeJury}
												data-testid="change-jury-checkbox"
											/>
											<span class="text-foreground text-sm"
												>{t('Modifier le jury', 'Change the jury')}</span
											>
										</label>
									</div>

									{#if changeJury}
										<div data-testid="counter-jury-section">
											<p class="text-foreground mb-2 text-sm font-medium">
												{t('Nouveaux jurés', 'New jurors')}
											</p>
											<div class="flex flex-col gap-1">
												{#each data.bet.visibility as member (member.userId)}
													<label
														class="flex cursor-pointer items-center gap-2 rounded-md p-1 hover:bg-gray-50"
													>
														<input
															type="checkbox"
															name="juryUserIds"
															value={member.userId}
															checked={counterJuryIds.includes(member.userId)}
															onchange={() => toggleCounterJury(member.userId)}
															class="rounded"
														/>
														<span class="text-foreground text-sm">
															{member.pseudo}{member.userId === data.currentUserId
																? t(' (moi)', ' (me)')
																: ''}
														</span>
													</label>
												{/each}
											</div>
										</div>
									{/if}

									<Button type="submit" data-testid="counter-submit-btn">
										{t('Envoyer la contre-offre', 'Send counteroffer')}
									</Button>
								</form>
							{/if}
						{:else if currentUserIsLastProposer && (isCurrentUserCreator || isCurrentUserTarget)}
							<!-- Waiting for the other party -->
							<p class="text-muted-foreground text-sm" data-testid="waiting-message">
								{t(
									'Vous avez fait la dernière offre. En attente de réponse de votre adversaire.',
									"You made the last offer. Waiting for your opponent's response."
								)}
							</p>
						{:else}
							<p class="text-muted-foreground text-sm">
								{t('Vous ne participez pas à ce duel.', 'You are not taking part in this duel.')}
							</p>
						{/if}

						<!-- Annuler (créateur uniquement, toujours possible pendant la négociation) -->
						{#if canCancel}
							<div class="mt-3 border-t pt-3">
								<form method="POST" action="?/cancel_proposition" use:enhance>
									<input type="hidden" name="propositionId" value={proposition.id} />
									<Button
										type="submit"
										variant="ghost"
										class="text-destructive hover:text-destructive text-sm"
										data-testid="cancel-proposition-btn"
									>
										{t('Annuler le duel', 'Cancel duel')}
									</Button>
								</form>
							</div>
						{/if}
					</div>
				{:else if propIsAccepted}
					<!-- Match accepted -->
					<div
						class="border-green-200 bg-green-50 rounded-lg border p-4"
						data-testid="accepted-section"
					>
						<h2 class="text-green-800 mb-1 text-sm font-semibold">
							{t('Duel accepté !', 'Duel accepted!')}
						</h2>
						<p class="text-green-700 text-sm">
							{#if data.bet.matchStatus === 'resolved'}
								{t('Duel terminé — résolu par le jury.', 'Duel finished — decided by the jury.')}
							{:else}
								{t(
									'Les termes sont figés. Le match est en cours (statut :',
									'The terms are fixed. The match is in progress (status:'
								)}
								{matchStatusLabel ?? '—'}).
							{/if}
						</p>
					</div>
				{:else}
					<!-- Proposition terminée (refusée / annulée / expirée) -->
					<div class="border-border bg-card rounded-lg border p-4" data-testid="terminal-section">
						<p class="text-muted-foreground text-sm">
							{#if proposition.status === 'refused'}
								{t('Ce duel a été refusé.', 'This duel was declined.')}
							{:else if proposition.status === 'cancelled'}
								{t(
									'Ce duel a été annulé par le créateur.',
									'This duel was cancelled by its creator.'
								)}
							{:else if proposition.status === 'expired'}
								{t('Ce duel a expiré sans réponse.', 'This duel expired without a response.')}
							{/if}
						</p>
					</div>
				{/if}
			{/if}
		{:else}
			<!-- closest bet: stake info -->
			<div class="border-border bg-card rounded-lg border p-4" data-testid="bet-stake">
				<h2 class="text-foreground mb-2 text-sm font-semibold">{t('Mise', 'Stake')}</h2>
				{#if data.bet.stakeType === 'points'}
					<p class="text-foreground text-lg font-bold" data-testid="stake-amount">
						{data.bet.stakeAmount} points
					</p>
				{:else}
					<p class="text-foreground font-medium" data-testid="forfeit-description">
						{t('Gage', 'Forfeit')} : {data.bet.forfeitDescription}
					</p>
					{#if forfeitScopeLabel}
						<p class="text-muted-foreground mt-1 text-sm" data-testid="forfeit-scope">
							{t('Périmètre', 'Scope')} : {forfeitScopeLabel}
						</p>
					{/if}
				{/if}
			</div>

			<!-- Deadline (closest) -->
			<div class="border-border bg-card rounded-lg border p-4" data-testid="bet-deadline">
				<h2 class="text-foreground mb-1 text-sm font-semibold">
					{t('Date limite de participation', 'Participation deadline')}
				</h2>
				<p class="text-foreground text-sm" data-testid="deadline-value">
					{formatDatetime(data.bet.participationDeadline)}
				</p>
			</div>

			<!-- Réponses cachées (closest) -->
			<div class="border-border bg-card rounded-lg border p-4" data-testid="bet-hide-answers">
				<h2 class="text-foreground mb-1 text-sm font-semibold">{t('Réponses', 'Answers')}</h2>
				<p class="text-foreground text-sm">
					{data.bet.hideAnswers && !isJudging
						? t("Cachées jusqu'à la soumission au jury", 'Hidden until submission to the jury')
						: t('Visibles par tous', 'Visible to everyone')}
				</p>
			</div>

			<!-- Jury (closest — from match_jurors) -->
			<div class="border-border bg-card rounded-lg border p-4" data-testid="bet-jury">
				<h2 class="text-foreground mb-2 text-sm font-semibold">
					Jury — {juryModeLabel}
				</h2>
				{#if data.bet.jurors.length === 0}
					<p class="text-muted-foreground text-sm">{t('Aucun juré.', 'No jurors.')}</p>
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
									{juror.pseudo}{juror.userId === data.currentUserId ? t(' (moi)', ' (me)') : ''}
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
					<p class="text-muted-foreground text-sm">
						{t("Personne n'a encore participé.", 'Nobody has participated yet.')}
					</p>
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
										{participant.pseudo}{participant.userId === data.currentUserId
											? t(' (moi)', ' (me)')
											: ''}
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
										{t('Réponse cachée', 'Answer hidden')}
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
				{t('Visibilité', 'Visibility')} ({data.bet.visibility.length} participant{data.bet
					.visibility.length > 1
					? 's'
					: ''})
			</h2>
			<p class="text-muted-foreground mb-2 text-xs">
				{t(
					'La liste de visibilité est figée à la création et ne peut pas être modifiée.',
					'The visibility list is fixed at creation and cannot be changed.'
				)}
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
							{member.pseudo}{member.userId === data.currentUserId ? t(' (moi)', ' (me)') : ''}
						</span>
					</li>
				{/each}
			</ul>
		</div>

		<!-- Créé le -->
		<p class="text-muted-foreground text-xs">
			{t('Créé le', 'Created on')}
			{formatDate(data.bet.createdAt)}
		</p>

		<!-- Yesno: Soumettre au jury (participants, match open) -->
		{#if canSubmitToJuryYesno}
			<div
				class="border-border bg-card mt-2 rounded-lg border p-4"
				data-testid="submit-to-jury-yesno-section"
			>
				<h2 class="text-foreground mb-1 text-sm font-semibold">
					{t('Soumettre au jury', 'Submit to jury')}
				</h2>
				<p class="text-muted-foreground mb-3 text-xs">
					{t(
						"Soumettre le duel au jury pour qu'il désigne le gagnant.",
						'Submit the duel to the jury to choose a winner.'
					)}
				</p>
				{#if (form as { submitError?: string } | null)?.submitError}
					<p class="text-destructive mb-3 text-sm" data-testid="submit-error">
						{localizeError((form as { submitError?: string }).submitError)}
					</p>
				{/if}
				<form method="POST" action="?/submit_to_jury_yesno" use:enhance>
					<Button type="submit" variant="outline" data-testid="submit-to-jury-btn">
						{t('Soumettre au jury', 'Submit to jury')}
					</Button>
				</form>
			</div>
		{/if}

		<!-- Panneau de vote du jury (judging) — visible à tous -->
		{#if isJudging}
			<!-- Votes déjà exprimés — visibles par tous -->
			{#if juryVotes.length > 0}
				<div
					class="border-border bg-card mt-2 rounded-lg border p-4"
					data-testid="jury-votes-display"
				>
					<h2 class="text-foreground mb-3 text-sm font-semibold">
						{t('Votes exprimés', 'Votes cast')} ({juryVotes.length})
					</h2>
					<ul class="flex flex-col gap-3">
						{#each juryVotes as vote (vote.id)}
							<li
								class="flex flex-col gap-1 rounded-md border p-3 {vote.jurorId ===
								data.currentUserId
									? 'border-primary/40 bg-primary/5'
									: 'border-border'}"
								data-testid="jury-vote-item"
							>
								<div class="flex items-center gap-2">
									{#if vote.jurorAvatarUrl}
										<img
											src={vote.jurorAvatarUrl}
											alt={vote.jurorPseudo}
											class="h-5 w-5 rounded-full object-cover"
										/>
									{:else}
										<div
											class="bg-muted text-muted-foreground flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium"
										>
											{vote.jurorPseudo.charAt(0).toUpperCase()}
										</div>
									{/if}
									<span class="text-foreground text-sm font-medium" data-testid="jury-vote-juror">
										{vote.jurorPseudo}{vote.jurorId === data.currentUserId
											? t(' (moi)', ' (me)')
											: ''}
									</span>
								</div>
								{#if vote.verdict === 'not_resolved'}
									<p class="text-muted-foreground text-sm" data-testid="jury-vote-verdict">
										{t('Pas encore résolu', 'Not yet resolved')}
									</p>
								{:else}
									<div data-testid="jury-vote-verdict">
										<p class="text-foreground text-sm font-medium">
											{t('Gagnant', 'Winner')}{vote.winners.length > 1 ? 's' : ''} :
										</p>
										<ul class="mt-1 flex flex-wrap gap-1">
											{#each vote.winners as winner (winner.userId)}
												<li
													class="bg-green-100 text-green-800 rounded-full px-2 py-0.5 text-xs font-medium"
													data-testid="jury-vote-winner"
												>
													{winner.pseudo}
												</li>
											{/each}
										</ul>
										{#if vote.losers.length > 0}
											<p class="text-foreground mt-2 text-sm font-medium">
												{t('Le plus loin :', 'Furthest away:')}
											</p>
											<ul class="mt-1 flex flex-wrap gap-1">
												{#each vote.losers as loser (loser.userId)}
													<li
														class="bg-red-100 text-red-800 rounded-full px-2 py-0.5 text-xs font-medium"
														data-testid="jury-vote-loser"
													>
														{loser.pseudo}
													</li>
												{/each}
											</ul>
										{/if}
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{:else}
				<div
					class="border-border bg-card mt-2 rounded-lg border p-4"
					data-testid="jury-votes-empty"
				>
					<p class="text-muted-foreground text-sm">
						{t("Aucun vote exprimé pour l'instant.", 'No votes have been cast yet.')}
					</p>
				</div>
			{/if}

			<!-- Formulaire de vote (jurés uniquement) -->
			{#if data.isJuror}
				<div
					class="border-amber-200 bg-amber-50 mt-2 rounded-lg border p-4"
					data-testid="jury-vote-section"
				>
					<h2 class="text-amber-800 mb-3 text-sm font-semibold">
						{myVote ? t('Modifier mon vote', 'Change my vote') : t('Mon vote', 'My vote')}
					</h2>

					{#if (form as { voteError?: string } | null)?.voteError}
						<p class="text-destructive mb-3 text-sm" data-testid="vote-error">
							{localizeError((form as { voteError?: string }).voteError)}
						</p>
					{/if}

					<form method="POST" action="?/cast_jury_vote" use:enhance class="flex flex-col gap-4">
						<!-- Option : Pas encore résolu -->
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="radio"
								name="verdict"
								value="not_resolved"
								class="accent-amber-600"
								checked={voteVerdict === 'not_resolved'}
								onchange={() => {
									voteVerdict = 'not_resolved';
									voteWinnerIds = [];
									voteLoserId = '';
								}}
								data-testid="verdict-not-resolved"
							/>
							<span class="text-amber-900 text-sm font-medium"
								>{t('Pas encore résolu', 'Not yet resolved')}</span
							>
						</label>

						<!-- Option : Désigner le(s) gagnant(s) -->
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="radio"
								name="verdict"
								value="winners_selected"
								class="accent-amber-600"
								checked={voteVerdict === 'winners_selected'}
								onchange={() => {
									voteVerdict = 'winners_selected';
								}}
								data-testid="verdict-winners-selected"
							/>
							<span class="text-amber-900 text-sm font-medium">
								{isClosest
									? t('Désigner le(s) gagnant(s)', 'Select the winner(s)')
									: t('Désigner le gagnant', 'Select the winner')}
							</span>
						</label>

						{#if voteVerdict === 'winners_selected'}
							<div class="ml-5 flex flex-col gap-2" data-testid="winners-selection">
								{#if isYesno}
									<!-- Yesno: radio pour choisir 1 gagnant parmi les participants -->
									{#each data.bet.participants as participant (participant.userId)}
										<label class="flex cursor-pointer items-center gap-2">
											<input
												type="radio"
												name="winnerUserIds"
												value={participant.userId}
												class="accent-amber-600"
												checked={voteWinnerIds.includes(participant.userId)}
												onchange={() => {
													voteWinnerIds = [participant.userId];
												}}
												data-testid="winner-radio"
											/>
											<span class="text-foreground text-sm">
												{participant.pseudo}{participant.userId === data.currentUserId
													? t(' (moi)', ' (me)')
													: ''}
											</span>
										</label>
									{/each}
								{:else}
									<!-- Closest: checkboxes pour ≥1 gagnant -->
									{#each data.bet.participants as participant (participant.userId)}
										<label class="flex cursor-pointer items-center gap-2">
											<input
												type="checkbox"
												name="winnerUserIds"
												value={participant.userId}
												class="rounded accent-amber-600"
												checked={voteWinnerIds.includes(participant.userId)}
												onchange={() => toggleWinner(participant.userId)}
												data-testid="winner-checkbox"
											/>
											<span class="text-foreground text-sm">
												{participant.pseudo}{participant.userId === data.currentUserId
													? t(' (moi)', ' (me)')
													: ''}
											</span>
										</label>
									{/each}

									<!-- Gage last_one: désigner le plus loin -->
									{#if isLastOne}
										<div class="mt-3 border-t pt-3" data-testid="loser-selection">
											<p class="text-foreground mb-2 text-sm font-medium">
												{t(
													'Qui est le plus loin ? (gage « dernier »)',
													'Who is furthest away? (last-place forfeit)'
												)}
											</p>
											{#each data.bet.participants as participant (participant.userId)}
												<label class="flex cursor-pointer items-center gap-2 mb-1">
													<input
														type="radio"
														name="loserUserId"
														value={participant.userId}
														class="accent-red-600"
														checked={voteLoserId === participant.userId}
														onchange={() => {
															voteLoserId = participant.userId;
														}}
														data-testid="loser-radio"
													/>
													<span class="text-foreground text-sm">
														{participant.pseudo}{participant.userId === data.currentUserId
															? t(' (moi)', ' (me)')
															: ''}
													</span>
												</label>
											{/each}
										</div>
									{/if}
								{/if}
							</div>
						{/if}

						<Button
							type="submit"
							class="bg-amber-600 hover:bg-amber-700 text-white w-fit"
							disabled={voteVerdict === ''}
							data-testid="cast-vote-btn"
						>
							{myVote ? t('Modifier mon vote', 'Change my vote') : t('Voter', 'Vote')}
						</Button>
					</form>
				</div>
			{:else}
				<div
					class="border-border bg-card mt-2 rounded-lg border p-4"
					data-testid="judging-info-section"
				>
					<p class="text-muted-foreground text-sm">
						{t(
							'Ce pari est en cours de jugement. En attente du verdict du jury.',
							'This bet is under review. Waiting for the jury verdict.'
						)}
					</p>
				</div>
			{/if}
		{/if}

		<!-- Panneau résolution — visible quand le match est résolu -->
		{#if isResolved && resolution}
			<div
				class="border-blue-200 bg-blue-50 mt-2 rounded-lg border p-4"
				data-testid="resolution-section"
			>
				<h2 class="text-blue-800 mb-3 text-sm font-semibold">
					{t('Verdict du jury — Résolu', 'Jury verdict — Resolved')}
				</h2>

				<!-- Gagnants -->
				{#if resolution.winners.length > 0}
					<div class="mb-3" data-testid="resolution-winners">
						<p class="text-blue-700 mb-2 text-xs font-medium uppercase tracking-wide">
							{t('Gagnant', 'Winner')}{resolution.winners.length > 1 ? 's' : ''}
						</p>
						<ul class="flex flex-wrap gap-2">
							{#each resolution.winners as winner (winner.userId)}
								<li
									class="flex items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2"
									data-testid="resolution-winner"
								>
									<div
										class="bg-blue-100 text-blue-700 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
									>
										{winner.pseudo.charAt(0).toUpperCase()}
									</div>
									<span class="text-foreground text-sm font-medium">
										{winner.pseudo}{winner.userId === data.currentUserId
											? t(' (moi)', ' (me)')
											: ''}
									</span>
									{#if winner.share !== null}
										<span class="text-blue-600 text-xs font-medium" data-testid="winner-share">
											+{winner.share} pts
										</span>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- Ardoise (points) -->
				{#if resolution.ledgerEntries.length > 0}
					<div class="mb-3" data-testid="resolution-ledger">
						<p class="text-blue-700 mb-2 text-xs font-medium uppercase tracking-wide">
							{t('Ardoise', 'Ledger')}
						</p>
						<ul class="flex flex-col gap-1">
							{#each resolution.ledgerEntries as entry (entry.id)}
								<li
									class="text-foreground rounded-md bg-white px-3 py-2 text-sm"
									data-testid="ledger-entry"
								>
									<span class="font-medium" data-testid="ledger-debtor">{entry.debtorPseudo}</span>
									{t('doit', 'owes')}
									<span class="font-bold text-blue-700" data-testid="ledger-amount"
										>{entry.amount} pts</span
									>
									{t('à', 'to')}
									<span class="font-medium" data-testid="ledger-creditor"
										>{entry.creditorPseudo}</span
									>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- Gages -->
				{#if resolution.forfeits.length > 0}
					<div data-testid="resolution-forfeits">
						<p class="text-blue-700 mb-2 text-xs font-medium uppercase tracking-wide">
							{t('Gage', 'Forfeit')}{resolution.forfeits.length > 1 ? 's' : ''}
						</p>
						{#if (form as { forfeitError?: string; forfeitId?: string } | null)?.forfeitError && !(form as { forfeitId?: string } | null)?.forfeitId}
							<p class="text-destructive mb-2 text-xs" data-testid="forfeit-error">
								{localizeError((form as { forfeitError?: string }).forfeitError)}
							</p>
						{/if}
						<ul class="flex flex-col gap-2">
							{#each resolution.forfeits as f (f.id)}
								<li
									class="rounded-md border bg-white px-3 py-2 text-sm {f.status === 'done'
										? 'border-green-200'
										: f.status === 'not_done'
											? 'border-red-200'
											: f.claimedAt
												? 'border-amber-200'
												: 'border-gray-200'}"
									data-testid="forfeit-entry"
								>
									<!-- Header: debtor + status badge -->
									<div class="flex items-start justify-between gap-2 flex-wrap">
										<span class="font-medium text-foreground" data-testid="forfeit-debtor">
											{f.debtorPseudo}{f.debtorId === data.currentUserId
												? t(' (moi)', ' (me)')
												: ''}
										</span>
										{#if f.status === 'done'}
											<span
												class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
												data-testid="forfeit-status"
											>
												{t('Accompli ✓', 'Completed ✓')}
											</span>
										{:else if f.status === 'not_done'}
											<span
												class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
												data-testid="forfeit-status"
											>
												{t('Gage non tenu', 'Forfeit not completed')}
											</span>
										{:else if f.claimedAt}
											<span
												class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
												data-testid="forfeit-status"
											>
												{t('En attente de confirmation', 'Awaiting confirmation')}
											</span>
										{:else}
											<span
												class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
												data-testid="forfeit-status"
											>
												{t('À faire', 'To do')}
											</span>
										{/if}
									</div>

									<!-- Forfeit description -->
									{#if data.bet.forfeitDescription}
										<p class="text-muted-foreground mt-1 text-xs italic" data-testid="forfeit-desc">
											{data.bet.forfeitDescription}
										</p>
									{/if}

									<!-- Claimed date + proof -->
									{#if f.claimedAt}
										<p class="text-muted-foreground mt-1 text-xs" data-testid="forfeit-claimed-at">
											{t('Déclaré fait le', 'Marked complete on')}
											{formatDate(f.claimedAt)}
										</p>
									{/if}

									{#if f.proofUrl}
										<div class="mt-2" data-testid="forfeit-proof">
											<a
												href={f.proofUrl}
												target="_blank"
												rel="noopener noreferrer"
												class="text-primary text-xs underline underline-offset-2"
												data-testid="forfeit-proof-link"
											>
												{t('Voir la preuve', 'View proof')}
											</a>
										</div>
									{/if}

									<!-- Confirmed by -->
									{#if f.status === 'done' && f.confirmedByPseudo}
										<p
											class="text-muted-foreground mt-1 text-xs"
											data-testid="forfeit-confirmed-by"
										>
											{t('Confirmé par', 'Confirmed by')}
											{f.confirmedByPseudo}
										</p>
									{:else if f.status === 'not_done' && f.confirmedByPseudo}
										<p class="text-muted-foreground mt-1 text-xs" data-testid="forfeit-not-done-by">
											{t('Marqué non tenu par', 'Marked incomplete by')}
											{f.confirmedByPseudo}
										</p>
									{/if}

									<!-- Error for this forfeit -->
									{#if (form as { forfeitError?: string; forfeitId?: string } | null)?.forfeitError && (form as { forfeitId?: string } | null)?.forfeitId === f.id}
										<p class="text-destructive mt-1 text-xs" data-testid="forfeit-error">
											{localizeError((form as { forfeitError?: string }).forfeitError)}
										</p>
									{/if}

									<!-- ── Actions for debtor ──────────────────────────────────────── -->
									{#if f.debtorId === data.currentUserId && f.status === 'pending' && !f.claimedAt}
										<div class="mt-3 border-t pt-3" data-testid="claim-section">
											{#if claimingForfeitId === f.id}
												<form
													method="POST"
													action="?/claim_forfeit"
													enctype="multipart/form-data"
													use:enhance
													class="flex flex-col gap-2"
													data-testid="claim-form"
												>
													<input type="hidden" name="forfeitId" value={f.id} />
													<div>
														<label
															for="proof-{f.id}"
															class="text-foreground mb-1 block text-xs font-medium"
														>
															{t(
																'Preuve (optionnel — photo ou vidéo)',
																'Proof (optional — photo or video)'
															)}
														</label>
														<input
															id="proof-{f.id}"
															name="proof"
															type="file"
															accept="image/*,video/mp4,video/webm"
															class="border-input bg-background text-foreground text-xs file:mr-2 file:rounded file:border-0 file:bg-gray-100 file:px-2 file:py-1 file:text-xs w-full rounded-md border px-3 py-2"
															data-testid="proof-input"
														/>
													</div>
													<div class="flex gap-2">
														<Button type="submit" size="sm" data-testid="claim-btn">
															{t("J'ai fait mon gage", 'I completed my forfeit')}
														</Button>
														<Button
															type="button"
															variant="ghost"
															size="sm"
															onclick={() => (claimingForfeitId = null)}
														>
															{t('Annuler', 'Cancel')}
														</Button>
													</div>
												</form>
											{:else}
												<Button
													variant="outline"
													size="sm"
													onclick={() => (claimingForfeitId = f.id)}
													data-testid="show-claim-btn"
												>
													{t("J'ai fait mon gage", 'I completed my forfeit')}
												</Button>
											{/if}
										</div>
									{:else if f.debtorId === data.currentUserId && f.status === 'pending' && f.claimedAt}
										<p class="text-muted-foreground mt-2 text-xs" data-testid="claim-pending-msg">
											{t(
												'En attente de confirmation par un gagnant.',
												'Waiting for confirmation from a winner.'
											)}
										</p>
									{/if}

									<!-- ── Actions for winner ──────────────────────────────────────── -->
									{#if isCurrentUserWinner && f.debtorId !== data.currentUserId && f.status === 'pending'}
										<div
											class="mt-3 border-t pt-3 flex flex-wrap gap-2"
											data-testid="winner-actions"
										>
											{#if f.claimedAt}
												<!-- Claimed: confirm or reject -->
												<form
													method="POST"
													action="?/confirm_forfeit"
													use:enhance
													data-testid="confirm-forfeit-form"
												>
													<input type="hidden" name="forfeitId" value={f.id} />
													<Button
														type="submit"
														size="sm"
														class="bg-green-600 hover:bg-green-700"
														data-testid="confirm-forfeit-btn"
													>
														{t('Confirmer', 'Confirm')}
													</Button>
												</form>
												<form
													method="POST"
													action="?/reject_forfeit"
													use:enhance
													data-testid="reject-forfeit-form"
												>
													<input type="hidden" name="forfeitId" value={f.id} />
													<Button
														type="submit"
														variant="outline"
														size="sm"
														data-testid="reject-forfeit-btn"
													>
														{t('Refuser', 'Decline')}
													</Button>
												</form>
											{/if}
											<!-- Not done: always available while pending -->
											<form
												method="POST"
												action="?/mark_forfeit_not_done"
												use:enhance
												data-testid="not-done-forfeit-form"
											>
												<input type="hidden" name="forfeitId" value={f.id} />
												<Button
													type="submit"
													variant="ghost"
													size="sm"
													class="text-red-600 hover:text-red-700"
													data-testid="not-done-forfeit-btn"
												>
													{t('Gage non tenu', 'Forfeit not completed')}
												</Button>
											</form>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>

			<!-- Votes du jury (résumé) — visible quand résolu -->
			{#if juryVotes.length > 0}
				<div
					class="border-border bg-card mt-2 rounded-lg border p-4"
					data-testid="jury-votes-display"
				>
					<h2 class="text-foreground mb-3 text-sm font-semibold">
						{t('Votes du jury', 'Jury votes')} ({juryVotes.length})
					</h2>
					<ul class="flex flex-col gap-3">
						{#each juryVotes as vote (vote.id)}
							<li
								class="flex flex-col gap-1 rounded-md border p-3 {vote.jurorId ===
								data.currentUserId
									? 'border-primary/40 bg-primary/5'
									: 'border-border'}"
								data-testid="jury-vote-item"
							>
								<div class="flex items-center gap-2">
									{#if vote.jurorAvatarUrl}
										<img
											src={vote.jurorAvatarUrl}
											alt={vote.jurorPseudo}
											class="h-5 w-5 rounded-full object-cover"
										/>
									{:else}
										<div
											class="bg-muted text-muted-foreground flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium"
										>
											{vote.jurorPseudo.charAt(0).toUpperCase()}
										</div>
									{/if}
									<span class="text-foreground text-sm font-medium" data-testid="jury-vote-juror">
										{vote.jurorPseudo}{vote.jurorId === data.currentUserId
											? t(' (moi)', ' (me)')
											: ''}
									</span>
								</div>
								{#if vote.verdict === 'not_resolved'}
									<p class="text-muted-foreground text-sm" data-testid="jury-vote-verdict">
										{t('Pas encore résolu', 'Not yet resolved')}
									</p>
								{:else}
									<div data-testid="jury-vote-verdict">
										<p class="text-foreground text-sm font-medium">
											{t('Gagnant', 'Winner')}{vote.winners.length > 1 ? 's' : ''} :
										</p>
										<ul class="mt-1 flex flex-wrap gap-1">
											{#each vote.winners as winner (winner.userId)}
												<li
													class="bg-green-100 text-green-800 rounded-full px-2 py-0.5 text-xs font-medium"
													data-testid="jury-vote-winner"
												>
													{winner.pseudo}
												</li>
											{/each}
										</ul>
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/if}

		<!-- Actions closest -->
		{#if isClosest}
			<!-- Bouton Soumettre au jury (uniquement pour les participants, match open) -->
			{#if canSubmitToJury}
				<div
					class="border-border bg-card mt-2 rounded-lg border p-4"
					data-testid="submit-to-jury-section"
				>
					<h2 class="text-foreground mb-1 text-sm font-semibold">
						{t('Soumettre au jury', 'Submit to jury')}
					</h2>
					<p class="text-muted-foreground mb-3 text-xs">
						{t(
							'Soumettre le pari au jury clôt les participations et révèle toutes les estimations.',
							'Submitting the bet to the jury closes participation and reveals all guesses.'
						)}
					</p>
					{#if form?.submitError}
						<p class="text-destructive mb-3 text-sm" data-testid="submit-error">
							{localizeError(form.submitError)}
						</p>
					{/if}
					<form method="POST" action="?/submit_to_jury" use:enhance>
						<Button type="submit" variant="outline" data-testid="submit-to-jury-btn">
							{t('Soumettre au jury', 'Submit to jury')}
						</Button>
					</form>
				</div>
			{/if}

			<!-- Participation closest -->
			{#if canParticipate}
				<div
					class="border-border bg-card rounded-lg border p-4 mt-2"
					data-testid="participate-section"
				>
					<h2 class="text-foreground mb-3 text-sm font-semibold">
						{hasParticipated
							? t('Modifier mon estimation', 'Change my guess')
							: t('Mon estimation', 'My guess')}
					</h2>

					{#if form?.participateError}
						<p class="text-destructive mb-3 text-sm" data-testid="participate-error">
							{localizeError(form.participateError)}
						</p>
					{/if}

					<form method="POST" action="?/participate" use:enhance class="flex flex-col gap-3">
						<div>
							<label for="answer" class="text-foreground mb-1 block text-sm font-medium">
								{t('Mon estimation', 'My guess')}
							</label>
							<input
								id="answer"
								name="answer"
								type="text"
								class="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1"
								placeholder={t('Votre estimation...', 'Your guess...')}
								value={answerValue}
								data-testid="answer-input"
								required
							/>
						</div>
						<Button type="submit" data-testid="participate-btn">
							{hasParticipated ? t('Modifier', 'Edit') : stakeLabel}
						</Button>
					</form>
				</div>
			{:else if deadlinePassed && !hasParticipated && !isJudging}
				<!-- Spectator banner: deadline passed without participating -->
				<div
					class="bg-muted text-muted-foreground rounded-lg border p-4 mt-2"
					data-testid="spectator-banner"
				>
					<p class="text-sm">
						{t("Tu n'as pas participé — spectateur", 'You did not participate — spectator')}
					</p>
				</div>
			{:else if hasParticipated && deadlinePassed && !isJudging}
				<!-- Participated, deadline passed — can only view -->
				<div
					class="border-border bg-card rounded-lg border p-4 mt-2"
					data-testid="participate-section"
				>
					<h2 class="text-foreground mb-1 text-sm font-semibold">
						{t('Mon estimation', 'My guess')}
					</h2>
					<p class="text-foreground text-sm font-medium" data-testid="my-answer">
						{myParticipation?.answer}
					</p>
					<p class="text-muted-foreground mt-1 text-xs">
						{t(
							'La date limite est dépassée, ton estimation est figée.',
							'The deadline has passed; your guess is locked.'
						)}
					</p>
				</div>
			{:else if data.bet.matchStatus !== 'open' && !isJudging}
				<!-- Match closed or non-open (not judging) -->
				<div
					class="border-border bg-card rounded-lg border p-4 mt-2"
					data-testid="participate-section"
				>
					{#if hasParticipated}
						<h2 class="text-foreground mb-1 text-sm font-semibold">
							{t('Mon estimation', 'My guess')}
						</h2>
						<p class="text-foreground text-sm font-medium" data-testid="my-answer">
							{myParticipation?.answer}
						</p>
					{:else}
						<Button disabled data-testid="participate-btn"
							>{t('Participer (pari clôturé)', 'Participate (bet closed)')}</Button
						>
					{/if}
				</div>
			{:else if isJudging && hasParticipated}
				<!-- In judging: show my answer (read-only) -->
				<div
					class="border-border bg-card rounded-lg border p-4 mt-2"
					data-testid="participate-section"
				>
					<h2 class="text-foreground mb-1 text-sm font-semibold">
						{t('Mon estimation', 'My guess')}
					</h2>
					<p class="text-foreground text-sm font-medium" data-testid="my-answer">
						{myParticipation?.answer}
					</p>
					<p class="text-muted-foreground mt-1 text-xs">
						{t(
							'Le pari est en jugement, ton estimation est figée.',
							'The bet is under review; your guess is locked.'
						)}
					</p>
				</div>
			{/if}
		{/if}

		<!-- ── Annulation unanime ───────────────────────────────────────── -->
		{#if isCancelled}
			<!-- Match annulé -->
			<div
				class="border-orange-200 bg-orange-50 mt-4 rounded-lg border p-4"
				data-testid="match-cancelled-section"
			>
				<h2 class="text-orange-800 mb-1 text-sm font-semibold">
					{t("Pari annulé d'un commun accord", 'Bet cancelled by mutual agreement')}
				</h2>
				<p class="text-orange-700 text-sm">
					{t(
						"Tous les participants ont demandé l'annulation. Aucune mise n'est prélevée.",
						'All participants requested cancellation. No stakes are collected.'
					)}
				</p>
			</div>
		{:else if canRequestCancellation}
			<!-- Panneau demande d'annulation -->
			<div
				class="border-border bg-card mt-4 rounded-lg border p-4"
				data-testid="cancellation-section"
			>
				<h2 class="text-foreground mb-1 text-sm font-semibold">
					{t('Annulation unanime', 'Unanimous cancellation')}
				</h2>
				<p class="text-muted-foreground mb-3 text-xs">
					{t(
						"Si tous les participants demandent l'annulation, le match sera annulé et aucune mise ne sera prélevée.",
						'If all participants request cancellation, the match will be cancelled and no stakes will be collected.'
					)}
				</p>

				<!-- Compteur -->
				<p class="text-foreground mb-3 text-sm" data-testid="cancellation-counter">
					{t(
						`${cancellationRequests.length} / ${totalParticipants} joueur${totalParticipants > 1 ? 's veulent' : ' veut'} annuler`,
						`${cancellationRequests.length} / ${totalParticipants} player${totalParticipants === 1 ? ' wants' : 's want'} to cancel`
					)}
				</p>

				{#if (form as { cancellationError?: string } | null)?.cancellationError}
					<p class="text-destructive mb-2 text-sm" data-testid="cancellation-error">
						{localizeError((form as { cancellationError?: string }).cancellationError)}
					</p>
				{/if}

				{#if hasCancellationRequest}
					<!-- L'utilisateur a déjà demandé l'annulation — il peut retirer -->
					<p class="text-muted-foreground mb-2 text-sm" data-testid="cancellation-pending-msg">
						{t(
							"Vous avez demandé l'annulation. En attente des autres participants.",
							'You requested cancellation. Waiting for the other participants.'
						)}
					</p>
					<form method="POST" action="?/withdraw_cancellation" use:enhance>
						<Button
							type="submit"
							variant="outline"
							class="text-destructive border-destructive/40 hover:bg-destructive/10"
							data-testid="withdraw-cancellation-btn"
						>
							{t('Retirer ma demande', 'Withdraw my request')}
						</Button>
					</form>
				{:else}
					<!-- L'utilisateur n'a pas encore demandé l'annulation -->
					<form method="POST" action="?/request_cancellation" use:enhance>
						<Button
							type="submit"
							variant="outline"
							class="text-destructive border-destructive/40 hover:bg-destructive/10"
							data-testid="request-cancellation-btn"
						>
							{t("Demander l'annulation", 'Request cancellation')}
						</Button>
					</form>
				{/if}
			</div>
		{/if}
	</div>
</div>
