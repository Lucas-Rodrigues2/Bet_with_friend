/**
 * S-012 — Tracking PostHog (gestion des membres d'un groupe)
 *
 * Events instrumentés dans cette story :
 *   Serveur :
 *     - group_left       { group_id }                   — quand un membre quitte
 *     - member_kicked    { group_id, target_user_id }   — quand un admin exclut un membre
 *     - member_promoted  { group_id, target_user_id }   — quand un admin promeut un membre
 *   Client :
 *     - leave_confirm_opened  { group_id }              — clic sur "Quitter le groupe"
 *     - kick_confirm_opened   { group_id, target_user_id } — clic sur "Exclure"
 *
 * Ce spec vérifie l'envoi réel de chaque event.
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { interceptPosthog, readServerEvents, clearServerEvents } from './helpers/analytics';

// IDs seedés (cf. supabase/seed.sql)
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// Groupe seedé : Alice admin, Bob et Carol membres
const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const MEMBERS_URL = `/app/groups/${SEEDED_GROUP_ID}/members`;

// ─── Helpers DB ───────────────────────────────────────────────────────────────

async function restoreMember(groupId: string, userId: string) {
	await db`UPDATE group_members SET removed_at = NULL WHERE group_id = ${groupId} AND user_id = ${userId}`;
}

async function setRole(groupId: string, userId: string, role: 'admin' | 'member') {
	await db`UPDATE group_members SET role = ${role} WHERE group_id = ${groupId} AND user_id = ${userId}`;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe('S-012 — Tracking PostHog gestion des membres', () => {
	test.beforeEach(async () => {
		await clearServerEvents(db);
		// Remettre l'état initial du groupe seedé
		try {
			await restoreMember(SEEDED_GROUP_ID, BOB_ID);
			await restoreMember(SEEDED_GROUP_ID, CAROL_ID);
			await restoreMember(SEEDED_GROUP_ID, ALICE_ID);
			await setRole(SEEDED_GROUP_ID, ALICE_ID, 'admin');
			await setRole(SEEDED_GROUP_ID, BOB_ID, 'member');
			await setRole(SEEDED_GROUP_ID, CAROL_ID, 'member');
		} catch {
			// Ignore cleanup errors
		}
	});

	test.afterAll(async () => {
		await clearServerEvents(db);
		try {
			await restoreMember(SEEDED_GROUP_ID, BOB_ID);
			await restoreMember(SEEDED_GROUP_ID, CAROL_ID);
			await restoreMember(SEEDED_GROUP_ID, ALICE_ID);
			await setRole(SEEDED_GROUP_ID, ALICE_ID, 'admin');
			await setRole(SEEDED_GROUP_ID, BOB_ID, 'member');
			await setRole(SEEDED_GROUP_ID, CAROL_ID, 'member');
		} catch {
			// Ignore cleanup errors
		}
	});

	// ─── Events serveur ───────────────────────────────────────────────────────

	test('group_left — event serveur émis quand Carol quitte le groupe', async ({ page }) => {
		await login(page, 'carol');
		await page.goto(MEMBERS_URL);
		await page.waitForLoadState('networkidle');

		// Ouvrir la confirmation puis confirmer le départ
		await page.getByTestId('leave-btn').click();
		await expect(page.getByTestId('confirm-leave-btn')).toBeVisible();
		await page.getByTestId('confirm-leave-btn').click();

		// Redirigée vers /app
		await expect(page).toHaveURL(/\/app$/);

		// Vérifier l'event dans le sink DB
		const events = await readServerEvents(db, { event: 'group_left', distinctId: CAROL_ID });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1];
		expect(ev.event).toBe('group_left');
		expect(ev.distinct_id).toBe(CAROL_ID);

		const props = ev.properties as Record<string, unknown>;
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
	});

	test('group_left — distinct_id = user.id Supabase (Carol)', async ({ page }) => {
		await login(page, 'carol');
		await page.goto(MEMBERS_URL);
		await page.waitForLoadState('networkidle');

		await page.getByTestId('leave-btn').click();
		await page.getByTestId('confirm-leave-btn').click();
		await expect(page).toHaveURL(/\/app$/);

		const events = await readServerEvents(db, { event: 'group_left', distinctId: CAROL_ID });
		expect(events.length).toBeGreaterThanOrEqual(1);
		// Tous les events doivent avoir le bon distinct_id
		expect(events.every((e) => e.distinct_id === CAROL_ID)).toBe(true);
	});

	test('group_left — aucun event si le dernier admin tente de quitter (protection serveur)', async ({
		page
	}) => {
		// Alice est le seul admin — le serveur doit refuser
		await login(page, 'alice');

		await page.evaluate(async (membersUrl) => {
			await fetch(`${membersUrl}?/leave`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'x-sveltekit-action': 'true'
				},
				body: ''
			});
		}, MEMBERS_URL);

		// Aucun event group_left pour Alice ne doit être présent
		const events = await readServerEvents(db, { event: 'group_left', distinctId: ALICE_ID });
		expect(events.length).toBe(0);
	});

	test('member_kicked — event serveur émis quand Alice exclut Bob', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(MEMBERS_URL);
		await page.waitForLoadState('networkidle');

		// Cliquer sur Exclure → confirmation → confirmer
		await page.getByTestId(`kick-btn-${BOB_ID}`).click();
		await expect(page.getByTestId(`confirm-kick-btn-${BOB_ID}`)).toBeVisible();
		await page.getByTestId(`confirm-kick-btn-${BOB_ID}`).click();

		// Attendre le retour UI (success message)
		await expect(page.getByTestId('members-success')).toBeVisible();

		// Vérifier l'event dans le sink DB
		const events = await readServerEvents(db, { event: 'member_kicked', distinctId: ALICE_ID });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1];
		expect(ev.event).toBe('member_kicked');
		expect(ev.distinct_id).toBe(ALICE_ID);

		const props = ev.properties as Record<string, unknown>;
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
		expect(props['target_user_id']).toBe(BOB_ID);
	});

	test('member_kicked — distinct_id = id de l\'admin qui exclut (Alice), pas de la cible (Bob)', async ({
		page
	}) => {
		await login(page, 'alice');
		await page.goto(MEMBERS_URL);
		await page.waitForLoadState('networkidle');

		await page.getByTestId(`kick-btn-${BOB_ID}`).click();
		await page.getByTestId(`confirm-kick-btn-${BOB_ID}`).click();
		await expect(page.getByTestId('members-success')).toBeVisible();

		const events = await readServerEvents(db, { event: 'member_kicked', distinctId: ALICE_ID });
		expect(events.length).toBeGreaterThanOrEqual(1);

		// distinct_id doit être celui d'Alice (l'acteur), pas de Bob (la cible)
		expect(events[events.length - 1].distinct_id).toBe(ALICE_ID);

		// Aucun event avec distinctId de Bob
		const eventsForBob = await readServerEvents(db, {
			event: 'member_kicked',
			distinctId: BOB_ID
		});
		expect(eventsForBob.length).toBe(0);
	});

	test('member_kicked — aucun event si un membre simple tente d\'exclure (protection serveur)', async ({
		page
	}) => {
		await login(page, 'bob');

		await page.evaluate(
			async ({ membersUrl, carolId }) => {
				await fetch(`${membersUrl}?/kick`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'x-sveltekit-action': 'true'
					},
					body: `targetUserId=${carolId}`
				});
			},
			{ membersUrl: MEMBERS_URL, carolId: CAROL_ID }
		);

		// Aucun event member_kicked ne doit être présent
		const events = await readServerEvents(db, { event: 'member_kicked' });
		expect(events.length).toBe(0);
	});

	test('member_promoted — event serveur émis quand Alice promeut Carol', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(MEMBERS_URL);
		await page.waitForLoadState('networkidle');

		// Cliquer sur Promouvoir pour Carol
		await page.getByTestId(`promote-btn-${CAROL_ID}`).click();

		// Attendre le retour UI (success promoted message)
		await expect(page.getByTestId('members-success-promoted')).toBeVisible();

		// Vérifier l'event dans le sink DB
		const events = await readServerEvents(db, {
			event: 'member_promoted',
			distinctId: ALICE_ID
		});
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1];
		expect(ev.event).toBe('member_promoted');
		expect(ev.distinct_id).toBe(ALICE_ID);

		const props = ev.properties as Record<string, unknown>;
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
		expect(props['target_user_id']).toBe(CAROL_ID);
	});

	test('member_promoted — distinct_id = id de l\'admin qui promeut (Alice), pas de la cible', async ({
		page
	}) => {
		await login(page, 'alice');
		await page.goto(MEMBERS_URL);
		await page.waitForLoadState('networkidle');

		await page.getByTestId(`promote-btn-${CAROL_ID}`).click();
		await expect(page.getByTestId('members-success-promoted')).toBeVisible();

		const events = await readServerEvents(db, { event: 'member_promoted', distinctId: ALICE_ID });
		expect(events.length).toBeGreaterThanOrEqual(1);
		expect(events.every((e) => e.distinct_id === ALICE_ID)).toBe(true);
	});

	test('member_promoted — aucun event si un membre simple tente de promouvoir (protection serveur)', async ({
		page
	}) => {
		await login(page, 'bob');

		await page.evaluate(
			async ({ membersUrl, carolId }) => {
				await fetch(`${membersUrl}?/promote`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'x-sveltekit-action': 'true'
					},
					body: `targetUserId=${carolId}`
				});
			},
			{ membersUrl: MEMBERS_URL, carolId: CAROL_ID }
		);

		// Aucun event member_promoted ne doit être présent
		const events = await readServerEvents(db, { event: 'member_promoted' });
		expect(events.length).toBe(0);
	});

	// ─── Events client ────────────────────────────────────────────────────────

	test('leave_confirm_opened — event client capturé quand Carol clique sur "Quitter le groupe"', async ({
		page
	}) => {
		// interceptPosthog AVANT toute navigation
		const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
		await exposeSpyPromise;

		await login(page, 'carol');
		await page.goto(MEMBERS_URL);
		await page.waitForLoadState('networkidle');

		// Cliquer sur le bouton "Quitter le groupe"
		await page.getByTestId('leave-btn').click();

		// Attendre que la confirmation apparaisse (et que le spy soit invoqué)
		await expect(page.getByTestId('confirm-leave-btn')).toBeVisible();
		await page.waitForTimeout(100);

		const clientEvents = getCapturedEvents();
		const ev = clientEvents.find((e) => e.event === 'leave_confirm_opened');
		expect(ev).toBeDefined();
		expect(ev!.properties['group_id']).toBe(SEEDED_GROUP_ID);
	});

	test('kick_confirm_opened — event client capturé quand Alice clique sur "Exclure" pour Bob', async ({
		page
	}) => {
		// interceptPosthog AVANT toute navigation
		const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
		await exposeSpyPromise;

		await login(page, 'alice');
		await page.goto(MEMBERS_URL);
		await page.waitForLoadState('networkidle');

		// Cliquer sur le bouton "Exclure" de Bob
		await page.getByTestId(`kick-btn-${BOB_ID}`).click();

		// Attendre la confirmation
		await expect(page.getByTestId(`confirm-kick-btn-${BOB_ID}`)).toBeVisible();
		await page.waitForTimeout(100);

		const clientEvents = getCapturedEvents();
		const ev = clientEvents.find((e) => e.event === 'kick_confirm_opened');
		expect(ev).toBeDefined();
		expect(ev!.properties['group_id']).toBe(SEEDED_GROUP_ID);
		expect(ev!.properties['target_user_id']).toBe(BOB_ID);
	});
});
