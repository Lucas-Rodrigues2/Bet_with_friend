import {
	getNotificationHref,
	type NotificationPayload,
	type NotificationType
} from '$lib/notifications';

// ─── Email templates ──────────────────────────────────────────────────────────
//
// Templates minimaux par thème : un corps de texte propre au type d'événement
// + un appel à l'action (lien profond vers la page concernée) + un footer
// « gérer mes notifications ». Texte simple + HTML léger, sujet en français.

const MANAGE_NOTIFS_PATH = '/app/settings/notifications';

export interface EmailTemplate {
	subject: string;
	text: string;
	html: string;
}

/** Construit l'URL absolue d'un lien profond à partir d'un origin et d'un path. */
function absoluteUrl(origin: string, path: string): string {
	return `${origin.replace(/\/$/, '')}${path}`;
}

/** Construit le lien profond vers la page concernée par la notif, ou null. */
export function deepLinkFor(
	type: NotificationType,
	payload: NotificationPayload,
	origin: string
): string | null {
	const href = getNotificationHref(type, payload);
	if (!href) return null;
	return absoluteUrl(origin, href);
}

/** Sujet FR (préfixe marque + libellé court). */
function subjectFor(type: NotificationType, payload: NotificationPayload): string {
	const label = shortLabel(type, payload);
	return `[Bet With Friend] ${label}`;
}

/** Libellé court pour le sujet. */
function shortLabel(type: NotificationType, payload: NotificationPayload): string {
	const who = payload.actorPseudo ?? 'Quelqu’un';
	const title = payload.betTitle ?? 'un pari';
	switch (type) {
		case 'invitation_accepted':
			return `${who} a rejoint votre groupe`;
		case 'proposition_received':
			return `${who} vous défie sur « ${title} »`;
		case 'counter_offer_received':
			return `${who} vous propose de nouvelles conditions`;
		case 'bet_submitted_to_jury':
			return `Pari soumis au jury : « ${title} »`;
		case 'jury_vote_requested':
			return `Vote de juré requis pour « ${title} »`;
		case 'verdict_rendered':
			return `Verdict rendu pour « ${title} »`;
		case 'debt_created':
			return `Nouvelle dette pour « ${title} »`;
		case 'forfeit_to_do':
			return `Gage à effectuer pour « ${title} »`;
		case 'forfeit_to_confirm':
			return `Gage à confirmer pour « ${title} »`;
		case 'dispute_opened':
			return `Litige ouvert pour « ${title} »`;
		default:
			return 'Nouvelle notification';
	}
}

/** Corps de texte propre au type d'événement. */
function bodyFor(type: NotificationType, payload: NotificationPayload): string {
	const who = payload.actorPseudo ?? 'Quelqu’un';
	const title = payload.betTitle ?? 'un pari';
	switch (type) {
		case 'invitation_accepted':
			return `${who} a rejoint votre groupe.`;
		case 'proposition_received':
			return `${who} vous défie sur le pari « ${title} ». À vous de jouer !`;
		case 'counter_offer_received':
			return `${who} vous propose de nouvelles conditions pour le pari « ${title} ».`;
		case 'bet_submitted_to_jury':
			return `Le pari « ${title} » a été soumis au jury. Votre vote est attendu.`;
		case 'jury_vote_requested':
			return `Votre vote de juré est requis pour le pari « ${title} ».`;
		case 'verdict_rendered':
			return `Le verdict a été rendu pour le pari « ${title} ». Consultez le résultat.`;
		case 'debt_created':
			return `Une nouvelle dette a été enregistrée pour le pari « ${title} ».`;
		case 'forfeit_to_do':
			return `Vous avez un gage à effectuer pour le pari « ${title} ».`;
		case 'forfeit_to_confirm':
			return `Un gage a été déclaré effectué pour le pari « ${title} ». À vous de confirmer.`;
		case 'dispute_opened':
			return `Un litige a été ouvert pour le pari « ${title} ».`;
		default:
			return 'Vous avez une nouvelle notification sur Bet With Friend.';
	}
}

/** Libellé du bouton d'appel à l'action selon le type. */
function ctaLabel(type: NotificationType): string {
	switch (type) {
		case 'proposition_received':
		case 'counter_offer_received':
			return 'Voir le pari';
		case 'bet_submitted_to_jury':
		case 'jury_vote_requested':
			return 'Voter';
		case 'verdict_rendered':
			return 'Voir le verdict';
		case 'debt_created':
			return 'Voir l’ardoise';
		case 'forfeit_to_do':
		case 'forfeit_to_confirm':
			return 'Voir le gage';
		case 'dispute_opened':
			return 'Voir le litige';
		case 'invitation_accepted':
			return 'Voir le groupe';
		default:
			return 'Voir';
	}
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Rend le template (sujet + texte + HTML) pour une notification donnée.
 * `origin` = origine du site (ex. http://localhost:5173) pour les liens profonds.
 */
export function renderEmail(
	type: NotificationType,
	payload: NotificationPayload,
	origin: string
): EmailTemplate {
	const subject = subjectFor(type, payload);
	const body = bodyFor(type, payload);
	const link = deepLinkFor(type, payload, origin);
	const manageUrl = absoluteUrl(origin, MANAGE_NOTIFS_PATH);
	const cta = ctaLabel(type);

	// ── Texte simple ──
	const textParts: string[] = ['Bonjour,', '', body];
	if (link) textParts.push('', `${cta} : ${link}`);
	textParts.push('', '—', 'Gérer vos notifications : ' + manageUrl);
	const text = textParts.join('\n');

	// ── HTML léger ──
	const ctaBlock = link
		? `<p style="margin:24px 0;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#111827;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">${escapeHtml(cta)}</a></p>`
		: '';
	const html = `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;">
  <div style="max-width:560px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#18181b;">
    <p style="margin:0 0 12px;">Bonjour,</p>
    <p style="margin:0 0 12px;">${escapeHtml(body)}</p>
    ${ctaBlock}
    <hr style="margin:32px 0;border:none;border-top:1px solid #e4e4e7;" />
    <p style="margin:0;font-size:12px;color:#71717a;line-height:1.5;">
      Vous recevez cet email car les notifications email sont activées pour cet événement sur Bet With Friend.
      <br />Gérer vos notifications : <a href="${escapeHtml(manageUrl)}" style="color:#3f3f46;">${escapeHtml(manageUrl)}</a>
    </p>
  </div>
</body>
</html>`;

	return { subject, text, html };
}
