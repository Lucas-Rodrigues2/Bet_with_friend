import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { notificationPreferences, pushSubscriptions } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
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

	// Abonnements push de l'utilisateur (nombre + endpoints, pour l'UI push).
	let pushSubscriptionCount = 0;
	try {
		const subs = await db
			.select({ id: pushSubscriptions.id })
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.userId, user.id));
		pushSubscriptionCount = subs.length;
	} catch (err) {
		console.warn('[notif-prefs] Failed to count push subscriptions:', err);
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
		hasCustomPrefs,
		pushSubscriptionCount
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
	},

	// ─── Web Push : enregistrement d'un abonnement (cet appareil) ──────────────
	// Reçoit l'endpoint + les clés p256dh/auth depuis le navigateur (après
	// demande de permission + pushManager.subscribe côté client). Upsert par
	// endpoint (unique) : si l'appareil se ré-abonne, on ne crée pas de doublon.
	subscribe_push: async ({ request, locals }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) {
			return fail(401, { action: 'subscribe_push', message: 'Non authentifié.' });
		}

		const formData = await request.formData();
		const endpoint = formData.get('endpoint');
		const p256dh = formData.get('keys_p256dh');
		const auth = formData.get('keys_auth');

		if (
			typeof endpoint !== 'string' ||
			!endpoint.startsWith('https://') ||
			typeof p256dh !== 'string' ||
			p256dh.length === 0 ||
			typeof auth !== 'string' ||
			auth.length === 0
		) {
			return fail(400, { action: 'subscribe_push', message: 'Abonnement push invalide.' });
		}

		// Domaine de l'endpoint (push service provider), pour tracking PostHog
		// sans fuiter l'endpoint complet (qui est un identifiant).
		let endpointDomain: string | undefined;
		try {
			endpointDomain = new URL(endpoint).hostname;
		} catch {
			endpointDomain = undefined;
		}

		try {
			// Vérifie l'ownership AVANT d'écrire : l'endpoint est UNIQUE global
			// (un endpoint = un appareil/navigateur). Sur un appareil partagé, si
			// l'endpoint existe déjà pour un autre user, on refuse (409) sans
			// écraser ses keys. Si l'endpoint appartient au user courant, on met
			// à jour les keys (réabonnement du même appareil).
			const existing = await db
				.select({ userId: pushSubscriptions.userId })
				.from(pushSubscriptions)
				.where(eq(pushSubscriptions.endpoint, endpoint))
				.limit(1);

			if (existing.length > 0 && existing[0].userId !== user.id) {
				return fail(409, {
					action: 'subscribe_push',
					message: 'Cet appareil est déjà abonné pour un autre compte.'
				});
			}

			if (existing.length > 0) {
				await db
					.update(pushSubscriptions)
					.set({ keys: { p256dh, auth }, createdAt: new Date() })
					.where(eq(pushSubscriptions.endpoint, endpoint));
			} else {
				await db.insert(pushSubscriptions).values({
					userId: user.id,
					endpoint,
					keys: { p256dh, auth }
				});
			}
		} catch (err) {
			console.warn('[notif-prefs] Failed to upsert push subscription:', err);
			return fail(500, {
				action: 'subscribe_push',
				message: "Erreur lors de l'enregistrement de l'abonnement push."
			});
		}

		// Tracking PostHog : pas d'endpoint complet (PII/identifiant), juste le
		// domaine du push service si disponible.
		try {
			const properties: Record<string, unknown> = {};
			if (endpointDomain) properties.endpoint_domain = endpointDomain;
			await captureServer({
				distinctId: user.id,
				event: 'push_subscription_created',
				properties
			});
		} catch (err) {
			console.warn('[notif-prefs] Failed to track push_subscription_created:', err);
		}

		return { action: 'subscribe_push', success: true };
	},

	// ─── Web Push : suppression d'un abonnement (cet appareil) ────────────────
	// Reçoit l'endpoint à supprimer (récupéré côté client via getSubscription()).
	// On supprime la ligne serveur ; le désabonnement navigateur (unsubscribe)
	// est fait côté client AVANT l'appel (best-effort : on supprime quand même
	// la ligne serveur même si le client n'a pas réussi à unsubscribe).
	unsubscribe_push: async ({ request, locals }) => {
		const { session, user } = await locals.safeGetSession();
		if (!session || !user) {
			return fail(401, { action: 'unsubscribe_push', message: 'Non authentifié.' });
		}

		const formData = await request.formData();
		const endpoint = formData.get('endpoint');
		if (typeof endpoint !== 'string' || endpoint.length === 0) {
			return fail(400, { action: 'unsubscribe_push', message: 'Endpoint manquant.' });
		}

		// On ne supprime QUE les abonnements appartenant à l'utilisateur : la
		// clause user_id est OBLIGATOIRE car la connexion Drizzle tourne en
		// service_role (bypass RLS). Sans elle, un user authentifié connaissant
		// l'endpoint d'un autre user pourrait le supprimer (DoS ciblé).
		try {
			const deleted = await db
				.delete(pushSubscriptions)
				.where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)))
				.returning({ id: pushSubscriptions.id });

			// 0 ligne supprimée : l'endpoint n'existe pas OU n'appartient pas au
			// user. On renvoie 404 sans tracker (ne pas leak « cet endpoint existe
			// mais ne m'appartient pas »).
			if (deleted.length === 0) {
				return fail(404, {
					action: 'unsubscribe_push',
					message: 'Abonnement introuvable.'
				});
			}
		} catch (err) {
			console.warn('[notif-prefs] Failed to delete push subscription:', err);
			return fail(500, {
				action: 'unsubscribe_push',
				message: "Erreur lors de la suppression de l'abonnement push."
			});
		}

		// Tracking PostHog : pas de PII.
		try {
			await captureServer({
				distinctId: user.id,
				event: 'push_subscription_removed',
				properties: {}
			});
		} catch (err) {
			console.warn('[notif-prefs] Failed to track push_subscription_removed:', err);
		}

		return { action: 'unsubscribe_push', success: true };
	}
};
