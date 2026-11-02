import { expect, test } from '@playwright/test';

test('le lien de langue en pied de page change réellement de version', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('lang-switch')).toHaveAttribute('href', '/en');
	await page.getByTestId('lang-switch').click();
	await expect(page).toHaveURL('/en');
	await expect(page.getByTestId('lang-switch')).toHaveAttribute('href', '/');
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
