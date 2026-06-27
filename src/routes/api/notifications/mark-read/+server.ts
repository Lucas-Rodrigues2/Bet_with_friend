import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { notifications } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) {
		return json({ success: false, error: 'Non authentifié.' }, { status: 401 });
	}

	let body: { id?: string; all?: boolean };
	try {
		body = (await request.json()) as { id?: string; all?: boolean };
	} catch {
		return json({ success: false, error: 'Corps invalide.' }, { status: 400 });
	}

	const now = new Date();

	if (body.all === true) {
		// Mark all notifications as read for this user
		await db
			.update(notifications)
			.set({ readAt: now })
			.where(and(eq(notifications.userId, user.id)));
	} else if (typeof body.id === 'string') {
		// Mark a single notification as read (must belong to this user)
		await db
			.update(notifications)
			.set({ readAt: now })
			.where(and(eq(notifications.id, body.id), eq(notifications.userId, user.id)));
	} else {
		return json({ success: false, error: 'Paramètres manquants.' }, { status: 400 });
	}

	return json({ success: true });
};
