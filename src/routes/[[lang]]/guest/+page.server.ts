import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { profiles } from '$lib/server/db/schema';
import { captureServer } from '$lib/server/analytics';
import type { Actions, PageServerLoad } from './$types';

const guestSchema = z.object({
	pseudo: z
		.string()
		.min(2, 'Le pseudo doit faire au moins 2 caractères')
		.max(30, 'Le pseudo ne peut pas dépasser 30 caractères')
});

// Only invitation paths may survive this flow; reject external URLs and parser ambiguities.
function invitationRedirect(url: URL, enhanced = false): string {
	const target = url.searchParams.get('redirectTo');
	if (!target || !/^\/(?:en\/)?invite\/[a-zA-Z0-9_-]+$/.test(target)) return '/';
	if (url.pathname.startsWith('/en/')) {
		const unlocalized = target.startsWith('/en/') ? target.slice(3) : target;
		return enhanced ? `/en${unlocalized}` : unlocalized;
	}
	return target;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { session } = await locals.safeGetSession();
	// Redirect if already logged in (non-anonymous)
	if (session) {
		throw redirect(303, invitationRedirect(url));
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		const formData = await request.formData();
		const raw = {
			pseudo: formData.get('pseudo')
		};

		const result = guestSchema.safeParse(raw);
		if (!result.success) {
			const errors = result.error.flatten().fieldErrors;
			return fail(400, {
				errors,
				pseudo: raw.pseudo as string
			});
		}

		const { pseudo } = result.data;

		// Create anonymous session
		const { data, error } = await locals.supabase.auth.signInAnonymously();

		if (error || !data.user) {
			return fail(500, {
				errors: {},
				pseudo,
				message: 'Impossible de créer une session invité. Veuillez réessayer.'
			});
		}

		const user = data.user;

		// Create profile for anonymous user
		try {
			await db
				.insert(profiles)
				.values({
					id: user.id,
					pseudo,
					isAnonymous: true
				})
				.onConflictDoUpdate({
					target: profiles.id,
					set: { pseudo, isAnonymous: true }
				});
		} catch {
			// Profile creation failed — sign out and return error
			await locals.supabase.auth.signOut();
			return fail(500, {
				errors: {},
				pseudo,
				message: 'Erreur lors de la création du profil. Veuillez réessayer.'
			});
		}

		// Track anonymous sign-in
		await captureServer({
			distinctId: user.id,
			event: 'guest_signed_in',
			properties: { pseudo }
		});

		throw redirect(
			303,
			invitationRedirect(url, request.headers.get('x-sveltekit-action') === 'true')
		);
	}
};
