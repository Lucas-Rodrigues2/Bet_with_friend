/**
 * S-040 — Tracking PostHog : Vote du jury
 *
 * Events instrumentés :
 *   Serveur :
 *     - jury_vote_cast      { bet_id, match_id, verdict, winner_count, has_loser }
 *       — émis après castJuryVote() dans l'action cast_jury_vote
 *     - match_submitted_to_jury  { bet_id, match_id, bet_type:'yesno' }
 *       — émis après submitMatchToJury() dans l'action submit_to_jury_yesno
 *
 *   Client :
 *     - jury_section_viewed  { bet_id, match_id, bet_type }
 *       — émis via $effect quand le panneau jury-vote-section devient visible
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

async function createClosestBetJudging(opts: {
	title: string;
	stakeType?: 'points' | 'forfeit';
	forfeitScope?: 'all_losers' | 'last_one';
}): Promise<{ betId: string; matchId: string }> {
	const { title, stakeType = 'points', forfeitScope = 'all_losers' } = opts;

	let betRow: { id: string }[];
	if (stakeType === 'points') {
		betRow = await db`
      INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status)
      VALUES (
        ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', ${title},
        'points', '10', false, 'majority', 'open'
      )
      RETURNING id
    `;
	} else {
		betRow = await db`
      INSERT INTO bets (group_id, creator_id, type, title, stake_type, forfeit_description, forfeit_scope, hide_answers, jury_mode, status)
      VALUES (
        ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', ${title},
        'forfeit', 'Faire le café', ${forfeitScope}, false, 'majority', 'open'
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

async function createYesnoDuelOpen(opts: { title: string }): Promise<{ betId: string; matchId: string }> {
	const { title } = opts;

	const [bet] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status)
    VALUES (
      ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'yesno', ${title},
      'points', '10', false, 'majority', 'open'
    )
    RETURNING id
  `;

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
    VALUES (${bet.id}, ${BOB_ID}, ${BOB_ID}, '10', '10', 'accepted')
  `;

	const [match] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'open') RETURNING id
  `;

	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})`;

	await db`
    INSERT INTO match_participants (match_id, user_id, side, stake)
    VALUES (${match.id}, ${ALICE_ID}, 'a', '10'), (${match.id}, ${BOB_ID}, 'b', '10')
  `;

	return { betId: bet.id, matchId: match.id };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

test.afterEach(async () => {
	await db`DELETE FROM public.bets WHERE title LIKE '[E2E-tracking-040]%'`;
	await clearServerEvents(db);
});

// ─── Event serveur : jury_vote_cast ──────────────────────────────────────────

test('[tracking] jury_vote_cast — émis côté serveur quand Carol vote winners_selected', async ({
	browser
}) => {
	const { betId, matchId } = await createClosestBetJudging({
		title: '[E2E-tracking-040] jury_vote_cast winners'
	});

	await clearServerEvents(db);

	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);
	await carolPage.waitForLoadState('networkidle');

	// Carol sélectionne "Désigner le(s) gagnant(s)"
	await carolPage
		.locator('label')
		.filter({ has: carolPage.getByTestId('verdict-winners-selected') })
		.click();

	await expect(carolPage.getByTestId('winners-selection')).toBeVisible();

	// Carol coche Alice
	await carolPage
		.getByTestId('winners-selection')
		.locator('label')
		.filter({ hasText: 'Alice' })
		.locator('input')
		.check();

	// Carol vote
	const [response] = await Promise.all([
		carolPage.waitForResponse(
			(r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		carolPage.getByTestId('cast-vote-btn').click()
	]);
	expect(response.status()).toBe(200);
	await carolPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await carolPage.waitForLoadState('networkidle');

	// Vérifier l'event serveur
	const events = await readServerEvents(db, { event: 'jury_vote_cast', distinctId: CAROL_ID });
	expect(events).toHaveLength(1);

	const ev = events[0];
	expect(ev.distinct_id).toBe(CAROL_ID);
	expect(ev.event).toBe('jury_vote_cast');
	expect(ev.properties).toMatchObject({
		bet_id: betId,
		match_id: matchId,
		verdict: 'winners_selected',
		winner_count: 1,
		has_loser: false
	});

	await carolCtx.close();
});

test('[tracking] jury_vote_cast — verdict=not_resolved, winner_count=0, has_loser=false', async ({
	browser
}) => {
	const { betId, matchId } = await createClosestBetJudging({
		title: '[E2E-tracking-040] jury_vote_cast not_resolved'
	});

	await clearServerEvents(db);

	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);
	await carolPage.waitForLoadState('networkidle');
	await carolPage.waitForSelector('[data-testid="verdict-not-resolved"]');

	// Carol sélectionne "Pas encore résolu"
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
	await carolPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await carolPage.waitForLoadState('networkidle');

	const events = await readServerEvents(db, { event: 'jury_vote_cast', distinctId: CAROL_ID });
	expect(events).toHaveLength(1);

	const ev = events[0];
	expect(ev.properties).toMatchObject({
		bet_id: betId,
		match_id: matchId,
		verdict: 'not_resolved',
		winner_count: 0,
		has_loser: false
	});

	await carolCtx.close();
});

test('[tracking] jury_vote_cast — has_loser=true quand loser sélectionné (last_one)', async ({
	browser
}) => {
	const { betId, matchId } = await createClosestBetJudging({
		title: '[E2E-tracking-040] jury_vote_cast has_loser',
		stakeType: 'forfeit',
		forfeitScope: 'last_one'
	});

	await clearServerEvents(db);

	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);
	await carolPage.waitForLoadState('networkidle');

	// Carol sélectionne "Désigner le(s) gagnant(s)"
	await carolPage
		.locator('label')
		.filter({ has: carolPage.getByTestId('verdict-winners-selected') })
		.click();
	await expect(carolPage.getByTestId('winners-selection')).toBeVisible();

	// Carol coche Alice comme gagnante
	await carolPage
		.getByTestId('winners-selection')
		.locator('label')
		.filter({ hasText: 'Alice' })
		.locator('input[type="checkbox"]')
		.check();

	// Carol choisit Bob comme loser
	await carolPage
		.getByTestId('loser-selection')
		.locator('label')
		.filter({ hasText: 'Bob' })
		.locator('input')
		.click();

	const [response] = await Promise.all([
		carolPage.waitForResponse(
			(r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		carolPage.getByTestId('cast-vote-btn').click()
	]);
	expect(response.status()).toBe(200);
	await carolPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await carolPage.waitForLoadState('networkidle');

	const events = await readServerEvents(db, { event: 'jury_vote_cast', distinctId: CAROL_ID });
	expect(events).toHaveLength(1);

	const ev = events[0];
	expect(ev.properties).toMatchObject({
		bet_id: betId,
		match_id: matchId,
		verdict: 'winners_selected',
		winner_count: 1,
		has_loser: true
	});

	await carolCtx.close();
});

// ─── Event serveur : match_submitted_to_jury (yesno) ─────────────────────────

test('[tracking] match_submitted_to_jury — émis côté serveur quand Bob soumet le duel yesno', async ({
	browser
}) => {
	const { betId, matchId } = await createYesnoDuelOpen({
		title: '[E2E-tracking-040] match_submitted_to_jury'
	});

	await clearServerEvents(db);

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);

	await expect(bobPage.getByTestId('submit-to-jury-yesno-section')).toBeVisible();

	await Promise.all([
		bobPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`)),
		bobPage.getByTestId('submit-to-jury-btn').click()
	]);
	await bobPage.waitForLoadState('networkidle');

	// Vérifier l'event match_submitted_to_jury dans le sink DB
	const events = await readServerEvents(db, {
		event: 'match_submitted_to_jury',
		distinctId: BOB_ID
	});
	expect(events).toHaveLength(1);

	const ev = events[0];
	expect(ev.distinct_id).toBe(BOB_ID);
	expect(ev.event).toBe('match_submitted_to_jury');
	expect(ev.properties).toMatchObject({
		bet_id: betId,
		match_id: matchId,
		bet_type: 'yesno'
	});

	await bobCtx.close();
});

test('[tracking] match_submitted_to_jury — distinct_id = Bob (participant qui soumet)', async ({
	browser
}) => {
	const { betId } = await createYesnoDuelOpen({
		title: '[E2E-tracking-040] match_submitted_to_jury distinct_id'
	});

	await clearServerEvents(db);

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);

	await expect(bobPage.getByTestId('submit-to-jury-yesno-section')).toBeVisible();
	await bobPage.getByTestId('submit-to-jury-btn').click();
	await bobPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await bobPage.waitForLoadState('networkidle');

	// Bob est le distinct_id
	const bobEvents = await readServerEvents(db, {
		event: 'match_submitted_to_jury',
		distinctId: BOB_ID
	});
	expect(bobEvents).toHaveLength(1);
	expect(bobEvents[0].distinct_id).toBe(BOB_ID);

	// Alice n'a pas d'event match_submitted_to_jury
	const aliceEvents = await readServerEvents(db, {
		event: 'match_submitted_to_jury',
		distinctId: ALICE_ID
	});
	expect(aliceEvents).toHaveLength(0);

	await bobCtx.close();
});

// ─── Event client : jury_section_viewed ──────────────────────────────────────

test("[tracking] jury_section_viewed — émis côté client quand Carol (jurée) voit le panneau de vote", async ({
	browser
}) => {
	const { betId, matchId } = await createClosestBetJudging({
		title: '[E2E-tracking-040] jury_section_viewed'
	});

	// interceptPosthog AVANT login (exposeFunction doit être enregistrée avant toute navigation)
	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(carolPage);
	await exposeSpyPromise;

	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);
	await carolPage.waitForLoadState('networkidle');

	// Attendre que l'hydratation Svelte 5 soit complète et que l'$effect soit déclenché
	await carolPage.waitForTimeout(500);

	const capturedEvents = getCapturedEvents();
	const juryEvents = capturedEvents.filter((e) => e.event === 'jury_section_viewed');

	expect(juryEvents.length).toBeGreaterThanOrEqual(1);

	const ev = juryEvents[0];
	expect(ev.properties).toMatchObject({
		bet_id: betId,
		match_id: matchId,
		bet_type: 'closest'
	});

	await carolCtx.close();
});

test("[tracking] jury_section_viewed — NON émis pour Alice (non jurée)", async ({ browser }) => {
	const { betId } = await createClosestBetJudging({
		title: '[E2E-tracking-040] jury_section_viewed non juree'
	});

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(alicePage);
	await exposeSpyPromise;

	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage.waitForLoadState('networkidle');
	await alicePage.waitForTimeout(500);

	const capturedEvents = getCapturedEvents();
	const juryEvents = capturedEvents.filter((e) => e.event === 'jury_section_viewed');

	// Alice n'est pas jurée → le panneau n'est pas visible → pas d'event
	expect(juryEvents).toHaveLength(0);

	await aliceCtx.close();
});

test('[tracking] jury_section_viewed — bet_type=yesno quand match yesno en judging', async ({
	browser
}) => {
	// Créer un duel yesno déjà en judging directement via DB
	const [bet] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status)
    VALUES (
      ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'yesno', '[E2E-tracking-040] jury_section_viewed yesno',
      'points', '10', false, 'majority', 'open'
    )
    RETURNING id
  `;

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
    VALUES (${bet.id}, ${BOB_ID}, ${BOB_ID}, '10', '10', 'accepted')
  `;

	const [match] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'judging') RETURNING id
  `;

	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})`;

	await db`
    INSERT INTO match_participants (match_id, user_id, side, stake)
    VALUES (${match.id}, ${ALICE_ID}, 'a', '10'), (${match.id}, ${BOB_ID}, 'b', '10')
  `;

	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(carolPage);
	await exposeSpyPromise;

	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${bet.id}`);
	await carolPage.waitForLoadState('networkidle');
	await carolPage.waitForTimeout(500);

	const capturedEvents = getCapturedEvents();
	const juryEvents = capturedEvents.filter((e) => e.event === 'jury_section_viewed');

	expect(juryEvents.length).toBeGreaterThanOrEqual(1);
	expect(juryEvents[0].properties).toMatchObject({
		bet_id: bet.id,
		match_id: match.id,
		bet_type: 'yesno'
	});

	await carolCtx.close();
});
