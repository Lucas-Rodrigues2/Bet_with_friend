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
 * Intercepte le trafic PostHog (posthog-js) émis par le navigateur.
 * À appeler AVANT de déclencher l'action à tester.
 *
 * Retourne getCapturedEvents() pour lire les events accumulés.
 */
export function interceptPosthog(page: Page): { getCapturedEvents: () => CapturedEvent[] } {
	const captured: CapturedEvent[] = [];

	// Chemins PostHog à intercepter
	const capturePatterns = ['**/e/**', '**/i/v0/e/**', '**/batch/**', '**/capture/**'];
	const silentPatterns = ['**/decide/**', '**/flags/**', '**/array/**'];

	// Routes silencieuses : répondre 200 vide
	for (const pattern of silentPatterns) {
		page.route(pattern, (route) => route.fulfill({ status: 200, body: '{}' }));
	}

	// Routes de capture : décoder le payload et accumuler les events
	for (const pattern of capturePatterns) {
		page.route(pattern, async (route) => {
			try {
				const request = route.request();
				const postData = request.postData();

				if (postData) {
					// posthog-js envoie soit du JSON soit du base64
					let parsed: unknown;
					try {
						parsed = JSON.parse(postData);
					} catch {
						// Essai base64
						try {
							const decoded = Buffer.from(postData, 'base64').toString('utf-8');
							parsed = JSON.parse(decoded);
						} catch {
							// payload non décodable, on ignore
						}
					}

					if (parsed && typeof parsed === 'object') {
						// Format batch : { batch: [...] }
						const batchPayload = parsed as Record<string, unknown>;
						const batch = batchPayload['batch'] ?? batchPayload['data'];
						if (Array.isArray(batch)) {
							for (const item of batch) {
								if (item && typeof item === 'object') {
									const ev = item as Record<string, unknown>;
									captured.push({
										event: String(ev['event'] ?? ev['e'] ?? ''),
										properties: (ev['properties'] as Record<string, unknown>) ?? {}
									});
								}
							}
						} else {
							// Format single event
							const ev = batchPayload;
							if (ev['event'] || ev['e']) {
								captured.push({
									event: String(ev['event'] ?? ev['e'] ?? ''),
									properties: (ev['properties'] as Record<string, unknown>) ?? {}
								});
							}
						}
					}
				}
			} catch {
				// Ne jamais faire rater le test pour un problème de décodage
			}

			await route.fulfill({ status: 200, body: '{}' });
		});
	}

	return {
		getCapturedEvents: () => [...captured]
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
