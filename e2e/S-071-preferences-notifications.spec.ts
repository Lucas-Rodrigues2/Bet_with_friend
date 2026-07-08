/**
 * S-071 — Préférences de notifications
 *
 * Critères d'acceptation :
 * 1. Page /app/settings/notifications : matrice types × canaux (cases à cocher),
 *    4 thèmes (Paris, Jury, Ardoise & gages, Groupe).
 * 2. notify() filtre à l'émission : si un user a in_app=false pour un type,
 *    aucune ligne notifications n'est insérée pour lui.
 * 3. La matrice persiste après rechargement.
 * 4. Isolation : les préférences de Bob n'affectent pas Alice.
 * 5. Défauts : in_app tout activé ; email/push uniquement pour les types
 *    importants (proposition_received, verdict_rendered, forfeit_to_do,
 *    forfeit_to_confirm).
 * 6. Reset : bouton reset-prefs-btn remet les défauts (supprime les surcharges).
 * 7. Aucun canal n'est marqué « bientôt » (email et push actifs depuis S-072/S-073).
 */
import { test, expect, type Page } from '@playwright/test';
import postgres from 'postgres';
import { login } from './helpers/auth';

const DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const dbOwn = postgres(DATABASE_URL, { max: 3 });

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;
const NEW_YESNO_URL = `${GROUP_URL}/bets/new/yesno`;
const PREFS_URL = '/app/settings/notifications';

// UUIDs from seed.sql
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// Types considérés « importants » (activés par défaut en email/push).
const IMPORTANT_TYPES = [
	'proposition_received',
	'verdict_rendered',
	'forfeit_to_do',
	'forfeit_to_confirm'
] as const;

const ALL_TYPES = [
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

/**
 * Crée un duel yesno Alice→Bob via le formulaire UI.
 */
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

/** Compte les notifications d'un user pour un type donné, dont le payload matche un motif. */
async function countNotifs(userId: string, type: string, payloadLike: string): Promise<number> {
	const rows = await dbOwn`
		SELECT COUNT(*)::int AS n FROM public.notifications
		WHERE user_id = ${userId} AND type = ${type} AND payload LIKE ${'%' + payloadLike + '%'}
	`;
	return Number(rows[0].n);
}

/** Attend que la pref explicite (user, type, channel) atteigne la valeur attendue en DB. */
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

/** Supprime les préférences explicites des users seedés (retour aux défauts). */
async function resetPrefs() {
	try {
		await dbOwn`DELETE FROM public.notification_preferences
			WHERE user_id IN (${ALICE_ID}, ${BOB_ID}, ${CAROL_ID})`;
	} catch {
		// ignore
	}
}

/** Nettoie les paris et notifs créés pendant ce spec. */
async function cleanBetsAndNotifs() {
	try {
		await dbOwn`DELETE FROM public.notifications WHERE payload LIKE '%[E2E] S071%'`;
	} catch {
		// ignore
	}
	try {
		await dbOwn`
			DELETE FROM public.ledger_entries WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E] S071%'
			)
		`;
	} catch {
		// ignore
	}
	try {
		await dbOwn`DELETE FROM public.bets WHERE title LIKE '[E2E] S071%'`;
	} catch {
		// ignore
	}
}

// ─── Setup / cleanup ─────────────────────────────────────────────────────────

test.beforeEach(async () => {
	await resetPrefs();
	await cleanBetsAndNotifs();
});

test.afterEach(async () => {
	await resetPrefs();
	await cleanBetsAndNotifs();
});

test.afterAll(async () => {
	await dbOwn.end();
});

// ─── Scénario 1 : Bob désactive une pref in-app → notify() filtre à l'émission ─

test('Bob désactive proposition_received in-app → aucune notif insérée ; réactivation → notif arrive', async ({
	browser
}) => {
	// === Bob désactive proposition_received in-app ===
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(PREFS_URL);
	await bobPage.waitForLoadState("networkidle");

	const bobCheckbox = bobPage.getByTestId('notif-checkbox-proposition_received-in_app');
	await expect(bobCheckbox).toBeChecked();
	// click() plutôt que uncheck() : Svelte re-render brièvement la checkbox vers
	// son état initial (suppression d'override + invalidateAll) ce qui fait échouer
	// la vérification d'état de Playwright. On attend la confirmation en DB.
	await bobCheckbox.click();
	await waitForPref(BOB_ID, 'proposition_received', 'in_app', false);

	// Vérifier en DB que la pref est à false
	const prefRows = await dbOwn`
		SELECT enabled FROM public.notification_preferences
		WHERE user_id = ${BOB_ID} AND type = 'proposition_received' AND channel = 'in_app'
	`;
	expect(prefRows.length).toBe(1);
	expect(prefRows[0].enabled).toBe(false);
	await bobCtx.close();

	// === Alice crée un duel pour Bob ===
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const title = '[E2E] S071 pref off';
	await createDuelForBob(alicePage, title);
	await aliceCtx.close();

	// === Bob ne doit avoir aucune notif proposition_received pour ce duel ===
	const countAfter = await countNotifs(BOB_ID, 'proposition_received', title);
	expect(countAfter).toBe(0);

	// === Bob réactive la pref ===
	const bobCtx2 = await browser.newContext();
	const bobPage2 = await bobCtx2.newPage();
	await login(bobPage2, 'bob');
	await bobPage2.goto(PREFS_URL);
	await bobPage2.waitForLoadState("networkidle");
	const bobCheckbox2 = bobPage2.getByTestId('notif-checkbox-proposition_received-in_app');
	await expect(bobCheckbox2).not.toBeChecked();
	await bobCheckbox2.click();
	await waitForPref(BOB_ID, 'proposition_received', 'in_app', true);
	await bobCtx2.close();

	// === Alice crée un nouveau duel pour Bob ===
	const aliceCtx2 = await browser.newContext();
	const alicePage2 = await aliceCtx2.newPage();
	await login(alicePage2, 'alice');
	const title2 = '[E2E] S071 pref on';
	await createDuelForBob(alicePage2, title2);
	await aliceCtx2.close();

	// === Bob doit maintenant avoir une notif proposition_received pour ce duel ===
	const countAfter2 = await countNotifs(BOB_ID, 'proposition_received', title2);
	expect(countAfter2).toBe(1);
});

// ─── Scénario 2 : Persistance après rechargement ─────────────────────────────

test('La matrice persiste après rechargement (case décochée reste décochée)', async ({
	page
}) => {
	await login(page, 'alice');
	await page.goto(PREFS_URL);
	await page.waitForLoadState("networkidle");

	// On travaille sur counter_offer_received-in_app (cochée par défaut).
	// On la décoche, on attend la confirmation DB, puis on recharge.
	const checkbox = page.getByTestId('notif-checkbox-counter_offer_received-in_app');
	await expect(checkbox).toBeChecked();
	await checkbox.click();
	await waitForPref(ALICE_ID, 'counter_offer_received', 'in_app', false);

	// Recharger la page
	await page.reload();

	// L'état décoché doit être conservé
	await expect(checkbox).not.toBeChecked();
});

// ─── Scénario 3 : Isolation Bob / Alice ──────────────────────────────────────

test("Les préférences de Bob n'affectent pas Alice", async ({ browser }) => {
	// Bob décoche une case
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(PREFS_URL);
	await bobPage.waitForLoadState("networkidle");
	const bobCheckbox = bobPage.getByTestId('notif-checkbox-debt_created-in_app');
	await expect(bobCheckbox).toBeChecked();
	await bobCheckbox.click();
	await waitForPref(BOB_ID, 'debt_created', 'in_app', false);
	await bobCtx.close();

	// Alice se rend sur la page : sa case doit toujours être cochée
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(PREFS_URL);
	await alicePage.waitForLoadState("networkidle");
	const aliceCheckbox = alicePage.getByTestId('notif-checkbox-debt_created-in_app');
	await expect(aliceCheckbox).toBeChecked();
	await aliceCtx.close();

	// Vérification DB : pref seulement pour Bob
	const bobPrefs = await dbOwn`
		SELECT enabled FROM public.notification_preferences
		WHERE user_id = ${BOB_ID} AND type = 'debt_created' AND channel = 'in_app'
	`;
	expect(bobPrefs.length).toBe(1);
	expect(bobPrefs[0].enabled).toBe(false);
	const alicePrefs = await dbOwn`
		SELECT enabled FROM public.notification_preferences
		WHERE user_id = ${ALICE_ID} AND type = 'debt_created' AND channel = 'in_app'
	`;
	expect(alicePrefs.length).toBe(0); // Alice n'a pas de surcharge
});

// ─── Scénario 4 : Défauts affichés ───────────────────────────────────────────

test("Affichage initial d'Alice : in_app tout activé ; email/push uniquement pour types importants", async ({
	page
}) => {
	// S'assurer qu'Alice n'a aucune surcharge (reset fait dans beforeEach)
	await login(page, 'alice');
	await page.goto(PREFS_URL);
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId('notif-prefs-matrix')).toBeVisible();

	// Tous les types in_app cochés
	for (const type of ALL_TYPES) {
		await expect(
			page.getByTestId(`notif-checkbox-${type}-in_app`)
		).toBeChecked();
	}

	// Email/push : uniquement les types importants cochés
	for (const type of ALL_TYPES) {
		const isImportant = (IMPORTANT_TYPES as readonly string[]).includes(type);
		const emailCheckbox = page.getByTestId(`notif-checkbox-${type}-email`);
		const pushCheckbox = page.getByTestId(`notif-checkbox-${type}-push`);
		if (isImportant) {
			await expect(emailCheckbox).toBeChecked();
			await expect(pushCheckbox).toBeChecked();
		} else {
			await expect(emailCheckbox).not.toBeChecked();
			await expect(pushCheckbox).not.toBeChecked();
		}
	}
});

// ─── Scénario 5 : Reset remet les défauts ────────────────────────────────────

test('Reset : reset-prefs-btn remet les défauts (supprime les surcharges)', async ({
	page
}) => {
	await login(page, 'alice');
	await page.goto(PREFS_URL);
	await page.waitForLoadState("networkidle");

	// Modifier une pref : décocher proposition_received in_app (qui est cochée par défaut)
	const checkbox = page.getByTestId('notif-checkbox-proposition_received-in_app');
	await expect(checkbox).toBeChecked();
	await checkbox.click();
	await waitForPref(ALICE_ID, 'proposition_received', 'in_app', false);
	await expect(checkbox).not.toBeChecked();

	// Vérifier en DB qu'une surcharge existe
	const prefsBefore = await dbOwn`
		SELECT COUNT(*)::int AS n FROM public.notification_preferences
		WHERE user_id = ${ALICE_ID}
	`;
	expect(Number(prefsBefore[0].n)).toBeGreaterThanOrEqual(1);

	// Cliquer reset
	await page.getByTestId('reset-prefs-btn').click();
	await expect(page.getByText('Préférences réinitialisées')).toBeVisible({ timeout: 5_000 });

	// La case doit revenir à son défaut (cochée pour in_app)
	await expect(checkbox).toBeChecked();

	// Vérifier en DB : toutes les surcharges supprimées
	const prefsAfter = await dbOwn`
		SELECT COUNT(*)::int AS n FROM public.notification_preferences
		WHERE user_id = ${ALICE_ID}
	`;
	expect(Number(prefsAfter[0].n)).toBe(0);
});

// ─── Scénario 6 : Canaux email et push actifs (mis à jour par S-072/S-073) ──
// À la livraison de S-071, email et push étaient marqués « bientôt ». S-072
// (email) puis S-073 (push) ont livré ces canaux → le badge « bientôt » a
// disparu. On vérifie désormais qu'aucun canal n'est plus marqué « bientôt ».

test('Aucun canal n est marqué « bientôt » (email et push actifs)', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(PREFS_URL);
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId('notif-prefs-matrix')).toBeVisible();

	// Les canaux email et push sont désormais actifs (S-072/S-073) :
	// aucun badge « bientôt » ne doit subsister.
	const bientotBadges = page.locator('text=/bientôt/i');
	await expect(bientotBadges).toHaveCount(0);
});

// ─── Scénario 7 : Les 4 thèmes sont présents ─────────────────────────────────

test('La matrice contient les 4 thèmes (Paris, Jury, Ardoise & gages, Groupe)', async ({
	page
}) => {
	await login(page, 'alice');
	await page.goto(PREFS_URL);
	await page.waitForLoadState("networkidle");

	await expect(page.getByTestId('notif-theme-Paris')).toBeVisible();
	await expect(page.getByTestId('notif-theme-Jury')).toBeVisible();
	await expect(page.getByTestId('notif-theme-Ardoise & gages')).toBeVisible();
	await expect(page.getByTestId('notif-theme-Groupe')).toBeVisible();

	// Vérifier quelques rows attendus
	await expect(page.getByTestId('notif-row-proposition_received')).toBeVisible();
	await expect(page.getByTestId('notif-row-counter_offer_received')).toBeVisible();
	await expect(page.getByTestId('notif-row-verdict_rendered')).toBeVisible();
	await expect(page.getByTestId('notif-row-invitation_accepted')).toBeVisible();
});
