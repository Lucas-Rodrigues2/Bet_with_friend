import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { profiles, notifications } from '$lib/server/db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { langFromParams, preferredLangFromHeader } from '$lib/i18n';

export const load: LayoutServerLoad = async ({ locals, params, url, request, cookies }) => {
	// Négociation de langue sur la racine : choix explicite (cookie `bwf_lang`)
	// > préférence du navigateur (`Accept-Language`) > français par défaut.
	// Un navigateur non francophone est renvoyé vers `/en` (les robots
	// d'indexation, sans en-tête, gardent la version française canonique).
	if (url.pathname === '/') {
		const choice = cookies.get('bwf_lang');
		const preferred =
			choice === 'fr' || choice === 'en'
				? choice
				: (preferredLangFromHeader(request.headers.get('accept-language')) ?? 'fr');
		if (preferred === 'en') redirect(302, '/en');
	}

	const { session, user } = await locals.safeGetSession();

	// Langue de l'espace courant : `/en/...` = anglais, sinon français.
	const lang = langFromParams(params);

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
		lang,
		session,
		user,
		profile,
		unreadNotificationsCount
	};
};
