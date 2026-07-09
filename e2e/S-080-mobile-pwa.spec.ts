/**
 * S-080 — App mobile PWA installable
 *
 * L'installation PWA réelle n'est pas automatisable dans la boucle QA
 * Playwright (pas d'émulateur). On valide ici :
 *   - Le manifest `/manifest.webmanifest` est servi (HTTP 200), JSON valide,
 *     avec les champs requis (name, display: standalone, theme_color,
 *     start_url, icônes 192/512).
 *   - Le service worker SvelteKit `/service-worker.js` est servi (HTTP 200,
 *     content-type JS).
 *   - Les icônes PWA sont servies (192, 512, apple-touch-icon).
 *   - Le bouton « Installer l'app sur mon téléphone » (testid `pwa-install`)
 *     est présent sur la page d'accueil après hydration.
 *   - Sans `beforeinstallprompt` (cas par défaut en Playwright), un clic ouvre
 *     le panneau d'instructions pas-à-pas (testid `pwa-install-instructions`).
 *   - Avec un `beforeinstallprompt` moqué (page.evaluate), un clic déclenche
 *     `prompt()` et l'event `appinstalled` passe l'app en mode installé
 *     (bouton masqué).
 *   - Si l'app est déjà installée (`display-mode: standalone` via matchMedia
 *     mocké), le bouton est masqué.
 *   - `npm run build` génère bien `build/client/manifest.webmanifest`,
 *     `build/client/service-worker.js`, `build/client/icons/`.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:5173';

// ─── Manifest & assets servis ──────────────────────────────────────────────────

test.describe('S-080 — Manifest & assets PWA servis', () => {
	test('manifest.webmanifest servi en 200 avec content-type manifest+json et JSON valide', async ({
		request
	}) => {
		const res = await request.get(`${BASE}/manifest.webmanifest`);
		expect(res.status()).toBe(200);
		const ct = res.headers()['content-type'] ?? '';
		// `application/manifest+json` (Vite) ou `application/json` selon config.
		expect(ct).toMatch(/manifest\+json|json/i);

		const manifest = await res.json();
		expect(manifest['name']).toBe('Bet With Friend');
		expect(manifest['short_name']).toBe('BetWF');
		expect(manifest['display']).toBe('standalone');
		expect(manifest['theme_color']).toMatch(/^#[0-9a-fA-F]{6}$/);
		expect(manifest['background_color']).toMatch(/^#[0-9a-fA-F]{6}$/);
		expect(manifest['start_url']).toMatch(/^\//);
		expect(manifest['scope']).toBe('/');

		const icons = manifest['icons'] as Array<{ src: string; sizes: string }>;
		expect(icons.length).toBeGreaterThanOrEqual(2);
		const sizes = icons.map((i) => i.sizes);
		expect(sizes).toContain('192x192');
		expect(sizes).toContain('512x512');
		// Au moins une icône maskable (Android) et une any.
		const purposes = icons.map((i) => (i as { purpose?: string }).purpose ?? '');
		expect(purposes.some((p) => p.includes('maskable'))).toBe(true);
		expect(purposes.some((p) => p.includes('any'))).toBe(true);
	});

	test('service-worker.js servi en 200 avec content-type javascript', async ({ request }) => {
		const res = await request.get(`${BASE}/service-worker.js`);
		expect(res.status()).toBe(200);
		const ct = res.headers()['content-type'] ?? '';
		expect(ct).toMatch(/javascript/i);
		const body = await res.text();
		expect(body.length).toBeGreaterThan(0);
		// En dev, SvelteKit sert le SW comme un re-export du module source
		// (`import '/@fs/.../src/service-worker.ts'`) ; en prod il est bundlé.
		// On vérifie donc le contenu directement depuis la source TypeScript,
		// qui doit contenir les handlers push / notificationclick (migrés de
		// static/sw.js — S-073) + le fetch handler (offline fallback).
		const srcRes = await request.get(`${BASE}/src/service-worker.ts`);
		expect(srcRes.status()).toBe(200);
		const src = await srcRes.text();
		expect(src).toMatch(/addEventListener\(['"]push['"]/);
		expect(src).toMatch(/addEventListener\(['"]notificationclick['"]/);
		expect(src).toMatch(/addEventListener\(['"]fetch['"]/);
		expect(src).toMatch(/offline\.html/);
	});

	test('icônes PWA servies (192, 512, apple-touch-icon)', async ({ request }) => {
		for (const path of [
			'/icons/icon-192.png',
			'/icons/icon-512.png',
			'/icons/apple-touch-icon.png'
		]) {
			const res = await request.get(`${BASE}${path}`);
			expect(res.status()).toBe(200);
			expect(res.headers()['content-type'] ?? '').toMatch(/image\/png/i);
		}
	});

	test('page offline.html servie (shell offline)', async ({ request }) => {
		const res = await request.get(`${BASE}/offline.html`);
		expect(res.status()).toBe(200);
	});
});

// ─── Bouton d'installation sur la page d'accueil ───────────────────────────────

test.describe("S-080 — Bouton Installer l'app", () => {
	test("bouton présent sur la page d'accueil après hydration", async ({ page }) => {
		await page.goto('/');
		// Attend l'hydration (le bloc est rendu seulement côté client).
		await expect(page.getByTestId('pwa-install')).toBeVisible({ timeout: 10_000 });
		await expect(page.getByTestId('pwa-install-button')).toBeVisible();
		await expect(page.getByTestId('pwa-install-button')).toContainText(/installer/i);
	});

	test("sans beforeinstallprompt : un clic ouvre le panneau d'instructions", async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('pwa-install-button')).toBeVisible({ timeout: 10_000 });

		// Le panneau d'instructions n'est pas affiché initialement.
		await expect(page.getByTestId('pwa-install-instructions')).toHaveCount(0);

		await page.getByTestId('pwa-install-button').click();

		// Le panneau d'instructions apparaît.
		await expect(page.getByTestId('pwa-install-instructions')).toBeVisible({ timeout: 5_000 });
		// Le contenu est en français (titre court explicite selon plateforme).
		const panel = page.getByTestId('pwa-install-instructions');
		// Playwright Chromium desktop = detectPlatform() retourne 'chrome'.
		// Le panneau générique OU spécifique Chrome contient « Installer ».
		await expect(panel).toContainText(/installer/i);
	});

	test("un second clic referme le panneau d'instructions (toggle)", async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('pwa-install-button')).toBeVisible({ timeout: 10_000 });
		await page.getByTestId('pwa-install-button').click();
		await expect(page.getByTestId('pwa-install-instructions')).toBeVisible({ timeout: 5_000 });
		await page.getByTestId('pwa-install-button').click();
		await expect(page.getByTestId('pwa-install-instructions')).toHaveCount(0);
	});

	test('beforeinstallprompt moqué : un clic déclenche prompt() puis masque le bouton après appinstalled', async ({
		page
	}) => {
		await page.goto('/');
		await expect(page.getByTestId('pwa-install-button')).toBeVisible({ timeout: 10_000 });

		// Moquer l'event beforeinstallprompt côté navigateur : on attache
		// prompt() et userChoice (Promise résolue 'accepted') à un Event.
		await page.evaluate(() => {
			const ev = new Event('beforeinstallprompt');
			(ev as unknown as { prompt: () => Promise<void> }).prompt = () =>
				Promise.resolve();
			(ev as unknown as { userChoice: Promise<{ outcome: string }> }).userChoice =
				Promise.resolve({ outcome: 'accepted' });
			window.promptCalls = 0;
			// Wrapper pour compter les appels prompt().
			const dispatched = ev;
			const origPrompt = (dispatched as unknown as { prompt: () => Promise<void> })
				.prompt;
			(dispatched as unknown as { prompt: () => Promise<void> }).prompt = () => {
				(window as unknown as { promptCalls: number }).promptCalls++;
				return origPrompt();
			};
			window.dispatchEvent(ev);
		});

		// Le composant a capturé l'event (preventDefault + stockage deferredPrompt).
		await page.getByTestId('pwa-install-button').click();

		// prompt() a bien été appelé.
		await expect
			.poll(
				async () =>
					await page.evaluate(
						() => (window as unknown as { promptCalls: number }).promptCalls
					),
				{ timeout: 5_000 }
			)
			.toBeGreaterThanOrEqual(1);

		// Suite au choix 'accepted', le composant passe installed=true → masque le
		// bouton. On déclenche l'event appinstalled pour confirmer la logique.
		await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
		await expect(page.getByTestId('pwa-install')).toHaveCount(0, { timeout: 5_000 });
	});

	test('beforeinstallprompt moqué avec choix dismissed : prompt() appelé puis bouton toujours visible', async ({
		page
	}) => {
		await page.goto('/');
		await expect(page.getByTestId('pwa-install-button')).toBeVisible({ timeout: 10_000 });

		await page.evaluate(() => {
			const ev = new Event('beforeinstallprompt');
			(ev as unknown as { prompt: () => Promise<void> }).prompt = () =>
				Promise.resolve();
			(ev as unknown as { userChoice: Promise<{ outcome: string }> }).userChoice =
				Promise.resolve({ outcome: 'dismissed' });
			(window as unknown as { __calls: number }).__calls = 0;
			const origPrompt = (ev as unknown as { prompt: () => Promise<void> }).prompt;
			(ev as unknown as { prompt: () => Promise<void> }).prompt = () => {
				(window as unknown as { __calls: number }).__calls++;
				return origPrompt();
			};
			window.dispatchEvent(ev);
		});

		await page.getByTestId('pwa-install-button').click();

		await expect
			.poll(
				async () =>
					await page.evaluate(() => (window as unknown as { __calls: number }).__calls),
				{ timeout: 5_000 }
			)
			.toBeGreaterThanOrEqual(1);

		// dismissed → installed reste false → bouton toujours visible, et le
		// deferredPrompt est remis à null → un second clic ouvre les instructions.
		await expect(page.getByTestId('pwa-install-button')).toBeVisible();
		await page.getByTestId('pwa-install-button').click();
		await expect(page.getByTestId('pwa-install-instructions')).toBeVisible({
			timeout: 5_000
		});
	});

	test("déjà installé (display-mode standalone mocké) : bouton masqué", async ({
		browser
	}) => {
		const ctx = await browser.newContext();
		await ctx.addInitScript(() => {
			// Moquer matchMedia pour signaler l'app déjà installée.
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
		const page = await ctx.newPage();
		await page.goto('/');
		// Hydration faite, mais le composant détecte installed=true → bloc masqué.
		await expect(page.getByTestId('pwa-install')).toHaveCount(0);
		await expect(page.getByTestId('pwa-install-button')).toHaveCount(0);
		await ctx.close();
	});
});

// ─── Build de production (vérification des artefacts PWA) ──────────────────────

test.describe('S-080 — Build de production', () => {
	// Le build complet prend ~3 min dans l'environnement de QA (rolldown + SW),
	// ce qui dépasse les timeouts raisonnables d'un test Playwright inline. On
	// lance donc le build via `npm run build` manuellement (hors test) et on
	// vérifie ici que les artefacts PWA attendus sont bien présents dans
	// `build/client/`. Variable SKIP_S080_BUILD_ARTIFACTS=1 pour sauter ce
	// contrôle si l'environnement n'a pas de build disponible.
	test('les artefacts PWA sont présents dans build/client/ (build lancé manuellement)', async () => {
		test.skip(
			!!process.env.SKIP_S080_BUILD_ARTIFACTS,
			'SKIP_S080_BUILD_ARTIFACTS positionné'
		);

		expect(fs.existsSync('build/client/manifest.webmanifest')).toBe(true);
		expect(fs.existsSync('build/client/service-worker.js')).toBe(true);
		expect(fs.existsSync('build/client/icons/icon-192.png')).toBe(true);
		expect(fs.existsSync('build/client/icons/icon-512.png')).toBe(true);
		expect(fs.existsSync('build/client/icons/apple-touch-icon.png')).toBe(true);

		// Le SW bundlé en prod contient bien les handlers (push, click, fetch).
		// Note : le bundler rolldown utilise des backticks pour les literals.
		const sw = fs.readFileSync('build/client/service-worker.js', 'utf8');
		expect(sw).toMatch(/addEventListener\([`'"]push[`'"]/);
		expect(sw).toMatch(/addEventListener\([`'"]notificationclick[`'"]/);
		expect(sw).toMatch(/addEventListener\([`'"]fetch[`'"]/);
		expect(sw).toMatch(/offline\.html/);

		// Le manifest copié en prod est identique à la source (validé plus haut).
		const manifest = JSON.parse(
			fs.readFileSync('build/client/manifest.webmanifest', 'utf8')
		);
		expect(manifest['display']).toBe('standalone');
	});
});
