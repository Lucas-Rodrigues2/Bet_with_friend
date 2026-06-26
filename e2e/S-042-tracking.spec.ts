/**
 * S-042 — Tracking PostHog : Annulation unanime
 *
 * Events instrumentés (serveur uniquement) :
 *   - match_cancellation_requested  { match_id, bet_id, group_id, bet_type,
 *                                     cancellation_count, participant_count }
 *     émis dans request_cancellation quand l'unanimité n'est PAS atteinte
 *
 *   - match_cancelled_unanimously   { match_id, bet_id, group_id, bet_type,
 *                                     participant_count }
 *     émis dans request_cancellation quand l'unanimité EST atteinte
 *
 *   - match_cancellation_withdrawn  { match_id, bet_id, group_id }
 *     émis dans withdraw_cancellation après suppression
 *
 * Stratégie : sink DB (ANALYTICS_TEST_SINK=db) — readServerEvents(db, { event }).
 * Chaque test est indépendant : clearServerEvents() en début + afterEach cleanup.
 */

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { readServerEvents, clearServerEvents } from './helpers/analytics';

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;

// User IDs from seed.sql
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const DAVE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a yesno duel in open status (Alice vs Bob, Carol juror).
 */
async function createYesnoDuelOpen(opts: {
	title: string;
	matchStatus?: 'open' | 'judging';
}): Promise<{ betId: string; matchId: string }> {
	const { title, matchStatus = 'open' } = opts;

	const [betRow] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount,
                      hide_answers, jury_mode, status)
    VALUES (
      ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'yesno', ${title},
      'points', 10, false, 'majority', 'open'
    )
    RETURNING id
  `;

	await db`
    INSERT INTO yesno_bets (bet_id, mode, creator_side, choice_a, choice_b, accepted_count, max_opponents)
    VALUES (${betRow.id}, 'duel', 'a', 'Oui', 'Non', 1, 1)
  `;

	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    SELECT ${betRow.id}, unnest(ARRAY[${ALICE_ID}, ${BOB_ID}]::uuid[])
  `;

	await db`
    INSERT INTO propositions (bet_id, target_id, last_proposer_id, stake_creator, stake_target, status)
    VALUES (${betRow.id}, ${BOB_ID}, ${BOB_ID}, 10, 5, 'accepted')
  `;

	const [matchRow] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${betRow.id}, ${matchStatus}) RETURNING id
  `;

	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${matchRow.id}, ${CAROL_ID})`;

	await db`
    INSERT INTO match_participants (match_id, user_id, side, stake)
    VALUES (${matchRow.id}, ${ALICE_ID}, 'a', 10),
           (${matchRow.id}, ${BOB_ID}, 'b', 5)
  `;

	return { betId: betRow.id, matchId: matchRow.id };
}

/**
 * Creates a closest bet with 3 participants in open match.
 * Alice, Bob, Dave participate. Carol is juror.
 */
async function createClosestOpen3Players(opts: {
	title: string;
}): Promise<{ betId: string; matchId: string }> {
	const { title } = opts;

	const [betRow] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount,
                      hide_answers, jury_mode, status)
    VALUES (
      ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', ${title},
      'points', 10, false, 'majority', 'open'
    )
    RETURNING id
  `;

	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    SELECT ${betRow.id}, unnest(ARRAY[${ALICE_ID}, ${BOB_ID}, ${CAROL_ID}, ${DAVE_ID}]::uuid[])
  `;

	const [matchRow] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${betRow.id}, 'open') RETURNING id
  `;

	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${matchRow.id}, ${CAROL_ID})`;

	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchRow.id}, ${ALICE_ID}, '42', 10),
           (${matchRow.id}, ${BOB_ID}, '100', 10),
           (${matchRow.id}, ${DAVE_ID}, '75', 10)
  `;

	return { betId: betRow.id, matchId: matchRow.id };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

test.afterEach(async () => {
	await db`DELETE FROM public.bets WHERE title LIKE '[E2E-tracking-042]%'`;
	await clearServerEvents(db);
});

// ─── Event serveur : match_cancellation_requested (duel, 1er demandeur) ───────

test('[tracking] match_cancellation_requested — yesno, Alice 1re demande sur 2', async ({
	browser
}) => {
	const { betId, matchId } = await createYesnoDuelOpen({
		title: '[E2E-tracking-042] cancellation_requested yesno 1of2'
	});

	await clearServerEvents(db);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage.waitForLoadState('networkidle');

	// Alice demande l'annulation (1re sur 2 → pas unanime)
	const [response] = await Promise.all([
		alicePage.waitForResponse(
			(r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		alicePage.getByTestId('request-cancellation-btn').click()
	]);
	expect(response.status()).toBe(200);
	await alicePage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await alicePage.waitForLoadState('networkidle');

	// Vérifier event match_cancellation_requested
	const events = await readServerEvents(db, { event: 'match_cancellation_requested' });
	expect(events).toHaveLength(1);

	const ev = events[0];
	expect(ev.distinct_id).toBe(ALICE_ID);
	expect(ev.event).toBe('match_cancellation_requested');
	expect(ev.properties).toMatchObject({
		match_id: matchId,
		bet_id: betId,
		group_id: SEEDED_GROUP_ID,
		bet_type: 'yesno',
		cancellation_count: 1,
		participant_count: 2
	});

	// Aucun event match_cancelled_unanimously ne doit être émis (pas encore unanime)
	const unanimousEvents = await readServerEvents(db, { event: 'match_cancelled_unanimously' });
	expect(unanimousEvents).toHaveLength(0);

	await aliceCtx.close();
});

// ─── Event serveur : match_cancelled_unanimously (duel, 2e demandeur = dernier) ─

test('[tracking] match_cancelled_unanimously — yesno, Bob = dernier demandeur', async ({
	browser
}) => {
	const { betId, matchId } = await createYesnoDuelOpen({
		title: '[E2E-tracking-042] cancelled_unanimously yesno bob_last'
	});

	// Alice a déjà demandé l'annulation (1/2)
	await db`
    INSERT INTO match_cancellations (match_id, user_id) VALUES (${matchId}, ${ALICE_ID})
    ON CONFLICT DO NOTHING
  `;

	await clearServerEvents(db);

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);
	await bobPage.waitForLoadState('networkidle');

	// Bob demande l'annulation → unanimité atteinte
	const [response] = await Promise.all([
		bobPage.waitForResponse(
			(r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		bobPage.getByTestId('request-cancellation-btn').click()
	]);
	expect(response.status()).toBe(200);
	await bobPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await bobPage.waitForLoadState('networkidle');

	// Vérifier event match_cancelled_unanimously
	const unanimousEvents = await readServerEvents(db, { event: 'match_cancelled_unanimously' });
	expect(unanimousEvents).toHaveLength(1);

	const ev = unanimousEvents[0];
	expect(ev.distinct_id).toBe(BOB_ID);
	expect(ev.event).toBe('match_cancelled_unanimously');
	expect(ev.properties).toMatchObject({
		match_id: matchId,
		bet_id: betId,
		group_id: SEEDED_GROUP_ID,
		bet_type: 'yesno',
		participant_count: 2
	});

	// Aucun event match_cancellation_requested ne doit être émis (unanimité atteinte = autre event)
	const requestedEvents = await readServerEvents(db, { event: 'match_cancellation_requested' });
	expect(requestedEvents).toHaveLength(0);

	// DB : match passé à 'cancelled'
	const [matchRow] = await db`SELECT status FROM matches WHERE id = ${matchId}`;
	expect(matchRow.status).toBe('cancelled');

	await bobCtx.close();
});

// ─── Event serveur : match_cancellation_withdrawn ────────────────────────────

test('[tracking] match_cancellation_withdrawn — Alice retire sa demande', async ({ browser }) => {
	const { betId, matchId } = await createYesnoDuelOpen({
		title: '[E2E-tracking-042] cancellation_withdrawn alice'
	});

	// Alice a déjà demandé l'annulation
	await db`
    INSERT INTO match_cancellations (match_id, user_id) VALUES (${matchId}, ${ALICE_ID})
    ON CONFLICT DO NOTHING
  `;

	await clearServerEvents(db);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage.waitForLoadState('networkidle');

	// Alice retire sa demande
	const [response] = await Promise.all([
		alicePage.waitForResponse(
			(r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		alicePage.getByTestId('withdraw-cancellation-btn').click()
	]);
	expect(response.status()).toBe(200);
	await alicePage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await alicePage.waitForLoadState('networkidle');

	// Vérifier event match_cancellation_withdrawn
	const events = await readServerEvents(db, { event: 'match_cancellation_withdrawn' });
	expect(events).toHaveLength(1);

	const ev = events[0];
	expect(ev.distinct_id).toBe(ALICE_ID);
	expect(ev.event).toBe('match_cancellation_withdrawn');
	expect(ev.properties).toMatchObject({
		match_id: matchId,
		bet_id: betId,
		group_id: SEEDED_GROUP_ID
	});

	// Aucun event parasites
	const requestedEvents = await readServerEvents(db, { event: 'match_cancellation_requested' });
	expect(requestedEvents).toHaveLength(0);

	await aliceCtx.close();
});

// ─── Event match_cancellation_requested — closest, 2e demandeur sur 3 ────────

test('[tracking] match_cancellation_requested — closest, 2e joueur sur 3', async ({ browser }) => {
	const { betId, matchId } = await createClosestOpen3Players({
		title: '[E2E-tracking-042] cancellation_requested closest 2of3'
	});

	// Alice a déjà demandé (1/3)
	await db`
    INSERT INTO match_cancellations (match_id, user_id) VALUES (${matchId}, ${ALICE_ID})
    ON CONFLICT DO NOTHING
  `;

	await clearServerEvents(db);

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);
	await bobPage.waitForLoadState('networkidle');

	// Bob demande l'annulation (2/3 → pas encore unanime)
	const [response] = await Promise.all([
		bobPage.waitForResponse(
			(r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		bobPage.getByTestId('request-cancellation-btn').click()
	]);
	expect(response.status()).toBe(200);
	await bobPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await bobPage.waitForLoadState('networkidle');

	// Vérifier event match_cancellation_requested
	const events = await readServerEvents(db, { event: 'match_cancellation_requested' });
	expect(events).toHaveLength(1);

	const ev = events[0];
	expect(ev.distinct_id).toBe(BOB_ID);
	expect(ev.properties).toMatchObject({
		match_id: matchId,
		bet_id: betId,
		group_id: SEEDED_GROUP_ID,
		bet_type: 'closest',
		cancellation_count: 2,
		participant_count: 3
	});

	// Match toujours open
	const [matchRow] = await db`SELECT status FROM matches WHERE id = ${matchId}`;
	expect(matchRow.status).toBe('open');

	await bobCtx.close();
});

// ─── distinct_id = utilisateur qui déclenche l'unanimité ─────────────────────

test('[tracking] match_cancelled_unanimously — distinct_id = déclencheur (Alice)', async ({
	browser
}) => {
	const { betId, matchId } = await createYesnoDuelOpen({
		title: '[E2E-tracking-042] cancelled_unanimously distinct_id alice'
	});

	// Bob a déjà demandé (1/2), Alice sera la dernière
	await db`
    INSERT INTO match_cancellations (match_id, user_id) VALUES (${matchId}, ${BOB_ID})
    ON CONFLICT DO NOTHING
  `;

	await clearServerEvents(db);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage.waitForLoadState('networkidle');

	// Alice déclenche l'unanimité
	const [response] = await Promise.all([
		alicePage.waitForResponse(
			(r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		alicePage.getByTestId('request-cancellation-btn').click()
	]);
	expect(response.status()).toBe(200);
	await alicePage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await alicePage.waitForLoadState('networkidle');

	// distinct_id doit être Alice (celle qui a déclenché l'unanimité)
	const aliceEvents = await readServerEvents(db, {
		event: 'match_cancelled_unanimously',
		distinctId: ALICE_ID
	});
	expect(aliceEvents).toHaveLength(1);
	expect(aliceEvents[0].properties.match_id).toBe(matchId);

	// Pas d'event pour Bob
	const bobEvents = await readServerEvents(db, {
		event: 'match_cancelled_unanimously',
		distinctId: BOB_ID
	});
	expect(bobEvents).toHaveLength(0);

	await aliceCtx.close();
});
