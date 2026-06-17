import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { profiles } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { captureServer } from '$lib/server/analytics';
import type { Actions, PageServerLoad } from './$types';

const claimEmailSchema = z.object({
	email: z.string().email('Adresse email invalide'),
	password: z
		.string()
		.min(8, 'Le mot de passe doit faire au moins 8 caractères')
		.max(72, 'Le mot de passe est trop long')
});

export const load: PageServerLoad = async ({ locals }) => {
	const { session, user } = await locals.safeGetSession();

	// Must be logged in as anonymous user to claim
	if (!session || !user) {
		throw redirect(303, '/login');
	}

	// Check if user is anonymous
	const rows = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
	const profile = rows[0] ?? null;

	if (!profile || !profile.isAnonymous) {
		// Already a full account
		throw redirect(303, '/');
	}

	return {
		pseudo: profile.pseudo
	};
};

export const actions: Actions = {
	// Claim via email/password
	email: async ({ request, locals }) => {
		const { session, user } = await locals.safeGetSession();

		if (!session || !user) {
			return fail(401, { errors: {}, message: 'Non authentifié.' });
		}

		// Defense-in-depth: verify the user is still anonymous at action time
		const rows = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
		if (!rows[0]?.isAnonymous) {
			return fail(409, { errors: {}, message: 'Ce compte est déjà sécurisé.' });
		}

		const formData = await request.formData();
		const raw = {
			email: formData.get('email'),
			password: formData.get('password')
		};

		const result = claimEmailSchema.safeParse(raw);
		if (!result.success) {
			const errors = result.error.flatten().fieldErrors;
			return fail(400, {
				errors,
				email: raw.email as string
			});
		}

		const { email, password } = result.data;

		// Link email/password to the anonymous account
		const { data, error } = await locals.supabase.auth.updateUser({ email, password });

		if (error) {
			return fail(400, {
				errors: {},
				email,
				message: error.message ?? 'Impossible de lier le compte. Veuillez réessayer.'
			});
		}

		if (data.user) {
			// Update profile: mark as non-anonymous
			await db.update(profiles).set({ isAnonymous: false }).where(eq(profiles.id, data.user.id));

			await captureServer({
				distinctId: data.user.id,
				event: 'guest_account_claimed',
				properties: { method: 'email' }
			});
		}

		return { success: true, email };
	},

	// Claim via Google (initiates OAuth flow)
	google: async ({ locals, url }) => {
		const { session } = await locals.safeGetSession();

		if (!session) {
			return fail(401, { errors: {}, message: 'Non authentifié.' });
		}

		// linkIdentity for Google — redirect to OAuth
		const { data, error } = await locals.supabase.auth.linkIdentity({
			provider: 'google',
			options: {
				redirectTo: `${url.origin}/auth/callback`
			}
		});

		if (error) {
			return fail(400, {
				errors: {},
				message: error.message ?? 'Impossible de lier le compte Google.'
			});
		}

		if (data?.url) {
			throw redirect(303, data.url);
		}

		return fail(500, { errors: {}, message: 'Erreur inattendue lors de la liaison Google.' });
	}
};
