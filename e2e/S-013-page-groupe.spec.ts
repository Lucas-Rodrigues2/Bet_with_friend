/**
 * S-013 — Page groupe (dashboard)
 *
 * Critères d'acceptation :
 * 1. /app/groups/[id] affiche : nom, image, devise, sections « Paris », « Membres », « Ardoise »
 * 2. Section Paris : état vide propre + bouton « Nouveau pari » (menu : « Au plus proche » / « Oui/Non »)
 * 3. Solde ardoise « 0 » affiché dans la devise du groupe
 * 4. Non-membre → 404/403
 *
 * Scénarios :
 * - Alice ouvre son groupe → nom + sections visibles, état vide des paris
 * - Dave (non membre) accède à l'URL → refus (404)
 * - Le bouton « Nouveau pari » propose les deux types
 * - Liens « Au plus proche » et « Oui / Non » pointent vers /bets/new?type=...
 * - Guard auth : non connecté → redirigé vers /login
 * - Guard auth pour /bets/new : non connecté → /login
 * - Dave (non membre) ne peut pas accéder à /bets/new → 404
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

// ID du groupe seedé "Les potes du test"
// Alice (admin), Bob (member), Carol (member) — Dave n'est PAS membre
const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;

test.describe('S-013 — Page groupe (dashboard)', () => {
	// ─── Auth guards ─────────────────────────────────────────────────────────────

	test('accès sans session → redirection /login', async ({ page }) => {
		await page.goto(GROUP_URL);
		await expect(page).toHaveURL(/\/login/);
	});

	test('accès /bets/new/closest sans session → redirection /login', async ({ page }) => {
		await page.goto(`${GROUP_URL}/bets/new/closest`);
		await expect(page).toHaveURL(/\/login/);
	});

	// ─── Scénario principal : Alice membre admin ──────────────────────────────

	test('Alice voit le nom du groupe et le badge Admin', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(GROUP_URL);

		// Nom du groupe visible
		await expect(page.getByTestId('group-name')).toBeVisible();
		await expect(page.getByTestId('group-name')).toHaveText('Les potes du test');

		// Badge admin visible pour Alice (elle est admin)
		await expect(page.getByTestId('admin-badge')).toBeVisible();
		await expect(page.getByTestId('admin-badge')).toHaveText('Admin');
	});

	test('Alice voit la devise du groupe', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(GROUP_URL);

		await expect(page.getByTestId('group-currency')).toBeVisible();
		await expect(page.getByTestId('group-currency')).toHaveText('Devise : EUR');
	});

	test('Alice voit la description du groupe', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(GROUP_URL);

		await expect(page.getByTestId('group-description')).toBeVisible();
		await expect(page.getByTestId('group-description')).toHaveText('Groupe seedé pour les tests E2E');
	});

	test('section Paris visible avec état vide', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(GROUP_URL);

		// Section paris présente
		await expect(page.getByTestId('bets-section')).toBeVisible();

		// Titre de la section
		await expect(page.getByRole('heading', { name: 'Paris en cours' })).toBeVisible();

		// État vide avec message attendu
		await expect(page.getByTestId('empty-bets')).toBeVisible();
		await expect(page.getByTestId('empty-bets')).toContainText('Aucun pari — crée le premier !');
	});

	test('section Membres visible avec liste des membres', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(GROUP_URL);

		// Section membres présente
		await expect(page.getByTestId('members-section')).toBeVisible();

		// Titre avec nombre de membres
		await expect(page.getByRole('heading', { name: 'Membres (3)' })).toBeVisible();

		// Les 3 membres sont listés
		const memberItems = page.getByTestId('member-item');
		await expect(memberItems).toHaveCount(3);
	});

	test('section Ardoise visible avec solde 0 dans la devise du groupe', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(GROUP_URL);

		// Section ardoise présente
		await expect(page.getByTestId('ledger-section')).toBeVisible();

		// Titre de la section
		await expect(page.getByRole('heading', { name: 'Ardoise' })).toBeVisible();

		// Solde 0 EUR affiché
		await expect(page.getByTestId('ledger-balance')).toBeVisible();
		await expect(page.getByTestId('ledger-balance')).toHaveText('0 EUR');
	});

	// ─── Bouton « Nouveau pari » et menu déroulant ───────────────────────────

	test('bouton « Nouveau pari » est visible', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(GROUP_URL);

		await expect(page.getByTestId('new-bet-btn')).toBeVisible();
	});

	test('bouton « Nouveau pari » propose « Au plus proche » et « Oui / Non »', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(GROUP_URL);
		// Attendre hydratation complète avant de cliquer
		await page.waitForLoadState('networkidle');

		// Ouvrir le menu — le bouton appelle e.stopPropagation() donc la window ne ferme pas
		await page.getByTestId('new-bet-btn').click();

		// Attendre que les éléments soient attachés au DOM (Svelte conditionnel)
		await page.waitForSelector('[data-testid="new-bet-closest"]', { state: 'attached' });

		// Lire les hrefs via evaluate (synchrone dans le contexte page, sans risque de race)
		const hrefs = await page.evaluate(() => ({
			closest: document.querySelector('[data-testid="new-bet-closest"]')?.getAttribute('href'),
			yesno: document.querySelector('[data-testid="new-bet-yesno"]')?.getAttribute('href')
		}));

		expect(hrefs.closest).toBe(`/app/groups/${SEEDED_GROUP_ID}/bets/new/closest`);
		expect(hrefs.yesno).toBe(`/app/groups/${SEEDED_GROUP_ID}/bets/new/yesno`);
	});

	test('navigation vers la page de création (type closest) via lien direct', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(`${GROUP_URL}/bets/new/closest`);

		await expect(page).toHaveURL(`${GROUP_URL}/bets/new/closest`);
		await expect(page.getByRole('heading', { name: /Nouveau pari/ })).toBeVisible();
	});

	test('navigation vers la page de création (type yesno) via lien direct', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(`${GROUP_URL}/bets/new/yesno`);

		await expect(page).toHaveURL(`${GROUP_URL}/bets/new/yesno`);
		await expect(page.getByRole('heading', { name: /Nouveau duel/ })).toBeVisible();
	});

	test('page /bets/new/closest a un lien de retour vers le groupe', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(`${GROUP_URL}/bets/new/closest`);

		// Lien de retour vers le groupe
		await expect(page.getByRole('link', { name: '← Retour au groupe' })).toBeVisible();
	});

	// ─── Membre sans badge admin (Bob) ────────────────────────────────────────

	test('Bob (membre, pas admin) voit le groupe sans badge Admin', async ({ page }) => {
		await login(page, 'bob');
		await page.goto(GROUP_URL);

		// Bob peut accéder au groupe (il est membre)
		await expect(page.getByTestId('group-name')).toHaveText('Les potes du test');

		// Bob n'est pas admin donc pas de badge admin dans l'en-tête
		// (le badge admin dans l'en-tête correspond au rôle de l'utilisateur courant)
		await expect(page.getByTestId('admin-badge')).not.toBeVisible();
	});

	// ─── Non-membre : accès refusé ────────────────────────────────────────────

	test('Dave (non membre) accède au groupe → 404', async ({ page }) => {
		await login(page, 'dave');
		await page.goto(GROUP_URL);

		// Doit recevoir une 404
		await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
	});

	test('Dave (non membre) accède à /bets/new/closest → 404', async ({ page }) => {
		await login(page, 'dave');
		await page.goto(`${GROUP_URL}/bets/new/closest`);

		// Doit recevoir une 404
		await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
	});

	// ─── Navigation ──────────────────────────────────────────────────────────

	test('lien « ← Mes groupes » renvoie vers /app', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(GROUP_URL);

		await page.getByRole('link', { name: '← Mes groupes' }).click();
		await expect(page).toHaveURL('/app');
	});

	// ─── UUID invalide ────────────────────────────────────────────────────────

	test('URL avec ID non-UUID → 404', async ({ page }) => {
		await login(page, 'alice');
		await page.goto('/app/groups/invalid-id-not-a-uuid');

		await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
	});
});
