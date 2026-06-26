/**
 * S-004 — Mode invité + réclamation de compte
 *
 * Critères d'acceptation :
 * 1. « Continuer en invité » + pseudo → connexion anonyme, profil is_anonymous=true
 * 2. Bandeau invité visible pour l'invité, menant à /claim
 * 3. Réclamation email/password → is_anonymous=false, succès fonctionnel
 * 4. Accès /claim sans session → redirection /login
 * 5. Accès /claim avec session non-anonyme → redirection /
 * 6. Validation pseudo (trop court) → erreur Zod affichée
 * 7. Non-régression : login classique inchangé
 *
 * Note :
 * - La réclamation Google (linkIdentity OAuth) n'est pas automatisable en E2E
 *   → couverte manuellement, skippée ici.
 * - Après réclamation email, la page /claim affiche "Compte sécurisé !" (fix UX S-004).
 *   L'action pose un cookie httpOnly `just_claimed` qui empêche load() de rediriger vers /.
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';

// Pseudo unique pour chaque run
const GUEST_PSEUDO = `[E2E] Invité-${Date.now()}`;
const CLAIM_EMAIL = `e2e-claim-${Date.now()}@test.local`;
const CLAIM_PASSWORD = 'test-password-123';

test.describe('S-004 — Mode invité + réclamation de compte', () => {
	// Nettoyage après chaque test créant des données
	test.afterAll(async () => {
		try {
			// Supprime les profils anonymes créés par les tests (pseudo [E2E]*)
			await db`DELETE FROM public.profiles WHERE pseudo LIKE '[E2E]%' AND is_anonymous = true`;
			// Supprime les profils réclamés (pseudo [E2E]*, is_anonymous=false)
			await db`DELETE FROM public.profiles WHERE pseudo LIKE '[E2E]%'`;
			// Supprime les auth.users associés
			await db`DELETE FROM auth.users WHERE email LIKE 'e2e-claim-%@test.local'`;
			// Supprime les auth.users anonymes sans email dont le pseudo était [E2E]*
			// (jointure via id)
			await db`
				DELETE FROM auth.users u
				WHERE u.is_anonymous = true
				AND u.email IS NULL
				AND NOT EXISTS (
					SELECT 1 FROM public.profiles p
					WHERE p.id = u.id
				)
			`;
		} catch {
			// Ignore cleanup errors
		}
	});

	// ─── Scénario 1 : Continuer en invité ────────────────────────────────────

	test('continuer en invité — connecté, bandeau invité visible, profil is_anonymous=true', async ({
		page
	}) => {
		await page.goto('/guest');

		// La page s'affiche correctement
		await expect(page.getByRole('heading', { name: 'Continuer en invité' })).toBeVisible();

		// Remplir le pseudo
		await page.getByRole('textbox', { name: 'Votre pseudo' }).fill(GUEST_PSEUDO);
		await page.getByRole('button', { name: 'Continuer en invité' }).click();

		// Redirigé vers la page d'accueil
		await expect(page).toHaveURL('/');

		// Header affiche le pseudo de l'invité
		await expect(page.getByRole('banner')).toContainText(GUEST_PSEUDO.replace('[E2E] ', ''));

		// Bouton Déconnexion visible
		await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible();

		// Bandeau invité visible (data-testid=guest-banner)
		await expect(page.getByTestId('guest-banner')).toBeVisible();
		await expect(page.getByTestId('guest-banner')).toContainText('Compte invité');

		// Lien "Sécuriser mon compte" pointe vers /claim
		await expect(page.getByRole('link', { name: 'Sécuriser mon compte' })).toHaveAttribute(
			'href',
			'/claim'
		);

		// Vérification DB : profil créé avec is_anonymous=true
		const rows = await db`SELECT pseudo, is_anonymous FROM public.profiles WHERE pseudo = ${GUEST_PSEUDO}`;
		expect(rows).toHaveLength(1);
		expect(rows[0].is_anonymous).toBe(true);
	});

	// ─── Scénario 2 : Validation du pseudo ───────────────────────────────────

	test('pseudo trop court → erreur Zod affichée, reste sur /guest', async ({ page }) => {
		await page.goto('/guest');

		await page.getByRole('textbox', { name: 'Votre pseudo' }).fill('A');
		await page.getByRole('button', { name: 'Continuer en invité' }).click();

		// Reste sur /guest
		await expect(page).toHaveURL(/\/guest/);

		// Message d'erreur Zod affiché en français
		await expect(page.getByText('Le pseudo doit faire au moins 2 caractères')).toBeVisible();
	});

	// ─── Scénario 3 : Réclamation email/password ─────────────────────────────

	test('réclamation email — is_anonymous devient false, bandeau disparu', async ({ page }) => {
		// Étape 1 : créer un compte invité
		await page.goto('/guest');
		const uniquePseudo = `[E2E] ClaimTest-${Date.now()}`;
		await page.getByRole('textbox', { name: 'Votre pseudo' }).fill(uniquePseudo);
		await page.getByRole('button', { name: 'Continuer en invité' }).click();
		await expect(page).toHaveURL('/');
		await expect(page.getByTestId('guest-banner')).toBeVisible();

		// Étape 2 : aller sur /claim
		await page.goto('/claim');
		await expect(page).toHaveURL('/claim');
		await expect(page.getByRole('heading', { name: 'Sécurise ton compte' })).toBeVisible();

		// Le pseudo est bien affiché sur la page
		await expect(page.getByRole('main')).toContainText(uniquePseudo.replace('[E2E] ', ''));

		// Étape 3 : soumettre le formulaire email
		const claimEmail = `e2e-claim-${Date.now()}@test.local`;
		await page.getByRole('textbox', { name: 'Adresse email' }).fill(claimEmail);
		await page.getByRole('textbox', { name: 'Choisir un mot de passe' }).fill(CLAIM_PASSWORD);
		await page.getByRole('button', { name: 'Sécuriser avec email' }).click();

		// Après réclamation (fix UX S-004) : la page reste sur /claim et affiche le message de succès.
		// L'action pose un cookie httpOnly `just_claimed` empêchant load() de rediriger vers /.
		await expect(page).toHaveURL('/claim');
		await expect(page.getByRole('heading', { name: 'Compte sécurisé !' })).toBeVisible();

		// Le bandeau invité doit avoir disparu (is_anonymous=false dans le layout)
		await expect(page.getByTestId('guest-banner')).not.toBeVisible();

		// Vérification DB : is_anonymous est bien passé à false
		const rows =
			await db`SELECT pseudo, is_anonymous FROM public.profiles WHERE pseudo = ${uniquePseudo}`;
		expect(rows).toHaveLength(1);
		expect(rows[0].is_anonymous).toBe(false);

		// Nettoyage immédiat
		await db`DELETE FROM auth.users WHERE email = ${claimEmail}`;
	});

	// ─── Scénario 4 : Accès /claim sans session → /login ─────────────────────

	test('accès /claim sans session → redirection /login', async ({ page }) => {
		// Pas de session active (nouvelle page)
		await page.goto('/claim');
		await expect(page).toHaveURL(/\/login/);
	});

	// ─── Scénario 5 : Accès /claim avec compte non-anonyme → / ──────────────

	test('accès /claim avec compte non-anonyme → redirection /', async ({ page }) => {
		// Alice est un utilisateur normal (non anonyme)
		await login(page, 'alice');
		await page.goto('/claim');
		// Doit être redirigé vers /
		await expect(page).toHaveURL('/');
		// Pas de bandeau invité pour Alice
		await expect(page.getByTestId('guest-banner')).not.toBeVisible();
	});

	// ─── Scénario 6 : Réclamation — validation email invalide ────────────────

	test('réclamation — email invalide → erreur affichée', async ({ page }) => {
		// Créer un compte invité d'abord
		await page.goto('/guest');
		const uniquePseudo2 = `[E2E] ValidTest-${Date.now()}`;
		await page.getByRole('textbox', { name: 'Votre pseudo' }).fill(uniquePseudo2);
		await page.getByRole('button', { name: 'Continuer en invité' }).click();
		await expect(page).toHaveURL('/');

		// Aller sur /claim
		await page.goto('/claim');
		await expect(page).toHaveURL('/claim');

		// Saisir un email invalide
		await page.getByRole('textbox', { name: 'Adresse email' }).fill('pas-un-email');
		await page.getByRole('textbox', { name: 'Choisir un mot de passe' }).fill('test-password-123');
		await page.getByRole('button', { name: 'Sécuriser avec email' }).click();

		// Reste sur /claim (HTML5 validation bloque avant soumission)
		await expect(page).toHaveURL(/\/claim/);
	});

	// ─── Scénario 7 : Réclamation — mot de passe trop court ──────────────────

	test('réclamation — mot de passe trop court → erreur Zod affichée', async ({ page }) => {
		// Créer un compte invité d'abord
		await page.goto('/guest');
		const uniquePseudo3 = `[E2E] PwdTest-${Date.now()}`;
		await page.getByRole('textbox', { name: 'Votre pseudo' }).fill(uniquePseudo3);
		await page.getByRole('button', { name: 'Continuer en invité' }).click();
		await expect(page).toHaveURL('/');

		// Aller sur /claim
		await page.goto('/claim');
		await expect(page).toHaveURL('/claim');

		// Saisir un mot de passe trop court
		await page.getByRole('textbox', { name: 'Adresse email' }).fill(`e2e-pwd-${Date.now()}@test.local`);
		await page.getByRole('textbox', { name: 'Choisir un mot de passe' }).fill('court');
		await page.getByRole('button', { name: 'Sécuriser avec email' }).click();

		// Reste sur /claim (SvelteKit named action peut exposer ?/email dans l'URL)
		await expect(page).toHaveURL(/\/claim/);

		// Message d'erreur Zod en français
		await expect(page.getByText('Le mot de passe doit faire au moins 8 caractères')).toBeVisible();
	});

	// ─── Scénario 8 : Réclamation Google (skipped — OAuth non automatisable) ─

	test.skip('réclamation Google — linkIdentity OAuth (non automatisable en E2E)', async () => {
		// La réclamation via Google utilise linkIdentity() qui redirige vers
		// l'OAuth Google réel, non simulable en environnement de test automatisé.
		// À tester manuellement.
	});

	// ─── Non-régression : login classique inchangé ────────────────────────────

	test('non-régression — login classique alice inchangé', async ({ page }) => {
		await login(page, 'alice');

		// Alice est connectée
		await expect(page).not.toHaveURL(/\/login/);
		await expect(page.getByRole('banner')).toContainText('Alice');
		await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible();

		// Pas de bandeau invité pour Alice
		await expect(page.getByTestId('guest-banner')).not.toBeVisible();
	});
});
