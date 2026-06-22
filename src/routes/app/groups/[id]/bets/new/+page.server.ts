import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { groups, groupMembers } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

// UUID regex that accepts any 8-4-4-4-12 hex format (not restricted to RFC 4122 version/variant bits)
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ locals, params }) => {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		throw redirect(303, '/login');
	}

	if (!uuidRegex.test(params.id)) {
		throw error(404, 'Groupe introuvable.');
	}
	const { id } = params;

	// Verify user is an active member of the group
	const rows = await db
		.select({ id: groups.id })
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

	return { groupId: id };
};
