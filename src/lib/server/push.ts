import webpush, { type PushSubscription as WpSubscription } from 'web-push';
import { env } from '$env/dynamic/private';
// ⚠️ La clé publique VAPID est préfixée `PUBLIC_` car elle est aussi lue côté
// client (lib/push.ts) pour l'abonnement. En SvelteKit, `$env/dynamic/private`
// EXCLUT les variables préfixées `PUBLIC_` — il faut donc l'importer depuis
// `$env/static/public` côté serveur aussi, sinon `env.PUBLIC_VAPID_PUBLIC_KEY`
// est `undefined` et `isPushConfigured()` retourne `false` (aucun push envoyé).
import { PUBLIC_VAPID_PUBLIC_KEY } from '$env/static/public';
import { db } from '$lib/server/db/index';
import { pushSubscriptions } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { captureServer } from '$lib/server/analytics';
import { defaultEnabled, getExplicitPushPrefs } from '$lib/server/notifications';
import type { NotificationType } from '$lib/notifications';

// ─── Web Push abstraction ─────────────────────────────────────────────────────
//
// Envoi best-effort via la lib `web-push` (protocole Web Push / VAPID).
// Les clés VAPID proviennent des variables d'environnement :
//   - `PUBLIC_VAPID_PUBLIC_KEY` (lue côté client aussi pour l'abonnement)
//   - `VAPID_PRIVATE_KEY` (serveur only)
//   - `VAPID_SUBJECT` (mailto: ou https: de contact, requis par la spec)
//
// `sendPush()` ne lève jamais : elle renvoie un code stable (`send_failed`,
// `endpoint_gone`, `unknown`) destiné au tracking PostHog. L'appelant décide
// du cleanup (endpoint mort → suppression de la ligne `push_subscriptions`).
//
// Détaché de la transaction métier (setImmediate) — même pattern que l'email.
// Un échec d'un envoi n'empêche pas les autres (un user peut avoir plusieurs
// abonnements = plusieurs navigateurs).

export type PushErrorCode = 'endpoint_gone' | 'send_failed' | 'unknown';

export interface SendPushInput {
	subscription: {
		endpoint: string;
		keys: {
			p256dh: string;
			auth: string;
		};
	};
	payload: unknown; // JSON-sérialisable, envoyé au service worker via `push` event
}

export interface SendPushResult {
	code: 'ok' | PushErrorCode;
	statusCode?: number;
}

let _configured = false;

function configureVapid(): void {
	if (_configured) return;
	const publicKey = PUBLIC_VAPID_PUBLIC_KEY;
	const privateKey = env.VAPID_PRIVATE_KEY;
	const subject = env.VAPID_SUBJECT ?? 'mailto:dev@betwithfriend.app';

	if (!publicKey || !privateKey) {
		// Sans clés VAPID, l'envoi échouera ; on log une fois pour le debug.
		console.warn(
			'[push] VAPID keys missing — push disabled. Set PUBLIC_VAPID_PUBLIC_KEY & VAPID_PRIVATE_KEY.'
		);
		_configured = true;
		return;
	}

	webpush.setVapidDetails(subject, publicKey, privateKey);
	_configured = true;
}

/** true si les clés VAPID sont configurées (envoi possible). */
export function isPushConfigured(): boolean {
	return !!(PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

/**
 * Valeur par défaut de la préférence push pour un type (sans ligne explicite).
 * Délègue à `defaultEnabled` du module notifications : les canaux email/push
 * ne sont activés par défaut que pour les événements « importants ».
 */
function defaultPushEnabled(type: NotificationType): boolean {
	return defaultEnabled(type, 'push');
}

/**
 * Envoie une notification push à un abonnement donné. Best-effort, jamais throw.
 *
 * - Endpoint mort (410/404 du push service) → code `endpoint_gone` : l'appelant
 *   doit supprimer la ligne `push_subscriptions` correspondante.
 * - Autre échec réseau/HTTP → code `send_failed`.
 * - Erreur inattendue → code `unknown`.
 *
 * Le code renvoyé est destiné au tracking PostHog (pas de message brut, qui
 * pourrait contenir des PII côté provider).
 */
export async function sendPush(input: SendPushInput): Promise<SendPushResult> {
	if (!isPushConfigured()) {
		return { code: 'send_failed' };
	}
	configureVapid();

	const subscription: WpSubscription = {
		endpoint: input.subscription.endpoint,
		keys: input.subscription.keys
	};

	const payloadStr = JSON.stringify(input.payload);

	try {
		await webpush.sendNotification(subscription, payloadStr, {
			// Délais courts en dev/test : un push service qui ne répond pas
			// ne doit pas bloquer l'envoi des autres abonnements.
			TTL: 60 * 60 * 24 // 24h
		});
		return { code: 'ok' };
	} catch (err) {
		const statusCode =
			typeof err === 'object' && err !== null && 'statusCode' in err
				? (err as { statusCode: number }).statusCode
				: undefined;

		// 404 (endpoint plus enregistré) / 410 (Gone) → abonnement mort.
		if (statusCode === 404 || statusCode === 410) {
			return { code: 'endpoint_gone', statusCode };
		}
		return { code: 'send_failed', statusCode };
	}
}

/**
 * Supprime un abonnement push par endpoint. Best-effort, jamais throw.
 * Appelé quand le push service renvoie 404/410 (endpoint mort) ou à la
 * demande explicite de l'utilisateur (désabonnement « cet appareil »).
 */
export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
	try {
		await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
	} catch (err) {
		console.warn('[push] Failed to delete subscription for endpoint:', err);
	}
}

/**
 * Récupère tous les abonnements push d'un ensemble d'utilisateurs en UNE
 * requête batch. Renvoie une map userId -> subscriptions[].
 */
export async function getPushSubscriptionsForUsers(
	userIds: string[]
): Promise<Map<string, { endpoint: string; keys: { p256dh: string; auth: string } }[]>> {
	const map = new Map<string, { endpoint: string; keys: { p256dh: string; auth: string } }[]>();
	if (userIds.length === 0) return map;
	try {
		const rows = await db
			.select({
				userId: pushSubscriptions.userId,
				endpoint: pushSubscriptions.endpoint,
				keys: pushSubscriptions.keys
			})
			.from(pushSubscriptions)
			.where(inArray(pushSubscriptions.userId, userIds));
		for (const row of rows) {
			const keys = (row.keys ?? {}) as { p256dh?: string; auth?: string };
			if (!keys.p256dh || !keys.auth) continue; // abonnement incomplet, ignoré
			const list = map.get(row.userId) ?? [];
			list.push({ endpoint: row.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } });
			map.set(row.userId, list);
		}
		return map;
	} catch (err) {
		console.warn('[push] Failed to fetch push subscriptions:', err);
		return map;
	}
}

/**
 * Envoie un push à tous les abonnements des destinataires dont la préférence
 * `push` du type est activée. Best-effort, détaché, jamais throw — appelé en
 * arrière-plan par notify().
 *
 * Filtre les destinataires par préférence push (défaut = événements
 * « importants ») AVANT de fetcher les abonnements, en une requête batch.
 * Envoie 1 push par abonnement (un user peut avoir plusieurs navigateurs).
 *
 * Émet un event PostHog `notification_push_sent` (ou `notification_push_failed`)
 * par envoi, sans PII dans les propriétés (notification_type + error_code).
 *
 * Endpoint mort (404/410) → suppression de la ligne `push_subscriptions`.
 */
export async function sendPushNotifications(
	userIds: string[],
	type: NotificationType,
	payload: { title: string; body: string; url?: string | null }
): Promise<void> {
	if (userIds.length === 0) return;

	// ── Filtrage par préférence push du type ────────────────────────────────
	// Une seule requête batch ; on retombe sur le défaut (importants) en cas
	// d'erreur de lecture des prefs, pour ne pas bloquer l'envoi.
	let pushRecipients = userIds;
	try {
		const explicit = await getExplicitPushPrefs(userIds, type);
		pushRecipients = userIds.filter((uid) => explicit.get(uid) ?? defaultPushEnabled(type));
	} catch (err) {
		console.warn('[notifications] Failed to read push prefs, falling back to defaults:', err);
	}
	if (pushRecipients.length === 0) return;

	const subs = await getPushSubscriptionsForUsers(pushRecipients);
	if (subs.size === 0) return;

	// Un envoi par abonnement (un user peut avoir plusieurs navigateurs).
	// Séquentiel et simple (volumes faibles) ; tracking par envoi.
	for (const [userId, list] of subs) {
		for (const sub of list) {
			try {
				const result = await sendPush({
					subscription: sub,
					payload: {
						title: payload.title,
						body: payload.body,
						url: payload.url ?? null,
						notification_type: type
					}
				});
				if (result.code === 'ok') {
					try {
						await captureServer({
							distinctId: userId,
							event: 'notification_push_sent',
							properties: { notification_type: type }
						});
					} catch (err) {
						console.warn('[notifications] Failed to track notification_push_sent:', err);
					}
				} else if (result.code === 'endpoint_gone') {
					// Endpoint mort → on supprime la ligne et on tracke l'échec.
					await deletePushSubscriptionByEndpoint(sub.endpoint);
					try {
						await captureServer({
							distinctId: userId,
							event: 'notification_push_failed',
							properties: { notification_type: type, error_code: 'endpoint_gone' }
						});
					} catch (err) {
						console.warn('[notifications] Failed to track notification_push_failed:', err);
					}
				} else {
					try {
						await captureServer({
							distinctId: userId,
							event: 'notification_push_failed',
							properties: { notification_type: type, error_code: result.code }
						});
					} catch (err) {
						console.warn('[notifications] Failed to track notification_push_failed:', err);
					}
				}
			} catch (err) {
				// Ne jamais casser la boucle pour un envoi — les autres continuent.
				console.warn(`[notifications] Push send threw for user ${userId}:`, err);
				try {
					await captureServer({
						distinctId: userId,
						event: 'notification_push_failed',
						properties: { notification_type: type, error_code: 'unknown' }
					});
				} catch (trackErr) {
					console.warn('[notifications] Failed to track notification_push_failed:', trackErr);
				}
			}
		}
	}
}
