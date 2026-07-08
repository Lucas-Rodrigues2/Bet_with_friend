import { db } from '$lib/server/db/index';
import { notifications, notificationPreferences } from '$lib/server/db/schema';
import { captureServer } from '$lib/server/analytics';
import { sendEmail, EmailSendError } from '$lib/server/email';
import { renderEmail } from '$lib/server/email-templates';
import { sendPushNotifications } from '$lib/server/push';
import { env } from '$env/dynamic/private';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { NotificationType, NotificationPayload, NotifChannel } from '$lib/notifications';
import {
	NOTIFICATION_TYPES,
	NOTIF_CHANNELS,
	getNotificationLabel,
	getNotificationHref
} from '$lib/notifications';

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
 * Récupère en UNE requête les préférences explicites d'un ensemble
 * de destinataires pour un type et un canal donnés. Renvoie une map userId ->
 * enabled (uniquement pour les lignes explicites ; l'absence applique le défaut).
 *
 * Utilisé par notify() pour filtrer à l'émission sans N+1.
 */
async function getExplicitPrefs(
	userIds: string[],
	type: NotificationType,
	channel: NotifChannel
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
				eq(notificationPreferences.channel, channel)
			)
		);
	const map = new Map<string, boolean>();
	for (const row of rows) map.set(row.userId, row.enabled);
	return map;
}

/**
 * Récupère en UNE requête les préférences push explicites d'un ensemble de
 * destinataires pour un type donné. Exposé pour le canal push (src/lib/server/push.ts).
 */
export async function getExplicitPushPrefs(
	userIds: string[],
	type: NotificationType
): Promise<Map<string, boolean>> {
	return getExplicitPrefs(userIds, type, 'push');
}

/**
 * Récupère les adresses email d'un ensemble d'utilisateurs depuis auth.users
 * (table gérée par Supabase Auth, non exposée par le schéma Drizzle).
 * Renvoie une map userId -> email (uniquement ceux qui ont un email).
 */
async function getEmailsForUsers(userIds: string[]): Promise<Map<string, string>> {
	if (userIds.length === 0) return new Map();
	try {
		const idsList = sql.join(
			userIds.map((id) => sql`${id}::uuid`),
			sql`, `
		);
		const rows = (await db.execute(
			sql`SELECT id::text as id, email FROM auth.users WHERE id IN (${idsList})`
		)) as unknown as { id: string; email: string | null }[];
		const map = new Map<string, string>();
		for (const row of rows) {
			if (row.email) map.set(row.id, row.email);
		}
		return map;
	} catch (err) {
		console.warn('[notifications] Failed to fetch emails from auth.users:', err);
		return new Map();
	}
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

	// ── Filtrage à l'émission selon les préférences in-app ──────────────────
	// Une seule requête pour tous les destinataires (pas de N+1).
	let recipients = userIds;
	try {
		const explicit = await getExplicitPrefs(userIds, type, 'in_app');
		recipients = userIds.filter((uid) => explicit.get(uid) ?? defaultEnabled(type, 'in_app'));
	} catch (err) {
		// En cas d'erreur de lecture des préférences, on ne bloque pas l'envoi :
		// on retombe sur le défaut (tout activé en in-app) pour tous.
		console.warn('[notifications] Failed to read in-app prefs, falling back to defaults:', err);
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

	// ── Canal email — envoi asynchrone best-effort après commit DB ──────────
	// Détaché (setImmediate) : ne bloque jamais le retour de notify() et ne
	// fait jamais échouer l'action métier. Les échecs sont loggés + trackés
	// (notification_email_failed), jamais propagés.
	//
	// On filtre indépendamment du canal in-app : un utilisateur peut avoir
	// l'email activé sans avoir la cloche activée (et inversement).
	setImmediate(() => {
		void sendEmailNotifications(userIds, type, payload).catch((err) => {
			console.warn('[notifications] Unexpected error in email channel:', err);
		});
	});

	// ── Canal push — envoi asynchrone best-effort après commit DB ───────────
	// Même pattern que l'email : détaché (setImmediate), best-effort, jamais
	// ne throw ni ne bloque l'action métier. Un envoi par abonnement (un user
	// peut avoir plusieurs navigateurs) ; les échecs sont trackés
	// (notification_push_failed) et les endpoints morts (404/410) sont supprimés.
	setImmediate(() => {
		void sendPushNotifications(userIds, type, buildPushPayload(type, payload)).catch((err) => {
			console.warn('[notifications] Unexpected error in push channel:', err);
		});
	});
}

/**
 * Construit le payload push (titre / corps / lien profond) pour une notif.
 * Le titre est le label humain, le corps est une formulation courte, et le
 * lien profond est résolu via getNotificationHref (relatif, complété côté
 * serveur avec l'origin).
 */
function buildPushPayload(
	type: NotificationType,
	payload: NotificationPayload
): { title: string; body: string; url: string | null } {
	const title = 'Bet With Friend';
	const body = getNotificationLabel(type, payload);
	const href = getNotificationHref(type, payload);
	const origin = env.PUBLIC_SITE_URL ?? 'http://localhost:5173';
	const url = href ? `${origin}${href}` : null;
	return { title, body, url };
}

/**
 * Envoie les emails pour une notification donnée, aux destinataires dont la
 * préférence `email` du type est activée. Best-effort, jamais throw.
 *
 * Émet un event PostHog `notification_email_sent` (ou `notification_email_failed`)
 * par destinataire, sans PII dans les propriétés.
 *
 * Appelé en arrière-plan (setImmediate) par notify() — ne doit jamais rejeter.
 */
async function sendEmailNotifications(
	userIds: string[],
	type: NotificationType,
	payload: NotificationPayload
): Promise<void> {
	if (userIds.length === 0) return;

	// Destinataires email = ceux dont la préférence email est activée.
	let emailRecipients = userIds;
	try {
		const explicit = await getExplicitPrefs(userIds, type, 'email');
		emailRecipients = userIds.filter((uid) => explicit.get(uid) ?? defaultEnabled(type, 'email'));
	} catch (err) {
		// En cas d'erreur de lecture des prefs, on retombe sur le défaut.
		console.warn('[notifications] Failed to read email prefs, falling back to defaults:', err);
	}
	if (emailRecipients.length === 0) return;

	// Emails des destinataires (depuis auth.users — table Supabase Auth).
	const emails = await getEmailsForUsers(emailRecipients);
	if (emails.size === 0) return;

	const origin = env.PUBLIC_SITE_URL ?? 'http://localhost:5173';
	const template = renderEmail(type, payload, origin);

	// Un envoi par destinataire : un échec n'empêche pas les autres.
	// Séquentiel et simple (volumes faibles) ; tracking par envoi.
	for (const userId of emailRecipients) {
		const to = emails.get(userId);
		if (!to) continue;
		try {
			await sendEmail({ to, subject: template.subject, text: template.text, html: template.html });
			try {
				await captureServer({
					distinctId: userId,
					event: 'notification_email_sent',
					properties: { notification_type: type }
				});
			} catch (err) {
				console.warn('[notifications] Failed to track notification_email_sent:', err);
			}
		} catch (err) {
			const code = err instanceof EmailSendError ? err.code : 'unknown';
			console.warn(`[notifications] Email send failed (code=${code}) for user ${userId}:`, err);
			try {
				await captureServer({
					distinctId: userId,
					event: 'notification_email_failed',
					properties: { notification_type: type, error_code: code }
				});
			} catch (trackErr) {
				console.warn('[notifications] Failed to track notification_email_failed:', trackErr);
			}
		}
	}
}
