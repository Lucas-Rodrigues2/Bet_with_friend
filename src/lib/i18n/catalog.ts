/**
 * Catalogue de messages UI — FR → EN.
 *
 * Convention gettext : la clé EST la chaîne française source (non traduite,
 * telle qu'écrite dans le code). `tr('fr', clé)` renvoie la clé ; `tr('en', clé)`
 * renvoie la traduction anglaise.
 *
 * Garantie de typage : `MessageKey` est l'union des clés. Passer une chaîne
 * absente du catalogue est une erreur TypeScript (`npm run check`), donc toute
 * chaîne visible non cataloguée casse le build — il n'y a pas de repli silencieux.
 *
 * Interpolation : `trf(lang, clé, { param })` remplace les `{param}` dans les
 * deux langues, ce qui permet des ordres de mots différents.
 */
import type { Lang } from './index';

export const messages = {
	// ─── En-tête, navigation, générique ────────────────────────────────────────
	'Bet With Friends': 'Bet With Friends',
	'Se connecter': 'Log in',
	'Créer un compte': 'Create an account',
	Déconnexion: 'Log out',
	'Mon profil': 'My profile',
	'Avatar de {name}': 'Avatar of {name}',
	Enregistrer: 'Save',
	Annuler: 'Cancel',
	Confirmer: 'Confirm',
	Modifier: 'Edit',
	Supprimer: 'Delete',
	"Retour à l'accueil": 'Back to home',
	'Retour au groupe': 'Back to the group',
	'← Mes groupes': '← My groups',
	Admin: 'Admin',
	pts: 'pts',
	'Chargement…': 'Loading…',
	oui: 'yes',
	non: 'no',

	// ─── Bandeau invité ───────────────────────────────────────────────────────
	'Compte invité': 'Guest account',
	'— Sécurise ton historique pour ne rien perdre.': '— Secure your history so you lose nothing.',
	'Sécuriser mon compte': 'Secure my account',

	// ─── Notifications ────────────────────────────────────────────────────────
	Notifications: 'Notifications',
	'Panneau des notifications': 'Notifications panel',
	'Liste des notifications': 'Notifications list',
	'Tout marquer lu': 'Mark all as read',
	"Aucune notification pour l'instant.": 'No notifications yet.',
	'Non lue': 'Unread',
	'Notifications ({count} non lues)': 'Notifications ({count} unread)',
	"à l'instant": 'just now',
	'il y a {minutes} min': '{minutes} min ago',
	'il y a {hours} h': '{hours} h ago',
	'il y a {days} j': '{days} d ago',
	'{who} a rejoint votre groupe': '{who} joined your group',
	'{who} vous défie sur {title}': '{who} challenges you on {title}',
	'{who} vous propose de nouvelles conditions pour {title}':
		'{who} is offering new terms for {title}',
	'Vote de juré requis pour {title}': 'Jury vote required for {title}',
	'Verdict rendu pour {title}': 'Verdict rendered for {title}',
	'Nouvelle dette pour {title}': 'New debt for {title}',
	'Gage à effectuer pour {title}': 'Forfeit to complete for {title}',
	'Gage déclaré effectué pour {title}': 'Forfeit marked as done for {title}',
	'Litige ouvert pour {title}': 'Dispute opened for {title}',
	'Nouvelle notification': 'New notification',
	"Quelqu'un": 'Someone',
	'un pari': 'a bet',
	'"{title}"': '"{title}"',

	// ─── Préférences de notifications ─────────────────────────────────────────
	'Préférences de notifications': 'Notification preferences',
	'Ardoise & gages': 'Tab & forfeits',
	"Quelqu'un rejoint votre groupe": 'Someone joins your group',
	'Nouvelle proposition de pari': 'New bet proposition',
	'Contre-offre reçue': 'Counter-offer received',
	'Pari soumis au jury': 'Bet submitted to the jury',
	'Vote de juré requis': 'Jury vote required',
	'Verdict rendu': 'Verdict rendered',
	'Gage à effectuer': 'Forfeit to complete',
	'Gage à confirmer': 'Forfeit to confirm',
	'Notification importante': 'Important notification',
	'Préférence enregistrée.': 'Preference saved.',
	'Préférences réinitialisées.': 'Preferences reset.',
	'Préférence invalide.': 'Invalid preference.',
	"Erreur lors de l'enregistrement de la préférence.": 'Error while saving the preference.',
	'Erreur lors de la réinitialisation.': 'Error while resetting.',
	'Notifications push sur cet appareil': 'Push notifications on this device',
	'Permission de notifications refusée.': 'Notification permission denied.',
	'Votre navigateur ne supporte pas les notifications push.':
		'Your browser does not support push notifications.',
	"Erreur lors de l'enregistrement de l'abonnement.": 'Error while saving the subscription.',
	'Notifications push activées sur cet appareil.': 'Push notifications enabled on this device.',
	"Erreur lors de l'enregistrement de l'abonnement push.":
		'Error while saving the push subscription.',
	'Cet appareil est déjà abonné pour un autre compte.':
		'This device is already subscribed for another account.',
	"Erreur lors de la suppression de l'abonnement push.":
		'Error while deleting the push subscription.',
	"Erreur lors de la suppression de l'abonnement.": 'Error while deleting the subscription.',
	'Notifications push désactivées sur cet appareil.': 'Push notifications disabled on this device.',

	// ─── PWA ──────────────────────────────────────────────────────────────────
	'Installer sur iPhone / iPad (Safari)': 'Install on iPhone / iPad (Safari)',
	Partager: 'Share',
	"« Sur l'écran d'accueil »": '“Add to Home Screen”',
	'Confirmez en touchant': 'Confirm by tapping',
	'« Ajouter »': '“Add”',
	'Installer sur Android (Chrome)': 'Install on Android (Chrome)',
	"« Ajouter à l'écran d'accueil »": '“Add to Home Screen”',
	'« Installer »': '“Install”',
	'Installer sur macOS (Safari)': 'Install on macOS (Safari)',
	Fichier: 'File',
	'« Ajouter au Dock »': '“Add to Dock”',
	"L'app s'ouvre ensuite comme une application depuis le Dock.":
		'The app then opens like a regular app from the Dock.',
	"Installer l'app": 'Install the app',
	"« Installer l'application »": '“Install the app”'
} as const satisfies Record<string, string>;

export type MessageKey = keyof typeof messages;

/** Traduit une clé du catalogue. FR = la clé elle-même. */
export function tr(lang: Lang, key: MessageKey): string {
	return lang === 'en' ? messages[key] : key;
}

/** Traduit avec interpolation : les `{param}` sont remplacés dans les deux langues. */
export function trf(lang: Lang, key: MessageKey, params: Record<string, string | number>): string {
	let out: string = tr(lang, key);
	for (const [name, value] of Object.entries(params)) {
		out = out.replaceAll(`{${name}}`, String(value));
	}
	return out;
}

/**
 * Table des messages issus de la logique serveur (`src/lib/server/*`) :
 * ces chaînes sont produites par des modules qui n'ont pas accès à la langue ;
 * on les localise à la frontière de rendu. Même convention gettext.
 */
export const serverMessages = {
	// Erreurs génériques / accès
	'Non authentifié.': 'Not authenticated.',
	'Accès refusé.': 'Access denied.',
	'Accès refusé — seul un admin peut promouvoir un membre.':
		'Access denied — only an admin can promote a member.',
	'Accès refusé — seul un admin peut révoquer un lien.':
		'Access denied — only an admin can revoke a link.',
	'Accès refusé — seul un admin peut modifier les droits.':
		'Access denied — only an admin can change permissions.',
	'Accès réservé aux admins.': 'Admins only.',
	'Paramètres invalides.': 'Invalid parameters.',
	'Paramètres manquants.': 'Missing parameters.',
	'Données invalides.': 'Invalid data.',
	'Groupe invalide.': 'Invalid group.',
	'Groupe introuvable.': 'Group not found.',
	'Groupe introuvable ou accès refusé.': 'Group not found or access denied.',
	'Pari introuvable.': 'Bet not found.',
	'Pari introuvable ou accès refusé.': 'Bet not found or access denied.',
	'Identifiant du gage invalide.': 'Invalid forfeit identifier.',
	'Gage introuvable.': 'Forfeit not found.',
	'Membre introuvable.': 'Member not found.',
	'Erreur lors de la création du groupe.': 'Error while creating the group.',
	'Erreur lors de la création du pari.': 'Error while creating the bet.',
	'Erreur lors de la création du duel.': 'Error while creating the duel.',
	'Erreur lors de la création du défi ouvert.': 'Error while creating the open challenge.',
	'Erreur lors de la création du match.': 'Error while creating the match.',
	'Erreur lors de la participation.': 'Error while joining the bet.',
	'Erreur lors de la soumission au jury.': 'Error while submitting to the jury.',
	'Erreur lors du vote.': 'Error while voting.',
	"Erreur lors de l'acceptation de la proposition.": 'Error while accepting the proposition.',
	'Erreur lors du refus de la proposition.': 'Error while refusing the proposition.',
	"Erreur lors de l'annulation de la proposition.": 'Error while cancelling the proposition.',
	"Erreur lors de l'acceptation du défi.": 'Error while accepting the challenge.',
	"Erreur lors de la demande d'annulation.": 'Error while requesting the cancellation.',
	'Erreur lors du retrait de la demande.': 'Error while withdrawing the request.',
	'Erreur lors de la contre-proposition.': 'Error while counter-offering.',
	'Erreur lors de la déclaration du gage.': 'Error while reporting the forfeit.',
	'Erreur lors de la confirmation.': 'Error while confirming.',
	'Erreur lors du refus.': 'Error while refusing.',
	'Erreur lors du marquage gage non tenu.': 'Error while marking the forfeit as not done.',
	'Erreur upload : {message}': 'Upload error: {message}',
	"Erreur lors de l'upload : {message}": 'Upload error: {message}',
	'Erreur inattendue lors de la liaison Google.': 'Unexpected error while linking Google.',
	'Erreur lors de la mise à jour.': 'Error while updating.',
	'Erreur lors de la suppression.': 'Error while deleting.',

	// Groupes / membres / invitations
	'Seul un admin peut renommer le groupe.': 'Only an admin can rename the group.',
	'Seul un admin peut supprimer le groupe.': 'Only an admin can delete the group.',
	'Seul un admin peut exclure un membre.': 'Only an admin can remove a member.',
	"Impossible d'exclure un admin.": 'Cannot remove an admin.',
	'Vous êtes le dernier admin. Promouvez un autre membre avant de quitter.':
		'You are the last admin. Promote another member before leaving.',
	'Ce membre est déjà admin.': 'This member is already an admin.',
	"Vous n'avez pas le droit de générer des invitations.":
		'You are not allowed to generate invitations.',
	'Le nom doit faire au moins 2 caractères': 'The name must be at least 2 characters',
	'Le nom doit faire au moins 2 caractères.': 'The name must be at least 2 characters.',
	'Le nom ne peut pas dépasser 50 caractères': 'The name cannot exceed 50 characters',
	'Le nom ne peut pas dépasser 50 caractères.': 'The name cannot exceed 50 characters.',
	'La description ne peut pas dépasser 500 caractères':
		'The description cannot exceed 500 characters',
	'Le nom saisi ne correspond pas au nom du groupe.':
		'The entered name does not match the group name.',
	'Le pseudo doit faire au moins 2 caractères': 'The username must be at least 2 characters',
	'Le pseudo ne peut pas dépasser 30 caractères': 'The username cannot exceed 30 characters',
	'Aucun fichier reçu.': 'No file received.',
	"L'image ne doit pas dépasser 2 Mo.": 'The image must not exceed 2 MB.',
	'La preuve ne doit pas dépasser 10 Mo.': 'The proof must not exceed 10 MB.',

	// Paris
	"L'estimation est obligatoire.": 'The estimate is required.',
	'Le titre est obligatoire.': 'The title is required.',
	'Le choix A est obligatoire.': 'Choice A is required.',
	'Le choix B est obligatoire.': 'Choice B is required.',
	'La cible est obligatoire.': 'The target is required.',
	'Les deux choix doivent être différents.': 'The two choices must be different.',
	'La mise du créateur doit être supérieure à 0.': "The creator's stake must be greater than 0.",
	'La mise de la cible doit être supérieure à 0.': "The target's stake must be greater than 0.",
	'La mise des adversaires doit être supérieure à 0.':
		"The opponents' stake must be greater than 0.",
	'Le gage du créateur est obligatoire.': "The creator's forfeit is required.",
	'Le gage de la cible est obligatoire.': "The target's forfeit is required.",
	'Le gage des adversaires est obligatoire.': "The opponents' forfeit is required.",
	'Le montant doit être supérieur à 0.': 'The amount must be greater than 0.',
	'La description du gage est obligatoire.': 'The forfeit description is required.',
	'Le périmètre du gage est obligatoire.': 'The forfeit scope is required.',
	'La date limite doit être dans le futur.': 'The deadline must be in the future.',
	"Le nombre max d'adversaires est obligatoire.": 'The maximum number of opponents is required.',
	"Le nombre max d'adversaires doit être au moins 1.":
		'The maximum number of opponents must be at least 1.',
	'Le défi doit être visible par au moins un autre membre.':
		'The challenge must be visible to at least one other member.',
	'Vous ne pouvez pas vous défier vous-même.': 'You cannot challenge yourself.',
	"La cible sélectionnée n'est pas un membre actif du groupe.":
		'The selected target is not an active member of the group.',
	'UUID juré invalide.': 'Invalid juror UUID.',
	'Le jury doit avoir au moins un membre.': 'The jury must have at least one member.',
	'Un ou plusieurs jurés sont invalides.': 'One or more jurors are invalid.',
	'Un ou plusieurs membres de visibilité sont invalides.':
		'One or more visibility members are invalid.',
	'Ce pari nest pas un pari au plus proche.': 'This bet is not a closest-guess bet.',
	'Ce pari nest pas un duel Oui/Non.': 'This bet is not a Yes/No duel.',
	"Ce pari n'est pas un défi ouvert.": 'This bet is not an open challenge.',
	'Aucun match associe a ce pari.': 'No match linked to this bet.',
	'Aucun match associé à ce pari.': 'No match linked to this bet.',
	'Seuls les participants peuvent soumettre au jury.': 'Only participants can submit to the jury.',
	'Verdict invalide.': 'Invalid verdict.',
	'Vous devez sélectionner au moins un gagnant.': 'You must select at least one winner.',
	'Un seul gagnant possible pour un duel Oui/Non.': 'Only one winner allowed for a Yes/No duel.',
	'Ce pari est clôturé, il ne peut plus être accepté.':
		'This bet is closed, it can no longer be accepted.',
	'Le créateur ne peut pas accepter son propre défi.':
		'The creator cannot accept their own challenge.',
	'Données yesno introuvables.': 'Yes/No data not found.',
	"Vous n'êtes pas autorisé à accepter ce défi.": 'You are not allowed to accept this challenge.',
	'Vous avez déjà accepté ce défi.': 'You have already accepted this challenge.',
	"Ce défi est complet, le nombre maximum d'adversaires est atteint.":
		'This challenge is full, the maximum number of opponents is reached.',
	'Ce pari est clôturé, tu ne peux plus participer.': 'This bet is closed, you can no longer join.',
	'La date limite de participation est dépassée.': 'The participation deadline has passed.',
	'Ce pari est déjà soumis au jury ou clôturé.':
		'This bet is already submitted to the jury or closed.',
	'Ce pari est déjà soumis au jury.': 'This bet is already submitted to the jury.',
	"L'annulation n'est pas possible sur un match résolu ou déjà annulé.":
		'Cancellation is not possible on a resolved or already cancelled match.',
	"L'annulation unanime n'est possible que sur un match en cours ou en jugement.":
		'Unanimous cancellation is only possible on an open or judging match.',
	"Vous n'êtes pas participant de ce match.": 'You are not a participant of this match.',
	'Ce match est déjà annulé, le retrait est impossible.':
		'This match is already cancelled, withdrawal is impossible.',
	"Le retrait n'est possible que sur un match en cours ou en jugement.":
		'Withdrawal is only possible on an open or judging match.',
	"Erreur lors du retrait de la demande d'annulation.":
		'Error while withdrawing the cancellation request.',

	// Jury
	'Ce match nest pas en phase de jugement.': 'This match is not in the judging phase.',
	"Vous n'êtes pas juré de ce match.": 'You are not a juror of this match.',
	'Un ou plusieurs gagnants sélectionnés ne sont pas des participants.':
		'One or more selected winners are not participants.',
	'Le perdant sélectionné nest pas un participant de ce match.':
		'The selected loser is not a participant of this match.',
	'Erreur lors de lenregistrement du vote.': 'Error while saving the vote.',

	// Propositions
	"Cette proposition n'est plus en cours de négociation.":
		'This proposition is no longer being negotiated.',
	'Cette proposition a expiré.': 'This proposition has expired.',
	'Vous avez déjà fait la dernière offre. Attendez la réponse de votre adversaire.':
		"You already made the last offer. Wait for your opponent's answer.",
	'Vous avez déjà fait la dernière offre. Seule la cible peut refuser en ce moment.':
		'You already made the last offer. Only the target can refuse right now.',
	"Le nombre maximum d'adversaires est atteint.": 'The maximum number of opponents is reached.',
	'La proposition a déjà été traitée (race condition).':
		'This proposition has already been handled (race condition).',
	'Cette proposition ne peut plus être annulée.': 'This proposition can no longer be cancelled.',
	'Seul le créateur du pari peut annuler la proposition.':
		'Only the creator of the bet can cancel the proposition.',

	// Ardoise / gages
	'Seul le créancier peut marquer une dette comme réglée.':
		'Only the creditor can mark a debt as settled.',
	"Cette dette n'existe pas ou est déjà réglée.": 'This debt does not exist or is already settled.',
	"Vous n'êtes pas le débiteur de ce gage.": 'You are not the debtor of this forfeit.',
	"Vous n'êtes pas gagnant de ce pari.": 'You are not a winner of this bet.',
	"Ce gage n'est plus en attente.": 'This forfeit is no longer pending.',
	"Le débiteur n'a pas encore déclaré avoir fait son gage.":
		'The debtor has not yet reported their forfeit as done.',
	'Ce gage ne peut plus être modifié.': 'This forfeit can no longer be modified.',

	// Auth / comptes
	'Adresse email invalide': 'Invalid email address',
	'Mot de passe requis': 'Password is required',
	'Mot de passe requis.': 'Password is required.',
	'Identifiants incorrects. Vérifiez votre email et mot de passe.':
		'Incorrect email or password. Please check your details.',
	'Le mot de passe doit faire au moins 8 caractères': 'The password must be at least 8 characters',
	'Le mot de passe est trop long': 'The password is too long',
	'Les mots de passe ne correspondent pas': 'The passwords do not match',
	'Impossible de mettre à jour le mot de passe. Le lien a peut-être expiré.':
		'Unable to update the password. The link may have expired.',
	'Le lien de réinitialisation est invalide ou expiré.': 'The reset link is invalid or expired.',
	'Vous devez être connecté pour rejoindre un groupe.': 'You must be logged in to join a group.',
	"Ce lien d'invitation est invalide, expiré ou épuisé.":
		'This invitation link is invalid, expired or used up.',
	'Impossible de créer une session invité. Veuillez réessayer.':
		'Unable to create a guest session. Please try again.',
	'Erreur lors de la création du profil. Veuillez réessayer.':
		'Error while creating the profile. Please try again.',
	'Ce compte est déjà sécurisé.': 'This account is already secured.',
	'Impossible de lier le compte. Veuillez réessayer.':
		'Unable to link the account. Please try again.',
	'Impossible de lier le compte Google.': 'Unable to link the Google account.'
} as const satisfies Record<string, string>;

export type ServerMessageKey = keyof typeof serverMessages;

/**
 * Localise un message issu de la logique serveur. Une chaîne inconnue est
 * renvoyée telle quelle (et détectée par l'audit de pureté linguistique).
 */
export function trServer(lang: Lang, key: string): string {
	if (lang !== 'en') return key;
	return (serverMessages as Record<string, string>)[key] ?? key;
}
