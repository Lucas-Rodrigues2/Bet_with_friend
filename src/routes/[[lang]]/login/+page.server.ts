import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { captureServer } from '$lib/server/analytics';
import type { Actions, PageServerLoad } from './$types';

const loginSchema = z.object({
	email: z.string().email('Adresse email invalide'),
	password: z.string().min(1, 'Mot de passe requis')
});

function unsafeCharacters(value: string): boolean {
	return Array.from(value).some((char) => {
		const code = char.charCodeAt(0);
		return char === '\\' || code < 32 || code === 127;
	});
}

// Avoid open redirects, including encoded backslashes and browser URL normalization.
function safeLocalRedirect(value: string | null): string | null {
	if (!value || !value.startsWith('/') || value.startsWith('//') || unsafeCharacters(value))
		return null;
	try {
		const decoded = decodeURIComponent(value);
		if (decoded.startsWith('//') || unsafeCharacters(decoded)) return null;
		const base = 'https://internal.invalid';
		if (new URL(value, base).origin !== base) return null;
		return value;
	} catch {
		return null;
	}
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { session } = await locals.safeGetSession();

	const redirectTo = safeLocalRedirect(url.searchParams.get('redirectTo'));

	if (session) {
		throw redirect(303, redirectTo ?? '/');
	}

	// Message d'erreur provenant d'un retour OAuth (ex: accès refusé)
	const oauthError = url.searchParams.get('error');

	return {
		oauthError: oauthError ? decodeURIComponent(oauthError) : null,
		redirectTo: redirectTo ?? null
	};
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		const formData = await request.formData();
		const redirectTo = safeLocalRedirect(url.searchParams.get('redirectTo'));
		const raw = {
			email: formData.get('email'),
			password: formData.get('password')
		};

		const result = loginSchema.safeParse(raw);
		if (!result.success) {
			const errors = result.error.flatten().fieldErrors;
			return fail(400, {
				errors,
				email: raw.email as string
			});
		}

		const { email, password } = result.data;

		const { data, error } = await locals.supabase.auth.signInWithPassword({ email, password });

		if (error) {
			return fail(400, {
				errors: {},
				email,
				message: 'Identifiants incorrects. Vérifiez votre email et mot de passe.'
			});
		}

		// Track après connexion réussie (fait réel)
		if (data.user) {
			await captureServer({
				distinctId: data.user.id,
				event: 'user_logged_in'
			});
		}

		throw redirect(303, redirectTo ?? '/');
	}
};
