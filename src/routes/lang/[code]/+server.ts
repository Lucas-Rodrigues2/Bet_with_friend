// /lang/fr | /lang/en — sélecteur de langue sans JavaScript :
// pose le cookie de choix explicite puis redirige vers la version demandée.
// Robuste même avant l'hydratation Svelte (clic rapide sur le lien).
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, cookies }) => {
	const code = params.code;
	if (code !== 'fr' && code !== 'en') redirect(303, '/');
	cookies.set('bwf_lang', code, {
		path: '/',
		maxAge: 60 * 60 * 24 * 365,
		sameSite: 'lax'
	});
	redirect(303, code === 'en' ? '/en' : '/');
};
