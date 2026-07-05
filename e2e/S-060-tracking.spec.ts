/**
 * S-060 — Tracking PostHog (fil d'activité du groupe)
 *
 * Events instrumentés dans cette story :
 *   - activity_feed_viewed (serveur, load function de
 *     /app/groups/[id]/activity, après getGroupActivity)
 *     properties : { group_id, offset, has_more }
 *
 * Ce spec vérifie :
 *   1. activity_feed_viewed est inséré dans le sink analytics_events_test
 *      quand Alice consulte le fil d'activité, avec properties complètes.
 *   2. distinct_id = user.id Supabase d'Alice.
 *   3. properties contient group_id (UUID du groupe seedé), offset (0),
 *      has_more (booléen) — et rien d'autre (pas de PII).
 *   4. has_more reflète réellement la pagination (true si >20 events,
 *      false sinon).
 *   5. Dave (non membre) → 404, aucun event activity_feed_viewed émis.
 *   6. L'émission analytics ne fait jamais rater la page (try/catch) :
 *      vérifié indirectement par le succès du load même si le sink DB
 *      est temporairement indisponible — non reproduit ici, c'est le
 *      comportement nominal qu'on valide.
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { readServerEvents, clearServerEvents } from './helpers/analytics';

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const ACTIVITY_URL = `/app/groups/${SEEDED_GROUP_ID}/activity`;

const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

/** Récupère le user.id Supabase d'alice depuis la DB (vérifie la cohérence). */
async function getAliceId(): Promise<string> {
	const rows = await db`SELECT id FROM auth.users WHERE email = 'alice@test.local' LIMIT 1`;
	if (!rows[0]) throw new Error('alice@test.local not found in DB');
	return String(rows[0].id);
}

test.describe('S-060 — Tracking PostHog fil d activité', () => {
	test.beforeEach(async () => {
		await clearServerEvents(db);
	});

	test.afterAll(async () => {
		await clearServerEvents(db);
	});

	test('activity_feed_viewed — event serveur émis quand Alice consulte le fil', async ({
		page
	}) => {
		await login(page, 'alice');
		const aliceId = await getAliceId();

		await page.goto(ACTIVITY_URL);
		await expect(page.getByTestId('activity-title')).toBeVisible();

		const events = await readServerEvents(db, {
			event: 'activity_feed_viewed',
			distinctId: aliceId
		});
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[0];
		expect(ev.event).toBe('activity_feed_viewed');
		expect(ev.distinct_id).toBe(aliceId);

		const props = ev.properties as Record<string, unknown>;
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
		expect(props['offset']).toBe(0);
		expect(typeof props['has_more']).toBe('boolean');
	});

	test('activity_feed_viewed — distinct_id est le UUID Supabase valide d Alice', async ({
		page
	}) => {
		await login(page, 'alice');
		const aliceId = await getAliceId();

		await page.goto(ACTIVITY_URL);
		await expect(page.getByTestId('activity-title')).toBeVisible();

		const events = await readServerEvents(db, {
			event: 'activity_feed_viewed',
			distinctId: aliceId
		});
		expect(events.length).toBeGreaterThanOrEqual(1);
		expect(events[0].distinct_id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		);
		expect(events[0].distinct_id).toBe(aliceId);
	});

	test('activity_feed_viewed — pas de PII dans les properties', async ({ page }) => {
		await login(page, 'alice');
		const aliceId = await getAliceId();

		await page.goto(ACTIVITY_URL);
		await expect(page.getByTestId('activity-title')).toBeVisible();

		const events = await readServerEvents(db, {
			event: 'activity_feed_viewed',
			distinctId: aliceId
		});
		expect(events.length).toBeGreaterThanOrEqual(1);

		const props = events[0].properties as Record<string, unknown>;
		const keys = Object.keys(props).sort();
		// Schéma attendu : uniquement ces 3 clés, aucune donnée personnelle.
		expect(keys).toEqual(['group_id', 'has_more', 'offset']);

		// Aucune valeur ne doit contenir un email ou le nom d'utilisateur.
		const serialized = JSON.stringify(props);
		expect(serialized).not.toMatch(/@/);
		expect(serialized).not.toMatch(/alice/i);
		expect(serialized).not.toMatch(/test\.local/i);
	});

	test('activity_feed_viewed — has_more reflète la pagination', async ({ page }) => {
		await login(page, 'alice');
		const aliceId = await getAliceId();

		// Nettoyer au cas où des paris [E2E] subsistent, puis peupler 25 paris
		// visibles par Alice (>20 → has_more=true sur la 1ère page).
		await db`DELETE FROM public.match_participants WHERE match_id IN (
			SELECT m.id FROM public.matches m
			JOIN public.bets b ON b.id = m.bet_id
			WHERE b.title LIKE '[E2E]%'
		)`;
		await db`DELETE FROM public.match_jurors WHERE match_id IN (
			SELECT m.id FROM public.matches m
			JOIN public.bets b ON b.id = m.bet_id
			WHERE b.title LIKE '[E2E]%'
		)`;
		await db`DELETE FROM public.match_winners WHERE match_id IN (
			SELECT m.id FROM public.matches m
			JOIN public.bets b ON b.id = m.bet_id
			WHERE b.title LIKE '[E2E]%'
		)`;
		await db`DELETE FROM public.matches WHERE bet_id IN (
			SELECT id FROM public.bets WHERE title LIKE '[E2E]%'
		)`;
		await db`DELETE FROM public.bet_visibility WHERE bet_id IN (
			SELECT id FROM public.bets WHERE title LIKE '[E2E]%'
		)`;
		await db`DELETE FROM public.bets WHERE title LIKE '[E2E]%'`;

		await clearServerEvents(db);

		for (let i = 0; i < 25; i++) {
			const minutesAgo = i + 1;
			const [bet] = await db`
				INSERT INTO public.bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status, created_at)
				VALUES (${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', '[E2E] Track ' || ${String(i)}, 'points', '10', false, 'majority', 'open', now() - (${minutesAgo} * interval '1 minute'))
				RETURNING id
			`;
			await db`
				INSERT INTO public.bet_visibility (bet_id, user_id)
				VALUES (${bet.id}, ${ALICE_ID})
			`;
			await db`
				INSERT INTO public.matches (bet_id, status, created_at)
				VALUES (${bet.id}, 'open', now() - (${minutesAgo} * interval '1 minute'))
			`;
		}

		await page.goto(ACTIVITY_URL);
		await expect(page.getByTestId('load-more-btn')).toBeVisible();

		const events = await readServerEvents(db, {
			event: 'activity_feed_viewed',
			distinctId: aliceId
		});
		expect(events.length).toBeGreaterThanOrEqual(1);
		const props = events[0].properties as Record<string, unknown>;
		expect(props['has_more']).toBe(true);
		expect(props['offset']).toBe(0);

		// Nettoyage
		await db`DELETE FROM public.match_participants WHERE match_id IN (
			SELECT m.id FROM public.matches m
			JOIN public.bets b ON b.id = m.bet_id
			WHERE b.title LIKE '[E2E]%'
		)`;
		await db`DELETE FROM public.matches WHERE bet_id IN (
			SELECT id FROM public.bets WHERE title LIKE '[E2E]%'
		)`;
		await db`DELETE FROM public.bet_visibility WHERE bet_id IN (
			SELECT id FROM public.bets WHERE title LIKE '[E2E]%'
		)`;
		await db`DELETE FROM public.bets WHERE title LIKE '[E2E]%'`;
	});

	test('activity_feed_viewed — Dave (non membre) → aucun event émis', async ({ page }) => {
		await login(page, 'dave');

		// Dave n'est pas membre du groupe → 404 avant captureServer.
		await page.goto(ACTIVITY_URL);
		await expect(page.getByRole('heading', { name: '404' })).toBeVisible();

		const events = await readServerEvents(db, { event: 'activity_feed_viewed' });
		expect(events.length).toBe(0);
	});
});
