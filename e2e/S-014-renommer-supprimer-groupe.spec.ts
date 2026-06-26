/**
 * S-014 — Renommer / supprimer un groupe
 *
 * Critères d'acceptation :
 * 1. Depuis la page du groupe, entrée « Paramètres » visible uniquement par les admins.
 * 2. Renommer : formulaire pré-rempli → enregistrement → nouveau nom s'affiche partout.
 * 3. Nom vide / < 2 / > 50 caractères → erreur de validation, pas de modification.
 * 4. Supprimer : action protégée par confirmation → archived_at posé ; groupe disparaît.
 * 5. Après suppression, accès aux pages du groupe → 404.
 * 6. Membre simple ne voit ni modifier ni supprimer ; actions serveur → refusé.
 * 7. Paris et ardoise non effacés en base (soft-delete).
 *
 * Scénarios :
 * - Alice (admin) voit le lien Paramètres, Bob (membre) ne le voit pas.
 * - Alice renomme un groupe [E2E] → message succès, nom mis à jour sur page groupe et Mes groupes.
 * - Renommage avec nom invalide → refusé (browser et serveur).
 * - Alice supprime un groupe [E2E] avec confirmation → il disparaît de Mes groupes.
 * - Accès URL directe sur groupe supprimé → 404.
 * - Bob voit Bob appeler directement les actions rename/delete → refusé.
 * - Données restent en base après suppression (soft-delete).
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';

// Groupe seedé : Alice admin, Bob et Carol membres, Dave non-membre
const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const SEEDED_GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;
const SEEDED_SETTINGS_URL = `${SEEDED_GROUP_URL}/settings`;

// IDs des users seedés
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

/**
 * Crée un groupe de test directement en DB et retourne son ID.
 */
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

/**
 * Ajoute un membre simple en DB.
 */
async function addTestMember(groupId: string, userId: string): Promise<void> {
	await db`
		INSERT INTO group_members (group_id, user_id, role)
		VALUES (${groupId}, ${userId}, 'member')
	`;
}

test.describe('S-014 — Renommer / supprimer un groupe', () => {
	// Nettoyage après chaque test
	test.afterEach(async () => {
		try {
			// Supprimer les données de test (les FK cascade depuis groups → group_members)
			await db`DELETE FROM groups WHERE name LIKE '[E2E]%'`;
		} catch {
			// Ignore les erreurs de nettoyage
		}
	});

	// ── Critère 1 : Lien Paramètres visible admin uniquement ─────────────────────

	test('Alice (admin) voit le lien Paramètres sur la page du groupe', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(SEEDED_GROUP_URL);

		const settingsLink = page.getByTestId('settings-link');
		await expect(settingsLink).toBeVisible();
		await expect(settingsLink).toHaveAttribute('href', SEEDED_SETTINGS_URL);
	});

	test('Bob (membre simple) ne voit pas le lien Paramètres', async ({ page }) => {
		await login(page, 'bob');
		await page.goto(SEEDED_GROUP_URL);

		await expect(page.getByTestId('settings-link')).not.toBeVisible();
	});

	test('Bob (membre simple) accède directement à /settings → 403', async ({ page }) => {
		await login(page, 'bob');
		await page.goto(SEEDED_SETTINGS_URL);

		await expect(page.getByRole('heading', { name: '403' })).toBeVisible();
	});

	test('Accès à /settings sans session → redirection /login', async ({ page }) => {
		await page.goto(SEEDED_SETTINGS_URL);
		await expect(page).toHaveURL(/\/login/);
	});

	// ── Navigation vers les paramètres ───────────────────────────────────────────

	test('Alice clique sur Paramètres → navigue vers la page settings', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(SEEDED_GROUP_URL);

		await page.getByTestId('settings-link').click();

		await expect(page).toHaveURL(SEEDED_SETTINGS_URL);
		await expect(page.getByTestId('settings-title')).toBeVisible();
		await expect(page.getByTestId('settings-title')).toHaveText('Paramètres du groupe');
	});

	test('La page settings a un lien de retour vers la page du groupe', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(SEEDED_SETTINGS_URL);

		const backLink = page.getByRole('link', { name: '← Retour au groupe' });
		await expect(backLink).toBeVisible();
		await expect(backLink).toHaveAttribute('href', SEEDED_GROUP_URL);
	});

	test('Le formulaire de renommage est pré-rempli avec le nom courant', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(SEEDED_SETTINGS_URL);

		await expect(page.getByTestId('group-name-input')).toHaveValue('Les potes du test');
	});

	// ── Critère 2 : Renommage réussi ─────────────────────────────────────────────

	test('Alice renomme un groupe [E2E] → message succès + nom mis à jour', async ({ page }) => {
		const originalName = '[E2E] Groupe à renommer';
		const newName = '[E2E] Groupe renommé OK';

		const groupId = await createTestGroup(originalName, ALICE_ID);
		const settingsUrl = `/app/groups/${groupId}/settings`;
		const groupUrl = `/app/groups/${groupId}`;

		await login(page, 'alice');
		await page.goto(settingsUrl);
		// Attendre que Svelte soit hydraté avant d'interagir avec le formulaire
		await page.waitForLoadState('networkidle');

		// Formulaire pré-rempli avec le nom courant
		await expect(page.getByTestId('group-name-input')).toHaveValue(originalName);

		// Saisir le nouveau nom et soumettre
		await page.getByTestId('group-name-input').fill(newName);
		await page.getByTestId('rename-submit-btn').click();

		// Message de succès
		await expect(page.getByTestId('rename-success')).toBeVisible();
		await expect(page.getByTestId('rename-success')).toContainText(newName);

		// L'input affiche désormais le nouveau nom
		await expect(page.getByTestId('group-name-input')).toHaveValue(newName);

		// Vérifier en DB
		const rows = await db`SELECT name FROM groups WHERE id = ${groupId}`;
		expect(rows[0].name).toBe(newName);
	});

	test('Nouveau nom visible sur la page du groupe après renommage', async ({ page }) => {
		const originalName = '[E2E] Groupe page check';
		const newName = '[E2E] Groupe page renommé';

		const groupId = await createTestGroup(originalName, ALICE_ID);
		const settingsUrl = `/app/groups/${groupId}/settings`;
		const groupUrl = `/app/groups/${groupId}`;

		await login(page, 'alice');
		await page.goto(settingsUrl);
		await page.waitForLoadState('networkidle');
		await page.getByTestId('group-name-input').fill(newName);
		await page.getByTestId('rename-submit-btn').click();
		await expect(page.getByTestId('rename-success')).toBeVisible();

		// Vérifier en DB que le renommage a été persisté
		const rows = await db`SELECT name FROM groups WHERE id = ${groupId}`;
		expect(rows[0].name).toBe(newName);

		// Naviguer vers la page du groupe (rechargement complet côté serveur)
		await page.goto(groupUrl);
		await page.waitForLoadState('networkidle');
		await expect(page.getByTestId('group-name')).toHaveText(newName);
	});

	test('Nouveau nom visible dans « Mes groupes » après renommage', async ({ page }) => {
		const originalName = '[E2E] Groupe mes-groupes check';
		const newName = '[E2E] Groupe mes-groupes renommé';

		const groupId = await createTestGroup(originalName, ALICE_ID);
		const settingsUrl = `/app/groups/${groupId}/settings`;

		await login(page, 'alice');
		await page.goto(settingsUrl);
		await page.waitForLoadState('networkidle');
		await page.getByTestId('group-name-input').fill(newName);
		await page.getByTestId('rename-submit-btn').click();
		await expect(page.getByTestId('rename-success')).toBeVisible();

		// Vérifier en DB que le renommage a été persisté
		const rows = await db`SELECT name FROM groups WHERE id = ${groupId}`;
		expect(rows[0].name).toBe(newName);

		// Naviguer vers Mes groupes (rechargement complet côté serveur)
		await page.goto('/app');
		await page.waitForLoadState('networkidle');
		await expect(page.getByText(newName)).toBeVisible();
		// L'ancien nom n'est plus présent
		await expect(page.getByText(originalName)).not.toBeVisible();
	});

	// ── Critère 3 : Validation du nom ────────────────────────────────────────────

	test('Renommage avec nom à 1 caractère → refusé, aucun changement en DB', async ({ page }) => {
		const groupId = await createTestGroup('[E2E] Groupe valid 1char', ALICE_ID);
		const settingsUrl = `/app/groups/${groupId}/settings`;

		await login(page, 'alice');
		await page.goto(settingsUrl);

		// Tenter de soumettre avec 1 caractère (minlength=2 bloque le formulaire)
		await page.getByTestId('group-name-input').fill('X');
		await page.getByTestId('rename-submit-btn').click();

		// Reste sur la page settings (pas de redirection)
		await expect(page).toHaveURL(settingsUrl);
		// Pas de message de succès
		await expect(page.getByTestId('rename-success')).not.toBeVisible();

		// DB : nom inchangé
		const rows = await db`SELECT name FROM groups WHERE id = ${groupId}`;
		expect(rows[0].name).toBe('[E2E] Groupe valid 1char');
	});

	test('Renommage via action serveur avec nom < 2 chars → Zod refuse (failure)', async ({
		page
	}) => {
		const groupId = await createTestGroup('[E2E] Groupe valid zod', ALICE_ID);
		const settingsUrl = `/app/groups/${groupId}/settings`;

		await login(page, 'alice');
		// On doit d'abord naviguer pour que les cookies de session soient actifs
		await page.goto(settingsUrl);

		// Contournement de la validation HTML pour tester la validation Zod côté serveur
		const response = await page.evaluate(async (url) => {
			const r = await fetch(`${url}?/rename`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'x-sveltekit-action': 'true'
				},
				body: 'name=X'
			});
			const body = await r.json();
			return { httpStatus: r.status, type: body?.type };
		}, settingsUrl);

		// SvelteKit retourne 200 mais avec failure
		expect(response.httpStatus).toBe(200);
		expect(response.type).toBe('failure');

		// DB : nom inchangé
		const rows = await db`SELECT name FROM groups WHERE id = ${groupId}`;
		expect(rows[0].name).toBe('[E2E] Groupe valid zod');
	});

	// ── Critère 4 & 5 : Suppression avec confirmation ────────────────────────────

	test('Bouton Supprimer définitivement désactivé sans saisie dans le champ confirmation', async ({
		page
	}) => {
		const groupId = await createTestGroup('[E2E] Groupe disable check', ALICE_ID);
		const settingsUrl = `/app/groups/${groupId}/settings`;

		await login(page, 'alice');
		await page.goto(settingsUrl);
		await page.waitForLoadState('networkidle');

		// Afficher le formulaire de confirmation
		await page.getByTestId('delete-group-btn').click();
		await expect(page.getByTestId('delete-confirm-form')).toBeVisible();

		// Bouton désactivé sans saisie
		await expect(page.getByTestId('delete-confirm-btn')).toBeDisabled();
	});

	test('Bouton désactivé si nom saisi incorrect', async ({ page }) => {
		const groupId = await createTestGroup('[E2E] Groupe mauvais nom', ALICE_ID);
		const settingsUrl = `/app/groups/${groupId}/settings`;

		await login(page, 'alice');
		await page.goto(settingsUrl);
		await page.waitForLoadState('networkidle');

		await page.getByTestId('delete-group-btn').click();
		await expect(page.getByTestId('delete-confirm-form')).toBeVisible();

		// Nom incorrect → bouton toujours désactivé
		await page.getByTestId('delete-confirm-input').fill('mauvais nom');
		await expect(page.getByTestId('delete-confirm-btn')).toBeDisabled();
	});

	test('Bouton activé uniquement avec le nom exact (case-sensitive)', async ({ page }) => {
		const groupId = await createTestGroup('[E2E] Groupe exact', ALICE_ID);
		const settingsUrl = `/app/groups/${groupId}/settings`;

		await login(page, 'alice');
		await page.goto(settingsUrl);
		await page.waitForLoadState('networkidle');

		await page.getByTestId('delete-group-btn').click();
		await expect(page.getByTestId('delete-confirm-form')).toBeVisible();

		// Nom exact → bouton activé
		await page.getByTestId('delete-confirm-input').fill('[E2E] Groupe exact');
		await expect(page.getByTestId('delete-confirm-btn')).not.toBeDisabled();
	});

	test('Annuler la suppression cache le formulaire et restaure le bouton Supprimer', async ({
		page
	}) => {
		const groupId = await createTestGroup('[E2E] Groupe annuler', ALICE_ID);
		const settingsUrl = `/app/groups/${groupId}/settings`;

		await login(page, 'alice');
		await page.goto(settingsUrl);
		await page.waitForLoadState('networkidle');

		// Afficher le formulaire de confirmation
		await page.getByTestId('delete-group-btn').click();
		await expect(page.getByTestId('delete-confirm-form')).toBeVisible();

		// Annuler
		await page.getByTestId('delete-cancel-btn').click();

		// Formulaire caché, bouton principal revenu
		await expect(page.getByTestId('delete-confirm-form')).not.toBeVisible();
		await expect(page.getByTestId('delete-group-btn')).toBeVisible();

		// DB : groupe non archivé
		const rows = await db`SELECT archived_at FROM groups WHERE id = ${groupId}`;
		expect(rows[0].archived_at).toBeNull();
	});

	test('Alice supprime un groupe [E2E] → archived_at posé + redirection /app', async ({
		page
	}) => {
		const groupId = await createTestGroup('[E2E] Groupe suppression', ALICE_ID);
		const settingsUrl = `/app/groups/${groupId}/settings`;

		await login(page, 'alice');
		await page.goto(settingsUrl);
		await page.waitForLoadState('networkidle');

		await page.getByTestId('delete-group-btn').click();
		await expect(page.getByTestId('delete-confirm-form')).toBeVisible();

		await page.getByTestId('delete-confirm-input').fill('[E2E] Groupe suppression');
		await expect(page.getByTestId('delete-confirm-btn')).not.toBeDisabled();
		await page.getByTestId('delete-confirm-btn').click();

		// Redirigé vers /app
		await expect(page).toHaveURL(/\/app$/);

		// DB : archived_at est posé
		const rows = await db`SELECT archived_at FROM groups WHERE id = ${groupId}`;
		expect(rows[0].archived_at).not.toBeNull();
	});

	test("Groupe supprimé disparaît de « Mes groupes » d'Alice", async ({ page }) => {
		const groupId = await createTestGroup('[E2E] Groupe disparu alice', ALICE_ID);

		// Archiver le groupe directement en DB
		await db`UPDATE groups SET archived_at = NOW() WHERE id = ${groupId}`;

		await login(page, 'alice');
		await page.goto('/app');

		// Le groupe n'est plus dans la liste
		await expect(page.getByText('[E2E] Groupe disparu alice')).not.toBeVisible();
	});

	test('Groupe supprimé disparaît de « Mes groupes » de Bob (membre)', async ({ browser }) => {
		const groupId = await createTestGroup('[E2E] Groupe disparu bob', ALICE_ID);
		await addTestMember(groupId, BOB_ID);

		const context = await browser.newContext();
		const page = await context.newPage();

		await login(page, 'bob');
		await page.goto('/app');

		// Bob voit le groupe avant suppression
		await expect(page.getByText('[E2E] Groupe disparu bob')).toBeVisible();

		// Archiver le groupe
		await db`UPDATE groups SET archived_at = NOW() WHERE id = ${groupId}`;

		// Après rechargement, le groupe n'est plus visible
		await page.reload();
		await expect(page.getByText('[E2E] Groupe disparu bob')).not.toBeVisible();

		await context.close();
	});

	// ── Critère 5 : Accès URL directe sur groupe archivé → 404 ──────────────────

	test('Groupe archivé → page groupe donne 404', async ({ page }) => {
		const groupId = await createTestGroup('[E2E] Groupe 404 check', ALICE_ID);
		await db`UPDATE groups SET archived_at = NOW() WHERE id = ${groupId}`;

		await login(page, 'alice');
		await page.goto(`/app/groups/${groupId}`);

		await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
	});

	test('Groupe archivé → page settings donne 404', async ({ page }) => {
		const groupId = await createTestGroup('[E2E] Groupe 404 settings', ALICE_ID);
		await db`UPDATE groups SET archived_at = NOW() WHERE id = ${groupId}`;

		await login(page, 'alice');
		await page.goto(`/app/groups/${groupId}/settings`);

		await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
	});

	test('Groupe archivé → page membres donne 404', async ({ page }) => {
		const groupId = await createTestGroup('[E2E] Groupe 404 membres', ALICE_ID);
		await addTestMember(groupId, BOB_ID);
		await db`UPDATE groups SET archived_at = NOW() WHERE id = ${groupId}`;

		await login(page, 'bob');
		await page.goto(`/app/groups/${groupId}/members`);

		await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
	});

	// ── Critère 6 : Membre simple → actions serveur refusées ─────────────────────

	test('Bob appelle action rename sur le groupe seedé → refusé (failure)', async ({ page }) => {
		await login(page, 'bob');
		// Naviguer pour activer les cookies de session
		await page.goto(SEEDED_GROUP_URL);

		const response = await page.evaluate(async (settingsUrl) => {
			const r = await fetch(`${settingsUrl}?/rename`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'x-sveltekit-action': 'true'
				},
				body: 'name=Nouveau+nom'
			});
			const body = await r.json();
			return { httpStatus: r.status, type: body?.type };
		}, SEEDED_SETTINGS_URL);

		expect(response.httpStatus).toBe(200);
		expect(response.type).toBe('failure');

		// DB : nom inchangé
		const rows = await db`SELECT name FROM groups WHERE id = ${SEEDED_GROUP_ID}`;
		expect(rows[0].name).toBe('Les potes du test');
	});

	test('Bob appelle action delete sur le groupe seedé → refusé (failure)', async ({ page }) => {
		await login(page, 'bob');
		await page.goto(SEEDED_GROUP_URL);

		const response = await page.evaluate(async (settingsUrl) => {
			const r = await fetch(`${settingsUrl}?/delete`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'x-sveltekit-action': 'true'
				},
				body: 'confirm=Les+potes+du+test'
			});
			const body = await r.json();
			return { httpStatus: r.status, type: body?.type };
		}, SEEDED_SETTINGS_URL);

		expect(response.httpStatus).toBe(200);
		expect(response.type).toBe('failure');

		// DB : groupe non archivé
		const rows = await db`SELECT archived_at FROM groups WHERE id = ${SEEDED_GROUP_ID}`;
		expect(rows[0].archived_at).toBeNull();
	});

	// ── Critère 7 : Soft-delete — données restent en base ───────────────────────

	test('Les membres restent en base après archivage du groupe (soft-delete)', async () => {
		const groupId = await createTestGroup('[E2E] Groupe soft-delete', ALICE_ID);
		await addTestMember(groupId, BOB_ID);

		// Archiver
		await db`UPDATE groups SET archived_at = NOW() WHERE id = ${groupId}`;

		// group_members est toujours présent (pas supprimé)
		const memberRows = await db`SELECT * FROM group_members WHERE group_id = ${groupId}`;
		expect(memberRows.length).toBe(2); // Alice + Bob

		// Le groupe est toujours en base (soft-delete, pas hard-delete)
		const groupRows = await db`SELECT id, archived_at FROM groups WHERE id = ${groupId}`;
		expect(groupRows.length).toBe(1);
		expect(groupRows[0].archived_at).not.toBeNull();
	});
});
