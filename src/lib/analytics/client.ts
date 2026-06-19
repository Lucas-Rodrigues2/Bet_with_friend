import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import posthog from 'posthog-js';

let initialized = false;

/**
 * Initialise PostHog côté navigateur uniquement.
 * No-op si la clé est absente (dev local sans config PostHog).
 */
export function initAnalytics(): void {
	if (!browser) return;
	if (initialized) return;

	const key = env.PUBLIC_POSTHOG_KEY;
	const host = env.PUBLIC_POSTHOG_HOST;

	if (!key) return; // désactivé si clé absente

	posthog.init(key, {
		api_host: host ?? 'https://eu.i.posthog.com',
		person_profiles: 'always',
		capture_pageview: false,
		capture_pageleave: false,
		// Flush rapide en dev/test pour que les events soient envoyés immédiatement
		// (minimum 250ms autorisé par posthog-js)
		request_queue_config: {
			flush_interval_ms: 250
		}
	});

	initialized = true;
}

/**
 * Identifie l'utilisateur connecté (même distinct_id que le serveur).
 */
export function identifyUser(userId: string): void {
	if (!browser || !initialized) return;
	posthog.identify(userId);
}

/**
 * Envoie un event PostHog côté client.
 */
export function track(event: string, properties?: Record<string, unknown>): void {
	if (!browser) return;
	// En test E2E (Playwright), notifier le spy si disponible pour assertion immédiate
	// sans dépendre du timing de flush réseau de posthog-js.
	// Appelé avant la garde `initialized` pour fonctionner même sans PostHog configuré.
	const spy = (window as unknown as Record<string, unknown>)['__playwright_trackSpy'] as
		| ((e: string, p: Record<string, unknown>) => void)
		| undefined;
	if (typeof spy === 'function') {
		spy(event, properties ?? {});
	}
	if (!initialized) return;
	posthog.capture(event, properties);
}

/**
 * Réinitialise l'identité (à la déconnexion).
 */
export function resetIdentity(): void {
	if (!browser || !initialized) return;
	posthog.reset();
}
