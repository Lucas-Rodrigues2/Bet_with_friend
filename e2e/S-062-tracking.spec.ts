/**
 * S-062 — Tracking PostHog : Historique des paris
 *
 * Events serveur instrumentés (sink DB analytics_events_test) :
 *   - group_bets_viewed  { group_id, filter, search }  (search = booléen, pas
 *     le terme saisi → pas de PII)
 *   - my_bets_viewed     { filter }
 *
 * Pas de PII : ni titre de pari, ni terme de recherche exact, ni pseudo de
 * groupe ne sont envoyés.
 *
 * Chaque test est indépendant : clearServerEvents + cleanup afterEach.
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { readServerEvents, clearServerEvents } from './helpers/analytics';

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;
const BETS_URL = `${GROUP_URL}/bets`;
const MY_BETS_URL = `/app/my-bets`;

const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── Helpers DB ───────────────────────────────────────────────────────────────

async function createOpenClosest(title: string): Promise<{ betId: string; matchId: string }> {
	const [betRow] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount,
                      hide_answers, jury_mode, status)
    VALUES (
      ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', ${title},
      'points', '10', false, 'majority', 'open'
    )
    RETURNING id
  `;
	const bet = betRow;
	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    SELECT ${bet.id}, unnest(ARRAY[${ALICE_ID}, ${BOB_ID}]::uuid[])
  `;
	const [match] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'open') RETURNING id
  `;
	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})`;
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${match.id}, ${ALICE_ID}, '42', '10'),
           (${match.id}, ${BOB_ID}, '100', '10')
  `;
	return { betId: bet.id, matchId: match.id };
}

async function createResolvedYesnoDuel(
	title: string
): Promise<{ betId: string; matchId: string }> {
	const [betRow] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount,
                      hide_answers, jury_mode, status)
    VALUES (
      ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'yesno', ${title},
      'points', '10', false, 'majority', 'open'
    )
    RETURNING id
  `;
	const bet = betRow;
	await db`
    INSERT INTO yesno_bets (bet_id, mode, creator_side, choice_a, choice_b, accepted_count, max_opponents)
    VALUES (${bet.id}, 'duel', 'a', 'Oui', 'Non', 1, 1)
  `;
	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    SELECT ${bet.id}, unnest(ARRAY[${ALICE_ID}, ${BOB_ID}]::uuid[])
  `;
	await db`
    INSERT INTO propositions (bet_id, target_id, last_proposer_id, stake_creator, stake_target, status)
    VALUES (${bet.id}, ${BOB_ID}, ${BOB_ID}, '10', '5', 'accepted')
  `;
	const [match] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'judging') RETURNING id
  `;
	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})`;
	await db`
    INSERT INTO match_participants (match_id, user_id, side, stake)
    VALUES (${match.id}, ${ALICE_ID}, 'a', '10'),
           (${match.id}, ${BOB_ID}, 'b', '5')
  `;
	const [vote] = await db`
    INSERT INTO jury_votes (match_id, juror_id, verdict)
    VALUES (${match.id}, ${CAROL_ID}, 'winners_selected')
    RETURNING id
  `;
	await db`INSERT INTO jury_vote_winners (vote_id, winner_user_id) VALUES (${vote.id}, ${ALICE_ID})`;
	await db`UPDATE matches SET status = 'resolved', resolved_at = now() WHERE id = ${match.id}`;
	await db`INSERT INTO match_winners (match_id, user_id, share) VALUES (${match.id}, ${ALICE_ID}, '5.00')`;
	await db`
    INSERT INTO ledger_entries (group_id, match_id, debtor_id, creditor_id, amount)
    VALUES (${SEEDED_GROUP_ID}, ${match.id}, ${BOB_ID}, ${ALICE_ID}, '5.00')
  `;
	return { betId: bet.id, matchId: match.id };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

test.afterEach(async () => {
	await db`
		DELETE FROM ledger_entries
		WHERE match_id IN (
			SELECT m.id FROM matches m
			JOIN bets b ON b.id = m.bet_id
			WHERE b.title LIKE '[E2E-tracking-062]%'
		)
	`;
	await db`DELETE FROM bets WHERE title LIKE '[E2E-tracking-062]%'`;
	await clearServerEvents(db);
});

// ─── Event serveur : group_bets_viewed — filtre « all » ───────────────────────

test('[tracking] group_bets_viewed — filter=all, properties attendues, pas de PII', async ({
	browser
}) => {
	await createOpenClosest('[E2E-tracking-062] open all');
	await clearServerEvents(db);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${BETS_URL}`); // filter all par défaut
	await alicePage.waitForLoadState('networkidle');

	const events = await readServerEvents(db, {
		event: 'group_bets_viewed',
		distinctId: ALICE_ID
	});
	expect(events.length).toBeGreaterThanOrEqual(1);

	// Dernier event de cette consultation
	const ev = events[events.length - 1];
	expect(ev.distinct_id).toBe(ALICE_ID);
	expect(ev.properties).toMatchObject({
		group_id: SEEDED_GROUP_ID,
		filter: 'all',
		search: false
	});

	// Pas de PII : ni titre, ni terme de recherche, ni pseudo
	const props = ev.properties;
	expect(props).not.toHaveProperty('title');
	expect(props).not.toHaveProperty('search_term');
	expect(props).not.toHaveProperty('q');
	expect(props).not.toHaveProperty('pseudo');

	await aliceCtx.close();
});

// ─── Event serveur : group_bets_viewed — plusieurs filtres ────────────────────

test('[tracking] group_bets_viewed — plusieurs filtres (active / resolved / cancelled)', async ({
	browser
}) => {
	await createOpenClosest('[E2E-tracking-062] open active');
	await createResolvedYesnoDuel('[E2E-tracking-062] resolved one');
	await clearServerEvents(db);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');

	// Filtre active
	await alicePage.goto(`${BETS_URL}?filter=active`);
	await alicePage.waitForLoadState('networkidle');
	// Filtre resolved
	await alicePage.goto(`${BETS_URL}?filter=resolved`);
	await alicePage.waitForLoadState('networkidle');
	// Filtre cancelled
	await alicePage.goto(`${BETS_URL}?filter=cancelled`);
	await alicePage.waitForLoadState('networkidle');

	const events = await readServerEvents(db, {
		event: 'group_bets_viewed',
		distinctId: ALICE_ID
	});
	// 3 events (un par navigation)
	expect(events).toHaveLength(3);

	const filters = events.map((e) => e.properties.filter);
	expect(filters).toContain('active');
	expect(filters).toContain('resolved');
	expect(filters).toContain('cancelled');

	// Toutes les properties ont group_id + search=false + pas de PII
	for (const ev of events) {
		expect(ev.properties.group_id).toBe(SEEDED_GROUP_ID);
		expect(ev.properties.search).toBe(false);
		expect(ev.properties).not.toHaveProperty('title');
		expect(ev.properties).not.toHaveProperty('q');
	}

	await aliceCtx.close();
});

// ─── Event serveur : group_bets_viewed — avec recherche (search=true) ──────────

test('[tracking] group_bets_viewed — search=true quand un terme est saisi (terme NON envoyé)', async ({
	browser
}) => {
	await createOpenClosest('[E2E-tracking-062] recherche cible');
	await clearServerEvents(db);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');

	// Navigation directe avec ?q=...
	await alicePage.goto(`${BETS_URL}?q=recherche`);
	await alicePage.waitForLoadState('networkidle');

	const events = await readServerEvents(db, {
		event: 'group_bets_viewed',
		distinctId: ALICE_ID
	});
	expect(events.length).toBeGreaterThanOrEqual(1);
	const ev = events[events.length - 1];
	expect(ev.properties.search).toBe(true);
	// Le terme exact ne doit JAMAIS être envoyé (PII / vie privée)
	expect(ev.properties).not.toHaveProperty('q');
	expect(ev.properties).not.toHaveProperty('search_term');
	expect(ev.properties).not.toHaveProperty('query');

	await aliceCtx.close();
});

// ─── Event serveur : my_bets_viewed — filtre « all » ──────────────────────────

test('[tracking] my_bets_viewed — filter=all, properties attendues, pas de PII', async ({
	browser
}) => {
	await createResolvedYesnoDuel('[E2E-tracking-062] mybets all');
	await clearServerEvents(db);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${MY_BETS_URL}`);
	await alicePage.waitForLoadState('networkidle');

	const events = await readServerEvents(db, {
		event: 'my_bets_viewed',
		distinctId: ALICE_ID
	});
	expect(events.length).toBeGreaterThanOrEqual(1);
	const ev = events[events.length - 1];
	expect(ev.distinct_id).toBe(ALICE_ID);
	expect(ev.properties).toMatchObject({ filter: 'all' });

	// Pas de PII : ni titre, ni nom de groupe, ni outcome de l'utilisateur
	expect(ev.properties).not.toHaveProperty('title');
	expect(ev.properties).not.toHaveProperty('group_name');
	expect(ev.properties).not.toHaveProperty('group_id');
	expect(ev.properties).not.toHaveProperty('pseudo');

	await aliceCtx.close();
});

// ─── Event serveur : my_bets_viewed — plusieurs filtres ───────────────────────

test('[tracking] my_bets_viewed — plusieurs filtres (won / lost / active / all)', async ({
	browser
}) => {
	await createResolvedYesnoDuel('[E2E-tracking-062] mybets won');
	await clearServerEvents(db);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');

	for (const filter of ['won', 'lost', 'active', 'all']) {
		await alicePage.goto(`${MY_BETS_URL}?filter=${filter}`);
		await alicePage.waitForLoadState('networkidle');
	}

	const events = await readServerEvents(db, {
		event: 'my_bets_viewed',
		distinctId: ALICE_ID
	});
	expect(events).toHaveLength(4);
	const filters = events.map((e) => e.properties.filter);
	expect(filters).toEqual(['won', 'lost', 'active', 'all']);

	// Aucun event ne contient de PII
	for (const ev of events) {
		expect(ev.properties).not.toHaveProperty('title');
		expect(ev.properties).not.toHaveProperty('group_name');
	}

	await aliceCtx.close();
});

// ─── distinct_id = utilisateur connecté (pas un autre) ────────────────────────

test('[tracking] group_bets_viewed + my_bets_viewed — distinct_id = utilisateur connecté', async ({
	browser
}) => {
	await createOpenClosest('[E2E-tracking-062] distinct id');
	await clearServerEvents(db);

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${BETS_URL}`);
	await bobPage.waitForLoadState('networkidle');
	await bobPage.goto(`${MY_BETS_URL}`);
	await bobPage.waitForLoadState('networkidle');

	const groupEvents = await readServerEvents(db, {
		event: 'group_bets_viewed',
		distinctId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
	});
	expect(groupEvents.length).toBeGreaterThanOrEqual(1);
	expect(groupEvents[0].distinct_id).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

	const myBetsEvents = await readServerEvents(db, {
		event: 'my_bets_viewed',
		distinctId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
	});
	expect(myBetsEvents.length).toBeGreaterThanOrEqual(1);
	expect(myBetsEvents[0].distinct_id).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

	// Aucun event pour Alice sur cette session Bob
	const aliceGroup = await readServerEvents(db, {
		event: 'group_bets_viewed',
		distinctId: ALICE_ID
	});
	expect(aliceGroup).toHaveLength(0);

	await bobCtx.close();
});
