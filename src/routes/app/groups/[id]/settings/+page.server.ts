import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { groups, groupMembers } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { captureServer } from '$lib/server/analytics';
import { renameGroup, archiveGroup } from '$lib/server/groups';
import type { Actions, PageServerLoad } from './$types';

const uuidSchema = z
	.string()
	.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const renameSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, 'Le nom doit faire au moins 2 caractères.')
		.max(50, 'Le nom ne peut pas dépasser 50 caractères.')
});

const deleteSchema = z.object({
	confirm: z.string()
});

export const load: PageServerLoad = async ({ locals, params }) => {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		throw redirect(303, '/login');
	}

	if (!uuidSchema.safeParse(params.id).success) {
		throw error(404, 'Groupe introuvable.');
	}
	const { id } = params;

	// Load group + verify user is an active admin member of a non-archived group
	const rows = await db
		.select({
			id: groups.id,
			name: groups.name,
			description: groups.description,
			currency: groups.currency,
			role: groupMembers.role
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

	// Only admins can access this page
	if (group.role !== 'admin') {
		throw error(403, 'Accès réservé aux admins.');
	}

	return {
		group: {
			id: group.id,
			name: group.name,
			description: group.description,
			currency: group.currency,
			role: group.role as 'admin' | 'member'
		}
	};
};

export const actions: Actions = {
	rename: async ({ locals, params, request }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { error: 'Non authentifié.' });

		if (!uuidSchema.safeParse(params.id).success) {
			return fail(400, { error: 'Groupe invalide.' });
		}

		const formData = await request.formData();
		const raw = { name: formData.get('name') };

		const result = renameSchema.safeParse(raw);
		if (!result.success) {
			const errors = result.error.flatten().fieldErrors;
			return fail(400, {
				renameErrors: errors,
				values: { name: raw.name as string }
			});
		}

		const outcome = await renameGroup({
			groupId: params.id,
			newName: result.data.name,
			adminUserId: user.id
		});

		if (outcome.error) {
			return fail(403, { error: outcome.error });
		}

		await captureServer({
			distinctId: user.id,
			event: 'group_renamed',
			properties: { group_id: params.id }
		});

		return { renamed: true, newName: result.data.name };
	},

	delete: async ({ locals, params, request }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { error: 'Non authentifié.' });

		if (!uuidSchema.safeParse(params.id).success) {
			return fail(400, { error: 'Groupe invalide.' });
		}

		const formData = await request.formData();
		const raw = { confirm: formData.get('confirm') };

		const result = deleteSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { error: 'Confirmation manquante.' });
		}

		// Check that the confirmation matches the group name
		const groupRows = await db
			.select({ name: groups.name })
			.from(groups)
			.innerJoin(
				groupMembers,
				and(
					eq(groupMembers.groupId, groups.id),
					eq(groupMembers.userId, user.id),
					isNull(groupMembers.removedAt)
				)
			)
			.where(and(eq(groups.id, params.id), isNull(groups.archivedAt)))
			.limit(1);

		if (groupRows.length === 0) {
			return fail(404, { error: 'Groupe introuvable.' });
		}

		if (result.data.confirm !== groupRows[0].name) {
			return fail(400, { deleteError: 'Le nom saisi ne correspond pas au nom du groupe.' });
		}

		const outcome = await archiveGroup({
			groupId: params.id,
			adminUserId: user.id
		});

		if (outcome.error) {
			return fail(403, { error: outcome.error });
		}

		await captureServer({
			distinctId: user.id,
			event: 'group_deleted',
			properties: { group_id: params.id }
		});

		throw redirect(303, '/app');
	}
};
