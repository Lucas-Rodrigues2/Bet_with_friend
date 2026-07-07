/**
 * S-071 — Tracking PostHog (préférences de notifications)
 *
 * Events instrumentés dans cette story :
 *   - notification_preferences_viewed (serveur, +page.server.ts load())
 *     properties : { has_custom_prefs: boolean }
 *     distinct_id = user.id
 *   - notification_preferences_updated (serveur, +page.server.ts action update)
 *     properties : { type, channel, enabled }
 *     distinct_id = user.id
 *
 * Ce spec vérifie :
 *   1. notification_preferences_viewed émis au load de la page, distinct_id = user.id,
 *      properties.has_custom_prefs booléen, pas de PII.
 *   2. notification_preferences_updated émis au toggle d'une case, properties
 *      { type, channel, enabled }, distinct_id = user.id, pas de PII.
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { readServerEvents, clearServerEvents } from './helpers/analytics';

const PREFS_URL = '/app/settings/notifications';

const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

/** Récupère le user.id Supabase d'un user depuis son email. */
async function getUserId(email: string): Promise<string> {
	const rows = await db`SELECT id FROM auth.users WHERE email = ${email} LIMIT 1`;
	if (!rows[0]) throw new Error(`${email} not found in DB`);
	return String(rows[0].id);
}

test.describe('S-071 — Tracking PostHog préférences', () => {
	test.beforeEach(async () => {
		await clearServerEvents(db);
		// Retour aux défauts pour les users testés.
		try {
			await db`DELETE FROM public.notification_preferences
				WHERE user_id IN (${ALICE_ID}, ${BOB_ID})`;
		} catch {
			// ignore
		}
	});

	test.afterAll(async () => {
		await clearServerEvents(db);
		try {
			await db`DELETE FROM public.notification_preferences
				WHERE user_id IN (${ALICE_ID}, ${BOB_ID})`;
		} catch {
			// ignore
		}
	});

	// ─── notification_preferences_viewed (serveur) ────────────────────────────

	test('notification_preferences_viewed — émis au load, has_custom_prefs booléen, pas de PII', async ({
		page
	}) => {
		const aliceId = await getUserId('alice@test.local');

		await login(page, 'alice');
		await page.goto(PREFS_URL);
		await page.waitForLoadState('networkidle');

		// L'event serveur doit être émis
		await expect
			.poll(
				async () => {
					const evs = await readServerEvents(db, {
						event: 'notification_preferences_viewed',
						distinctId: aliceId
					});
					return evs.length;
				},
				{ timeout: 10_000, intervals: [200, 500, 1000] }
			)
			.toBeGreaterThanOrEqual(1);

		const events = await readServerEvents(db, {
			event: 'notification_preferences_viewed',
			distinctId: aliceId
		});
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1];
		expect(ev.distinct_id).toBe(aliceId);
		// distinct_id ne contient pas d'email / PII
		expect(ev.distinct_id).not.toMatch(/@/);
		expect(ev.distinct_id).not.toMatch(/alice/i);
		expect(ev.distinct_id).not.toMatch(/test\.local/i);
		expect(ev.distinct_id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		);

		const props = ev.properties as Record<string, unknown>;
		expect(typeof props['has_custom_prefs']).toBe('boolean');

		// Pas de PII dans les properties
		const serialized = JSON.stringify(props);
		expect(serialized).not.toMatch(/@/);
		expect(serialized).not.toMatch(/alice/i);
		expect(serialized).not.toMatch(/test\.local/i);
	});

	test('notification_preferences_viewed — has_custom_prefs=true quand l user a des surcharges', async ({
		page
	}) => {
		const aliceId = await getUserId('alice@test.local');

		// Insérer une surcharge explicite pour Alice
		await db`
			INSERT INTO public.notification_preferences (user_id, type, channel, enabled, updated_at)
			VALUES (${aliceId}, 'debt_created', 'in_app', false, NOW())
			ON CONFLICT (user_id, type, channel) DO UPDATE SET enabled = false, updated_at = NOW()
		`;

		await login(page, 'alice');
		await page.goto(PREFS_URL);
		await page.waitForLoadState('networkidle');

		await expect
			.poll(
				async () => {
					const evs = await readServerEvents(db, {
						event: 'notification_preferences_viewed',
						distinctId: aliceId
					});
					return evs.length;
				},
				{ timeout: 10_000, intervals: [200, 500, 1000] }
			)
			.toBeGreaterThanOrEqual(1);

		const events = await readServerEvents(db, {
			event: 'notification_preferences_viewed',
			distinctId: aliceId
		});
		const ev = events[events.length - 1];
		const props = ev.properties as Record<string, unknown>;
		expect(props['has_custom_prefs']).toBe(true);
	});

	// ─── notification_preferences_updated (serveur) ────────────────────────────

	test('notification_preferences_updated — émis au toggle d une case, properties {type, channel, enabled}, distinct_id = user.id', async ({
		page
	}) => {
		const bobId = await getUserId('bob@test.local');

		await login(page, 'bob');
		await page.goto(PREFS_URL);
		await page.waitForLoadState('networkidle');

		// Décocher proposition_received in_app (cochée par défaut).
		// click() plutôt que uncheck() : Svelte re-render brièvement la checkbox
		// vers son état initial (suppression d'override + invalidateAll).
		await clearServerEvents(db);
		const checkbox = page.getByTestId('notif-checkbox-proposition_received-in_app');
		await expect(checkbox).toBeChecked();
		await checkbox.click();

		// L'event serveur doit être émis
		await expect
			.poll(
				async () => {
					const evs = await readServerEvents(db, {
						event: 'notification_preferences_updated',
						distinctId: bobId
					});
					return evs.length;
				},
				{ timeout: 10_000, intervals: [200, 500, 1000] }
			)
			.toBeGreaterThanOrEqual(1);

		const events = await readServerEvents(db, {
			event: 'notification_preferences_updated',
			distinctId: bobId
		});
		const ev = events[events.length - 1];
		expect(ev.distinct_id).toBe(bobId);
		// distinct_id ne contient pas d'email
		expect(ev.distinct_id).not.toMatch(/@/);
		expect(ev.distinct_id).not.toMatch(/bob/i);
		expect(ev.distinct_id).not.toMatch(/test\.local/i);
		expect(ev.distinct_id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		);

		const props = ev.properties as Record<string, unknown>;
		expect(props['type']).toBe('proposition_received');
		expect(props['channel']).toBe('in_app');
		expect(props['enabled']).toBe(false);

		// Pas de PII dans les properties
		const serialized = JSON.stringify(props);
		expect(serialized).not.toMatch(/@/);
		expect(serialized).not.toMatch(/bob/i);
		expect(serialized).not.toMatch(/test\.local/i);
	});

	test('notification_preferences_updated — émis au toggle (enabled=true quand on recoche)', async ({
		page
	}) => {
		const bobId = await getUserId('bob@test.local');

		await login(page, 'bob');
		await page.goto(PREFS_URL);
		await page.waitForLoadState('networkidle');

		// Décocher puis recocher → l'event doit avoir enabled=true
		await clearServerEvents(db);
		const checkbox = page.getByTestId('notif-checkbox-proposition_received-in_app');
		await checkbox.click();
		await expect(page.getByText('Préférence enregistrée')).toBeVisible({ timeout: 5_000 });

		await clearServerEvents(db);
		await checkbox.click();
		await expect(page.getByText('Préférence enregistrée')).toBeVisible({ timeout: 5_000 });

		// L'event serveur doit avoir enabled=true
		await expect
			.poll(
				async () => {
					const evs = await readServerEvents(db, {
						event: 'notification_preferences_updated',
						distinctId: bobId
					});
					return evs.filter(
						(e) => (e.properties as Record<string, unknown>)['enabled'] === true
					).length;
				},
				{ timeout: 10_000, intervals: [200, 500, 1000] }
			)
			.toBeGreaterThanOrEqual(1);

		const events = await readServerEvents(db, {
			event: 'notification_preferences_updated',
			distinctId: bobId
		});
		const trueEvent = events.find(
			(e) => (e.properties as Record<string, unknown>)['enabled'] === true
		);
		expect(trueEvent).toBeDefined();
		const props = trueEvent!.properties as Record<string, unknown>;
		expect(props['type']).toBe('proposition_received');
		expect(props['channel']).toBe('in_app');
	});
});
