import { db } from '$lib/server/db/index';
import {
	propositions,
	propositionOffers,
	propositionJurors,
	matches,
	matchParticipants,
	matchJurors,
	yesnoBets,
	bets,
	profiles
} from '$lib/server/db/schema';
import { and, eq, sql } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PropositionOffer {
	id: string;
	authorId: string;
	authorPseudo: string;
	authorAvatarUrl: string | null;
	stakeCreator: string | null;
	stakeTarget: string | null;
	forfeitCreator: string | null;
	forfeitTarget: string | null;
	createdAt: Date;
}

export interface PropositionWithOffers {
	id: string;
	betId: string;
	targetId: string;
	lastProposerId: string;
	stakeCreator: string | null;
	stakeTarget: string | null;
	forfeitCreator: string | null;
	forfeitTarget: string | null;
	status: string;
	expiresAt: Date | null;
	createdAt: Date;
	offers: PropositionOffer[];
}

// ─── Lazy expiration ──────────────────────────────────────────────────────────

/**
 * Lazily resolves proposition expiry: if expires_at has passed and status is
 * still 'negotiating', transitions to 'expired'.
 * Returns the (potentially updated) status.
 */
export async function resolvePropositionStatus(propositionId: string): Promise<string> {
	const rows = await db
		.select({ status: propositions.status, expiresAt: propositions.expiresAt })
		.from(propositions)
		.where(eq(propositions.id, propositionId))
		.limit(1);

	if (rows.length === 0) return 'negotiating';

	const { status, expiresAt } = rows[0];

	if (status !== 'negotiating') return status;
	if (!expiresAt) return status;

	const now = new Date();
	if (now <= expiresAt) return status;

	// Transition to expired (idempotent conditional UPDATE)
	await db
		.update(propositions)
		.set({ status: 'expired' })
		.where(and(eq(propositions.id, propositionId), eq(propositions.status, 'negotiating')));

	return 'expired';
}

// ─── Load offers history ──────────────────────────────────────────────────────

/**
 * Returns the complete offer history for a proposition, ordered chronologically.
 */
export async function getPropositionOffers(propositionId: string): Promise<PropositionOffer[]> {
	const rows = await db
		.select({
			id: propositionOffers.id,
			authorId: propositionOffers.authorId,
			authorPseudo: profiles.pseudo,
			authorAvatarUrl: profiles.avatarUrl,
			stakeCreator: propositionOffers.stakeCreator,
			stakeTarget: propositionOffers.stakeTarget,
			forfeitCreator: propositionOffers.forfeitCreator,
			forfeitTarget: propositionOffers.forfeitTarget,
			createdAt: propositionOffers.createdAt
		})
		.from(propositionOffers)
		.innerJoin(profiles, eq(profiles.id, propositionOffers.authorId))
		.where(eq(propositionOffers.propositionId, propositionId))
		.orderBy(propositionOffers.createdAt);

	return rows as PropositionOffer[];
}

// ─── Counter-propose ──────────────────────────────────────────────────────────

export interface CounterProposeParams {
	propositionId: string;
	authorId: string; // the one making the counter-offer
	stakeCreator: number | null;
	stakeTarget: number | null;
	forfeitCreator: string | null;
	forfeitTarget: string | null;
	juryUserIds: string[] | null; // null = keep existing jurors
}

/**
 * Makes a counter-offer on a proposition.
 * Allowed only when:
 *   - proposition.status = 'negotiating'
 *   - proposition has not expired
 *   - authorId !== proposition.lastProposerId (only the one who did NOT make the last offer)
 *
 * Actions:
 *   1. INSERT proposition_offers (new offer)
 *   2. UPDATE propositions (new terms, lastProposerId, expiresAt += 48h)
 *   3. If juryUserIds provided: DELETE old proposition_jurors + INSERT new ones
 *
 * Throws on authorization failure or invalid state.
 */
export async function counterPropose(params: CounterProposeParams): Promise<void> {
	await db.transaction(async (tx) => {
		// Fetch current proposition state
		const propRows = await tx
			.select({
				status: propositions.status,
				expiresAt: propositions.expiresAt,
				lastProposerId: propositions.lastProposerId,
				targetId: propositions.targetId,
				betId: propositions.betId
			})
			.from(propositions)
			.where(eq(propositions.id, params.propositionId))
			.limit(1);

		if (propRows.length === 0) {
			throw new Error('Proposition introuvable.');
		}

		const prop = propRows[0];

		// Check status
		if (prop.status !== 'negotiating') {
			throw new Error("Cette proposition n'est plus en cours de négociation.");
		}

		// Check expiry
		if (prop.expiresAt && new Date() > prop.expiresAt) {
			// Lazily expire
			await tx
				.update(propositions)
				.set({ status: 'expired' })
				.where(
					and(eq(propositions.id, params.propositionId), eq(propositions.status, 'negotiating'))
				);
			throw new Error('Cette proposition a expiré.');
		}

		// Only the one who did NOT make the last offer can counter-propose
		if (params.authorId === prop.lastProposerId) {
			throw new Error(
				'Vous avez déjà fait la dernière offre. Attendez la réponse de votre adversaire.'
			);
		}

		// Verify authorId is either the bet creator or the target
		const betRows = await tx
			.select({ creatorId: bets.creatorId })
			.from(bets)
			.where(eq(bets.id, prop.betId))
			.limit(1);

		if (betRows.length === 0) {
			throw new Error('Pari introuvable.');
		}

		const { creatorId } = betRows[0];
		if (params.authorId !== creatorId && params.authorId !== prop.targetId) {
			throw new Error('Accès refusé.');
		}

		// Insert the new offer
		await tx.insert(propositionOffers).values({
			propositionId: params.propositionId,
			authorId: params.authorId,
			stakeCreator: params.stakeCreator !== null ? params.stakeCreator.toString() : null,
			stakeTarget: params.stakeTarget !== null ? params.stakeTarget.toString() : null,
			forfeitCreator: params.forfeitCreator,
			forfeitTarget: params.forfeitTarget
		});

		// Update proposition: new terms + lastProposerId + extend expiry by 48h
		const newExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
		await tx
			.update(propositions)
			.set({
				stakeCreator: params.stakeCreator !== null ? params.stakeCreator.toString() : null,
				stakeTarget: params.stakeTarget !== null ? params.stakeTarget.toString() : null,
				forfeitCreator: params.forfeitCreator,
				forfeitTarget: params.forfeitTarget,
				lastProposerId: params.authorId,
				expiresAt: newExpiresAt
			})
			.where(eq(propositions.id, params.propositionId));

		// If jury changed, replace proposition_jurors
		if (params.juryUserIds !== null) {
			await tx
				.delete(propositionJurors)
				.where(eq(propositionJurors.propositionId, params.propositionId));

			if (params.juryUserIds.length > 0) {
				await tx.insert(propositionJurors).values(
					params.juryUserIds.map((userId) => ({
						propositionId: params.propositionId,
						userId
					}))
				);
			}
		}
	});
}

// ─── Accept proposition ───────────────────────────────────────────────────────

export interface AcceptPropositionParams {
	propositionId: string;
	userId: string; // must be the one who did NOT make the last offer
}

export interface AcceptPropositionResult {
	matchId: string;
}

/**
 * Accepts a proposition and creates the match atomically.
 * Allowed only when:
 *   - proposition.status = 'negotiating' (not expired)
 *   - userId !== proposition.lastProposerId
 *   - max_opponents not exceeded (atomic check)
 *
 * Actions in transaction:
 *   1. UPDATE propositions status=accepted
 *   2. INSERT matches (status=open, proposition_id)
 *   3. INSERT match_participants (creator side a, target side b, stakes)
 *   4. INSERT match_jurors (from proposition_jurors)
 *   5. UPDATE yesno_bets.accepted_count += 1 (conditional: < max_opponents)
 *
 * Returns { matchId } or throws.
 */
export async function acceptProposition(
	params: AcceptPropositionParams
): Promise<AcceptPropositionResult> {
	let matchId: string | undefined;

	await db.transaction(async (tx) => {
		// Fetch proposition + bet in one query
		const propRows = await tx
			.select({
				status: propositions.status,
				expiresAt: propositions.expiresAt,
				lastProposerId: propositions.lastProposerId,
				targetId: propositions.targetId,
				betId: propositions.betId,
				stakeCreator: propositions.stakeCreator,
				stakeTarget: propositions.stakeTarget,
				forfeitCreator: propositions.forfeitCreator,
				forfeitTarget: propositions.forfeitTarget
			})
			.from(propositions)
			.where(eq(propositions.id, params.propositionId))
			.limit(1);

		if (propRows.length === 0) {
			throw new Error('Proposition introuvable.');
		}

		const prop = propRows[0];

		// Check status
		if (prop.status !== 'negotiating') {
			throw new Error("Cette proposition n'est plus en cours de négociation.");
		}

		// Check expiry
		if (prop.expiresAt && new Date() > prop.expiresAt) {
			await tx
				.update(propositions)
				.set({ status: 'expired' })
				.where(
					and(eq(propositions.id, params.propositionId), eq(propositions.status, 'negotiating'))
				);
			throw new Error('Cette proposition a expiré.');
		}

		// Only the one who did NOT make the last offer can accept
		if (params.userId === prop.lastProposerId) {
			throw new Error(
				'Vous avez déjà fait la dernière offre. Attendez la réponse de votre adversaire.'
			);
		}

		// Fetch bet details
		const betRows = await tx
			.select({
				creatorId: bets.creatorId,
				stakeType: bets.stakeType,
				groupId: bets.groupId,
				juryMode: bets.juryMode
			})
			.from(bets)
			.where(eq(bets.id, prop.betId))
			.limit(1);

		if (betRows.length === 0) {
			throw new Error('Pari introuvable.');
		}

		const bet = betRows[0];

		// Verify userId is either the creator or the target
		if (params.userId !== bet.creatorId && params.userId !== prop.targetId) {
			throw new Error('Accès refusé.');
		}

		// Fetch yesno_bets for creator_side and accepted_count check
		const yesnoRows = await tx
			.select({
				creatorSide: yesnoBets.creatorSide,
				acceptedCount: yesnoBets.acceptedCount,
				maxOpponents: yesnoBets.maxOpponents
			})
			.from(yesnoBets)
			.where(eq(yesnoBets.betId, prop.betId))
			.limit(1);

		if (yesnoRows.length === 0) {
			throw new Error('Données yesno introuvables.');
		}

		const yesno = yesnoRows[0];

		// Check max_opponents limit (atomic: only update if acceptedCount < maxOpponents)
		if (yesno.maxOpponents !== null && yesno.acceptedCount >= yesno.maxOpponents) {
			throw new Error("Le nombre maximum d'adversaires est atteint.");
		}

		// Determine sides: creator_side = 'a' or 'b'; target gets the other side
		const creatorSide = yesno.creatorSide as 'a' | 'b';
		const targetSide: 'a' | 'b' = creatorSide === 'a' ? 'b' : 'a';

		// Mark proposition as accepted
		const updatedProp = await tx
			.update(propositions)
			.set({ status: 'accepted' })
			.where(and(eq(propositions.id, params.propositionId), eq(propositions.status, 'negotiating')))
			.returning({ id: propositions.id });

		if (updatedProp.length === 0) {
			throw new Error('La proposition a déjà été traitée (race condition).');
		}

		// Create match
		const [newMatch] = await tx
			.insert(matches)
			.values({
				betId: prop.betId,
				propositionId: params.propositionId,
				status: 'open'
			})
			.returning({ id: matches.id });

		matchId = newMatch.id;

		// Insert match_participants: creator and target with their sides and stakes
		const participantValues = [
			{
				matchId: newMatch.id,
				userId: bet.creatorId,
				side: creatorSide,
				stake: prop.stakeCreator
			},
			{
				matchId: newMatch.id,
				userId: prop.targetId,
				side: targetSide,
				stake: prop.stakeTarget
			}
		];
		await tx.insert(matchParticipants).values(participantValues);

		// Copy proposition_jurors to match_jurors
		const jurorRows = await tx
			.select({ userId: propositionJurors.userId })
			.from(propositionJurors)
			.where(eq(propositionJurors.propositionId, params.propositionId));

		if (jurorRows.length > 0) {
			await tx.insert(matchJurors).values(
				jurorRows.map((j) => ({
					matchId: newMatch.id,
					userId: j.userId
				}))
			);
		}

		// Atomically increment accepted_count (conditional: acceptedCount < maxOpponents OR maxOpponents is null)
		await tx
			.update(yesnoBets)
			.set({ acceptedCount: sql`${yesnoBets.acceptedCount} + 1` })
			.where(
				and(
					eq(yesnoBets.betId, prop.betId),
					yesno.maxOpponents !== null
						? sql`${yesnoBets.acceptedCount} < ${yesno.maxOpponents}`
						: sql`true`
				)
			);
	});

	if (!matchId) throw new Error('Erreur lors de la création du match.');
	return { matchId };
}

// ─── Refuse proposition ───────────────────────────────────────────────────────

export interface RefusePropositionParams {
	propositionId: string;
	userId: string;
}

/**
 * Refuses a proposition.
 * Allowed only when:
 *   - proposition.status = 'negotiating'
 *   - userId !== proposition.lastProposerId (only the one who did NOT make the last offer)
 *
 * Actions:
 *   1. UPDATE propositions status=refused
 *   2. If no other accepted proposition for this bet → UPDATE bets status=cancelled
 */
export async function refuseProposition(params: RefusePropositionParams): Promise<void> {
	await db.transaction(async (tx) => {
		// Fetch proposition
		const propRows = await tx
			.select({
				status: propositions.status,
				expiresAt: propositions.expiresAt,
				lastProposerId: propositions.lastProposerId,
				targetId: propositions.targetId,
				betId: propositions.betId
			})
			.from(propositions)
			.where(eq(propositions.id, params.propositionId))
			.limit(1);

		if (propRows.length === 0) {
			throw new Error('Proposition introuvable.');
		}

		const prop = propRows[0];

		if (prop.status !== 'negotiating') {
			throw new Error("Cette proposition n'est plus en cours de négociation.");
		}

		// Check expiry
		if (prop.expiresAt && new Date() > prop.expiresAt) {
			await tx
				.update(propositions)
				.set({ status: 'expired' })
				.where(
					and(eq(propositions.id, params.propositionId), eq(propositions.status, 'negotiating'))
				);
			throw new Error('Cette proposition a expiré.');
		}

		// Only the one who did NOT make the last offer can refuse
		if (params.userId === prop.lastProposerId) {
			throw new Error(
				'Vous avez déjà fait la dernière offre. Seule la cible peut refuser en ce moment.'
			);
		}

		// Verify userId is either the creator or the target
		const betRows = await tx
			.select({ creatorId: bets.creatorId })
			.from(bets)
			.where(eq(bets.id, prop.betId))
			.limit(1);

		if (betRows.length === 0) throw new Error('Pari introuvable.');
		const { creatorId } = betRows[0];

		if (params.userId !== creatorId && params.userId !== prop.targetId) {
			throw new Error('Accès refusé.');
		}

		// Refuse the proposition
		await tx
			.update(propositions)
			.set({ status: 'refused' })
			.where(
				and(eq(propositions.id, params.propositionId), eq(propositions.status, 'negotiating'))
			);

		// Check if any proposition for this bet is accepted
		const acceptedRows = await tx
			.select({ id: propositions.id })
			.from(propositions)
			.where(and(eq(propositions.betId, prop.betId), eq(propositions.status, 'accepted')))
			.limit(1);

		// If no accepted proposition, cancel the bet
		if (acceptedRows.length === 0) {
			await tx.update(bets).set({ status: 'cancelled' }).where(eq(bets.id, prop.betId));
		}
	});
}

// ─── Cancel proposition (creator only) ────────────────────────────────────────

export interface CancelPropositionParams {
	propositionId: string;
	userId: string; // must be the bet creator
}

/**
 * Cancels a proposition. Only the bet creator can cancel.
 * Allowed while proposition.status = 'negotiating' (not accepted/refused/expired).
 *
 * Actions:
 *   1. UPDATE propositions status=cancelled
 *   2. If no accepted proposition for this bet → UPDATE bets status=cancelled
 */
export async function cancelProposition(params: CancelPropositionParams): Promise<void> {
	await db.transaction(async (tx) => {
		// Fetch proposition + bet creator
		const propRows = await tx
			.select({
				status: propositions.status,
				betId: propositions.betId
			})
			.from(propositions)
			.where(eq(propositions.id, params.propositionId))
			.limit(1);

		if (propRows.length === 0) {
			throw new Error('Proposition introuvable.');
		}

		const prop = propRows[0];

		if (prop.status !== 'negotiating') {
			throw new Error('Cette proposition ne peut plus être annulée.');
		}

		// Only the bet creator can cancel
		const betRows = await tx
			.select({ creatorId: bets.creatorId })
			.from(bets)
			.where(eq(bets.id, prop.betId))
			.limit(1);

		if (betRows.length === 0) throw new Error('Pari introuvable.');

		if (params.userId !== betRows[0].creatorId) {
			throw new Error('Seul le créateur du pari peut annuler la proposition.');
		}

		// Cancel proposition
		await tx
			.update(propositions)
			.set({ status: 'cancelled' })
			.where(
				and(eq(propositions.id, params.propositionId), eq(propositions.status, 'negotiating'))
			);

		// Cancel bet if no accepted proposition
		const acceptedRows = await tx
			.select({ id: propositions.id })
			.from(propositions)
			.where(and(eq(propositions.betId, prop.betId), eq(propositions.status, 'accepted')))
			.limit(1);

		if (acceptedRows.length === 0) {
			await tx.update(bets).set({ status: 'cancelled' }).where(eq(bets.id, prop.betId));
		}
	});
}
