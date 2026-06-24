import { db } from '$lib/server/db/index';
import { matches, matchParticipants, matchCancellations, bets } from '$lib/server/db/schema';
import { and, eq, sql } from 'drizzle-orm';

// Extract the transaction type from db.transaction callback parameter
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CancellationState {
	/** Users who have requested cancellation */
	requesters: string[];
	/** Total number of participants in the match */
	totalParticipants: number;
	/** Whether the match is now cancelled (all participants agreed) */
	isCancelled: boolean;
}

/**
 * Requests cancellation of a match on behalf of a participant.
 * If all participants have now requested cancellation, sets match.status = 'cancelled'.
 *
 * Guards:
 * - Match must be in 'open' or 'judging' status
 * - User must be a participant of the match
 * - User must not have already requested cancellation (idempotent: returns current state)
 *
 * Uses SELECT ... FOR UPDATE to serialize concurrent requests.
 *
 * Returns the updated CancellationState.
 */
export async function requestMatchCancellation(params: {
	matchId: string;
	userId: string;
}): Promise<CancellationState> {
	let state: CancellationState | undefined;

	await db.transaction(async (tx) => {
		state = await _requestCancellationTx(tx, params.matchId, params.userId);
	});

	if (!state) throw new Error("Erreur lors de la demande d'annulation.");
	return state;
}

async function _requestCancellationTx(
	tx: Tx,
	matchId: string,
	userId: string
): Promise<CancellationState> {
	// Lock the match row to prevent concurrent double-cancellation
	const matchRows = await tx.execute(
		sql`SELECT id, bet_id, status FROM matches WHERE id = ${matchId} FOR UPDATE`
	);

	if (matchRows.length === 0) {
		throw new Error('Match introuvable.');
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const match = matchRows[0] as any;

	if (match.status !== 'open' && match.status !== 'judging') {
		throw new Error(
			"L'annulation unanime n'est possible que sur un match en cours ou en jugement."
		);
	}

	// Verify user is a participant
	const participantRows = await tx
		.select({ userId: matchParticipants.userId })
		.from(matchParticipants)
		.where(eq(matchParticipants.matchId, matchId));

	const participantIds = participantRows.map((p) => p.userId);
	const totalParticipants = participantIds.length;

	if (!participantIds.includes(userId)) {
		throw new Error("Vous n'êtes pas participant de ce match.");
	}

	// Insert cancellation request (ignore conflict if already requested)
	await tx.insert(matchCancellations).values({ matchId, userId }).onConflictDoNothing();

	// Count current cancellation requests
	const countRows = await tx
		.select({ userId: matchCancellations.userId })
		.from(matchCancellations)
		.where(eq(matchCancellations.matchId, matchId));

	const requesters = countRows.map((r) => r.userId);

	// If all participants have requested, cancel the match
	if (requesters.length >= totalParticipants && totalParticipants > 0) {
		await tx.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, matchId));

		return { requesters, totalParticipants, isCancelled: true };
	}

	return { requesters, totalParticipants, isCancelled: false };
}

/**
 * Withdraws a cancellation request from a participant.
 * Only possible if the match has not yet been cancelled.
 *
 * Returns the updated CancellationState.
 */
export async function withdrawCancellationRequest(params: {
	matchId: string;
	userId: string;
}): Promise<CancellationState> {
	let state: CancellationState | undefined;

	await db.transaction(async (tx) => {
		// Lock the match row
		const matchRows = await tx.execute(
			sql`SELECT id, bet_id, status FROM matches WHERE id = ${params.matchId} FOR UPDATE`
		);

		if (matchRows.length === 0) {
			throw new Error('Match introuvable.');
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const match = matchRows[0] as any;

		if (match.status === 'cancelled') {
			throw new Error('Ce match est déjà annulé, le retrait est impossible.');
		}

		if (match.status !== 'open' && match.status !== 'judging') {
			throw new Error("Le retrait n'est possible que sur un match en cours ou en jugement.");
		}

		// Verify user is a participant
		const participantRows = await tx
			.select({ userId: matchParticipants.userId })
			.from(matchParticipants)
			.where(eq(matchParticipants.matchId, params.matchId));

		const participantIds = participantRows.map((p) => p.userId);
		const totalParticipants = participantIds.length;

		if (!participantIds.includes(params.userId)) {
			throw new Error("Vous n'êtes pas participant de ce match.");
		}

		// Delete the cancellation request
		await tx
			.delete(matchCancellations)
			.where(
				and(
					eq(matchCancellations.matchId, params.matchId),
					eq(matchCancellations.userId, params.userId)
				)
			);

		// Fetch updated requesters
		const countRows = await tx
			.select({ userId: matchCancellations.userId })
			.from(matchCancellations)
			.where(eq(matchCancellations.matchId, params.matchId));

		state = {
			requesters: countRows.map((r) => r.userId),
			totalParticipants,
			isCancelled: false
		};
	});

	if (!state) throw new Error("Erreur lors du retrait de la demande d'annulation.");
	return state;
}

/**
 * Fetches current cancellation state for a match.
 * Returns null if match not found.
 */
export async function getCancellationState(matchId: string): Promise<CancellationState | null> {
	// Fetch participants
	const participantRows = await db
		.select({ userId: matchParticipants.userId })
		.from(matchParticipants)
		.where(eq(matchParticipants.matchId, matchId));

	const totalParticipants = participantRows.length;

	// Fetch cancellation requests
	const cancellationRows = await db
		.select({ userId: matchCancellations.userId })
		.from(matchCancellations)
		.where(eq(matchCancellations.matchId, matchId));

	const requesters = cancellationRows.map((r) => r.userId);

	// Check current match status
	const matchRows = await db
		.select({ status: matches.status })
		.from(matches)
		.where(eq(matches.id, matchId))
		.limit(1);

	if (matchRows.length === 0) return null;

	const isCancelled = matchRows[0].status === 'cancelled';

	return { requesters, totalParticipants, isCancelled };
}

// Also export a helper that checks if bet status needs to be updated when match is cancelled.
// For yesno duel bets: when the match is cancelled, the bet can remain open
// (the proposition was accepted and match was created — we just mark the bet back).
// For now, we keep it simple: cancelling a match doesn't change the bet status.
// The bet will naturally appear as "cancelled match" in the UI.

/**
 * After a match is cancelled, check if the parent bet should be updated.
 * For yesno bets in duel mode: the bet can be "re-opened" or stay closed.
 * Decision: we leave the bet status as-is (it's still 'closed' if all matches are done).
 * The UI shows "Pari annulé d'un commun accord" based on match.status = 'cancelled'.
 */
export async function handleBetAfterMatchCancellation(matchId: string): Promise<void> {
	// Fetch the match's bet
	const matchRows = await db
		.select({ betId: matches.betId })
		.from(matches)
		.where(eq(matches.id, matchId))
		.limit(1);

	if (matchRows.length === 0) return;

	const betId = matchRows[0].betId;

	// Fetch bet type and status
	const betRows = await db
		.select({ type: bets.type, status: bets.status })
		.from(bets)
		.where(eq(bets.id, betId))
		.limit(1);

	if (betRows.length === 0) return;

	// No additional action needed — the match status is already 'cancelled'.
	// The bet remains in its current status.
}
