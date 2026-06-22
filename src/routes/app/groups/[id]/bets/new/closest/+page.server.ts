import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { groups, groupMembers, profiles } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { createClosestBet } from '$lib/server/bets';
import { captureServer } from '$lib/server/analytics';
import type { Actions, PageServerLoad } from './$types';

// UUID regex that accepts any 8-4-4-4-12 hex format (not restricted to RFC 4122 version/variant bits)
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Guard: verify user is active member of the group
async function loadGroupAndMembers(groupId: string, userId: string) {
	if (!uuidRegex.test(groupId)) {
		throw error(404, 'Groupe introuvable.');
	}

	// Load group + check membership
	const groupRows = await db
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
				eq(groupMembers.userId, userId),
				isNull(groupMembers.removedAt)
			)
		)
		.where(eq(groups.id, groupId))
		.limit(1);

	if (groupRows.length === 0) {
		throw error(404, 'Groupe introuvable ou accès refusé.');
	}

	// Load active members
	const members = await db
		.select({
			userId: groupMembers.userId,
			pseudo: profiles.pseudo,
			avatarUrl: profiles.avatarUrl,
			role: groupMembers.role
		})
		.from(groupMembers)
		.innerJoin(profiles, eq(profiles.id, groupMembers.userId))
		.where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.removedAt)))
		.orderBy(groupMembers.joinedAt);

	return { group: groupRows[0], members };
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) throw redirect(303, '/login');

	const { group, members } = await loadGroupAndMembers(params.id, user.id);

	return {
		groupId: group.id,
		groupName: group.name,
		currency: group.currency,
		currentUserId: user.id,
		members: members.map((m) => ({
			userId: m.userId,
			pseudo: m.pseudo,
			avatarUrl: m.avatarUrl,
			role: m.role as 'admin' | 'member'
		}))
	};
};

// Zod schema for form validation
const createClosestSchema = z
	.object({
		title: z.string().min(1, 'Le titre est obligatoire.'),
		description: z.string().optional(),
		stakeType: z.enum(['points', 'forfeit']),
		stakeAmount: z.string().optional(),
		forfeitDescription: z.string().optional(),
		forfeitScope: z.enum(['all_losers', 'last_one']).optional(),
		hideAnswers: z.string().optional(), // 'on' if checked
		participationDeadline: z.string().optional(), // datetime-local string
		juryMode: z.enum(['unanimous', 'majority']),
		// Multiple values with same name: collect as array in action
		visibilityUserIds: z.union([z.string(), z.array(z.string())]).optional(),
		juryUserIds: z.union([z.string(), z.array(z.string())]).optional()
	})
	.superRefine((data, ctx) => {
		if (data.stakeType === 'points') {
			const amount = parseFloat(data.stakeAmount ?? '');
			if (!data.stakeAmount || isNaN(amount) || amount <= 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['stakeAmount'],
					message: 'Le montant doit être supérieur à 0.'
				});
			}
		}
		if (data.stakeType === 'forfeit') {
			if (!data.forfeitDescription || data.forfeitDescription.trim().length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['forfeitDescription'],
					message: 'La description du gage est obligatoire.'
				});
			}
			if (!data.forfeitScope) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['forfeitScope'],
					message: 'Le périmètre du gage est obligatoire.'
				});
			}
		}
	});

export const actions: Actions = {
	default: async ({ locals, params, request }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) return fail(401, { error: 'Non authentifié.' });

		if (!uuidRegex.test(params.id)) {
			return fail(400, { error: 'Groupe invalide.' });
		}

		const groupId = params.id;

		// Verify membership
		const memberCheck = await db
			.select({ role: groupMembers.role })
			.from(groupMembers)
			.where(
				and(
					eq(groupMembers.groupId, groupId),
					eq(groupMembers.userId, user.id),
					isNull(groupMembers.removedAt)
				)
			)
			.limit(1);

		if (memberCheck.length === 0) {
			return fail(403, { error: 'Accès refusé.' });
		}

		// Parse form data
		const formData = await request.formData();

		const rawVisibility = formData.getAll('visibilityUserIds') as string[];
		const rawJury = formData.getAll('juryUserIds') as string[];

		const raw = {
			title: formData.get('title') as string,
			description: formData.get('description') ?? undefined,
			stakeType: formData.get('stakeType') as string,
			stakeAmount: formData.get('stakeAmount') ?? undefined,
			forfeitDescription: formData.get('forfeitDescription') ?? undefined,
			forfeitScope: formData.get('forfeitScope') ?? undefined,
			hideAnswers: formData.get('hideAnswers') ?? undefined,
			participationDeadline: formData.get('participationDeadline') ?? undefined,
			juryMode: formData.get('juryMode') as string,
			visibilityUserIds: rawVisibility,
			juryUserIds: rawJury
		};

		const result = createClosestSchema.safeParse(raw);
		if (!result.success) {
			const fieldErrors = result.error.flatten().fieldErrors;
			const firstError = Object.values(fieldErrors).flat()[0] ?? 'Données invalides.';
			return fail(400, { error: firstError, fieldErrors, values: raw });
		}

		const data = result.data;

		// Normalize arrays
		const visibilityUserIds: string[] = Array.isArray(data.visibilityUserIds)
			? data.visibilityUserIds
			: data.visibilityUserIds
				? [data.visibilityUserIds]
				: [];

		const juryUserIds: string[] = Array.isArray(data.juryUserIds)
			? data.juryUserIds
			: data.juryUserIds
				? [data.juryUserIds]
				: [];

		// Ensure creator is in visibility list
		if (!visibilityUserIds.includes(user.id)) {
			visibilityUserIds.push(user.id);
		}

		// Validate jury is non-empty
		if (juryUserIds.length === 0) {
			return fail(400, {
				error: 'Le jury doit avoir au moins un membre.',
				values: raw
			});
		}

		// Validate all visibility & jury users are active group members
		const activeMembers = await db
			.select({ userId: groupMembers.userId })
			.from(groupMembers)
			.where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.removedAt)));

		const activeMemberIds = new Set(activeMembers.map((m) => m.userId));

		const invalidVis = visibilityUserIds.filter((id) => !activeMemberIds.has(id));
		if (invalidVis.length > 0) {
			return fail(400, {
				error: 'Un ou plusieurs membres de visibilité sont invalides.',
				values: raw
			});
		}

		const invalidJury = juryUserIds.filter((id) => !activeMemberIds.has(id));
		if (invalidJury.length > 0) {
			return fail(400, { error: 'Un ou plusieurs jurés sont invalides.', values: raw });
		}

		// Parse deadline
		let participationDeadline: Date | null = null;
		if (data.participationDeadline && data.participationDeadline.trim().length > 0) {
			const dl = new Date(data.participationDeadline);
			if (isNaN(dl.getTime())) {
				return fail(400, { error: 'Date limite invalide.', values: raw });
			}
			if (dl <= new Date()) {
				return fail(400, {
					error: 'La date limite doit être dans le futur.',
					values: raw
				});
			}
			participationDeadline = dl;
		}

		// Create the bet
		try {
			const { betId } = await createClosestBet({
				groupId,
				creatorId: user.id,
				title: data.title.trim(),
				description: data.description?.trim() || null,
				stakeType: data.stakeType as 'points' | 'forfeit',
				stakeAmount: data.stakeType === 'points' ? parseFloat(data.stakeAmount!) : null,
				forfeitDescription:
					data.stakeType === 'forfeit' ? (data.forfeitDescription?.trim() ?? null) : null,
				forfeitScope:
					data.stakeType === 'forfeit'
						? ((data.forfeitScope as 'all_losers' | 'last_one') ?? null)
						: null,
				hideAnswers: data.hideAnswers === 'on',
				participationDeadline,
				juryMode: data.juryMode as 'unanimous' | 'majority',
				visibilityUserIds,
				juryUserIds
			});

			await captureServer({
				distinctId: user.id,
				event: 'bet_created',
				properties: {
					bet_id: betId,
					group_id: groupId,
					bet_type: 'closest',
					stake_type: data.stakeType,
					jury_mode: data.juryMode,
					visibility_count: visibilityUserIds.length,
					jury_count: juryUserIds.length
				}
			});

			throw redirect(303, `/app/groups/${groupId}/bets/${betId}`);
		} catch (err) {
			// Re-throw redirects
			if (err && typeof err === 'object' && 'status' in err && 'location' in err) {
				throw err;
			}
			console.error('Error creating bet:', err);
			return fail(500, { error: 'Erreur lors de la création du pari.', values: raw });
		}
	}
};
