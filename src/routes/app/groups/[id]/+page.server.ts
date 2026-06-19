import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { groups, groupMembers, profiles } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { captureServer } from '$lib/server/analytics';
import {
	createInvitation,
	getGroupInvitations,
	revokeInvitation,
	setMemberCanInvite
} from '$lib/server/invitations';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		throw redirect(303, '/login');
	}

	if (!z.string().uuid().safeParse(params.id).success) {
		throw error(404, 'Groupe introuvable.');
	}
	const { id } = params;

	// Load group + verify user is an active member
	const rows = await db
		.select({
			id: groups.id,
			name: groups.name,
			description: groups.description,
			imageUrl: groups.imageUrl,
			currency: groups.currency,
			createdAt: groups.createdAt,
			role: groupMembers.role,
			canInvite: groupMembers.canInvite
		})
		.from(groups)
		.innerJoin(
			groupMembers,
			and(
				eq(groupMembers.groupId, groups.id),
				eq(groupMembers.userId, user.id),
				isNull(groupMembers.removedAt)
			)
		)
		.where(eq(groups.id, id))
		.limit(1);

	if (rows.length === 0) {
		throw error(404, 'Groupe introuvable ou accès refusé.');
	}

	const group = rows[0];

	// Load active members of the group
	const members = await db
		.select({
			userId: groupMembers.userId,
			role: groupMembers.role,
			canInvite: groupMembers.canInvite,
			pseudo: profiles.pseudo,
			avatarUrl: profiles.avatarUrl,
			joinedAt: groupMembers.joinedAt
		})
		.from(groupMembers)
		.innerJoin(profiles, eq(profiles.id, groupMembers.userId))
		.where(and(eq(groupMembers.groupId, id), isNull(groupMembers.removedAt)))
		.orderBy(groupMembers.joinedAt);

	// Charger les invitations actives (si admin ou can_invite)
	const isAdmin = group.role === 'admin';
	const canSeeInvitations = isAdmin || group.canInvite;
	const invitations = canSeeInvitations ? await getGroupInvitations(id) : [];

	// Track group_viewed après vérification d'appartenance (fait réel)
	await captureServer({
		distinctId: user.id,
		event: 'group_viewed',
		properties: {
			group_id: group.id,
			role: group.role
		}
	});

	return {
		group: {
			id: group.id,
			name: group.name,
			description: group.description,
			imageUrl: group.imageUrl,
			currency: group.currency,
			createdAt: group.createdAt,
			role: group.role as 'admin' | 'member',
			canInvite: group.canInvite
		},
		members: members.map((m) => ({
			userId: m.userId,
			role: m.role as 'admin' | 'member',
			canInvite: m.canInvite,
			pseudo: m.pseudo,
			avatarUrl: m.avatarUrl,
			joinedAt: m.joinedAt
		})),
		invitations: invitations.map((inv) => ({
			id: inv.id,
			token: inv.token,
			expiresAt: inv.expiresAt,
			maxUses: inv.maxUses,
			usesCount: inv.usesCount,
			revokedAt: inv.revokedAt,
			createdAt: inv.createdAt
		}))
	};
};

const createInviteSchema = z.object({
	expiration: z.enum(['never', '24h', '7d']),
	maxUses: z.enum(['unlimited', '1', '5', '10', '25', '50'])
});

const toggleCanInviteSchema = z.object({
	targetUserId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
	canInvite: z.enum(['true', 'false'])
});

const revokeSchema = z.object({
	invitationId: z.string().uuid()
});

export const actions: Actions = {
	createInvite: async ({ locals, params, request }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { error: 'Non authentifié.' });

		if (!z.string().uuid().safeParse(params.id).success) {
			return fail(400, { error: 'Groupe invalide.' });
		}

		const formData = await request.formData();
		const raw = {
			expiration: formData.get('expiration'),
			maxUses: formData.get('maxUses')
		};

		const result = createInviteSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { error: 'Paramètres invalides.' });
		}

		const { expiration, maxUses } = result.data;

		let expiresAt: Date | null = null;
		if (expiration === '24h') {
			expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
		} else if (expiration === '7d') {
			expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
		}

		const maxUsesNum = maxUses === 'unlimited' ? null : parseInt(maxUses, 10);

		const outcome = await createInvitation({
			groupId: params.id,
			createdBy: user.id,
			expiresAt,
			maxUses: maxUsesNum
		});

		if ('error' in outcome) {
			return fail(403, { error: outcome.error });
		}

		await captureServer({
			distinctId: user.id,
			event: 'invitation_created',
			properties: {
				group_id: params.id,
				expiration,
				max_uses: maxUsesNum
			}
		});

		return { inviteToken: outcome.token };
	},

	revokeInvite: async ({ locals, params, request }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { error: 'Non authentifié.' });

		if (!z.string().uuid().safeParse(params.id).success) {
			return fail(400, { error: 'Groupe invalide.' });
		}

		const formData = await request.formData();
		const raw = { invitationId: formData.get('invitationId') };

		const result = revokeSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { error: 'Paramètres invalides.' });
		}

		const outcome = await revokeInvitation({
			invitationId: result.data.invitationId,
			groupId: params.id,
			userId: user.id
		});

		if (outcome.error) {
			return fail(403, { error: outcome.error });
		}

		await captureServer({
			distinctId: user.id,
			event: 'invitation_revoked',
			properties: {
				group_id: params.id,
				invitation_id: result.data.invitationId
			}
		});

		return { revoked: true };
	},

	toggleCanInvite: async ({ locals, params, request }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { error: 'Non authentifié.' });

		if (!z.string().uuid().safeParse(params.id).success) {
			return fail(400, { error: 'Groupe invalide.' });
		}

		const formData = await request.formData();
		const raw = {
			targetUserId: formData.get('targetUserId'),
			canInvite: formData.get('canInvite')
		};

		const result = toggleCanInviteSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { error: 'Paramètres invalides.' });
		}

		const outcome = await setMemberCanInvite({
			groupId: params.id,
			targetUserId: result.data.targetUserId,
			canInvite: result.data.canInvite === 'true',
			adminUserId: user.id
		});

		if (outcome.error) {
			return fail(403, { error: outcome.error });
		}

		return { canInviteUpdated: true };
	}
};
