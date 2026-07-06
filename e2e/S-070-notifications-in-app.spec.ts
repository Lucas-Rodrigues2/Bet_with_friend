/**
 * S-070 — Notifications in-app (cloche)
 *
 * Critères d'acceptation :
 * 1. Module serveur notify(userIds, type, payload) — point d'entrée unique.
 * 2. Header : cloche avec badge du nombre de non-lues.
 * 3. Panneau : liste antéchronologique, libellé FR par type + lien profond.
 * 4. Cliquer une notif la marque lue et navigue ; « Tout marquer lu » dispo.
 * 5. Realtime/polling 30 s : une notif apparaît sans rechargement complet.
 *
 * Scénarios E2E :
 * - Alice défie Bob (yesno) → Bob a une notification « Alice vous défie sur ... »
 *   qui mène au duel.
 * - Verdict rendu → les deux joueurs ont la notification.
 * - Marquer lu : badge décroît, l'état persiste après rechargement.
 * - Les notifications d'Alice ne fuient pas chez Carol.
 * - « Tout marquer lu » disponible.
 * - Polling : une notif émise pendant qu'une page est ouverte apparaît via
 *   l'ouverture du panneau (fetch à l'ouverture), sans rechargement complet.
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

// UUIDs from seed.sql
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const DAVE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Remplit un champ texte lié à `bind:value` (Svelte 5) de façon fiable en headless.
 */
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
 * Crée un duel yesno Alice→Bob (points) via le formulaire UI.
 * Retourne l'URL de la page du duel et l'ID du pari.
 */
async function createDuelViaUi(
	page: Page,
	opts: { title: string; stakeCreator?: string; stakeTarget?: string }
): Promise<{ betUrl: string; betId: string }> {
	await page.goto(NEW_YESNO_URL);
	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');
	await page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox').check();
	await svelteFill(page, 'input-title', opts.title);
	await page.getByTestId('input-stake-creator').fill(opts.stakeCreator ?? '10');
	await page.getByTestId('input-stake-target').fill(opts.stakeTarget ?? '5');
	// Select target LAST (Svelte 5 race condition)
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

/**
 * Crée un duel yesno en statut 'judging' directement en DB (Alice vs Bob, Carol juré).
 * Évite le flow UI complet pour les scénarios de verdict.
 */
async function createYesnoDuelJudgingInDb(opts: {
	title: string;
	stakeCreator?: number;
	stakeTarget?: number;
}): Promise<{ betId: string; matchId: string }> {
	const stakeCreator = opts.stakeCreator ?? 10;
	const stakeTarget = opts.stakeTarget ?? 5;

	const [bet] = await dbOwn`
		INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status)
		VALUES (
			${SEEDED_GROUP_ID}, ${ALICE_ID}, 'yesno', ${opts.title},
			'points', ${stakeCreator}, false, 'majority', 'open'
		)
		RETURNING id
	`;
	await dbOwn`
		INSERT INTO yesno_bets (bet_id, mode, creator_side, choice_a, choice_b, accepted_count, max_opponents)
		VALUES (${bet.id}, 'duel', 'a', 'Oui', 'Non', 1, 1)
	`;
	await dbOwn`
		INSERT INTO bet_visibility (bet_id, user_id)
		SELECT ${bet.id}, unnest(${dbOwn.array([ALICE_ID, BOB_ID])}::uuid[])
	`;
	await dbOwn`
		INSERT INTO propositions (bet_id, target_id, last_proposer_id, stake_creator, stake_target, status)
		VALUES (${bet.id}, ${BOB_ID}, ${BOB_ID}, ${stakeCreator}, ${stakeTarget}, 'accepted')
	`;
	const [match] = await dbOwn`
		INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'judging') RETURNING id
	`;
	await dbOwn`
		INSERT INTO match_jurors (match_id, user_id)
		SELECT ${match.id}, unnest(${dbOwn.array([CAROL_ID])}::uuid[])
	`;
	await dbOwn`
		INSERT INTO match_participants (match_id, user_id, side, stake)
		VALUES (${match.id}, ${ALICE_ID}, 'a', ${stakeCreator}),
		       (${match.id}, ${BOB_ID}, 'b', ${stakeTarget})
	`;
	return { betId: bet.id, matchId: match.id };
}

/**
 * Ouvre le panneau de notifications de façon robuste (attend l'hydratation).
 */
async function openBellPanel(page: Page): Promise<void> {
	await page.waitForLoadState('networkidle');
	const bellBtn = page.getByTestId('notification-bell-button');
	await expect(bellBtn).toBeVisible();
	await bellBtn.click();
	await expect(page.getByTestId('notification-panel')).toBeVisible({ timeout: 10_000 });
}

/**
 * Nettoie les notifications et paris créés pendant ce spec.
 * Les notifications n'ont pas de FK vers bets, on filtre sur le payload.
 */
async function cleanNotificationsAndBets() {
	try {
		await dbOwn`DELETE FROM public.notifications WHERE payload LIKE '%[E2E] S070%'`;
	} catch {
		// ignore
	}
	try {
		await dbOwn`
			DELETE FROM public.ledger_entries WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E] S070%'
			)
		`;
	} catch {
		// ignore
	}
	try {
		await dbOwn`DELETE FROM public.bets WHERE title LIKE '[E2E] S070%'`;
	} catch {
		// ignore
	}
}

test.beforeAll(async () => {
	// Reset all accumulated notifications for the seeded users so the badge counts
	// reflect only what this spec creates. (Other specs trigger notify() and never
	// clean the notifications table, so counts grow across full-suite runs.)
	try {
		for (const id of [ALICE_ID, BOB_ID, CAROL_ID, DAVE_ID]) {
			await dbOwn`DELETE FROM public.notifications WHERE user_id = ${id}`;
		}
	} catch {
		// ignore
	}
});

test.afterEach(async () => {
	await cleanNotificationsAndBets();
});

test.afterAll(async () => {
	await cleanNotificationsAndBets();
	await dbOwn.end();
});

// ─── Scénario 1 : Alice défie Bob → Bob a une notif qui mène au duel ─────────

test('Alice défie Bob (yesno) → Bob voit la notification « Alice vous défie » qui mène au duel', async ({
	browser
}) => {
	// === Alice crée le duel ===
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betUrl, betId } = await createDuelViaUi(alicePage, {
		title: '[E2E] S070 Défi Alice Bob'
	});
	await aliceCtx.close();

	// === Bob ouvre la cloche ===
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(GROUP_URL);

	// La cloche est visible dans le header
	await expect(bobPage.getByTestId('notification-bell')).toBeVisible();
	await expect(bobPage.getByTestId('notification-bell-button')).toBeVisible();

	// Bob a au moins une notification non lue → badge visible
	await expect(bobPage.getByTestId('notification-badge')).toBeVisible({ timeout: 5000 });

	// Ouvrir le panneau
	await openBellPanel(bobPage);
	await expect(bobPage.getByTestId('notification-panel')).toBeVisible();

	// La notification de proposition est visible, non lue
	const notif = bobPage.getByTestId('notification-item').filter({
		hasText: 'Alice vous défie sur "[E2E] S070 Défi Alice Bob"'
	});
	await expect(notif).toBeVisible();
	await expect(notif).toHaveAttribute('data-read', 'false');

	// Cliquer la notification → navigue vers la page du duel
	await notif.click();
	await expect(bobPage).toHaveURL(
		new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`)
	);

	await bobCtx.close();
});

// ─── Scénario 2 : Verdict rendu → les deux joueurs ont la notification ───────

test('Verdict rendu → Alice et Bob ont chacun une notification « Verdict rendu »', async ({
	browser
}) => {
	const { betId } = await createYesnoDuelJudgingInDb({
		title: '[E2E] S070 Verdict rendu'
	});

	// Carol vote Alice gagne → déclenche la résolution → notify(participants, verdict_rendered)
	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);
	await carolPage.waitForLoadState('networkidle');

	await expect(carolPage.getByTestId('jury-vote-section')).toBeVisible();
	await carolPage
		.locator('label')
		.filter({ has: carolPage.getByTestId('verdict-winners-selected') })
		.click();
	await carolPage
		.getByTestId('winners-selection')
		.locator('label')
		.filter({ hasText: 'Alice' })
		.locator('input')
		.click();

	const [voteResponse] = await Promise.all([
		carolPage.waitForResponse(
			(r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		carolPage.getByTestId('cast-vote-btn').click()
	]);
	expect(voteResponse.status()).toBe(200);
	await carolPage.waitForLoadState('networkidle');
	await carolCtx.close();

	// === Alice a la notification verdict_rendered ===
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(GROUP_URL);
	await expect(alicePage.getByTestId('notification-badge')).toBeVisible({ timeout: 5000 });
	await openBellPanel(alicePage);
	await expect(alicePage.getByTestId('notification-panel')).toBeVisible();
	await expect(
		alicePage
			.getByTestId('notification-item')
			.filter({ hasText: 'Verdict rendu pour "[E2E] S070 Verdict rendu"' })
	).toBeVisible();
	await aliceCtx.close();

	// === Bob a aussi la notification verdict_rendered ===
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(GROUP_URL);
	await expect(bobPage.getByTestId('notification-badge')).toBeVisible({ timeout: 5000 });
	await openBellPanel(bobPage);
	await expect(bobPage.getByTestId('notification-panel')).toBeVisible();
	await expect(
		bobPage
			.getByTestId('notification-item')
			.filter({ hasText: 'Verdict rendu pour "[E2E] S070 Verdict rendu"' })
	).toBeVisible();
	await bobCtx.close();
});

// ─── Scénario 3 : Marquer lu → badge décroît, persiste après rechargement ─────

test('Cliquer une notification la marque lue, badge décroît, état persiste après reload', async ({
	browser
}) => {
	// Alice crée un duel → Bob a 1 notification non lue
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betId } = await createDuelViaUi(alicePage, {
		title: '[E2E] S070 Marquer lu persistant'
	});
	await aliceCtx.close();

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(GROUP_URL);

	// Badge visible (>=1)
	await expect(bobPage.getByTestId('notification-badge')).toBeVisible({ timeout: 5000 });
	const badgeBeforeText = (await bobPage.getByTestId('notification-badge').textContent()) ?? '';
	const before = parseInt(badgeBeforeText.trim(), 10);
	expect(before).toBeGreaterThanOrEqual(1);

	// Ouvrir le panneau et cliquer la notif
	await openBellPanel(bobPage);
	await expect(bobPage.getByTestId('notification-panel')).toBeVisible();
	const notif = bobPage.getByTestId('notification-item').filter({
		hasText: 'Alice vous défie sur "[E2E] S070 Marquer lu persistant"'
	});
	await expect(notif).toBeVisible();
	await expect(notif).toHaveAttribute('data-read', 'false');
	await notif.click();

	// Navigation vers le duel
	await expect(bobPage).toHaveURL(
		new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`)
	);

	// Revenir au groupe et vérifier que le badge a décru d'au moins 1
	await bobPage.goto(GROUP_URL);
	const badgeAfter = bobPage.getByTestId('notification-badge');
	// Le badge peut avoir disparu (si before==1) ou être plus petit
	if (await badgeAfter.isVisible().catch(() => false)) {
		const afterText = (await badgeAfter.textContent()) ?? '';
		const after = parseInt(afterText.trim(), 10);
		expect(after).toBeLessThan(before);
	} else {
		// badge disparu = 0 non lues, OK
		expect(true).toBe(true);
	}

	// Vérification en DB : la notif est bien marquée lue
	const readRows = await dbOwn`
		SELECT read_at FROM public.notifications
		WHERE user_id = ${BOB_ID} AND payload LIKE '%[E2E] S070 Marquer lu persistant%'
	`;
	expect(readRows.length).toBeGreaterThanOrEqual(1);
	expect(readRows[0].read_at).not.toBeNull();

	// Recharger la page → le badge reste cohérent (état persisté serveur)
	await bobPage.reload();
	// Le badge ne réapparait pas avec la notif déjà lue
	const badgeReload = bobPage.getByTestId('notification-badge');
	if (await badgeReload.isVisible().catch(() => false)) {
		const reloadText = (await badgeReload.textContent()) ?? '';
		const reloadCount = parseInt(reloadText.trim(), 10);
		expect(reloadCount).toBeLessThan(before);
	}

	await bobCtx.close();
});

// ─── Scénario 4 : Les notifications d'Alice ne fuient pas chez Carol ─────────

test('Les notifications liées au défi Alice→Bob ne sont pas visibles chez Carol', async ({
	browser
}) => {
	// Alice crée un duel pour Bob
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await createDuelViaUi(alicePage, {
		title: '[E2E] S070 Pas de fuite Carol'
	});
	await aliceCtx.close();

	// Carol n'a aucune notification concernant ce duel
	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(GROUP_URL);

	// Ouvrir le panneau
	await openBellPanel(carolPage);
	await expect(carolPage.getByTestId('notification-panel')).toBeVisible();

	// Aucune notification ne mentionne ce duel
	await expect(
		carolPage
			.getByTestId('notification-item')
			.filter({ hasText: '[E2E] S070 Pas de fuite Carol' })
	).toHaveCount(0);

	// Vérification en DB : aucune notif pour Carol avec ce payload
	const carolNotifs = await dbOwn`
		SELECT id FROM public.notifications
		WHERE user_id = ${CAROL_ID} AND payload LIKE '%[E2E] S070 Pas de fuite Carol%'
	`;
	expect(carolNotifs.length).toBe(0);

	await carolCtx.close();
});

// ─── Scénario 5 : « Tout marquer lu » disponible ─────────────────────────────

test('« Tout marquer lu » marque toutes les notifications comme lues', async ({ browser }) => {
	// Alice crée 2 duels pour Bob → Bob a 2 notifications
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await createDuelViaUi(alicePage, {
		title: '[E2E] S070 Tout lu 1'
	});
	await createDuelViaUi(alicePage, {
		title: '[E2E] S070 Tout lu 2'
	});
	await aliceCtx.close();

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(GROUP_URL);

	// Badge présent
	await expect(bobPage.getByTestId('notification-badge')).toBeVisible({ timeout: 5000 });

	// Ouvrir le panneau
	await openBellPanel(bobPage);
	await expect(bobPage.getByTestId('notification-panel')).toBeVisible();

	// Bouton « Tout marquer lu » visible
	const markAllBtn = bobPage.getByTestId('mark-all-read');
	await expect(markAllBtn).toBeVisible();
	await markAllBtn.click();

	// Le badge disparaît (compteur à 0)
	await expect(bobPage.getByTestId('notification-badge')).toBeHidden({ timeout: 5000 });

	// Vérification en DB : toutes les notifs [E2E] S070 de Bob sont lues
	const unread = await dbOwn`
		SELECT id FROM public.notifications
		WHERE user_id = ${BOB_ID} AND payload LIKE '%[E2E] S070 Tout lu%'
		  AND read_at IS NULL
	`;
	expect(unread.length).toBe(0);

	await bobCtx.close();
});

// ─── Scénario 6 : Polling — une notif émise apparaît à l'ouverture du panneau ─

test('Une notification émise pendant la session apparaît en ouvrant le panneau (pas de reload)', async ({
	browser
}) => {
	// Bob est connecté, sur le groupe, badge éventuellement vide au départ
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(GROUP_URL);

	// Alice crée un duel pour Bob pendant que Bob a la page ouverte
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await createDuelViaUi(alicePage, {
		title: '[E2E] S070 Polling apparition'
	});
	await aliceCtx.close();

	// Bob ouvre le panneau : fetchNotifications() est appelée à l'ouverture,
	// la nouvelle notif doit apparaître sans rechargement complet.
	await openBellPanel(bobPage);
	await expect(bobPage.getByTestId('notification-panel')).toBeVisible();

	await expect(
		bobPage
			.getByTestId('notification-item')
			.filter({ hasText: 'Alice vous défie sur "[E2E] S070 Polling apparition"' })
	).toBeVisible({ timeout: 5000 });

	await bobCtx.close();
});

// ─── Scénario 7 : État vide — panneau sans notification ──────────────────────

test("Panneau affiche un état vide quand l'utilisateur n'a aucune notification", async ({
	page
}) => {
	// Dave n'est pas dans le groupe seedé et n'a aucune notif [E2E]
	// Nettoyer toute notif résiduelle de Dave pour garantir l'état vide.
	await dbOwn`DELETE FROM public.notifications WHERE user_id = ${DAVE_ID}`;
	await login(page, 'dave');
	await page.goto('/');

	await expect(page.getByTestId('notification-bell')).toBeVisible();
	// Pas de badge (Dave n'a pas de notif)
	await expect(page.getByTestId('notification-badge')).toBeHidden();

	// Ouvrir le panneau → message « Aucune notification »
	await openBellPanel(page);
	await expect(page.getByTestId('notification-panel')).toBeVisible();
	await expect(page.getByText(/aucune notification/i)).toBeVisible();
});
