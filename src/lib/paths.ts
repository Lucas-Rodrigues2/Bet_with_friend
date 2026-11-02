/**
 * Chemins localisés pour les liens internes.
 *
 * Remplace `resolveRoute` de `$app/paths` dans les composants : les identifiants
 * de routes SvelteKit incluent désormais le paramètre optionnel `[[lang]]`, ce
 * qui rend les appels `resolveRoute('/app/...', { id })` invalides côté types.
 * Ici on garde la syntaxe simple « chemin + params » et on préfixe
 * automatiquement la langue courante (`/en/...` en anglais, sinon `/...`).
 *
 * Compatible règle ESLint `svelte/no-navigation-without-resolve` : tout lien
 * interne doit passer par un appel nommé `resolveRoute`.
 */
import { page } from '$app/state';
import { langFromPath, lp } from '$lib/i18n';

export function resolveRoute(route: string, params: Record<string, string> = {}): string {
	let path: string = route;
	for (const [key, value] of Object.entries(params)) {
		path = path.replace(`[${key}]`, encodeURIComponent(value));
	}
	// Tolère les identifiants SvelteKit complets (« /[[lang]]/app/... »).
	path = path.replace('/[[lang]]', '');
	// Tolère les chemins déjà préfixés par la langue (pas de « /en/en/... »).
	path = path.replace(/^\/en(?=\/|$)/, '');
	return lp(langFromPath(page.url.pathname), path);
}
