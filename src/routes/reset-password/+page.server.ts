import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions } from './$types';

const resetSchema = z
	.object({
		password: z.string().min(8, 'Le mot de passe doit faire au moins 8 caractères'),
		passwordConfirm: z.string()
	})
	.refine((data) => data.password === data.passwordConfirm, {
		message: 'Les mots de passe ne correspondent pas',
		path: ['passwordConfirm']
	});

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const formData = await request.formData();
		const raw = {
			password: formData.get('password'),
			passwordConfirm: formData.get('passwordConfirm')
		};

		const result = resetSchema.safeParse(raw);
		if (!result.success) {
			const errors = result.error.flatten().fieldErrors;
			return fail(400, { errors });
		}

		const { password } = result.data;

		const { error } = await locals.supabase.auth.updateUser({ password });

		if (error) {
			return fail(400, {
				errors: {},
				message: 'Impossible de mettre à jour le mot de passe. Le lien a peut-être expiré.'
			});
		}

		throw redirect(303, '/login?reset=success');
	}
};
