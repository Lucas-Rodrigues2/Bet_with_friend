import { db } from '$lib/server/db/index';
import { groups, groupMembers } from '$lib/server/db/schema';
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
 * Returns all groups where the given user is an active member (removed_at IS NULL).
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
		.orderBy(groups.createdAt);

	return rows as GroupSummary[];
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
