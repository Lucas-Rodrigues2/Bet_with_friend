import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { groupMembers } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import {
	getBetDetailForUser,
	isActiveMemberOfBetGroup,
	participateInClosestBet,
	acceptOpenChallenge
} from '$lib/server/bets';
import { submitMatchToJury } from '$lib/server/matches';
import { castJuryVote } from '$lib/server/jury';
import {
	acceptProposition,
	refuseProposition,
	cancelProposition,
	counterPropose
} from '$lib/server/propositions';
import { captureServer } from '$lib/server/analytics';
import type { Actions, PageServerLoad } from './$types';

// UUID regex that accepts any 8-4-4-4-12 hex format (not restricted to RFC 4122 version/variant bits)
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ locals, params }) => {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) throw redirect(303, '/login');

	if (!uuidRegex.test(params.id)) {
		throw error(404, 'Pari introuvable.');
	}
	if (!uuidRegex.test(params.betId)) {
		throw error(404, 'Pari introuvable.');
	}

	// Check user is active member of the group
	const isMember = await isActiveMemberOfBetGroup(params.betId, params.id, user.id);

	// Fetch bet detail (checks visibility, including juror visibility for judging bets)
	const bet = await getBetDetailForUser(params.betId, user.id);

	if (!bet) {
		// Not in visibility list and not a juror of a judging match
		throw error(404, 'Pari introuvable ou accès refusé.');
	}

	// Determine if current user is a participant of the match
	let isParticipant = false;
	let isJuror = false;

	if (bet.matchId) {
		// Check participant
		isParticipant = bet.participants.some((p) => p.userId === user.id);

		// Check juror
		isJuror = bet.jurors.some((j) => j.userId === user.id);
	}

	return {
		bet: {
			id: bet.id,
			groupId: bet.groupId,
			creatorId: bet.creatorId,
			type: bet.type,
			title: bet.title,
			description: bet.description,
			stakeType: bet.stakeType,
			stakeAmount: bet.stakeAmount,
			forfeitDescription: bet.forfeitDescription,
			forfeitScope: bet.forfeitScope,
			hideAnswers: bet.hideAnswers,
			participationDeadline: bet.participationDeadline,
			juryMode: bet.juryMode,
			status: bet.status,
			createdAt: bet.createdAt,
			matchId: bet.matchId,
			matchStatus: bet.matchStatus,
			visibility: bet.visibility,
			jurors: bet.jurors,
			participants: bet.participants,
			myParticipation: bet.myParticipation,
			yesno: bet.yesno,
			openMatches: bet.openMatches,
			betJurorsList: bet.betJurorsList,
			proposition: bet.proposition,
			juryVotes: bet.juryVotes
		},
		currentUserId: user.id,
		isParticipant,
		isJuror,
		isMember
	};
};

// Zod schema for participation form
const participateSchema = z.object({
	answer: z.string().min(1, "L'estimation est obligatoire.").max(500, 'Estimation trop longue.')
});

// Zod schema for counter-propose form
const counterProposeSchema = z
	.object({
		propositionId: z.string().regex(uuidRegex, 'Proposition invalide.'),
		stakeType: z.enum(['points', 'forfeit']),
		stakeCreator: z.string().optional(),
		stakeTarget: z.string().optional(),
		forfeitCreator: z.string().optional(),
		forfeitTarget: z.string().optional(),
		juryUserIds: z
			.union([
				z.string().regex(uuidRegex, 'UUID juré invalide.'),
				z.array(z.string().regex(uuidRegex, 'UUID juré invalide.'))
			])
			.optional()
	})
	.superRefine((data, ctx) => {
		if (data.stakeType === 'points') {
			const sc = parseFloat(data.stakeCreator ?? '');
			if (!data.stakeCreator || isNaN(sc) || sc <= 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['stakeCreator'],
					message: 'La mise du créateur doit être supérieure à 0.'
				});
			}
			const st = parseFloat(data.stakeTarget ?? '');
			if (!data.stakeTarget || isNaN(st) || st <= 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['stakeTarget'],
					message: 'La mise de la cible doit être supérieure à 0.'
				});
			}
		}
		if (data.stakeType === 'forfeit') {
			if (!data.forfeitCreator || data.forfeitCreator.trim().length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['forfeitCreator'],
					message: 'Le gage du créateur est obligatoire.'
				});
			}
			if (!data.forfeitTarget || data.forfeitTarget.trim().length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['forfeitTarget'],
					message: 'Le gage de la cible est obligatoire.'
				});
			}
		}
	});

export const actions: Actions = {
	participate: async ({ locals, params, request }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { participateError: 'Non authentifie.' });

		if (!uuidRegex.test(params.id) || !uuidRegex.test(params.betId)) {
			return fail(400, { participateError: 'Parametres invalides.' });
		}

		// Verify user is active member of the group
		const isMember = await isActiveMemberOfBetGroup(params.betId, params.id, user.id);
		if (!isMember) {
			return fail(403, { participateError: 'Acces refuse.' });
		}

		// Fetch bet to get matchId and verify it's a closest bet
		const bet = await getBetDetailForUser(params.betId, user.id);
		if (!bet) {
			return fail(404, { participateError: 'Pari introuvable.' });
		}

		if (bet.type !== 'closest') {
			return fail(400, { participateError: 'Ce pari nest pas un pari au plus proche.' });
		}

		if (!bet.matchId) {
			return fail(400, { participateError: 'Aucun match associe a ce pari.' });
		}

		const matchId = bet.matchId;

		// Parse form data
		const formData = await request.formData();
		const raw = {
			answer: formData.get('answer') as string
		};

		const result = participateSchema.safeParse(raw);
		if (!result.success) {
			const firstError =
				Object.values(result.error.flatten().fieldErrors).flat()[0] ?? 'Donnees invalides.';
			return fail(400, { participateError: firstError, participateValues: raw });
		}

		const isModification = bet.myParticipation !== null;
		const answer = result.data.answer.trim();

		try {
			await participateInClosestBet({
				matchId,
				userId: user.id,
				answer,
				stake: bet.stakeType === 'points' ? (bet.stakeAmount ?? null) : null
			});

			await captureServer({
				distinctId: user.id,
				event: isModification ? 'bet_participation_updated' : 'bet_participated',
				properties: {
					bet_id: params.betId,
					match_id: matchId,
					group_id: params.id,
					bet_type: 'closest',
					stake_type: bet.stakeType
				}
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Erreur lors de la participation.';
			return fail(400, { participateError: message, participateValues: raw });
		}

		// Redirect to reload the page with fresh data
		throw redirect(303, `/app/groups/${params.id}/bets/${params.betId}`);
	},

	submit_to_jury: async ({ locals, params }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { submitError: 'Non authentifie.' });

		if (!uuidRegex.test(params.id) || !uuidRegex.test(params.betId)) {
			return fail(400, { submitError: 'Parametres invalides.' });
		}

		// Verify user is active member of the group
		const isMember = await isActiveMemberOfBetGroup(params.betId, params.id, user.id);
		if (!isMember) {
			return fail(403, { submitError: 'Acces refuse.' });
		}

		// Fetch bet to verify access and get matchId
		const bet = await getBetDetailForUser(params.betId, user.id);
		if (!bet) {
			return fail(404, { submitError: 'Pari introuvable.' });
		}

		if (bet.type !== 'closest') {
			return fail(400, { submitError: 'Ce pari nest pas un pari au plus proche.' });
		}

		if (!bet.matchId) {
			return fail(400, { submitError: 'Aucun match associe a ce pari.' });
		}

		// Verify caller is a participant
		const isParticipant = bet.participants.some((p) => p.userId === user.id);
		if (!isParticipant) {
			return fail(403, { submitError: 'Seuls les participants peuvent soumettre au jury.' });
		}

		try {
			await submitMatchToJury(bet.matchId);

			await captureServer({
				distinctId: user.id,
				event: 'bet_submitted_to_jury',
				properties: {
					bet_id: params.betId,
					match_id: bet.matchId,
					group_id: params.id,
					bet_type: 'closest'
				}
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Erreur lors de la soumission au jury.';
			return fail(400, { submitError: message });
		}

		// Redirect to reload the page with fresh data
		throw redirect(303, `/app/groups/${params.id}/bets/${params.betId}`);
	},

	submit_to_jury_yesno: async ({ locals, params }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { submitError: 'Non authentifie.' });

		if (!uuidRegex.test(params.id) || !uuidRegex.test(params.betId)) {
			return fail(400, { submitError: 'Parametres invalides.' });
		}

		// Verify user is active member of the group
		const isMember = await isActiveMemberOfBetGroup(params.betId, params.id, user.id);
		if (!isMember) {
			return fail(403, { submitError: 'Acces refuse.' });
		}

		// Fetch bet to verify access and get matchId
		const bet = await getBetDetailForUser(params.betId, user.id);
		if (!bet) {
			return fail(404, { submitError: 'Pari introuvable.' });
		}

		if (bet.type !== 'yesno') {
			return fail(400, { submitError: 'Ce pari nest pas un duel Oui/Non.' });
		}

		if (!bet.matchId) {
			return fail(400, { submitError: 'Aucun match associe a ce pari.' });
		}

		// Verify caller is a participant
		const isParticipant = bet.participants.some((p) => p.userId === user.id);
		if (!isParticipant) {
			return fail(403, { submitError: 'Seuls les participants peuvent soumettre au jury.' });
		}

		try {
			await submitMatchToJury(bet.matchId);

			await captureServer({
				distinctId: user.id,
				event: 'bet_submitted_to_jury',
				properties: {
					bet_id: params.betId,
					match_id: bet.matchId,
					group_id: params.id,
					bet_type: 'yesno'
				}
			});

			await captureServer({
				distinctId: user.id,
				event: 'match_submitted_to_jury',
				properties: {
					bet_id: params.betId,
					match_id: bet.matchId,
					bet_type: 'yesno'
				}
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Erreur lors de la soumission au jury.';
			return fail(400, { submitError: message });
		}

		// Redirect to reload the page with fresh data
		throw redirect(303, `/app/groups/${params.id}/bets/${params.betId}`);
	},

	cast_jury_vote: async ({ locals, params, request }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { voteError: 'Non authentifie.' });

		if (!uuidRegex.test(params.id) || !uuidRegex.test(params.betId)) {
			return fail(400, { voteError: 'Parametres invalides.' });
		}

		// Verify user is reachable (member OR juror — jury access checked in castJuryVote)
		// We intentionally skip isActiveMemberOfBetGroup so jurors who are not group members
		// can still vote (they have access via matchJurors).

		// Fetch bet to verify access and get matchId
		const bet = await getBetDetailForUser(params.betId, user.id);
		if (!bet) {
			return fail(404, { voteError: 'Pari introuvable.' });
		}

		if (!bet.matchId) {
			return fail(400, { voteError: 'Aucun match associe a ce pari.' });
		}

		const formData = await request.formData();
		const verdict = formData.get('verdict') as string;

		if (verdict !== 'winners_selected' && verdict !== 'not_resolved') {
			return fail(400, { voteError: 'Verdict invalide.' });
		}

		let winnerUserIds: string[] = [];
		let loserUserId: string | null = null;

		if (verdict === 'winners_selected') {
			const rawWinners = formData.getAll('winnerUserIds') as string[];
			winnerUserIds = rawWinners.filter((id) => uuidRegex.test(id));

			if (winnerUserIds.length === 0) {
				return fail(400, { voteError: 'Vous devez sélectionner au moins un gagnant.' });
			}

			// For yesno: max 1 winner
			if (bet.type === 'yesno' && winnerUserIds.length > 1) {
				return fail(400, { voteError: 'Un seul gagnant possible pour un duel Oui/Non.' });
			}

			// Loser (last_one scope for closest only)
			if (bet.type === 'closest' && bet.forfeitScope === 'last_one') {
				const rawLoser = formData.get('loserUserId') as string | null;
				if (rawLoser && uuidRegex.test(rawLoser)) {
					loserUserId = rawLoser;
				}
			}
		}

		try {
			await castJuryVote({
				matchId: bet.matchId,
				jurorId: user.id,
				verdict: verdict as 'winners_selected' | 'not_resolved',
				winnerUserIds: verdict === 'winners_selected' ? winnerUserIds : [],
				loserUserId
			});

			await captureServer({
				distinctId: user.id,
				event: 'jury_vote_cast',
				properties: {
					bet_id: params.betId,
					match_id: bet.matchId,
					verdict,
					winner_count: verdict === 'winners_selected' ? winnerUserIds.length : 0,
					has_loser: loserUserId !== null
				}
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Erreur lors du vote.';
			return fail(400, { voteError: message });
		}

		throw redirect(303, `/app/groups/${params.id}/bets/${params.betId}`);
	},

	// ─── Négociation yesno ────────────────────────────────────────────────────

	accept_proposition: async ({ locals, params, request }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { negotiateError: 'Non authentifié.' });

		if (!uuidRegex.test(params.id) || !uuidRegex.test(params.betId)) {
			return fail(400, { negotiateError: 'Paramètres invalides.' });
		}

		const formData = await request.formData();
		const propositionId = formData.get('propositionId') as string;

		if (!propositionId || !uuidRegex.test(propositionId)) {
			return fail(400, { negotiateError: 'Proposition invalide.' });
		}

		// Verify group membership
		const isMember = await isActiveMemberOfBetGroup(params.betId, params.id, user.id);
		if (!isMember) {
			return fail(403, { negotiateError: 'Accès refusé.' });
		}

		try {
			const { matchId } = await acceptProposition({
				propositionId,
				userId: user.id
			});

			await captureServer({
				distinctId: user.id,
				event: 'proposition_accepted',
				properties: {
					bet_id: params.betId,
					proposition_id: propositionId,
					match_id: matchId,
					group_id: params.id
				}
			});
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Erreur lors de l'acceptation de la proposition.";
			return fail(400, { negotiateError: message });
		}

		throw redirect(303, `/app/groups/${params.id}/bets/${params.betId}`);
	},

	refuse_proposition: async ({ locals, params, request }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { negotiateError: 'Non authentifié.' });

		if (!uuidRegex.test(params.id) || !uuidRegex.test(params.betId)) {
			return fail(400, { negotiateError: 'Paramètres invalides.' });
		}

		const formData = await request.formData();
		const propositionId = formData.get('propositionId') as string;

		if (!propositionId || !uuidRegex.test(propositionId)) {
			return fail(400, { negotiateError: 'Proposition invalide.' });
		}

		// Verify group membership
		const isMember = await isActiveMemberOfBetGroup(params.betId, params.id, user.id);
		if (!isMember) {
			return fail(403, { negotiateError: 'Accès refusé.' });
		}

		try {
			await refuseProposition({
				propositionId,
				userId: user.id
			});

			await captureServer({
				distinctId: user.id,
				event: 'proposition_refused',
				properties: {
					bet_id: params.betId,
					proposition_id: propositionId,
					group_id: params.id
				}
			});
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'Erreur lors du refus de la proposition.';
			return fail(400, { negotiateError: message });
		}

		throw redirect(303, `/app/groups/${params.id}/bets/${params.betId}`);
	},

	cancel_proposition: async ({ locals, params, request }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { negotiateError: 'Non authentifié.' });

		if (!uuidRegex.test(params.id) || !uuidRegex.test(params.betId)) {
			return fail(400, { negotiateError: 'Paramètres invalides.' });
		}

		const formData = await request.formData();
		const propositionId = formData.get('propositionId') as string;

		if (!propositionId || !uuidRegex.test(propositionId)) {
			return fail(400, { negotiateError: 'Proposition invalide.' });
		}

		// Verify group membership
		const isMember = await isActiveMemberOfBetGroup(params.betId, params.id, user.id);
		if (!isMember) {
			return fail(403, { negotiateError: 'Accès refusé.' });
		}

		try {
			await cancelProposition({
				propositionId,
				userId: user.id
			});

			await captureServer({
				distinctId: user.id,
				event: 'proposition_cancelled',
				properties: {
					bet_id: params.betId,
					proposition_id: propositionId,
					group_id: params.id
				}
			});
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Erreur lors de l'annulation de la proposition.";
			return fail(400, { negotiateError: message });
		}

		throw redirect(303, `/app/groups/${params.id}/bets/${params.betId}`);
	},

	accept_open_challenge: async ({ locals, params }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { challengeError: 'Non authentifié.' });

		if (!uuidRegex.test(params.id) || !uuidRegex.test(params.betId)) {
			return fail(400, { challengeError: 'Paramètres invalides.' });
		}

		// Verify group membership
		const isMember = await isActiveMemberOfBetGroup(params.betId, params.id, user.id);
		if (!isMember) {
			return fail(403, { challengeError: 'Accès refusé.' });
		}

		try {
			const { matchId } = await acceptOpenChallenge({
				betId: params.betId,
				acceptorId: user.id
			});

			await captureServer({
				distinctId: user.id,
				event: 'open_challenge_accepted',
				properties: {
					bet_id: params.betId,
					match_id: matchId,
					group_id: params.id
				}
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : "Erreur lors de l'acceptation du défi.";
			return fail(400, { challengeError: message });
		}

		throw redirect(303, `/app/groups/${params.id}/bets/${params.betId}`);
	},

	counter_propose: async ({ locals, params, request }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { negotiateError: 'Non authentifié.' });

		if (!uuidRegex.test(params.id) || !uuidRegex.test(params.betId)) {
			return fail(400, { negotiateError: 'Paramètres invalides.' });
		}

		// Verify group membership
		const isMember = await isActiveMemberOfBetGroup(params.betId, params.id, user.id);
		if (!isMember) {
			return fail(403, { negotiateError: 'Accès refusé.' });
		}

		const formData = await request.formData();
		const rawJury = formData.getAll('juryUserIds') as string[];
		const changeJury = formData.get('changeJury') === 'true';

		const raw = {
			propositionId: formData.get('propositionId') as string,
			stakeType: formData.get('stakeType') as string,
			stakeCreator: (formData.get('stakeCreator') as string | null) ?? undefined,
			stakeTarget: (formData.get('stakeTarget') as string | null) ?? undefined,
			forfeitCreator: (formData.get('forfeitCreator') as string | null) ?? undefined,
			forfeitTarget: (formData.get('forfeitTarget') as string | null) ?? undefined,
			juryUserIds: rawJury
		};

		const result = counterProposeSchema.safeParse(raw);
		if (!result.success) {
			const fieldErrors = result.error.flatten().fieldErrors;
			const firstError = Object.values(fieldErrors).flat()[0] ?? 'Données invalides.';
			return fail(400, { negotiateError: firstError, counterFieldErrors: fieldErrors });
		}

		const data = result.data;

		// Normalize jury — null means "keep existing jurors"
		let juryUserIds: string[] | null = null;
		if (changeJury) {
			juryUserIds = Array.isArray(data.juryUserIds)
				? data.juryUserIds
				: data.juryUserIds
					? [data.juryUserIds]
					: [];
		}

		// Validate jury members belong to the group (only when a new jury is provided)
		if (juryUserIds !== null) {
			if (juryUserIds.length === 0) {
				return fail(400, { negotiateError: 'Le jury doit avoir au moins un membre.' });
			}

			const activeMembers = await db
				.select({ userId: groupMembers.userId })
				.from(groupMembers)
				.where(and(eq(groupMembers.groupId, params.id), isNull(groupMembers.removedAt)));

			const activeMemberIds = new Set(activeMembers.map((m) => m.userId));

			const invalidJury = juryUserIds.filter((id) => !activeMemberIds.has(id));
			if (invalidJury.length > 0) {
				return fail(400, { negotiateError: 'Un ou plusieurs jurés sont invalides.' });
			}
		}

		try {
			await counterPropose({
				propositionId: data.propositionId,
				authorId: user.id,
				stakeCreator: data.stakeType === 'points' ? parseFloat(data.stakeCreator!) : null,
				stakeTarget: data.stakeType === 'points' ? parseFloat(data.stakeTarget!) : null,
				forfeitCreator: data.stakeType === 'forfeit' ? (data.forfeitCreator?.trim() ?? null) : null,
				forfeitTarget: data.stakeType === 'forfeit' ? (data.forfeitTarget?.trim() ?? null) : null,
				juryUserIds
			});

			await captureServer({
				distinctId: user.id,
				event: 'proposition_counter_proposed',
				properties: {
					bet_id: params.betId,
					proposition_id: data.propositionId,
					group_id: params.id,
					stake_type: data.stakeType
				}
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Erreur lors de la contre-proposition.';
			return fail(400, { negotiateError: message });
		}

		throw redirect(303, `/app/groups/${params.id}/bets/${params.betId}`);
	}
};
