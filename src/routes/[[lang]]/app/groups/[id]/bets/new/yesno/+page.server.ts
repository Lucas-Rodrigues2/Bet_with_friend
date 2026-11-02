import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { groups, groupMembers, profiles } from '$lib/server/db/schema';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { createYesnoDuel, createOpenChallenge } from '$lib/server/bets';
import { captureServer } from '$lib/server/analytics';
import { notify } from '$lib/server/notifications';
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

	// Load active members (excluding the creator — they can't challenge themselves)
	const members = await db
		.select({
			userId: groupMembers.userId,
			pseudo: profiles.pseudo,
			avatarUrl: profiles.avatarUrl,
			role: groupMembers.role
		})
		.from(groupMembers)
		.innerJoin(profiles, eq(profiles.id, groupMembers.userId))
		.where(
			and(
				eq(groupMembers.groupId, groupId),
				isNull(groupMembers.removedAt),
				ne(groupMembers.userId, userId)
			)
		)
		.orderBy(groupMembers.joinedAt);

	return { group: groupRows[0], members };
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) throw redirect(303, '/login');

	const { group, members } = await loadGroupAndMembers(params.id, user.id);

	// All active members (for visibility/jury in open mode)
	const allMembers = await db
		.select({
			userId: groupMembers.userId,
			pseudo: profiles.pseudo,
			avatarUrl: profiles.avatarUrl,
			role: groupMembers.role
		})
		.from(groupMembers)
		.innerJoin(profiles, eq(profiles.id, groupMembers.userId))
		.where(and(eq(groupMembers.groupId, params.id), isNull(groupMembers.removedAt)))
		.orderBy(groupMembers.joinedAt);

	return {
		groupId: group.id,
		groupName: group.name,
		currency: group.currency,
		currentUserId: user.id,
		// Other members (potential targets in duel mode) — creator excluded
		otherMembers: members.map((m) => ({
			userId: m.userId,
			pseudo: m.pseudo,
			avatarUrl: m.avatarUrl,
			role: m.role as 'admin' | 'member'
		})),
		// All members including creator (for visibility and jury in open mode)
		allMembers: allMembers.map((m) => ({
			userId: m.userId,
			pseudo: m.pseudo,
			avatarUrl: m.avatarUrl,
			role: m.role as 'admin' | 'member'
		}))
	};
};

// Zod schema for duel form validation
const createYesnoDuelSchema = z
	.object({
		title: z.string().min(1, 'Le titre est obligatoire.'),
		description: z.string().optional(),
		choiceA: z.string().min(1, 'Le choix A est obligatoire.'),
		choiceB: z.string().min(1, 'Le choix B est obligatoire.'),
		creatorSide: z.enum(['a', 'b']),
		targetId: z.string().regex(uuidRegex, 'La cible est obligatoire.'),
		stakeType: z.enum(['points', 'forfeit']),
		stakeCreator: z.string().optional(),
		stakeTarget: z.string().optional(),
		forfeitCreator: z.string().optional(),
		forfeitTarget: z.string().optional(),
		juryMode: z.enum(['unanimous', 'majority']),
		juryUserIds: z.union([z.string(), z.array(z.string())]).optional(),
		expirationHours: z.string().optional() // hours until proposition expires
	})
	.superRefine((data, ctx) => {
		if (data.choiceA.trim() === data.choiceB.trim()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['choiceB'],
				message: 'Les deux choix doivent être différents.'
			});
		}
		if (data.stakeType === 'points') {
			const sc = parseFloat(data.stakeCreator ?? '');
			if (!data.stakeCreator || isNaN(sc) || sc <= 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['stakeCreator'],
					message: 'La mise du créateur doit être supérieure à 0.'
				});
			}
			const st = parseFloat(data.stakeTarget ?? '');
			if (!data.stakeTarget || isNaN(st) || st <= 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['stakeTarget'],
					message: 'La mise de la cible doit être supérieure à 0.'
				});
			}
		}
		if (data.stakeType === 'forfeit') {
			if (!data.forfeitCreator || data.forfeitCreator.trim().length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['forfeitCreator'],
					message: 'Le gage du créateur est obligatoire.'
				});
			}
			if (!data.forfeitTarget || data.forfeitTarget.trim().length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['forfeitTarget'],
					message: 'Le gage de la cible est obligatoire.'
				});
			}
		}
	});

// Zod schema for open challenge form validation
const createOpenChallengeSchema = z
	.object({
		title: z.string().min(1, 'Le titre est obligatoire.'),
		description: z.string().optional(),
		choiceA: z.string().min(1, 'Le choix A est obligatoire.'),
		choiceB: z.string().min(1, 'Le choix B est obligatoire.'),
		creatorSide: z.enum(['a', 'b']),
		stakeType: z.enum(['points', 'forfeit']),
		stakeCreator: z.string().optional(),
		stakeOpponent: z.string().optional(),
		forfeitCreator: z.string().optional(),
		forfeitOpponent: z.string().optional(),
		maxOpponents: z.string().min(1, "Le nombre max d'adversaires est obligatoire."),
		juryMode: z.enum(['unanimous', 'majority']),
		juryUserIds: z
			.union([z.string().regex(uuidRegex), z.array(z.string().regex(uuidRegex))])
			.optional(),
		visibilityUserIds: z
			.union([z.string().regex(uuidRegex), z.array(z.string().regex(uuidRegex))])
			.optional()
	})
	.superRefine((data, ctx) => {
		if (data.choiceA.trim() === data.choiceB.trim()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['choiceB'],
				message: 'Les deux choix doivent être différents.'
			});
		}
		const maxOpp = parseInt(data.maxOpponents, 10);
		if (isNaN(maxOpp) || maxOpp < 1) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['maxOpponents'],
				message: "Le nombre max d'adversaires doit être au moins 1."
			});
		}
		if (data.stakeType === 'points') {
			const sc = parseFloat(data.stakeCreator ?? '');
			if (!data.stakeCreator || isNaN(sc) || sc <= 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['stakeCreator'],
					message: 'La mise du créateur doit être supérieure à 0.'
				});
			}
			const so = parseFloat(data.stakeOpponent ?? '');
			if (!data.stakeOpponent || isNaN(so) || so <= 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['stakeOpponent'],
					message: 'La mise des adversaires doit être supérieure à 0.'
				});
			}
		}
		if (data.stakeType === 'forfeit') {
			if (!data.forfeitCreator || data.forfeitCreator.trim().length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['forfeitCreator'],
					message: 'Le gage du créateur est obligatoire.'
				});
			}
			if (!data.forfeitOpponent || data.forfeitOpponent.trim().length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['forfeitOpponent'],
					message: 'Le gage des adversaires est obligatoire.'
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

		const formData = await request.formData();
		const mode = (formData.get('mode') as string | null) ?? 'duel';

		// ── MODE OPEN ───────────────────────────────────────────────────────────
		if (mode === 'open') {
			const rawJury = formData.getAll('juryUserIds') as string[];
			const rawVisibility = formData.getAll('visibilityUserIds') as string[];

			const raw = {
				title: formData.get('title') as string,
				description: (formData.get('description') as string | null) ?? undefined,
				choiceA: formData.get('choiceA') as string,
				choiceB: formData.get('choiceB') as string,
				creatorSide: formData.get('creatorSide') as string,
				stakeType: formData.get('stakeType') as string,
				stakeCreator: (formData.get('stakeCreator') as string | null) ?? undefined,
				stakeOpponent: (formData.get('stakeOpponent') as string | null) ?? undefined,
				forfeitCreator: (formData.get('forfeitCreator') as string | null) ?? undefined,
				forfeitOpponent: (formData.get('forfeitOpponent') as string | null) ?? undefined,
				maxOpponents: (formData.get('maxOpponents') as string | null) ?? '',
				juryMode: formData.get('juryMode') as string,
				juryUserIds: rawJury,
				visibilityUserIds: rawVisibility
			};

			const result = createOpenChallengeSchema.safeParse(raw);
			if (!result.success) {
				const fieldErrors = result.error.flatten().fieldErrors;
				const firstError = Object.values(fieldErrors).flat()[0] ?? 'Données invalides.';
				return fail(400, { error: firstError, fieldErrors, values: { ...raw, mode: 'open' } });
			}

			const data = result.data;

			// Load active members
			const activeMembers = await db
				.select({ userId: groupMembers.userId })
				.from(groupMembers)
				.where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.removedAt)));
			const activeMemberIds = new Set(activeMembers.map((m) => m.userId));

			// Normalize jury
			const juryUserIds: string[] = Array.isArray(data.juryUserIds)
				? data.juryUserIds
				: data.juryUserIds
					? [data.juryUserIds]
					: [];

			if (juryUserIds.length === 0) {
				return fail(400, {
					error: 'Le jury doit avoir au moins un membre.',
					values: { ...raw, mode: 'open' }
				});
			}

			const invalidJury = juryUserIds.filter((id) => !activeMemberIds.has(id));
			if (invalidJury.length > 0) {
				return fail(400, {
					error: 'Un ou plusieurs jurés sont invalides.',
					values: { ...raw, mode: 'open' }
				});
			}

			// Normalize visibility: must include creator + at least one other member
			const rawVisibilityIds: string[] = Array.isArray(data.visibilityUserIds)
				? data.visibilityUserIds
				: data.visibilityUserIds
					? [data.visibilityUserIds]
					: [];

			// Always include creator
			const visibilitySet = new Set([user.id, ...rawVisibilityIds]);
			const visibilityUserIds = Array.from(visibilitySet).filter((id) => activeMemberIds.has(id));

			if (visibilityUserIds.length < 2) {
				return fail(400, {
					error: 'Le défi doit être visible par au moins un autre membre.',
					values: { ...raw, mode: 'open' }
				});
			}

			const maxOpponents = parseInt(data.maxOpponents, 10);

			try {
				const { betId } = await createOpenChallenge({
					groupId,
					creatorId: user.id,
					title: data.title.trim(),
					description: data.description?.trim() || null,
					choiceA: data.choiceA.trim(),
					choiceB: data.choiceB.trim(),
					creatorSide: data.creatorSide as 'a' | 'b',
					stakeType: data.stakeType as 'points' | 'forfeit',
					stakeCreator: data.stakeType === 'points' ? parseFloat(data.stakeCreator!) : null,
					stakeOpponent: data.stakeType === 'points' ? parseFloat(data.stakeOpponent!) : null,
					forfeitCreator:
						data.stakeType === 'forfeit' ? (data.forfeitCreator?.trim() ?? null) : null,
					forfeitOpponent:
						data.stakeType === 'forfeit' ? (data.forfeitOpponent?.trim() ?? null) : null,
					maxOpponents,
					juryMode: data.juryMode as 'unanimous' | 'majority',
					juryUserIds,
					visibilityUserIds
				});

				await captureServer({
					distinctId: user.id,
					event: 'bet_created',
					properties: {
						bet_id: betId,
						group_id: groupId,
						bet_type: 'yesno',
						yesno_mode: 'open',
						stake_type: data.stakeType,
						jury_mode: data.juryMode,
						max_opponents: maxOpponents
					}
				});

				throw redirect(303, `/app/groups/${groupId}/bets/${betId}`);
			} catch (err) {
				if (err && typeof err === 'object' && 'status' in err && 'location' in err) {
					throw err;
				}
				console.error('Error creating open challenge:', err);
				return fail(500, {
					error: 'Erreur lors de la création du défi ouvert.',
					values: { ...raw, mode: 'open' }
				});
			}
		}

		// ── MODE DUEL (default) ──────────────────────────────────────────────────
		const rawJury = formData.getAll('juryUserIds') as string[];

		const raw = {
			title: formData.get('title') as string,
			description: (formData.get('description') as string | null) ?? undefined,
			choiceA: formData.get('choiceA') as string,
			choiceB: formData.get('choiceB') as string,
			creatorSide: formData.get('creatorSide') as string,
			targetId: formData.get('targetId') as string,
			stakeType: formData.get('stakeType') as string,
			stakeCreator: (formData.get('stakeCreator') as string | null) ?? undefined,
			stakeTarget: (formData.get('stakeTarget') as string | null) ?? undefined,
			forfeitCreator: (formData.get('forfeitCreator') as string | null) ?? undefined,
			forfeitTarget: (formData.get('forfeitTarget') as string | null) ?? undefined,
			juryMode: formData.get('juryMode') as string,
			juryUserIds: rawJury,
			expirationHours: (formData.get('expirationHours') as string | null) ?? '48'
		};

		const result = createYesnoDuelSchema.safeParse(raw);
		if (!result.success) {
			const fieldErrors = result.error.flatten().fieldErrors;
			const firstError = Object.values(fieldErrors).flat()[0] ?? 'Données invalides.';
			return fail(400, { error: firstError, fieldErrors, values: raw });
		}

		const data = result.data;

		// Validate active group membership + target is not the creator
		if (data.targetId === user.id) {
			return fail(400, {
				error: 'Vous ne pouvez pas vous défier vous-même.',
				values: raw
			});
		}

		// Validate all active group members
		const activeMembers = await db
			.select({ userId: groupMembers.userId })
			.from(groupMembers)
			.where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.removedAt)));

		const activeMemberIds = new Set(activeMembers.map((m) => m.userId));

		if (!activeMemberIds.has(data.targetId)) {
			return fail(400, {
				error: "La cible sélectionnée n'est pas un membre actif du groupe.",
				values: raw
			});
		}

		// Normalize jury
		const juryUserIds: string[] = Array.isArray(data.juryUserIds)
			? data.juryUserIds
			: data.juryUserIds
				? [data.juryUserIds]
				: [];

		if (juryUserIds.length === 0) {
			return fail(400, {
				error: 'Le jury doit avoir au moins un membre.',
				values: raw
			});
		}

		const invalidJury = juryUserIds.filter((id) => !activeMemberIds.has(id));
		if (invalidJury.length > 0) {
			return fail(400, { error: 'Un ou plusieurs jurés sont invalides.', values: raw });
		}

		// Parse expiration
		const expirationHours = parseInt(data.expirationHours ?? '48', 10);
		const validHours = isNaN(expirationHours) || expirationHours <= 0 ? 48 : expirationHours;
		const expiresAt = new Date(Date.now() + validHours * 60 * 60 * 1000);

		// Get creator's pseudo for notification
		const creatorProfileRows = await db
			.select({ pseudo: profiles.pseudo })
			.from(profiles)
			.where(eq(profiles.id, user.id))
			.limit(1);
		const creatorPseudo = creatorProfileRows[0]?.pseudo;

		// Create the bet
		try {
			const betTitle = data.title.trim();
			const { betId } = await createYesnoDuel({
				groupId,
				creatorId: user.id,
				title: betTitle,
				description: data.description?.trim() || null,
				choiceA: data.choiceA.trim(),
				choiceB: data.choiceB.trim(),
				creatorSide: data.creatorSide as 'a' | 'b',
				targetId: data.targetId,
				stakeType: data.stakeType as 'points' | 'forfeit',
				stakeCreator: data.stakeType === 'points' ? parseFloat(data.stakeCreator!) : null,
				stakeTarget: data.stakeType === 'points' ? parseFloat(data.stakeTarget!) : null,
				forfeitCreator: data.stakeType === 'forfeit' ? (data.forfeitCreator?.trim() ?? null) : null,
				forfeitTarget: data.stakeType === 'forfeit' ? (data.forfeitTarget?.trim() ?? null) : null,
				juryMode: data.juryMode as 'unanimous' | 'majority',
				juryUserIds,
				expiresAt
			});

			await captureServer({
				distinctId: user.id,
				event: 'bet_created',
				properties: {
					bet_id: betId,
					group_id: groupId,
					bet_type: 'yesno',
					yesno_mode: 'duel',
					stake_type: data.stakeType,
					jury_mode: data.juryMode,
					expiration_hours: validHours
				}
			});

			// Notify the target about the new duel proposition
			await notify([data.targetId], 'proposition_received', {
				betId,
				groupId,
				betTitle,
				actorPseudo: creatorPseudo
			});

			throw redirect(303, `/app/groups/${groupId}/bets/${betId}`);
		} catch (err) {
			// Re-throw redirects
			if (err && typeof err === 'object' && 'status' in err && 'location' in err) {
				throw err;
			}
			console.error('Error creating yesno duel:', err);
			return fail(500, { error: 'Erreur lors de la création du duel.', values: raw });
		}
	}
};
