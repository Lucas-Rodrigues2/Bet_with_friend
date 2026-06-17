import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { createGroup } from '$lib/server/groups';
import type { Actions, PageServerLoad } from './$types';

const createGroupSchema = z.object({
	name: z
		.string()
		.min(2, 'Le nom doit faire au moins 2 caractères')
		.max(50, 'Le nom ne peut pas dépasser 50 caractères')
		.trim(),
	description: z
		.string()
		.max(500, 'La description ne peut pas dépasser 500 caractères')
		.trim()
		.optional(),
	currency: z.enum(['EUR', 'USD', 'GBP']).default('EUR')
});

export const load: PageServerLoad = async ({ locals }) => {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		throw redirect(303, '/login');
	}

	return {};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const { session, user } = await locals.safeGetSession();

		if (!session || !user) {
			return fail(401, { errors: {}, message: 'Non authentifié.' });
		}

		const formData = await request.formData();
		const raw = {
			name: formData.get('name'),
			description: formData.get('description') || undefined,
			currency: formData.get('currency') || 'EUR'
		};

		const result = createGroupSchema.safeParse(raw);
		if (!result.success) {
			const errors = result.error.flatten().fieldErrors;
			return fail(400, {
				errors,
				values: {
					name: raw.name as string,
					description: raw.description as string | undefined,
					currency: raw.currency as string
				}
			});
		}

		const { name, description, currency } = result.data;

		const groupId = await createGroup({
			name,
			description: description ?? null,
			currency,
			creatorId: user.id
		});

		throw redirect(303, `/app/groups/${groupId}`);
	}
};
