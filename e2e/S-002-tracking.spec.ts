/**
 * S-002 — Tracking PostHog (events auth)
 *
 * Vérifie que les events suivants sont bien émis dans analytics_events_test
 * (sink DB activé quand ANALYTICS_TEST_SINK=db) :
 *   - user_signed_up   (serveur, action signup)
 *   - user_logged_in   (serveur, action login)
 *   - user_logged_out  (serveur, action logout)
 *   - password_reset_requested (serveur, action forgot-password)
 *
 * Les user IDs seedés sont déterministes (cf. supabase/seed.sql).
 */
import { test, expect } from '@playwright/test';
import { db } from './helpers/db';
import { readServerEvents, clearServerEvents } from './helpers/analytics';
import { login, USERS } from './helpers/auth';

// IDs déterministes des users seedés
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

test.describe('S-002 — Tracking PostHog auth', () => {
	// Vider la table entre chaque test pour isolation
	test.beforeEach(async () => {
		await clearServerEvents(db);
	});

	test.afterAll(async () => {
		await clearServerEvents(db);
		await db.end();
	});

	// ─── user_logged_in ───────────────────────────────────────────────────────

	test('user_logged_in — event serveur émis après connexion réussie', async ({ page }) => {
		await login(page, 'alice');

		// Vérifier que l'event est dans le sink DB
		const events = await readServerEvents(db, { event: 'user_logged_in' });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events.find((e) => e.distinct_id === ALICE_ID);
		expect(ev).toBeDefined();
		expect(ev!.event).toBe('user_logged_in');
		expect(ev!.distinct_id).toBe(ALICE_ID);
	});

	// ─── user_logged_out ──────────────────────────────────────────────────────

	test('user_logged_out — event serveur émis après déconnexion', async ({ page }) => {
		// Connexion préalable (génère aussi user_logged_in — on efface après)
		await login(page, 'bob');
		await clearServerEvents(db);

		// Déconnexion via le bouton du header
		await page.getByRole('button', { name: 'Déconnexion' }).click();
		await page.waitForURL('/');

		const events = await readServerEvents(db, { event: 'user_logged_out' });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events.find((e) => e.distinct_id === BOB_ID);
		expect(ev).toBeDefined();
		expect(ev!.event).toBe('user_logged_out');
	});

	// ─── password_reset_requested ─────────────────────────────────────────────

	test('password_reset_requested — event serveur émis après envoi du mail reset', async ({
		page
	}) => {
		await page.goto('/forgot-password');
		await page.getByRole('textbox', { name: 'Adresse email' }).fill('alice@test.local');
		await page.getByRole('button', { name: 'Envoyer le lien' }).click();

		// Attendre la confirmation UI
		await expect(page.getByRole('heading', { name: /email envoyé/i })).toBeVisible();

		const events = await readServerEvents(db, { event: 'password_reset_requested' });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[0];
		expect(ev.event).toBe('password_reset_requested');
		// distinct_id peut être l'id utilisateur ou 'anonymous' si pas connecté
		expect(ev.distinct_id).toBeTruthy();
	});

	// ─── user_signed_up ───────────────────────────────────────────────────────

	test('user_signed_up — event serveur émis après inscription réussie', async ({ page }) => {
		const testEmail = `e2e-tracking-signup-${Date.now()}@test.local`;
		const testPseudo = '[E2E] TrackingSignup';
		const testPassword = 'test-password-123';

		await page.goto('/signup');
		await page.getByRole('textbox', { name: 'Adresse email' }).fill(testEmail);
		await page.getByRole('textbox', { name: 'Pseudo' }).fill(testPseudo);
		await page.getByRole('textbox', { name: 'Mot de passe' }).fill(testPassword);
		await page.getByRole('button', { name: 'Créer mon compte' }).click();

		// Attendre stabilisation
		await page.waitForTimeout(1500);

		const events = await readServerEvents(db, { event: 'user_signed_up' });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[0];
		expect(ev.event).toBe('user_signed_up');
		expect(ev.distinct_id).toBeTruthy();
		// Le pseudo est dans les properties (pas de PII email)
		expect((ev.properties as Record<string, unknown>)['pseudo']).toBe(testPseudo);

		// Nettoyage
		try {
			await db`DELETE FROM public.profiles WHERE pseudo = ${testPseudo}`;
			await db`DELETE FROM auth.users WHERE email = ${testEmail}`;
		} catch {
			// Ignore
		}
	});
});
