import { db } from '$lib/server/db/index';
import { groupInvitations, groupMembers, groups } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

export interface InvitationInfo {
	groupId: string;
	groupName: string;
	token: string;
}

export interface InvitationValidationResult {
	valid: boolean;
	reason?: 'expired' | 'exhausted' | 'revoked' | 'not_found';
	groupId?: string;
	groupName?: string;
	invitationId?: string;
}

/**
 * Valide un token d'invitation et retourne les informations du groupe.
 * Ne modifie pas la DB.
 */
export async function validateInvitationToken(token: string): Promise<InvitationValidationResult> {
	const rows = await db
		.select({
			id: groupInvitations.id,
			groupId: groupInvitations.groupId,
			groupName: groups.name,
			expiresAt: groupInvitations.expiresAt,
			maxUses: groupInvitations.maxUses,
			usesCount: groupInvitations.usesCount,
			revokedAt: groupInvitations.revokedAt
		})
		.from(groupInvitations)
		.innerJoin(groups, eq(groups.id, groupInvitations.groupId))
		.where(eq(groupInvitations.token, token))
		.limit(1);

	if (rows.length === 0) {
		return { valid: false, reason: 'not_found' };
	}

	const inv = rows[0];

	if (inv.revokedAt !== null) {
		return { valid: false, reason: 'revoked' };
	}

	if (inv.expiresAt !== null && inv.expiresAt < new Date()) {
		return { valid: false, reason: 'expired' };
	}

	if (inv.maxUses !== null && inv.usesCount >= inv.maxUses) {
		return { valid: false, reason: 'exhausted' };
	}

	return {
		valid: true,
		groupId: inv.groupId,
		groupName: inv.groupName,
		invitationId: inv.id
	};
}

/**
 * Rejoindre un groupe via un token d'invitation.
 * Incrémente uses_count atomiquement dans la même transaction.
 * Réactive un membre soft-deleted si besoin.
 * Retourne 'joined' | 'already_member' | 'invalid'
 */
export async function joinViaInvitation(
	token: string,
	userId: string
): Promise<{
	result: 'joined' | 'already_member' | 'invalid';
	groupId?: string;
	groupName?: string;
}> {
	let outcome: {
		result: 'joined' | 'already_member' | 'invalid';
		groupId?: string;
		groupName?: string;
	} = { result: 'invalid' };

	await db.transaction(async (tx) => {
		// Verrouillage pessimiste via SELECT FOR UPDATE pour l'incrément atomique
		const invRows = await tx
			.select({
				id: groupInvitations.id,
				groupId: groupInvitations.groupId,
				groupName: groups.name,
				expiresAt: groupInvitations.expiresAt,
				maxUses: groupInvitations.maxUses,
				usesCount: groupInvitations.usesCount,
				revokedAt: groupInvitations.revokedAt
			})
			.from(groupInvitations)
			.innerJoin(groups, eq(groups.id, groupInvitations.groupId))
			.where(eq(groupInvitations.token, token))
			.limit(1)
			.for('update');

		if (invRows.length === 0) {
			outcome = { result: 'invalid' };
			return;
		}

		const inv = invRows[0];

		// Vérifier validité
		if (inv.revokedAt !== null) {
			outcome = { result: 'invalid' };
			return;
		}
		if (inv.expiresAt !== null && inv.expiresAt < new Date()) {
			outcome = { result: 'invalid' };
			return;
		}
		if (inv.maxUses !== null && inv.usesCount >= inv.maxUses) {
			outcome = { result: 'invalid' };
			return;
		}

		// Vérifier si l'utilisateur est déjà membre (actif)
		const activeMember = await tx
			.select({ userId: groupMembers.userId })
			.from(groupMembers)
			.where(
				and(
					eq(groupMembers.groupId, inv.groupId),
					eq(groupMembers.userId, userId),
					isNull(groupMembers.removedAt)
				)
			)
			.limit(1);

		if (activeMember.length > 0) {
			outcome = { result: 'already_member', groupId: inv.groupId, groupName: inv.groupName };
			return;
		}

		// Vérifier si c'est un membre soft-deleted
		const softDeleted = await tx
			.select({ userId: groupMembers.userId, removedAt: groupMembers.removedAt })
			.from(groupMembers)
			.where(and(eq(groupMembers.groupId, inv.groupId), eq(groupMembers.userId, userId)))
			.limit(1);

		if (softDeleted.length > 0 && softDeleted[0].removedAt !== null) {
			// Réactiver l'ancien membre
			await tx
				.update(groupMembers)
				.set({ removedAt: null })
				.where(and(eq(groupMembers.groupId, inv.groupId), eq(groupMembers.userId, userId)));
		} else {
			// Ajouter comme nouveau membre
			await tx.insert(groupMembers).values({
				groupId: inv.groupId,
				userId,
				role: 'member'
			});
		}

		// Incrémenter uses_count
		await tx
			.update(groupInvitations)
			.set({ usesCount: inv.usesCount + 1 })
			.where(eq(groupInvitations.id, inv.id));

		outcome = { result: 'joined', groupId: inv.groupId, groupName: inv.groupName };
	});

	return outcome;
}

/**
 * Génère une invitation pour un groupe.
 * Vérifie que l'utilisateur est admin ou a can_invite.
 */
export async function createInvitation(params: {
	groupId: string;
	createdBy: string;
	expiresAt: Date | null;
	maxUses: number | null;
}): Promise<{ token: string } | { error: string }> {
	// Vérifier les droits
	const memberRows = await db
		.select({ role: groupMembers.role, canInvite: groupMembers.canInvite })
		.from(groupMembers)
		.where(
			and(
				eq(groupMembers.groupId, params.groupId),
				eq(groupMembers.userId, params.createdBy),
				isNull(groupMembers.removedAt)
			)
		)
		.limit(1);

	if (memberRows.length === 0) {
		return { error: 'Accès refusé.' };
	}

	const member = memberRows[0];
	if (member.role !== 'admin' && !member.canInvite) {
		return { error: "Vous n'avez pas le droit de générer des invitations." };
	}

	const token = crypto.randomUUID();

	await db.insert(groupInvitations).values({
		groupId: params.groupId,
		token,
		createdBy: params.createdBy,
		expiresAt: params.expiresAt,
		maxUses: params.maxUses
	});

	return { token };
}

/**
 * Révoque un lien d'invitation (admin seulement).
 */
export async function revokeInvitation(params: {
	invitationId: string;
	groupId: string;
	userId: string;
}): Promise<{ error?: string }> {
	// Vérifier que l'utilisateur est admin du groupe
	const memberRows = await db
		.select({ role: groupMembers.role })
		.from(groupMembers)
		.where(
			and(
				eq(groupMembers.groupId, params.groupId),
				eq(groupMembers.userId, params.userId),
				isNull(groupMembers.removedAt)
			)
		)
		.limit(1);

	if (memberRows.length === 0 || memberRows[0].role !== 'admin') {
		return { error: 'Accès refusé — seul un admin peut révoquer un lien.' };
	}

	await db
		.update(groupInvitations)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(groupInvitations.id, params.invitationId),
				eq(groupInvitations.groupId, params.groupId)
			)
		);

	return {};
}

/**
 * Retourne les invitations actives d'un groupe.
 */
export async function getGroupInvitations(groupId: string) {
	const rows = await db
		.select({
			id: groupInvitations.id,
			token: groupInvitations.token,
			expiresAt: groupInvitations.expiresAt,
			maxUses: groupInvitations.maxUses,
			usesCount: groupInvitations.usesCount,
			revokedAt: groupInvitations.revokedAt,
			createdAt: groupInvitations.createdAt
		})
		.from(groupInvitations)
		.where(eq(groupInvitations.groupId, groupId))
		.orderBy(groupInvitations.createdAt);

	return rows;
}

/**
 * Met à jour le droit can_invite d'un membre (admin seulement).
 */
export async function setMemberCanInvite(params: {
	groupId: string;
	targetUserId: string;
	canInvite: boolean;
	adminUserId: string;
}): Promise<{ error?: string }> {
	// Vérifier que l'utilisateur est admin du groupe
	const adminRows = await db
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

	if (adminRows.length === 0 || adminRows[0].role !== 'admin') {
		return { error: 'Accès refusé — seul un admin peut modifier les droits.' };
	}

	const updated = await db
		.update(groupMembers)
		.set({ canInvite: params.canInvite })
		.where(
			and(
				eq(groupMembers.groupId, params.groupId),
				eq(groupMembers.userId, params.targetUserId),
				isNull(groupMembers.removedAt)
			)
		)
		.returning({ userId: groupMembers.userId });

	if (updated.length === 0) {
		return { error: 'Membre introuvable.' };
	}

	return {};
}
