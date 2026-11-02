import { expect, test } from '@playwright/test';

for (const [path, lang, label] of [
	['/login', 'fr', 'Continuer avec Google'],
	['/signup', 'fr', 'Continuer avec Google'],
	['/en/login', 'en', 'Continue with Google'],
	['/en/signup', 'en', 'Continue with Google']
] as const) {
	test(`${path}: Google link reaches the unlocalized OAuth endpoint`, async ({ page }) => {
		await page.goto(path);
		const link = page.getByRole('link', { name: label });
		await expect(link).toHaveAttribute('href', `/auth/google?lang=${lang}`);
		await page.route((url) => url.pathname === '/auth/v1/authorize' || url.hostname === 'accounts.google.com', (route) => route.abort());
		const authorization = page.waitForRequest((request) => new URL(request.url()).pathname === '/auth/v1/authorize');
		await link.click().catch(() => {});
		const target = new URL((await authorization).url());
		expect(target.pathname).toBe('/auth/v1/authorize');
		expect(target.searchParams.get('provider')).toBe('google');
		expect(new URL(target.searchParams.get('redirect_to')!).pathname).toBe('/auth/callback');
	});
}

for (const [lang, login] of [['en', '/en/login'], ['fr', '/login']] as const) {
	test(`OAuth ${lang} callback returns to the same language without exposing provider errors`, async ({ request }) => {
		const init = await request.get(`/auth/google?lang=${lang}`, { maxRedirects: 0 });
		expect(init.status()).toBe(303);
		const callback = await request.get('/auth/callback?error=access_denied&error_description=private', { maxRedirects: 0 });
		expect(callback.status()).toBe(303);
		expect(callback.headers().location).toBe(`${login}?error=oauth_failed`);
		const missing = await request.get('/auth/callback', { maxRedirects: 0 });
		expect(missing.headers().location).toBe('/login?error=oauth_failed');
	});
}
