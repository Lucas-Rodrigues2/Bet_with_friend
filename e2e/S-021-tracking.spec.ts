/**
 * S-021 — Tracking PostHog (participer à un closest)
 *
 * Events instrumentés dans cette story :
 *   Serveur :
 *     - bet_participated         { bet_id, match_id, group_id, bet_type='closest', stake_type }
 *       — émis après upsert dans match_participants (première participation)
 *     - bet_participation_updated { bet_id, match_id, group_id, bet_type='closest', stake_type }
 *       — émis après upsert dans match_participants (modification)
 *   Client :
 *     - bet_viewed               { bet_id, bet_type, group_id }
 *       — au montage de la page /bets/[betId] (instrumenté dans +page.svelte)
 *
 * Ce spec vérifie l'envoi réel de chaque event.
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { interceptPosthog, readServerEvents, clearServerEvents } from './helpers/analytics';

// IDs seedés (cf. supabase/seed.sql)
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;

// ─── Helper DB ────────────────────────────────────────────────────────────────

/**
 * Insère un pari closest en DB et retourne { betId, matchId }.
 * Alice est créatrice. Visibilité : alice + bob + carol. Juré : carol.
 */
async function createClosestBet(opts: {
	title: string;
	hideAnswers?: boolean;
	stakeAmount?: string;
}): Promise<{ betId: string; matchId: string }> {
	const { title, hideAnswers = true, stakeAmount = '10' } = opts;

	const [bet] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status)
    VALUES (
      ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', ${title},
      'points', ${stakeAmount}, ${hideAnswers}, 'majority', 'open'
    )
    RETURNING id
  `;

	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    VALUES (${bet.id}, ${ALICE_ID}), (${bet.id}, ${BOB_ID}), (${bet.id}, ${CAROL_ID})
  `;

	const [match] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'open') RETURNING id
  `;

	await db`
    INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})
  `;

	return { betId: bet.id, matchId: match.id };
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

test.beforeEach(async () => {
	await clearServerEvents(db);
});

test.afterEach(async () => {
	try {
		await db`DELETE FROM public.bets WHERE title LIKE '[E2E-tracking-021]%'`;
	} catch {
		// Ignore
	}
});

test.afterAll(async () => {
	await clearServerEvents(db);
	try {
		await db`DELETE FROM public.bets WHERE title LIKE '[E2E-tracking-021]%'`;
	} catch {
		// Ignore
	}
});

// ─── Event serveur : bet_participated ────────────────────────────────────────

test('bet_participated — event serveur émis après première participation (Alice)', async ({
	page
}) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E-tracking-021] Alice participe première fois'
	});

	await login(page, 'alice');
	await page.goto(`${GROUP_URL}/bets/${betId}`);
	await page.waitForLoadState('networkidle');

	await page.getByTestId('answer-input').fill('42');
	await page.getByTestId('participate-btn').click();

	// Attendre la fin de la soumission (bouton passe à "Modifier")
	await expect(page.getByTestId('participate-btn')).toHaveText('Modifier', { timeout: 10000 });

	const events = await readServerEvents(db, { event: 'bet_participated', distinctId: ALICE_ID });
	expect(events.length).toBeGreaterThanOrEqual(1);

	const ev = events[events.length - 1];
	expect(ev.event).toBe('bet_participated');
	expect(ev.distinct_id).toBe(ALICE_ID);

	const props = ev.properties as Record<string, unknown>;
	expect(props['bet_id']).toBe(betId);
	expect(props['match_id']).toBe(matchId);
	expect(props['group_id']).toBe(SEEDED_GROUP_ID);
	expect(props['bet_type']).toBe('closest');
	expect(props['stake_type']).toBe('points');
});

test('bet_participated — distinct_id = UUID Supabase de Bob (pas de PII)', async ({ browser }) => {
	const { betId } = await createClosestBet({
		title: '[E2E-tracking-021] Bob participe distinct_id'
	});

	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);
	await bobPage.waitForLoadState('networkidle');

	await bobPage.getByTestId('answer-input').fill('99');
	await bobPage.getByTestId('participate-btn').click();

	await expect(bobPage.getByTestId('participate-btn')).toHaveText('Modifier', { timeout: 10000 });

	await bobContext.close();

	const events = await readServerEvents(db, { event: 'bet_participated', distinctId: BOB_ID });
	expect(events.length).toBeGreaterThanOrEqual(1);

	const ev = events[events.length - 1];
	// distinct_id doit être un UUID Supabase valide
	expect(ev.distinct_id).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
	);
	expect(ev.distinct_id).toBe(BOB_ID);

	// Pas de PII (email) dans les properties
	const propsStr = JSON.stringify(ev.properties);
	expect(propsStr).not.toContain('bob@test.local');
	expect(propsStr).not.toContain('@');
});

test('bet_participated — aucun event si champ vide (validation bloque)', async ({ page }) => {
	const { betId } = await createClosestBet({
		title: '[E2E-tracking-021] Estimation vide pas event'
	});

	await login(page, 'alice');
	await page.goto(`${GROUP_URL}/bets/${betId}`);
	await page.waitForLoadState('networkidle');

	// Soumettre sans remplir (HTML5 required empêche la soumission)
	await page.getByTestId('participate-btn').click();

	// Rester sur la page
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));

	const events = await readServerEvents(db, { event: 'bet_participated' });
	expect(events.length).toBe(0);
});

// ─── Event serveur : bet_participation_updated ────────────────────────────────

test('bet_participation_updated — event serveur émis quand Bob modifie son estimation', async ({
	browser
}) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E-tracking-021] Bob modifie estimation event'
	});

	// Bob participe d'abord en DB
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${BOB_ID}, '100', '10')
  `;

	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);
	await bobPage.waitForLoadState('networkidle');

	// Bob modifie son estimation
	await bobPage.getByTestId('answer-input').fill('77');
	await bobPage.getByTestId('participate-btn').click();

	// Attendre la mise à jour (la valeur 77 doit apparaître dans la liste des participants)
	const bobItem = bobPage.getByTestId('participant-item').filter({ hasText: 'Bob' });
	await expect(bobItem.getByTestId('participant-answer')).toHaveText('77', { timeout: 10000 });

	await bobContext.close();

	const events = await readServerEvents(db, {
		event: 'bet_participation_updated',
		distinctId: BOB_ID
	});
	expect(events.length).toBeGreaterThanOrEqual(1);

	const ev = events[events.length - 1];
	expect(ev.event).toBe('bet_participation_updated');
	expect(ev.distinct_id).toBe(BOB_ID);

	const props = ev.properties as Record<string, unknown>;
	expect(props['bet_id']).toBe(betId);
	expect(props['match_id']).toBe(matchId);
	expect(props['group_id']).toBe(SEEDED_GROUP_ID);
	expect(props['bet_type']).toBe('closest');
	expect(props['stake_type']).toBe('points');
});

test('bet_participation_updated — pas de bet_participated lors d\'une modification', async ({
	browser
}) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E-tracking-021] Modification = updated pas created'
	});

	// Alice a déjà participé
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${ALICE_ID}, '10', '10')
  `;

	const aliceContext = await browser.newContext();
	const alicePage = await aliceContext.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage.waitForLoadState('networkidle');

	// Alice modifie
	await alicePage.getByTestId('answer-input').fill('55');
	await alicePage.getByTestId('participate-btn').click();

	const aliceItem = alicePage.getByTestId('participant-item').filter({ hasText: 'Alice' });
	await expect(aliceItem.getByTestId('participant-answer')).toHaveText('55', { timeout: 10000 });

	await aliceContext.close();

	// Doit y avoir un event bet_participation_updated mais PAS bet_participated
	const updatedEvents = await readServerEvents(db, {
		event: 'bet_participation_updated',
		distinctId: ALICE_ID
	});
	expect(updatedEvents.length).toBeGreaterThanOrEqual(1);

	const participatedEvents = await readServerEvents(db, {
		event: 'bet_participated',
		distinctId: ALICE_ID
	});
	expect(participatedEvents.length).toBe(0);
});

// ─── Event client : bet_viewed ────────────────────────────────────────────────

test('bet_viewed — event client capturé quand Alice visite la page d\'un closest', async ({
	page
}) => {
	const { betId } = await createClosestBet({
		title: '[E2E-tracking-021] bet_viewed Alice'
	});

	// interceptPosthog AVANT toute navigation
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
	await exposeSpyPromise;

	await login(page, 'alice');
	await page.goto(`${GROUP_URL}/bets/${betId}`);
	await page.waitForLoadState('networkidle');
	// Attendre l'hydratation Svelte et le $effect
	await page.waitForTimeout(500);

	const events = getCapturedEvents();
	const ev = events.find((e) => e.event === 'bet_viewed');
	expect(ev).toBeDefined();
	expect(ev!.properties['bet_id']).toBe(betId);
	expect(ev!.properties['bet_type']).toBe('closest');
	expect(ev!.properties['group_id']).toBe(SEEDED_GROUP_ID);
});

test('bet_viewed — event client capturé quand Bob visite le pari (membre de la liste)', async ({
	browser
}) => {
	const { betId } = await createClosestBet({
		title: '[E2E-tracking-021] bet_viewed Bob'
	});

	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();

	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(bobPage);
	await exposeSpyPromise;

	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);
	await bobPage.waitForLoadState('networkidle');
	await bobPage.waitForTimeout(500);

	const events = getCapturedEvents();
	const ev = events.find((e) => e.event === 'bet_viewed');
	expect(ev).toBeDefined();
	expect(ev!.properties['bet_id']).toBe(betId);
	expect(ev!.properties['bet_type']).toBe('closest');
	expect(ev!.properties['group_id']).toBe(SEEDED_GROUP_ID);

	await bobContext.close();
});
