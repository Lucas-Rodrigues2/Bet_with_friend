/**
 * Couche i18n — langue dérivée du préfixe d'URL (`/en/...` = anglais,
 * tout le reste = français). Aucune logique métier n'est dupliquée :
 * les pages partagent le même code, seul le catalogue de messages change.
 *
 * Voir `catalog.ts` pour la convention de traduction (gettext typé).
 */
import type { MessageKey } from './catalog';
export { tr, trf, trServer } from './catalog';
export type { MessageKey, ServerMessageKey } from './catalog';

export type Lang = 'fr' | 'en';

/** `undefined` (racine française) ou 'en' → Lang. */
export function langFromParams(params: Partial<Record<string, string>>): Lang {
	return params.lang === 'en' ? 'en' : 'fr';
}

/** Vrai si la route est dans l'espace anglais. */
export function isEnglishPath(pathname: string): boolean {
	return pathname === '/en' || pathname.startsWith('/en/');
}

export function langFromPath(pathname: string): Lang {
	return isEnglishPath(pathname) ? 'en' : 'fr';
}

/** Locale BCP-47 pour les dates, nombres et montants. */
export function localeOf(lang: Lang): 'fr-FR' | 'en-GB' {
	return lang === 'en' ? 'en-GB' : 'fr-FR';
}

/** Préfixe de langue pour un lien interne : ('en', '/app') → '/en/app'. */
export function lp(lang: Lang, path: string): string {
	if (path === '/') return lang === 'en' ? '/en' : '/';
	return (lang === 'en' ? '/en' : '') + path;
}

/** Version localisée de l'URL courante (pour le sélecteur de langue). */
export function switchLangPath(pathname: string, target: Lang): string {
	const stripped = isEnglishPath(pathname) ? pathname.slice(3) || '/' : pathname;
	return lp(target, stripped.startsWith('/') ? stripped : '/' + stripped);
}

/**
 * Localise la cible d'une redirection serveur : préserve la langue de la
 * requête courante (`/en/...`) sans changer la décision de redirection.
 * Ex. : locTarget('/en/claim', '/login') → '/en/login'.
 */
export function locTarget(pathname: string, target: string): string {
	if (!isEnglishPath(pathname)) return target;
	const end = target.search(/[?#]/);
	const path = end === -1 ? target : target.slice(0, end);
	const suffix = end === -1 ? '' : target.slice(end);
	const localized = isEnglishPath(path) ? path : path === '/' ? '/en' : '/en' + path;
	return localized + suffix;
}

// ─── Formatage localisé ──────────────────────────────────────────────────────

export function fmtDate(lang: Lang, value: Date | string | number | null | undefined): string {
	if (value === null || value === undefined || value === '') return '';
	return new Date(value).toLocaleDateString(localeOf(lang), {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
}

export function fmtDateLong(lang: Lang, value: Date | string | number | null | undefined): string {
	if (value === null || value === undefined || value === '') return '';
	return new Date(value).toLocaleDateString(localeOf(lang), {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
}

export function fmtDateTime(lang: Lang, value: Date | string | number | null | undefined): string {
	if (value === null || value === undefined || value === '') return '';
	return new Date(value).toLocaleString(localeOf(lang), {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function fmtNumber(lang: Lang, value: number): string {
	return new Intl.NumberFormat(localeOf(lang)).format(value);
}

export function fmtPoints(lang: Lang, value: number): string {
	const sign = value > 0 ? '+' : '';
	return `${sign}${fmtNumber(lang, value)} pts`;
}

/** « il y a 2 heures » / « 2 hours ago ». */
export function fmtRelative(lang: Lang, value: Date | string | number | null | undefined): string {
	if (value === null || value === undefined || value === '') return '';
	const date = new Date(value);
	const diffMs = date.getTime() - Date.now();
	const abs = Math.abs(diffMs);
	const rtf = new Intl.RelativeTimeFormat(localeOf(lang), { numeric: 'auto' });
	const minutes = Math.round(abs / 60000);
	if (minutes < 1) return rtf.format(Math.round(diffMs / 1000), 'second');
	if (minutes < 60) return rtf.format(Math.round(diffMs / 60000), 'minute');
	const hours = Math.round(minutes / 60);
	if (hours < 24) return rtf.format(Math.round(diffMs / 3600000), 'hour');
	const days = Math.round(hours / 24);
	if (days < 30) return rtf.format(Math.round(diffMs / 86400000), 'day');
	const months = Math.round(days / 30);
	if (months < 12) return rtf.format(Math.round(diffMs / 2592000000), 'month');
	return rtf.format(Math.round(diffMs / 31536000000), 'year');
}

// Compatibilité de type : toute clé de catalogue est utilisable dans les pages.
export type { MessageKey as MsgKey };
