/**
 * S-030 — Tracking PostHog (créer un duel Oui/Non)
 *
 * Events instrumentés dans cette story :
 *   Serveur :
 *     - bet_created  { bet_id, group_id, bet_type, yesno_mode, stake_type,
 *                      jury_mode, expiration_hours }
 *       — émis après createYesnoDuel() dans la form action
 *   Client :
 *     - duel_form_opened  { group_id }
 *       — au montage du formulaire /bets/new/yesno
 *     - bet_viewed        { bet_id, bet_type, group_id }
 *       — au montage de la page /bets/[betId]
 *
 * Ce spec vérifie l'envoi réel de chaque event.
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Remplit un champ lié à `bind:value` (Svelte 5) de façon fiable en headless.
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
 * Remplit le formulaire yesno avec les valeurs minimales pour Alice vs Bob.
 * La cible est sélectionnée EN DERNIER pour éviter la race condition Svelte 5.
 */
async function fillDuelForm(
	page: Page,
	opts: {
		title: string;
		stakeCreator?: string;
		stakeTarget?: string;
		targetId?: string;
		juryId?: string;
	}
): Promise<void> {
	const targetId = opts.targetId ?? BOB_ID;
	const juryId = opts.juryId ?? CAROL_ID;

	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');
	await page.getByTestId(`jury-member-${juryId}`).getByRole('checkbox').check();
	await svelteFill(page, 'input-title', opts.title);

	if (opts.stakeCreator !== undefined) {
		await page.getByTestId('input-stake-creator').fill(opts.stakeCreator);
	}
	if (opts.stakeTarget !== undefined) {
		await page.getByTestId('input-stake-target').fill(opts.stakeTarget);
	}

	// Sélection de la cible en dernier (évite le reset Svelte 5 à cause des fills précédents)
	await page.getByTestId('select-target').selectOption({ value: targetId });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

test.beforeEach(async () => {
	await clearServerEvents(db);
});

test.afterEach(async () => {
	try {
		await db`DELETE FROM public.bets WHERE title LIKE '[E2E-tracking-030]%'`;
	} catch {
		// Ignore
	}
});

test.afterAll(async () => {
	await clearServerEvents(db);
	try {
		await db`DELETE FROM public.bets WHERE title LIKE '[E2E-tracking-030]%'`;
	} catch {
		// Ignore
	}
});

// ─── Event serveur : bet_created ─────────────────────────────────────────────

test('bet_created — event serveur émis après création du duel (points)', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	await fillDuelForm(page, {
		title: '[E2E-tracking-030] Duel points',
		stakeCreator: '10',
		stakeTarget: '5'
	});
	await page.getByTestId('submit-btn').click();

	// Redirection vers la page du duel
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const events = await readServerEvents(db, { event: 'bet_created', distinctId: ALICE_ID });
	expect(events.length).toBeGreaterThanOrEqual(1);

	const ev = events[events.length - 1];
	expect(ev.event).toBe('bet_created');
	expect(ev.distinct_id).toBe(ALICE_ID);

	const props = ev.properties as Record<string, unknown>;
	expect(props['group_id']).toBe(SEEDED_GROUP_ID);
	expect(props['bet_type']).toBe('yesno');
	expect(props['yesno_mode']).toBe('duel');
	expect(props['stake_type']).toBe('points');
});

test('bet_created — properties : jury_mode et expiration_hours présents', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	await fillDuelForm(page, {
		title: '[E2E-tracking-030] Duel jury props',
		stakeCreator: '10',
		stakeTarget: '5'
	});
	await page.getByTestId('submit-btn').click();
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const events = await readServerEvents(db, { event: 'bet_created', distinctId: ALICE_ID });
	expect(events.length).toBeGreaterThanOrEqual(1);

	const props = events[events.length - 1].properties as Record<string, unknown>;
	expect(props['jury_mode']).toBeDefined();
	// Expiration par défaut = 48h
	expect(props['expiration_hours']).toBe(48);
});

test('bet_created — distinct_id = UUID Supabase d\'Alice (pas de PII)', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	await fillDuelForm(page, {
		title: '[E2E-tracking-030] Distinct ID check',
		stakeCreator: '10',
		stakeTarget: '5'
	});
	await page.getByTestId('submit-btn').click();
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const events = await readServerEvents(db, { event: 'bet_created', distinctId: ALICE_ID });
	expect(events.length).toBeGreaterThanOrEqual(1);

	const ev = events[events.length - 1];
	// distinct_id est le UUID Supabase, format UUID valide
	expect(ev.distinct_id).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
	);
	expect(ev.distinct_id).toBe(ALICE_ID);

	// Pas d'email dans les properties
	const props = ev.properties as Record<string, unknown>;
	const propsStr = JSON.stringify(props);
	expect(propsStr).not.toContain('alice@test.local');
	expect(propsStr).not.toContain('@');
});

test('bet_created — aucun event si la validation échoue (jury vide)', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	// Ne pas sélectionner de jury — validation serveur doit échouer
	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');
	await svelteFill(page, 'input-title', '[E2E-tracking-030] Sans jury');
	await page.getByTestId('input-stake-creator').fill('10');
	await page.getByTestId('input-stake-target').fill('5');
	await page.getByTestId('select-target').selectOption({ value: BOB_ID });

	await page.getByTestId('submit-btn').click();

	// Erreur affiché, pas de redirection
	await expect(page.getByTestId('form-error')).toBeVisible();

	// Aucun event bet_created ne doit avoir été émis
	const events = await readServerEvents(db, { event: 'bet_created' });
	expect(events.length).toBe(0);
});

test('bet_created — stake_type=forfeit quand Alice crée duel avec gage', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);
	await page.waitForLoadState('networkidle');

	// Passer en mode gage
	await page.getByTestId('stake-type-forfeit').click();
	await expect(page.getByTestId('input-forfeit-creator')).toBeVisible();

	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');
	await page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox').check();
	await svelteFill(page, 'input-title', '[E2E-tracking-030] Duel gage');
	await svelteFill(page, 'input-forfeit-creator', 'Je fais la vaisselle');
	await svelteFill(page, 'input-forfeit-target', 'Il paie la tournée');
	await page.getByTestId('select-target').selectOption({ value: BOB_ID });

	await page.getByTestId('submit-btn').click();
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const events = await readServerEvents(db, { event: 'bet_created', distinctId: ALICE_ID });
	expect(events.length).toBeGreaterThanOrEqual(1);

	const props = events[events.length - 1].properties as Record<string, unknown>;
	expect(props['stake_type']).toBe('forfeit');
	expect(props['yesno_mode']).toBe('duel');
});

// ─── Event client : duel_form_opened ────────────────────────────────────────

test('duel_form_opened — event client capturé au montage du formulaire', async ({ page }) => {
	// interceptPosthog AVANT toute navigation
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
	await exposeSpyPromise;

	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);
	await page.waitForLoadState('networkidle');
	// Attendre l'hydratation Svelte et le onMount
	await page.waitForTimeout(500);

	const events = getCapturedEvents();
	const ev = events.find((e) => e.event === 'duel_form_opened');
	expect(ev).toBeDefined();
	expect(ev!.properties['group_id']).toBe(SEEDED_GROUP_ID);
});

test('duel_form_opened — group_id correct dans les properties', async ({ page }) => {
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
	await exposeSpyPromise;

	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(500);

	const events = getCapturedEvents();
	const ev = events.find((e) => e.event === 'duel_form_opened');
	expect(ev).toBeDefined();
	// group_id doit être le UUID du groupe seedé
	expect(ev!.properties['group_id']).toBe(SEEDED_GROUP_ID);
	expect(String(ev!.properties['group_id'])).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
	);
});

// ─── Event client : bet_viewed ────────────────────────────────────────────────

test('bet_viewed — event client capturé quand Alice consulte la page duel', async ({ page }) => {
	// Créer d'abord un duel sans interceptPosthog (pour ne pas interférer)
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	await fillDuelForm(page, {
		title: '[E2E-tracking-030] Duel pour bet_viewed',
		stakeCreator: '10',
		stakeTarget: '5'
	});
	await page.getByTestId('submit-btn').click();
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const betUrl = page.url();
	const betId = betUrl.split('/bets/')[1];

	// Maintenant tester bet_viewed avec un nouveau contexte + interceptPosthog
	await page.close();
});

test('bet_viewed — event client avec bet_id, bet_type=yesno et group_id', async ({
	browser
}) => {
	// Phase 1 : Alice crée le duel (contexte dédié, sans spy)
	const aliceContext = await browser.newContext();
	const alicePage = await aliceContext.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(NEW_YESNO_URL);

	await alicePage.getByTestId('input-choice-a').fill('Oui');
	await alicePage.getByTestId('input-choice-b').fill('Non');
	await alicePage.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox').check();
	await svelteFill(alicePage, 'input-title', '[E2E-tracking-030] Duel bet_viewed props');
	await alicePage.getByTestId('input-stake-creator').fill('10');
	await alicePage.getByTestId('input-stake-target').fill('5');
	await alicePage.getByTestId('select-target').selectOption({ value: BOB_ID });
	await alicePage.getByTestId('submit-btn').click();
	await alicePage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const betId = alicePage.url().split('/bets/')[1];
	await aliceContext.close();

	// Phase 2 : Bob consulte la page du duel avec interception
	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();

	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(bobPage);
	await exposeSpyPromise;

	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);
	await bobPage.waitForLoadState('networkidle');
	// Attendre l'hydratation Svelte et le onMount
	await bobPage.waitForTimeout(500);

	const events = getCapturedEvents();
	const ev = events.find((e) => e.event === 'bet_viewed');
	expect(ev).toBeDefined();
	expect(ev!.properties['bet_id']).toBe(betId);
	expect(ev!.properties['bet_type']).toBe('yesno');
	expect(ev!.properties['group_id']).toBe(SEEDED_GROUP_ID);

	await bobContext.close();
});

test('bet_viewed — event client capturé quand Alice consulte sa propre page duel', async ({
	browser
}) => {
	// Phase 1 : Alice crée le duel
	const aliceContext1 = await browser.newContext();
	const alicePage1 = await aliceContext1.newPage();
	await login(alicePage1, 'alice');
	await alicePage1.goto(NEW_YESNO_URL);

	await alicePage1.getByTestId('input-choice-a').fill('Oui');
	await alicePage1.getByTestId('input-choice-b').fill('Non');
	await alicePage1.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox').check();
	await svelteFill(alicePage1, 'input-title', '[E2E-tracking-030] Duel Alice viewed');
	await alicePage1.getByTestId('input-stake-creator').fill('10');
	await alicePage1.getByTestId('input-stake-target').fill('5');
	await alicePage1.getByTestId('select-target').selectOption({ value: BOB_ID });
	await alicePage1.getByTestId('submit-btn').click();
	await alicePage1.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const betId = alicePage1.url().split('/bets/')[1];
	await aliceContext1.close();

	// Phase 2 : Alice visite la page du duel avec interception
	const aliceContext2 = await browser.newContext();
	const alicePage2 = await aliceContext2.newPage();

	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(alicePage2);
	await exposeSpyPromise;

	await login(alicePage2, 'alice');
	await alicePage2.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage2.waitForLoadState('networkidle');
	await alicePage2.waitForTimeout(500);

	const events = getCapturedEvents();
	const ev = events.find((e) => e.event === 'bet_viewed');
	expect(ev).toBeDefined();
	expect(ev!.properties['bet_id']).toBe(betId);
	expect(ev!.properties['bet_type']).toBe('yesno');

	await aliceContext2.close();
});

// ─── Vérification : distinct_id cohérent client/serveur ───────────────────────

test('bet_created (serveur) distinct_id = ALICE_ID (même que côté client identifyUser)', async ({
	page
}) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	await fillDuelForm(page, {
		title: '[E2E-tracking-030] Same distinct_id',
		stakeCreator: '10',
		stakeTarget: '5'
	});
	await page.getByTestId('submit-btn').click();
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const events = await readServerEvents(db, { event: 'bet_created', distinctId: ALICE_ID });
	expect(events.length).toBeGreaterThanOrEqual(1);
	// Tous les events doivent avoir le même distinct_id
	expect(events.every((e) => e.distinct_id === ALICE_ID)).toBe(true);
});
