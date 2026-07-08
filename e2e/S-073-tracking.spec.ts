/**
 * S-073 — Tracking PostHog (web push)
 *
 * Events serveur instrumentés dans cette story :
 *   - push_subscription_created (form action subscribe_push)
 *     properties : { endpoint_domain } (hostname du push service, PAS l'endpoint
 *     complet qui est un identifiant). distinct_id = user.id.
 *   - push_subscription_removed (form action unsubscribe_push)
 *     properties : {} (aucune). distinct_id = user.id.
 *   - notification_push_sent (sendPushNotifications succès)
 *     properties : { notification_type }. distinct_id = destinataire user.id.
 *   - notification_push_failed (sendPushNotifications échec)
 *     properties : { notification_type, error_code }. distinct_id = user.id.
 *
 * Vérifie :
 *   1. push_subscription_created écrit avec endpoint_domain (hostname), sans
 *      endpoint complet ni PII ; distinct_id = user.id.
 *   2. push_subscription_removed écrit avec properties {} ; distinct_id = user.id.
 *   3. notification_push_failed écrit avec { notification_type, error_code } ;
 *      distinct_id = user.id, pas de PII. (via endpoint FCM fake → 410 → endpoint_gone)
 *   4. notification_push_sent écrit avec { notification_type } ; distinct_id =
 *      user.id, pas de PII. (via endpoint httpbin 200 + clés ECDH valides)
 *
 * Note env : les tests de souscription/désabonnement UI nécessitent un contexte
 * persistant headed (helper `launchHeadedPushContext`). Les tests de pipeline
 * utilisent des abonnements fake en DB avec clés ECDH P-256 valides générées
 * côté test, de façon à ce que web-push chiffre réellement le payload.
 */
import { test, expect, type Page } from '@playwright/test';
import postgres from 'postgres';
import crypto from 'node:crypto';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { readServerEvents, clearServerEvents } from './helpers/analytics';
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

// Endpoint qui répond 200 → sendPush renvoie code 'ok' → notification_push_sent.
// httpbin.org/status/200 renvoie 200 sur POST. Clés ECDH valides requises.
const OK_ENDPOINT = 'https://httpbin.org/status/200';

// Endpoint qui répond 410 → endpoint_gone → notification_push_failed(endpoint_gone).
const DEAD_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/FAKE_TOKEN_S073T_TRACKING_GONE';

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
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

test.beforeEach(async () => {
	await deleteAllPushSubsForUsers(BOB_ID);
	await resetPrefs(BOB_ID, ALICE_ID);
	await cleanBetsAndNotifs('[E2E] S073T');
	await clearServerEvents(db);
});

test.afterEach(async () => {
	await deleteAllPushSubsForUsers(BOB_ID);
	await resetPrefs(BOB_ID, ALICE_ID);
	await cleanBetsAndNotifs('[E2E] S073T');
	await clearServerEvents(db);
});

test.afterAll(async () => {
	await dbOwn.end();
});

// ─── Scénario 1 : push_subscription_created — endpoint_domain, pas de PII ─────

test('push_subscription_created — properties {endpoint_domain}, pas d\'endpoint complet ni PII, distinct_id = user.id', async () => {
	const headed = await launchHeadedPushContext();
	const page = headed.context.pages()[0] ?? (await headed.context.newPage());
	try {
		await login(page, 'bob');
		await page.goto(PREFS_URL);
		await page.getByTestId('enable-push-btn').click();

		// L'abonnement serveur doit être créé.
		await expect
			.poll(
				async () =>
					await dbOwn
						`SELECT COUNT(*)::int AS n FROM public.push_subscriptions WHERE user_id = ${BOB_ID}`
						.then((r) => Number(r[0].n)),
				{ timeout: 25_000, intervals: [400, 800, 1500] }
			)
			.toBeGreaterThanOrEqual(1);

		// L'event push_subscription_created est écrit pour Bob.
		await expect
			.poll(
				async () => {
					const evs = await readServerEvents(db, {
						event: 'push_subscription_created',
						distinctId: BOB_ID
					});
					return evs.length;
				},
				{ timeout: 10_000, intervals: [300, 600, 1000] }
			)
			.toBeGreaterThanOrEqual(1);

		const events = await readServerEvents(db, {
			event: 'push_subscription_created',
			distinctId: BOB_ID
		});
		const ev = events[events.length - 1];

		// distinct_id = user.id Supabase (UUID), pas d'email.
		expect(ev.distinct_id).toBe(BOB_ID);
		expect(ev.distinct_id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		);

		const props = ev.properties as Record<string, unknown>;
		// properties contient endpoint_domain (hostname), pas l'endpoint complet.
		expect(typeof props['endpoint_domain']).toBe('string');
		expect((props['endpoint_domain'] as string).length).toBeGreaterThan(0);
		// Pas de slash ni de query dans le domain (c'est un hostname).
		expect(props['endpoint_domain']).not.toMatch(/\//);

		// Pas d'endpoint complet, pas de PII (clés, email...).
		const serialized = JSON.stringify(props);
		expect(serialized).not.toMatch(/https?:\/\//); // pas d'URL complète
		expect(serialized).not.toMatch(/@/);
		expect(serialized).not.toMatch(/bob/i);
		expect(serialized).not.toMatch(/test\.local/i);
		expect(serialized).not.toMatch(/p256dh|auth/i);
	} finally {
		await closeHeadedPushContext(headed);
	}
});

// ─── Scénario 2 : push_subscription_removed — properties vides ────────────────

test('push_subscription_removed — properties {} (aucune), distinct_id = user.id', async () => {
	const headed = await launchHeadedPushContext();
	const page = headed.context.pages()[0] ?? (await headed.context.newPage());
	try {
		await login(page, 'bob');
		await page.goto(PREFS_URL);
		await page.getByTestId('enable-push-btn').click();

		await expect
			.poll(
				async () =>
					await dbOwn
						`SELECT COUNT(*)::int AS n FROM public.push_subscriptions WHERE user_id = ${BOB_ID}`
						.then((r) => Number(r[0].n)),
				{ timeout: 25_000, intervals: [400, 800, 1500] }
			)
			.toBeGreaterThanOrEqual(1);

		await page.getByTestId('disable-push-btn').click();

		// L'event push_subscription_removed est écrit.
		await expect
			.poll(
				async () => {
					const evs = await readServerEvents(db, {
						event: 'push_subscription_removed',
						distinctId: BOB_ID
					});
					return evs.length;
				},
				{ timeout: 10_000, intervals: [300, 600, 1000] }
			)
			.toBeGreaterThanOrEqual(1);

		const events = await readServerEvents(db, {
			event: 'push_subscription_removed',
			distinctId: BOB_ID
		});
		const ev = events[events.length - 1];

		expect(ev.distinct_id).toBe(BOB_ID);

		// properties vide (pas de PII, pas d'endpoint).
		const props = ev.properties as Record<string, unknown>;
		expect(Object.keys(props).length).toBe(0);
	} finally {
		await closeHeadedPushContext(headed);
	}
});

// ─── Scénario 3 : notification_push_failed — { notification_type, error_code } ─

test('notification_push_failed — properties {notification_type, error_code}, distinct_id = user.id, pas de PII', async ({
	browser
}) => {
	// Abonnement dont l'endpoint renvoie 410 → endpoint_gone → push_failed.
	await insertValidFakeSub(BOB_ID, DEAD_ENDPOINT);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await createDuelForBob(alicePage, '[E2E] S073T push failed tracking');
	await aliceCtx.close();

	// L'event notification_push_failed est écrit pour Bob.
	await expect
		.poll(
			async () => {
				const evs = await readServerEvents(db, {
					event: 'notification_push_failed',
					distinctId: BOB_ID
				});
				return evs.length;
			},
			{ timeout: 15_000, intervals: [300, 600, 1000, 1500] }
		)
		.toBeGreaterThanOrEqual(1);

	const events = await readServerEvents(db, {
		event: 'notification_push_failed',
		distinctId: BOB_ID
	});

	// Au moins un des events doit avoir error_code = endpoint_gone.
	const goneEv = events.find(
		(e) => (e.properties as Record<string, unknown>)?.['error_code'] === 'endpoint_gone'
	);
	expect(goneEv).toBeTruthy();

	const props = (goneEv!.properties as Record<string, unknown>) ?? {};
	expect(props['notification_type']).toBe('proposition_received');
	expect(props['error_code']).toBe('endpoint_gone');

	// distinct_id = user.id (UUID), pas d'email.
	expect(goneEv!.distinct_id).toBe(BOB_ID);
	expect(goneEv!.distinct_id).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
	);

	// Pas de PII dans les properties.
	const serialized = JSON.stringify(props);
	expect(serialized).not.toMatch(/@/);
	expect(serialized).not.toMatch(/bob/i);
	expect(serialized).not.toMatch(/test\.local/i);
	expect(serialized).not.toMatch(/https?:\/\//); // pas d'endpoint
});

// ─── Scénario 4 : notification_push_sent — { notification_type } ─────────────

test('notification_push_sent — properties {notification_type}, distinct_id = user.id, pas de PII', async ({
	browser
}) => {
	// Abonnement dont l'endpoint renvoie 200 (httpbin) → sendPush code 'ok' →
	// notification_push_sent. Clés ECDH valides requises pour le chiffrement.
	await insertValidFakeSub(BOB_ID, OK_ENDPOINT);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await createDuelForBob(alicePage, '[E2E] S073T push sent tracking');
	await aliceCtx.close();

	// L'event notification_push_sent est écrit pour Bob.
	await expect
		.poll(
			async () => {
				const evs = await readServerEvents(db, {
					event: 'notification_push_sent',
					distinctId: BOB_ID
				});
				return evs.length;
			},
			{ timeout: 20_000, intervals: [400, 800, 1500] }
		)
		.toBeGreaterThanOrEqual(1);

	const events = await readServerEvents(db, {
		event: 'notification_push_sent',
		distinctId: BOB_ID
	});
	const ev = events[events.length - 1];

	expect(ev.distinct_id).toBe(BOB_ID);
	expect(ev.distinct_id).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
	);

	const props = ev.properties as Record<string, unknown>;
	expect(props['notification_type']).toBe('proposition_received');

	// Pas de PII / pas d'endpoint.
	const serialized = JSON.stringify(props);
	expect(serialized).not.toMatch(/@/);
	expect(serialized).not.toMatch(/bob/i);
	expect(serialized).not.toMatch(/test\.local/i);
	expect(serialized).not.toMatch(/https?:\/\//);
});
