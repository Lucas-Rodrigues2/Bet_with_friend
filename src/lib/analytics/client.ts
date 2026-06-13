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
		person_profiles: 'identified_only',
		capture_pageview: false,
		capture_pageleave: false
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
	if (!browser || !initialized) return;
	posthog.capture(event, properties);
}

/**
 * Réinitialise l'identité (à la déconnexion).
 */
export function resetIdentity(): void {
	if (!browser || !initialized) return;
	posthog.reset();
}
