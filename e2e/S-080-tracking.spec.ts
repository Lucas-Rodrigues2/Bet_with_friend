/**
 * S-080 — Tracking PostHog (PWA install)
 *
 * Events client instrumentés dans cette story (via `track()` de
 * `src/lib/analytics/client.ts`) :
 *   - pwa_install_prompted          { platform }
 *       (clic bouton quand beforeinstallprompt dispo, avant prompt())
 *   - pwa_install_accepted          { platform }
 *       (after deferredPrompt.userChoice outcome === 'accepted')
 *   - pwa_install_dismissed         { platform }
 *       (after deferredPrompt.userChoice outcome === 'dismissed')
 *   - pwa_install_instructions_viewed { platform }
 *       (clic bouton quand pas de beforeinstallprompt → bascule panneau)
 *
 * Ces events sont capturés côté client (posthog-js). En test, le spy
 * `window.__playwright_trackSpy` (helper `interceptPosthog`) intercepte les
 * appels `track()` sans dépendre du flush réseau de posthog-js.
 *
 * Vérifie :
 *   1. Chaque event est bien émis avec la property `platform` (string non
 *      vide) et AUCUNE PII (pas d'email, pas d'UUID, pas de token).
 *   2. Les 4 events sont distincts selon le flow déclenché.
 *
 * `beforeinstallprompt` n'est pas émis par Chromium headless : on le moque
 * via `page.evaluate` (dispatch d'un Event custom avec `prompt()`/`userChoice`).
 * La plateforme détectée en Chromium desktop = 'chrome' (UA contient "Chrome"
 * sans "Edg/").
 */
import { test, expect } from '@playwright/test';
import { interceptPosthog } from './helpers/analytics';

const PLATFORM = 'chrome'; // Playwright Desktop Chrome UA

/** Aucune PII ne doit figurer dans les properties de ces events. */
function assertNoPii(properties: Record<string, unknown>): void {
	const serialized = JSON.stringify(properties);
	expect(serialized).not.toMatch(/@/); // pas d'email
	expect(serialized).not.toMatch(
		/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
	); // pas d'UUID
	expect(serialized).not.toMatch(/test\.local/i);
	expect(serialized).not.toMatch(/alice|bob|carol|dave/i);
}

/** Dispatche un `beforeinstallprompt` moqué côté navigateur. */
async function dispatchBeforeInstallPrompt(
	page: import('@playwright/test').Page,
	outcome: 'accepted' | 'dismissed'
): Promise<void> {
	await page.evaluate((choice) => {
		const ev = new Event('beforeinstallprompt');
		(ev as unknown as { prompt: () => Promise<void> }).prompt = () =>
			Promise.resolve();
		(ev as unknown as { userChoice: Promise<{ outcome: string }> }).userChoice =
			Promise.resolve({ outcome: choice });
		// Marqueur pour compter les appels prompt() côté test si besoin.
		(window as unknown as { __pwaPromptCalls: number }).__pwaPromptCalls = 0;
		const origPrompt = (ev as unknown as { prompt: () => Promise<void> }).prompt;
		(ev as unknown as { prompt: () => Promise<void> }).prompt = () => {
			(window as unknown as { __pwaPromptCalls: number }).__pwaPromptCalls++;
			return origPrompt();
		};
		window.dispatchEvent(ev);
	}, outcome);
}

test.describe('S-080 — Tracking PostHog PWA install', () => {
	// ─── pwa_install_instructions_viewed (pas de beforeinstallprompt) ──────────

	test('pwa_install_instructions_viewed — capturé au clic bouton (sans beforeinstallprompt), properties {platform}, pas de PII', async ({
		page
	}) => {
		const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
		await exposeSpyPromise;

		await page.goto('/');
		await expect(page.getByTestId('pwa-install-button')).toBeVisible({ timeout: 10_000 });

		await page.getByTestId('pwa-install-button').click();
		await expect(page.getByTestId('pwa-install-instructions')).toBeVisible({ timeout: 5_000 });

		await page.waitForTimeout(150);

		const events = getCapturedEvents().filter(
			(e) => e.event === 'pwa_install_instructions_viewed'
		);
		expect(events.length).toBeGreaterThanOrEqual(1);
		const ev = events[events.length - 1];
		expect(ev.properties['platform']).toBe(PLATFORM);
		assertNoPii(ev.properties);
	});

	// ─── pwa_install_prompted + pwa_install_accepted ───────────────────────────

	test('pwa_install_prompted + pwa_install_accepted — capturés au clic avec beforeinstallprompt (outcome accepted), properties {platform}, pas de PII', async ({
		page
	}) => {
		const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
		await exposeSpyPromise;

		await page.goto('/');
		await expect(page.getByTestId('pwa-install-button')).toBeVisible({ timeout: 10_000 });

		await dispatchBeforeInstallPrompt(page, 'accepted');

		await page.getByTestId('pwa-install-button').click();
		// Laisser le temps aux Promises (prompt() + userChoice) de résoudre.
		await page.waitForTimeout(200);

		const events = getCapturedEvents();
		const prompted = events.filter((e) => e.event === 'pwa_install_prompted');
		const accepted = events.filter((e) => e.event === 'pwa_install_accepted');
		expect(prompted.length).toBeGreaterThanOrEqual(1);
		expect(accepted.length).toBeGreaterThanOrEqual(1);

		expect(prompted[prompted.length - 1].properties['platform']).toBe(PLATFORM);
		expect(accepted[accepted.length - 1].properties['platform']).toBe(PLATFORM);
		for (const e of [...prompted, ...accepted]) assertNoPii(e.properties);

		// Pas d'event dismissed ni instructions_viewed déclenchés par ce flow.
		const dismissed = events.filter((e) => e.event === 'pwa_install_dismissed');
		expect(dismissed.length).toBe(0);
		const instructions = events.filter((e) => e.event === 'pwa_install_instructions_viewed');
		expect(instructions.length).toBe(0);
	});

	// ─── pwa_install_prompted + pwa_install_dismissed ──────────────────────────

	test('pwa_install_dismissed — capturé au clic avec beforeinstallprompt (outcome dismissed), properties {platform}, pas de PII', async ({
		page
	}) => {
		const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
		await exposeSpyPromise;

		await page.goto('/');
		await expect(page.getByTestId('pwa-install-button')).toBeVisible({ timeout: 10_000 });

		await dispatchBeforeInstallPrompt(page, 'dismissed');

		await page.getByTestId('pwa-install-button').click();
		await page.waitForTimeout(200);

		const events = getCapturedEvents();
		const prompted = events.filter((e) => e.event === 'pwa_install_prompted');
		const dismissed = events.filter((e) => e.event === 'pwa_install_dismissed');
		expect(prompted.length).toBeGreaterThanOrEqual(1);
		expect(dismissed.length).toBeGreaterThanOrEqual(1);

		expect(dismissed[dismissed.length - 1].properties['platform']).toBe(PLATFORM);
		for (const e of [...prompted, ...dismissed]) assertNoPii(e.properties);

		// Pas d'event accepted dans ce flow.
		const accepted = events.filter((e) => e.event === 'pwa_install_accepted');
		expect(accepted.length).toBe(0);
	});

	// ─── Pas d'event quand déjà installé ────────────────────────────────────────

	test("aucun event PWA émis quand l'app est déjà installée (display-mode standalone)", async ({
		browser
	}) => {
		const ctx = await browser.newContext();
		const page = await ctx.newPage();
		await ctx.addInitScript(() => {
			const original = window.matchMedia.bind(window);
			window.matchMedia = ((query: string) => {
				if (query === '(display-mode: standalone)') {
					return {
						matches: true,
						media: query,
						onchange: null,
						addEventListener: () => {},
						removeEventListener: () => {},
						addListener: () => {},
						removeListener: () => {},
						dispatchEvent: () => false
					} as unknown as MediaQueryList;
				}
				return original(query);
			}) as typeof window.matchMedia;
		});

		const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
		await exposeSpyPromise;

		await page.goto('/');
		// Le bouton n'est pas rendu (composant masqué).
		await expect(page.getByTestId('pwa-install')).toHaveCount(0);
		await page.waitForTimeout(150);

		const pwaEvents = getCapturedEvents().filter((e) =>
			e.event.startsWith('pwa_install_')
		);
		expect(pwaEvents.length).toBe(0);
		await ctx.close();
	});
});
