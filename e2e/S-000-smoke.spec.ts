/**
 * S-000 — Smoke test (infrastructure)
 * Vérifie que l'app tourne, que la page d'accueil répond, et que la DB locale
 * est accessible avec les users seedés. Pas de feature testing — seulement
 * la santé de l'environnement.
 */
import { test, expect } from '@playwright/test'
import { db } from './helpers/db'

test.describe('smoke test — environnement', () => {
	test("page accueil répond 200 et affiche le nom de l'app", async ({ page }) => {
		const response = await page.goto('/')
		expect(response?.status()).toBe(200)
		// L'app doit au moins charger quelque chose (titre ou body non vide)
		await expect(page.locator('body')).toBeVisible()
	})

	test('base de données locale accessible et users seedés présents', async () => {
		const rows = await db`
      SELECT email FROM auth.users
      WHERE email IN ('alice@test.local', 'bob@test.local', 'carol@test.local', 'dave@test.local')
      ORDER BY email
    `
		expect(rows).toHaveLength(4)
		expect(rows.map((r) => r.email)).toEqual([
			'alice@test.local',
			'bob@test.local',
			'carol@test.local',
			'dave@test.local'
		])
	})

	test('profils seedés dans public.profiles', async () => {
		const rows = await db`
      SELECT pseudo FROM public.profiles
      WHERE id IN (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'dddddddd-dddd-dddd-dddd-dddddddddddd'
      )
      ORDER BY pseudo
    `
		expect(rows.map((r) => r.pseudo)).toEqual(['Alice', 'Bob', 'Carol', 'Dave'])
	})

	test('groupe seedé "Les potes du test" existe', async () => {
		const rows = await db`
      SELECT name, currency FROM public.groups
      WHERE id = '11111111-1111-1111-1111-111111111111'
    `
		expect(rows).toHaveLength(1)
		expect(rows[0].name).toBe('Les potes du test')
		expect(rows[0].currency).toBe('EUR')
	})
})
