/**
 * S-010 — Tracking PostHog (création de groupe)
 *
 * Events instrumentés dans cette story :
 *   - group_created { currency }  (serveur, form action /app/groups/new après transaction DB réussie)
 *
 * Ce spec vérifie :
 *   1. L'event group_created est bien inséré dans le sink analytics_events_test
 *      quand Alice crée un groupe via le formulaire.
 *   2. Le distinct_id correspond à l'id Supabase d'Alice.
 *   3. Les properties contiennent bien la devise sélectionnée (pas de nom = pas de PII).
 *   4. Une validation échouée (nom trop court) ne génère PAS d'event dans le sink.
 */
import { test, expect } from '@playwright/test';
import { db } from './helpers/db';
import { readServerEvents, clearServerEvents } from './helpers/analytics';
import { login } from './helpers/auth';

// ID déterministe d'Alice (cf. supabase/seed.sql)
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Regex correspondant à /app/groups/<uuid>
const GROUP_PAGE_URL_RE = /\/app\/groups\/[0-9a-f-]{36}/;

test.describe('S-010 — Tracking PostHog création de groupe', () => {
	test.beforeEach(async () => {
		await clearServerEvents(db);
	});

	test.afterAll(async () => {
		await clearServerEvents(db);
		// Nettoyage des groupes de test créés
		try {
			await db`DELETE FROM public.group_members
        WHERE group_id IN (SELECT id FROM public.groups WHERE name LIKE '[E2E]%')`;
			await db`DELETE FROM public.groups WHERE name LIKE '[E2E]%'`;
		} catch {
			// Ignore cleanup errors
		}
	});

	// ─── Event serveur group_created ─────────────────────────────────────────────

	test('group_created — event serveur émis après création de groupe réussie (EUR)', async ({
		page
	}) => {
		await login(page, 'alice');

		const groupName = `[E2E] Tracking-EUR-${Date.now()}`;
		await page.goto('/app/groups/new');
		await page.getByTestId('group-name-input').fill(groupName);
		// Devise par défaut : EUR
		await page.getByTestId('submit-create-group').click();
		await page.waitForURL(GROUP_PAGE_URL_RE);

		const events = await readServerEvents(db, { event: 'group_created' });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events.find((e) => e.distinct_id === ALICE_ID);
		expect(ev).toBeDefined();
		expect(ev!.event).toBe('group_created');
		expect(ev!.distinct_id).toBe(ALICE_ID);

		const props = ev!.properties as Record<string, unknown>;
		expect(props['currency']).toBe('EUR');
		// Pas de nom de groupe dans les properties (PII potentiel)
		expect(props['name']).toBeUndefined();
	});

	test('group_created — event serveur émis avec la devise USD sélectionnée', async ({ page }) => {
		await login(page, 'alice');

		const groupName = `[E2E] Tracking-USD-${Date.now()}`;
		await page.goto('/app/groups/new');
		await page.getByTestId('group-name-input').fill(groupName);
		await page.getByTestId('group-currency-select').selectOption('USD');
		await page.getByTestId('submit-create-group').click();
		await page.waitForURL(GROUP_PAGE_URL_RE);

		const events = await readServerEvents(db, { event: 'group_created', distinctId: ALICE_ID });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1]; // le plus récent
		expect(ev.event).toBe('group_created');
		expect(ev.distinct_id).toBe(ALICE_ID);

		const props = ev.properties as Record<string, unknown>;
		expect(props['currency']).toBe('USD');
	});

	test('group_created — distinct_id correspond à user.id Supabase (Alice)', async ({ page }) => {
		await login(page, 'alice');

		await page.goto('/app/groups/new');
		await page.getByTestId('group-name-input').fill(`[E2E] Tracking-ID-${Date.now()}`);
		await page.getByTestId('submit-create-group').click();
		await page.waitForURL(GROUP_PAGE_URL_RE);

		const events = await readServerEvents(db, { event: 'group_created', distinctId: ALICE_ID });
		expect(events.length).toBeGreaterThanOrEqual(1);
		// Tous les events doivent avoir le bon distinct_id
		expect(events.every((e) => e.distinct_id === ALICE_ID)).toBe(true);
	});

	// ─── Absence d'event en cas d'erreur de validation ───────────────────────────

	test("validation échouée (nom trop court) → aucun event group_created dans le sink", async ({
		page
	}) => {
		await login(page, 'alice');
		await page.goto('/app/groups/new');

		// Contourner la validation HTML5 pour déclencher la validation Zod côté serveur
		await page.evaluate(() => {
			const input = document.querySelector('input[name="name"]') as HTMLInputElement;
			if (input) {
				input.removeAttribute('required');
				input.removeAttribute('minlength');
				input.value = 'A';
			}
		});
		await page.getByTestId('submit-create-group').click();

		// Reste sur la page de création
		await expect(page).toHaveURL(/\/app\/groups\/new/);

		// Aucun event group_created ne doit être émis
		const events = await readServerEvents(db, { event: 'group_created' });
		expect(events.length).toBe(0);
	});
});
