import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:5198';

test('hydrated enhanced action follows the English logout redirect', async () => {
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		await page.goto(`${base}/en/login`, { waitUntil: 'networkidle' });
		// Reuse the real enhanced login form with the safe, unauthenticated logout
		// action, avoiding real credentials or mutations of test accounts.
		const form = page.locator('form').filter({ has: page.locator('input[name="email"]') });
		await form.evaluate((element) => element.setAttribute('action', '/en/logout'));
		await form.locator('input[name="email"]').fill('nobody@example.test');
		await form.locator('input[name="password"]').fill('test-password');
		const responsePromise = page.waitForResponse(
			(response) => response.url().endsWith('/en/logout') && response.request().method() === 'POST'
		);
		await form.locator('button[type="submit"]').click();
		const response = await responsePromise;
		assert.equal(response.request().headers()['x-sveltekit-action'], 'true');
		assert.equal((await response.json()).location, '/en');
		await page.waitForURL(`${base}/en`);
	} finally {
		await browser.close();
	}
});

test('hydrated navigation to protected page remains English', async () => {
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		await page.goto(`${base}/en/login`, { waitUntil: 'networkidle' });
		await page.evaluate(() => {
			const link = document.createElement('a');
			link.href = '/en/app';
			link.textContent = 'protected navigation';
			link.dataset.sveltekitPreloadData = 'off';
			document.body.append(link);
		});
		const responsePromise = page.waitForResponse((response) =>
			response.url().includes('/en/app/__data.json')
		);
		await page.getByText('protected navigation').click();
		const response = await responsePromise;
		assert.equal(response.status(), 200);
		await page.waitForURL(`${base}/en/login`);
	} finally {
		await browser.close();
	}
});
