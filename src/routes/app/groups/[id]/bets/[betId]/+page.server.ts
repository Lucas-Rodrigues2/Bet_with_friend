import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import {
	getBetDetailForUser,
	isActiveMemberOfBetGroup,
	participateInClosestBet
} from '$lib/server/bets';
import { submitMatchToJury } from '$lib/server/matches';
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

	// A juror who is not in the visibility list can access the bet only if the match is judging.
	// getBetDetailForUser already handles this check.

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
			proposition: bet.proposition
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
	}
};
