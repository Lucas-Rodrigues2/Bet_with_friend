import { redirect } from '@sveltejs/kit';
import { captureServer } from '$lib/server/analytics';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ locals }) => {
		// Récupérer l'utilisateur avant de fermer la session
		const { user } = await locals.safeGetSession();

		if (user) {
			await captureServer({
				distinctId: user.id,
				event: 'user_logged_out'
			});
		}

		await locals.supabase.auth.signOut();
		throw redirect(303, '/');
	}
};
