/**
 * S-014 — Tracking PostHog (renommer / supprimer un groupe)
 *
 * Events instrumentés dans cette story :
 *   - group_renamed   (serveur, action rename dans /app/groups/[id]/settings)
 *   - group_archived  (serveur, action delete après soft-delete réussi)
 *
 * Ce spec vérifie :
 *   1. group_renamed est inséré dans le sink analytics_events_test quand Alice
 *      renomme un groupe, avec group_id dans les propriétés.
 *   2. group_archived est inséré dans le sink analytics_events_test quand Alice
 *      supprime un groupe, avec group_id dans les propriétés.
 *   3. distinct_id = user.id Supabase d'Alice pour les deux events.
 *   4. Aucun event émis en cas d'échec de validation (renommage invalide).
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { readServerEvents, clearServerEvents } from './helpers/analytics';

/** Récupère le user.id Supabase d'Alice depuis la DB. */
async function getAliceId(): Promise<string> {
	const rows = await db`SELECT id FROM auth.users WHERE email = 'alice@test.local' LIMIT 1`;
	if (!rows[0]) throw new Error('alice@test.local not found in DB');
	return String(rows[0].id);
}

/** Crée un groupe de test directement en DB et retourne son ID. */
async function createTestGroup(name: string, adminId: string): Promise<string> {
	const rows = await db`
		INSERT INTO groups (name, currency, creator_id)
		VALUES (${name}, 'EUR', ${adminId})
		RETURNING id
	`;
	const groupId = rows[0].id as string;
	await db`
		INSERT INTO group_members (group_id, user_id, role)
		VALUES (${groupId}, ${adminId}, 'admin')
	`;
	return groupId;
}

test.describe('S-014 — Tracking PostHog renommer/supprimer groupe', () => {
	test.beforeEach(async () => {
		await clearServerEvents(db);
	});

	test.afterEach(async () => {
		try {
			await db`DELETE FROM groups WHERE name LIKE '[E2E]%'`;
		} catch {
			// Ignore cleanup errors
		}
	});

	test.afterAll(async () => {
		await clearServerEvents(db);
	});

	// ─── Event serveur : group_renamed ───────────────────────────────────────────

	test('group_renamed — event serveur émis quand Alice renomme un groupe', async ({ page }) => {
		const aliceId = await getAliceId();
		const groupId = await createTestGroup('[E2E] Groupe à renommer tracking', aliceId);
		const settingsUrl = `/app/groups/${groupId}/settings`;

		await login(page, 'alice');
		await page.goto(settingsUrl);
		await page.waitForLoadState('networkidle');

		await page.getByTestId('group-name-input').fill('[E2E] Groupe renommé tracking');
		await page.getByTestId('rename-submit-btn').click();

		// Attendre le message de succès (action serveur terminée)
		await expect(page.getByTestId('rename-success')).toBeVisible();

		const events = await readServerEvents(db, { event: 'group_renamed' });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events.find((e) => e.distinct_id === aliceId);
		expect(ev).toBeDefined();
		expect(ev!.event).toBe('group_renamed');
		expect(ev!.distinct_id).toBe(aliceId);

		const props = ev!.properties as Record<string, unknown>;
		expect(props['group_id']).toBe(groupId);
	});

	test('group_renamed — distinct_id est le UUID Supabase valide', async ({ page }) => {
		const aliceId = await getAliceId();
		const groupId = await createTestGroup('[E2E] Groupe UUID check', aliceId);
		const settingsUrl = `/app/groups/${groupId}/settings`;

		await login(page, 'alice');
		await page.goto(settingsUrl);
		await page.waitForLoadState('networkidle');

		await page.getByTestId('group-name-input').fill('[E2E] Groupe UUID renamed');
		await page.getByTestId('rename-submit-btn').click();
		await expect(page.getByTestId('rename-success')).toBeVisible();

		const events = await readServerEvents(db, { event: 'group_renamed', distinctId: aliceId });
		expect(events.length).toBeGreaterThanOrEqual(1);
		expect(events[0].distinct_id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		);
		expect(events[0].distinct_id).toBe(aliceId);
	});

	test('group_renamed — aucun event si renommage invalide (< 2 chars)', async ({ page }) => {
		const aliceId = await getAliceId();
		const groupId = await createTestGroup('[E2E] Groupe invalide check', aliceId);
		const settingsUrl = `/app/groups/${groupId}/settings`;

		await login(page, 'alice');
		await page.goto(settingsUrl);
		await page.waitForLoadState('networkidle');

		// Tenter un renommage invalide via l'API directement (bypasse minlength HTML)
		await page.evaluate(async (url) => {
			await fetch(`${url}?/rename`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'x-sveltekit-action': 'true'
				},
				body: 'name=X'
			});
		}, settingsUrl);

		// Aucun event ne doit être dans le sink (validation Zod a rejeté)
		const events = await readServerEvents(db, { event: 'group_renamed' });
		expect(events.length).toBe(0);
	});

	// ─── Event serveur : group_archived ──────────────────────────────────────────

	test('group_archived — event serveur émis quand Alice supprime un groupe', async ({ page }) => {
		const aliceId = await getAliceId();
		const groupName = '[E2E] Groupe à supprimer tracking';
		const groupId = await createTestGroup(groupName, aliceId);
		const settingsUrl = `/app/groups/${groupId}/settings`;

		await login(page, 'alice');
		await page.goto(settingsUrl);
		await page.waitForLoadState('networkidle');

		// Ouvrir le formulaire de confirmation
		await page.getByTestId('delete-group-btn').click();
		await expect(page.getByTestId('delete-confirm-form')).toBeVisible();

		// Saisir le nom exact et confirmer
		await page.getByTestId('delete-confirm-input').fill(groupName);
		await expect(page.getByTestId('delete-confirm-btn')).not.toBeDisabled();
		await page.getByTestId('delete-confirm-btn').click();

		// Après suppression → redirection vers /app
		await expect(page).toHaveURL(/\/app$/);

		const events = await readServerEvents(db, { event: 'group_archived' });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events.find((e) => e.distinct_id === aliceId);
		expect(ev).toBeDefined();
		expect(ev!.event).toBe('group_archived');
		expect(ev!.distinct_id).toBe(aliceId);

		const props = ev!.properties as Record<string, unknown>;
		expect(props['group_id']).toBe(groupId);
	});

	test('group_archived — distinct_id est le UUID Supabase valide', async ({ page }) => {
		const aliceId = await getAliceId();
		const groupName = '[E2E] Groupe UUID archive';
		const groupId = await createTestGroup(groupName, aliceId);
		const settingsUrl = `/app/groups/${groupId}/settings`;

		await login(page, 'alice');
		await page.goto(settingsUrl);
		await page.waitForLoadState('networkidle');

		await page.getByTestId('delete-group-btn').click();
		await expect(page.getByTestId('delete-confirm-form')).toBeVisible();

		await page.getByTestId('delete-confirm-input').fill(groupName);
		await expect(page.getByTestId('delete-confirm-btn')).not.toBeDisabled();
		await page.getByTestId('delete-confirm-btn').click();

		await expect(page).toHaveURL(/\/app$/);

		const events = await readServerEvents(db, { event: 'group_archived', distinctId: aliceId });
		expect(events.length).toBeGreaterThanOrEqual(1);
		expect(events[0].distinct_id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		);
		expect(events[0].distinct_id).toBe(aliceId);
	});

	test('group_archived — aucun event si confirmation incorrecte', async ({ page }) => {
		const aliceId = await getAliceId();
		const groupId = await createTestGroup('[E2E] Groupe confirm fausse', aliceId);
		const settingsUrl = `/app/groups/${groupId}/settings`;

		await login(page, 'alice');
		await page.goto(settingsUrl);
		await page.waitForLoadState('networkidle');

		// Tenter la suppression avec une confirmation invalide via API
		await page.evaluate(async (url) => {
			await fetch(`${url}?/delete`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'x-sveltekit-action': 'true'
				},
				body: 'confirm=mauvais+nom'
			});
		}, settingsUrl);

		// Aucun event ne doit être dans le sink (confirmation ne correspond pas)
		const events = await readServerEvents(db, { event: 'group_archived' });
		expect(events.length).toBe(0);
	});
});
