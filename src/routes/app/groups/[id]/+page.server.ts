import { error, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { groups, groupMembers } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

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
			currency: groups.currency,
			createdAt: groups.createdAt,
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
		.where(eq(groups.id, id))
		.limit(1);

	if (rows.length === 0) {
		throw error(404, 'Groupe introuvable ou accès refusé.');
	}

	const group = rows[0];

	return {
		group: {
			id: group.id,
			name: group.name,
			description: group.description,
			currency: group.currency,
			createdAt: group.createdAt,
			role: group.role as 'admin' | 'member'
		}
	};
};
