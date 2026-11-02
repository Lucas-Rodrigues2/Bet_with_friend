import { error, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { groups, groupMembers } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { getGroupBetsForUserFiltered, type GroupBetFilter } from '$lib/server/bets';
import { captureServer } from '$lib/server/analytics';
import type { PageServerLoad } from './$types';

const uuidSchema = z
	.string()
	.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

const filterSchema = z.enum(['active', 'judging', 'resolved', 'cancelled', 'all']).default('all');

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

	const filterParam = url.searchParams.get('filter') ?? 'all';
	const filterParsed = filterSchema.safeParse(filterParam);
	const filter: GroupBetFilter = filterParsed.success ? filterParsed.data : 'all';
	const search = (url.searchParams.get('q') ?? '').trim();
	// On garde la recherche brute mais on la plafonne pour éviter des filtres
	// ridicules — la validation se fait par le substring match côté serveur.
	const searchInput = search.slice(0, 200);

	const bets = await getGroupBetsForUserFiltered(id, user.id, { filter, search: searchInput });

	// Tracking analytics : consultation de l'onglet Paris d'un groupe (vue
	// read-only, faits serveur). Pas de PII — on n'envoie ni le titre des paris
	// ni le terme de recherche exact (seulement un booléen « search active »).
	try {
		await captureServer({
			distinctId: user.id,
			event: 'group_bets_viewed',
			properties: {
				group_id: group.id,
				filter,
				search: searchInput.length > 0
			}
		});
	} catch (err) {
		console.warn('[analytics] group_bets_viewed failed:', err);
	}

	return {
		group: {
			id: group.id,
			name: group.name,
			role: group.role as 'admin' | 'member'
		},
		filter,
		search: searchInput,
		bets: bets.map((b) => ({
			id: b.id,
			type: b.type,
			title: b.title,
			stakeType: b.stakeType,
			stakeAmount: b.stakeAmount,
			forfeitDescription: b.forfeitDescription,
			status: b.status,
			displayStatus: b.displayStatus,
			matchStatus: b.matchStatus,
			createdAt: b.createdAt,
			propositionStatus: b.propositionStatus,
			propositionTargetId: b.propositionTargetId
		}))
	};
};
