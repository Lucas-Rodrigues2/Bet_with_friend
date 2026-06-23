import { db } from '$lib/server/db/index';
import { matches, bets } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

export interface MatchRow {
	id: string;
	betId: string;
	status: string;
}

/**
 * Lazily resolves the match status based on the participation deadline.
 * If the deadline has passed and the match is still 'open', transitions it to 'judging'.
 * This is called at load time (no cron needed).
 *
 * Returns the (potentially updated) status.
 */
export async function resolveMatchStatus(match: MatchRow): Promise<string> {
	if (match.status !== 'open') {
		// Already past 'open', nothing to do
		return match.status;
	}

	// Fetch the bet's participation deadline
	const betRows = await db
		.select({ participationDeadline: bets.participationDeadline })
		.from(bets)
		.where(eq(bets.id, match.betId))
		.limit(1);

	if (betRows.length === 0) return match.status;

	const { participationDeadline } = betRows[0];

	if (!participationDeadline) return match.status;

	const now = new Date();
	if (now <= participationDeadline) return match.status;

	// Deadline passed → transition open → judging (idempotent conditional UPDATE)
	await db
		.update(matches)
		.set({ status: 'judging' })
		.where(and(eq(matches.id, match.id), eq(matches.status, 'open')));

	return 'judging';
}

/**
 * Submits a match to the jury: transitions open → judging.
 * Only allowed if match.status = 'open'.
 * Returns on success, throws on failure.
 */
export async function submitMatchToJury(matchId: string): Promise<void> {
	// Verify match exists and is open
	const matchRows = await db
		.select({ id: matches.id, status: matches.status, betId: matches.betId })
		.from(matches)
		.where(eq(matches.id, matchId))
		.limit(1);

	if (matchRows.length === 0) {
		throw new Error('Match introuvable.');
	}

	const match = matchRows[0];

	if (match.status !== 'open') {
		throw new Error('Ce pari est déjà soumis au jury ou clôturé.');
	}

	// Idempotent conditional UPDATE: only updates if status is still 'open'
	const result = await db
		.update(matches)
		.set({ status: 'judging' })
		.where(and(eq(matches.id, matchId), eq(matches.status, 'open')))
		.returning({ id: matches.id });

	if (result.length === 0) {
		// Race condition: another request already transitioned the status
		throw new Error('Ce pari est déjà soumis au jury.');
	}
}
