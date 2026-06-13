import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/index';
import { profiles } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

const signupSchema = z.object({
	email: z.string().email('Adresse email invalide'),
	pseudo: z
		.string()
		.min(2, 'Le pseudo doit faire au moins 2 caractères')
		.max(30, 'Le pseudo ne peut pas dépasser 30 caractères'),
	password: z
		.string()
		.min(8, 'Le mot de passe doit faire au moins 8 caractères')
		.max(72, 'Le mot de passe est trop long')
});

export const load: PageServerLoad = async ({ locals }) => {
	const { session } = await locals.safeGetSession();
	if (session) {
		throw redirect(303, '/');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const formData = await request.formData();
		const raw = {
			email: formData.get('email'),
			pseudo: formData.get('pseudo'),
			password: formData.get('password')
		};

		const result = signupSchema.safeParse(raw);
		if (!result.success) {
			const errors = result.error.flatten().fieldErrors;
			return fail(400, {
				errors,
				email: raw.email as string,
				pseudo: raw.pseudo as string
			});
		}

		const { email, pseudo, password } = result.data;

		const { data, error } = await locals.supabase.auth.signUp({
			email,
			password,
			options: {
				data: { pseudo }
			}
		});

		if (error) {
			return fail(400, {
				errors: {},
				email,
				pseudo,
				message: error.message
			});
		}

		// Create profile row if user was created (not already existing)
		if (data.user) {
			try {
				await db
					.insert(profiles)
					.values({
						id: data.user.id,
						pseudo,
						isAnonymous: false
					})
					.onConflictDoNothing();
			} catch {
				// Profile may already exist (e.g., via trigger). Continue.
			}
		}

		return { success: true, email };
	}
};
