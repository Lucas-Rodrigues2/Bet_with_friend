import type { PageServerLoad } from './$types';

// La page d'accueil est accessible aux utilisateurs connectés et non connectés.
// La mise en page (layout) fournit déjà `data.session` via le layout server.
// La page affiche un bouton « Mes groupes » si l'utilisateur est connecté,
// ou des boutons « Se connecter » / « Créer un compte » sinon.
export const load: PageServerLoad = async () => {
	// Rien à charger ici — le layout server fournit session, user et profile.
	return {};
};
