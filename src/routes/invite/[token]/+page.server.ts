import { redirect, fail } from '@sveltejs/kit';
import { validateInvitationToken, joinViaInvitation } from '$lib/server/invitations';
import { captureServer } from '$lib/server/analytics';
import { notify } from '$lib/server/notifications';
import { db } from '$lib/server/db/index';
import { groupMembers, profiles } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
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

		// Notify group admins that a new member joined
		if (outcome.groupId) {
			const adminRows = await db
				.select({ userId: groupMembers.userId })
				.from(groupMembers)
				.where(
					and(
						eq(groupMembers.groupId, outcome.groupId),
						eq(groupMembers.role, 'admin'),
						isNull(groupMembers.removedAt)
					)
				);
			const adminIds = adminRows.map((r) => r.userId).filter((id) => id !== user.id);

			if (adminIds.length > 0) {
				// Get the joiner's pseudo
				const joinerRows = await db
					.select({ pseudo: profiles.pseudo })
					.from(profiles)
					.where(eq(profiles.id, user.id))
					.limit(1);
				const joinerPseudo = joinerRows[0]?.pseudo;

				await notify(adminIds, 'invitation_accepted', {
					groupId: outcome.groupId,
					actorPseudo: joinerPseudo
				});
			}
		}

		throw redirect(303, `/app/groups/${outcome.groupId}`);
	}
};
