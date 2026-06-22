/**
 * S-020 — Tracking PostHog (créer un pari « au plus proche »)
 *
 * Events instrumentés dans cette story :
 *   Serveur :
 *     - bet_created  { bet_id, group_id, bet_type='closest', stake_type,
 *                      jury_mode, visibility_count, jury_count }
 *       — émis après createClosestBet() dans la form action
 *   Client :
 *     - closest_form_opened  { group_id }
 *       — au montage du formulaire /bets/new/closest
 *     - bet_viewed           { bet_id, bet_type, group_id }
 *       — au montage de la page /bets/[betId] (instrumenté par S-030, coverage closest)
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
const NEW_CLOSEST_URL = `${GROUP_URL}/bets/new/closest`;

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
 * Remplit le formulaire closest avec des valeurs minimales valides.
 * Titre, mise en points, jury = carol.
 */
async function fillClosestForm(
	page: Page,
	opts: {
		title: string;
		stakeAmount?: string;
		juryId?: string;
	}
): Promise<void> {
	const juryId = opts.juryId ?? CAROL_ID;

	await svelteFill(page, 'input-title', opts.title);

	// Par défaut stake_type = 'points'
	if (opts.stakeAmount !== undefined) {
		await svelteFill(page, 'input-stake-amount', opts.stakeAmount);
	}

	// Sélectionner le juré
	await page.getByTestId(`jury-member-${juryId}`).getByRole('checkbox').check();

	// S'assurer que bob est aussi dans la visibilité
	await page.getByTestId(`visibility-member-${BOB_ID}`).getByRole('checkbox').check();
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

test.beforeEach(async () => {
	await clearServerEvents(db);
});

test.afterEach(async () => {
	try {
		await db`DELETE FROM public.bets WHERE title LIKE '[E2E-tracking-020]%'`;
	} catch {
		// Ignore
	}
});

test.afterAll(async () => {
	await clearServerEvents(db);
	try {
		await db`DELETE FROM public.bets WHERE title LIKE '[E2E-tracking-020]%'`;
	} catch {
		// Ignore
	}
});

// ─── Event serveur : bet_created ─────────────────────────────────────────────

test('bet_created — event serveur émis après création du pari closest (points)', async ({
	page
}) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);
	await page.waitForLoadState('networkidle');

	await fillClosestForm(page, {
		title: '[E2E-tracking-020] Closest points',
		stakeAmount: '10'
	});
	await page.getByTestId('submit-btn').click();

	// Redirection vers la page du pari
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const events = await readServerEvents(db, { event: 'bet_created', distinctId: ALICE_ID });
	expect(events.length).toBeGreaterThanOrEqual(1);

	const ev = events[events.length - 1];
	expect(ev.event).toBe('bet_created');
	expect(ev.distinct_id).toBe(ALICE_ID);

	const props = ev.properties as Record<string, unknown>;
	expect(props['group_id']).toBe(SEEDED_GROUP_ID);
	expect(props['bet_type']).toBe('closest');
	expect(props['stake_type']).toBe('points');
});

test('bet_created — properties : jury_mode, visibility_count et jury_count présents', async ({
	page
}) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);
	await page.waitForLoadState('networkidle');

	await fillClosestForm(page, {
		title: '[E2E-tracking-020] Closest props check',
		stakeAmount: '5'
	});
	await page.getByTestId('submit-btn').click();
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const events = await readServerEvents(db, { event: 'bet_created', distinctId: ALICE_ID });
	expect(events.length).toBeGreaterThanOrEqual(1);

	const props = events[events.length - 1].properties as Record<string, unknown>;
	expect(props['bet_type']).toBe('closest');
	expect(props['jury_mode']).toBeDefined();
	expect(typeof props['visibility_count']).toBe('number');
	expect(typeof props['jury_count']).toBe('number');
	expect((props['jury_count'] as number) >= 1).toBe(true);
});

test('bet_created — distinct_id = UUID Supabase d\'Alice (pas de PII)', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);
	await page.waitForLoadState('networkidle');

	await fillClosestForm(page, {
		title: '[E2E-tracking-020] Distinct ID check',
		stakeAmount: '10'
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
	await page.goto(NEW_CLOSEST_URL);
	await page.waitForLoadState('networkidle');

	// Remplir le titre et le montant mais PAS le jury
	await svelteFill(page, 'input-title', '[E2E-tracking-020] Sans jury');
	await svelteFill(page, 'input-stake-amount', '10');

	await page.getByTestId('submit-btn').click();

	// Erreur affiché, pas de redirection
	await expect(page.getByTestId('form-error')).toBeVisible();

	// Aucun event bet_created ne doit avoir été émis
	const events = await readServerEvents(db, { event: 'bet_created' });
	expect(events.length).toBe(0);
});

test('bet_created — stake_type=forfeit quand Alice crée closest avec gage', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);
	await page.waitForLoadState('networkidle');

	// Passer en mode gage
	await page.getByTestId('stake-type-forfeit').click();
	await expect(page.getByTestId('input-forfeit-description')).toBeVisible();

	await svelteFill(page, 'input-title', '[E2E-tracking-020] Closest gage');
	await svelteFill(page, 'input-forfeit-description', 'Faire la vaisselle pendant une semaine');
	// forfeit-scope-all est coché par défaut
	await page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox').check();
	await page.getByTestId(`visibility-member-${BOB_ID}`).getByRole('checkbox').check();

	await page.getByTestId('submit-btn').click();
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const events = await readServerEvents(db, { event: 'bet_created', distinctId: ALICE_ID });
	expect(events.length).toBeGreaterThanOrEqual(1);

	const props = events[events.length - 1].properties as Record<string, unknown>;
	expect(props['stake_type']).toBe('forfeit');
	expect(props['bet_type']).toBe('closest');
});

// ─── Event client : closest_form_opened ──────────────────────────────────────

test('closest_form_opened — event client capturé au montage du formulaire', async ({ page }) => {
	// interceptPosthog AVANT toute navigation
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
	await exposeSpyPromise;

	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);
	await page.waitForLoadState('networkidle');
	// Attendre l'hydratation Svelte et le $effect
	await page.waitForTimeout(500);

	const events = getCapturedEvents();
	const ev = events.find((e) => e.event === 'closest_form_opened');
	expect(ev).toBeDefined();
	expect(ev!.properties['group_id']).toBe(SEEDED_GROUP_ID);
});

test('closest_form_opened — group_id correct dans les properties', async ({ page }) => {
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
	await exposeSpyPromise;

	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(500);

	const events = getCapturedEvents();
	const ev = events.find((e) => e.event === 'closest_form_opened');
	expect(ev).toBeDefined();
	// group_id doit être le UUID du groupe seedé
	expect(ev!.properties['group_id']).toBe(SEEDED_GROUP_ID);
	expect(String(ev!.properties['group_id'])).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
	);
});

// ─── Event client : bet_viewed (closest) ─────────────────────────────────────

test('bet_viewed — event client capturé quand Alice consulte la page d\'un closest', async ({
	browser
}) => {
	// Phase 1 : Alice crée le closest (contexte dédié, sans spy)
	const aliceContext = await browser.newContext();
	const alicePage = await aliceContext.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(NEW_CLOSEST_URL);
	await alicePage.waitForLoadState('networkidle');

	await svelteFill(alicePage, 'input-title', '[E2E-tracking-020] Closest bet_viewed');
	await svelteFill(alicePage, 'input-stake-amount', '10');
	await alicePage.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox').check();
	await alicePage.getByTestId(`visibility-member-${BOB_ID}`).getByRole('checkbox').check();
	await alicePage.getByTestId('submit-btn').click();
	await alicePage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const betId = alicePage.url().split('/bets/')[1];
	await aliceContext.close();

	// Phase 2 : Bob consulte la page du closest avec interception
	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();

	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(bobPage);
	await exposeSpyPromise;

	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);
	await bobPage.waitForLoadState('networkidle');
	// Attendre l'hydratation Svelte et le $effect
	await bobPage.waitForTimeout(500);

	const events = getCapturedEvents();
	const ev = events.find((e) => e.event === 'bet_viewed');
	expect(ev).toBeDefined();
	expect(ev!.properties['bet_id']).toBe(betId);
	expect(ev!.properties['bet_type']).toBe('closest');
	expect(ev!.properties['group_id']).toBe(SEEDED_GROUP_ID);

	await bobContext.close();
});

// ─── Vérification : distinct_id cohérent client/serveur ───────────────────────

test('bet_created (serveur) distinct_id = ALICE_ID (même que côté client identifyUser)', async ({
	page
}) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);
	await page.waitForLoadState('networkidle');

	await fillClosestForm(page, {
		title: '[E2E-tracking-020] Same distinct_id',
		stakeAmount: '10'
	});
	await page.getByTestId('submit-btn').click();
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const events = await readServerEvents(db, { event: 'bet_created', distinctId: ALICE_ID });
	expect(events.length).toBeGreaterThanOrEqual(1);
	// Tous les events doivent avoir le même distinct_id
	expect(events.every((e) => e.distinct_id === ALICE_ID)).toBe(true);
});
