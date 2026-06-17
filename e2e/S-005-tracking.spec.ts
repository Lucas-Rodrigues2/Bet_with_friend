/**
 * S-005 — Tracking PostHog (profil : pseudo & avatar)
 *
 * Events instrumentés dans cette story :
 *   - profile_pseudo_updated   (serveur, action updatePseudo, après commit DB)
 *   - profile_avatar_uploaded  (serveur, action uploadAvatar, après upload Storage + commit DB)
 *   - profile_avatar_deleted   (serveur, action deleteAvatar, après suppression + commit DB)
 *
 * Approche :
 *   - Events serveur uniquement : vérifiés via le sink DB analytics_events_test
 *     (ANALYTICS_TEST_SINK=db positionné dans .env.test).
 *   - distinct_id = user.id Supabase d'alice.
 *   - Aucun event client (track()) n'est ajouté dans cette story.
 */
import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { readServerEvents, clearServerEvents } from './helpers/analytics';
import path from 'node:path';

const AVATAR_FIXTURE = path.resolve('e2e/fixtures/avatar.png');

async function goToProfile(page: Page) {
	await login(page, 'alice');
	await page.goto('/app/profile');
	await expect(page).toHaveURL('/app/profile');
}

/** Récupère le user.id de alice directement en DB. */
async function getAliceId(): Promise<string> {
	const rows = await db`SELECT id FROM auth.users WHERE email = 'alice@test.local' LIMIT 1`;
	if (!rows[0]) throw new Error('alice@test.local not found in DB');
	return String(rows[0].id);
}

test.describe('S-005 — Tracking PostHog profil', () => {
	test.beforeEach(async () => {
		await clearServerEvents(db);
	});

	test.afterAll(async () => {
		await clearServerEvents(db);
		// Remettre alice dans son état seedé après les tests de tracking
		try {
			const rows = await db`SELECT id FROM auth.users WHERE email = 'alice@test.local' LIMIT 1`;
			if (rows.length > 0) {
				await db`UPDATE public.profiles SET pseudo = 'Alice', avatar_url = NULL WHERE id = ${rows[0].id}`;
			}
		} catch {
			// Ignore cleanup errors
		}
	});

	// ─── profile_pseudo_updated ───────────────────────────────────────────────

	test('profile_pseudo_updated — event serveur émis après mise à jour du pseudo', async ({
		page
	}) => {
		await goToProfile(page);
		const aliceId = await getAliceId();

		const newPseudo = '[E2E] TRK-Pseudo';
		await page.getByTestId('pseudo-input').fill(newPseudo);
		await page.getByTestId('save-pseudo-btn').click();

		// Attendre que la mise à jour soit prise en compte côté serveur
		await expect(page.getByTestId('header-pseudo')).toHaveText(newPseudo, { timeout: 5000 });

		// Vérifier le sink DB
		const events = await readServerEvents(db, { event: 'profile_pseudo_updated' });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1];
		expect(ev.event).toBe('profile_pseudo_updated');
		// distinct_id correspond au user.id de alice
		expect(ev.distinct_id).toBe(aliceId);
		// Aucune PII dans les propriétés (pas de pseudo)
		const props = ev.properties as Record<string, unknown>;
		expect(props['pseudo']).toBeUndefined();
	});

	test('profile_pseudo_updated — aucun event si validation Zod échoue (pseudo trop court)', async ({
		page
	}) => {
		await goToProfile(page);

		// Bypasser la validation HTML5 pour envoyer 1 seul char
		await page.getByTestId('pseudo-input').evaluate((el: HTMLInputElement) => {
			el.removeAttribute('minlength');
			el.removeAttribute('required');
		});
		await page.getByTestId('pseudo-input').fill('X');
		await page.getByTestId('save-pseudo-btn').click();

		// Reste sur /app/profile (SvelteKit named action peut exposer ?/updatePseudo)
		await expect(page).toHaveURL(/\/app\/profile/);
		await expect(page.getByTestId('pseudo-error')).toBeVisible({ timeout: 5000 });

		// Aucun event ne doit avoir été émis
		const events = await readServerEvents(db, { event: 'profile_pseudo_updated' });
		expect(events.length).toBe(0);
	});

	// ─── profile_avatar_uploaded ──────────────────────────────────────────────

	test('profile_avatar_uploaded — event serveur émis après upload avatar réussi', async ({
		page
	}) => {
		await goToProfile(page);
		const aliceId = await getAliceId();

		const fileInput = page.getByTestId('avatar-input');
		await fileInput.setInputFiles(AVATAR_FIXTURE);
		await page.getByRole('button', { name: "Changer l'avatar" }).click();

		// Attendre que l'img affiche l'URL Storage (pas juste le blob de prévisualisation locale)
		await expect(page.getByTestId('avatar-img')).toHaveAttribute(
			'src',
			/\/storage\/v1\/object\/public\/avatars\//,
			{ timeout: 15000 }
		);

		// Vérifier le sink DB
		const events = await readServerEvents(db, { event: 'profile_avatar_uploaded' });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1];
		expect(ev.event).toBe('profile_avatar_uploaded');
		expect(ev.distinct_id).toBe(aliceId);
	});

	// ─── profile_avatar_deleted ───────────────────────────────────────────────

	test("profile_avatar_deleted — event serveur émis après suppression de l'avatar", async ({
		page
	}) => {
		await goToProfile(page);
		const aliceId = await getAliceId();

		// S'assurer qu'il y a un avatar à supprimer
		const hasAvatar = (await page.getByTestId('delete-avatar-btn').count()) > 0;
		if (!hasAvatar) {
			const fileInput = page.getByTestId('avatar-input');
			await fileInput.setInputFiles(AVATAR_FIXTURE);
			await page.getByRole('button', { name: "Changer l'avatar" }).click();
			await expect(page.getByTestId('delete-avatar-btn')).toBeVisible({ timeout: 15000 });
		}

		// Vider le sink avant l'action de suppression pour isolation
		await clearServerEvents(db);

		// Supprimer l'avatar
		await page.getByTestId('delete-avatar-btn').click();

		// Attendre que le bouton disparaisse (suppression terminée)
		await expect(page.getByTestId('delete-avatar-btn')).not.toBeVisible({ timeout: 10000 });

		// Vérifier le sink DB
		const events = await readServerEvents(db, { event: 'profile_avatar_deleted' });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1];
		expect(ev.event).toBe('profile_avatar_deleted');
		expect(ev.distinct_id).toBe(aliceId);
	});

	// ─── distinct_id UUID valide ──────────────────────────────────────────────

	test('distinct_id est bien le UUID Supabase de alice', async ({ page }) => {
		await goToProfile(page);
		const aliceId = await getAliceId();

		const newPseudo = '[E2E] TRK-UUID';
		await page.getByTestId('pseudo-input').fill(newPseudo);
		await page.getByTestId('save-pseudo-btn').click();
		await expect(page.getByTestId('header-pseudo')).toHaveText(newPseudo, { timeout: 5000 });

		const events = await readServerEvents(db, {
			event: 'profile_pseudo_updated',
			distinctId: aliceId
		});
		expect(events.length).toBeGreaterThanOrEqual(1);
		// Format UUID v4
		expect(events[0].distinct_id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		);
		expect(events[0].distinct_id).toBe(aliceId);
	});
});
