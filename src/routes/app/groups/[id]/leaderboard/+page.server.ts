import { error, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { groups, groupMembers } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { getGroupLeaderboard, type LeaderboardPeriod } from '$lib/server/stats';
import { captureServer } from '$lib/server/analytics';
import type { PageServerLoad } from './$types';

const uuidSchema = z
	.string()
	.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

const periodSchema = z.enum(['all', '30d']).default('all');

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

	const periodParam = url.searchParams.get('period') ?? 'all';
	const periodParsed = periodSchema.safeParse(periodParam);
	const period: LeaderboardPeriod = periodParsed.success ? periodParsed.data : 'all';

	const { rows: leaderboard, hasResolvedMatches } = await getGroupLeaderboard(id, user.id, {
		period
	});

	// Tracking analytics : consultation du classement (vue read-only).
	// Ne doit jamais faire rater la page si l'analytics échoue.
	try {
		await captureServer({
			distinctId: user.id,
			event: 'leaderboard_viewed',
			properties: {
				group_id: group.id,
				period
			}
		});
	} catch (err) {
		console.warn('[analytics] leaderboard_viewed failed:', err);
	}

	return {
		group: {
			id: group.id,
			name: group.name,
			currency: group.currency,
			role: group.role as 'admin' | 'member'
		},
		period,
		leaderboard,
		hasResolvedMatches
	};
};
