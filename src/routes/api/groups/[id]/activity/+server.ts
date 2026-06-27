import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { groups, groupMembers } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { getGroupActivity } from '$lib/server/activity';
import type { RequestHandler } from './$types';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) {
		return json({ error: 'Non authentifié.' }, { status: 401 });
	}

	if (!uuidRegex.test(params.id)) {
		return json({ error: 'Groupe invalide.' }, { status: 400 });
	}

	// Verify user is an active member
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
		.where(and(eq(groups.id, params.id), isNull(groups.archivedAt)))
		.limit(1);

	if (rows.length === 0) {
		return json({ error: 'Accès refusé.' }, { status: 403 });
	}

	const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
	const limit = 20;

	const { events, hasMore } = await getGroupActivity(params.id, user.id, { limit, offset });

	return json({
		events: events.map((e) => ({
			id: e.id,
			type: e.type,
			date: e.date,
			label: e.label,
			link: e.link,
			metadata: e.metadata
		})),
		hasMore,
		offset,
		limit
	});
};
