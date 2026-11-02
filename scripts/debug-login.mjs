import { chromium } from '@playwright/test';

const BASE = 'http://100.88.54.21:4173';
const EXE = '/home/lucas-hermes/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

page.on('console', (m) => {
	if (m.type() === 'error') console.log('⚠ console:', m.text().slice(0, 160));
});

await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', 'alice@test.local');
await page.fill('input[name="password"]', 'test-password-123');

// Capture des en-têtes Set-Cookie de la réponse POST
page.on('response', async (r) => {
	if (r.request().method() === 'POST') {
		const h = await r.allHeaders();
		console.log(
			'POST',
			r.status(),
			'| set-cookie:',
			h['set-cookie'] ? h['set-cookie'].slice(0, 200) : '(aucun)'
		);
	}
});

await page.click('button[type="submit"]');
await page.waitForTimeout(3000);

const cookies = await ctx.cookies();
console.log('cookies stockés :', cookies.length);
for (const c of cookies)
	console.log(' -', c.name, '| secure:', c.secure, '| sameSite:', c.sameSite, '| path:', c.path);
console.log('URL finale :', page.url());
await browser.close();
