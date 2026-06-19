import type { Page } from '@playwright/test';
import type { Sql } from 'postgres';

/**
 * Helper PostHog pour les specs de tracking E2E.
 *
 * interceptPosthog : intercepte le trafic réseau PostHog côté navigateur
 * (posthog-js) et accumule les events capturés pour assertions.
 *
 * readServerEvents / clearServerEvents : lisent/vident analytics_events_test
 * (sink DB), écrite côté serveur quand ANALYTICS_TEST_SINK=db.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CapturedEvent {
	event: string;
	properties: Record<string, unknown>;
}

export interface ServerEvent {
	id: string;
	distinct_id: string;
	event: string;
	properties: Record<string, unknown>;
	created_at: Date;
}

export interface ReadServerEventsOptions {
	event?: string;
	distinctId?: string;
}

// ─── Client-side interception ─────────────────────────────────────────────────

/**
 * Intercepte les appels track() de notre analytics client via page.exposeFunction.
 * Notre fonction track() appelle window.__playwright_trackSpy(event, props) si
 * elle est disponible — ce qui permet de tester les events sans dépendre du
 * flush réseau de posthog-js.
 *
 * Intercepte aussi les routes posthog pour éviter les erreurs réseau.
 *
 * À appeler AVANT de déclencher l'action à tester.
 * Retourne getCapturedEvents() pour lire les events accumulés.
 */
/**
 * Intercepte les appels track() de notre analytics client via page.exposeFunction.
 * Notre fonction track() appelle window.__playwright_trackSpy(event, props) si
 * elle est disponible — ce qui permet de tester les events sans dépendre du
 * flush réseau de posthog-js.
 *
 * Intercepte aussi les routes posthog pour éviter les erreurs réseau.
 *
 * IMPORTANT : doit être appelé AVANT login() et goto(), car exposeFunction doit
 * être enregistrée avant toute navigation.
 *
 * Retourne getCapturedEvents() pour lire les events accumulés (synchrone).
 */
export function interceptPosthog(page: Page): {
	getCapturedEvents: () => CapturedEvent[];
	exposeSpyPromise: Promise<void>;
} {
	const captured: CapturedEvent[] = [];

	// Exposer un spy côté Playwright accessible depuis le navigateur
	const exposeSpyPromise = page.exposeFunction(
		'__playwright_trackSpy',
		(event: string, properties: Record<string, unknown>) => {
			captured.push({ event, properties: properties ?? {} });
		}
	);

	// Intercepter les routes posthog pour éviter les erreurs réseau
	const decideBody = JSON.stringify({
		config: { enable_collect_everything: false },
		toolbarParams: {},
		isAuthenticated: false,
		supportedCompression: ['gzip', 'lz64'],
		featureFlags: {},
		featureFlagPayloads: {},
		errorsWhileComputingFlags: false,
		capturePerformance: false
	});
	const flagsV2Body = JSON.stringify({
		flags: [],
		featureFlags: {},
		featureFlagPayloads: {},
		errorsWhileComputingFlags: false
	});
	page.route('**/decide/**', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: decideBody })
	);
	page.route('**/flags/**', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: flagsV2Body })
	);
	page.route('**/array/**', async (route) => {
		const url = route.request().url();
		if (url.endsWith('.js')) {
			await route.fulfill({
				status: 200,
				contentType: 'application/javascript',
				body: '/* posthog-assets noop */'
			});
		} else {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ editorParams: {}, toolbarParams: {} })
			});
		}
	});
	// Intercepter les envois d'events réseau (backup)
	for (const pattern of ['**/e/**', '**/i/v0/e/**', '**/batch/**', '**/capture/**']) {
		page.route(pattern, (route) => route.fulfill({ status: 200, body: '{}' }));
	}

	return {
		getCapturedEvents: () => [...captured],
		exposeSpyPromise
	};
}

// ─── Server-side sink DB ──────────────────────────────────────────────────────

/**
 * Lit les events du sink DB (analytics_events_test).
 * Filtre optionnel par event et/ou distinctId.
 */
export async function readServerEvents(
	db: Sql,
	{ event, distinctId }: ReadServerEventsOptions = {}
): Promise<ServerEvent[]> {
	if (event && distinctId) {
		return db<ServerEvent[]>`
      SELECT id, distinct_id, event, properties, created_at
      FROM public.analytics_events_test
      WHERE event = ${event} AND distinct_id = ${distinctId}
      ORDER BY created_at ASC
    `;
	} else if (event) {
		return db<ServerEvent[]>`
      SELECT id, distinct_id, event, properties, created_at
      FROM public.analytics_events_test
      WHERE event = ${event}
      ORDER BY created_at ASC
    `;
	} else if (distinctId) {
		return db<ServerEvent[]>`
      SELECT id, distinct_id, event, properties, created_at
      FROM public.analytics_events_test
      WHERE distinct_id = ${distinctId}
      ORDER BY created_at ASC
    `;
	} else {
		return db<ServerEvent[]>`
      SELECT id, distinct_id, event, properties, created_at
      FROM public.analytics_events_test
      ORDER BY created_at ASC
    `;
	}
}

/**
 * Vide la table analytics_events_test entre les tests.
 */
export async function clearServerEvents(db: Sql): Promise<void> {
	await db`DELETE FROM public.analytics_events_test`;
}
