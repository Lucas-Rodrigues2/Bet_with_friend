import { db } from '$lib/server/db/index';
import {
	juryVotes,
	juryVoteWinners,
	juryVoteLosers,
	matches,
	matchJurors,
	matchParticipants,
	profiles
} from '$lib/server/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

export interface CastJuryVoteParams {
	matchId: string;
	jurorId: string;
	verdict: 'winners_selected' | 'not_resolved';
	// IDs of winning participants (required if verdict='winners_selected')
	winnerUserIds?: string[];
	// ID of the losing participant (required for closest bets with forfeit_scope='last_one')
	loserUserId?: string | null;
}

export interface JuryVoteRow {
	id: string;
	matchId: string;
	jurorId: string;
	jurorPseudo: string;
	jurorAvatarUrl: string | null;
	verdict: 'winners_selected' | 'not_resolved';
	winners: { userId: string; pseudo: string; avatarUrl: string | null }[];
	losers: { userId: string; pseudo: string; avatarUrl: string | null }[];
	createdAt: Date;
}

/**
 * Records (or updates) a juror's vote for a match in 'judging' status.
 * Uses DELETE + INSERT to handle re-votes (the UNIQUE constraint prevents duplicates).
 *
 * Guards:
 *   - match must be in 'judging' status
 *   - jurorId must be in match_jurors
 *   - winnerUserIds must be valid match participants (when verdict='winners_selected')
 *   - loserUserId must be a valid match participant (when provided)
 *   - For yesno bets: at most 1 winner
 *
 * Throws on violation, returns voteId on success.
 */
export async function castJuryVote(params: CastJuryVoteParams): Promise<{ voteId: string }> {
	let voteId: string | undefined;

	await db.transaction(async (tx) => {
		// Verify match exists and is in judging status
		const matchRows = await tx
			.select({ id: matches.id, status: matches.status, betId: matches.betId })
			.from(matches)
			.where(eq(matches.id, params.matchId))
			.limit(1);

		if (matchRows.length === 0) {
			throw new Error('Match introuvable.');
		}

		const match = matchRows[0];

		if (match.status !== 'judging') {
			throw new Error('Ce match nest pas en phase de jugement.');
		}

		// Verify the juror is actually a juror for this match
		const jurorRows = await tx
			.select({ userId: matchJurors.userId })
			.from(matchJurors)
			.where(and(eq(matchJurors.matchId, params.matchId), eq(matchJurors.userId, params.jurorId)))
			.limit(1);

		if (jurorRows.length === 0) {
			throw new Error("Vous n'êtes pas juré de ce match.");
		}

		// Validate winners if verdict='winners_selected'
		if (params.verdict === 'winners_selected') {
			if (!params.winnerUserIds || params.winnerUserIds.length === 0) {
				throw new Error('Vous devez sélectionner au moins un gagnant.');
			}

			// Check all winners are participants in this match
			const participantRows = await tx
				.select({ userId: matchParticipants.userId })
				.from(matchParticipants)
				.where(eq(matchParticipants.matchId, params.matchId));

			const participantIds = new Set(participantRows.map((p) => p.userId));

			for (const winnerId of params.winnerUserIds) {
				if (!participantIds.has(winnerId)) {
					throw new Error('Un ou plusieurs gagnants sélectionnés ne sont pas des participants.');
				}
			}

			// Validate loser (last_one scope)
			if (params.loserUserId) {
				if (!participantIds.has(params.loserUserId)) {
					throw new Error('Le perdant sélectionné nest pas un participant de ce match.');
				}
			}
		}

		// Delete existing vote for this juror+match (re-vote: DELETE + INSERT)
		const existingVotes = await tx
			.select({ id: juryVotes.id })
			.from(juryVotes)
			.where(and(eq(juryVotes.matchId, params.matchId), eq(juryVotes.jurorId, params.jurorId)));

		if (existingVotes.length > 0) {
			// Cascade delete will handle jury_vote_winners and jury_vote_losers
			await tx.delete(juryVotes).where(
				inArray(
					juryVotes.id,
					existingVotes.map((v) => v.id)
				)
			);
		}

		// Insert new vote
		const [newVote] = await tx
			.insert(juryVotes)
			.values({
				matchId: params.matchId,
				jurorId: params.jurorId,
				verdict: params.verdict
			})
			.returning({ id: juryVotes.id });

		voteId = newVote.id;

		// Insert winners if verdict='winners_selected'
		if (
			params.verdict === 'winners_selected' &&
			params.winnerUserIds &&
			params.winnerUserIds.length > 0
		) {
			await tx.insert(juryVoteWinners).values(
				params.winnerUserIds.map((userId) => ({
					voteId: newVote.id,
					winnerUserId: userId
				}))
			);
		}

		// Insert loser if provided (last_one scope)
		if (params.verdict === 'winners_selected' && params.loserUserId) {
			await tx.insert(juryVoteLosers).values({
				voteId: newVote.id,
				loserUserId: params.loserUserId
			});
		}
	});

	if (!voteId) throw new Error('Erreur lors de lenregistrement du vote.');
	return { voteId };
}

/**
 * Fetches all jury votes for a match, with juror profile and winner/loser details.
 * Returns an empty array if no votes exist.
 */
export async function getJuryVotesForMatch(matchId: string): Promise<JuryVoteRow[]> {
	// Fetch all votes for this match
	const voteRows = await db
		.select({
			id: juryVotes.id,
			matchId: juryVotes.matchId,
			jurorId: juryVotes.jurorId,
			jurorPseudo: profiles.pseudo,
			jurorAvatarUrl: profiles.avatarUrl,
			verdict: juryVotes.verdict,
			createdAt: juryVotes.createdAt
		})
		.from(juryVotes)
		.innerJoin(profiles, eq(profiles.id, juryVotes.jurorId))
		.where(eq(juryVotes.matchId, matchId));

	if (voteRows.length === 0) return [];

	const voteIds = voteRows.map((v) => v.id);

	// Fetch winners for all votes
	const winnerRows = await db
		.select({
			voteId: juryVoteWinners.voteId,
			userId: juryVoteWinners.winnerUserId,
			pseudo: profiles.pseudo,
			avatarUrl: profiles.avatarUrl
		})
		.from(juryVoteWinners)
		.innerJoin(profiles, eq(profiles.id, juryVoteWinners.winnerUserId))
		.where(inArray(juryVoteWinners.voteId, voteIds));

	// Fetch losers for all votes
	const loserRows = await db
		.select({
			voteId: juryVoteLosers.voteId,
			userId: juryVoteLosers.loserUserId,
			pseudo: profiles.pseudo,
			avatarUrl: profiles.avatarUrl
		})
		.from(juryVoteLosers)
		.innerJoin(profiles, eq(profiles.id, juryVoteLosers.loserUserId))
		.where(inArray(juryVoteLosers.voteId, voteIds));

	// Group winners and losers by vote ID
	const winnersByVote = new Map<
		string,
		{ userId: string; pseudo: string; avatarUrl: string | null }[]
	>();
	for (const w of winnerRows) {
		if (!winnersByVote.has(w.voteId)) winnersByVote.set(w.voteId, []);
		winnersByVote
			.get(w.voteId)!
			.push({ userId: w.userId, pseudo: w.pseudo, avatarUrl: w.avatarUrl });
	}

	const losersByVote = new Map<
		string,
		{ userId: string; pseudo: string; avatarUrl: string | null }[]
	>();
	for (const l of loserRows) {
		if (!losersByVote.has(l.voteId)) losersByVote.set(l.voteId, []);
		losersByVote
			.get(l.voteId)!
			.push({ userId: l.userId, pseudo: l.pseudo, avatarUrl: l.avatarUrl });
	}

	return voteRows.map((v) => ({
		id: v.id,
		matchId: v.matchId,
		jurorId: v.jurorId,
		jurorPseudo: v.jurorPseudo,
		jurorAvatarUrl: v.jurorAvatarUrl,
		verdict: v.verdict as 'winners_selected' | 'not_resolved',
		winners: winnersByVote.get(v.id) ?? [],
		losers: losersByVote.get(v.id) ?? [],
		createdAt: v.createdAt
	}));
}
