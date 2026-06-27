import { db } from '$lib/server/db/index';
import { notifications } from '$lib/server/db/schema';
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
	}
}
