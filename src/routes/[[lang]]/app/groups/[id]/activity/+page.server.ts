import { error, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { groups, groupMembers } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { getGroupActivity } from '$lib/server/activity';
import { captureServer } from '$lib/server/analytics';
import type { PageServerLoad } from './$types';

const uuidSchema = z
	.string()
	.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		throw redirect(303, '/login');
	}

	if (!uuidSchema.safeParse(params.id).success) {
		throw error(404, 'Groupe introuvable.');
	}
	const { id } = params;

	// Verify user is an active member
	const rows = await db
		.select({
			id: groups.id,
			name: groups.name,
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
	const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
	const limit = 20;

	const { events, hasMore } = await getGroupActivity(id, user.id, { limit, offset });

	// Tracking analytics : consultation du fil d'activité (vue dérivée, read-only).
	// Ne doit jamais faire rater la page si l'analytics échoue.
	try {
		await captureServer({
			distinctId: user.id,
			event: 'activity_feed_viewed',
			properties: {
				group_id: group.id,
				offset,
				has_more: hasMore
			}
		});
	} catch (err) {
		console.warn('[analytics] activity_feed_viewed failed:', err);
	}

	return {
		group: {
			id: group.id,
			name: group.name,
			role: group.role as 'admin' | 'member'
		},
		events: events.map((e) => ({
			id: e.id,
			type: e.type,
			date: e.date,
			label: e.label,
			link: e.link,
			metadata: e.metadata as Record<string, string> | undefined
		})),
		hasMore,
		offset,
		limit
	};
};
