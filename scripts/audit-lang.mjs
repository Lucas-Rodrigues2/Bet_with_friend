/**
 * Audit de pureté linguistique — s'exécute contre la prévisualisation locale.
 * Vérifie que les pages FR ne contiennent pas de mots anglais visibles et
 * inversement (hors <head>, scripts et balises).
 */
const BASE = process.env.AUDIT_BASE ?? 'http://100.88.54.21:4173';

const ROUTES = [
	'/',
	'/en',
	'/login',
	'/en/login',
	'/signup',
	'/en/signup',
	'/guest',
	'/en/guest',
	'/forgot-password',
	'/en/forgot-password',
	'/reset-password',
	'/en/reset-password',
	'/claim',
	'/en/claim'
];

const EN_WORDS =
	/\b(log in|log out|sign up|create an account|how it works|closest|challenge|frequently|password|email address|guest|continue|stake|forfeit|leaderboard|members|settings|save|cancel|delete|edit)\b/i;
const FR_WORDS =
	/\b(se connecter|créer un compte|créer|connexion|comment ça marche|au plus proche|défi|questions fréquentes|mot de passe|adresse email|invité|continuer|mise|gage|classement|membres|paramètres|enregistrer|annuler|supprimer|modifier)\b/i;

const strip = (h) =>
	h
		.replace(/<head>[\s\S]*?<\/head>/i, ' ')
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ');

let failures = 0;
for (const route of ROUTES) {
	const res = await fetch(BASE + route);
	const text = strip(await res.text());
	const isEn = route === '/en' || route.startsWith('/en/');
	const hits = (isEn ? FR_WORDS : EN_WORDS).exec(text);
	const ok = res.status === 200 && !hits;
	if (!ok) failures++;
	const detail = hits
		? ' — fuite: « ' + hits[0] + ' »'
		: ' (' + (isEn ? 'anglais' : 'français') + ' propre)';
	console.log((ok ? '✅' : '❌') + ' ' + route.padEnd(20) + ' HTTP ' + res.status + detail);
}
console.log(
	failures === 0
		? '\nAUDIT OK — aucune fuite de langue détectée.'
		: `\n${failures} page(s) en échec.`
);
process.exit(failures === 0 ? 0 : 1);
