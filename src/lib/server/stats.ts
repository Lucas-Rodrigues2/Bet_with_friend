import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

export type LeaderboardPeriod = 'all' | '30d';

export interface LeaderboardRow {
	userId: string;
	pseudo: string;
	avatarUrl: string | null;
	isRemoved: boolean;
	netGains: number;
	played: number;
	won: number;
	winRate: number;
	forfeitsDone: number;
}

export interface LeaderboardResult {
	rows: LeaderboardRow[];
	hasResolvedMatches: boolean;
}

/**
 * Calcule le classement d'un groupe : gains nets cumulés (ledger créditeur −
 * débiteur, réglé ou non), paris joués, gagnés, % victoire, gages accomplis.
 *
 * Ne compte que les matchs `resolved` visibles par l'utilisateur (bet_visibility).
 * Inclut les membres soft-deleted ayant un historique (is_removed = true).
 *
 * @param period 'all' = tout temps, '30d' = 30 derniers jours (filtre sur
 *   ledger_entries.created_at pour les gains, matches.resolved_at pour les
 *   paris joués/gagnés et les gages).
 */
export async function getGroupLeaderboard(
	groupId: string,
	userId: string,
	options: { period?: LeaderboardPeriod } = {}
): Promise<LeaderboardResult> {
	const period = options.period ?? 'all';
	const dateFilter = period === '30d' ? sql`>= NOW() - INTERVAL '30 days'` : sql`IS NOT NULL`;

	// Note: every bet-scoped sub-aggregate filters on bet_visibility for the
	// viewing user, so members never see stats from paris they can't see.
	const raw = await db.execute(sql`
		WITH
		members AS (
			SELECT
				gm.user_id,
				p.pseudo,
				p.avatar_url,
				(gm.removed_at IS NOT NULL) AS is_removed
			FROM group_members gm
			JOIN profiles p ON p.id = gm.user_id
			WHERE gm.group_id = ${groupId}
		),
		ledger_net AS (
			SELECT
				u.user_id,
				SUM(u.delta)::float AS net
			FROM (
				SELECT
					le.creditor_id AS user_id,
					le.amount::float AS delta,
					le.created_at
				FROM ledger_entries le
				JOIN matches m ON m.id = le.match_id
				JOIN bets b ON b.id = m.bet_id
				WHERE le.group_id = ${groupId}
				AND (b.id IN (SELECT bet_id FROM bet_visibility WHERE user_id = ${userId}))
				UNION ALL
				SELECT
					le.debtor_id AS user_id,
					-(le.amount)::float AS delta,
					le.created_at
				FROM ledger_entries le
				JOIN matches m ON m.id = le.match_id
				JOIN bets b ON b.id = m.bet_id
				WHERE le.group_id = ${groupId}
				AND (b.id IN (SELECT bet_id FROM bet_visibility WHERE user_id = ${userId}))
			) u
			WHERE u.created_at ${dateFilter}
			GROUP BY u.user_id
		),
		played AS (
			SELECT
				mp.user_id,
				COUNT(DISTINCT m.id) AS played
			FROM match_participants mp
			JOIN matches m ON m.id = mp.match_id
			JOIN bets b ON b.id = m.bet_id
			WHERE b.group_id = ${groupId}
			AND m.status = 'resolved'
			AND m.resolved_at ${dateFilter}
			AND (b.id IN (SELECT bet_id FROM bet_visibility WHERE user_id = ${userId}))
			GROUP BY mp.user_id
		),
		won AS (
			SELECT
				mw.user_id,
				COUNT(DISTINCT m.id) AS won
			FROM match_winners mw
			JOIN matches m ON m.id = mw.match_id
			JOIN bets b ON b.id = m.bet_id
			WHERE b.group_id = ${groupId}
			AND m.status = 'resolved'
			AND m.resolved_at ${dateFilter}
			AND (b.id IN (SELECT bet_id FROM bet_visibility WHERE user_id = ${userId}))
			GROUP BY mw.user_id
		),
		forfeits_done AS (
			SELECT
				f.debtor_id AS user_id,
				COUNT(*) AS done
			FROM forfeits f
			JOIN matches m ON m.id = f.match_id
			JOIN bets b ON b.id = m.bet_id
			WHERE b.group_id = ${groupId}
			AND f.status = 'done'
			AND f.confirmed_by IS NOT NULL
			AND m.resolved_at ${dateFilter}
			AND (b.id IN (SELECT bet_id FROM bet_visibility WHERE user_id = ${userId}))
			GROUP BY f.debtor_id
		),
		resolved_match_count AS (
			SELECT COUNT(*) AS c
			FROM matches m
			JOIN bets b ON b.id = m.bet_id
			WHERE b.group_id = ${groupId}
			AND m.status = 'resolved'
			AND (b.id IN (SELECT bet_id FROM bet_visibility WHERE user_id = ${userId}))
		)
		SELECT
			m.user_id::text      AS user_id,
			m.pseudo              AS pseudo,
			m.avatar_url          AS avatar_url,
			m.is_removed          AS is_removed,
			COALESCE(ln.net, 0)   AS net_gains,
			COALESCE(p.played, 0) AS played,
			COALESCE(w.won, 0)    AS won,
			COALESCE(fd.done, 0)  AS forfeits_done,
			rmc.c                 AS resolved_count
		FROM members m
		LEFT JOIN ledger_net ln ON ln.user_id = m.user_id
		LEFT JOIN played p ON p.user_id = m.user_id
		LEFT JOIN won w ON w.user_id = m.user_id
		LEFT JOIN forfeits_done fd ON fd.user_id = m.user_id
		CROSS JOIN resolved_match_count rmc
		WHERE
			-- Active members always shown; soft-deleted only if they have history.
			m.is_removed = false
			OR ln.net IS NOT NULL
			OR p.played IS NOT NULL
			OR w.won IS NOT NULL
			OR fd.done IS NOT NULL
		ORDER BY net_gains DESC, won DESC, played DESC, m.pseudo ASC
	`);

	const result = (raw as Record<string, unknown>[]) ?? [];
	const hasResolvedMatches = result.length > 0 ? Number(result[0].resolved_count) > 0 : false;

	const rows: LeaderboardRow[] = result.map((row) => {
		const played = Number(row.played);
		const won = Number(row.won);
		return {
			userId: String(row.user_id),
			pseudo: String(row.pseudo),
			avatarUrl: row.avatar_url === null ? null : String(row.avatar_url),
			isRemoved: Boolean(row.is_removed),
			netGains: Number(row.net_gains),
			played,
			won,
			winRate: played > 0 ? Math.round((won / played) * 100) : 0,
			forfeitsDone: Number(row.forfeits_done)
		};
	});

	return { rows, hasResolvedMatches };
}
