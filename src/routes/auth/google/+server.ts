import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /auth/google
 * Génère l'URL OAuth Google via Supabase et redirige le navigateur.
 * Le client_id/secret sont configurés dans supabase/config.toml (factices en dev).
 */
export const GET: RequestHandler = async ({ locals, url, cookies }) => {
	const isEnglish = url.searchParams.get('lang') === 'en';
	const redirectTo = `${url.origin}/auth/callback`;

	const { data, error } = await locals.supabase.auth.signInWithOAuth({
		provider: 'google',
		options: {
			redirectTo,
			skipBrowserRedirect: true
		}
	});

	if (error || !data.url) {
		cookies.delete('oauth_lang', { path: '/' });
		throw redirect(303, `${isEnglish ? '/en' : ''}/login?error=oauth_failed`);
	}

	// Keep the registered callback URL unchanged; only a fixed language is stored.
	cookies.set('oauth_lang', isEnglish ? 'en' : 'fr', {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 600
	});
	throw redirect(303, data.url);
};
