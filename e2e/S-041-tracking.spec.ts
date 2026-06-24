/**
 * S-041 — Tracking PostHog : Résolution & attribution des gains
 *
 * Events instrumentés :
 *   Serveur :
 *     - match_resolved  { match_id, bet_id, group_id, bet_type, resolution_type,
 *                         winner_count, stake_type, jury_mode }
 *       — émis après evaluateVerdict() dans castJuryVote() (post-commit)
 *
 *   Client :
 *     - resolution_section_viewed  { bet_id, bet_type, stake_type }
 *       — émis via $effect quand la section résolution devient visible
 *
 * Chaque test est indépendant : clearServerEvents + cleanup afterEach.
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { interceptPosthog, readServerEvents, clearServerEvents } from './helpers/analytics';

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;

// User IDs from seed.sql
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a closest bet in judging status (Alice + Bob participants, Carol juror).
 */
async function createClosestJudging(opts: {
	title: string;
	juryMode?: 'majority' | 'unanimous';
	stakeType?: 'points' | 'forfeit';
}): Promise<{ betId: string; matchId: string }> {
	const { title, juryMode = 'majority', stakeType = 'points' } = opts;

	let betRow: { id: string }[];
	if (stakeType === 'points') {
		betRow = await db`
      INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount,
                        hide_answers, jury_mode, status)
      VALUES (
        ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', ${title},
        'points', '10', false, ${juryMode}, 'open'
      )
      RETURNING id
    `;
	} else {
		betRow = await db`
      INSERT INTO bets (group_id, creator_id, type, title, stake_type, forfeit_description,
                        forfeit_scope, hide_answers, jury_mode, status)
      VALUES (
        ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', ${title},
        'forfeit', 'Faire la vaisselle', 'all_losers', false, ${juryMode}, 'open'
      )
      RETURNING id
    `;
	}

	const bet = betRow[0];

	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    SELECT ${bet.id}, unnest(ARRAY[${ALICE_ID}, ${BOB_ID}]::uuid[])
  `;

	const [match] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'judging') RETURNING id
  `;

	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})`;

	if (stakeType === 'points') {
		await db`
      INSERT INTO match_participants (match_id, user_id, answer, stake)
      VALUES (${match.id}, ${ALICE_ID}, '42', '10'),
             (${match.id}, ${BOB_ID}, '100', '10')
    `;
	} else {
		await db`
      INSERT INTO match_participants (match_id, user_id, answer)
      VALUES (${match.id}, ${ALICE_ID}, '42'),
             (${match.id}, ${BOB_ID}, '100')
    `;
	}

	return { betId: bet.id, matchId: match.id };
}

/**
 * Creates a yesno duel in judging status (Alice vs Bob, Carol juror).
 */
async function createYesnoDuelJudging(opts: {
	title: string;
	juryMode?: 'majority' | 'unanimous';
	stakeType?: 'points' | 'forfeit';
	stakeCreator?: number;
	stakeTarget?: number;
}): Promise<{ betId: string; matchId: string }> {
	const {
		title,
		juryMode = 'majority',
		stakeType = 'points',
		stakeCreator = 10,
		stakeTarget = 5
	} = opts;

	let betRow: { id: string }[];
	if (stakeType === 'points') {
		betRow = await db`
      INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount,
                        hide_answers, jury_mode, status)
      VALUES (
        ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'yesno', ${title},
        'points', ${stakeCreator}, false, ${juryMode}, 'open'
      )
      RETURNING id
    `;
	} else {
		betRow = await db`
      INSERT INTO bets (group_id, creator_id, type, title, stake_type, forfeit_description,
                        hide_answers, jury_mode, status)
      VALUES (
        ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'yesno', ${title},
        'forfeit', 'Faire le café', false, ${juryMode}, 'open'
      )
      RETURNING id
    `;
	}

	const bet = betRow[0];

	await db`
    INSERT INTO yesno_bets (bet_id, mode, creator_side, choice_a, choice_b, accepted_count, max_opponents)
    VALUES (${bet.id}, 'duel', 'a', 'Oui', 'Non', 1, 1)
  `;

	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    SELECT ${bet.id}, unnest(ARRAY[${ALICE_ID}, ${BOB_ID}]::uuid[])
  `;

	if (stakeType === 'points') {
		await db`
      INSERT INTO propositions (bet_id, target_id, last_proposer_id, stake_creator, stake_target, status)
      VALUES (${bet.id}, ${BOB_ID}, ${BOB_ID}, ${stakeCreator}, ${stakeTarget}, 'accepted')
    `;
	} else {
		await db`
      INSERT INTO propositions (bet_id, target_id, last_proposer_id, forfeit_creator, forfeit_target, status)
      VALUES (${bet.id}, ${BOB_ID}, ${BOB_ID}, 'Faire le café', 'Faire la vaisselle', 'accepted')
    `;
	}

	const [match] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'judging') RETURNING id
  `;

	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})`;

	if (stakeType === 'points') {
		await db`
      INSERT INTO match_participants (match_id, user_id, side, stake)
      VALUES (${match.id}, ${ALICE_ID}, 'a', ${stakeCreator}),
             (${match.id}, ${BOB_ID}, 'b', ${stakeTarget})
    `;
	} else {
		await db`
      INSERT INTO match_participants (match_id, user_id, side)
      VALUES (${match.id}, ${ALICE_ID}, 'a'),
             (${match.id}, ${BOB_ID}, 'b')
    `;
	}

	return { betId: bet.id, matchId: match.id };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

test.afterEach(async () => {
	await db`DELETE FROM public.bets WHERE title LIKE '[E2E-tracking-041]%'`;
	await clearServerEvents(db);
});

// ─── Event serveur : match_resolved (yesno, points, winners_selected) ─────────

test('[tracking] match_resolved — yesno points : émis après résolution par Carol', async ({
	browser
}) => {
	const { betId, matchId } = await createYesnoDuelJudging({
		title: '[E2E-tracking-041] match_resolved yesno points',
		juryMode: 'majority',
		stakeType: 'points',
		stakeCreator: 10,
		stakeTarget: 5
	});

	await clearServerEvents(db);

	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);
	await carolPage.waitForLoadState('networkidle');

	// Carol sélectionne "Désigner le gagnant"
	await carolPage
		.locator('label')
		.filter({ has: carolPage.getByTestId('verdict-winners-selected') })
		.click();

	await expect(carolPage.getByTestId('winners-selection')).toBeVisible();

	// Carol vote Alice gagnante (radio pour yesno)
	await carolPage
		.getByTestId('winners-selection')
		.locator('label')
		.filter({ hasText: 'Alice' })
		.locator('input')
		.click();

	// Vote → résolution automatique (1 juré majority)
	const [response] = await Promise.all([
		carolPage.waitForResponse(
			(r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		carolPage.getByTestId('cast-vote-btn').click()
	]);
	expect(response.status()).toBe(200);
	await carolPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await carolPage.waitForLoadState('networkidle');

	// Vérifier l'event serveur match_resolved
	const events = await readServerEvents(db, { event: 'match_resolved' });
	expect(events).toHaveLength(1);

	const ev = events[0];
	expect(ev.distinct_id).toBe(CAROL_ID);
	expect(ev.event).toBe('match_resolved');
	expect(ev.properties).toMatchObject({
		match_id: matchId,
		bet_id: betId,
		group_id: SEEDED_GROUP_ID,
		bet_type: 'yesno',
		resolution_type: 'winners_selected',
		winner_count: 1,
		stake_type: 'points',
		jury_mode: 'majority'
	});

	await carolCtx.close();
});

// ─── Event serveur : match_resolved (closest, points) ────────────────────────

test('[tracking] match_resolved — closest points : winner_count=1, stake_type=points', async ({
	browser
}) => {
	const { betId, matchId } = await createClosestJudging({
		title: '[E2E-tracking-041] match_resolved closest points',
		juryMode: 'majority',
		stakeType: 'points'
	});

	await clearServerEvents(db);

	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);
	await carolPage.waitForLoadState('networkidle');

	// Carol vote Alice gagnante (checkbox pour closest)
	await carolPage
		.locator('label')
		.filter({ has: carolPage.getByTestId('verdict-winners-selected') })
		.click();

	await expect(carolPage.getByTestId('winners-selection')).toBeVisible();

	await carolPage
		.getByTestId('winners-selection')
		.locator('label')
		.filter({ hasText: 'Alice' })
		.locator('input')
		.check();

	const [response] = await Promise.all([
		carolPage.waitForResponse(
			(r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		carolPage.getByTestId('cast-vote-btn').click()
	]);
	expect(response.status()).toBe(200);
	await carolPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await carolPage.waitForLoadState('networkidle');

	const events = await readServerEvents(db, { event: 'match_resolved' });
	expect(events).toHaveLength(1);

	const ev = events[0];
	expect(ev.distinct_id).toBe(CAROL_ID);
	expect(ev.properties).toMatchObject({
		match_id: matchId,
		bet_id: betId,
		group_id: SEEDED_GROUP_ID,
		bet_type: 'closest',
		resolution_type: 'winners_selected',
		winner_count: 1,
		stake_type: 'points',
		jury_mode: 'majority'
	});

	await carolCtx.close();
});

// ─── Event serveur : match_resolved (not_resolved → open) ────────────────────

test('[tracking] match_resolved — résolution=not_resolved : winner_count=0', async ({
	browser
}) => {
	const { betId, matchId } = await createClosestJudging({
		title: '[E2E-tracking-041] match_resolved not_resolved',
		juryMode: 'majority'
	});

	await clearServerEvents(db);

	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);
	await carolPage.waitForLoadState('networkidle');

	// Carol vote "Pas encore résolu"
	await carolPage
		.locator('label')
		.filter({ has: carolPage.getByTestId('verdict-not-resolved') })
		.click();
	await carolPage.waitForTimeout(200);

	const [response] = await Promise.all([
		carolPage.waitForResponse(
			(r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		carolPage.getByTestId('cast-vote-btn').click()
	]);
	expect(response.status()).toBe(200);
	await carolPage.waitForLoadState('networkidle');

	const events = await readServerEvents(db, { event: 'match_resolved' });
	expect(events).toHaveLength(1);

	const ev = events[0];
	expect(ev.distinct_id).toBe(CAROL_ID);
	expect(ev.properties).toMatchObject({
		match_id: matchId,
		bet_id: betId,
		bet_type: 'closest',
		resolution_type: 'not_resolved',
		winner_count: 0,
		stake_type: 'points',
		jury_mode: 'majority'
	});

	await carolCtx.close();
});

// ─── Event serveur : match_resolved NON émis si pas de consensus ──────────────

test('[tracking] match_resolved — NON émis quand jury unanime + 1 vote sur 2', async ({
	browser
}) => {
	// Bet avec 2 jurés en unanimité : Carol + Dave
	const DAVE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

	const [betRow] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount,
                      hide_answers, jury_mode, status)
    VALUES (
      ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', '[E2E-tracking-041] no_resolved_unanime',
      'points', '10', false, 'unanimous', 'open'
    )
    RETURNING id
  `;

	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    SELECT ${betRow.id}, unnest(ARRAY[${ALICE_ID}, ${BOB_ID}]::uuid[])
  `;

	const [match] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${betRow.id}, 'judging') RETURNING id
  `;

	// 2 jurés
	await db`
    INSERT INTO match_jurors (match_id, user_id)
    SELECT ${match.id}, unnest(ARRAY[${CAROL_ID}, ${DAVE_ID}]::uuid[])
  `;

	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${match.id}, ${ALICE_ID}, '42', '10'),
           (${match.id}, ${BOB_ID}, '100', '10')
  `;

	await clearServerEvents(db);

	// Carol vote seule → pas de seuil unanime (2 jurés)
	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betRow.id}`);
	await carolPage.waitForLoadState('networkidle');

	await carolPage
		.locator('label')
		.filter({ has: carolPage.getByTestId('verdict-winners-selected') })
		.click();

	await carolPage
		.getByTestId('winners-selection')
		.locator('label')
		.filter({ hasText: 'Alice' })
		.locator('input')
		.check();

	const [response] = await Promise.all([
		carolPage.waitForResponse(
			(r) => r.url().includes(`/bets/${betRow.id}`) && r.request().method() === 'POST'
		),
		carolPage.getByTestId('cast-vote-btn').click()
	]);
	expect(response.status()).toBe(200);
	await carolPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betRow.id}`));
	await carolPage.waitForLoadState('networkidle');

	// Aucun event match_resolved ne doit être émis (pas de consensus)
	const events = await readServerEvents(db, { event: 'match_resolved' });
	expect(events).toHaveLength(0);

	// Le match est toujours en judging
	const [matchRow] = await db`SELECT status FROM matches WHERE id = ${match.id}`;
	expect(matchRow.status).toBe('judging');

	await carolCtx.close();
});

// ─── Event serveur : distinct_id = juror qui a déclenché la résolution ─────────

test('[tracking] match_resolved — distinct_id = Carol (jurée qui déclenche)', async ({
	browser
}) => {
	await clearServerEvents(db);

	const { betId, matchId } = await createYesnoDuelJudging({
		title: '[E2E-tracking-041] match_resolved distinct_id',
		juryMode: 'majority'
	});

	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);
	await carolPage.waitForLoadState('networkidle');

	await carolPage
		.locator('label')
		.filter({ has: carolPage.getByTestId('verdict-winners-selected') })
		.click();
	await carolPage
		.getByTestId('winners-selection')
		.locator('label')
		.filter({ hasText: 'Alice' })
		.locator('input')
		.click();

	const [voteResponse] = await Promise.all([
		carolPage.waitForResponse(
			(r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		carolPage.getByTestId('cast-vote-btn').click()
	]);
	expect(voteResponse.status()).toBe(200);
	await carolPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await carolPage.waitForLoadState('networkidle');

	// distinct_id doit être Carol
	const carolEvents = await readServerEvents(db, { event: 'match_resolved', distinctId: CAROL_ID });
	expect(carolEvents).toHaveLength(1);
	expect(carolEvents[0].distinct_id).toBe(CAROL_ID);

	// Pas d'event pour Alice ni Bob
	const aliceEvents = await readServerEvents(db, { event: 'match_resolved', distinctId: ALICE_ID });
	expect(aliceEvents).toHaveLength(0);
	const bobEvents = await readServerEvents(db, { event: 'match_resolved', distinctId: BOB_ID });
	expect(bobEvents).toHaveLength(0);

	// Vérifier le match_id dans les propriétés
	expect(carolEvents[0].properties.match_id).toBe(matchId);

	await carolCtx.close();
});

// ─── Event client : resolution_section_viewed ─────────────────────────────────

test('[tracking] resolution_section_viewed — émis côté client quand le match est résolu', async ({
	browser
}) => {
	const { betId, matchId } = await createYesnoDuelJudging({
		title: '[E2E-tracking-041] resolution_section_viewed yesno',
		juryMode: 'majority',
		stakeType: 'points',
		stakeCreator: 10,
		stakeTarget: 5
	});

	// Résoudre le match directement en DB (pour éviter de dépendre du vote dans ce test client)
	const [vote] = await db`
    INSERT INTO jury_votes (match_id, juror_id, verdict)
    VALUES (${matchId}, ${CAROL_ID}, 'winners_selected')
    RETURNING id
  `;
	await db`INSERT INTO jury_vote_winners (vote_id, winner_user_id) VALUES (${vote.id}, ${ALICE_ID})`;
	await db`UPDATE matches SET status = 'resolved', resolved_at = now() WHERE id = ${matchId}`;
	await db`INSERT INTO match_winners (match_id, user_id, share) VALUES (${matchId}, ${ALICE_ID}, '5.00')`;
	await db`
    INSERT INTO ledger_entries (group_id, match_id, debtor_id, creditor_id, amount)
    VALUES (${SEEDED_GROUP_ID}, ${matchId}, ${BOB_ID}, ${ALICE_ID}, '5.00')
  `;

	// interceptPosthog AVANT login
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(alicePage);
	await exposeSpyPromise;

	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage.waitForLoadState('networkidle');

	// Attendre l'hydratation Svelte 5
	await alicePage.waitForTimeout(500);

	// La section résolution doit être visible
	await expect(alicePage.getByTestId('resolution-section')).toBeVisible();

	const capturedEvents = getCapturedEvents();
	const resolutionEvents = capturedEvents.filter((e) => e.event === 'resolution_section_viewed');

	expect(resolutionEvents.length).toBeGreaterThanOrEqual(1);

	const ev = resolutionEvents[0];
	expect(ev.properties).toMatchObject({
		bet_id: betId,
		bet_type: 'yesno',
		stake_type: 'points'
	});

	await aliceCtx.close();
});

test('[tracking] resolution_section_viewed — émis pour closest résolu', async ({ browser }) => {
	const { betId, matchId } = await createClosestJudging({
		title: '[E2E-tracking-041] resolution_section_viewed closest',
		juryMode: 'majority',
		stakeType: 'points'
	});

	// Résoudre en DB
	const [vote] = await db`
    INSERT INTO jury_votes (match_id, juror_id, verdict)
    VALUES (${matchId}, ${CAROL_ID}, 'winners_selected')
    RETURNING id
  `;
	await db`INSERT INTO jury_vote_winners (vote_id, winner_user_id) VALUES (${vote.id}, ${ALICE_ID})`;
	await db`UPDATE matches SET status = 'resolved', resolved_at = now() WHERE id = ${matchId}`;
	await db`INSERT INTO match_winners (match_id, user_id, share) VALUES (${matchId}, ${ALICE_ID}, '10.00')`;
	await db`
    INSERT INTO ledger_entries (group_id, match_id, debtor_id, creditor_id, amount)
    VALUES (${SEEDED_GROUP_ID}, ${matchId}, ${BOB_ID}, ${ALICE_ID}, '10.00')
  `;

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(alicePage);
	await exposeSpyPromise;

	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage.waitForLoadState('networkidle');
	await alicePage.waitForTimeout(500);

	await expect(alicePage.getByTestId('resolution-section')).toBeVisible();

	const capturedEvents = getCapturedEvents();
	const resolutionEvents = capturedEvents.filter((e) => e.event === 'resolution_section_viewed');

	expect(resolutionEvents.length).toBeGreaterThanOrEqual(1);
	expect(resolutionEvents[0].properties).toMatchObject({
		bet_id: betId,
		bet_type: 'closest',
		stake_type: 'points'
	});

	await aliceCtx.close();
});

test('[tracking] resolution_section_viewed — NON émis quand match en judging (pas encore résolu)', async ({
	browser
}) => {
	const { betId } = await createClosestJudging({
		title: '[E2E-tracking-041] resolution_section_viewed not_visible',
		juryMode: 'majority'
	});

	// Match reste en judging — pas de résolution

	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(carolPage);
	await exposeSpyPromise;

	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);
	await carolPage.waitForLoadState('networkidle');
	await carolPage.waitForTimeout(500);

	// Section résolution non visible (match en judging)
	await expect(carolPage.getByTestId('resolution-section')).not.toBeVisible();

	const capturedEvents = getCapturedEvents();
	const resolutionEvents = capturedEvents.filter((e) => e.event === 'resolution_section_viewed');

	// Pas d'event : la section résolution n'est pas affichée
	expect(resolutionEvents).toHaveLength(0);

	await carolCtx.close();
});
