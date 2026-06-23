/**
 * S-022 — Tracking PostHog : clôture & soumission au jury
 *
 * Events instrumentés :
 * - Serveur : bet_submitted_to_jury (après UPDATE matches SET status='judging')
 * - Client  : judging_section_viewed (quand un juré a des paris à juger dans
 *             la section "À juger" de la page groupe)
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createClosestBetForTracking(opts: {
	title: string;
	carolInVisibility?: boolean;
}): Promise<{ betId: string; matchId: string }> {
	const { title, carolInVisibility = false } = opts;

	const [bet] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status)
    VALUES (
      ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', ${title},
      'points', '10', true, 'majority', 'open'
    )
    RETURNING id
  `;

	const visibilityUsers = [ALICE_ID, BOB_ID];
	if (carolInVisibility) visibilityUsers.push(CAROL_ID);

	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    SELECT ${bet.id}, unnest(${visibilityUsers}::uuid[])
  `;

	const [match] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'open') RETURNING id
  `;

	await db`
    INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})
  `;

	return { betId: bet.id, matchId: match.id };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

test.afterEach(async () => {
	await db`DELETE FROM public.bets WHERE title LIKE '[E2E] S022 tracking%'`;
	await clearServerEvents(db);
});

// ─── Test 1 : Event serveur bet_submitted_to_jury ─────────────────────────────

test('[tracking] bet_submitted_to_jury émis côté serveur quand Bob soumet au jury', async ({
	browser
}) => {
	const { betId, matchId } = await createClosestBetForTracking({
		title: '[E2E] S022 tracking submit server'
	});

	// Bob participe pour pouvoir soumettre
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${BOB_ID}, '42', '10')
  `;

	await clearServerEvents(db);

	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Bob voit le bouton Soumettre au jury
	await expect(bobPage.getByTestId('submit-to-jury-btn')).toBeVisible();

	// Bob clique Soumettre au jury
	await bobPage.getByTestId('submit-to-jury-btn').click();

	// Attendre la redirection après soumission
	await bobPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await expect(bobPage.getByTestId('bet-status-badge')).toHaveText('En jugement');

	// Vérifier l'event serveur dans le sink DB
	const events = await readServerEvents(db, {
		event: 'bet_submitted_to_jury',
		distinctId: BOB_ID
	});

	expect(events).toHaveLength(1);
	const ev = events[0];
	expect(ev.distinct_id).toBe(BOB_ID);
	expect(ev.event).toBe('bet_submitted_to_jury');
	expect(ev.properties).toMatchObject({
		bet_id: betId,
		match_id: matchId,
		group_id: SEEDED_GROUP_ID,
		bet_type: 'closest'
	});

	await bobContext.close();
});

// ─── Test 2 : Distinct ID correct dans bet_submitted_to_jury ─────────────────

test('[tracking] bet_submitted_to_jury a le bon distinct_id (Alice soumet)', async ({
	browser
}) => {
	const { betId, matchId } = await createClosestBetForTracking({
		title: '[E2E] S022 tracking submit alice server'
	});

	// Alice participe
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${ALICE_ID}, '100', '10')
  `;

	await clearServerEvents(db);

	const aliceContext = await browser.newContext();
	const alicePage = await aliceContext.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);

	await expect(alicePage.getByTestId('submit-to-jury-btn')).toBeVisible();
	await alicePage.getByTestId('submit-to-jury-btn').click();

	// Attendre que la page recharge et que le badge "En jugement" soit visible
	await alicePage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await expect(alicePage.getByTestId('bet-status-badge')).toHaveText('En jugement');

	const events = await readServerEvents(db, {
		event: 'bet_submitted_to_jury',
		distinctId: ALICE_ID
	});

	expect(events).toHaveLength(1);
	expect(events[0].distinct_id).toBe(ALICE_ID);

	await aliceContext.close();
});

// ─── Test 3 : Event client judging_section_viewed quand juré a des paris à juger

test("[tracking] judging_section_viewed émis côté client quand Carol voit la section 'À juger'", async ({
	browser
}) => {
	const { betId, matchId } = await createClosestBetForTracking({
		title: '[E2E] S022 tracking judging section',
		carolInVisibility: false // Carol est jurée mais pas dans la liste de visibilité
	});

	// Bob participe et le match passe en judging
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${BOB_ID}, '42', '10')
  `;
	await db`UPDATE matches SET status = 'judging' WHERE id = ${matchId}`;

	// Intercepter AVANT login (exposeFunction doit être enregistrée avant toute navigation)
	const carolContext = await browser.newContext();
	const carolPage = await carolContext.newPage();
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(carolPage);
	await exposeSpyPromise;

	await login(carolPage, 'carol');
	await carolPage.goto(GROUP_URL);

	// Attendre que la section "À juger" soit visible
	const betsToJudgeSection = carolPage.getByTestId('bets-to-judge-section');
	await expect(betsToJudgeSection).toBeVisible();

	// Attendre la fin du réseau + hydration Svelte 5 ($effects post-montage)
	await carolPage.waitForLoadState('networkidle');
	// Augmenter le timeout : la page groupe est plus lourde que /bets/[id]
	await carolPage.waitForTimeout(1000);

	// Vérifier que l'event client a bien été capturé
	const capturedEvents = getCapturedEvents();
	const judgingEvents = capturedEvents.filter((e) => e.event === 'judging_section_viewed');

	expect(judgingEvents.length).toBeGreaterThanOrEqual(1);
	const ev = judgingEvents[0];
	expect(ev.properties).toMatchObject({
		group_id: SEEDED_GROUP_ID,
		bets_count: 1
	});

	await carolContext.close();

	// Cleanup
	void betId;
});

// ─── Test 4 : judging_section_viewed NON émis si aucun pari à juger ──────────

test("[tracking] judging_section_viewed NON émis si Carol n'a pas de paris à juger", async ({
	browser
}) => {
	// Pas de bet à juger créé pour ce test
	const carolContext = await browser.newContext();
	const carolPage = await carolContext.newPage();
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(carolPage);
	await exposeSpyPromise;

	await login(carolPage, 'carol');
	await carolPage.goto(GROUP_URL);

	// S'assurer que la section À juger n'est pas présente (aucun bet en judging pour carol)
	await carolPage.waitForLoadState('networkidle');
	await carolPage.waitForTimeout(300);

	const capturedEvents = getCapturedEvents();
	const judgingEvents = capturedEvents.filter((e) => e.event === 'judging_section_viewed');

	// Aucun event judging_section_viewed si pas de section visible
	expect(judgingEvents).toHaveLength(0);

	await carolContext.close();
});
