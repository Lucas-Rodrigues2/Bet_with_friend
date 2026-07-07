/**
 * S-072 — Tracking PostHog (notifications email)
 *
 * Events serveur instrumentés dans cette story :
 *   - notification_email_sent (serveur, sendEmailNotifications succès)
 *     properties : { notification_type }
 *     distinct_id = destinataire user.id
 *   - notification_email_failed (serveur, sendEmailNotifications échec)
 *     properties : { notification_type, error_code }
 *
 * Ce spec vérifie :
 *   1. notification_email_sent est écrit dans analytics_events_test quand un
 *      mail part : distinct_id = user.id du destinataire, properties contient
 *      notification_type uniquement, pas de PII, pas d'email.
 *   2. Pas d'envoi quand la pref email est désactivée → pas d'event
 *      notification_email_sent pour ce destinataire.
 */
import { test, expect, type Page } from '@playwright/test';
import postgres from 'postgres';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { readServerEvents, clearServerEvents } from './helpers/analytics';

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

// ─── Helpers (identiques au spec S-072-notifications-email) ─────────────────

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

async function resetPrefs() {
	try {
		await dbOwn`DELETE FROM public.notification_preferences
			WHERE user_id IN (${ALICE_ID}, ${BOB_ID})`;
	} catch {
		// ignore
	}
}

async function cleanBetsAndNotifs() {
	try {
		await dbOwn`DELETE FROM public.notifications WHERE payload LIKE '%[E2E] S072T%'`;
	} catch {
		// ignore
	}
	try {
		await dbOwn`
			DELETE FROM public.ledger_entries WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E] S072T%'
			)
		`;
	} catch {
		// ignore
	}
	try {
		await dbOwn`DELETE FROM public.bets WHERE title LIKE '[E2E] S072T%'`;
	} catch {
		// ignore
	}
}

test.beforeEach(async () => {
	await resetPrefs();
	await cleanBetsAndNotifs();
	await clearServerEvents(db);
});

test.afterEach(async () => {
	await resetPrefs();
	await cleanBetsAndNotifs();
	await clearServerEvents(db);
});

test.afterAll(async () => {
	await dbOwn.end();
});

// ─── Scénario 1 : notification_email_sent émis pour Bob, sans PII ───────────

test('notification_email_sent — émis au succès, distinct_id = bob.id, properties {notification_type}, pas de PII ni email', async ({
	browser
}) => {
	// Bob a la pref email activée par défaut pour proposition_received (type important).
	// Alice crée un duel pour Bob.
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const title = '[E2E] S072T tracking email sent';
	await createDuelForBob(alicePage, title);
	await aliceCtx.close();

	// L'event serveur doit être écrit dans analytics_events_test pour Bob.
	await expect
		.poll(
			async () => {
				const evs = await readServerEvents(db, {
					event: 'notification_email_sent',
					distinctId: BOB_ID
				});
				return evs.length;
			},
			{ timeout: 15_000, intervals: [300, 600, 1000, 1500] }
		)
		.toBeGreaterThanOrEqual(1);

	const events = await readServerEvents(db, {
		event: 'notification_email_sent',
		distinctId: BOB_ID
	});
	const ev = events[events.length - 1];

	// distinct_id = user.id Supabase (UUID, pas d'email).
	expect(ev.distinct_id).toBe(BOB_ID);
	expect(ev.distinct_id).not.toMatch(/@/);
	expect(ev.distinct_id).not.toMatch(/bob/i);
	expect(ev.distinct_id).not.toMatch(/test\.local/i);
	expect(ev.distinct_id).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
	);

	const props = ev.properties as Record<string, unknown>;
	expect(props['notification_type']).toBe('proposition_received');

	// Pas d'email ni de PII dans les properties.
	const serialized = JSON.stringify(props);
	expect(serialized).not.toMatch(/@/);
	expect(serialized).not.toMatch(/bob/i);
	expect(serialized).not.toMatch(/test\.local/i);
	expect(serialized).not.toMatch(/proposition_received.*email/i);

	// Pas d'event pour Alice (elle n'est pas destinataire de cette notif).
	const aliceEvents = await readServerEvents(db, {
		event: 'notification_email_sent',
		distinctId: ALICE_ID
	});
	expect(aliceEvents.length).toBe(0);
});

// ─── Scénario 2 : pref email désactivée → pas d'event notification_email_sent ─

test('notification_email_sent — non émis quand la pref email du destinataire est désactivée', async ({
	browser
}) => {
	await setPref(BOB_ID, 'proposition_received', 'email', false);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const title = '[E2E] S072T no email event';
	await createDuelForBob(alicePage, title);
	await aliceCtx.close();

	// Laisser le temps à l'envoi détaché (setImmediate) de s'exécuter.
	await new Promise((r) => setTimeout(r, 2500));

	const events = await readServerEvents(db, {
		event: 'notification_email_sent',
		distinctId: BOB_ID
	});
	expect(events.length).toBe(0);
});
