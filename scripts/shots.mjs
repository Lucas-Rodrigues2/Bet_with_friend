import { chromium } from '@playwright/test';

const BASE = 'http://100.88.54.21:4173';
const EXE = '/home/lucas-hermes/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';

const shots = [
	{ url: '/', name: 'fr-landing-desktop', w: 1440, h: 1000 },
	{ url: '/en', name: 'en-landing-desktop', w: 1440, h: 1000 },
	{ url: '/', name: 'fr-landing-mobile', w: 390, h: 844 },
	{ url: '/login', name: 'fr-login-desktop', w: 1440, h: 1000 },
	{ url: '/en/login', name: 'en-login-desktop', w: 1440, h: 1000 },
	{ url: '/en', name: 'en-landing-mobile', w: 390, h: 844 },
	{ url: '/signup', name: 'fr-signup-desktop', w: 1440, h: 1000 },
	{ url: '/guest', name: 'fr-guest-desktop', w: 1440, h: 1000 },
	{ url: '/claim', name: 'fr-claim-desktop', w: 1440, h: 1000 },
	{ url: '/forgot-password', name: 'fr-forgot-desktop', w: 1440, h: 1000 },
	{ url: '/en/signup', name: 'en-signup-desktop', w: 1440, h: 1000 }
];

const browser = await chromium.launch({ executablePath: EXE, headless: true });
for (const s of shots) {
	const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
	await page.goto(BASE + s.url, { waitUntil: 'networkidle' });
	await page.screenshot({ path: `screenshots/${s.name}.png` });
	console.log('📸', s.name);
	await page.close();
}
await browser.close();
