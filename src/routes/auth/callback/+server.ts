import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { profiles } from '$lib/server/db/schema';
import { captureServer } from '$lib/server/analytics';
import type { RequestHandler } from './$types';

/**
 * GET /auth/callback
 * Échange le code OAuth contre une session Supabase, crée le profil si absent,
 * puis redirige vers l'application.
 *
 * En cas d'erreur (accès refusé, code invalide, etc.), redirige vers /login
 * avec un message lisible.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const code = url.searchParams.get('code');
	const errorParam = url.searchParams.get('error');
	const errorDescription = url.searchParams.get('error_description');

	// Retour OAuth en erreur (ex: accès refusé par l'utilisateur)
	if (errorParam) {
		const message = errorDescription ?? errorParam;
		throw redirect(303, `/login?error=${encodeURIComponent(message)}`);
	}

	// Pas de code → erreur
	if (!code) {
		throw redirect(303, '/login?error=missing_code');
	}

	// Échange du code contre une session
	const { data, error } = await locals.supabase.auth.exchangeCodeForSession(code);

	if (error || !data.user) {
		throw redirect(303, `/login?error=${encodeURIComponent(error?.message ?? 'callback_failed')}`);
	}

	const user = data.user;

	// Upsert du profil si absent (première connexion Google)
	const pseudo =
		user.user_metadata?.full_name ??
		user.user_metadata?.name ??
		user.email?.split('@')[0] ??
		'Joueur';

	try {
		await db
			.insert(profiles)
			.values({
				id: user.id,
				pseudo,
				avatarUrl: user.user_metadata?.avatar_url ?? null,
				isAnonymous: false
			})
			.onConflictDoNothing();
	} catch {
		// Le profil existe déjà ou une contrainte empêche l'insertion — on continue.
	}

	// Track la connexion Google (fait réel après commit DB)
	await captureServer({
		distinctId: user.id,
		event: 'user_logged_in',
		properties: { provider: 'google' }
	});

	throw redirect(303, '/');
};
