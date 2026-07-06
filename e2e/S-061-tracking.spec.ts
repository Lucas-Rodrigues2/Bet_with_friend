/**
 * S-061 — Tracking PostHog (leaderboard & stats)
 *
 * Events instrumentés dans cette story :
 *   - leaderboard_viewed (serveur, load function de
 *     /app/groups/[id]/leaderboard, après getGroupLeaderboard)
 *     properties : { group_id, period }
 *   - leaderboard_viewed_client (client, $effect au mount de la page)
 *     properties : { group_id, period } — vérifié via spy navigateur.
 *
 * Ce spec vérifie :
 *   1. leaderboard_viewed est inséré dans le sink analytics_events_test
 *      quand Alice consulte le classement, avec properties complètes.
 *   2. distinct_id = user.id Supabase d'Alice.
 *   3. properties contient group_id (UUID) et period ('all' | '30d') — et
 *      rien d'autre (pas de PII).
 *   4. Les deux périodes 'all' et '30d' émettent l'event avec la bonne valeur.
 *   5. Dave (non membre) → 404, aucun event émis.
 *   6. L'event client leaderboard_viewed_client est émis au mount (spy).
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import {
	readServerEvents,
	clearServerEvents,
	interceptPosthog
} from './helpers/analytics';

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const LEADERBOARD_URL = `/app/groups/${SEEDED_GROUP_ID}/leaderboard`;

/** Récupère le user.id Supabase d'alice depuis la DB (vérifie la cohérence). */
async function getAliceId(): Promise<string> {
	const rows = await db`SELECT id FROM auth.users WHERE email = 'alice@test.local' LIMIT 1`;
	if (!rows[0]) throw new Error('alice@test.local not found in DB');
	return String(rows[0].id);
}

test.describe('S-061 — Tracking PostHog leaderboard', () => {
	test.beforeEach(async () => {
		await clearServerEvents(db);
	});

	test.afterAll(async () => {
		await clearServerEvents(db);
	});

	test('leaderboard_viewed — event serveur émis quand Alice consulte le classement (period=all)', async ({
		page
	}) => {
		await login(page, 'alice');
		const aliceId = await getAliceId();

		await page.goto(`${LEADERBOARD_URL}?period=all`);
		await expect(page.getByTestId('leaderboard-title')).toBeVisible();

		const events = await readServerEvents(db, {
			event: 'leaderboard_viewed',
			distinctId: aliceId
		});
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[0];
		expect(ev.event).toBe('leaderboard_viewed');
		expect(ev.distinct_id).toBe(aliceId);

		const props = ev.properties as Record<string, unknown>;
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
		expect(props['period']).toBe('all');
	});

	test('leaderboard_viewed — period=30d émet l event avec la bonne valeur', async ({ page }) => {
		await login(page, 'alice');
		const aliceId = await getAliceId();

		await page.goto(`${LEADERBOARD_URL}?period=30d`);
		await expect(page.getByTestId('leaderboard-title')).toBeVisible();

		const events = await readServerEvents(db, {
			event: 'leaderboard_viewed',
			distinctId: aliceId
		});
		expect(events.length).toBeGreaterThanOrEqual(1);

		const props = events[0].properties as Record<string, unknown>;
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
		expect(props['period']).toBe('30d');
	});

	test('leaderboard_viewed — distinct_id est le UUID Supabase valide d Alice', async ({
		page
	}) => {
		await login(page, 'alice');
		const aliceId = await getAliceId();

		await page.goto(LEADERBOARD_URL);
		await expect(page.getByTestId('leaderboard-title')).toBeVisible();

		const events = await readServerEvents(db, {
			event: 'leaderboard_viewed',
			distinctId: aliceId
		});
		expect(events.length).toBeGreaterThanOrEqual(1);
		expect(events[0].distinct_id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		);
		expect(events[0].distinct_id).toBe(aliceId);
	});

	test('leaderboard_viewed — pas de PII dans les properties', async ({ page }) => {
		await login(page, 'alice');
		const aliceId = await getAliceId();

		await page.goto(LEADERBOARD_URL);
		await expect(page.getByTestId('leaderboard-title')).toBeVisible();

		const events = await readServerEvents(db, {
			event: 'leaderboard_viewed',
			distinctId: aliceId
		});
		expect(events.length).toBeGreaterThanOrEqual(1);

		const props = events[0].properties as Record<string, unknown>;
		const keys = Object.keys(props).sort();
		// Schéma attendu : uniquement group_id et period, aucune donnée perso.
		expect(keys).toEqual(['group_id', 'period']);

		// Aucune valeur ne doit contenir un email ou le nom d'utilisateur.
		const serialized = JSON.stringify(props);
		expect(serialized).not.toMatch(/@/);
		expect(serialized).not.toMatch(/alice/i);
		expect(serialized).not.toMatch(/test\.local/i);
	});

	test('leaderboard_viewed — Dave (non membre) → 404, aucun event émis', async ({ page }) => {
		await login(page, 'dave');

		await page.goto(LEADERBOARD_URL);
		await expect(page.getByRole('heading', { name: '404' })).toBeVisible();

		const events = await readServerEvents(db, { event: 'leaderboard_viewed' });
		expect(events.length).toBe(0);
	});

	test('leaderboard_viewed_client — event client émis au mount de la page', async ({ browser }) => {
		const ctx = await browser.newContext();
		const page = await ctx.newPage();
		const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
		await exposeSpyPromise;

		await login(page, 'alice');
		await page.goto(`${LEADERBOARD_URL}?period=30d`);
		await expect(page.getByTestId('leaderboard-title')).toBeVisible();

		// L'event client doit être émis au mount avec group_id + period.
		await expect.poll(() => getCapturedEvents().some((e) => e.event === 'leaderboard_viewed_client'))
			.toBe(true);
		const clientEvent = getCapturedEvents().find(
			(e) => e.event === 'leaderboard_viewed_client'
		);
		expect(clientEvent).toBeTruthy();
		const props = clientEvent!.properties as Record<string, unknown>;
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
		expect(props['period']).toBe('30d');

		await ctx.close();
	});
});
