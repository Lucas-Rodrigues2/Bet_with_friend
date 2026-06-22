import { db } from '$lib/server/db/index';
import {
	bets,
	betVisibility,
	matches,
	matchJurors,
	groupMembers,
	profiles,
	yesnoBets,
	propositions,
	propositionOffers,
	propositionJurors
} from '$lib/server/db/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';

export interface CreateClosestBetParams {
	groupId: string;
	creatorId: string;
	title: string;
	description: string | null;
	stakeType: 'points' | 'forfeit';
	stakeAmount: number | null; // required if stakeType='points'
	forfeitDescription: string | null; // required if stakeType='forfeit'
	forfeitScope: 'all_losers' | 'last_one' | null; // required if stakeType='forfeit'
	hideAnswers: boolean;
	participationDeadline: Date | null;
	juryMode: 'unanimous' | 'majority';
	visibilityUserIds: string[]; // includes creator
	juryUserIds: string[];
}

export interface CreateClosestBetResult {
	betId: string;
	matchId: string;
}

/**
 * Creates a closest bet with all related records in a single transaction:
 * - bets row
 * - bet_visibility rows (frozen at creation)
 * - matches row (1 match per closest bet)
 * - match_jurors rows
 *
 * Returns { betId, matchId } or throws on error.
 */
export async function createClosestBet(
	params: CreateClosestBetParams
): Promise<CreateClosestBetResult> {
	let result: CreateClosestBetResult | undefined;

	await db.transaction(async (tx) => {
		// Insert the bet
		const [newBet] = await tx
			.insert(bets)
			.values({
				groupId: params.groupId,
				creatorId: params.creatorId,
				type: 'closest',
				title: params.title,
				description: params.description,
				stakeType: params.stakeType,
				stakeAmount:
					params.stakeType === 'points' && params.stakeAmount !== null
						? params.stakeAmount.toString()
						: null,
				forfeitDescription: params.forfeitDescription,
				forfeitScope: params.forfeitScope,
				hideAnswers: params.hideAnswers,
				participationDeadline: params.participationDeadline,
				juryMode: params.juryMode,
				status: 'open'
			})
			.returning({ id: bets.id });

		const betId = newBet.id;

		// Insert bet_visibility (creator always included — enforced by caller)
		await tx.insert(betVisibility).values(
			params.visibilityUserIds.map((userId) => ({
				betId,
				userId
			}))
		);

		// Create the match (1 closest = 1 match, status open)
		const [newMatch] = await tx
			.insert(matches)
			.values({
				betId,
				status: 'open'
			})
			.returning({ id: matches.id });

		const matchId = newMatch.id;

		// Insert match_jurors
		await tx.insert(matchJurors).values(
			params.juryUserIds.map((userId) => ({
				matchId,
				userId
			}))
		);

		result = { betId, matchId };
	});

	if (!result) throw new Error('Erreur lors de la création du pari.');
	return result;
}

export interface CreateYesnoDuelParams {
	groupId: string;
	creatorId: string;
	title: string;
	description: string | null;
	choiceA: string;
	choiceB: string;
	creatorSide: 'a' | 'b';
	targetId: string; // single target in duel mode
	stakeType: 'points' | 'forfeit';
	stakeCreator: number | null; // required if stakeType='points'
	stakeTarget: number | null; // required if stakeType='points'
	forfeitCreator: string | null; // required if stakeType='forfeit'
	forfeitTarget: string | null; // required if stakeType='forfeit'
	juryMode: 'unanimous' | 'majority';
	juryUserIds: string[];
	expiresAt: Date; // proposition expiry (default +48h)
}

export interface CreateYesnoDuelResult {
	betId: string;
	propositionId: string;
}

/**
 * Creates a yesno duel bet with all related records in a single transaction:
 * - bets row (type=yesno, status=open)
 * - yesno_bets row (mode=duel)
 * - bet_visibility rows = {creator, target} (frozen at creation)
 * - propositions row (status=negotiating, expires_at)
 * - proposition_offers row (initial offer by creator)
 * - proposition_jurors rows
 *
 * No match is created yet — it will be created when the target accepts (S-031).
 * Returns { betId, propositionId } or throws on error.
 */
export async function createYesnoDuel(
	params: CreateYesnoDuelParams
): Promise<CreateYesnoDuelResult> {
	let result: CreateYesnoDuelResult | undefined;

	await db.transaction(async (tx) => {
		// Insert the bet (stake_type='forfeit' needs forfeit_description on bets for the check constraint,
		// but for yesno the real forfeits live on propositions. Use a sentinel to satisfy the constraint.)
		const [newBet] = await tx
			.insert(bets)
			.values({
				groupId: params.groupId,
				creatorId: params.creatorId,
				type: 'yesno',
				title: params.title,
				description: params.description,
				stakeType: params.stakeType,
				stakeAmount:
					params.stakeType === 'points' && params.stakeCreator !== null
						? params.stakeCreator.toString()
						: null,
				// For yesno forfeits, actual descriptions live on the proposition.
				// The bets.stake_forfeit_has_desc constraint requires a non-null forfeit_description if stake_type='forfeit'.
				// We store the creator's forfeit as a sentinel here.
				forfeitDescription: params.stakeType === 'forfeit' ? (params.forfeitCreator ?? null) : null,
				forfeitScope: null, // not applicable to yesno
				hideAnswers: false,
				participationDeadline: null,
				juryMode: params.juryMode,
				status: 'open'
			})
			.returning({ id: bets.id });

		const betId = newBet.id;

		// Insert yesno_bets extension (mode=duel)
		await tx.insert(yesnoBets).values({
			betId,
			choiceA: params.choiceA,
			choiceB: params.choiceB,
			creatorSide: params.creatorSide,
			mode: 'duel',
			maxOpponents: 1,
			acceptedCount: 0
		});

		// Insert bet_visibility: only creator + target (frozen at creation)
		const visibilityUserIds = Array.from(new Set([params.creatorId, params.targetId]));
		await tx.insert(betVisibility).values(
			visibilityUserIds.map((userId) => ({
				betId,
				userId
			}))
		);

		// Insert proposition (status=negotiating)
		const [newProposition] = await tx
			.insert(propositions)
			.values({
				betId,
				targetId: params.targetId,
				stakeCreator:
					params.stakeType === 'points' && params.stakeCreator !== null
						? params.stakeCreator.toString()
						: null,
				stakeTarget:
					params.stakeType === 'points' && params.stakeTarget !== null
						? params.stakeTarget.toString()
						: null,
				forfeitCreator: params.stakeType === 'forfeit' ? (params.forfeitCreator ?? null) : null,
				forfeitTarget: params.stakeType === 'forfeit' ? (params.forfeitTarget ?? null) : null,
				lastProposerId: params.creatorId,
				status: 'negotiating',
				expiresAt: params.expiresAt
			})
			.returning({ id: propositions.id });

		const propositionId = newProposition.id;

		// Insert initial proposition offer (history starts at creation)
		await tx.insert(propositionOffers).values({
			propositionId,
			authorId: params.creatorId,
			stakeCreator:
				params.stakeType === 'points' && params.stakeCreator !== null
					? params.stakeCreator.toString()
					: null,
			stakeTarget:
				params.stakeType === 'points' && params.stakeTarget !== null
					? params.stakeTarget.toString()
					: null,
			forfeitCreator: params.stakeType === 'forfeit' ? (params.forfeitCreator ?? null) : null,
			forfeitTarget: params.stakeType === 'forfeit' ? (params.forfeitTarget ?? null) : null
		});

		// Insert proposition_jurors
		if (params.juryUserIds.length > 0) {
			await tx.insert(propositionJurors).values(
				params.juryUserIds.map((userId) => ({
					propositionId,
					userId
				}))
			);
		}

		result = { betId, propositionId };
	});

	if (!result) throw new Error('Erreur lors de la création du duel.');
	return result;
}

export interface BetSummary {
	id: string;
	type: 'closest' | 'yesno';
	title: string;
	stakeType: 'points' | 'forfeit';
	stakeAmount: string | null;
	forfeitDescription: string | null;
	hideAnswers: boolean;
	participationDeadline: Date | null;
	status: string;
	createdAt: Date;
	// yesno-specific: is this a proposition pending a response from the current user?
	propositionStatus: string | null;
	propositionTargetId: string | null;
}

/**
 * Returns all bets visible to the given user in the given group.
 * Filters by bet_visibility. For yesno bets, also returns proposition info.
 */
export async function getGroupBetsForUser(groupId: string, userId: string): Promise<BetSummary[]> {
	// Get bet ids visible to this user in this group
	const visibleBetIds = await db
		.select({ betId: betVisibility.betId })
		.from(betVisibility)
		.innerJoin(bets, eq(bets.id, betVisibility.betId))
		.where(and(eq(bets.groupId, groupId), eq(betVisibility.userId, userId)));

	if (visibleBetIds.length === 0) return [];

	const ids = visibleBetIds.map((r) => r.betId);

	const rows = await db
		.select({
			id: bets.id,
			type: bets.type,
			title: bets.title,
			stakeType: bets.stakeType,
			stakeAmount: bets.stakeAmount,
			forfeitDescription: bets.forfeitDescription,
			hideAnswers: bets.hideAnswers,
			participationDeadline: bets.participationDeadline,
			status: bets.status,
			createdAt: bets.createdAt,
			propositionStatus: propositions.status,
			propositionTargetId: propositions.targetId
		})
		.from(bets)
		.leftJoin(propositions, eq(propositions.betId, bets.id))
		.where(and(eq(bets.groupId, groupId), inArray(bets.id, ids)))
		.orderBy(bets.createdAt);

	return rows.map((r) => ({
		id: r.id,
		type: r.type as 'closest' | 'yesno',
		title: r.title,
		stakeType: r.stakeType as 'points' | 'forfeit',
		stakeAmount: r.stakeAmount,
		forfeitDescription: r.forfeitDescription,
		hideAnswers: r.hideAnswers,
		participationDeadline: r.participationDeadline,
		status: r.status,
		createdAt: r.createdAt,
		propositionStatus: r.propositionStatus ?? null,
		propositionTargetId: r.propositionTargetId ?? null
	}));
}

export interface BetDetail {
	id: string;
	groupId: string;
	creatorId: string;
	type: 'closest' | 'yesno';
	title: string;
	description: string | null;
	stakeType: 'points' | 'forfeit';
	stakeAmount: string | null;
	forfeitDescription: string | null;
	forfeitScope: 'all_losers' | 'last_one' | null;
	hideAnswers: boolean;
	participationDeadline: Date | null;
	juryMode: 'unanimous' | 'majority';
	status: string;
	createdAt: Date;
	matchId: string | null;
	matchStatus: string | null;
	visibility: { userId: string; pseudo: string; avatarUrl: string | null }[];
	jurors: { userId: string; pseudo: string; avatarUrl: string | null }[];
	// yesno-specific (null for closest bets)
	yesno: {
		choiceA: string;
		choiceB: string;
		creatorSide: string;
		mode: string;
	} | null;
	// proposition (for yesno duel bets)
	proposition: {
		id: string;
		targetId: string;
		targetPseudo: string;
		targetAvatarUrl: string | null;
		stakeCreator: string | null;
		stakeTarget: string | null;
		forfeitCreator: string | null;
		forfeitTarget: string | null;
		status: string;
		expiresAt: Date | null;
		jurors: { userId: string; pseudo: string; avatarUrl: string | null }[];
	} | null;
}

/**
 * Returns full bet details for a user who is in the bet's visibility list.
 * Returns null if the bet is not found or the user cannot see it.
 */
export async function getBetDetailForUser(
	betId: string,
	userId: string
): Promise<BetDetail | null> {
	// Check visibility
	const visCheck = await db
		.select({ betId: betVisibility.betId })
		.from(betVisibility)
		.where(and(eq(betVisibility.betId, betId), eq(betVisibility.userId, userId)))
		.limit(1);

	if (visCheck.length === 0) return null;

	// Fetch bet
	const betRows = await db
		.select({
			id: bets.id,
			groupId: bets.groupId,
			creatorId: bets.creatorId,
			type: bets.type,
			title: bets.title,
			description: bets.description,
			stakeType: bets.stakeType,
			stakeAmount: bets.stakeAmount,
			forfeitDescription: bets.forfeitDescription,
			forfeitScope: bets.forfeitScope,
			hideAnswers: bets.hideAnswers,
			participationDeadline: bets.participationDeadline,
			juryMode: bets.juryMode,
			status: bets.status,
			createdAt: bets.createdAt
		})
		.from(bets)
		.where(eq(bets.id, betId))
		.limit(1);

	if (betRows.length === 0) return null;
	const bet = betRows[0];

	// Fetch the match for this bet
	const matchRows = await db
		.select({ id: matches.id, status: matches.status })
		.from(matches)
		.where(eq(matches.betId, betId))
		.limit(1);

	const matchId = matchRows.length > 0 ? matchRows[0].id : null;
	const matchStatus = matchRows.length > 0 ? matchRows[0].status : null;

	// Fetch visibility list with profiles
	const visRows = await db
		.select({
			userId: betVisibility.userId,
			pseudo: profiles.pseudo,
			avatarUrl: profiles.avatarUrl
		})
		.from(betVisibility)
		.innerJoin(profiles, eq(profiles.id, betVisibility.userId))
		.where(eq(betVisibility.betId, betId));

	// Fetch jurors from match_jurors
	let jurors: { userId: string; pseudo: string; avatarUrl: string | null }[] = [];
	if (matchId) {
		const jurorRows = await db
			.select({
				userId: matchJurors.userId,
				pseudo: profiles.pseudo,
				avatarUrl: profiles.avatarUrl
			})
			.from(matchJurors)
			.innerJoin(profiles, eq(profiles.id, matchJurors.userId))
			.where(eq(matchJurors.matchId, matchId));
		jurors = jurorRows as typeof jurors;
	}

	// Fetch yesno-specific data
	let yesnoData: BetDetail['yesno'] = null;
	let propositionData: BetDetail['proposition'] = null;

	if (bet.type === 'yesno') {
		const yesnoRows = await db
			.select({
				choiceA: yesnoBets.choiceA,
				choiceB: yesnoBets.choiceB,
				creatorSide: yesnoBets.creatorSide,
				mode: yesnoBets.mode
			})
			.from(yesnoBets)
			.where(eq(yesnoBets.betId, betId))
			.limit(1);

		if (yesnoRows.length > 0) {
			yesnoData = yesnoRows[0];
		}

		// Fetch proposition (duel mode has exactly one)
		const propRows = await db
			.select({
				id: propositions.id,
				targetId: propositions.targetId,
				stakeCreator: propositions.stakeCreator,
				stakeTarget: propositions.stakeTarget,
				forfeitCreator: propositions.forfeitCreator,
				forfeitTarget: propositions.forfeitTarget,
				status: propositions.status,
				expiresAt: propositions.expiresAt,
				targetPseudo: profiles.pseudo,
				targetAvatarUrl: profiles.avatarUrl
			})
			.from(propositions)
			.innerJoin(profiles, eq(profiles.id, propositions.targetId))
			.where(eq(propositions.betId, betId))
			.limit(1);

		if (propRows.length > 0) {
			const prop = propRows[0];

			// Fetch proposition jurors
			const propJurorRows = await db
				.select({
					userId: propositionJurors.userId,
					pseudo: profiles.pseudo,
					avatarUrl: profiles.avatarUrl
				})
				.from(propositionJurors)
				.innerJoin(profiles, eq(profiles.id, propositionJurors.userId))
				.where(eq(propositionJurors.propositionId, prop.id));

			propositionData = {
				id: prop.id,
				targetId: prop.targetId,
				targetPseudo: prop.targetPseudo,
				targetAvatarUrl: prop.targetAvatarUrl,
				stakeCreator: prop.stakeCreator,
				stakeTarget: prop.stakeTarget,
				forfeitCreator: prop.forfeitCreator,
				forfeitTarget: prop.forfeitTarget,
				status: prop.status,
				expiresAt: prop.expiresAt,
				jurors: propJurorRows as BetDetail['proposition'] extends null
					? never
					: NonNullable<BetDetail['proposition']>['jurors']
			};
		}
	}

	return {
		id: bet.id,
		groupId: bet.groupId,
		creatorId: bet.creatorId,
		type: bet.type as 'closest' | 'yesno',
		title: bet.title,
		description: bet.description,
		stakeType: bet.stakeType as 'points' | 'forfeit',
		stakeAmount: bet.stakeAmount,
		forfeitDescription: bet.forfeitDescription,
		forfeitScope: bet.forfeitScope as 'all_losers' | 'last_one' | null,
		hideAnswers: bet.hideAnswers,
		participationDeadline: bet.participationDeadline,
		juryMode: bet.juryMode as 'unanimous' | 'majority',
		status: bet.status,
		createdAt: bet.createdAt,
		matchId,
		matchStatus,
		visibility: visRows as BetDetail['visibility'],
		jurors,
		yesno: yesnoData,
		proposition: propositionData
	};
}

/**
 * Checks if a user is an active member of the group that owns a bet,
 * and that the bet's group matches groupId.
 * Returns true if permitted, false otherwise.
 */
export async function isActiveMemberOfBetGroup(
	betId: string,
	groupId: string,
	userId: string
): Promise<boolean> {
	const rows = await db
		.select({ role: groupMembers.role })
		.from(groupMembers)
		.innerJoin(bets, eq(bets.groupId, groupMembers.groupId))
		.where(
			and(
				eq(bets.id, betId),
				eq(bets.groupId, groupId),
				eq(groupMembers.userId, userId),
				isNull(groupMembers.removedAt)
			)
		)
		.limit(1);

	return rows.length > 0;
}
