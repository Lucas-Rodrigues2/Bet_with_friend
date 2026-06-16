import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /auth/google
 * Génère l'URL OAuth Google via Supabase et redirige le navigateur.
 * Le client_id/secret sont configurés dans supabase/config.toml (factices en dev).
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const redirectTo = `${url.origin}/auth/callback`;

	const { data, error } = await locals.supabase.auth.signInWithOAuth({
		provider: 'google',
		options: {
			redirectTo,
			skipBrowserRedirect: true
		}
	});

	if (error || !data.url) {
		throw redirect(303, '/login?error=oauth_init_failed');
	}

	throw redirect(303, data.url);
};
