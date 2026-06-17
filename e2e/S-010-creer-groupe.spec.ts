/**
 * S-010 — Créer un groupe
 *
 * Critères d'acceptation :
 * 1. /app liste « Mes groupes » + bouton « Créer un groupe » (auth guard → /login si non connecté)
 * 2. Formulaire /app/groups/new : nom (2-50), description (optionnel), devise (défaut EUR)
 *    → création : ligne groups + ligne group_members admin, redirection vers /app/groups/[id]
 * 3. Nom vide/trop court → erreur de validation
 * 4. Un utilisateur ne voit que ses groupes (removed_at IS NULL)
 *
 * Scénarios :
 * - Alice crée « [E2E] Groupe-<unique> » → redirigée sur la page groupe, nom + badge Admin affiché
 * - Le groupe apparaît dans « Mes groupes » d'Alice
 * - Bob ne voit pas ce groupe dans sa liste
 * - Nom vide/trop court refusé
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';

// Unique name for the group created in the main creation test
const GROUP_NAME = `[E2E] Groupe-${Date.now()}`;

// Regex that matches /app/groups/<uuid> but NOT /app/groups/new
// UUIDs contain hyphens (e.g. 550e8400-e29b-41d4-a716-446655440000)
const GROUP_PAGE_URL_RE = /\/app\/groups\/[0-9a-f-]{36}/;

// Helper to create a group via the UI and get the group ID from the URL
async function createGroupViaUI(
	page: import('@playwright/test').Page,
	name: string,
	options: { description?: string; currency?: string } = {}
): Promise<string> {
	await page.goto('/app/groups/new');
	await page.getByTestId('group-name-input').fill(name);
	if (options.description) {
		// Note: fill() doesn't work properly with Svelte 5 textareas (SSR content nodes).
		// Use click() + type() to correctly trigger input events that Svelte tracks.
		await page.locator('textarea[name="description"]').click();
		await page.locator('textarea[name="description"]').type(options.description);
	}
	if (options.currency) {
		await page.getByTestId('group-currency-select').selectOption(options.currency);
	}
	await page.getByTestId('submit-create-group').click();
	// Wait for redirect to /app/groups/<uuid> (not /app/groups/new)
	await page.waitForURL(GROUP_PAGE_URL_RE);
	return page.url().split('/app/groups/')[1];
}

test.describe('S-010 — Créer un groupe', () => {
	// Nettoyage après les tests
	test.afterAll(async () => {
		try {
			await db`DELETE FROM public.group_members
        WHERE group_id IN (SELECT id FROM public.groups WHERE name LIKE '[E2E]%')`;
			await db`DELETE FROM public.groups WHERE name LIKE '[E2E]%'`;
		} catch {
			// Ignore cleanup errors
		}
	});

	// ─── Auth guard : /app redirige vers /login si non connecté ─────────────────

	test('accès /app sans session → redirection /login', async ({ page }) => {
		await page.goto('/app');
		await expect(page).toHaveURL(/\/login/);
	});

	test('accès /app/groups/new sans session → redirection /login', async ({ page }) => {
		await page.goto('/app/groups/new');
		await expect(page).toHaveURL(/\/login/);
	});

	// ─── Page /app : liste « Mes groupes » ───────────────────────────────────────

	test('/app affiche « Mes groupes » avec bouton « Créer un groupe »', async ({ page }) => {
		await login(page, 'alice');
		await page.goto('/app');

		// Titre principal
		await expect(page.getByTestId('my-groups-title')).toBeVisible();
		await expect(page.getByTestId('my-groups-title')).toHaveText('Mes groupes');

		// Bouton de création
		await expect(page.getByTestId('create-group-btn')).toBeVisible();
		await expect(page.getByTestId('create-group-btn')).toHaveText('Créer un groupe');
	});

	test('Alice voit le groupe seedé « Les potes du test » avec badge Admin', async ({ page }) => {
		await login(page, 'alice');
		await page.goto('/app');

		// Le groupe seedé doit apparaître dans la liste
		await expect(page.getByTestId('groups-list')).toBeVisible();

		const groupCard = page.getByTestId('group-card').first();
		await expect(groupCard.getByTestId('group-name')).toContainText('Les potes du test');
		await expect(groupCard.getByTestId('group-admin-badge')).toBeVisible();
		await expect(groupCard.getByTestId('group-currency')).toHaveText('EUR');
	});

	// ─── Création d'un groupe ────────────────────────────────────────────────────

	test('Alice crée un groupe → redirigée sur la page groupe avec nom + badge Admin', async ({
		page
	}) => {
		await login(page, 'alice');
		await page.goto('/app/groups/new');

		// Formulaire visible avec tous les champs
		await expect(page.getByTestId('create-group-form')).toBeVisible();
		await expect(page.getByTestId('group-name-input')).toBeVisible();
		await expect(page.locator('textarea[name="description"]')).toBeVisible();
		await expect(page.getByTestId('group-currency-select')).toBeVisible();
		await expect(page.getByTestId('submit-create-group')).toBeVisible();

		// Devise par défaut : EUR
		await expect(page.getByTestId('group-currency-select')).toHaveValue('EUR');

		// Remplir le formulaire
		await page.getByTestId('group-name-input').fill(GROUP_NAME);
		await page.getByTestId('group-currency-select').selectOption('USD');

		// Soumettre
		await page.getByTestId('submit-create-group').click();

		// Redirection vers la page du groupe (UUID, pas /new)
		await page.waitForURL(GROUP_PAGE_URL_RE);

		// La page du groupe affiche le nom et le badge Admin
		await expect(page.getByTestId('group-name')).toHaveText(GROUP_NAME);
		await expect(page.getByTestId('admin-badge')).toBeVisible();
		await expect(page.getByTestId('admin-badge')).toHaveText('Admin');
		await expect(page.getByTestId('group-currency')).toHaveText('Devise : USD');
	});

	test('le groupe créé est en DB avec le créateur comme admin', async ({ page }) => {
		await login(page, 'alice');

		const uniqueName = `[E2E] DB-Check-${Date.now()}`;
		const groupId = await createGroupViaUI(page, uniqueName);

		// Vérifier en DB que le groupe existe
		const groupRows =
			await db`SELECT id, name, currency FROM public.groups WHERE id = ${groupId}`;
		expect(groupRows).toHaveLength(1);
		expect(groupRows[0].name).toBe(uniqueName);
		expect(groupRows[0].currency).toBe('EUR'); // défaut EUR

		// Vérifier que Alice est admin
		const memberRows =
			await db`SELECT role FROM public.group_members WHERE group_id = ${groupId} AND removed_at IS NULL`;
		expect(memberRows).toHaveLength(1);
		expect(memberRows[0].role).toBe('admin');
	});

	test('groupe créé avec description — description stockée et affichée', async ({ page }) => {
		await login(page, 'alice');
		await page.goto('/app/groups/new');

		const nameWithDesc = `[E2E] Avec-Desc-${Date.now()}`;
		const description = 'Une description de test';

		await page.getByTestId('group-name-input').fill(nameWithDesc);
		// Utiliser click+type pour déclencher les input events (fill() seul ne suffit pas
		// avec les textareas Svelte 5 rendu côté serveur)
		await page.locator('textarea[name="description"]').click();
		await page.locator('textarea[name="description"]').type(description);
		await page.getByTestId('submit-create-group').click();
		await page.waitForURL(GROUP_PAGE_URL_RE);

		// La description doit apparaître sur la page du groupe
		await expect(page.getByTestId('group-description')).toBeVisible();
		await expect(page.getByTestId('group-description')).toHaveText(description);
	});

	// ─── Le groupe apparaît dans « Mes groupes » ─────────────────────────────────

	test("le groupe créé apparaît dans la liste « Mes groupes » d'Alice", async ({ page }) => {
		await login(page, 'alice');

		// Créer un groupe spécifique pour ce test
		const nameForListTest = `[E2E] ListeTest-${Date.now()}`;
		await createGroupViaUI(page, nameForListTest);

		// Aller sur la page des groupes
		await page.goto('/app');

		// Le groupe créé doit apparaître dans la liste
		const groupNames = await page.getByTestId('group-name').allTextContents();
		expect(groupNames.some((name) => name === nameForListTest)).toBe(true);
	});

	// ─── Isolation : Bob ne voit pas les groupes d'Alice ────────────────────────

	test('Bob ne voit pas le groupe créé par Alice', async ({ page }) => {
		await login(page, 'bob');
		await page.goto('/app');

		// Bob ne doit pas voir les groupes E2E créés par Alice (qui lui appartiennent seuls)
		const groupNames = await page.getByTestId('group-name').allTextContents();
		// GROUP_NAME est créé par Alice uniquement, Bob ne doit pas le voir
		expect(groupNames.every((name) => !name.startsWith('[E2E] Groupe-'))).toBe(true);
	});

	test('Dave (non membre) ne peut pas accéder à la page du groupe seedé', async ({ page }) => {
		await login(page, 'dave');

		// Dave essaie d'accéder au groupe seedé dont il n'est pas membre
		await page.goto('/app/groups/11111111-1111-1111-1111-111111111111');

		// Doit recevoir une 404
		await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
	});

	// ─── Validation des erreurs ───────────────────────────────────────────────────

	test('nom trop court (1 car) → erreur de validation Zod affichée', async ({ page }) => {
		await login(page, 'alice');
		await page.goto('/app/groups/new');

		// Supprimer les attributs HTML5 de validation pour tester la validation Zod côté serveur
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

		// Message d'erreur Zod visible
		await expect(page.getByTestId('group-name-error')).toBeVisible();
		await expect(page.getByTestId('group-name-error')).toHaveText(
			'Le nom doit faire au moins 2 caractères'
		);
	});

	test('nom vide → bloqué (HTML5 required) ou erreur serveur, reste sur formulaire', async ({
		page
	}) => {
		await login(page, 'alice');
		await page.goto('/app/groups/new');

		// Cliquer sans remplir le nom (HTML5 required bloque la soumission)
		await page.getByTestId('submit-create-group').click();

		// Reste sur la page de création
		await expect(page).toHaveURL(/\/app\/groups\/new/);
		// Pas de redirection vers /app/groups/[id]
	});

	test('bouton Annuler renvoie vers /app', async ({ page }) => {
		await login(page, 'alice');
		await page.goto('/app/groups/new');

		await page.getByRole('link', { name: 'Annuler' }).click();
		await expect(page).toHaveURL('/app');
	});

	// ─── Navigation : lien "← Retour" depuis le formulaire ─────────────────────

	test('lien "← Retour" depuis le formulaire de création ramène sur /app', async ({ page }) => {
		await login(page, 'alice');
		await page.goto('/app/groups/new');

		await page.getByRole('link', { name: '← Retour' }).click();
		await expect(page).toHaveURL('/app');
	});

	// ─── Navigation : lien "← Mes groupes" depuis la page du groupe ─────────────

	test('lien "← Mes groupes" depuis la page du groupe ramène sur /app', async ({ page }) => {
		await login(page, 'alice');
		// Naviguer vers le groupe seedé
		await page.goto('/app/groups/11111111-1111-1111-1111-111111111111');

		// Utiliser le lien header (exact match sur le texte "← Mes groupes")
		await page.getByRole('link', { name: '← Mes groupes' }).click();
		await expect(page).toHaveURL('/app');
	});

	// ─── État vide : nouvel utilisateur sans groupe ──────────────────────────────

	test("Dave (sans groupe) voit un état vide avec bouton de création", async ({ page }) => {
		await login(page, 'dave');
		await page.goto('/app');

		// Dave n'est membre d'aucun groupe → état vide
		await expect(page.getByTestId('empty-groups')).toBeVisible();
		await expect(page.getByTestId('empty-groups')).toContainText("Vous n'avez pas encore de groupe");
		// Un bouton d'action est proposé dans l'état vide
		await expect(
			page.getByTestId('empty-groups').getByRole('link', { name: /groupe/i })
		).toBeVisible();
	});
});
