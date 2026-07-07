import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { notificationPreferences } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { captureServer } from '$lib/server/analytics';
import { getEffectivePrefs, NOTIF_CHANNELS, type NotifChannel } from '$lib/server/notifications';
import { type NotificationType } from '$lib/notifications';
import type { Actions, PageServerLoad } from './$types';

// ─── Thèmes pour le regroupement de la matrice ────────────────────────────────
// (non exportés : seules les exports autorisées par SvelteKit sont permises
// dans +page.server.ts. Ces constantes sont passées au client via `data`.)

const NOTIF_THEMES: { title: string; types: NotificationType[] }[] = [
	{ title: 'Paris', types: ['proposition_received', 'counter_offer_received'] },
	{
		title: 'Jury',
		types: ['bet_submitted_to_jury', 'jury_vote_requested', 'verdict_rendered']
	},
	{
		title: 'Ardoise & gages',
		types: ['debt_created', 'forfeit_to_do', 'forfeit_to_confirm', 'dispute_opened']
	},
	{ title: 'Groupe', types: ['invitation_accepted'] }
];

// Libellés en français pour chaque type de notification.
const NOTIF_TYPE_LABELS: Record<NotificationType, string> = {
	invitation_accepted: "Quelqu'un rejoint votre groupe",
	proposition_received: 'Nouvelle proposition de pari',
	counter_offer_received: 'Contre-offre reçue',
	bet_submitted_to_jury: 'Pari soumis au jury',
	jury_vote_requested: 'Vote de juré requis',
	verdict_rendered: 'Verdict rendu',
	debt_created: 'Nouvelle dette',
	forfeit_to_do: 'Gage à effectuer',
	forfeit_to_confirm: 'Gage à confirmer',
	dispute_opened: 'Litige ouvert'
};

const NOTIF_CHANNEL_LABELS: Record<NotifChannel, string> = {
	in_app: 'Cloche',
	email: 'Email',
	push: 'Push'
};

export const load: PageServerLoad = async ({ locals }) => {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		throw redirect(303, '/login');
	}

	const prefs = await getEffectivePrefs(user.id);

	// L'utilisateur a-t-il personnalisé ses préférences (au moins une ligne explicite) ?
	let hasCustomPrefs = false;
	try {
		const rows = await db
			.select({ type: notificationPreferences.type })
			.from(notificationPreferences)
			.where(eq(notificationPreferences.userId, user.id))
			.limit(1);
		hasCustomPrefs = rows.length > 0;
	} catch (err) {
		console.warn('[notif-prefs] Failed to check custom prefs:', err);
	}

	// Tracking : consultation de la page. Pas de PII.
	try {
		await captureServer({
			distinctId: user.id,
			event: 'notification_preferences_viewed',
			properties: { has_custom_prefs: hasCustomPrefs }
		});
	} catch (err) {
		console.warn('[notif-prefs] Failed to track viewed event:', err);
	}

	return {
		themes: NOTIF_THEMES,
		typeLabels: NOTIF_TYPE_LABELS,
		channelLabels: NOTIF_CHANNEL_LABELS,
		channels: NOTIF_CHANNELS,
		prefs,
		hasCustomPrefs
	};
};

const channelSchema = z.enum(['in_app', 'email', 'push']);
const typeSchema = z.enum([
	'invitation_accepted',
	'proposition_received',
	'counter_offer_received',
	'bet_submitted_to_jury',
	'jury_vote_requested',
	'verdict_rendered',
	'debt_created',
	'forfeit_to_do',
	'forfeit_to_confirm',
	'dispute_opened'
]);

const updateSchema = z.object({
	type: typeSchema,
	channel: channelSchema,
	enabled: z.union([z.literal('true'), z.literal('false'), z.boolean()]).transform((v) => {
		if (typeof v === 'boolean') return v;
		return v === 'true';
	})
});

export const actions: Actions = {
	update: async ({ request, locals }) => {
		const { session, user } = await locals.safeGetSession();

		if (!session || !user) {
			return fail(401, { action: 'update', message: 'Non authentifié.' });
		}

		const formData = await request.formData();
		const result = updateSchema.safeParse({
			type: formData.get('type'),
			channel: formData.get('channel'),
			enabled: formData.get('enabled')
		});

		if (!result.success) {
			return fail(400, {
				action: 'update',
				message: 'Préférence invalide.'
			});
		}

		const { type, channel, enabled } = result.data as {
			type: NotificationType;
			channel: NotifChannel;
			enabled: boolean;
		};

		// Upsert : la ligne explicite prime sur le défaut.
		// (on conserve la ligne même si elle rétablit le défaut — l'effet est identique
		// et l'upsert est plus simple qu'un delete/insert conditionnel)
		try {
			await db
				.insert(notificationPreferences)
				.values({
					userId: user.id,
					type,
					channel,
					enabled,
					updatedAt: new Date()
				})
				.onConflictDoUpdate({
					target: [
						notificationPreferences.userId,
						notificationPreferences.type,
						notificationPreferences.channel
					],
					set: { enabled, updatedAt: new Date() }
				});
		} catch (err) {
			console.warn('[notif-prefs] Failed to upsert preference:', err);
			return fail(500, {
				action: 'update',
				message: "Erreur lors de l'enregistrement de la préférence."
			});
		}

		// Tracking PostHog : pas de PII, on n'envoie que le type, le canal et l'état.
		try {
			await captureServer({
				distinctId: user.id,
				event: 'notification_preferences_updated',
				properties: { type, channel, enabled }
			});
		} catch (err) {
			console.warn('[notif-prefs] Failed to track updated event:', err);
		}

		return { action: 'update', success: true, type, channel, enabled };
	},

	// Réinitialisation : supprime toutes les surcharges explicites de l'utilisateur
	// pour revenir aux défauts (tout activé en in-app, importants en email/push).
	reset: async ({ locals }) => {
		const { session, user } = await locals.safeGetSession();

		if (!session || !user) {
			return fail(401, { action: 'reset', message: 'Non authentifié.' });
		}

		try {
			await db.delete(notificationPreferences).where(eq(notificationPreferences.userId, user.id));
		} catch (err) {
			console.warn('[notif-prefs] Failed to reset preferences:', err);
			return fail(500, {
				action: 'reset',
				message: 'Erreur lors de la réinitialisation.'
			});
		}

		return { action: 'reset', success: true };
	}
};
