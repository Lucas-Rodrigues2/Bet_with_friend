import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { notifications } from '$lib/server/db/schema';
import { and, eq, isNull, desc } from 'drizzle-orm';
import { parsePayload } from '$lib/notifications';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) {
		return json({ notifications: [], unreadCount: 0 });
	}

	const rows = await db
		.select({
			id: notifications.id,
			type: notifications.type,
			payload: notifications.payload,
			readAt: notifications.readAt,
			createdAt: notifications.createdAt
		})
		.from(notifications)
		.where(eq(notifications.userId, user.id))
		.orderBy(desc(notifications.createdAt))
		.limit(50);

	const items = rows.map((r) => ({
		id: r.id,
		type: r.type,
		payload: parsePayload(r.payload),
		readAt: r.readAt ? r.readAt.toISOString() : null,
		createdAt: r.createdAt.toISOString()
	}));

	// Count unread
	const unreadRows = await db
		.select({ id: notifications.id })
		.from(notifications)
		.where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));

	return json({
		notifications: items,
		unreadCount: unreadRows.length
	});
};
