import { db } from '$lib/server/db/index';
import {
	matches,
	bets,
	matchParticipants,
	matchJurors,
	matchWinners,
	ledgerEntries,
	forfeits,
	juryVotes,
	juryVoteWinners,
	juryVoteLosers
} from '$lib/server/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';

// Extract the transaction type from db.transaction callback parameter
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface VerdictResult {
	betId: string;
	groupId: string;
	betType: string;
	stakeType: string;
	juryMode: string;
	winnerCount: number;
	resolutionType: 'winners_selected' | 'not_resolved';
}

/**
 * Evaluates whether the current set of jury votes for a match has reached the
 * required consensus threshold (unanimous or majority), and if so, resolves the
 * match atomically (within the caller's transaction).
 *
 * Must be called inside an existing transaction immediately after inserting a vote.
 *
 * Behaviour:
 *  - Threshold reached on `winners_selected` (consensus on same winner set):
 *      → matches.status = 'resolved', resolved_at = now()
 *      → match_winners rows inserted
 *      → ledger_entries (points) or forfeits (gage) created
 *  - Threshold reached on `not_resolved` (consensus that match is not resolved yet):
 *      → jury_votes purged, match.status = 'open'
 *  - No threshold reached yet: no-op
 *
 * Idempotence guard: exits immediately if match is already 'resolved'.
 *
 * Returns a VerdictResult when a resolution occurred, null otherwise.
 */
export async function evaluateVerdict(matchId: string, tx: Tx): Promise<VerdictResult | null> {
	// Lock the match row to prevent concurrent double-resolution
	const matchRows = await tx.execute(
		sql`SELECT id, bet_id, status FROM matches WHERE id = ${matchId} FOR UPDATE`
	);

	if (matchRows.length === 0) return null;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const match = matchRows[0] as any;

	// Idempotence guard
	if (match.status === 'resolved') return null;
	if (match.status !== 'judging') return null;

	const betId: string = match.bet_id;

	// Fetch bet details
	const betRows = await tx
		.select({
			id: bets.id,
			groupId: bets.groupId,
			stakeType: bets.stakeType,
			stakeAmount: bets.stakeAmount,
			forfeitScope: bets.forfeitScope,
			juryMode: bets.juryMode,
			type: bets.type
		})
		.from(bets)
		.where(eq(bets.id, betId))
		.limit(1);

	if (betRows.length === 0) return null;
	const bet = betRows[0];

	// Count total jurors
	const jurorRows = await tx
		.select({ userId: matchJurors.userId })
		.from(matchJurors)
		.where(eq(matchJurors.matchId, matchId));

	const totalJurors = jurorRows.length;
	if (totalJurors === 0) return null;

	// Fetch all votes with their winner sets
	const voteRows = await tx
		.select({
			id: juryVotes.id,
			verdict: juryVotes.verdict
		})
		.from(juryVotes)
		.where(eq(juryVotes.matchId, matchId));

	const totalVotes = voteRows.length;

	if (totalVotes === 0) return null;

	// Check if enough votes exist to reach the threshold
	// For unanimous: all jurors must have voted
	// For majority: > 50% of jurors must agree
	if (bet.juryMode === 'unanimous' && totalVotes < totalJurors) {
		// Not all jurors have voted yet
		return null;
	}

	// Fetch all vote winners
	const voteIds = voteRows.map((v) => v.id);

	const winnerRows = await tx
		.select({
			voteId: juryVoteWinners.voteId,
			winnerUserId: juryVoteWinners.winnerUserId
		})
		.from(juryVoteWinners)
		.where(inArray(juryVoteWinners.voteId, voteIds));

	const loserRows = await tx
		.select({
			voteId: juryVoteLosers.voteId,
			loserUserId: juryVoteLosers.loserUserId
		})
		.from(juryVoteLosers)
		.where(inArray(juryVoteLosers.voteId, voteIds));

	// Group winners/losers by vote
	const winnersByVote = new Map<string, string[]>();
	const losersByVote = new Map<string, string[]>();

	for (const w of winnerRows) {
		if (!winnersByVote.has(w.voteId)) winnersByVote.set(w.voteId, []);
		winnersByVote.get(w.voteId)!.push(w.winnerUserId);
	}
	for (const l of loserRows) {
		if (!losersByVote.has(l.voteId)) losersByVote.set(l.voteId, []);
		losersByVote.get(l.voteId)!.push(l.loserUserId);
	}

	// Normalize a winner set to a canonical string for comparison
	// Sort IDs to make comparison order-independent
	function winnerSetKey(userIds: string[]): string {
		return [...userIds].sort().join(',');
	}

	// Count votes by verdict type and winner set
	const notResolvedCount = voteRows.filter((v) => v.verdict === 'not_resolved').length;

	// Group winners_selected votes by their winner set
	const winnerSetCounts = new Map<
		string,
		{ count: number; winnerIds: string[]; voteIds: string[] }
	>();

	for (const vote of voteRows) {
		if (vote.verdict !== 'winners_selected') continue;
		const winners = winnersByVote.get(vote.id) ?? [];
		const key = winnerSetKey(winners);
		if (!winnerSetCounts.has(key)) {
			winnerSetCounts.set(key, { count: 0, winnerIds: winners, voteIds: [] });
		}
		const entry = winnerSetCounts.get(key)!;
		entry.count++;
		entry.voteIds.push(vote.id);
	}

	// Determine threshold
	const threshold = bet.juryMode === 'unanimous' ? totalJurors : Math.floor(totalJurors / 2) + 1;

	// Check if 'not_resolved' has reached threshold
	if (notResolvedCount >= threshold) {
		// Purge votes and reopen the match
		await tx.delete(juryVotes).where(eq(juryVotes.matchId, matchId));
		await tx.update(matches).set({ status: 'open' }).where(eq(matches.id, matchId));
		return {
			betId: bet.id,
			groupId: bet.groupId,
			betType: bet.type,
			stakeType: bet.stakeType,
			juryMode: bet.juryMode,
			winnerCount: 0,
			resolutionType: 'not_resolved' as const
		};
	}

	// Check if any winner set has reached threshold
	let resolvedWinnerIds: string[] | null = null;
	let resolvedVoteIds: string[] = [];

	for (const [, entry] of winnerSetCounts) {
		if (entry.count >= threshold) {
			resolvedWinnerIds = entry.winnerIds;
			resolvedVoteIds = entry.voteIds;
			break;
		}
	}

	if (!resolvedWinnerIds || resolvedWinnerIds.length === 0) {
		// No consensus yet
		return null;
	}

	// ─── Resolution ──────────────────────────────────────────────────────────────

	// Update match status
	await tx
		.update(matches)
		.set({ status: 'resolved', resolvedAt: new Date() })
		.where(eq(matches.id, matchId));

	// Fetch all match participants
	const participantRows = await tx
		.select({
			userId: matchParticipants.userId,
			stake: matchParticipants.stake,
			side: matchParticipants.side
		})
		.from(matchParticipants)
		.where(eq(matchParticipants.matchId, matchId));

	const winnerSet = new Set(resolvedWinnerIds);
	const winners = participantRows.filter((p) => winnerSet.has(p.userId));
	const losers = participantRows.filter((p) => !winnerSet.has(p.userId));

	// Insert match_winners (share computed below)
	// We'll compute shares per winner based on total pot

	if (bet.stakeType === 'points') {
		await resolvePoints({ tx, matchId, bet, winners, losers, resolvedVoteIds });
	} else {
		await resolveForfeits({
			tx,
			matchId,
			bet,
			winners,
			losers,
			winnerSet,
			resolvedVoteIds,
			losersByVote
		});
	}

	return {
		betId: bet.id,
		groupId: bet.groupId,
		betType: bet.type,
		stakeType: bet.stakeType,
		juryMode: bet.juryMode,
		winnerCount: resolvedWinnerIds.length,
		resolutionType: 'winners_selected' as const
	};
}

// ─── Points resolution ────────────────────────────────────────────────────────

async function resolvePoints(params: {
	tx: Tx;
	matchId: string;
	bet: {
		id: string;
		groupId: string;
		stakeType: string;
		stakeAmount: string | null;
		type: string;
	};
	winners: { userId: string; stake: string | null }[];
	losers: { userId: string; stake: string | null }[];
	resolvedVoteIds: string[];
}): Promise<void> {
	const { tx, matchId, bet, winners, losers } = params;

	if (winners.length === 0) return;

	// Insert match_winners (share will be computed below)
	// For yesno: winner gets the loser's stake
	// For closest multi-winner: each loser's stake split equally among winners

	// Calculate per-winner share
	// Total pot = sum of all loser stakes
	// Share for each winner = pot / numWinners (with remainder to first winner)

	// Use integer centimes to avoid float issues
	// Amounts are stored as numeric strings like "10.00"
	function parseCentimes(val: string | null): number {
		if (!val) return 0;
		return Math.round(parseFloat(val) * 100);
	}

	const numWinners = winners.length;
	const totalPotCentimes = losers.reduce((sum, l) => sum + parseCentimes(l.stake), 0);

	if (totalPotCentimes <= 0) {
		// No stakes — still record winners with share=0
		await tx.insert(matchWinners).values(
			winners.map((w) => ({
				matchId,
				userId: w.userId,
				share: '0'
			}))
		);
		return;
	}

	const baseShareCentimes = Math.floor(totalPotCentimes / numWinners);
	const remainderCentimes = totalPotCentimes - baseShareCentimes * numWinners;

	// Insert match_winners with share amounts
	await tx.insert(matchWinners).values(
		winners.map((w, i) => {
			const share = baseShareCentimes + (i === 0 ? remainderCentimes : 0);
			return {
				matchId,
				userId: w.userId,
				share: (share / 100).toFixed(2)
			};
		})
	);

	// Insert ledger entries:
	// Each loser owes their stake split equally among winners
	// For yesno (1 loser, 1 winner): loser owes stake to winner
	// For closest multi-winner: each loser owes share to each winner

	const ledgerValues: {
		groupId: string;
		matchId: string;
		debtorId: string;
		creditorId: string;
		amount: string;
	}[] = [];

	for (const loser of losers) {
		const loserStakeCentimes = parseCentimes(loser.stake);
		if (loserStakeCentimes <= 0) continue;

		const baseAmountCentimes = Math.floor(loserStakeCentimes / numWinners);
		const remainder = loserStakeCentimes - baseAmountCentimes * numWinners;

		for (let i = 0; i < winners.length; i++) {
			const amountCentimes = baseAmountCentimes + (i === 0 ? remainder : 0);
			if (amountCentimes <= 0) continue;
			ledgerValues.push({
				groupId: bet.groupId,
				matchId,
				debtorId: loser.userId,
				creditorId: winners[i].userId,
				amount: (amountCentimes / 100).toFixed(2)
			});
		}
	}

	if (ledgerValues.length > 0) {
		await tx.insert(ledgerEntries).values(ledgerValues);
	}
}

// ─── Forfeit resolution ───────────────────────────────────────────────────────

async function resolveForfeits(params: {
	tx: Tx;
	matchId: string;
	bet: {
		id: string;
		groupId: string;
		stakeType: string;
		forfeitScope: 'all_losers' | 'last_one' | null;
		type: string;
	};
	winners: { userId: string; stake: string | null }[];
	losers: { userId: string; stake: string | null }[];
	winnerSet: Set<string>;
	resolvedVoteIds: string[];
	losersByVote: Map<string, string[]>;
}): Promise<void> {
	const { tx, matchId, bet, losers, resolvedVoteIds, losersByVote } = params;

	if (losers.length === 0) return;

	// Insert match_winners (share = null for forfeits)
	const { winners } = params;
	if (winners.length > 0) {
		await tx.insert(matchWinners).values(
			winners.map((w) => ({
				matchId,
				userId: w.userId,
				share: null
			}))
		);
	}

	if (bet.forfeitScope === 'all_losers') {
		// One forfeit per loser
		await tx.insert(forfeits).values(
			losers.map((l) => ({
				matchId,
				debtorId: l.userId,
				status: 'pending' as const
			}))
		);
	} else if (bet.forfeitScope === 'last_one') {
		// One forfeit for the "last" loser — determined by majority vote from winning votes
		// Aggregate loserUserId across votes that selected winners (resolvedVoteIds)

		const loserVoteCounts = new Map<string, number>();
		for (const voteId of resolvedVoteIds) {
			const loserIds = losersByVote.get(voteId) ?? [];
			for (const loserId of loserIds) {
				loserVoteCounts.set(loserId, (loserVoteCounts.get(loserId) ?? 0) + 1);
			}
		}

		// Pick the loser with the most votes (tie-break: first in map)
		let lastLoserUserId: string | null = null;
		let maxCount = 0;
		for (const [userId, count] of loserVoteCounts) {
			if (count > maxCount) {
				maxCount = count;
				lastLoserUserId = userId;
			}
		}

		if (lastLoserUserId) {
			await tx.insert(forfeits).values({
				matchId,
				debtorId: lastLoserUserId,
				status: 'pending' as const
			});
		} else if (losers.length > 0) {
			// Fallback: no loser designated — use the first loser
			await tx.insert(forfeits).values({
				matchId,
				debtorId: losers[0].userId,
				status: 'pending' as const
			});
		}
	} else {
		// No forfeit_scope (yesno forfeit): create one forfeit per loser
		await tx.insert(forfeits).values(
			losers.map((l) => ({
				matchId,
				debtorId: l.userId,
				status: 'pending' as const
			}))
		);
	}
}
