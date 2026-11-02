import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
	test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } });
}

const group = '11111111-1111-1111-8111-111111111111';

test('les données JSON et la pagination incorrectes sont refusées proprement', async ({ page }) => {
	await login(page, 'alice');
	for (const body of [null, { id: 'bad-uuid' }, { all: 'yes' }, { all: true, extra: 'x' }]) {
		const response = await page.request.post('/api/notifications/mark-read', { data: body });
		expect(response.status()).toBe(400);
	}
	for (const offset of ['-1', 'nan', '3oops', '99999999999999999']) {
		const response = await page.request.get(`/api/groups/${group}/activity?offset=${offset}`);
		expect(response.status()).toBe(400);
	}
});

test('la connexion ne redirige pas vers une adresse extérieure', async ({ page }) => {
	await login(page, 'alice');
	for (const target of ['https://example.com', '//example.com', '/\\\\example.com', '/%5cexample.com']) {
		const result = await page.request.get(`/login?${new URLSearchParams({ redirectTo: target })}`, { maxRedirects: 0 });
		expect(result.status()).toBe(303);
		expect(result.headers().location).toBe('/');
	}
});

test('la redirection anglaise conserve une destination déjà localisée et ses paramètres', async ({ page }) => {
	await login(page, 'alice');
	const target = '/en/invite/test-token?first=1&second=hello?world';
	const response = await page.request.get(`/en/login?${new URLSearchParams({ redirectTo: target })}`, {
		maxRedirects: 0
	});
	expect(response.status()).toBe(303);
	expect(response.headers().location).toBe(target);
});

test('les soumissions invité répétées sont limitées même avec des données invalides', async ({ request }) => {
	const statuses: number[] = [];
	const variants = ['/guest', '/en/guest', '/%67uest', '/fr/guest'];
	for (let i = 0; i < 16; i++) {
		const path = variants[i % variants.length];
		const isEnhanced = i % 2 === 0;
		const response = await request.post(path, {
			headers: isEnhanced ? { 'x-sveltekit-action': 'true', accept: 'application/json' } : {},
			form: { pseudo: 'a' },
			maxRedirects: 0
		});
		const body = await response.text();
		if (response.status() === 429) {
			expect(Number(response.headers()['retry-after'])).toBeGreaterThan(0);
			expect(body).toContain(path.startsWith('/en/') ? 'Too many requests' : 'Trop de requêtes');
			if (isEnhanced) {
				const result = JSON.parse(body);
				expect(result.type).toBe('error');
				expect(result.status).toBe(429);
			}
		} else {
			expect(body).toContain('400');
		}
		statuses.push(response.status());
	}
	expect(statuses.slice(0, 5).every((status) => status !== 429)).toBe(true);
	expect(statuses).toContain(429);
});
