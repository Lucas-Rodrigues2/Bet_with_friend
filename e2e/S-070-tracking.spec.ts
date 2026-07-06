/**
 * S-070 — Tracking PostHog (notifications in-app)
 *
 * Events instrumentés dans cette story :
 *   - notification_sent (serveur, src/lib/server/notifications.ts notify())
 *     properties : { notification_type }
 *     Un event par destinataire, distinct_id = userId.
 *   - notification_marked_read (serveur, mark-read/+server.ts « Tout marquer lu »)
 *     properties : { count } (nombre de non-lues avant marquage)
 *   - notification_opened (client, NotificationBell.svelte togglePanel())
 *     properties : { unread_count }
 *
 * Ce spec vérifie :
 *   1. notification_sent est écrit dans analytics_events_test quand une notif est
 *      émise (Alice défie Bob → Bob a un event notification_sent avec
 *      notification_type='proposition_received', distinct_id = Bob).
 *   2. Pas de PII dans les properties (uniquement notification_type).
 *   3. notification_marked_read émis au « Tout marquer lu » avec count.
 *   4. notification_opened est un event client capturé côté navigateur
 *      (via interceptPosthog) à l'ouverture du panneau.
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { interceptPosthog, readServerEvents, clearServerEvents } from './helpers/analytics';

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;
const NEW_YESNO_URL = `${GROUP_URL}/bets/new/yesno`;

const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const DAVE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';/** Récupère le user.id Supabase d'un user depuis son email. */
async function getUserId(email: string): Promise<string> {
	const rows = await db`SELECT id FROM auth.users WHERE email = ${email} LIMIT 1`;
	if (!rows[0]) throw new Error(`${email} not found in DB`);
	return String(rows[0].id);
}

/** Nettoie les notifs et paris [E2E] S070t créés pendant ce spec. */
async function cleanTestNotificationsAndBets() {
	await db`DELETE FROM public.notifications WHERE payload LIKE '%[E2E] S070t%'`;
	await db`
		DELETE FROM public.ledger_entries WHERE match_id IN (
			SELECT m.id FROM public.matches m
			JOIN public.bets b ON b.id = m.bet_id
			WHERE b.title LIKE '[E2E] S070t%'
		)
	`;
	await db`DELETE FROM public.bets WHERE title LIKE '[E2E] S070t%'`;
}

const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

/** Ouvre le panneau de notifications de façon robuste (attend l'hydratation). */
async function openBellPanel(page: import('@playwright/test').Page): Promise<void> {
	await page.waitForLoadState('networkidle');
	const bellBtn = page.getByTestId('notification-bell-button');
	await expect(bellBtn).toBeVisible();
	await bellBtn.click();
	await expect(page.getByTestId('notification-panel')).toBeVisible({ timeout: 10_000 });
}

/** Remplit le titre via setter natif (Svelte 5 bind:value). */
async function svelteFillTitle(page: import('@playwright/test').Page, value: string): Promise<void> {
	await page.evaluate((val) => {
		const el = document.querySelector('[data-testid="input-title"]') as HTMLInputElement;
		if (el) {
			el.focus();
			const setter = Object.getOwnPropertyDescriptor(
				window.HTMLInputElement.prototype,
				'value'
			)?.set;
			if (setter) setter.call(el, val);
			else el.value = val;
			el.dispatchEvent(new Event('input', { bubbles: true }));
			el.dispatchEvent(new Event('change', { bubbles: true }));
		}
	}, value);
}

/**
 * Crée un duel yesno Alice→Bob via UI. Retourne l'URL et l'ID du pari.
 * Robuste : attend la stabilisation Svelte 5 avant le select, timeout long.
 */
async function createDuelForBob(
	page: import('@playwright/test').Page,
	title: string
): Promise<{ betUrl: string; betId: string }> {
	await page.goto(NEW_YESNO_URL);
	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');
	await page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox').check();
	await svelteFillTitle(page, title);
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

test.describe('S-070 — Tracking PostHog notifications', () => {
	test.beforeAll(async () => {
		// Reset accumulated notifications for the seeded users (other specs trigger
		// notify() and never clean the notifications table).
		for (const id of [ALICE_ID, BOB_ID, CAROL_ID, DAVE_ID]) {
			await db`DELETE FROM public.notifications WHERE user_id = ${id}`;
		}
	});

	test.beforeEach(async () => {
		await clearServerEvents(db);
		await cleanTestNotificationsAndBets();
	});

	test.afterAll(async () => {
		await clearServerEvents(db);
		await cleanTestNotificationsAndBets();
	});

	// ─── notification_sent (serveur) ─────────────────────────────────────────

	test('notification_sent — émis pour Bob quand Alice défie Bob, notification_type correct', async ({
		page
	}) => {
		await login(page, 'alice');
		const bobId = await getUserId('bob@test.local');

		// Crée un duel Alice→Bob (UI) → notify([bobId], 'proposition_received', ...)
		await createDuelForBob(page, '[E2E] S070t defi track');

		// Vérifier l'event serveur notification_sent pour Bob
		const events = await readServerEvents(db, {
			event: 'notification_sent',
			distinctId: bobId
		});
		expect(events.length).toBeGreaterThanOrEqual(1);

		// L'event pour la proposition reçue
		const propEvent = events.find(
			(e) => (e.properties as Record<string, unknown>)['notification_type'] === 'proposition_received'
		);
		expect(propEvent).toBeDefined();
		expect(propEvent!.distinct_id).toBe(bobId);
	});

	test('notification_sent — distinct_id = UUID Supabase valide de Bob, pas son email', async ({
		page
	}) => {
		await login(page, 'alice');
		const bobId = await getUserId('bob@test.local');

		await createDuelForBob(page, '[E2E] S070t distinct id');

		const events = await readServerEvents(db, {
			event: 'notification_sent',
			distinctId: bobId
		});
		expect(events.length).toBeGreaterThanOrEqual(1);
		expect(events[0].distinct_id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		);
		// distinct_id ne contient pas l'email
		expect(events[0].distinct_id).not.toMatch(/bob/i);
		expect(events[0].distinct_id).not.toMatch(/@/);
		expect(events[0].distinct_id).not.toMatch(/test\.local/i);
	});

	test('notification_sent — properties ne contiennent que notification_type (pas de PII)', async ({
		page
	}) => {
		await login(page, 'alice');

		await createDuelForBob(page, '[E2E] S070t no pii');

		const events = await readServerEvents(db, { event: 'notification_sent' });
		// Au moins un event pour Bob (proposition_received)
		const propEvents = events.filter(
			(e) => (e.properties as Record<string, unknown>)['notification_type'] === 'proposition_received'
		);
		expect(propEvents.length).toBeGreaterThanOrEqual(1);

		const props = propEvents[0].properties as Record<string, unknown>;
		const keys = Object.keys(props).sort();
		expect(keys).toEqual(['notification_type']);
		expect(props['notification_type']).toBe('proposition_received');

		// Aucune PII dans les values
		const serialized = JSON.stringify(props);
		expect(serialized).not.toMatch(/@/);
		expect(serialized).not.toMatch(/alice/i);
		expect(serialized).not.toMatch(/bob/i);
		expect(serialized).not.toMatch(/test\.local/i);
		// Le titre du pari (PII potentielle) ne doit pas fuiter
		expect(serialized).not.toMatch(/\[E2E\]/);
	});

	// ─── notification_marked_read (serveur) ─────────────────────────────────

	test('notification_marked_read — émis au « Tout marquer lu » avec count', async ({
		browser
	}) => {
		// Alice crée 2 duels pour Bob → Bob a 2 notifications non lues
		const aliceCtx = await browser.newContext();
		const alicePage = await aliceCtx.newPage();
		await login(alicePage, 'alice');
		await createDuelForBob(alicePage, '[E2E] S070t markread 1');
		await createDuelForBob(alicePage, '[E2E] S070t markread 2');
		await aliceCtx.close();

		await clearServerEvents(db);

		const bobId = await getUserId('bob@test.local');
		const bobCtx = await browser.newContext();
		const bobPage = await bobCtx.newPage();
		await login(bobPage, 'bob');
		await bobPage.goto(GROUP_URL);

		await expect(bobPage.getByTestId('notification-badge')).toBeVisible({ timeout: 5000 });
		await openBellPanel(bobPage);

		// Garde d'isolation : s'assurer que Bob a bien ≥1 notif non lue en DB
		// avant le mark-read (état DB partagé entre specs).
		const unreadRows = await db`
			SELECT id FROM public.notifications
			WHERE user_id = ${bobId} AND read_at IS NULL
		`;
		const unreadBefore = unreadRows.length;
		expect(unreadBefore).toBeGreaterThanOrEqual(1);

		// Attendre la réponse du POST /api/notifications/mark-read (race condition :
		// Playwright résout click() dès le dispatch, sans attendre le handler async
		// markAllRead() qui fait un await fetch). Le captureServer() écrit l'event
		// seulement après commit DB, on poll donc l'event.
		const markReadResponsePromise = bobPage.waitForResponse(
			(resp) =>
				resp.url().includes('/api/notifications/mark-read') && resp.request().method() === 'POST'
		);
		await bobPage.getByTestId('mark-all-read').click();
		await markReadResponsePromise;

		// L'événement serveur doit être émis (poll : le sink DB peut mettre ~ms).
		await expect
			.poll(
				async () => {
					const evs = await readServerEvents(db, {
						event: 'notification_marked_read',
						distinctId: bobId
					});
					return evs.length;
				},
				{ timeout: 10_000, intervals: [200, 500, 1000] }
			)
			.toBeGreaterThanOrEqual(1);

		const events = await readServerEvents(db, {
			event: 'notification_marked_read',
			distinctId: bobId
		});
		expect(events.length).toBeGreaterThanOrEqual(1);
		const props = events[0].properties as Record<string, unknown>;
		expect(props['count']).toBe(unreadBefore);
		expect(events[0].distinct_id).toBe(bobId);

		await bobCtx.close();
	});

	// ─── notification_opened (client, posthog-js) ────────────────────────────

	test('notification_opened — event client capturé à l ouverture du panneau', async ({
		page
	}) => {
		// Doit être appelé AVANT login/goto (exposeFunction avant navigation)
		const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);

		await login(page, 'bob');
		await page.goto(GROUP_URL);
		await exposeSpyPromise;

		// Ouvrir le panneau → track('notification_opened', { unread_count })
		await openBellPanel(page);

		// L'event client doit être capturé
		await expect
			.poll(() => getCapturedEvents().filter((e) => e.event === 'notification_opened').length)
			.toBeGreaterThanOrEqual(1);

		const openedEvents = getCapturedEvents().filter((e) => e.event === 'notification_opened');
		expect(openedEvents.length).toBeGreaterThanOrEqual(1);
		const props = openedEvents[0].properties as Record<string, unknown>;
		expect(typeof props['unread_count']).toBe('number');
		expect(props['unread_count']).toBeGreaterThanOrEqual(0);
	});
});
