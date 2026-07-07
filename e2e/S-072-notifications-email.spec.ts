/**
 * S-072 — Notifications email
 *
 * Critères d'acceptation :
 * 1. notify() envoie aussi un email aux destinataires dont la préférence email
 *    du type est activée : sujet + corps FR, lien profond vers la page concernée.
 * 2. Templates minimaux par thème (proposition, verdict, gage, ardoise).
 * 3. Échec d'envoi → loggé, n'empêche jamais l'action métier (envoi asynchrone
 *    best-effort après la transaction).
 * 4. En local, les mails sont capturés et consultables (Mailpit API).
 * 5. Footer : lien « gérer mes notifications » vers /app/settings/notifications.
 *
 * Scénarios E2E :
 * - Alice défie Bob (pref email activée par défaut) → Mailpit contient un mail
 *   pour bob@test.local avec le lien du duel + footer « gérer mes notifications ».
 * - Bob désactive l'email « proposition » → plus de mail au défi suivant, mais
 *   la notif in-app continue (vérifié en DB).
 * - Une action métier réussit même si l'envoi échoue : démontré via le chemin
 *   « aucun destinataire email » (l'action métier succeed quand même). La
 *   simulation d'un transport coupé n'est pas montable sans redémarrer le
 *   serveur dev (SMTP_HOST lu au démarrage via $env/dynamic/private) — documenté.
 */
import { test, expect, type Page } from '@playwright/test';
import postgres from 'postgres';
import { login } from './helpers/auth';
import { db } from './helpers/db';

// Connexion dédiée pour les assertions DB de ce spec.
const DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const dbOwn = postgres(DATABASE_URL, { max: 3 });

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;
const NEW_YESNO_URL = `${GROUP_URL}/bets/new/yesno`;
const PREFS_URL = '/app/settings/notifications';

const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const MAILPIT_BASE = 'http://127.0.0.1:54324';
const MANAGE_NOTIFS_PATH = '/app/settings/notifications';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function svelteFill(page: Page, testId: string, value: string): Promise<void> {
	await page.evaluate(
		([tid, val]) => {
			const el = document.querySelector(
				`[data-testid="${tid}"]`
			) as HTMLInputElement | HTMLTextAreaElement | null;
			if (el) {
				el.focus();
				const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
					el.tagName === 'TEXTAREA'
						? window.HTMLTextAreaElement.prototype
						: window.HTMLInputElement.prototype,
					'value'
				)?.set;
				if (nativeInputValueSetter) {
					nativeInputValueSetter.call(el, val);
				} else {
					el.value = val;
				}
				el.dispatchEvent(new Event('input', { bubbles: true }));
				el.dispatchEvent(new Event('change', { bubbles: true }));
			}
		},
		[testId, value]
	);
}

/** Crée un duel yesno Alice→Bob via le formulaire UI. */
async function createDuelForBob(
	page: Page,
	title: string
): Promise<{ betUrl: string; betId: string }> {
	await page.goto(NEW_YESNO_URL);
	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');
	await page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox').check();
	await svelteFill(page, 'input-title', title);
	await page.getByTestId('input-stake-creator').fill('10');
	await page.getByTestId('input-stake-target').fill('5');
	await page.waitForTimeout(100);
	await page.getByTestId('select-target').selectOption({ value: BOB_ID });
	await page.getByTestId('submit-btn').click();
	await expect(page).toHaveURL(
		new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`),
		{ timeout: 30_000 }
	);
	const betUrl = page.url();
	const betId = betUrl.split('/bets/')[1];
	return { betUrl, betId };
}

// ─── Mailpit helpers ──────────────────────────────────────────────────────────

interface MailpitMessageSummary {
	ID: string;
	From: { Address: string; Name: string };
	To: { Address: string; Name: string }[];
	Subject: string;
	Size: number;
}

interface MailpitMessageList {
	total: number;
	messages: MailpitMessageSummary[];
}

interface MailpitMessageDetail {
	ID: string;
	From: { Address: string; Name: string };
	To: { Address: string; Name: string }[];
	Subject: string;
	Text: string;
	HTML: string;
}

/** Vide toutes les boîtes Mailpit. */
async function clearMailpit(): Promise<void> {
	const res = await fetch(`${MAILPIT_BASE}/api/v1/messages`, { method: 'DELETE' });
	if (!res.ok) throw new Error(`Mailpit DELETE failed: ${res.status}`);
}

/** Liste les messages Mailpit (tous). */
async function listMailpitMessages(): Promise<MailpitMessageSummary[]> {
	const res = await fetch(`${MAILPIT_BASE}/api/v1/messages?limit=500`);
	if (!res.ok) throw new Error(`Mailpit GET failed: ${res.status}`);
	const data = (await res.json()) as MailpitMessageList;
	return data.messages ?? [];
}

/** Récupère le détail d'un message (Text + HTML). */
async function getMailpitMessage(id: string): Promise<MailpitMessageDetail> {
	const res = await fetch(`${MAILPIT_BASE}/api/v1/message/${id}`);
	if (!res.ok) throw new Error(`Mailpit GET message failed: ${res.status}`);
	return (await res.json()) as MailpitMessageDetail;
}

/**
 * Attend que Mailpit contienne au moins un message pour `toEmail` dont le sujet
 * contient `subjectMatch` (insensible à la casse). Retourne les messages matchés.
 */
async function waitForMailTo(
	toEmail: string,
	subjectMatch?: string,
	timeout = 15_000
): Promise<MailpitMessageDetail[]> {
	const toLower = toEmail.toLowerCase();
	const subjectLower = subjectMatch?.toLowerCase();
	const matched: MailpitMessageDetail[] = [];
	await expect
		.poll(
			async () => {
				const list = await listMailpitMessages();
				const candidates = list.filter((m) =>
					m.To.some((t) => t.Address.toLowerCase() === toLower)
				);
				let filtered = candidates;
				if (subjectLower) {
					filtered = candidates.filter((m) =>
						(m.Subject ?? '').toLowerCase().includes(subjectLower)
					);
				}
				if (filtered.length > 0 && matched.length === 0) {
					for (const m of filtered) {
						matched.push(await getMailpitMessage(m.ID));
					}
				}
				return filtered.length;
			},
			{ timeout, intervals: [300, 600, 1000, 1500] }
		)
		.toBeGreaterThan(0);
	return matched;
}

/** Compte les messages Mailpit pour `toEmail` (filtre sujet optionnel). */
async function countMailTo(toEmail: string, subjectMatch?: string): Promise<number> {
	const toLower = toEmail.toLowerCase();
	const subjectLower = subjectMatch?.toLowerCase();
	const list = await listMailpitMessages();
	return list.filter((m) => {
		const toOk = m.To.some((t) => t.Address.toLowerCase() === toLower);
		if (!toOk) return false;
		if (subjectLower) {
			return (m.Subject ?? '').toLowerCase().includes(subjectLower);
		}
		return true;
	}).length;
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

/** Attend que la pref explicite (user, type, channel) atteigne la valeur attendue. */
async function waitForPref(
	userId: string,
	type: string,
	channel: string,
	enabled: boolean
): Promise<void> {
	await expect
		.poll(
			async () => {
				const rows = await dbOwn`
					SELECT enabled FROM public.notification_preferences
					WHERE user_id = ${userId} AND type = ${type} AND channel = ${channel}
				`;
				if (rows.length === 0) return null;
				return Boolean(rows[0].enabled);
			},
			{ timeout: 10_000, intervals: [200, 500, 1000] }
		)
		.toBe(enabled);
}

/** Force la pref (user, type, channel) à la valeur demandée en DB directe. */
async function setPref(
	userId: string,
	type: string,
	channel: string,
	enabled: boolean
): Promise<void> {
	await dbOwn`
		INSERT INTO public.notification_preferences (user_id, type, channel, enabled, updated_at)
		VALUES (${userId}, ${type}, ${channel}, ${enabled}, NOW())
		ON CONFLICT (user_id, type, channel) DO UPDATE
		SET enabled = ${enabled}, updated_at = NOW()
	`;
}

/** Compte les notifications d'un user pour un type donné dont le payload matche. */
async function countNotifs(userId: string, type: string, payloadLike: string): Promise<number> {
	const rows = await dbOwn`
		SELECT COUNT(*)::int AS n FROM public.notifications
		WHERE user_id = ${userId} AND type = ${type} AND payload LIKE ${'%' + payloadLike + '%'}
	`;
	return Number(rows[0].n);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function resetPrefs() {
	try {
		await dbOwn`DELETE FROM public.notification_preferences
			WHERE user_id IN (${ALICE_ID}, ${BOB_ID}, ${CAROL_ID})`;
	} catch {
		// ignore
	}
}

async function cleanBetsAndNotifs() {
	try {
		await dbOwn`DELETE FROM public.notifications WHERE payload LIKE '%[E2E] S072%'`;
	} catch {
		// ignore
	}
	try {
		await dbOwn`
			DELETE FROM public.ledger_entries WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E] S072%'
			)
		`;
	} catch {
		// ignore
	}
	try {
		await dbOwn`DELETE FROM public.bets WHERE title LIKE '[E2E] S072%'`;
	} catch {
		// ignore
	}
}

test.beforeEach(async () => {
	await resetPrefs();
	await cleanBetsAndNotifs();
	await clearMailpit();
});

test.afterEach(async () => {
	await resetPrefs();
	await cleanBetsAndNotifs();
	await clearMailpit();
});

test.afterAll(async () => {
	await dbOwn.end();
});

// ─── Scénario 1 : Alice défie Bob → Mailpit contient un mail avec lien duel ─

test('Alice défie Bob (pref email activée par défaut) → Mailpit contient un mail pour bob@test.local avec le lien du duel + footer gérer notifications', async ({
	browser
}) => {
	// Bob a la pref email activée par défaut pour proposition_received (type important).
	// (beforeEach a supprimé les surcharges → défauts appliqués.)

	// Alice crée le duel pour Bob.
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const title = '[E2E] S072 Mail défi Alice Bob';
	const { betId } = await createDuelForBob(alicePage, title);
	await aliceCtx.close();

	// Mailpit doit contenir un mail pour bob@test.local avec un sujet contenant le titre.
	const mails = await waitForMailTo('bob@test.local', title);
	expect(mails.length).toBeGreaterThanOrEqual(1);

	const mail = mails[0];
	// Expéditeur configuré (EMAIL_FROM).
	expect(mail.From.Address).toBe('noreply@betwithfriend.app');
	// Sujet FR préfixé marque + libellé.
	expect(mail.Subject).toMatch(/Bet With Friend/);
	expect(mail.Subject.toLowerCase()).toContain('défie');
	expect(mail.Subject).toContain(title);

	// Le corps contient le lien profond vers le duel (URL absolue avec betId).
	const bodyConcat = `${mail.Text}\n${mail.HTML}`;
	expect(bodyConcat).toContain(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`);
	expect(bodyConcat).toMatch(/http:\/\/localhost:5173/);

	// Footer : lien « gérer mes notifications » vers /app/settings/notifications.
	expect(bodyConcat.toLowerCase()).toMatch(/gérer vos notifications/);
	expect(bodyConcat).toContain(`${MANAGE_NOTIFS_PATH}`);
	// Le HTML contient un <a href> vers la page de gestion.
	expect(mail.HTML).toMatch(
		new RegExp(`href="[^"]*${MANAGE_NOTIFS_PATH.replace(/\//g, '\\/')}"`)
	);

	// Pas d'email envoyé à Alice (elle est l'émettrice, pas destinataire).
	const aliceCount = await countMailTo('alice@test.local', title);
	expect(aliceCount).toBe(0);
});

// ─── Scénario 2 : Bob désactive l'email proposition → plus de mail, in-app OK ─

test('Bob désactive l\'email « proposition » → plus de mail au défi suivant, mais notif in-app continue', async ({
	browser
}) => {
	// === Bob désactive l'email pour proposition_received (in-app reste activé) ===
	await setPref(BOB_ID, 'proposition_received', 'email', false);
	await waitForPref(BOB_ID, 'proposition_received', 'email', false);

	// Vérif défense : in_app reste activé (pas de surcharge in_app → défaut true).
	const inAppRows = await dbOwn`
		SELECT enabled FROM public.notification_preferences
		WHERE user_id = ${BOB_ID} AND type = 'proposition_received' AND channel = 'in_app'
	`;
	// Pas de ligne explicite → défaut true appliqué.
	expect(inAppRows.length).toBe(0);

	// Alice crée un duel pour Bob.
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const title = '[E2E] S072 Mail désactivé';
	await createDuelForBob(alicePage, title);
	await aliceCtx.close();

	// Attendre un peu pour laisser le temps à l'envoi détaché (setImmediate).
	// On confirme qu'aucun mail n'arrive : on attend un court délai puis on vérifie.
	await page_wait(2000);
	const bobMails = await countMailTo('bob@test.local', title);
	expect(bobMails).toBe(0);

	// Mais la notification in-app a bien été insérée pour Bob.
	const notifCount = await countNotifs(BOB_ID, 'proposition_received', title);
	expect(notifCount).toBe(1);

	// === Bob réactive l'email → un mail arrive au défi suivant ===
	await setPref(BOB_ID, 'proposition_received', 'email', true);
	await waitForPref(BOB_ID, 'proposition_received', 'email', true);

	const aliceCtx2 = await browser.newContext();
	const alicePage2 = await aliceCtx2.newPage();
	await login(alicePage2, 'alice');
	const title2 = '[E2E] S072 Mail réactivé';
	await createDuelForBob(alicePage2, title2);
	await aliceCtx2.close();

	const mails2 = await waitForMailTo('bob@test.local', title2);
	expect(mails2.length).toBeGreaterThanOrEqual(1);
	const notifCount2 = await countNotifs(BOB_ID, 'proposition_received', title2);
	expect(notifCount2).toBe(1);
});

// ─── Scénario 3 : Action métier réussit même si l'envoi email est sans effet ─

test('Action métier réussit même quand aucun destinataire email ne recevra de mail (canal email best-effort détaché)', async ({
	browser
}) => {
	// Désactive l'email « proposition_received » pour Bob (le seul destinataire).
	await setPref(BOB_ID, 'proposition_received', 'email', false);
	await waitForPref(BOB_ID, 'proposition_received', 'email', false);

	// Alice crée le duel : l'action métier doit réussir (page du pari affichée),
	// malgré l'absence d'envoi email. Le canal email étant détaché (setImmediate)
	// et best-effort, aucune erreur ne doit remonter jusqu'à l'action.
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const title = '[E2E] S072 Action ok sans email';
	const { betId } = await createDuelForBob(alicePage, title);
	expect(betId).toBeTruthy();

	// Le pari a bien été créé en DB.
	const betRows = await dbOwn`SELECT id FROM public.bets WHERE id = ${betId}`;
	expect(betRows.length).toBe(1);

	// La notif in-app a bien été insérée (canal in_app indépendant du canal email).
	const notifCount = await countNotifs(BOB_ID, 'proposition_received', title);
	expect(notifCount).toBe(1);

	// Aucun mail envoyé (canal email sans destinataire → retourne tôt).
	await page_wait(2000);
	const bobMails = await countMailTo('bob@test.local', title);
	expect(bobMails).toBe(0);

	await aliceCtx.close();
});

// ─── Scénario 4 : Footer « gérer mes notifications » présent dans tout mail ──

test('Le footer du mail contient le lien « gérer mes notifications » vers /app/settings/notifications', async ({
	browser
}) => {
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const title = '[E2E] S072 Footer lien gestion';
	await createDuelForBob(alicePage, title);
	await aliceCtx.close();

	const mails = await waitForMailTo('bob@test.local', title);
	expect(mails.length).toBeGreaterThanOrEqual(1);
	const mail = mails[0];

	// Texte : « Gérer vos notifications : <url absolue vers /app/settings/notifications> »
	expect(mail.Text.toLowerCase()).toMatch(/gérer vos notifications/);
	expect(mail.Text).toContain(`${MANAGE_NOTIFS_PATH}`);

	// HTML : un <a href> pointant vers la page de gestion.
	expect(mail.HTML).toMatch(
		new RegExp(`href="[^"]*${MANAGE_NOTIFS_PATH.replace(/\//g, '\\/')}"`)
	);
	// L'URL absolue contient bien l'origin PUBLIC_SITE_URL.
	expect(mail.HTML).toMatch(new RegExp(`http://localhost:5173${MANAGE_NOTIFS_PATH}`));
});

// ─── Utilitaire local (pas importé globalement pour ne pas polluer) ──────────

/** Petite sleep utilitaire pour laisser le temps à l'envoi détaché. */
async function page_wait(ms: number): Promise<void> {
	await new Promise((r) => setTimeout(r, ms));
}
