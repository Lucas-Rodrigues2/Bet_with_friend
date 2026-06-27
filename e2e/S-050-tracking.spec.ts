/**
 * S-050 — Tracking PostHog : Ardoise (soldes, règlements)
 *
 * Events instrumentés :
 *   Client :
 *     - ledger_viewed  { group_id }
 *       — émis via $effect au montage de la page ardoise
 *
 *   Serveur :
 *     - ledger_pair_settled  { group_id, debtor_id, creditor_id }
 *       — émis dans l'action settle après règlement réussi
 *
 * Stratégie :
 *   - Client : interceptPosthog(page) via __playwright_trackSpy
 *   - Serveur : sink DB (ANALYTICS_TEST_SINK=db) — readServerEvents(db, { event })
 *
 * Chaque test est indépendant : clearServerEvents() en début + afterEach cleanup.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { interceptPosthog, readServerEvents, clearServerEvents } from './helpers/analytics';

// User IDs from seed.sql
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTestGroup(name: string): Promise<string> {
	const [row] = await db`
    INSERT INTO groups (name, currency, creator_id)
    VALUES (${name}, 'EUR', ${ALICE_ID})
    RETURNING id
  `;
	await db`
    INSERT INTO group_members (group_id, user_id, role)
    VALUES
      (${row.id}, ${ALICE_ID}, 'admin'),
      (${row.id}, ${BOB_ID}, 'member')
  `;
	return row.id;
}

async function createLedgerEntry(
	groupId: string,
	debtorId: string,
	creditorId: string,
	amount: number
): Promise<void> {
	await db`
    INSERT INTO ledger_entries (group_id, debtor_id, creditor_id, amount)
    VALUES (${groupId}, ${debtorId}, ${creditorId}, ${amount})
  `;
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

test.afterEach(async () => {
	await db`DELETE FROM public.groups WHERE name LIKE '[E2E-tracking-050]%'`;
	await clearServerEvents(db);
});

// ─── Event client : ledger_viewed ────────────────────────────────────────────

test('[tracking] ledger_viewed — émis au montage de la page ardoise', async ({ browser }) => {
	const groupId = await createTestGroup('[E2E-tracking-050] ledger_viewed');

	// interceptPosthog AVANT login et navigation (exposeFunction doit être enregistrée avant)
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(alicePage);
	await exposeSpyPromise;

	await clearServerEvents(db);

	await login(alicePage, 'alice');
	await alicePage.goto(`/app/groups/${groupId}/ledger`);
	await alicePage.waitForLoadState('networkidle');

	// Attendre l'hydratation Svelte 5 et le déclenchement de $effect
	await alicePage.waitForTimeout(500);

	const capturedEvents = getCapturedEvents();
	const ledgerEvents = capturedEvents.filter((e) => e.event === 'ledger_viewed');

	expect(ledgerEvents.length).toBeGreaterThanOrEqual(1);
	expect(ledgerEvents[0].properties).toMatchObject({ group_id: groupId });

	await aliceCtx.close();
});

// ─── Event serveur : ledger_pair_settled ─────────────────────────────────────

test('[tracking] ledger_pair_settled — émis après règlement par la créancière (Alice)', async ({
	browser
}) => {
	const groupId = await createTestGroup('[E2E-tracking-050] ledger_pair_settled');

	// Bob doit 5 EUR à Alice
	await createLedgerEntry(groupId, BOB_ID, ALICE_ID, 5);

	await clearServerEvents(db);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`/app/groups/${groupId}/ledger`);
	await alicePage.waitForLoadState('networkidle');

	// Alice clique "Marquer réglé"
	const [response] = await Promise.all([
		alicePage.waitForResponse(
			(r) => r.url().includes('/ledger') && r.request().method() === 'POST'
		),
		alicePage.getByTestId('settle-btn').click()
	]);
	expect(response.status()).toBe(200);
	await alicePage.waitForLoadState('networkidle');

	// Vérifier l'event serveur dans le sink DB
	const events = await readServerEvents(db, { event: 'ledger_pair_settled' });
	expect(events).toHaveLength(1);

	const ev = events[0];
	expect(ev.distinct_id).toBe(ALICE_ID);
	expect(ev.event).toBe('ledger_pair_settled');
	expect(ev.properties).toMatchObject({
		group_id: groupId,
		debtor_id: BOB_ID,
		creditor_id: ALICE_ID
	});

	await aliceCtx.close();
});

test('[tracking] ledger_pair_settled — distinct_id = créancier qui règle (Alice, pas Bob)', async ({
	browser
}) => {
	const groupId = await createTestGroup('[E2E-tracking-050] ledger_pair_settled distinct_id');

	// Bob doit 8 EUR à Alice
	await createLedgerEntry(groupId, BOB_ID, ALICE_ID, 8);

	await clearServerEvents(db);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`/app/groups/${groupId}/ledger`);
	await alicePage.waitForLoadState('networkidle');

	// Alice règle
	await Promise.all([
		alicePage.waitForResponse(
			(r) => r.url().includes('/ledger') && r.request().method() === 'POST'
		),
		alicePage.getByTestId('settle-btn').click()
	]);
	await alicePage.waitForLoadState('networkidle');

	// distinct_id doit être Alice (la créancière qui a cliqué)
	const aliceEvents = await readServerEvents(db, {
		event: 'ledger_pair_settled',
		distinctId: ALICE_ID
	});
	expect(aliceEvents).toHaveLength(1);
	expect(aliceEvents[0].properties.group_id).toBe(groupId);

	// Aucun event pour Bob
	const bobEvents = await readServerEvents(db, {
		event: 'ledger_pair_settled',
		distinctId: BOB_ID
	});
	expect(bobEvents).toHaveLength(0);

	await aliceCtx.close();
});
