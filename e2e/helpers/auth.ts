import { expect, type Page } from '@playwright/test';

const PASSWORD = process.env.TEST_USER_PASSWORD ?? 'test-password-123';

export const USERS = {
	alice: { email: process.env.TEST_ALICE_EMAIL ?? 'alice@test.local', password: PASSWORD },
	bob: { email: process.env.TEST_BOB_EMAIL ?? 'bob@test.local', password: PASSWORD },
	carol: { email: process.env.TEST_CAROL_EMAIL ?? 'carol@test.local', password: PASSWORD },
	dave: { email: process.env.TEST_DAVE_EMAIL ?? 'dave@test.local', password: PASSWORD }
} as const;

export type TestUser = keyof typeof USERS;

/**
 * Effectue la connexion email/password via l'UI de login.
 * Redirige automatiquement vers la page d'accueil connectée.
 */
export async function login(page: Page, user: TestUser) {
	const { email, password } = USERS[user];
	await page.goto('/login');
	const emailInput = page.getByLabel(/email/i);
	const passwordInput = page.getByLabel(/mot de passe|password/i);
	// La ré-hydratation Svelte peut réinitialiser les champs juste après le
	// remplissage : on ne soumet que lorsque les valeurs sont stables.
	await expect(async () => {
		await emailInput.fill(email);
		await expect(emailInput).toHaveValue(email);
	}).toPass();
	await expect(async () => {
		await passwordInput.fill(password);
		await expect(passwordInput).toHaveValue(password);
	}).toPass();
	await page.getByRole('button', { name: /se connecter|connexion|login/i }).click();
	// 'domcontentloaded' suffit pour constater la navigation ; attendre 'load'
	// rendait le helper sensible aux requêtes tierces lentes (analytics).
	await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
		waitUntil: 'domcontentloaded'
	});
}

/**
 * Sauvegarde l'état de session dans un fichier pour réutilisation.
 * À appeler dans global.setup.ts pour chaque user.
 */
export function storageStatePath(user: TestUser) {
	return `e2e/.auth/${user}.json`;
}
