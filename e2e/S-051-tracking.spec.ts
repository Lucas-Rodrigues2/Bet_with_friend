/**
 * S-051 — Tracking PostHog : Gages (accomplissement & confirmation)
 *
 * Events instrumentés :
 *   Serveur :
 *     - forfeit_claimed        { bet_id, forfeit_id, has_proof }
 *       — émis après claimForfeit() (débiteur déclare son gage fait)
 *     - forfeit_confirmed      { bet_id, forfeit_id }
 *       — émis après confirmForfeit() (gagnant confirme)
 *     - forfeit_rejected       { bet_id, forfeit_id }
 *       — émis après rejectForfeit() (gagnant refuse)
 *     - forfeit_marked_not_done { bet_id, forfeit_id }
 *       — émis après markForfeitNotDone() (gagnant marque non tenu)
 *
 *   Client :
 *     - forfeits_section_viewed : DIFFÉRÉ (3 tentatives échouées — voir TRACKER RAPPORT S-051)
 *
 * Stratégie :
 *   - Serveur : clearServerEvents() + readServerEvents(db, { event }) via sink DB
 *
 * Chaque test est indépendant : clearServerEvents + cleanup afterEach.
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

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Creates a yesno forfeit duel already resolved.
 * Alice = gagnante (camp A), Bob = débiteur/perdant (camp B), Carol = jurée.
 * Returns betId, matchId and forfeitId.
 */
async function createResolvedForfeitDuel(opts: {
	title: string;
	forfeitDescription?: string;
}): Promise<{ betId: string; matchId: string; forfeitId: string }> {
	const { title, forfeitDescription = 'Faire la vaisselle' } = opts;

	const [bet] = await db`
		INSERT INTO bets (group_id, creator_id, type, title, stake_type, forfeit_description, hide_answers, jury_mode, status)
		VALUES (
			${SEEDED_GROUP_ID}, ${ALICE_ID}, 'yesno', ${title},
			'forfeit', ${forfeitDescription}, false, 'majority', 'open'
		)
		RETURNING id
	`;

	await db`INSERT INTO yesno_bets (bet_id, mode, creator_side, choice_a, choice_b, accepted_count, max_opponents)
		VALUES (${bet.id}, 'duel', 'a', 'Oui', 'Non', 1, 1)`;

	await db`
		INSERT INTO bet_visibility (bet_id, user_id)
		SELECT ${bet.id}, unnest(${db.array([ALICE_ID, BOB_ID, CAROL_ID])}::uuid[])
	`;

	await db`
		INSERT INTO propositions (bet_id, target_id, last_proposer_id, forfeit_creator, forfeit_target, status)
		VALUES (${bet.id}, ${BOB_ID}, ${BOB_ID}, 'Faire le café', ${forfeitDescription}, 'accepted')
	`;

	const [match] = await db`
		INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'resolved') RETURNING id
	`;

	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})`;

	await db`
		INSERT INTO match_participants (match_id, user_id, side)
		VALUES (${match.id}, ${ALICE_ID}, 'a'), (${match.id}, ${BOB_ID}, 'b')
	`;

	// Alice est gagnante
	await db`INSERT INTO match_winners (match_id, user_id) VALUES (${match.id}, ${ALICE_ID})`;

	// Bob a un gage pending
	const [forfeit] = await db`
		INSERT INTO forfeits (match_id, debtor_id) VALUES (${match.id}, ${BOB_ID}) RETURNING id
	`;

	return { betId: bet.id, matchId: match.id, forfeitId: forfeit.id };
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

test.afterEach(async () => {
	await db`DELETE FROM public.bets WHERE title LIKE '[E2E-tracking-051]%'`;
	await clearServerEvents(db);
});

// ─── Event serveur : forfeit_claimed (has_proof=false) ───────────────────────

test('[tracking] forfeit_claimed — has_proof=false : émis après déclaration par Bob sans preuve', async ({
	browser
}) => {
	const { betId, forfeitId } = await createResolvedForfeitDuel({
		title: '[E2E-tracking-051] forfeit_claimed no proof'
	});

	await clearServerEvents(db);

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);
	await bobPage.waitForLoadState('networkidle');

	// Bob ouvre le formulaire de déclaration et soumet sans preuve
	await bobPage.getByTestId('show-claim-btn').click();
	await expect(bobPage.getByTestId('claim-form')).toBeVisible();

	const [response] = await Promise.all([
		bobPage.waitForResponse(
			(r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		bobPage.getByTestId('claim-btn').click()
	]);
	expect(response.status()).toBe(200);
	await bobPage.waitForLoadState('networkidle');

	// Vérifier l'event serveur forfeit_claimed
	const events = await readServerEvents(db, { event: 'forfeit_claimed' });
	expect(events).toHaveLength(1);

	const ev = events[0];
	expect(ev.distinct_id).toBe(BOB_ID);
	expect(ev.event).toBe('forfeit_claimed');
	expect(ev.properties).toMatchObject({
		bet_id: betId,
		forfeit_id: forfeitId,
		has_proof: false
	});

	await bobCtx.close();
});

// ─── Event serveur : forfeit_confirmed ────────────────────────────────────────

test('[tracking] forfeit_confirmed — émis après confirmation par Alice (distinct_id=Alice)', async ({
	browser
}) => {
	const { betId, forfeitId } = await createResolvedForfeitDuel({
		title: '[E2E-tracking-051] forfeit_confirmed'
	});

	// Bob marque fait directement en DB (éviter double test)
	await db`UPDATE forfeits SET claimed_at = now() WHERE id = ${forfeitId}`;

	await clearServerEvents(db);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage.waitForLoadState('networkidle');

	// Alice voit le bouton Confirmer et clique
	await expect(alicePage.getByTestId('confirm-forfeit-btn')).toBeVisible();

	const [response] = await Promise.all([
		alicePage.waitForResponse(
			(r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		alicePage.getByTestId('confirm-forfeit-btn').click()
	]);
	expect(response.status()).toBe(200);
	await alicePage.waitForLoadState('networkidle');

	// Vérifier l'event serveur forfeit_confirmed
	const events = await readServerEvents(db, { event: 'forfeit_confirmed' });
	expect(events).toHaveLength(1);

	const ev = events[0];
	expect(ev.distinct_id).toBe(ALICE_ID);
	expect(ev.event).toBe('forfeit_confirmed');
	expect(ev.properties).toMatchObject({
		bet_id: betId,
		forfeit_id: forfeitId
	});

	// Pas d'event pour Bob (pas lui qui confirme)
	const bobEvents = await readServerEvents(db, { event: 'forfeit_confirmed', distinctId: BOB_ID });
	expect(bobEvents).toHaveLength(0);

	await aliceCtx.close();
});

// ─── Event serveur : forfeit_rejected ────────────────────────────────────────

test('[tracking] forfeit_rejected — émis après refus par Alice', async ({ browser }) => {
	const { betId, forfeitId } = await createResolvedForfeitDuel({
		title: '[E2E-tracking-051] forfeit_rejected'
	});

	// Bob marque fait directement en DB
	await db`UPDATE forfeits SET claimed_at = now() WHERE id = ${forfeitId}`;

	await clearServerEvents(db);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage.waitForLoadState('networkidle');

	// Alice voit le bouton Refuser et clique
	await expect(alicePage.getByTestId('reject-forfeit-btn')).toBeVisible();

	const [response] = await Promise.all([
		alicePage.waitForResponse(
			(r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		alicePage.getByTestId('reject-forfeit-btn').click()
	]);
	expect(response.status()).toBe(200);
	await alicePage.waitForLoadState('networkidle');

	// Vérifier l'event serveur forfeit_rejected
	const events = await readServerEvents(db, { event: 'forfeit_rejected' });
	expect(events).toHaveLength(1);

	const ev = events[0];
	expect(ev.distinct_id).toBe(ALICE_ID);
	expect(ev.event).toBe('forfeit_rejected');
	expect(ev.properties).toMatchObject({
		bet_id: betId,
		forfeit_id: forfeitId
	});

	await aliceCtx.close();
});

// ─── Event serveur : forfeit_marked_not_done ─────────────────────────────────

test('[tracking] forfeit_marked_not_done — émis après marquage non tenu par Alice', async ({
	browser
}) => {
	const { betId, forfeitId } = await createResolvedForfeitDuel({
		title: '[E2E-tracking-051] forfeit_marked_not_done'
	});

	await clearServerEvents(db);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage.waitForLoadState('networkidle');

	// Alice voit le bouton "Gage non tenu" et clique (sans claim préalable, autorisé)
	await expect(alicePage.getByTestId('not-done-forfeit-btn')).toBeVisible();

	const [response] = await Promise.all([
		alicePage.waitForResponse(
			(r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		alicePage.getByTestId('not-done-forfeit-btn').click()
	]);
	expect(response.status()).toBe(200);
	await alicePage.waitForLoadState('networkidle');

	// Vérifier l'event serveur forfeit_marked_not_done
	const events = await readServerEvents(db, { event: 'forfeit_marked_not_done' });
	expect(events).toHaveLength(1);

	const ev = events[0];
	expect(ev.distinct_id).toBe(ALICE_ID);
	expect(ev.event).toBe('forfeit_marked_not_done');
	expect(ev.properties).toMatchObject({
		bet_id: betId,
		forfeit_id: forfeitId
	});

	await aliceCtx.close();
});
