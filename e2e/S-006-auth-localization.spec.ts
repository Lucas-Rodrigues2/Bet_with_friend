import { expect, test } from '@playwright/test';

test('détection navigateur : non-français → la racine redirige vers /en', async ({ browser }) => {
	const ctx = await browser.newContext({ locale: 'en-US' });
	const page = await ctx.newPage();
	await page.goto('/');
	await expect(page).toHaveURL(/\/en$/);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Bets between friends');
	await ctx.close();
});

test('détection navigateur : français → la racine reste en français', async ({ browser }) => {
	const ctx = await browser.newContext({ locale: 'fr-FR' });
	const page = await ctx.newPage();
	await page.goto('/');
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('paris entre amis');
	await ctx.close();
});

test('détection navigateur : le choix explicite de langue est mémorisé', async ({ browser }) => {
	const ctx = await browser.newContext({ locale: 'en-US' });
	const page = await ctx.newPage();
	await page.goto('/en');
	await page.getByTestId('lang-switch').click(); // « Français »
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('paris entre amis');
	// Le choix reste mémorisé : la racine ne redirige plus vers l'anglais.
	await page.goto('/');
	await expect(page).toHaveURL('/');
	await ctx.close();
});

test('le lien de langue en pied de page change réellement de version', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('lang-switch')).toHaveAttribute('href', '/lang/en');
	await page.getByTestId('lang-switch').click();
	await expect(page).toHaveURL('/en');
	await expect(page.getByTestId('lang-switch')).toHaveAttribute('href', '/lang/fr');
	await page.getByTestId('lang-switch').click();
	await expect(page).toHaveURL('/');
});

test('English landing leads to localized login and signup while French auth stays French', async ({ page }) => {
	await page.goto('/en');
	await page.getByRole('link', { name: 'Create an account' }).first().click();
	await expect(page).toHaveURL(/\/en\/signup$/);
	await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
	await expect(page.getByLabel('Email address')).toBeVisible();
	await expect(page.getByLabel('Username')).toBeVisible();
	await expect(page.getByLabel('Password')).toBeVisible();
	await expect(page.getByRole('main').getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/en/login');

	await page.goto('/en/login');
	await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
	await expect(page.getByLabel('Email address')).toBeVisible();
	await expect(page.getByRole('main').getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/en/signup');

	await page.goto('/signup');
	await expect(page.getByRole('heading', { name: 'Créer un compte' })).toBeVisible();
	await expect(page.getByLabel('Adresse email')).toBeVisible();
	await expect(page.getByLabel('Pseudo')).toBeVisible();
	await expect(page.getByLabel('Mot de passe')).toBeVisible();
});
