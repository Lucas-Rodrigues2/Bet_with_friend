import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

export interface ActivityEvent {
	id: string;
	type:
		| 'member_joined'
		| 'bet_created'
		| 'match_accepted'
		| 'match_resolved'
		| 'match_cancelled'
		| 'forfeit_confirmed';
	date: Date;
	label: string;
	link: string;
	metadata?: Record<string, string>;
}

export interface ActivityResult {
	events: ActivityEvent[];
	hasMore: boolean;
}

/**
 * Returns a paginated list of activity events for a group, respecting bet visibility.
 * Uses raw SQL UNION ALL across 6 event sources, ordered antichronologically.
 */
export async function getGroupActivity(
	groupId: string,
	userId: string,
	options: { limit?: number; offset?: number } = {}
): Promise<ActivityResult> {
	const limit = options.limit ?? 20;
	const offset = options.offset ?? 0;

	const rawResult = await db.execute(sql`
		SELECT * FROM (
			-- member_joined
			SELECT
				gm.joined_at AS date,
				'member_joined' AS type,
				gm.user_id AS user_id,
				p.pseudo AS user_pseudo,
				NULL::uuid AS bet_id,
				NULL::text AS bet_title,
				NULL::uuid AS other_user_id,
				NULL::text AS other_pseudo
			FROM group_members gm
			JOIN profiles p ON p.id = gm.user_id
			WHERE gm.group_id = ${groupId} AND gm.removed_at IS NULL

			UNION ALL

			-- bet_created
			SELECT
				b.created_at AS date,
				'bet_created' AS type,
				b.creator_id AS user_id,
				p.pseudo AS user_pseudo,
				b.id AS bet_id,
				b.title AS bet_title,
				NULL::uuid AS other_user_id,
				NULL::text AS other_pseudo
			FROM bets b
			JOIN profiles p ON p.id = b.creator_id
			WHERE b.group_id = ${groupId}
			AND (b.id IN (SELECT bet_id FROM bet_visibility WHERE user_id = ${userId}))

			UNION ALL

			-- match_accepted (yesno: someone accepted a duel or open challenge)
			SELECT
				m.created_at AS date,
				'match_accepted' AS type,
				acceptor.user_id AS user_id,
				acceptor_p.pseudo AS user_pseudo,
				b.id AS bet_id,
				b.title AS bet_title,
				b.creator_id AS other_user_id,
				creator_p.pseudo AS other_pseudo
			FROM matches m
			JOIN bets b ON b.id = m.bet_id
			JOIN match_participants acceptor ON acceptor.match_id = m.id AND acceptor.user_id != b.creator_id
			JOIN profiles acceptor_p ON acceptor_p.id = acceptor.user_id
			JOIN profiles creator_p ON creator_p.id = b.creator_id
			WHERE b.group_id = ${groupId}
			AND (b.id IN (SELECT bet_id FROM bet_visibility WHERE user_id = ${userId}))
			AND b.type = 'yesno'

			UNION ALL

			-- match_resolved (one event per winner)
			SELECT
				m.resolved_at AS date,
				'match_resolved' AS type,
				mw.user_id AS user_id,
				p.pseudo AS user_pseudo,
				b.id AS bet_id,
				b.title AS bet_title,
				NULL::uuid AS other_user_id,
				NULL::text AS other_pseudo
			FROM matches m
			JOIN match_winners mw ON mw.match_id = m.id
			JOIN bets b ON b.id = m.bet_id
			JOIN profiles p ON p.id = mw.user_id
			WHERE b.group_id = ${groupId} AND m.status = 'resolved' AND m.resolved_at IS NOT NULL
			AND (b.id IN (SELECT bet_id FROM bet_visibility WHERE user_id = ${userId}))

			UNION ALL

			-- match_cancelled
			SELECT
				(SELECT MIN(mc.created_at) FROM match_cancellations mc WHERE mc.match_id = m.id) AS date,
				'match_cancelled' AS type,
				NULL::uuid AS user_id,
				NULL::text AS user_pseudo,
				b.id AS bet_id,
				b.title AS bet_title,
				NULL::uuid AS other_user_id,
				NULL::text AS other_pseudo
			FROM matches m
			JOIN bets b ON b.id = m.bet_id
			WHERE b.group_id = ${groupId} AND m.status = 'cancelled'
			AND (b.id IN (SELECT bet_id FROM bet_visibility WHERE user_id = ${userId}))

			UNION ALL

			-- forfeit_confirmed (forfeit status = 'done' and confirmed_by is set)
			SELECT
				f.claimed_at AS date,
				'forfeit_confirmed' AS type,
				f.debtor_id AS user_id,
				p.pseudo AS user_pseudo,
				b.id AS bet_id,
				b.title AS bet_title,
				NULL::uuid AS other_user_id,
				NULL::text AS other_pseudo
			FROM forfeits f
			JOIN matches m ON m.id = f.match_id
			JOIN bets b ON b.id = m.bet_id
			JOIN profiles p ON p.id = f.debtor_id
			WHERE b.group_id = ${groupId} AND f.status = 'done' AND f.confirmed_by IS NOT NULL
			AND (b.id IN (SELECT bet_id FROM bet_visibility WHERE user_id = ${userId}))
		) AS events
		WHERE date IS NOT NULL
		ORDER BY date DESC
		LIMIT ${limit + 1}
		OFFSET ${offset}
	`);

	const result = rawResult as unknown as Array<{
		date: Date;
		type: string;
		user_id: string | null;
		user_pseudo: string | null;
		bet_id: string | null;
		bet_title: string | null;
		other_user_id: string | null;
		other_pseudo: string | null;
	}>;
	const rows = result ?? [];
	const hasMore = rows.length > limit;
	const eventRows = hasMore ? rows.slice(0, limit) : rows;

	const events: ActivityEvent[] = [];
	for (const row of eventRows) {
		const link = row.bet_id
			? `/app/groups/${groupId}/bets/${row.bet_id}`
			: `/app/groups/${groupId}/members`;

		const metadata: Record<string, string> = {};
		if (row.bet_id) metadata.betId = row.bet_id;
		if (row.bet_title) metadata.betTitle = row.bet_title;
		if (row.other_user_id) metadata.otherUserId = row.other_user_id;
		if (row.other_pseudo) metadata.otherPseudo = row.other_pseudo;

		const id = `${row.type}:${row.date instanceof Date ? row.date.getTime() : String(row.date)}:${row.user_id ?? ''}:${row.bet_id ?? ''}`;

		let label: string;
		switch (row.type) {
			case 'member_joined':
				label = `${row.user_pseudo} a rejoint le groupe`;
				break;
			case 'bet_created':
				label = `${row.user_pseudo} a créé le pari « ${row.bet_title} »`;
				break;
			case 'match_accepted':
				label = `${row.user_pseudo} a accepté le duel de ${row.other_pseudo}`;
				break;
			case 'match_resolved':
				label = `${row.user_pseudo} a gagné le pari « ${row.bet_title} »`;
				break;
			case 'match_cancelled':
				label = `Pari « ${row.bet_title} » annulé`;
				break;
			case 'forfeit_confirmed':
				label = `${row.user_pseudo} a accompli son gage`;
				break;
			default:
				label = 'Événement inconnu';
		}

		events.push({
			id,
			type: row.type as ActivityEvent['type'],
			date: row.date,
			label,
			link,
			...(Object.keys(metadata).length > 0 ? { metadata } : {})
		});
	}

	return { events, hasMore };
}
