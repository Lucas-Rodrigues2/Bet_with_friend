import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db/index';
import { profiles } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ locals }) => {
	const { session, user } = await locals.safeGetSession();

	let profile: { pseudo: string; avatarUrl: string | null; isAnonymous: boolean } | null = null;

	if (user) {
		const rows = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
		if (rows.length > 0) {
			profile = {
				pseudo: rows[0].pseudo,
				avatarUrl: rows[0].avatarUrl,
				isAnonymous: rows[0].isAnonymous
			};
		}
	}

	return {
		session,
		user,
		profile
	};
};
