import { db } from '$lib/server/db/index';
import { notifications } from '$lib/server/db/schema';
import { captureServer } from '$lib/server/analytics';
import type { NotificationType, NotificationPayload } from '$lib/notifications';

/**
 * Inserts one notification row per userId.
 * Never throws — notification failures must not break business actions.
 */
export async function notify(
	userIds: string[],
	type: NotificationType,
	payload: NotificationPayload
): Promise<void> {
	if (userIds.length === 0) return;
	const payloadStr = JSON.stringify(payload);
	try {
		await db.insert(notifications).values(
			userIds.map((userId) => ({
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
	for (const userId of userIds) {
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
