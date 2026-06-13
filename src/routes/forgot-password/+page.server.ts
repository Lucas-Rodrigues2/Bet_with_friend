import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions } from './$types';

const forgotSchema = z.object({
	email: z.string().email('Adresse email invalide')
});

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		const formData = await request.formData();
		const raw = { email: formData.get('email') };

		const result = forgotSchema.safeParse(raw);
		if (!result.success) {
			const errors = result.error.flatten().fieldErrors;
			return fail(400, { errors, email: raw.email as string });
		}

		const { email } = result.data;
		const redirectTo = `${url.origin}/reset-password`;

		// Always returns success to avoid email enumeration
		await locals.supabase.auth.resetPasswordForEmail(email, { redirectTo });

		return { success: true, email };
	}
};
