import { redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { getMyBets, type MyBetFilter } from '$lib/server/bets';
import { captureServer } from '$lib/server/analytics';
import type { PageServerLoad } from './$types';

const filterSchema = z.enum(['won', 'lost', 'active', 'all']).default('all');

export const load: PageServerLoad = async ({ locals, url }) => {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		throw redirect(303, '/login');
	}

	const filterParam = url.searchParams.get('filter') ?? 'all';
	const filterParsed = filterSchema.safeParse(filterParam);
	const filter: MyBetFilter = filterParsed.success ? filterParsed.data : 'all';

	const bets = await getMyBets(user.id, { filter });

	// Tracking analytics : consultation de « Mes paris » (vue read-only
	// transverse aux groupes). Pas de PII — ni titre ni pseudo de groupe.
	try {
		await captureServer({
			distinctId: user.id,
			event: 'my_bets_viewed',
			properties: {
				filter
			}
		});
	} catch (err) {
		console.warn('[analytics] my_bets_viewed failed:', err);
	}

	return {
		filter,
		bets: bets.map((b) => ({
			id: b.id,
			type: b.type,
			title: b.title,
			stakeType: b.stakeType,
			createdAt: b.createdAt,
			groupId: b.groupId,
			groupName: b.groupName,
			outcome: b.outcome,
			displayStatus: b.displayStatus,
			resolvedAt: b.resolvedAt
		}))
	};
};
