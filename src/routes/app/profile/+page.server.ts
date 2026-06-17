import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { db } from '$lib/server/db/index';
import { profiles } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { env as pubEnv } from '$env/dynamic/public';
import type { Actions, PageServerLoad } from './$types';

const pseudoSchema = z.object({
	pseudo: z
		.string()
		.min(2, 'Le pseudo doit faire au moins 2 caractères')
		.max(30, 'Le pseudo ne peut pas dépasser 30 caractères')
		.trim()
});

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 Mo

function getServiceClient() {
	const url = pubEnv.PUBLIC_SUPABASE_URL;
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) throw new Error('Supabase service role config manquante');
	return createClient(url, key, { auth: { persistSession: false } });
}

export const load: PageServerLoad = async ({ locals }) => {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		throw redirect(303, '/login');
	}

	const rows = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
	const profile = rows[0] ?? null;

	if (!profile) {
		throw redirect(303, '/login');
	}

	return {
		profile: {
			pseudo: profile.pseudo,
			avatarUrl: profile.avatarUrl,
			isAnonymous: profile.isAnonymous
		}
	};
};

export const actions: Actions = {
	updatePseudo: async ({ request, locals }) => {
		const { session, user } = await locals.safeGetSession();

		if (!session || !user) {
			return fail(401, { action: 'updatePseudo', errors: {}, message: 'Non authentifié.' });
		}

		const formData = await request.formData();
		const raw = { pseudo: formData.get('pseudo') };

		const result = pseudoSchema.safeParse(raw);
		if (!result.success) {
			const errors = result.error.flatten().fieldErrors;
			return fail(400, { action: 'updatePseudo', errors, pseudo: raw.pseudo as string });
		}

		const { pseudo } = result.data;

		await db.update(profiles).set({ pseudo }).where(eq(profiles.id, user.id));

		return { action: 'updatePseudo', success: true, pseudo };
	},

	uploadAvatar: async ({ request, locals }) => {
		const { session, user } = await locals.safeGetSession();

		if (!session || !user) {
			return fail(401, { action: 'uploadAvatar', errors: {}, message: 'Non authentifié.' });
		}

		const formData = await request.formData();
		const file = formData.get('avatar');

		if (!file || !(file instanceof File)) {
			return fail(400, {
				action: 'uploadAvatar',
				errors: {},
				message: 'Aucun fichier reçu.'
			});
		}

		if (!ALLOWED_MIME.includes(file.type)) {
			return fail(400, {
				action: 'uploadAvatar',
				errors: {},
				message: 'Format invalide. Utilisez jpg, png ou webp.'
			});
		}

		if (file.size > MAX_SIZE_BYTES) {
			return fail(400, {
				action: 'uploadAvatar',
				errors: {},
				message: "L'image ne doit pas dépasser 2 Mo."
			});
		}

		const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
		const path = `${user.id}/avatar.${ext}`;

		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		const supabaseService = getServiceClient();

		const { error: uploadError } = await supabaseService.storage
			.from('avatars')
			.upload(path, buffer, {
				contentType: file.type,
				upsert: true
			});

		if (uploadError) {
			return fail(500, {
				action: 'uploadAvatar',
				errors: {},
				message: `Erreur lors de l'upload : ${uploadError.message}`
			});
		}

		const {
			data: { publicUrl }
		} = supabaseService.storage.from('avatars').getPublicUrl(path);

		// Ajouter un cache-busting pour forcer le rechargement de l'image
		const avatarUrl = `${publicUrl}?t=${Date.now()}`;

		await db.update(profiles).set({ avatarUrl }).where(eq(profiles.id, user.id));

		return { action: 'uploadAvatar', success: true, avatarUrl };
	},

	deleteAvatar: async ({ locals }) => {
		const { session, user } = await locals.safeGetSession();

		if (!session || !user) {
			return fail(401, { action: 'deleteAvatar', errors: {}, message: 'Non authentifié.' });
		}

		const supabaseService = getServiceClient();

		// Supprimer tous les formats possibles
		const paths = [`${user.id}/avatar.jpg`, `${user.id}/avatar.png`, `${user.id}/avatar.webp`];

		await supabaseService.storage.from('avatars').remove(paths);

		await db.update(profiles).set({ avatarUrl: null }).where(eq(profiles.id, user.id));

		return { action: 'deleteAvatar', success: true };
	}
};
