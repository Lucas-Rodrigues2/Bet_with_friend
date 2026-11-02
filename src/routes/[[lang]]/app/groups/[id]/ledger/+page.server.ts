import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { groups, groupMembers } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import {
	getActivePairBalances,
	getSettledPairSummaries,
	getMyEntriesWithBets,
	settlePair
} from '$lib/server/ledger';
import { captureServer } from '$lib/server/analytics';
import type { Actions, PageServerLoad } from './$types';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ locals, params }) => {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) throw redirect(303, '/login');

	if (!uuidRegex.test(params.id)) {
		throw error(404, 'Groupe introuvable.');
	}

	// Verify user is an active member of this group
	const rows = await db
		.select({
			id: groups.id,
			name: groups.name,
			currency: groups.currency
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
		.where(and(eq(groups.id, params.id), isNull(groups.archivedAt)))
		.limit(1);

	if (rows.length === 0) {
		throw error(404, 'Groupe introuvable ou accès refusé.');
	}

	const group = rows[0];

	const [activePairs, settledPairs, myEntries] = await Promise.all([
		getActivePairBalances(params.id),
		getSettledPairSummaries(params.id),
		getMyEntriesWithBets(params.id, user.id)
	]);

	return {
		group: {
			id: group.id,
			name: group.name,
			currency: group.currency,
			currentUserId: user.id
		},
		activePairs,
		settledPairs,
		myEntries
	};
};

const settleSchema = z.object({
	debtorId: z.string().regex(uuidRegex, 'UUID invalide'),
	creditorId: z.string().regex(uuidRegex, 'UUID invalide')
});

export const actions: Actions = {
	settle: async ({ locals, params, request }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { error: 'Non authentifié.' });

		if (!uuidRegex.test(params.id)) {
			return fail(400, { error: 'Groupe invalide.' });
		}

		const formData = await request.formData();
		const raw = {
			debtorId: formData.get('debtorId'),
			creditorId: formData.get('creditorId')
		};

		const result = settleSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { error: 'Paramètres invalides.' });
		}

		const outcome = await settlePair({
			groupId: params.id,
			debtorId: result.data.debtorId,
			creditorId: result.data.creditorId,
			actorId: user.id
		});

		if (outcome.error) {
			return fail(403, { error: outcome.error });
		}

		await captureServer({
			distinctId: user.id,
			event: 'ledger_pair_settled',
			properties: {
				group_id: params.id,
				debtor_id: result.data.debtorId,
				creditor_id: result.data.creditorId
			}
		});

		return { settled: true };
	}
};
