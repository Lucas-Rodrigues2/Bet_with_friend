/**
 * S-073 — Web push
 *
 * Critères d'acceptation :
 * 1. Bouton « Activer les notifications push sur cet appareil » → permission
 *    navigateur → abonnement enregistré (ligne push_subscriptions créée).
 * 2. notify() envoie le push aux abonnements des destinataires dont la pref
 *    push du type est activée (titre / corps / lien profond).
 * 3. Cliquer la notification système ouvre/focalise l'app (non assertable en
 *    E2E — le rendu natif ne l'est pas ; on valide le pipeline serveur).
 * 4. Désactivation possible (« cet appareil » → unsubscribe + suppression).
 * 5. Endpoint mort (410/404 du push service) → ligne supprimée, pas d'erreur.
 * 6. Colonne « push » de la matrice pleinement active.
 *
 * Scénarios E2E :
 * - Bob active le push (permissions granted, contexte non-incognito) → ligne
 *   push_subscriptions créée (vérif DB).
 * - Bob désactive le push → ligne supprimée.
 * - Émission d'un événement déclenchant un push → event notification_push_sent
 *   OU notification_push_failed écrit (pipeline best-effort, pas d'erreur serveur).
 * - Endpoint mort (410 du push service) → ligne supprimée + notification_push_failed(endpoint_gone).
 * - Pref push désactivée → aucun event push pour ce user/type.
 *
 * Note : le rendu de la notif système native n'est pas assertable par Playwright.
 * On valide le pipeline serveur (DB row + tracking PostHog) sans dépendre du
 * rendu navigateur.
 *
 * Note env : l'API Push est bloquée par Chromium en mode headless et en contexte
 * incognito. Les tests UI de souscription/désabonnement utilisent un contexte
 * persistant headed (helper `launchHeadedPushContext` qui démarre Xvfb au besoin).
 * Les tests de pipeline serveur (fake subs en DB) n'ont pas besoin de navigateur
 * push : on insère des abonnements avec des clés ECDH P-256 valides générées
 * côté test, de façon à ce que web-push chiffre réellement le payload et atteigne
 * le push service (sinon erreur de chiffrement → send_failed, sans déclencher
 * le nettoyage endpoint_gone).
 */
import { test, expect, type Page } from '@playwright/test';
import postgres from 'postgres';
import crypto from 'node:crypto';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { clearServerEvents } from './helpers/analytics';
import { launchHeadedPushContext, closeHeadedPushContext } from './helpers/headed-push';

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

// Endpoint « mort » : faux token FCM → le push service renvoie 410 (Gone) →
// endpoint_gone → ligne supprimée. Nécessite des clés ECDH valides pour que
// web-push chiffre le payload et atteigne réellement le push service.
const DEAD_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/FAKE_TOKEN_S073_DEAD_GONE';

// ─── Helpers (identiques au pattern S-072) ────────────────────────────────────

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

async function createDuelForBob(page: Page, title: string): Promise<void> {
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
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function countPushSubsForUser(userId: string): Promise<number> {
	const rows = await dbOwn`SELECT COUNT(*)::int AS n
		FROM public.push_subscriptions WHERE user_id = ${userId}`;
	return Number(rows[0].n);
}

/**
 * Insère un abonnement push fake avec des clés ECDH P-256 VALIDES générées
 * côté test, de façon à ce que web-push puisse chiffrer le payload et atteindre
 * réellement le push service (sinon erreur de chiffrement → send_failed, sans
 * déclencher le nettoyage endpoint_gone).
 */
async function insertValidFakeSub(userId: string, endpoint: string): Promise<void> {
	const ecdh = crypto.createECDH('prime256v1');
	ecdh.generateKeys();
	const p256dh = ecdh.getPublicKey().toString('base64url');
	const auth = crypto.randomBytes(16).toString('base64url');
	await dbOwn`
		INSERT INTO public.push_subscriptions (user_id, endpoint, keys, created_at)
		VALUES (
			${userId},
			${endpoint},
			${JSON.stringify({ p256dh, auth })}::jsonb,
			NOW()
		)
		ON CONFLICT (endpoint) DO UPDATE SET keys = EXCLUDED.keys, created_at = NOW()
	`;
}

async function deleteAllPushSubsForUsers(...userIds: string[]): Promise<void> {
	if (userIds.length === 0) return;
	await dbOwn`DELETE FROM public.push_subscriptions WHERE user_id IN ${dbOwn(userIds)}`;
}

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

async function resetPrefs(...userIds: string[]): Promise<void> {
	if (userIds.length === 0) return;
	try {
		await dbOwn`DELETE FROM public.notification_preferences WHERE user_id IN ${dbOwn(userIds)}`;
	} catch {
		// ignore
	}
}

async function cleanBetsAndNotifs(tag: string): Promise<void> {
	try {
		await dbOwn`DELETE FROM public.notifications WHERE payload LIKE ${'%' + tag + '%'}`;
	} catch {
		// ignore
	}
	try {
		await dbOwn`
			DELETE FROM public.ledger_entries WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE ${'%' + tag + '%'}
			)
		`;
	} catch {
		// ignore
	}
	try {
		await dbOwn`DELETE FROM public.bets WHERE title LIKE ${'%' + tag + '%'}`;
	} catch {
		// ignore
	}
}

async function wait(ms: number): Promise<void> {
	await new Promise((r) => setTimeout(r, ms));
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

test.beforeEach(async () => {
	await deleteAllPushSubsForUsers(BOB_ID);
	await resetPrefs(BOB_ID, ALICE_ID);
	await cleanBetsAndNotifs('[E2E] S073');
	await clearServerEvents(db);
});

test.afterEach(async () => {
	await deleteAllPushSubsForUsers(BOB_ID);
	await resetPrefs(BOB_ID, ALICE_ID);
	await cleanBetsAndNotifs('[E2E] S073');
	await clearServerEvents(db);
});

test.afterAll(async () => {
	await dbOwn.end();
});

// ─── Scénario 1 : Bob active le push → ligne push_subscriptions créée ────────

test('Bob active le push (permissions granted, contexte non-incognito) → ligne push_subscriptions créée et indicateur « activé sur cet appareil » affiché', async () => {
	// Contexte PERSISTANT headed (l'API Push est bloquée en incognito/headless).
	const headed = await launchHeadedPushContext();
	const page = headed.context.pages()[0] ?? (await headed.context.newPage());
	try {
		await login(page, 'bob');
		await page.goto(PREFS_URL);

		// Le bouton « Activer » doit être présent (push supporté + non actif).
		const enableBtn = page.getByTestId('enable-push-btn');
		await expect(enableBtn).toBeVisible({ timeout: 10_000 });

		await enableBtn.click();

		// Ligne push_subscriptions créée pour Bob (vérif DB, polling car asynchrone).
		await expect
			.poll(async () => await countPushSubsForUser(BOB_ID), {
				timeout: 25_000,
				intervals: [400, 800, 1500]
			})
			.toBeGreaterThanOrEqual(1);

		// L'indicateur « activé sur cet appareil » s'affiche après invalidation.
		await expect(page.getByTestId('push-active-indicator')).toBeVisible({ timeout: 10_000 });
	} finally {
		await closeHeadedPushContext(headed);
	}
});

// ─── Scénario 2 : Bob désactive le push → ligne supprimée ─────────────────────

test('Bob désactive le push (bouton « cet appareil ») → ligne push_subscriptions supprimée', async () => {
	const headed = await launchHeadedPushContext();
	const page = headed.context.pages()[0] ?? (await headed.context.newPage());
	try {
		await login(page, 'bob');
		await page.goto(PREFS_URL);
		await page.getByTestId('enable-push-btn').click();

		await expect
			.poll(async () => await countPushSubsForUser(BOB_ID), {
				timeout: 25_000,
				intervals: [400, 800, 1500]
			})
			.toBeGreaterThanOrEqual(1);

		// Maintenant désactiver.
		await page.getByTestId('disable-push-btn').click();

		// La ligne doit être supprimée côté serveur.
		await expect
			.poll(async () => await countPushSubsForUser(BOB_ID), {
				timeout: 15_000,
				intervals: [300, 600, 1000]
			})
			.toBe(0);

		// Le bouton « Activer » réapparaît (plus d'abonnement sur cet appareil).
		await expect(page.getByTestId('enable-push-btn')).toBeVisible({ timeout: 10_000 });
	} finally {
		await closeHeadedPushContext(headed);
	}
});

// ─── Scénario 3 : Émission d'un événement → pipeline push exécuté sans erreur ─

test('Émission d\'un événement déclenchant un push → event notification_push_sent ou notification_push_failed écrit (pipeline best-effort, pas d\'erreur serveur)', async ({
	browser
}) => {
	// Abonnement fake pour Bob avec clés ECDH valides → le push atteint vraiment
	// le push service (FCM renvoie 410 pour un token fake) → endpoint_gone →
	// notification_push_failed écrit. L'important : le pipeline ne plante pas et
	// un event est émis. proposition_received est un type « important » → push
	// activé par défaut.
	await insertValidFakeSub(BOB_ID, DEAD_ENDPOINT);

	// Alice crée un duel pour Bob → déclenche notify(['bob'], 'proposition_received').
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await createDuelForBob(alicePage, '[E2E] S073 pipeline push');
	await aliceCtx.close();

	// L'event push (sent ou failed) doit être écrit dans analytics_events_test
	// pour Bob (distinct_id = bob.id). L'important : le pipeline ne plante pas.
	await expect
		.poll(
			async () => {
				const sent = await dbOwn`
					SELECT COUNT(*)::int AS n FROM public.analytics_events_test
					WHERE event = 'notification_push_sent' AND distinct_id = ${BOB_ID}
				`;
				const failed = await dbOwn`
					SELECT COUNT(*)::int AS n FROM public.analytics_events_test
					WHERE event = 'notification_push_failed' AND distinct_id = ${BOB_ID}
				`;
				return Number(sent[0].n) + Number(failed[0].n);
			},
			{ timeout: 15_000, intervals: [300, 600, 1000, 1500] }
		)
		.toBeGreaterThanOrEqual(1);

	// Vérifie que l'event porte bien la notification_type (peu importe sent/failed).
	const evRows = await dbOwn`
		SELECT event, properties FROM public.analytics_events_test
		WHERE event IN ('notification_push_sent', 'notification_push_failed')
		AND distinct_id = ${BOB_ID}
	`;
	expect(evRows.length).toBeGreaterThanOrEqual(1);
	const props = evRows[0].properties as Record<string, unknown>;
	expect(props['notification_type']).toBe('proposition_received');
});

// ─── Scénario 4 : Endpoint mort (410) → ligne supprimée ───────────────────────

test('Endpoint mort (410 du push service) → ligne push_subscriptions supprimée + notification_push_failed(endpoint_gone)', async ({
	browser
}) => {
	// Abonnement dont l'endpoint renvoie 410 (token fake FCM, clés valides).
	await insertValidFakeSub(BOB_ID, DEAD_ENDPOINT);
	expect(await countPushSubsForUser(BOB_ID)).toBe(1);

	// Alice déclenche une notif pour Bob.
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await createDuelForBob(alicePage, '[E2E] S073 endpoint mort');
	await aliceCtx.close();

	// La ligne doit être supprimée (endpoint_gone → deletePushSubscriptionByEndpoint).
	await expect
		.poll(async () => await countPushSubsForUser(BOB_ID), {
			timeout: 15_000,
			intervals: [300, 600, 1000, 1500]
		})
		.toBe(0);

	// L'event notification_push_failed avec error_code = endpoint_gone est écrit.
	await expect
		.poll(
			async () => {
				const rows = await dbOwn`
					SELECT properties FROM public.analytics_events_test
					WHERE event = 'notification_push_failed' AND distinct_id = ${BOB_ID}
				`;
				return rows.filter(
					(r: { properties: Record<string, unknown> }) =>
						r.properties?.['error_code'] === 'endpoint_gone'
				).length;
			},
			{ timeout: 10_000, intervals: [300, 600, 1000] }
		)
		.toBeGreaterThanOrEqual(1);
});

// ─── Scénario 5 : Pref push désactivée → pas d'envoi push ────────────────────

test('Préférence push désactivée pour le type → aucun event push émis pour ce destinataire', async ({
	browser
}) => {
	// Abonnement présent MAIS pref push désactivée pour proposition_received.
	await insertValidFakeSub(BOB_ID, DEAD_ENDPOINT);
	await setPref(BOB_ID, 'proposition_received', 'push', false);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await createDuelForBob(alicePage, '[E2E] S073 pref push off');
	await aliceCtx.close();

	// Laisser le temps à l'envoi détaché (setImmediate) de s'exécuter.
	await wait(3000);

	// Aucun event push (sent ou failed) pour Bob.
	const pushEvents = await dbOwn`
		SELECT COUNT(*)::int AS n FROM public.analytics_events_test
		WHERE event IN ('notification_push_sent', 'notification_push_failed')
		AND distinct_id = ${BOB_ID}
	`;
	expect(Number(pushEvents[0].n)).toBe(0);

	// La ligne push_subscriptions n'est PAS supprimée (aucun envoi tenté).
	expect(await countPushSubsForUser(BOB_ID)).toBe(1);
});

// ─── Scénario 6 : colonne « push » active dans la matrice (CA #6) ─────────────

test('La colonne « push » de la matrice de préférences est active (cases cochables, plus de badge « bientôt »)', async ({
	browser
}) => {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await login(page, 'alice');
	await page.goto(PREFS_URL);

	// Au moins une case à cocher push existe et n'est pas désactivée.
	const firstPushCheckbox = page
		.locator('[data-testid^="notif-checkbox-"][data-testid$="-push"]')
		.first();
	await expect(firstPushCheckbox).toBeVisible();
	await expect(firstPushCheckbox).not.toBeDisabled();

	// Aucun message « bientôt » sur la colonne push.
	await expect(page.getByText(/bientôt/i)).toHaveCount(0);

	await ctx.close();
});
