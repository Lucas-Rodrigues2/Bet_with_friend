import { db } from '$lib/server/db/index';
import { groups, groupMembers, profiles } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

export interface GroupSummary {
	id: string;
	name: string;
	description: string | null;
	currency: string;
	createdAt: Date;
	role: 'admin' | 'member';
}

/**
 * Returns all groups where the given user is an active member (removed_at IS NULL)
 * and the group is not archived (archived_at IS NULL).
 */
export async function getUserGroups(userId: string): Promise<GroupSummary[]> {
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
				eq(groupMembers.userId, userId),
				isNull(groupMembers.removedAt)
			)
		)
		.where(isNull(groups.archivedAt))
		.orderBy(groups.createdAt);

	return rows as GroupSummary[];
}

/**
 * Renames a group. Only admins may rename.
 * Returns error string or null on success.
 */
export async function renameGroup(params: {
	groupId: string;
	newName: string;
	adminUserId: string;
}): Promise<{ error?: string }> {
	// Verify actor is admin of non-archived group
	const rows = await db
		.select({ role: groupMembers.role })
		.from(groupMembers)
		.innerJoin(groups, eq(groups.id, groupMembers.groupId))
		.where(
			and(
				eq(groupMembers.groupId, params.groupId),
				eq(groupMembers.userId, params.adminUserId),
				isNull(groupMembers.removedAt),
				isNull(groups.archivedAt)
			)
		)
		.limit(1);

	if (rows.length === 0) return { error: 'Accès refusé.' };
	if (rows[0].role !== 'admin') return { error: 'Seul un admin peut renommer le groupe.' };

	await db.update(groups).set({ name: params.newName }).where(eq(groups.id, params.groupId));

	return {};
}

/**
 * Soft-deletes a group by setting archived_at. Only admins may archive.
 * Returns error string or null on success.
 */
export async function archiveGroup(params: {
	groupId: string;
	adminUserId: string;
}): Promise<{ error?: string }> {
	// Verify actor is admin of non-archived group
	const rows = await db
		.select({ role: groupMembers.role })
		.from(groupMembers)
		.innerJoin(groups, eq(groups.id, groupMembers.groupId))
		.where(
			and(
				eq(groupMembers.groupId, params.groupId),
				eq(groupMembers.userId, params.adminUserId),
				isNull(groupMembers.removedAt),
				isNull(groups.archivedAt)
			)
		)
		.limit(1);

	if (rows.length === 0) return { error: 'Accès refusé.' };
	if (rows[0].role !== 'admin') return { error: 'Seul un admin peut supprimer le groupe.' };

	await db.update(groups).set({ archivedAt: new Date() }).where(eq(groups.id, params.groupId));

	return {};
}

export interface MemberInfo {
	userId: string;
	role: 'admin' | 'member';
	canInvite: boolean;
	pseudo: string;
	avatarUrl: string | null;
	joinedAt: Date;
}

/**
 * Returns all active members of a group (removed_at IS NULL).
 */
export async function getGroupMembers(groupId: string): Promise<MemberInfo[]> {
	const rows = await db
		.select({
			userId: groupMembers.userId,
			role: groupMembers.role,
			canInvite: groupMembers.canInvite,
			pseudo: profiles.pseudo,
			avatarUrl: profiles.avatarUrl,
			joinedAt: groupMembers.joinedAt
		})
		.from(groupMembers)
		.innerJoin(profiles, eq(profiles.id, groupMembers.userId))
		.where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.removedAt)))
		.orderBy(groupMembers.joinedAt);

	return rows as MemberInfo[];
}

/**
 * Checks if a user is an active member of a group.
 * Returns null if not a member, or the member record if they are.
 */
export async function getActiveMember(
	groupId: string,
	userId: string
): Promise<{ role: 'admin' | 'member'; canInvite: boolean } | null> {
	const rows = await db
		.select({ role: groupMembers.role, canInvite: groupMembers.canInvite })
		.from(groupMembers)
		.where(
			and(
				eq(groupMembers.groupId, groupId),
				eq(groupMembers.userId, userId),
				isNull(groupMembers.removedAt)
			)
		)
		.limit(1);

	if (rows.length === 0) return null;
	return rows[0] as { role: 'admin' | 'member'; canInvite: boolean };
}

/**
 * Soft-delete a member from a group (leave or kick).
 * Returns error string or null on success.
 *
 * Rules:
 * - A member can always leave (unless they are the last admin).
 * - An admin can kick any non-admin member.
 * - An admin cannot kick another admin.
 * - The last admin cannot leave.
 */
export async function removeMember(params: {
	groupId: string;
	targetUserId: string;
	actorUserId: string;
}): Promise<{ error?: string }> {
	const isSelf = params.targetUserId === params.actorUserId;

	const actorRows = await db
		.select({ role: groupMembers.role })
		.from(groupMembers)
		.where(
			and(
				eq(groupMembers.groupId, params.groupId),
				eq(groupMembers.userId, params.actorUserId),
				isNull(groupMembers.removedAt)
			)
		)
		.limit(1);

	if (actorRows.length === 0) {
		return { error: 'Accès refusé.' };
	}
	const actorRole = actorRows[0].role as 'admin' | 'member';

	if (!isSelf) {
		// Kicking another member — must be admin
		if (actorRole !== 'admin') {
			return { error: 'Seul un admin peut exclure un membre.' };
		}

		// Check the target is not an admin
		const targetRows = await db
			.select({ role: groupMembers.role })
			.from(groupMembers)
			.where(
				and(
					eq(groupMembers.groupId, params.groupId),
					eq(groupMembers.userId, params.targetUserId),
					isNull(groupMembers.removedAt)
				)
			)
			.limit(1);

		if (targetRows.length === 0) {
			return { error: 'Membre introuvable.' };
		}
		if (targetRows[0].role === 'admin') {
			return { error: "Impossible d'exclure un admin." };
		}
	} else {
		// Leaving — if admin, check there is at least one other admin
		if (actorRole === 'admin') {
			const allAdmins = await db
				.select({ userId: groupMembers.userId })
				.from(groupMembers)
				.where(
					and(
						eq(groupMembers.groupId, params.groupId),
						eq(groupMembers.role, 'admin'),
						isNull(groupMembers.removedAt)
					)
				);

			const otherAdmins = allAdmins.filter((r) => r.userId !== params.actorUserId);
			if (otherAdmins.length === 0) {
				return {
					error: 'Vous êtes le dernier admin. Promouvez un autre membre avant de quitter.'
				};
			}
		}
	}

	await db
		.update(groupMembers)
		.set({ removedAt: new Date() })
		.where(
			and(
				eq(groupMembers.groupId, params.groupId),
				eq(groupMembers.userId, params.targetUserId),
				isNull(groupMembers.removedAt)
			)
		);

	return {};
}

/**
 * Promotes a member to admin role.
 * Only an admin can promote another member.
 */
export async function promoteMember(params: {
	groupId: string;
	targetUserId: string;
	adminUserId: string;
}): Promise<{ error?: string }> {
	// Verify actor is admin
	const actorRows = await db
		.select({ role: groupMembers.role })
		.from(groupMembers)
		.where(
			and(
				eq(groupMembers.groupId, params.groupId),
				eq(groupMembers.userId, params.adminUserId),
				isNull(groupMembers.removedAt)
			)
		)
		.limit(1);

	if (actorRows.length === 0 || actorRows[0].role !== 'admin') {
		return { error: 'Accès refusé — seul un admin peut promouvoir un membre.' };
	}

	// Verify target is an active member
	const targetRows = await db
		.select({ role: groupMembers.role })
		.from(groupMembers)
		.where(
			and(
				eq(groupMembers.groupId, params.groupId),
				eq(groupMembers.userId, params.targetUserId),
				isNull(groupMembers.removedAt)
			)
		)
		.limit(1);

	if (targetRows.length === 0) {
		return { error: 'Membre introuvable.' };
	}
	if (targetRows[0].role === 'admin') {
		return { error: 'Ce membre est déjà admin.' };
	}

	await db
		.update(groupMembers)
		.set({ role: 'admin' })
		.where(
			and(
				eq(groupMembers.groupId, params.groupId),
				eq(groupMembers.userId, params.targetUserId),
				isNull(groupMembers.removedAt)
			)
		);

	return {};
}

/**
 * Creates a group and adds the creator as admin in a single transaction.
 * Returns the new group id.
 */
export async function createGroup(params: {
	name: string;
	description: string | null;
	currency: string;
	creatorId: string;
}): Promise<string> {
	let groupId: string | undefined;

	await db.transaction(async (tx) => {
		const [newGroup] = await tx
			.insert(groups)
			.values({
				name: params.name,
				description: params.description,
				currency: params.currency,
				creatorId: params.creatorId
			})
			.returning({ id: groups.id });

		groupId = newGroup.id;

		await tx.insert(groupMembers).values({
			groupId: newGroup.id,
			userId: params.creatorId,
			role: 'admin'
		});
	});

	if (!groupId) throw new Error('Erreur lors de la création du groupe.');

	return groupId;
}
