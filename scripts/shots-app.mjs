import { chromium } from '@playwright/test';

const BASE = 'http://100.88.54.21:4173';
const EXE = '/home/lucas-hermes/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

// Connexion en tant qu'Alice
await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', 'alice@test.local');
await page.fill('input[name="password"]', 'test-password-123');
await page.click('button[type="submit"]');
await page.waitForURL('**/app**', { timeout: 15000 }).catch(() => {});
await page.waitForLoadState('networkidle');
console.log('→ URL après connexion :', page.url());
await page.screenshot({ path: 'screenshots/app-dashboard.png' });

// Page du groupe
await page.goto(BASE + '/app/groups/11111111-1111-1111-8111-111111111111', {
	waitUntil: 'networkidle'
});
console.log('→ URL groupe :', page.url());
await page.screenshot({ path: 'screenshots/app-groupe.png' });

// Classement
await page.goto(BASE + '/app/groups/11111111-1111-1111-8111-111111111111/leaderboard', {
	waitUntil: 'networkidle'
});
await page.screenshot({ path: 'screenshots/app-classement.png' });

// Ardoise
await page.goto(BASE + '/app/groups/11111111-1111-1111-8111-111111111111/ledger', {
	waitUntil: 'networkidle'
});
await page.screenshot({ path: 'screenshots/app-ardoise.png' });

// Paris du groupe
await page.goto(BASE + '/app/groups/11111111-1111-1111-8111-111111111111/bets', {
	waitUntil: 'networkidle'
});
await page.screenshot({ path: 'screenshots/app-paris.png' });

await browser.close();
console.log('✅ captures terminées');
