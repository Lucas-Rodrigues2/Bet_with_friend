import { db } from '$lib/server/db/index';
import { ledgerEntries } from '$lib/server/db/schema';
import { and, eq, sql } from 'drizzle-orm';

export interface PairBalance {
	debtorId: string;
	debtorPseudo: string;
	creditorId: string;
	creditorPseudo: string;
	netAmount: number;
}

export interface EntryWithBet {
	id: string;
	matchId: string | null;
	betId: string | null;
	betTitle: string | null;
	debtorId: string;
	creditorId: string;
	amount: number;
	settled: boolean;
	createdAt: string; // ISO string for serialization
}

/**
 * Returns all active (unsettled) net pair balances for a group.
 * Uses SQL GROUP BY with LEAST/GREATEST pair ordering to net cross-debts.
 * Positive net_amount after netting means pair_lower owes pair_upper.
 */
export async function getActivePairBalances(groupId: string): Promise<PairBalance[]> {
	const rows = await db.execute(sql`
    WITH pair_nets AS (
      SELECT
        LEAST(debtor_id, creditor_id)   AS pair_lower,
        GREATEST(debtor_id, creditor_id) AS pair_upper,
        SUM(
          CASE WHEN debtor_id < creditor_id THEN amount ELSE -amount END
        )::float AS net_amount
      FROM ledger_entries
      WHERE group_id = ${groupId} AND settled = false
      GROUP BY LEAST(debtor_id, creditor_id), GREATEST(debtor_id, creditor_id)
      HAVING SUM(
        CASE WHEN debtor_id < creditor_id THEN amount ELSE -amount END
      ) != 0
    )
    SELECT
      pn.pair_lower::text  AS pair_lower,
      pn.pair_upper::text  AS pair_upper,
      pn.net_amount,
      pl.pseudo            AS lower_pseudo,
      pu.pseudo            AS upper_pseudo
    FROM pair_nets pn
    JOIN profiles pl ON pl.id = pn.pair_lower
    JOIN profiles pu ON pu.id = pn.pair_upper
    ORDER BY ABS(pn.net_amount) DESC
  `);

	return (rows as Record<string, unknown>[]).map((row) => {
		const netAmount = Number(row.net_amount);
		if (netAmount > 0) {
			// pair_lower is net debtor
			return {
				debtorId: row.pair_lower as string,
				debtorPseudo: row.lower_pseudo as string,
				creditorId: row.pair_upper as string,
				creditorPseudo: row.upper_pseudo as string,
				netAmount
			};
		} else {
			// pair_upper is net debtor
			return {
				debtorId: row.pair_upper as string,
				debtorPseudo: row.upper_pseudo as string,
				creditorId: row.pair_lower as string,
				creditorPseudo: row.lower_pseudo as string,
				netAmount: Math.abs(netAmount)
			};
		}
	});
}

/**
 * Returns the total net balance for a user in a group (raw sum, equivalent to netted pairs).
 * Positive = user is owed overall (net creditor).
 * Negative = user owes overall (net debtor).
 */
export async function getMyNetBalance(groupId: string, userId: string): Promise<number> {
	const rows = await db.execute(sql`
    SELECT SUM(
      CASE WHEN creditor_id = ${userId}::uuid THEN amount ELSE -amount END
    )::float AS net_balance
    FROM ledger_entries
    WHERE group_id = ${groupId}
      AND settled = false
      AND (debtor_id = ${userId}::uuid OR creditor_id = ${userId}::uuid)
  `);

	return Number((rows as Record<string, unknown>[])[0]?.net_balance ?? 0);
}

/**
 * Returns all unsettled ledger entries involving a user in a group,
 * with bet title information (via match → bet join).
 */
export async function getMyEntriesWithBets(
	groupId: string,
	userId: string
): Promise<EntryWithBet[]> {
	const rows = await db.execute(sql`
    SELECT
      le.id::text           AS id,
      le.match_id::text     AS match_id,
      le.debtor_id::text    AS debtor_id,
      le.creditor_id::text  AS creditor_id,
      le.amount::float      AS amount,
      le.settled,
      le.created_at,
      b.id::text            AS bet_id,
      b.title               AS bet_title
    FROM ledger_entries le
    LEFT JOIN matches m ON m.id = le.match_id
    LEFT JOIN bets b    ON b.id = m.bet_id
    WHERE le.group_id = ${groupId}
      AND le.settled = false
      AND (le.debtor_id = ${userId}::uuid OR le.creditor_id = ${userId}::uuid)
    ORDER BY le.created_at ASC
  `);

	return (rows as Record<string, unknown>[]).map((row) => ({
		id: row.id as string,
		matchId: (row.match_id as string | null) ?? null,
		betId: (row.bet_id as string | null) ?? null,
		betTitle: (row.bet_title as string | null) ?? null,
		debtorId: row.debtor_id as string,
		creditorId: row.creditor_id as string,
		amount: Number(row.amount),
		settled: row.settled as boolean,
		createdAt:
			row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
	}));
}

/**
 * Returns pairs that have settled entries in a group (historical view).
 * Shows the net of all settled entries per pair.
 */
export async function getSettledPairSummaries(groupId: string): Promise<PairBalance[]> {
	const rows = await db.execute(sql`
    WITH pair_stats AS (
      SELECT
        LEAST(debtor_id, creditor_id)   AS pair_lower,
        GREATEST(debtor_id, creditor_id) AS pair_upper,
        SUM(
          CASE WHEN settled = true AND debtor_id < creditor_id THEN amount
               WHEN settled = true                              THEN -amount
               ELSE 0 END
        )::float AS settled_net
      FROM ledger_entries
      WHERE group_id = ${groupId}
      GROUP BY LEAST(debtor_id, creditor_id), GREATEST(debtor_id, creditor_id)
    )
    SELECT
      ps.pair_lower::text  AS pair_lower,
      ps.pair_upper::text  AS pair_upper,
      ps.settled_net,
      pl.pseudo            AS lower_pseudo,
      pu.pseudo            AS upper_pseudo
    FROM pair_stats ps
    JOIN profiles pl ON pl.id = ps.pair_lower
    JOIN profiles pu ON pu.id = ps.pair_upper
    WHERE ps.settled_net != 0
    ORDER BY ABS(ps.settled_net) DESC
  `);

	return (rows as Record<string, unknown>[]).map((row) => {
		const settledNet = Number(row.settled_net);
		if (settledNet > 0) {
			return {
				debtorId: row.pair_lower as string,
				debtorPseudo: row.lower_pseudo as string,
				creditorId: row.pair_upper as string,
				creditorPseudo: row.upper_pseudo as string,
				netAmount: settledNet
			};
		} else {
			return {
				debtorId: row.pair_upper as string,
				debtorPseudo: row.upper_pseudo as string,
				creditorId: row.pair_lower as string,
				creditorPseudo: row.lower_pseudo as string,
				netAmount: Math.abs(settledNet)
			};
		}
	});
}

/**
 * Marks all unsettled ledger entries between two users as settled.
 * Only the net creditor (the person who is owed net) can settle.
 * Settles entries in BOTH directions (required when cross-debts exist).
 */
export async function settlePair(params: {
	groupId: string;
	debtorId: string;
	creditorId: string;
	actorId: string;
}): Promise<{ error?: string }> {
	const { groupId, debtorId, creditorId, actorId } = params;

	// Only the net creditor may settle
	if (actorId !== creditorId) {
		return { error: 'Seul le créancier peut marquer une dette comme réglée.' };
	}

	// Verify the pair has an actual net debt from debtorId → creditorId
	const checkRows = await db.execute(sql`
    SELECT SUM(
      CASE WHEN debtor_id = ${debtorId}::uuid AND creditor_id = ${creditorId}::uuid THEN amount
           WHEN debtor_id = ${creditorId}::uuid AND creditor_id = ${debtorId}::uuid THEN -amount
           ELSE 0 END
    )::float AS net_amount
    FROM ledger_entries
    WHERE group_id = ${groupId}
      AND settled = false
      AND (
        (debtor_id = ${debtorId}::uuid AND creditor_id = ${creditorId}::uuid) OR
        (debtor_id = ${creditorId}::uuid AND creditor_id = ${debtorId}::uuid)
      )
  `);

	const netAmount = Number((checkRows as Record<string, unknown>[])[0]?.net_amount ?? 0);

	if (netAmount <= 0) {
		return { error: "Cette dette n'existe pas ou est déjà réglée." };
	}

	// Settle ALL unsettled entries between this pair (both directions)
	await db.transaction(async (tx) => {
		await tx
			.update(ledgerEntries)
			.set({ settled: true })
			.where(
				and(
					eq(ledgerEntries.groupId, groupId),
					eq(ledgerEntries.debtorId, debtorId),
					eq(ledgerEntries.creditorId, creditorId),
					eq(ledgerEntries.settled, false)
				)
			);

		// Also settle cross-direction entries (if any)
		await tx
			.update(ledgerEntries)
			.set({ settled: true })
			.where(
				and(
					eq(ledgerEntries.groupId, groupId),
					eq(ledgerEntries.debtorId, creditorId),
					eq(ledgerEntries.creditorId, debtorId),
					eq(ledgerEntries.settled, false)
				)
			);
	});

	return {};
}
