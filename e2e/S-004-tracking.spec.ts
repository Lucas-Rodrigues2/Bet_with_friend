/**
 * S-004 — Tracking PostHog (mode invité + réclamation de compte)
 *
 * Events instrumentés dans cette story :
 *   - guest_signed_in          { pseudo }              (serveur, /guest action, après création profil)
 *   - guest_account_claimed    { method: 'email' }     (serveur, /claim action email, après updateUser)
 *
 * Approche :
 *   - Events serveur : vérifiés via le sink DB analytics_events_test
 *     (ANALYTICS_TEST_SINK=db positionné dans .env.test).
 *   - Events client (posthog-js) : aucun track() explicite dans ces pages ;
 *     pas de test client-side pour cette story.
 *
 * Note : le flux de réclamation Google (linkIdentity OAuth) n'est pas
 * automatisable en E2E → skippé (pas d'event guest_account_claimed { method: 'google' }).
 */
import { test, expect } from '@playwright/test';
import { db } from './helpers/db';
import { readServerEvents, clearServerEvents } from './helpers/analytics';

test.describe('S-004 — Tracking PostHog mode invité + réclamation', () => {
	// Isolation : vider la table avant chaque test
	test.beforeEach(async () => {
		await clearServerEvents(db);
	});

	test.afterAll(async () => {
		await clearServerEvents(db);
		// Nettoyage des données de test créées par ce spec
		try {
			await db`DELETE FROM public.profiles WHERE pseudo LIKE '[E2E]%'`;
			await db`DELETE FROM auth.users WHERE email LIKE 'e2e-track-%@test.local'`;
			await db`
				DELETE FROM auth.users u
				WHERE u.is_anonymous = true
				AND u.email IS NULL
				AND NOT EXISTS (
					SELECT 1 FROM public.profiles p WHERE p.id = u.id
				)
			`;
		} catch {
			// Ignore cleanup errors
		}
	});

	// ─── guest_signed_in ──────────────────────────────────────────────────────

	test('guest_signed_in — event serveur émis après connexion invité réussie', async ({ page }) => {
		// Max 30 chars : "[E2E] TG-" (9) + 6 chiffres = 15 chars
		const pseudo = `[E2E] TG-${Date.now().toString().slice(-6)}`;

		await page.goto('/guest');
		await expect(page.getByRole('heading', { name: 'Continuer en invité' })).toBeVisible();

		await page.getByRole('textbox', { name: 'Votre pseudo' }).fill(pseudo);
		await page.getByRole('button', { name: 'Continuer en invité' }).click();

		// Attendre la redirection vers /
		await expect(page).toHaveURL('/');

		// Vérifier que l'event est présent dans le sink DB
		const events = await readServerEvents(db, { event: 'guest_signed_in' });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events.find((e) => {
			const props = e.properties as Record<string, unknown>;
			return props['pseudo'] === pseudo;
		});
		expect(ev).toBeDefined();
		expect(ev!.event).toBe('guest_signed_in');
		// distinct_id est l'UUID Supabase de l'utilisateur anonyme créé
		expect(ev!.distinct_id).toBeTruthy();
		expect(ev!.distinct_id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		);
		// La propriété pseudo est présente, pas de PII (pas d'email)
		const props = ev!.properties as Record<string, unknown>;
		expect(props['pseudo']).toBe(pseudo);
	});

	// ─── guest_signed_in : pseudo dans les properties ─────────────────────────

	test('guest_signed_in — distinct_id correspond au user.id créé en DB', async ({ page }) => {
		const pseudo = `[E2E] TI-${Date.now().toString().slice(-6)}`;

		await page.goto('/guest');
		await page.getByRole('textbox', { name: 'Votre pseudo' }).fill(pseudo);
		await page.getByRole('button', { name: 'Continuer en invité' }).click();
		await expect(page).toHaveURL('/');

		// Lire le distinct_id de l'event
		const events = await readServerEvents(db, { event: 'guest_signed_in' });
		const ev = events.find((e) => {
			const props = e.properties as Record<string, unknown>;
			return props['pseudo'] === pseudo;
		});
		expect(ev).toBeDefined();
		const distinctId = ev!.distinct_id;

		// Vérifier que ce distinct_id correspond bien à un profil anonyme en DB
		const rows =
			await db`SELECT id, pseudo, is_anonymous FROM public.profiles WHERE id = ${distinctId}`;
		expect(rows).toHaveLength(1);
		expect(rows[0].pseudo).toBe(pseudo);
		expect(rows[0].is_anonymous).toBe(true);
	});

	// ─── guest_signed_in : pas d'event sur validation échouée ────────────────

	test('guest_signed_in — aucun event émis si pseudo invalide (validation Zod)', async ({
		page
	}) => {
		await page.goto('/guest');
		// Pseudo trop court → fail Zod → pas de signInAnonymously → pas d'event
		await page.getByRole('textbox', { name: 'Votre pseudo' }).fill('X');
		await page.getByRole('button', { name: 'Continuer en invité' }).click();

		// Reste sur /guest
		await expect(page).toHaveURL(/\/guest/);

		// Aucun event guest_signed_in ne doit être émis
		const events = await readServerEvents(db, { event: 'guest_signed_in' });
		expect(events.length).toBe(0);
	});

	// ─── guest_account_claimed ────────────────────────────────────────────────

	test('guest_account_claimed — event serveur émis après réclamation email réussie', async ({
		page
	}) => {
		// Étape 1 : créer un compte invité
		const pseudo = `[E2E] TC-${Date.now().toString().slice(-6)}`;
		await page.goto('/guest');
		await page.getByRole('textbox', { name: 'Votre pseudo' }).fill(pseudo);
		await page.getByRole('button', { name: 'Continuer en invité' }).click();
		await expect(page).toHaveURL('/');

		// Récupérer le distinct_id de l'event guest_signed_in pour pouvoir croiser
		const signInEvents = await readServerEvents(db, { event: 'guest_signed_in' });
		const signInEv = signInEvents.find((e) => {
			const p = e.properties as Record<string, unknown>;
			return p['pseudo'] === pseudo;
		});
		expect(signInEv).toBeDefined();
		const guestDistinctId = signInEv!.distinct_id;

		// Vider le sink avant la réclamation pour isolation
		await clearServerEvents(db);

		// Étape 2 : aller sur /claim et remplir le formulaire email
		const claimEmail = `e2e-track-claim-${Date.now()}@test.local`;
		const claimPassword = 'test-password-123';

		await page.goto('/claim');
		await expect(page).toHaveURL('/claim');

		await page.getByRole('textbox', { name: 'Adresse email' }).fill(claimEmail);
		await page.getByRole('textbox', { name: 'Choisir un mot de passe' }).fill(claimPassword);
		await page.getByRole('button', { name: 'Sécuriser avec email' }).click();

		// Après réclamation réussie, le load() de /claim redirige vers / (is_anonymous=false)
		await expect(page).toHaveURL('/');

		// Étape 3 : vérifier l'event dans le sink DB
		const events = await readServerEvents(db, { event: 'guest_account_claimed' });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[0];
		expect(ev.event).toBe('guest_account_claimed');
		// distinct_id = même user.id (préservation de l'identité)
		expect(ev.distinct_id).toBe(guestDistinctId);
		// Propriétés : method = 'email'
		const props = ev.properties as Record<string, unknown>;
		expect(props['method']).toBe('email');

		// Nettoyage immédiat
		try {
			await db`DELETE FROM auth.users WHERE email = ${claimEmail}`;
		} catch {
			// Ignore
		}
	});

	// ─── guest_account_claimed : aucun event si validation Zod échouée ────────

	test('guest_account_claimed — aucun event si mot de passe trop court', async ({ page }) => {
		// Créer un compte invité
		const pseudo = `[E2E] TP-${Date.now().toString().slice(-6)}`;
		await page.goto('/guest');
		await page.getByRole('textbox', { name: 'Votre pseudo' }).fill(pseudo);
		await page.getByRole('button', { name: 'Continuer en invité' }).click();
		await expect(page).toHaveURL('/');

		// Vider le sink
		await clearServerEvents(db);

		// Soumettre avec mot de passe trop court → Zod fail → pas d'updateUser → pas d'event
		await page.goto('/claim');
		await page.getByRole('textbox', { name: 'Adresse email' }).fill(`e2e-track-pwd-${Date.now()}@test.local`);
		await page.getByRole('textbox', { name: 'Choisir un mot de passe' }).fill('court');
		await page.getByRole('button', { name: 'Sécuriser avec email' }).click();

		// Reste sur /claim
		await expect(page).toHaveURL('/claim');

		// Aucun event guest_account_claimed ne doit être émis
		const events = await readServerEvents(db, { event: 'guest_account_claimed' });
		expect(events.length).toBe(0);
	});

	// ─── distinct_id cohérent entre guest_signed_in et guest_account_claimed ──

	test('distinct_id identique entre guest_signed_in et guest_account_claimed', async ({ page }) => {
		// Ce test vérifie que PostHog peut fusionner les deux events sur une seule personne.
		const pseudo = `[E2E] TSI-${Date.now().toString().slice(-6)}`;

		// Créer le compte invité
		await page.goto('/guest');
		await page.getByRole('textbox', { name: 'Votre pseudo' }).fill(pseudo);
		await page.getByRole('button', { name: 'Continuer en invité' }).click();
		await expect(page).toHaveURL('/');

		// Récupérer le distinct_id de guest_signed_in
		const signInEvents = await readServerEvents(db, { event: 'guest_signed_in' });
		const signInEv = signInEvents.find((e) => {
			const p = e.properties as Record<string, unknown>;
			return p['pseudo'] === pseudo;
		});
		expect(signInEv).toBeDefined();
		const guestId = signInEv!.distinct_id;

		// Réclamer le compte
		const claimEmail = `e2e-track-sameid-${Date.now()}@test.local`;
		await page.goto('/claim');
		await page.getByRole('textbox', { name: 'Adresse email' }).fill(claimEmail);
		await page.getByRole('textbox', { name: 'Choisir un mot de passe' }).fill('test-password-123');
		await page.getByRole('button', { name: 'Sécuriser avec email' }).click();
		await expect(page).toHaveURL('/');

		// Vérifier que guest_account_claimed a le même distinct_id
		const claimEvents = await readServerEvents(db, {
			event: 'guest_account_claimed',
			distinctId: guestId
		});
		expect(claimEvents.length).toBeGreaterThanOrEqual(1);
		expect(claimEvents[0].distinct_id).toBe(guestId);

		// Nettoyage
		try {
			await db`DELETE FROM auth.users WHERE email = ${claimEmail}`;
		} catch {
			// Ignore
		}
	});
});
