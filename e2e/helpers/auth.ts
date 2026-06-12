import { type Page } from '@playwright/test'

const PASSWORD = process.env.TEST_USER_PASSWORD ?? 'test-password-123'

export const USERS = {
	alice: { email: process.env.TEST_ALICE_EMAIL ?? 'alice@test.local', password: PASSWORD },
	bob: { email: process.env.TEST_BOB_EMAIL ?? 'bob@test.local', password: PASSWORD },
	carol: { email: process.env.TEST_CAROL_EMAIL ?? 'carol@test.local', password: PASSWORD },
	dave: { email: process.env.TEST_DAVE_EMAIL ?? 'dave@test.local', password: PASSWORD }
} as const

export type TestUser = keyof typeof USERS

/**
 * Effectue la connexion email/password via l'UI de login.
 * Redirige automatiquement vers la page d'accueil connectée.
 */
export async function login(page: Page, user: TestUser) {
	const { email, password } = USERS[user]
	await page.goto('/login')
	await page.getByLabel(/email/i).fill(email)
	await page.getByLabel(/mot de passe|password/i).fill(password)
	await page.getByRole('button', { name: /se connecter|connexion|login/i }).click()
	await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

/**
 * Sauvegarde l'état de session dans un fichier pour réutilisation.
 * À appeler dans global.setup.ts pour chaque user.
 */
export function storageStatePath(user: TestUser) {
	return `e2e/.auth/${user}.json`
}
