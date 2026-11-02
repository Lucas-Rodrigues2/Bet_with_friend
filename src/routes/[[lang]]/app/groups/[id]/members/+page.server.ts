import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { groups, groupMembers } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { captureServer } from '$lib/server/analytics';
import { getGroupMembers, removeMember, promoteMember } from '$lib/server/groups';
import type { Actions, PageServerLoad } from './$types';

const uuidSchema = z
	.string()
	.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

export const load: PageServerLoad = async ({ locals, params }) => {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		throw redirect(303, '/login');
	}

	if (!uuidSchema.safeParse(params.id).success) {
		throw error(404, 'Groupe introuvable.');
	}
	const { id } = params;

	// Vérifier que l'utilisateur est un membre actif du groupe non archivé
	const rows = await db
		.select({
			id: groups.id,
			name: groups.name,
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
		.where(and(eq(groups.id, id), isNull(groups.archivedAt)))
		.limit(1);

	if (rows.length === 0) {
		throw error(404, 'Groupe introuvable ou accès refusé.');
	}

	const group = rows[0];
	const members = await getGroupMembers(id);

	return {
		group: {
			id: group.id,
			name: group.name,
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
		currentUserId: user.id
	};
};

export const actions: Actions = {
	leave: async ({ locals, params }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { error: 'Non authentifié.' });

		if (!uuidSchema.safeParse(params.id).success) {
			return fail(400, { error: 'Groupe invalide.' });
		}

		const outcome = await removeMember({
			groupId: params.id,
			targetUserId: user.id,
			actorUserId: user.id
		});

		if (outcome.error) {
			return fail(400, { error: outcome.error });
		}

		await captureServer({
			distinctId: user.id,
			event: 'group_left',
			properties: { group_id: params.id }
		});

		throw redirect(303, '/app');
	},

	kick: async ({ locals, params, request }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { error: 'Non authentifié.' });

		if (!uuidSchema.safeParse(params.id).success) {
			return fail(400, { error: 'Groupe invalide.' });
		}

		const formData = await request.formData();
		const raw = { targetUserId: formData.get('targetUserId') };
		const schema = z.object({ targetUserId: uuidSchema });
		const result = schema.safeParse(raw);
		if (!result.success) {
			return fail(400, { error: 'Paramètres invalides.' });
		}

		const outcome = await removeMember({
			groupId: params.id,
			targetUserId: result.data.targetUserId,
			actorUserId: user.id
		});

		if (outcome.error) {
			return fail(403, { error: outcome.error });
		}

		await captureServer({
			distinctId: user.id,
			event: 'member_kicked',
			properties: { group_id: params.id, target_user_id: result.data.targetUserId }
		});

		return { kicked: true };
	},

	promote: async ({ locals, params, request }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { error: 'Non authentifié.' });

		if (!uuidSchema.safeParse(params.id).success) {
			return fail(400, { error: 'Groupe invalide.' });
		}

		const formData = await request.formData();
		const raw = { targetUserId: formData.get('targetUserId') };
		const schema = z.object({ targetUserId: uuidSchema });
		const result = schema.safeParse(raw);
		if (!result.success) {
			return fail(400, { error: 'Paramètres invalides.' });
		}

		const outcome = await promoteMember({
			groupId: params.id,
			targetUserId: result.data.targetUserId,
			adminUserId: user.id
		});

		if (outcome.error) {
			return fail(403, { error: outcome.error });
		}

		await captureServer({
			distinctId: user.id,
			event: 'member_promoted',
			properties: { group_id: params.id, target_user_id: result.data.targetUserId }
		});

		return { promoted: true };
	}
};
