/**
 * S-003 — Connexion Google OAuth
 *
 * Critères d'acceptation :
 * 1. /login et /signup affichent un bouton « Continuer avec Google » pointant vers /auth/google
 * 2. La route /auth/callback échange le code contre une session puis redirige vers l'app
 * 3. Première connexion Google → ligne profiles créée automatiquement
 * 4. Un retour OAuth en erreur (accès refusé) affiche un message propre sur /login
 *
 * Note : le vrai flux Google n'est pas automatisable (compte externe réel).
 * Les tests couvrent les cas automatisables : présence des boutons, gestion des erreurs
 * callback, et non-régression email/password.
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('S-003 — Connexion Google OAuth', () => {
	// ─── Bouton Google sur /login ────────────────────────────────────────────

	test('bouton "Continuer avec Google" présent sur /login et pointe vers /auth/google', async ({
		page
	}) => {
		await page.goto('/login');

		// Bouton Google visible
		const googleBtn = page.getByRole('link', { name: 'Continuer avec Google' });
		await expect(googleBtn).toBeVisible();

		// L'href pointe bien vers /auth/google (peut être relatif ou absolu selon SvelteKit resolveRoute)
		const href = await googleBtn.getAttribute('href');
		expect(href).toMatch(/\/auth\/google$/);
	});

	// ─── Bouton Google sur /signup ────────────────────────────────────────────

	test('bouton "Continuer avec Google" présent sur /signup et pointe vers /auth/google', async ({
		page
	}) => {
		await page.goto('/signup');

		// Bouton Google visible
		const googleBtn = page.getByRole('link', { name: 'Continuer avec Google' });
		await expect(googleBtn).toBeVisible();

		// L'href pointe bien vers /auth/google (peut être relatif ou absolu selon SvelteKit resolveRoute)
		const href = await googleBtn.getAttribute('href');
		expect(href).toMatch(/\/auth\/google$/);
	});

	// ─── Callback sans code → erreur propre ──────────────────────────────────

	test('/auth/callback sans code → redirection /login avec message erreur', async ({ page }) => {
		await page.goto('/auth/callback');

		// Doit être redirigé vers /login avec le paramètre error
		await expect(page).toHaveURL(/\/login\?error=missing_code/);

		// Le message d'erreur doit s'afficher dans un bandeau
		await expect(page.getByText(/La connexion Google a échoué/i)).toBeVisible();
		await expect(page.getByText(/missing_code/i)).toBeVisible();
	});

	// ─── Callback avec error OAuth (accès refusé) ────────────────────────────

	test('/auth/callback avec parametre error → redirection /login avec message erreur', async ({
		page
	}) => {
		// Simule un retour OAuth avec accès refusé (comme si l'utilisateur avait cliqué "Annuler")
		await page.goto('/auth/callback?error=access_denied&error_description=User+denied+access');

		// Doit être redirigé vers /login
		await expect(page).toHaveURL(/\/login/);

		// Le message d'erreur doit s'afficher (la description encodée doit être décodée)
		await expect(page.getByText(/La connexion Google a échoué/i)).toBeVisible();
	});

	// ─── Flux Google complet (skip — non automatisable) ───────────────────────

	test.skip('flux Google complet — authentification, création de profil', async () => {
		// Ce test nécessite un vrai compte Google et un accès réseau à accounts.google.com
		// Il ne peut pas être automatisé en CI. À tester manuellement sur le projet cloud.
		// Critères à vérifier manuellement :
		// 1. Clic sur "Continuer avec Google" → redirection vers Google OAuth
		// 2. Sélection du compte → retour vers /auth/callback?code=xxx
		// 3. Échange du code → session créée
		// 4. Profil créé dans public.profiles avec pseudo issu du nom Google
		// 5. Redirection vers /
		// 6. Header affiche le pseudo Google
	});

	// ─── Non-régression : connexion email/password toujours fonctionnelle ────

	test('non-régression S-002 : connexion email/password fonctionne toujours', async ({ page }) => {
		await login(page, 'alice');

		// Doit être redirigé hors de /login
		await expect(page).not.toHaveURL(/\/login/);

		// Header affiche le pseudo Alice
		await expect(page.getByRole('banner')).toContainText('Alice');
		await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible();
	});

	// ─── Ergonomie : message d'erreur disparaît si on visite /login directement

	test('visite directe /login (sans error param) → pas de bandeau erreur', async ({ page }) => {
		await page.goto('/login');

		// Aucun bandeau d'erreur ne doit apparaître
		await expect(page.getByText(/La connexion Google a échoué/i)).not.toBeVisible();

		// Le bouton Google est présent et la page est propre
		await expect(page.getByRole('link', { name: 'Continuer avec Google' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible();
	});
});
