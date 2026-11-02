// Relais de la mise en page serveur ([[lang]]) pour l'espace /en — force la langue anglaise.
import type { LayoutServerLoad } from './$types';
import { load as baseLoad } from '../[[lang]]/+layout.server';

export const load: LayoutServerLoad = (async (event) => {
	const data = await (baseLoad as (e: unknown) => Promise<Record<string, unknown>>)(event);
	return { ...data, lang: 'en' };
}) as LayoutServerLoad;
