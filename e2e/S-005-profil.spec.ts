/**
 * S-005 — Profil : pseudo & avatar
 *
 * Critères d'acceptation :
 * 1. /app/profile affiche le pseudo actuel et l'avatar (ou initiales par défaut)
 * 2. Modifier le pseudo (2–30 caractères) → sauvegardé, visible dans le header
 * 3. Pseudo invalide (vide, trop court) → erreur de validation, pas de sauvegarde
 * 4. Upload d'un PNG < 2 Mo → avatar remplacé (img src contient le storage public)
 * 5. Supprimer l'avatar → retour aux initiales dans le header
 *
 * Notes :
 * - La validation HTML5 (minlength/maxlength/required) empêche la soumission
 *   côté client pour vide et trop long. Pour tester la validation Zod côté
 *   serveur (pseudo trop court), on bypasse le minlength HTML via JS.
 * - Le nettoyage afterAll remet alice.pseudo à 'Alice' et supprime son avatar.
 */
import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import path from 'node:path';

const AVATAR_FIXTURE = path.resolve('e2e/fixtures/avatar.png');

// Helper pour naviguer vers /app/profile en étant connecté
async function goToProfile(page: Page) {
	await login(page, 'alice');
	await page.goto('/app/profile');
	await expect(page).toHaveURL('/app/profile');
}

test.describe('S-005 — Profil : pseudo & avatar', () => {
	// Nettoyage : remettre alice dans son état seedé
	test.afterAll(async () => {
		try {
			await db`UPDATE public.profiles SET pseudo = 'Alice', avatar_url = NULL WHERE pseudo LIKE '[E2E]%' OR pseudo = 'Alice'`;
			// Reset plus ciblé : on cherche l'utilisateur alice@test.local
			const rows =
				await db`SELECT id FROM auth.users WHERE email = 'alice@test.local' LIMIT 1`;
			if (rows.length > 0) {
				await db`UPDATE public.profiles SET pseudo = 'Alice', avatar_url = NULL WHERE id = ${rows[0].id}`;
			}
		} catch {
			// Ignore cleanup errors
		}
	});

	// ─── Critère 1 : affichage page profil ───────────────────────────────────

	test('la page /app/profile affiche le pseudo actuel et les initiales', async ({ page }) => {
		await goToProfile(page);

		// La page contient un heading "Mon profil"
		await expect(page.getByRole('heading', { name: 'Mon profil' })).toBeVisible();

		// Le champ pseudo contient la valeur actuelle
		const pseudoInput = page.getByTestId('pseudo-input');
		await expect(pseudoInput).toBeVisible();
		const value = await pseudoInput.inputValue();
		expect(value.length).toBeGreaterThan(0);

		// Le header affiche le pseudo et soit l'avatar soit les initiales
		await expect(page.getByTestId('header-pseudo')).toBeVisible();
		const headerHasAvatar =
			(await page.getByTestId('header-avatar').count()) > 0 &&
			(await page.getByTestId('header-avatar').isVisible());
		const headerHasInitials =
			(await page.getByTestId('header-avatar-initials').count()) > 0 &&
			(await page.getByTestId('header-avatar-initials').isVisible());
		expect(headerHasAvatar || headerHasInitials).toBe(true);
	});

	test('page protégée — /app/profile sans session → redirection /login', async ({ page }) => {
		await page.goto('/app/profile');
		await expect(page).toHaveURL(/\/login/);
	});

	// ─── Critère 2 : modifier le pseudo ──────────────────────────────────────

	test('modifier le pseudo → sauvegardé et visible dans le header immédiatement', async ({
		page
	}) => {
		await goToProfile(page);

		const newPseudo = '[E2E] Alice Modifiée';

		// Saisir le nouveau pseudo et soumettre
		await page.getByTestId('pseudo-input').fill(newPseudo);
		await page.getByTestId('save-pseudo-btn').click();

		// Attendre que la page se mette à jour (invalidateAll + toast)
		await expect(page.getByTestId('header-pseudo')).toHaveText(newPseudo, { timeout: 5000 });

		// Vérifier aussi la valeur dans l'input après mise à jour
		await expect(page.getByTestId('pseudo-input')).toHaveValue(newPseudo);

		// Vérification DB
		const aliceRows = await db`SELECT id FROM auth.users WHERE email = 'alice@test.local' LIMIT 1`;
		const profileRows =
			await db`SELECT pseudo FROM public.profiles WHERE id = ${aliceRows[0].id}`;
		expect(profileRows[0].pseudo).toBe(newPseudo);
	});

	test('modifier le pseudo → pseudo toujours affiché après rechargement de page', async ({
		page
	}) => {
		await goToProfile(page);

		const newPseudo = '[E2E] Alice Reload';

		await page.getByTestId('pseudo-input').fill(newPseudo);
		await page.getByTestId('save-pseudo-btn').click();
		await expect(page.getByTestId('header-pseudo')).toHaveText(newPseudo, { timeout: 5000 });

		// Rechargement de la page
		await page.reload();

		// Le pseudo doit toujours s'afficher
		await expect(page.getByTestId('header-pseudo')).toHaveText(newPseudo);
		await expect(page.getByTestId('pseudo-input')).toHaveValue(newPseudo);
	});

	// ─── Critère 3 : validation invalide ─────────────────────────────────────

	test('pseudo vide → formulaire bloqué côté HTML5, pas de sauvegarde', async ({ page }) => {
		await goToProfile(page);

		const currentPseudo = await page.getByTestId('pseudo-input').inputValue();

		// Vider le champ et tenter de soumettre
		await page.getByTestId('pseudo-input').fill('');
		await page.getByTestId('save-pseudo-btn').click();

		// On reste sur /app/profile (HTML5 required bloque)
		await expect(page).toHaveURL('/app/profile');

		// La valeur en DB n'a pas changé
		const aliceRows = await db`SELECT id FROM auth.users WHERE email = 'alice@test.local' LIMIT 1`;
		const profileRows =
			await db`SELECT pseudo FROM public.profiles WHERE id = ${aliceRows[0].id}`;
		expect(profileRows[0].pseudo).toBe(currentPseudo);
	});

	test('pseudo trop court (1 char) → erreur Zod côté serveur, pas de sauvegarde', async ({
		page
	}) => {
		await goToProfile(page);

		const currentPseudo = await page.getByTestId('pseudo-input').inputValue();

		// Bypasser la validation HTML5 minlength via JS pour envoyer 1 seul char
		await page.getByTestId('pseudo-input').evaluate((el: HTMLInputElement) => {
			el.removeAttribute('minlength');
			el.removeAttribute('required');
		});
		await page.getByTestId('pseudo-input').fill('X');
		await page.getByTestId('save-pseudo-btn').click();

		// La page reste sur /app/profile (SvelteKit named action peut exposer ?/updatePseudo)
		await expect(page).toHaveURL(/\/app\/profile/);

		// Message d'erreur Zod visible
		await expect(page.getByTestId('pseudo-error')).toBeVisible({ timeout: 5000 });
		await expect(page.getByTestId('pseudo-error')).toContainText('au moins 2 caractères');

		// Le pseudo en DB n'a pas changé
		const aliceRows = await db`SELECT id FROM auth.users WHERE email = 'alice@test.local' LIMIT 1`;
		const profileRows =
			await db`SELECT pseudo FROM public.profiles WHERE id = ${aliceRows[0].id}`;
		expect(profileRows[0].pseudo).toBe(currentPseudo);
	});

	// ─── Critère 4 : upload d'avatar ─────────────────────────────────────────

	test('upload PNG < 2 Mo → avatar remplacé, img src pointe vers le storage', async ({
		page
	}) => {
		await goToProfile(page);

		// Sélectionner le fichier dans l'input file
		const fileInput = page.getByTestId('avatar-input');
		await fileInput.setInputFiles(AVATAR_FIXTURE);

		// Cliquer sur "Changer l'avatar"
		await page.getByRole('button', { name: "Changer l'avatar" }).click();

		// Attendre que l'avatar affiche l'URL Storage (pas juste le blob de prévisualisation locale)
		await expect(page.getByTestId('avatar-img')).toHaveAttribute(
			'src',
			/\/storage\/v1\/object\/public\/avatars\//,
			{ timeout: 15000 }
		);

		// Vérifier que le header reflète aussi l'avatar
		await expect(page.getByTestId('header-avatar')).toBeVisible({ timeout: 5000 });

		// Vérification DB : avatar_url n'est plus null
		const aliceRows = await db`SELECT id FROM auth.users WHERE email = 'alice@test.local' LIMIT 1`;
		const profileRows =
			await db`SELECT avatar_url FROM public.profiles WHERE id = ${aliceRows[0].id}`;
		expect(profileRows[0].avatar_url).toBeTruthy();
		expect(profileRows[0].avatar_url).toContain('/storage/v1/object/public/avatars/');
	});

	// ─── Critère 5 : supprimer l'avatar ──────────────────────────────────────

	test("supprimer l'avatar → retour aux initiales dans le header", async ({ page }) => {
		await goToProfile(page);

		// Vérifier s'il y a déjà un avatar, sinon en uploader un
		const hasAvatar = (await page.getByTestId('delete-avatar-btn').count()) > 0;
		if (!hasAvatar) {
			// Upload d'abord
			const fileInput = page.getByTestId('avatar-input');
			await fileInput.setInputFiles(AVATAR_FIXTURE);
			await page.getByRole('button', { name: "Changer l'avatar" }).click();
			await expect(page.getByTestId('delete-avatar-btn')).toBeVisible({ timeout: 15000 });
		}

		// Cliquer sur "Supprimer l'avatar"
		await page.getByTestId('delete-avatar-btn').click();

		// Le bouton doit disparaître (plus d'avatar)
		await expect(page.getByTestId('delete-avatar-btn')).not.toBeVisible({ timeout: 10000 });

		// Le header doit afficher les initiales (pas l'img avatar)
		await expect(page.getByTestId('header-avatar-initials')).toBeVisible({ timeout: 5000 });
		await expect(page.getByTestId('header-avatar')).not.toBeVisible();

		// L'img avatar ne doit plus être présente dans la section profil
		await expect(page.getByTestId('avatar-img')).not.toBeVisible();

		// Vérification DB : avatar_url est null
		const aliceRows = await db`SELECT id FROM auth.users WHERE email = 'alice@test.local' LIMIT 1`;
		const profileRows =
			await db`SELECT avatar_url FROM public.profiles WHERE id = ${aliceRows[0].id}`;
		expect(profileRows[0].avatar_url).toBeNull();
	});
});
