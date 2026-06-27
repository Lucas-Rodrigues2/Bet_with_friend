// ─── Notification types (shared client + server) ─────────────────────────────

export const NOTIFICATION_TYPES = [
	'invitation_accepted',
	'proposition_received',
	'counter_offer_received',
	'bet_submitted_to_jury',
	'jury_vote_requested',
	'verdict_rendered',
	'debt_created',
	'forfeit_to_do',
	'forfeit_to_confirm',
	'dispute_opened'
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationPayload {
	betId?: string;
	matchId?: string;
	groupId?: string;
	betTitle?: string;
	actorPseudo?: string;
}

export interface NotificationItem {
	id: string;
	type: NotificationType;
	payload: NotificationPayload;
	readAt: Date | null;
	createdAt: Date;
}

// ─── Label & href helpers ─────────────────────────────────────────────────────

export function getNotificationLabel(type: NotificationType, payload: NotificationPayload): string {
	const who = payload.actorPseudo ?? "Quelqu'un";
	const title = payload.betTitle ? `"${payload.betTitle}"` : 'un pari';
	switch (type) {
		case 'invitation_accepted':
			return `${who} a rejoint votre groupe`;
		case 'proposition_received':
			return `${who} vous défie sur ${title}`;
		case 'counter_offer_received':
			return `${who} vous propose de nouvelles conditions pour ${title}`;
		case 'bet_submitted_to_jury':
		case 'jury_vote_requested':
			return `Vote de juré requis pour ${title}`;
		case 'verdict_rendered':
			return `Verdict rendu pour ${title}`;
		case 'debt_created':
			return `Nouvelle dette pour ${title}`;
		case 'forfeit_to_do':
			return `Gage à effectuer pour ${title}`;
		case 'forfeit_to_confirm':
			return `Gage déclaré effectué pour ${title}`;
		case 'dispute_opened':
			return `Litige ouvert pour ${title}`;
		default:
			return 'Nouvelle notification';
	}
}

export function getNotificationHref(
	type: NotificationType,
	payload: NotificationPayload
): string | null {
	if (payload.groupId && payload.betId) {
		return `/app/groups/${payload.groupId}/bets/${payload.betId}`;
	}
	if (payload.groupId) {
		return `/app/groups/${payload.groupId}`;
	}
	return null;
}

export function parsePayload(raw: string | null | undefined): NotificationPayload {
	if (!raw) return {};
	try {
		return JSON.parse(raw) as NotificationPayload;
	} catch {
		return {};
	}
}
