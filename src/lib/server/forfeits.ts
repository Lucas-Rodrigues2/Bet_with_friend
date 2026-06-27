import { db } from '$lib/server/db/index';
import { bets, forfeits, matchWinners, matches } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

// ─── Forfeit lifecycle helpers ────────────────────────────────────────────────

/**
 * Fetches a forfeit and verifies the caller is its debtor.
 * Throws if the forfeit does not exist or the user is not the debtor.
 */
async function verifyDebtor(
	forfeitId: string,
	userId: string
): Promise<{ matchId: string; status: string; claimedAt: Date | null }> {
	const rows = await db
		.select({
			matchId: forfeits.matchId,
			debtorId: forfeits.debtorId,
			status: forfeits.status,
			claimedAt: forfeits.claimedAt
		})
		.from(forfeits)
		.where(eq(forfeits.id, forfeitId))
		.limit(1);

	if (rows.length === 0) throw new Error('Gage introuvable.');
	const row = rows[0];
	if (row.debtorId !== userId) throw new Error("Vous n'êtes pas le débiteur de ce gage.");
	return { matchId: row.matchId, status: row.status, claimedAt: row.claimedAt };
}

/**
 * Fetches a forfeit and verifies the caller is a winner of its match.
 * Throws if the forfeit does not exist or the user is not a winner.
 */
async function verifyWinner(
	forfeitId: string,
	userId: string
): Promise<{ matchId: string; status: string; claimedAt: Date | null }> {
	const rows = await db
		.select({
			matchId: forfeits.matchId,
			status: forfeits.status,
			claimedAt: forfeits.claimedAt
		})
		.from(forfeits)
		.where(eq(forfeits.id, forfeitId))
		.limit(1);

	if (rows.length === 0) throw new Error('Gage introuvable.');
	const { matchId, status, claimedAt } = rows[0];

	const winnerRows = await db
		.select({ userId: matchWinners.userId })
		.from(matchWinners)
		.where(and(eq(matchWinners.matchId, matchId), eq(matchWinners.userId, userId)))
		.limit(1);

	if (winnerRows.length === 0) throw new Error("Vous n'êtes pas gagnant de ce pari.");

	return { matchId, status, claimedAt };
}

/**
 * Debtor marks their forfeit as claimed (done on their side), with an optional proof URL.
 * Sets claimed_at = now(). Status stays 'pending' until a winner confirms.
 */
export async function claimForfeit(params: {
	forfeitId: string;
	userId: string;
	proofUrl: string | null;
}): Promise<void> {
	const { forfeitId, userId, proofUrl } = params;

	const { status } = await verifyDebtor(forfeitId, userId);

	if (status !== 'pending') {
		throw new Error("Ce gage n'est plus en attente.");
	}

	await db
		.update(forfeits)
		.set({ claimedAt: new Date(), proofUrl: proofUrl ?? null })
		.where(and(eq(forfeits.id, forfeitId), eq(forfeits.status, 'pending')));
}

/**
 * Winner confirms a claimed forfeit → status becomes 'done'.
 * Only allowed when status='pending' AND claimed_at is not null.
 */
export async function confirmForfeit(params: { forfeitId: string; userId: string }): Promise<void> {
	const { forfeitId, userId } = params;

	const { status, claimedAt } = await verifyWinner(forfeitId, userId);

	if (status !== 'pending') {
		throw new Error("Ce gage n'est plus en attente.");
	}
	if (!claimedAt) {
		throw new Error("Le débiteur n'a pas encore déclaré avoir fait son gage.");
	}

	await db
		.update(forfeits)
		.set({ status: 'done', confirmedBy: userId })
		.where(eq(forfeits.id, forfeitId));
}

/**
 * Winner rejects a claimed forfeit → resets claimed_at to null so debtor can re-claim.
 * Only allowed when status='pending' AND claimed_at is not null.
 */
export async function rejectForfeit(params: { forfeitId: string; userId: string }): Promise<void> {
	const { forfeitId, userId } = params;

	const { status, claimedAt } = await verifyWinner(forfeitId, userId);

	if (status !== 'pending') {
		throw new Error("Ce gage n'est plus en attente.");
	}
	if (!claimedAt) {
		throw new Error("Le débiteur n'a pas encore déclaré avoir fait son gage.");
	}

	await db
		.update(forfeits)
		.set({ claimedAt: null, proofUrl: null })
		.where(eq(forfeits.id, forfeitId));
}

/**
 * Winner marks a forfeit as not_done (gage non tenu).
 * Allowed at any time while status='pending'.
 */
export async function markForfeitNotDone(params: {
	forfeitId: string;
	userId: string;
}): Promise<void> {
	const { forfeitId, userId } = params;

	const { status } = await verifyWinner(forfeitId, userId);

	if (status !== 'pending') {
		throw new Error('Ce gage ne peut plus être modifié.');
	}

	await db
		.update(forfeits)
		.set({ status: 'not_done', confirmedBy: userId })
		.where(eq(forfeits.id, forfeitId));
}

// ─── Dashboard query ──────────────────────────────────────────────────────────

export interface MyPendingForfeit {
	id: string;
	matchId: string;
	betId: string;
	betTitle: string;
	forfeitDescription: string | null;
	claimedAt: Date | null;
	status: 'pending' | 'done' | 'not_done';
}

/**
 * Returns all pending forfeits (status='pending') where the user is the debtor,
 * for matches belonging to bets in the given group.
 */
export async function getMyPendingForfeitsForGroup(
	groupId: string,
	userId: string
): Promise<MyPendingForfeit[]> {
	const rows = await db
		.select({
			id: forfeits.id,
			matchId: forfeits.matchId,
			claimedAt: forfeits.claimedAt,
			status: forfeits.status,
			betId: bets.id,
			betTitle: bets.title,
			forfeitDescription: bets.forfeitDescription
		})
		.from(forfeits)
		.innerJoin(matches, eq(matches.id, forfeits.matchId))
		.innerJoin(bets, and(eq(bets.id, matches.betId), eq(bets.groupId, groupId)))
		.where(and(eq(forfeits.debtorId, userId), eq(forfeits.status, 'pending')));

	return rows.map((r) => ({
		id: r.id,
		matchId: r.matchId,
		betId: r.betId,
		betTitle: r.betTitle,
		forfeitDescription: r.forfeitDescription,
		claimedAt: r.claimedAt,
		status: r.status as 'pending' | 'done' | 'not_done'
	}));
}
