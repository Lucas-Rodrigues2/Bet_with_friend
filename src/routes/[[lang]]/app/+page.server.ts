import { redirect } from '@sveltejs/kit';
import { getUserGroups } from '$lib/server/groups';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		throw redirect(303, '/login');
	}

	const myGroups = await getUserGroups(user.id);

	return {
		myGroups
	};
};
