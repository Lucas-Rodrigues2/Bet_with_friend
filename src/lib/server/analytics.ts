import { PostHog } from 'posthog-node';
import { env } from '$env/dynamic/private';
import { PUBLIC_POSTHOG_KEY, PUBLIC_POSTHOG_HOST } from '$env/static/public';
import { db } from '$lib/server/db/index';
import { analyticsEventsTest } from '$lib/server/db/schema';

const isDev = process.env.NODE_ENV !== 'production';

function createClient(): PostHog | null {
	const key = env.POSTHOG_KEY ?? PUBLIC_POSTHOG_KEY;
	const host = env.POSTHOG_HOST ?? PUBLIC_POSTHOG_HOST;

	if (!key) return null;

	return new PostHog(key, {
		host: host ?? 'https://eu.i.posthog.com',
		// En non-prod, flush immédiat pour que les events arrivent en test
		flushAt: isDev ? 1 : 20,
		flushInterval: isDev ? 0 : 10000
	});
}

// Singleton
let _client: PostHog | null | undefined = undefined;

function getClient(): PostHog | null {
	if (_client === undefined) {
		_client = createClient();
	}
	return _client;
}

interface CaptureOptions {
	distinctId: string;
	event: string;
	properties?: Record<string, unknown>;
}

/**
 * Envoie un event PostHog côté serveur.
 * Toujours appelé après le commit de la transaction Drizzle.
 *
 * En mode test (ANALYTICS_TEST_SINK=db), insère aussi l'event dans
 * analytics_events_test pour que les specs E2E puissent vérifier l'envoi.
 */
export async function captureServer({
	distinctId,
	event,
	properties
}: CaptureOptions): Promise<void> {
	const client = getClient();

	if (client) {
		client.capture({ distinctId, event, properties: properties ?? {} });
		// flush immédiat en non-prod pour les tests
		if (isDev) {
			await client.flush();
		}
	}

	// Sink DB pour les tests E2E
	if (env.ANALYTICS_TEST_SINK === 'db') {
		try {
			await db.insert(analyticsEventsTest).values({
				distinctId,
				event,
				properties: properties ?? {}
			});
		} catch (err) {
			// Ne jamais faire rater une action métier pour de l'analytics
			console.warn('[analytics] Failed to write to test sink:', err);
		}
	}
}
