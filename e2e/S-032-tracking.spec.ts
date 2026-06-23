/**
 * S-032 — Tracking PostHog (Défi ouvert / mode=open)
 *
 * Events instrumentés dans cette story :
 *   Serveur :
 *     - bet_created  { bet_id, group_id, bet_type:'yesno', yesno_mode:'open',
 *                      stake_type, jury_mode, max_opponents }
 *       — émis après createOpenChallenge() dans la form action
 *     - open_challenge_accepted  { bet_id, match_id, group_id }
 *       — émis après acceptOpenChallenge() dans la form action accept_open_challenge
 *
 *   Client :
 *     - duel_form_opened  { group_id, mode }
 *       — au montage du formulaire /bets/new/yesno (la prop `mode` a été ajoutée en S-032)
 *
 * Ce spec vérifie l'envoi réel de chaque event via le sink DB (serveur)
 * et le spy window.__playwright_trackSpy (client).
 */
import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { interceptPosthog, readServerEvents, clearServerEvents } from './helpers/analytics';

// IDs seedés (cf. supabase/seed.sql)
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;
const NEW_YESNO_URL = `${GROUP_URL}/bets/new/yesno`;

// ─── Helper : remplit un champ Svelte 5 bind:value en headless ───────────────

async function svelteFill(page: Page, testId: string, value: string): Promise<void> {
	await page.evaluate(
		([tid, val]: [string, string]) => {
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
		[testId, value] as [string, string]
	);
}

/**
 * Crée un défi ouvert via le formulaire et retourne le betId.
 * Réutilisé par les tests qui ont besoin d'un défi existant.
 */
async function createOpenChallenge(
	page: Page,
	opts: {
		title: string;
		visibilityIds?: string[];
		maxOpponents?: number;
		stakeCreator?: string;
		stakeOpponent?: string;
		juryId?: string;
	}
): Promise<{ betUrl: string; betId: string }> {
	await page.goto(NEW_YESNO_URL);
	await page.waitForLoadState('networkidle');

	// Passer en mode open
	await page.getByTestId('mode-open').click();
	await expect(page.getByTestId('visibility-section')).toBeVisible({ timeout: 5000 });

	// Titre
	await svelteFill(page, 'input-title', opts.title);

	// Choix
	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');

	// Visibilité
	const visibilityIds = opts.visibilityIds ?? [BOB_ID, CAROL_ID];
	for (const userId of visibilityIds) {
		await page.getByTestId(`visibility-member-${userId}`).getByRole('checkbox').check();
	}

	// Max adversaires
	await page.getByTestId('input-max-opponents').fill(String(opts.maxOpponents ?? 2));

	// Mises
	await page.getByTestId('input-stake-creator').fill(opts.stakeCreator ?? '10');
	await page.getByTestId('input-stake-opponent').fill(opts.stakeOpponent ?? '5');

	// Jury
	const juryId = opts.juryId ?? CAROL_ID;
	await page.getByTestId(`jury-member-${juryId}`).getByRole('checkbox').check();

	// Soumettre
	await page.getByTestId('submit-btn').click();
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const betUrl = page.url();
	const betId = betUrl.split('/bets/')[1];
	return { betUrl, betId };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

test.beforeEach(async () => {
	await clearServerEvents(db);
});

test.afterEach(async () => {
	try {
		await db`DELETE FROM public.bets WHERE title LIKE '[E2E-tracking-032]%'`;
	} catch {
		// Ignore cleanup errors
	}
	await clearServerEvents(db);
});

test.afterAll(async () => {
	try {
		await db`DELETE FROM public.bets WHERE title LIKE '[E2E-tracking-032]%'`;
	} catch {
		// Ignore
	}
});

// ─── Event serveur : bet_created (mode=open) ─────────────────────────────────

test('bet_created — event serveur émis après création du défi ouvert', async ({ page }) => {
	await login(page, 'alice');

	await createOpenChallenge(page, {
		title: '[E2E-tracking-032] bet_created open',
		maxOpponents: 2,
		stakeCreator: '10',
		stakeOpponent: '5'
	});

	const events = await readServerEvents(db, { event: 'bet_created', distinctId: ALICE_ID });
	expect(events.length).toBeGreaterThanOrEqual(1);

	const ev = events[events.length - 1];
	expect(ev.event).toBe('bet_created');
	expect(ev.distinct_id).toBe(ALICE_ID);

	const props = ev.properties as Record<string, unknown>;
	expect(props['group_id']).toBe(SEEDED_GROUP_ID);
	expect(props['bet_type']).toBe('yesno');
	expect(props['yesno_mode']).toBe('open');
	expect(props['stake_type']).toBe('points');
});

test('bet_created — properties : max_opponents, jury_mode présents avec valeurs correctes', async ({
	page
}) => {
	await login(page, 'alice');

	await createOpenChallenge(page, {
		title: '[E2E-tracking-032] bet_created props',
		maxOpponents: 3,
		stakeCreator: '10',
		stakeOpponent: '5'
	});

	const events = await readServerEvents(db, { event: 'bet_created', distinctId: ALICE_ID });
	expect(events.length).toBeGreaterThanOrEqual(1);

	const props = events[events.length - 1].properties as Record<string, unknown>;
	expect(props['yesno_mode']).toBe('open');
	// max_opponents doit correspondre à ce qu'on a saisi
	expect(props['max_opponents']).toBe(3);
	// jury_mode doit être défini (majority par défaut)
	expect(props['jury_mode']).toBeDefined();
});

test('bet_created — distinct_id = UUID Supabase d\'Alice (pas de PII)', async ({ page }) => {
	await login(page, 'alice');

	await createOpenChallenge(page, {
		title: '[E2E-tracking-032] bet_created distinct_id'
	});

	const events = await readServerEvents(db, { event: 'bet_created', distinctId: ALICE_ID });
	expect(events.length).toBeGreaterThanOrEqual(1);

	const ev = events[events.length - 1];
	// distinct_id est un UUID Supabase valide
	expect(ev.distinct_id).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
	);
	expect(ev.distinct_id).toBe(ALICE_ID);

	// Pas d'email dans les properties
	const propsStr = JSON.stringify(ev.properties);
	expect(propsStr).not.toContain('@');
	expect(propsStr).not.toContain('alice@test.local');
});

test('bet_created — aucun event si la validation échoue (pas de jury)', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);
	await page.waitForLoadState('networkidle');

	// Mode open
	await page.getByTestId('mode-open').click();
	await expect(page.getByTestId('visibility-section')).toBeVisible({ timeout: 5000 });

	await svelteFill(page, 'input-title', '[E2E-tracking-032] Sans jury');
	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');
	await page.getByTestId(`visibility-member-${BOB_ID}`).getByRole('checkbox').check();
	await page.getByTestId('input-max-opponents').fill('1');
	await page.getByTestId('input-stake-creator').fill('10');
	await page.getByTestId('input-stake-opponent').fill('5');
	// Pas de jury coché

	await page.getByTestId('submit-btn').click();

	// Erreur visible, pas de redirection
	await expect(page.getByTestId('form-error')).toBeVisible();

	// Aucun event bet_created ne doit avoir été émis
	const events = await readServerEvents(db, { event: 'bet_created' });
	expect(events.length).toBe(0);
});

test('bet_created — stake_type=forfeit quand défi créé avec gage', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);
	await page.waitForLoadState('networkidle');

	// Mode open
	await page.getByTestId('mode-open').click();
	await expect(page.getByTestId('visibility-section')).toBeVisible({ timeout: 5000 });

	await svelteFill(page, 'input-title', '[E2E-tracking-032] bet_created forfeit');
	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');
	await page.getByTestId(`visibility-member-${BOB_ID}`).getByRole('checkbox').check();
	await page.getByTestId(`visibility-member-${CAROL_ID}`).getByRole('checkbox').check();
	await page.getByTestId('input-max-opponents').fill('2');

	// Passer en mode gage
	await page.getByTestId('stake-type-forfeit').click();
	await svelteFill(page, 'input-forfeit-creator', 'Je fais la vaisselle');
	await svelteFill(page, 'input-forfeit-opponent', 'Il paie la tournée');

	// Jury
	await page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox').check();

	await page.getByTestId('submit-btn').click();
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const events = await readServerEvents(db, { event: 'bet_created', distinctId: ALICE_ID });
	expect(events.length).toBeGreaterThanOrEqual(1);

	const props = events[events.length - 1].properties as Record<string, unknown>;
	expect(props['stake_type']).toBe('forfeit');
	expect(props['yesno_mode']).toBe('open');
});

// ─── Event serveur : open_challenge_accepted ─────────────────────────────────

test('open_challenge_accepted — event serveur émis quand Bob accepte le défi', async ({
	browser
}) => {
	// Alice crée le défi
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betUrl, betId } = await createOpenChallenge(alicePage, {
		title: '[E2E-tracking-032] open_challenge_accepted bob',
		maxOpponents: 2
	});
	await aliceCtx.close();

	// Bob accepte
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(betUrl);
	await bobPage.getByTestId('accept-open-btn').click();
	await expect(bobPage.getByTestId('already-accepted-msg')).toBeVisible({ timeout: 10000 });
	await bobCtx.close();

	// Vérifier l'event dans le sink DB
	const events = await readServerEvents(db, {
		event: 'open_challenge_accepted',
		distinctId: BOB_ID
	});
	expect(events.length).toBeGreaterThanOrEqual(1);

	const ev = events[events.length - 1];
	expect(ev.event).toBe('open_challenge_accepted');
	expect(ev.distinct_id).toBe(BOB_ID);

	const props = ev.properties as Record<string, unknown>;
	expect(props['bet_id']).toBe(betId);
	expect(props['group_id']).toBe(SEEDED_GROUP_ID);
	// match_id doit être présent et être un UUID valide
	expect(typeof props['match_id']).toBe('string');
	expect(String(props['match_id'])).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
	);
});

test('open_challenge_accepted — distinct_id = Bob (accepteur), pas Alice (créatrice)', async ({
	browser
}) => {
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betUrl } = await createOpenChallenge(alicePage, {
		title: '[E2E-tracking-032] open_challenge_accepted distinct_id'
	});
	await aliceCtx.close();

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(betUrl);
	await bobPage.getByTestId('accept-open-btn').click();
	await expect(bobPage.getByTestId('already-accepted-msg')).toBeVisible({ timeout: 10000 });
	await bobCtx.close();

	// Bob a son event
	const bobEvents = await readServerEvents(db, {
		event: 'open_challenge_accepted',
		distinctId: BOB_ID
	});
	expect(bobEvents.length).toBeGreaterThanOrEqual(1);

	// Alice n'a PAS d'event open_challenge_accepted (elle est la créatrice)
	const aliceEvents = await readServerEvents(db, {
		event: 'open_challenge_accepted',
		distinctId: ALICE_ID
	});
	expect(aliceEvents.length).toBe(0);
});

test('open_challenge_accepted — deux events émis quand Bob et Carol acceptent', async ({
	browser
}) => {
	// Alice crée le défi
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betUrl, betId } = await createOpenChallenge(alicePage, {
		title: '[E2E-tracking-032] open_challenge_accepted 2x',
		maxOpponents: 2
	});
	await aliceCtx.close();

	// Bob accepte
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(betUrl);
	await bobPage.getByTestId('accept-open-btn').click();
	await expect(bobPage.getByTestId('already-accepted-msg')).toBeVisible({ timeout: 10000 });
	await bobCtx.close();

	// Carol accepte
	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(betUrl);
	await carolPage.getByTestId('accept-open-btn').click();
	await expect(carolPage.getByTestId('already-accepted-msg')).toBeVisible({ timeout: 10000 });
	await carolCtx.close();

	// 2 events open_challenge_accepted (un par accepteur)
	const allEvents = await readServerEvents(db, { event: 'open_challenge_accepted' });
	expect(allEvents.length).toBe(2);

	const distinctIds = allEvents.map((e) => e.distinct_id);
	expect(distinctIds).toContain(BOB_ID);
	expect(distinctIds).toContain(CAROL_ID);

	// Chaque event a le bon bet_id et group_id
	for (const ev of allEvents) {
		const props = ev.properties as Record<string, unknown>;
		expect(props['bet_id']).toBe(betId);
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
		expect(props['match_id']).toBeTruthy();
	}
});

test('open_challenge_accepted — aucun event si le défi est complet (max atteint)', async ({
	browser
}) => {
	// Alice crée un défi max 1
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betUrl } = await createOpenChallenge(alicePage, {
		title: '[E2E-tracking-032] max atteint no event',
		visibilityIds: [BOB_ID, CAROL_ID],
		maxOpponents: 1
	});
	await aliceCtx.close();

	// Bob accepte (le 1er — défi complet)
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(betUrl);
	await bobPage.getByTestId('accept-open-btn').click();
	await expect(bobPage.getByTestId('open-challenge-full-msg')).toBeVisible({ timeout: 10000 });
	await bobCtx.close();

	// Vider les events pour isoler ce qu'émettra Carol
	await clearServerEvents(db);

	// Carol tente d'accepter — le serveur doit refuser (défi complet)
	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(betUrl);
	// Carol voit "Défi complet" — le bouton Accepter n'est pas visible
	await expect(carolPage.getByTestId('open-challenge-full-static')).toBeVisible({ timeout: 10000 });
	await carolCtx.close();

	// Aucun event open_challenge_accepted ne doit avoir été émis pour Carol
	const carolEvents = await readServerEvents(db, {
		event: 'open_challenge_accepted',
		distinctId: CAROL_ID
	});
	expect(carolEvents.length).toBe(0);
});

// ─── Event client : duel_form_opened avec prop mode ──────────────────────────

test('duel_form_opened — mode=duel (défaut) envoyé dans les properties', async ({ page }) => {
	// interceptPosthog AVANT toute navigation
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
	await exposeSpyPromise;

	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);
	await page.waitForLoadState('networkidle');
	// Attendre l'hydratation Svelte et l'exécution de l'$effect
	await page.waitForTimeout(500);

	const events = getCapturedEvents();
	const ev = events.find((e) => e.event === 'duel_form_opened');
	expect(ev).toBeDefined();
	expect(ev!.properties['group_id']).toBe(SEEDED_GROUP_ID);
	// En mode duel (défaut), mode doit être 'duel'
	expect(ev!.properties['mode']).toBe('duel');
});

test('duel_form_opened — mode=open envoyé dans les properties quand on bascule en mode open', async ({
	page
}) => {
	// interceptPosthog AVANT toute navigation
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
	await exposeSpyPromise;

	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(300);

	// Basculer en mode open → l'$effect se re-déclenche avec mode='open'
	await page.getByTestId('mode-open').click();
	await expect(page.getByTestId('visibility-section')).toBeVisible({ timeout: 5000 });
	await page.waitForTimeout(300);

	const events = getCapturedEvents();
	// Il doit y avoir au moins un event duel_form_opened avec mode='open'
	const openEv = events.filter(
		(e) => e.event === 'duel_form_opened' && e.properties['mode'] === 'open'
	);
	expect(openEv.length).toBeGreaterThanOrEqual(1);
	expect(openEv[openEv.length - 1].properties['group_id']).toBe(SEEDED_GROUP_ID);
});

test('duel_form_opened — group_id est un UUID valide', async ({ page }) => {
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
	await exposeSpyPromise;

	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(500);

	const events = getCapturedEvents();
	const ev = events.find((e) => e.event === 'duel_form_opened');
	expect(ev).toBeDefined();

	const groupId = String(ev!.properties['group_id']);
	expect(groupId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
	expect(groupId).toBe(SEEDED_GROUP_ID);
});

// ─── Cohérence distinct_id client/serveur ────────────────────────────────────

test('distinct_id cohérent : bet_created (serveur) = UUID Supabase d\'Alice', async ({ page }) => {
	await login(page, 'alice');

	await createOpenChallenge(page, {
		title: '[E2E-tracking-032] consistent distinct_id'
	});

	const events = await readServerEvents(db, { event: 'bet_created', distinctId: ALICE_ID });
	expect(events.length).toBeGreaterThanOrEqual(1);

	// Tous les events bet_created ont le distinct_id d'Alice
	expect(events.every((e) => e.distinct_id === ALICE_ID)).toBe(true);
});
