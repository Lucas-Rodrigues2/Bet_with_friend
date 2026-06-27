import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db/index';
import { profiles, notifications } from '$lib/server/db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ locals }) => {
	const { session, user } = await locals.safeGetSession();

	let profile: { pseudo: string; avatarUrl: string | null; isAnonymous: boolean } | null = null;
	let unreadNotificationsCount = 0;

	if (user) {
		const rows = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
		if (rows.length > 0) {
			profile = {
				pseudo: rows[0].pseudo,
				avatarUrl: rows[0].avatarUrl,
				isAnonymous: rows[0].isAnonymous
			};
		}

		// Count unread notifications for badge
		const countRows = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(notifications)
			.where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
		unreadNotificationsCount = countRows[0]?.count ?? 0;
	}

	return {
		session,
		user,
		profile,
		unreadNotificationsCount
	};
};
