/**
 * S-001 — Layout, shadcn-svelte, page d'accueil
 *
 * Criteres d'acceptation :
 * 1. Page d'accueil : nom de l'app, accroche, boutons "Se connecter" / "Creer un compte"
 * 2. Header present sur toutes les pages avec logo cliquable vers /
 * 3. Navigation : boutons menent vers /login et /signup
 */
import { test, expect } from '@playwright/test';

test.describe('S-001 — Layout et page accueil', () => {
	test('/ repond 200 et affiche le nom de app', async ({ page }) => {
		const response = await page.goto('/');
		expect(response?.status()).toBe(200);
		await expect(page.getByRole('heading', { name: 'Bet With Friend' })).toBeVisible();
	});

	test('page accueil affiche accroche et deux boutons action', async ({ page }) => {
		await page.goto('/');

		// Accroche presente
		await expect(page.getByText(/paris entre amis/i)).toBeVisible();

		// Boutons presents
		await expect(page.getByRole('link', { name: 'Se connecter' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Créer un compte' })).toBeVisible();
	});

	test('bouton Se connecter navigue vers /login', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('link', { name: 'Se connecter' }).click();
		await expect(page).toHaveURL(/\/login/);
	});

	test('bouton Creer un compte navigue vers /signup', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('link', { name: 'Créer un compte' }).click();
		await expect(page).toHaveURL(/\/signup/);
	});

	test('header present sur page accueil', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('banner')).toBeVisible();
		// Logo / nom de app dans le header
		await expect(page.getByRole('banner').getByText('Bet With Friend')).toBeVisible();
	});

	test('header present sur /login', async ({ page }) => {
		await page.goto('/login');
		await expect(page.getByRole('banner')).toBeVisible();
		await expect(page.getByRole('banner').getByText('Bet With Friend')).toBeVisible();
	});

	test('header present sur /signup', async ({ page }) => {
		await page.goto('/signup');
		await expect(page.getByRole('banner')).toBeVisible();
		await expect(page.getByRole('banner').getByText('Bet With Friend')).toBeVisible();
	});

	test('logo dans header ramene a /', async ({ page }) => {
		// Naviguer vers /login puis cliquer sur le logo
		await page.goto('/login');
		await page.getByRole('banner').getByRole('link', { name: 'Bet With Friend' }).click();
		await expect(page).toHaveURL('/');
	});

	test('/login repond 200', async ({ page }) => {
		const response = await page.goto('/login');
		expect(response?.status()).toBe(200);
	});

	test('/signup repond 200', async ({ page }) => {
		const response = await page.goto('/signup');
		expect(response?.status()).toBe(200);
	});
});
