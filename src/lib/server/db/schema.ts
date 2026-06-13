import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	timestamp,
	numeric,
	integer,
	primaryKey,
	unique,
	check,
	jsonb
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const betTypeEnum = pgEnum('bet_type', ['closest', 'yesno']);
export const stakeTypeEnum = pgEnum('stake_type', ['points', 'forfeit']);
export const yesnoModeEnum = pgEnum('yesno_mode', ['duel', 'open']);
export const juryModeEnum = pgEnum('jury_mode', ['unanimous', 'majority']);
export const memberRoleEnum = pgEnum('member_role', ['admin', 'member']);
export const betStatusEnum = pgEnum('bet_status', ['draft', 'open', 'closed', 'cancelled']);
export const matchStatusEnum = pgEnum('match_status', [
	'open',
	'closed',
	'judging',
	'resolved',
	'contested',
	'cancelled'
]);
export const propositionStatusEnum = pgEnum('proposition_status', [
	'negotiating',
	'accepted',
	'refused',
	'cancelled',
	'expired'
]);
export const jurorVerdictEnum = pgEnum('juror_verdict', ['winners_selected', 'not_resolved']);
export const forfeitStatusEnum = pgEnum('forfeit_status', ['pending', 'done', 'not_done']);

// ─── Identity & Groups ────────────────────────────────────────────────────────

export const profiles = pgTable('profiles', {
	id: uuid('id').primaryKey(), // references auth.users(id) — managed by Supabase
	pseudo: text('pseudo').notNull(),
	avatarUrl: text('avatar_url'),
	isAnonymous: boolean('is_anonymous').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const groups = pgTable('groups', {
	id: uuid('id')
		.primaryKey()
		.default(sql`gen_random_uuid()`),
	name: text('name').notNull(),
	description: text('description'),
	imageUrl: text('image_url'),
	currency: text('currency').notNull().default('EUR'),
	creatorId: uuid('creator_id')
		.notNull()
		.references(() => profiles.id),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const groupMembers = pgTable(
	'group_members',
	{
		groupId: uuid('group_id')
			.notNull()
			.references(() => groups.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'cascade' }),
		role: memberRoleEnum('role').notNull().default('member'),
		joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
		// Soft-delete: removed members keep history but lose access to group content.
		// They can still see the group's ledger (ardoise).
		removedAt: timestamp('removed_at', { withTimezone: true })
	},
	(t) => [primaryKey({ columns: [t.groupId, t.userId] })]
);

export const groupInvitations = pgTable('group_invitations', {
	id: uuid('id')
		.primaryKey()
		.default(sql`gen_random_uuid()`),
	groupId: uuid('group_id')
		.notNull()
		.references(() => groups.id, { onDelete: 'cascade' }),
	token: text('token').notNull().unique(),
	createdBy: uuid('created_by')
		.notNull()
		.references(() => profiles.id),
	expiresAt: timestamp('expires_at', { withTimezone: true }),
	maxUses: integer('max_uses'),
	usesCount: integer('uses_count').notNull().default(0),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ─── Bets ─────────────────────────────────────────────────────────────────────

export const bets = pgTable(
	'bets',
	{
		id: uuid('id')
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		groupId: uuid('group_id')
			.notNull()
			.references(() => groups.id, { onDelete: 'cascade' }),
		creatorId: uuid('creator_id')
			.notNull()
			.references(() => profiles.id),
		type: betTypeEnum('type').notNull(),
		title: text('title').notNull(),
		description: text('description'),
		stakeType: stakeTypeEnum('stake_type').notNull(),
		stakeAmount: numeric('stake_amount', { precision: 12, scale: 2 }),
		forfeitDescription: text('forfeit_description'),
		hideAnswers: boolean('hide_answers').notNull().default(false),
		participationDeadline: timestamp('participation_deadline', { withTimezone: true }),
		juryMode: juryModeEnum('jury_mode').notNull(),
		status: betStatusEnum('status').notNull().default('open'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		check(
			'stake_points_has_amount',
			sql`${t.stakeType} <> 'points' OR ${t.stakeAmount} IS NOT NULL`
		),
		check(
			'stake_forfeit_has_desc',
			sql`${t.stakeType} <> 'forfeit' OR ${t.forfeitDescription} IS NOT NULL`
		)
	]
);

// Extension 1:1 for yes/no-specific fields (avoids nullable columns on closest bets).
export const yesnoBets = pgTable('yesno_bets', {
	betId: uuid('bet_id')
		.primaryKey()
		.references(() => bets.id, { onDelete: 'cascade' }),
	choiceA: text('choice_a').notNull(),
	choiceB: text('choice_b').notNull(),
	creatorSide: text('creator_side').notNull(), // 'a' or 'b'
	mode: yesnoModeEnum('mode').notNull(),
	maxOpponents: integer('max_opponents'), // open mode only
	acceptedCount: integer('accepted_count').notNull().default(0)
});

export const betVisibility = pgTable(
	'bet_visibility',
	{
		betId: uuid('bet_id')
			.notNull()
			.references(() => bets.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.betId, t.userId] })]
);

// ─── Negotiation (yes/no only) ────────────────────────────────────────────────

export const propositions = pgTable(
	'propositions',
	{
		id: uuid('id')
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		betId: uuid('bet_id')
			.notNull()
			.references(() => bets.id, { onDelete: 'cascade' }),
		targetId: uuid('target_id')
			.notNull()
			.references(() => profiles.id),
		stakeCreator: numeric('stake_creator', { precision: 12, scale: 2 }),
		stakeTarget: numeric('stake_target', { precision: 12, scale: 2 }),
		forfeitDescription: text('forfeit_description'),
		lastProposerId: uuid('last_proposer_id')
			.notNull()
			.references(() => profiles.id),
		status: propositionStatusEnum('status').notNull().default('negotiating'),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [unique().on(t.betId, t.targetId)]
);

export const propositionOffers = pgTable('proposition_offers', {
	id: uuid('id')
		.primaryKey()
		.default(sql`gen_random_uuid()`),
	propositionId: uuid('proposition_id')
		.notNull()
		.references(() => propositions.id, { onDelete: 'cascade' }),
	authorId: uuid('author_id')
		.notNull()
		.references(() => profiles.id),
	stakeCreator: numeric('stake_creator', { precision: 12, scale: 2 }),
	stakeTarget: numeric('stake_target', { precision: 12, scale: 2 }),
	forfeitDescription: text('forfeit_description'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const propositionJurors = pgTable(
	'proposition_jurors',
	{
		propositionId: uuid('proposition_id')
			.notNull()
			.references(() => propositions.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => profiles.id)
	},
	(t) => [primaryKey({ columns: [t.propositionId, t.userId] })]
);

// ─── Matches (resolution) ─────────────────────────────────────────────────────

export const matches = pgTable('matches', {
	id: uuid('id')
		.primaryKey()
		.default(sql`gen_random_uuid()`),
	betId: uuid('bet_id')
		.notNull()
		.references(() => bets.id, { onDelete: 'cascade' }),
	propositionId: uuid('proposition_id').references(() => propositions.id),
	status: matchStatusEnum('status').notNull().default('open'),
	resolvedAt: timestamp('resolved_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const matchParticipants = pgTable(
	'match_participants',
	{
		matchId: uuid('match_id')
			.notNull()
			.references(() => matches.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => profiles.id),
		answer: text('answer'), // closest: free-text guess
		side: text('side'), // yesno: 'a' or 'b'
		stake: numeric('stake', { precision: 12, scale: 2 }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.matchId, t.userId] })]
);

export const matchJurors = pgTable(
	'match_jurors',
	{
		matchId: uuid('match_id')
			.notNull()
			.references(() => matches.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => profiles.id)
	},
	(t) => [primaryKey({ columns: [t.matchId, t.userId] })]
);

export const juryVotes = pgTable(
	'jury_votes',
	{
		id: uuid('id')
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		matchId: uuid('match_id')
			.notNull()
			.references(() => matches.id, { onDelete: 'cascade' }),
		jurorId: uuid('juror_id')
			.notNull()
			.references(() => profiles.id),
		verdict: jurorVerdictEnum('verdict').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [unique().on(t.matchId, t.jurorId)]
);

export const juryVoteWinners = pgTable(
	'jury_vote_winners',
	{
		voteId: uuid('vote_id')
			.notNull()
			.references(() => juryVotes.id, { onDelete: 'cascade' }),
		winnerUserId: uuid('winner_user_id')
			.notNull()
			.references(() => profiles.id)
	},
	(t) => [primaryKey({ columns: [t.voteId, t.winnerUserId] })]
);

export const matchCancellations = pgTable(
	'match_cancellations',
	{
		matchId: uuid('match_id')
			.notNull()
			.references(() => matches.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => profiles.id),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.matchId, t.userId] })]
);

export const matchWinners = pgTable(
	'match_winners',
	{
		matchId: uuid('match_id')
			.notNull()
			.references(() => matches.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => profiles.id),
		share: numeric('share', { precision: 12, scale: 2 })
	},
	(t) => [primaryKey({ columns: [t.matchId, t.userId] })]
);

// ─── Ledger & Forfeits ────────────────────────────────────────────────────────

export const ledgerEntries = pgTable('ledger_entries', {
	id: uuid('id')
		.primaryKey()
		.default(sql`gen_random_uuid()`),
	groupId: uuid('group_id')
		.notNull()
		.references(() => groups.id, { onDelete: 'cascade' }),
	matchId: uuid('match_id').references(() => matches.id, { onDelete: 'set null' }),
	debtorId: uuid('debtor_id')
		.notNull()
		.references(() => profiles.id),
	creditorId: uuid('creditor_id')
		.notNull()
		.references(() => profiles.id),
	amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
	settled: boolean('settled').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const forfeits = pgTable('forfeits', {
	id: uuid('id')
		.primaryKey()
		.default(sql`gen_random_uuid()`),
	matchId: uuid('match_id')
		.notNull()
		.references(() => matches.id, { onDelete: 'cascade' }),
	debtorId: uuid('debtor_id')
		.notNull()
		.references(() => profiles.id),
	status: forfeitStatusEnum('status').notNull().default('pending'),
	proofUrl: text('proof_url'),
	confirmedBy: uuid('confirmed_by').references(() => profiles.id),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ─── Notifications ────────────────────────────────────────────────────────────

export const notifications = pgTable('notifications', {
	id: uuid('id')
		.primaryKey()
		.default(sql`gen_random_uuid()`),
	userId: uuid('user_id')
		.notNull()
		.references(() => profiles.id, { onDelete: 'cascade' }),
	type: text('type').notNull(),
	payload: text('payload'), // JSON stored as text (use JSON.parse/stringify)
	readAt: timestamp('read_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ─── Analytics (test sink — écrite uniquement quand ANALYTICS_TEST_SINK=db) ───

export const analyticsEventsTest = pgTable('analytics_events_test', {
	id: uuid('id')
		.primaryKey()
		.default(sql`gen_random_uuid()`),
	distinctId: text('distinct_id').notNull(),
	event: text('event').notNull(),
	properties: jsonb('properties').notNull().default(sql`'{}'::jsonb`),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
