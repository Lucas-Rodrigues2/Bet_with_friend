/**
 * S-002 — Inscription / connexion email+password
 *
 * Critères d'acceptation :
 * 1. Inscription : /signup, email + pseudo + mdp → compte créé, profil créé
 * 2. Connexion réussie → session, header affiche pseudo + bouton Déconnexion
 * 3. Connexion échouée → message d'erreur, reste sur /login
 * 4. Déconnexion → session fermée, header affiche "Se connecter"
 * 5. Reset : /forgot-password → mail envoyé, confirmation affichée
 * 6. Protection routes /app/* → redirection /login si non connecté
 * 7. Session SSR → survit au rechargement de page
 *
 * Note : en local Supabase (enable_confirmations = false), le signup connecte
 * directement l'utilisateur sans validation email. Le test couvre ce comportement.
 * Le scénario "vérifiez vos emails" serait visible uniquement en prod.
 */
import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers/auth';
import { db } from './helpers/db';

const TEST_EMAIL = `e2e-signup-${Date.now()}@test.local`;
const TEST_PSEUDO = '[E2E] TestSignup';
const TEST_PASSWORD = 'test-password-123';

test.describe('S-002 — Authentification email/password', () => {
	// Nettoyage du user de test créé par le test d'inscription
	test.afterAll(async () => {
		try {
			await db`DELETE FROM public.profiles WHERE pseudo = ${TEST_PSEUDO}`;
			await db`DELETE FROM auth.users WHERE email = ${TEST_EMAIL}`;
		} catch {
			// Ignore cleanup errors
		}
	});

	// ─── Connexion réussie ────────────────────────────────────────────────────

	test('connexion réussie — header affiche le pseudo et bouton Déconnexion', async ({ page }) => {
		await login(page, 'alice');

		// Doit être redirigé hors de /login
		await expect(page).not.toHaveURL(/\/login/);

		// Header affiche "Bonjour, Alice"
		await expect(page.getByRole('banner')).toContainText('Alice');
		await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible();

		// Les liens "Se connecter" / "Créer un compte" ne doivent plus être dans le header
		await expect(
			page.getByRole('banner').getByRole('link', { name: 'Se connecter' })
		).not.toBeVisible();
	});

	// ─── Connexion échouée ────────────────────────────────────────────────────

	test('connexion échouée — message erreur, reste sur /login', async ({ page }) => {
		await page.goto('/login');

		await page.getByRole('textbox', { name: 'Adresse email' }).fill('alice@test.local');
		await page.getByRole('textbox', { name: 'Mot de passe' }).fill('mauvais-mot-de-passe');
		await page.getByRole('button', { name: 'Se connecter' }).click();

		// Reste sur /login
		await expect(page).toHaveURL(/\/login/);

		// Message d'erreur clair visible
		await expect(page.getByText(/identifiants incorrects/i)).toBeVisible();

		// Pas de session : header affiche toujours "Se connecter"
		await expect(page.getByRole('banner').getByRole('link', { name: 'Se connecter' })).toBeVisible();
	});

	// ─── Déconnexion ─────────────────────────────────────────────────────────

	test('déconnexion — session fermée, Se connecter réapparaît', async ({ page }) => {
		// Connexion préalable
		await login(page, 'alice');
		await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible();

		// Déconnexion
		await page.getByRole('button', { name: 'Déconnexion' }).click();

		// Doit revenir sur une page publique
		await expect(page).toHaveURL('/');

		// Header affiche de nouveau les liens publics
		await expect(page.getByRole('banner').getByRole('link', { name: 'Se connecter' })).toBeVisible();
		await expect(
			page.getByRole('banner').getByRole('link', { name: 'Créer un compte' })
		).toBeVisible();

		// Bouton Déconnexion n'est plus visible
		await expect(page.getByRole('button', { name: 'Déconnexion' })).not.toBeVisible();
	});

	// ─── Protection des routes /app/* ─────────────────────────────────────────

	test('accès route protégée /app sans session → redirection /login', async ({ page }) => {
		await page.goto('/app');
		await expect(page).toHaveURL(/\/login/);
	});

	// ─── Session SSR (persistance rechargement) ───────────────────────────────

	test('session survit au rechargement de page', async ({ page }) => {
		await login(page, 'bob');

		// Bob est connecté
		await expect(page.getByRole('banner')).toContainText('Bob');

		// Rechargement de page
		await page.reload();

		// Session toujours active après rechargement
		await expect(page.getByRole('banner')).toContainText('Bob');
		await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible();
	});

	// ─── Inscription ─────────────────────────────────────────────────────────

	test('inscription — compte créé, profil créé en DB', async ({ page }) => {
		await page.goto('/signup');

		await page.getByRole('textbox', { name: 'Adresse email' }).fill(TEST_EMAIL);
		await page.getByRole('textbox', { name: 'Pseudo' }).fill(TEST_PSEUDO);
		await page.getByRole('textbox', { name: 'Mot de passe' }).fill(TEST_PASSWORD);
		await page.getByRole('button', { name: 'Créer mon compte' }).click();

		// Attendre la stabilisation de la navigation (peut redirigier vers / ou rester sur /signup)
		await page.waitForTimeout(1500);
		const finalUrl = page.url();
		const isOnSignup = finalUrl.includes('/signup');

		if (isOnSignup) {
			// Cas prod (enable_confirmations = true) : écran "Vérifiez vos emails"
			await expect(page.getByText(/vérifiez vos emails/i)).toBeVisible();
		} else {
			// Cas local (enable_confirmations = false) : connecté directement → redirigé vers /
			await expect(page).toHaveURL('/');
			// Le pseudo de test est "[E2E] TestSignup" → extrait "TestSignup" après le préfixe
			await expect(page.getByRole('banner')).toContainText('TestSignup');
		}

		// Dans tous les cas, un profil doit être créé en DB
		const rows = await db`SELECT pseudo FROM public.profiles WHERE pseudo = ${TEST_PSEUDO}`;
		expect(rows).toHaveLength(1);
		expect(rows[0].pseudo).toBe(TEST_PSEUDO);
	});

	// ─── Forgot password ─────────────────────────────────────────────────────

	test('forgot-password — saisir email affiche confirmation', async ({ page }) => {
		await page.goto('/forgot-password');

		// Page s'affiche correctement
		await expect(page.getByRole('heading', { name: /mot de passe oublié/i })).toBeVisible();

		// Remplir et envoyer
		await page.getByRole('textbox', { name: 'Adresse email' }).fill('alice@test.local');
		await page.getByRole('button', { name: 'Envoyer le lien' }).click();

		// Message de confirmation affiché
		await expect(page.getByRole('heading', { name: /email envoyé/i })).toBeVisible();
		await expect(page.getByText('alice@test.local')).toBeVisible();
	});

	// ─── Validation Zod (inputs invalides) ───────────────────────────────────

	test('connexion — email invalide → formulaire non soumis ou erreur', async ({ page }) => {
		await page.goto('/login');

		// L'input type="email" bloque la soumission avec un email invalide
		// On vérifie juste que la page ne redirige pas avec un email manifestement invalide
		await page.getByRole('textbox', { name: 'Adresse email' }).fill('pas-un-email');
		await page.getByRole('textbox', { name: 'Mot de passe' }).fill('test-password-123');

		// Le bouton submit avec type="email" doit bloquer la soumission HTML5
		// (pas de navigation possible)
		await page.getByRole('button', { name: 'Se connecter' }).click();
		await expect(page).toHaveURL(/\/login/);
	});

	test('inscription — mot de passe trop court → erreur Zod affichée', async ({ page }) => {
		await page.goto('/signup');

		await page.getByRole('textbox', { name: 'Adresse email' }).fill('test@test.local');
		await page.getByRole('textbox', { name: 'Pseudo' }).fill('TestUser');
		await page.getByRole('textbox', { name: 'Mot de passe' }).fill('court');
		await page.getByRole('button', { name: 'Créer mon compte' }).click();

		// Reste sur /signup
		await expect(page).toHaveURL(/\/signup/);

		// Message d'erreur Zod sur le mot de passe (texte complet de l'erreur Zod)
		await expect(page.getByText('Le mot de passe doit faire au moins 8 caractères')).toBeVisible();
	});
});
