/**
 * S-013 — Tracking PostHog (page groupe / dashboard)
 *
 * Events instrumentés dans cette story :
 *   - group_viewed         (serveur, load function de /app/groups/[id], après vérification membre)
 *   - new_bet_menu_opened  (client, clic sur « Nouveau pari ▾ »)
 *   - new_bet_type_selected (client, clic sur un type de pari dans le menu, property type)
 *
 * Ce spec vérifie :
 *   1. group_viewed est inséré dans le sink analytics_events_test quand Alice
 *      consulte la page de son groupe, avec group_id et role dans les properties.
 *   2. new_bet_menu_opened est intercepté côté navigateur (posthog-js) avec group_id.
 *   3. new_bet_type_selected est intercepté avec group_id et type = 'closest' ou 'yesno'.
 *   4. distinct_id = user.id Supabase d'Alice.
 *   5. Un non-membre (Dave) accédant au groupe → pas d'event group_viewed.
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { interceptPosthog, readServerEvents, clearServerEvents } from './helpers/analytics';

// ID du groupe seedé "Les potes du test"
// Alice (admin), Bob (member), Carol (member) — Dave n'est PAS membre
const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;

/** Récupère le user.id Supabase d'alice depuis la DB. */
async function getAliceId(): Promise<string> {
	const rows = await db`SELECT id FROM auth.users WHERE email = 'alice@test.local' LIMIT 1`;
	if (!rows[0]) throw new Error('alice@test.local not found in DB');
	return String(rows[0].id);
}

test.describe('S-013 — Tracking PostHog page groupe', () => {
	test.beforeEach(async () => {
		await clearServerEvents(db);
	});

	test.afterAll(async () => {
		await clearServerEvents(db);
	});

	// ─── Event serveur : group_viewed ────────────────────────────────────────────

	test('group_viewed — event serveur émis quand Alice consulte son groupe', async ({ page }) => {
		await login(page, 'alice');
		const aliceId = await getAliceId();

		await page.goto(GROUP_URL);
		// Attendre que la page soit chargée
		await expect(page.getByTestId('group-name')).toHaveText('Les potes du test');

		const events = await readServerEvents(db, { event: 'group_viewed' });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events.find((e) => e.distinct_id === aliceId);
		expect(ev).toBeDefined();
		expect(ev!.event).toBe('group_viewed');
		expect(ev!.distinct_id).toBe(aliceId);

		const props = ev!.properties as Record<string, unknown>;
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
		// Role d'Alice : admin
		expect(props['role']).toBe('admin');
	});

	test("group_viewed — distinct_id est le UUID Supabase valide d'Alice", async ({ page }) => {
		await login(page, 'alice');
		const aliceId = await getAliceId();

		await page.goto(GROUP_URL);
		await expect(page.getByTestId('group-name')).toBeVisible();

		const events = await readServerEvents(db, { event: 'group_viewed', distinctId: aliceId });
		expect(events.length).toBeGreaterThanOrEqual(1);
		// Format UUID v4
		expect(events[0].distinct_id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		);
		expect(events[0].distinct_id).toBe(aliceId);
	});

	test('group_viewed — Bob (membre simple) génère aussi un event avec role=member', async ({
		page
	}) => {
		await login(page, 'bob');
		const rows = await db`SELECT id FROM auth.users WHERE email = 'bob@test.local' LIMIT 1`;
		const bobId = String(rows[0].id);

		await page.goto(GROUP_URL);
		await expect(page.getByTestId('group-name')).toHaveText('Les potes du test');

		const events = await readServerEvents(db, { event: 'group_viewed', distinctId: bobId });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const props = events[0].properties as Record<string, unknown>;
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
		expect(props['role']).toBe('member');
	});

	test('group_viewed — Dave (non membre) → aucun event group_viewed dans le sink', async ({
		page
	}) => {
		await login(page, 'dave');

		// Dave tente d'accéder au groupe → 404, la load function rejette avant captureServer
		await page.goto(GROUP_URL);
		await expect(page.getByRole('heading', { name: '404' })).toBeVisible();

		const events = await readServerEvents(db, { event: 'group_viewed' });
		// Aucun event ne doit être présent pour Dave
		expect(events.length).toBe(0);
	});

	// ─── Events client : new_bet_menu_opened ─────────────────────────────────────

	test('new_bet_menu_opened — event client intercepté au clic sur « Nouveau pari »', async ({
		page
	}) => {
		const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
		await exposeSpyPromise; // Attendre que le spy soit enregistré avant navigation

		await login(page, 'alice');
		await page.goto(GROUP_URL);
		await expect(page.getByTestId('new-bet-btn')).toBeVisible();
		// Attendre l'hydratation Svelte (les event listeners sont attachés après le rendu SSR)
		await page.waitForTimeout(500);

		await page.getByTestId('new-bet-btn').click();
		// Laisser le temps au spy d'être appelé (synchrone via window.__playwright_trackSpy)
		await page.waitForTimeout(300);

		const events = getCapturedEvents();
		const ev = events.find((e) => e.event === 'new_bet_menu_opened');
		expect(ev).toBeDefined();
		expect(ev!.properties['group_id']).toBe(SEEDED_GROUP_ID);
	});

	// ─── Events client : new_bet_type_selected ────────────────────────────────────

	test('new_bet_type_selected — event client avec type=closest au clic « Au plus proche »', async ({
		page
	}) => {
		const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
		await exposeSpyPromise;

		await login(page, 'alice');
		await page.goto(GROUP_URL);
		await expect(page.getByTestId('new-bet-btn')).toBeVisible();
		// Attendre l'hydratation Svelte
		await page.waitForTimeout(500);

		// Ouvrir le menu
		await page.getByTestId('new-bet-btn').click();
		// Attendre que le menu soit dans le DOM
		await expect(page.getByTestId('new-bet-closest')).toBeVisible();

		// Cliquer sur le lien — le spy est appelé syncronement avant la navigation
		await page.getByTestId('new-bet-closest').click();
		await page.waitForTimeout(300);

		const events = getCapturedEvents();
		const ev = events.find((e) => e.event === 'new_bet_type_selected');
		expect(ev).toBeDefined();
		expect(ev!.properties['group_id']).toBe(SEEDED_GROUP_ID);
		expect(ev!.properties['type']).toBe('closest');
	});

	test('new_bet_type_selected — event client avec type=yesno au clic « Oui / Non »', async ({
		page
	}) => {
		const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
		await exposeSpyPromise;

		await login(page, 'alice');
		await page.goto(GROUP_URL);
		await expect(page.getByTestId('new-bet-btn')).toBeVisible();
		// Attendre l'hydratation Svelte
		await page.waitForTimeout(500);

		// Ouvrir le menu
		await page.getByTestId('new-bet-btn').click();
		// Attendre que le menu soit dans le DOM
		await expect(page.getByTestId('new-bet-yesno')).toBeVisible();

		// Cliquer sur le lien — le spy est appelé synchronement avant la navigation
		await page.getByTestId('new-bet-yesno').click();
		await page.waitForTimeout(300);

		const events = getCapturedEvents();
		const ev = events.find((e) => e.event === 'new_bet_type_selected');
		expect(ev).toBeDefined();
		expect(ev!.properties['group_id']).toBe(SEEDED_GROUP_ID);
		expect(ev!.properties['type']).toBe('yesno');
	});
});
