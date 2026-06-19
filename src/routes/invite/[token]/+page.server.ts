import { redirect, fail } from '@sveltejs/kit';
import { validateInvitationToken, joinViaInvitation } from '$lib/server/invitations';
import { captureServer } from '$lib/server/analytics';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { session, user } = await locals.safeGetSession();
	const { token } = params;

	// Non connecté → redirect vers login avec redirectTo
	if (!session || !user) {
		const redirectTo = url.pathname;
		throw redirect(303, `/login?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	// Valider le token
	const validation = await validateInvitationToken(token);

	if (!validation.valid) {
		return {
			invalid: true,
			reason: validation.reason,
			groupName: null,
			groupId: null,
			alreadyMember: false
		};
	}

	// Vérifier si déjà membre (actif)
	// On affiche quand même la page avec un message approprié
	return {
		invalid: false,
		reason: null,
		groupName: validation.groupName ?? null,
		groupId: validation.groupId ?? null,
		alreadyMember: false
	};
};

export const actions: Actions = {
	join: async ({ locals, params }) => {
		const { session, user } = await locals.safeGetSession();

		if (!session || !user) {
			return fail(401, { error: 'Vous devez être connecté pour rejoindre un groupe.' });
		}

		const { token } = params;

		const outcome = await joinViaInvitation(token, user.id);

		if (outcome.result === 'invalid') {
			return fail(400, { error: "Ce lien d'invitation est invalide, expiré ou épuisé." });
		}

		if (outcome.result === 'already_member') {
			// Rediriger directement vers le groupe
			throw redirect(303, `/app/groups/${outcome.groupId}`);
		}

		// Joined
		await captureServer({
			distinctId: user.id,
			event: 'group_joined_via_invite',
			properties: {
				group_id: outcome.groupId,
				group_name: outcome.groupName
			}
		});

		throw redirect(303, `/app/groups/${outcome.groupId}`);
	}
};
