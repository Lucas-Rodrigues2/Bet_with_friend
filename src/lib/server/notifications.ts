import { db } from '$lib/server/db/index';
import { notifications, notificationPreferences } from '$lib/server/db/schema';
import { captureServer } from '$lib/server/analytics';
import { and, eq, inArray } from 'drizzle-orm';
import type { NotificationType, NotificationPayload, NotifChannel } from '$lib/notifications';
import { NOTIFICATION_TYPES, NOTIF_CHANNELS } from '$lib/notifications';

// ─── Notification channel & preferences ──────────────────────────────────────

export type { NotifChannel };
export { NOTIF_CHANNELS };

/**
 * Types considérés « importants » : activés par défaut en email/push
 * (les canaux email/push n'existent pas encore — l'état est néanmoins persisté).
 */
export const IMPORTANT_NOTIF_TYPES: NotificationType[] = [
	'proposition_received',
	'verdict_rendered',
	'forfeit_to_do',
	'forfeit_to_confirm'
];

/**
 * Valeur par défaut d'un (type, canal) en l'absence de ligne explicite.
 * - in_app : tout activé.
 * - email/push : uniquement les événements « importants ».
 */
export function defaultEnabled(type: NotificationType, channel: NotifChannel): boolean {
	if (channel === 'in_app') return true;
	return IMPORTANT_NOTIF_TYPES.includes(type);
}

export interface ChannelPrefs {
	in_app: boolean;
	email: boolean;
	push: boolean;
}

export type PrefsMap = Record<NotificationType, ChannelPrefs>;

function emptyPrefs(): PrefsMap {
	const map = {} as PrefsMap;
	for (const t of NOTIFICATION_TYPES) {
		map[t] = {
			in_app: defaultEnabled(t, 'in_app'),
			email: defaultEnabled(t, 'email'),
			push: defaultEnabled(t, 'push')
		};
	}
	return map;
}

/**
 * Récupère les préférences effectives d'un utilisateur (défauts + surcharges
 * explicites) pour tous les types et canaux.
 */
export async function getEffectivePrefs(userId: string): Promise<PrefsMap> {
	const prefs = emptyPrefs();
	const rows = await db
		.select()
		.from(notificationPreferences)
		.where(eq(notificationPreferences.userId, userId));

	for (const row of rows) {
		const entry = prefs[row.type as NotificationType];
		if (!entry) continue;
		entry[row.channel] = row.enabled;
	}
	return prefs;
}

/**
 * Récupère en UNE requête les préférences in-app explicites d'un ensemble
 * de destinataires pour un type donné. Renvoie une map userId -> enabled
 * (uniquement pour les lignes explicites ; l'absence applique le défaut).
 *
 * Utilisé par notify() pour filtrer à l'émission sans N+1.
 */
async function getExplicitInAppPrefs(
	userIds: string[],
	type: NotificationType
): Promise<Map<string, boolean>> {
	if (userIds.length === 0) return new Map();
	const rows = await db
		.select({
			userId: notificationPreferences.userId,
			enabled: notificationPreferences.enabled
		})
		.from(notificationPreferences)
		.where(
			and(
				inArray(notificationPreferences.userId, userIds),
				eq(notificationPreferences.type, type),
				eq(notificationPreferences.channel, 'in_app')
			)
		);
	const map = new Map<string, boolean>();
	for (const row of rows) map.set(row.userId, row.enabled);
	return map;
}

/**
 * Inserts one notification row per userId, en respectant les préférences in-app
 * des destinataires (filtrage à l'émission : pas d'insertion si in_app désactivé).
 *
 * Décision (S-071) : on filtre à l'émission plutôt qu'à la lecture — la table
 * notifications ne contient que les notifs que l'utilisateur doit voir, ce qui
 * garde la cloche et le compteur non-lus cohérents sans requête de préférences
 * à chaque lecture.
 *
 * Never throws — notification failures must not break business actions.
 */
export async function notify(
	userIds: string[],
	type: NotificationType,
	payload: NotificationPayload
): Promise<void> {
	if (userIds.length === 0) return;

	// Filtrage à l'émission selon les préférences in-app.
	// Une seule requête pour tous les destinataires (pas de N+1).
	let recipients = userIds;
	try {
		const explicit = await getExplicitInAppPrefs(userIds, type);
		recipients = userIds.filter((uid) => explicit.get(uid) ?? defaultEnabled(type, 'in_app'));
	} catch (err) {
		// En cas d'erreur de lecture des préférences, on ne bloque pas l'envoi :
		// on retombe sur le défaut (tout activé en in-app) pour tous.
		console.warn('[notifications] Failed to read prefs, falling back to defaults:', err);
	}

	if (recipients.length === 0) return;

	const payloadStr = JSON.stringify(payload);
	try {
		await db.insert(notifications).values(
			recipients.map((userId) => ({
				userId,
				type,
				payload: payloadStr
			}))
		);
	} catch (err) {
		console.warn('[notifications] Failed to insert notifications:', err);
		return;
	}

	// Tracking PostHog : un event par destinataire, après commit DB.
	// Pas de PII — distinct_id = userId, propriété notification_type seulement.
	for (const userId of recipients) {
		try {
			await captureServer({
				distinctId: userId,
				event: 'notification_sent',
				properties: { notification_type: type }
			});
		} catch (err) {
			// Ne jamais casser l'action métier pour de l'analytics
			console.warn('[notifications] Failed to track notification_sent:', err);
		}
	}
}
