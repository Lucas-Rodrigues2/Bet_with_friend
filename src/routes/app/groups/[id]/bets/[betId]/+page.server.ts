import { error, redirect } from '@sveltejs/kit';
import { getBetDetailForUser, isActiveMemberOfBetGroup } from '$lib/server/bets';
import type { PageServerLoad } from './$types';

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

	// Check user is active member of the group that owns this bet
	const isMember = await isActiveMemberOfBetGroup(params.betId, params.id, user.id);
	if (!isMember) {
		throw error(404, 'Pari introuvable ou accès refusé.');
	}

	// Fetch bet detail (checks visibility)
	const bet = await getBetDetailForUser(params.betId, user.id);
	if (!bet) {
		// User is group member but not in the visibility list
		throw error(404, 'Pari introuvable ou accès refusé.');
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
			yesno: bet.yesno,
			proposition: bet.proposition
		},
		currentUserId: user.id
	};
};
