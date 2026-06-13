/**
 * Setup global Playwright — s'exécute UNE FOIS avant tous les tests.
 * Sauvegarde les sessions de chaque user de test dans e2e/.auth/*.json
 * pour que les specs puissent les réutiliser sans re-login.
 *
 * Dépend de : `supabase start` + `db:reset` déjà fait.
 */
import { test as setup, expect } from '@playwright/test';
import { login, storageStatePath, USERS, type TestUser } from './helpers/auth';
import fs from 'fs';

const users: TestUser[] = ['alice', 'bob', 'carol', 'dave'];

// S'assure que le répertoire .auth existe
setup.beforeAll(() => {
	fs.mkdirSync('e2e/.auth', { recursive: true });
});

for (const user of users) {
	setup(`authenticate ${user}`, async ({ page }) => {
		await login(page, user);
		// Vérifie qu'on est bien connecté (un élément du header connecté)
		await expect(page.locator('body')).toBeVisible();
		await page.context().storageState({ path: storageStatePath(user) });
	});
}
