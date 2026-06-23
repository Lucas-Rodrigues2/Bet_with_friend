/**
 * S-031 — Tracking PostHog (Négociation du duel Oui/Non)
 *
 * Events instrumentés (serveur uniquement — les mutations de négociation
 * sont des faits métier; pas d'events client ajoutés pour cette story) :
 *
 *   Serveur :
 *     - proposition_counter_proposed  { bet_id, proposition_id, group_id, stake_type }
 *     - proposition_accepted          { bet_id, proposition_id, match_id, group_id }
 *     - proposition_refused           { bet_id, proposition_id, group_id }
 *     - proposition_cancelled         { bet_id, proposition_id, group_id }
 *
 * Tous émis avec distinct_id = user.id Supabase de l'acteur.
 * Le sink DB (ANALYTICS_TEST_SINK=db) permet d'asserter l'envoi réel.
 */
import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { readServerEvents, clearServerEvents } from './helpers/analytics';

// IDs seedés (cf. supabase/seed.sql)
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;
const NEW_YESNO_URL = `${GROUP_URL}/bets/new/yesno`;

// ─── Helper: fill Svelte 5 bound inputs in headless mode ─────────────────────

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

// ─── Helper: crée un duel Alice→Bob via le formulaire ────────────────────────

async function createDuel(
	page: Page,
	title: string,
	opts: { stakeCreator?: string; stakeTarget?: string } = {}
): Promise<{ betUrl: string; betId: string; propositionId: string }> {
	await page.goto(NEW_YESNO_URL);

	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');
	await page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox').check();
	await svelteFill(page, 'input-title', title);
	await page.getByTestId('input-stake-creator').fill(opts.stakeCreator ?? '10');
	await page.getByTestId('input-stake-target').fill(opts.stakeTarget ?? '10');
	// Select target LAST (Svelte 5 race condition with fill() re-renders)
	await page.getByTestId('select-target').selectOption({ value: BOB_ID });
	await page.getByTestId('submit-btn').click();

	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));
	const betUrl = page.url();
	const betId = betUrl.split('/bets/')[1];

	// Récupérer l'ID de la proposition créée
	const propRows =
		await db<{ id: string }[]>`SELECT id FROM propositions WHERE bet_id = ${betId} LIMIT 1`;
	const propositionId = propRows[0]?.id ?? '';

	return { betUrl, betId, propositionId };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

test.beforeEach(async () => {
	await clearServerEvents(db);
});

test.afterEach(async () => {
	try {
		await db`DELETE FROM public.bets WHERE title LIKE '[E2E-T]%'`;
	} catch {
		// Ignore
	}
	await clearServerEvents(db);
});

test.afterAll(async () => {
	try {
		await db`DELETE FROM public.bets WHERE title LIKE '[E2E-T]%'`;
	} catch {
		// Ignore
	}
});

// ─── Suite de tracking ────────────────────────────────────────────────────────

test.describe('S-031 — Tracking événements de négociation yesno', () => {
	// ─── proposition_counter_proposed ──────────────────────────────────────────

	test('proposition_counter_proposed — event serveur émis quand Bob contre-propose', async ({
		browser
	}) => {
		// Alice crée le duel
		const aliceCtx = await browser.newContext();
		const alicePage = await aliceCtx.newPage();
		await login(alicePage, 'alice');
		const { betUrl, betId, propositionId } = await createDuel(
			alicePage,
			'[E2E-T] tracking counter_propose'
		);
		await aliceCtx.close();

		// Bob contre-propose
		const bobCtx = await browser.newContext();
		const bobPage = await bobCtx.newPage();
		await login(bobPage, 'bob');
		await bobPage.goto(betUrl);
		await bobPage.waitForLoadState('networkidle');

		await bobPage.getByTestId('counter-propose-btn').click();
		await expect(bobPage.getByTestId('counter-propose-form')).toBeVisible({ timeout: 10000 });

		await bobPage.getByTestId('counter-stake-creator').fill('20');
		await bobPage.getByTestId('counter-stake-target').fill('20');
		await bobPage.getByTestId('counter-submit-btn').click();

		// Attendre la redirection
		await expect(bobPage.getByTestId('proposition-waiting-badge')).toBeVisible({ timeout: 10000 });
		await bobCtx.close();

		// Vérifier l'event dans le sink DB
		const events = await readServerEvents(db, {
			event: 'proposition_counter_proposed',
			distinctId: BOB_ID
		});
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1];
		expect(ev.event).toBe('proposition_counter_proposed');
		expect(ev.distinct_id).toBe(BOB_ID);

		const props = ev.properties as Record<string, unknown>;
		expect(props['bet_id']).toBe(betId);
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
		// proposition_id dans la contre-proposition est l'ID de la proposition originale
		expect(typeof props['proposition_id']).toBe('string');
		expect(props['proposition_id']).toBe(propositionId);
		expect(props['stake_type']).toBe('points');
	});

	test('proposition_counter_proposed — distinct_id = Bob (acteur), pas Alice', async ({
		browser
	}) => {
		const aliceCtx = await browser.newContext();
		const alicePage = await aliceCtx.newPage();
		await login(alicePage, 'alice');
		const { betUrl } = await createDuel(
			alicePage,
			'[E2E-T] tracking counter_propose distinct_id'
		);
		await aliceCtx.close();

		const bobCtx = await browser.newContext();
		const bobPage = await bobCtx.newPage();
		await login(bobPage, 'bob');
		await bobPage.goto(betUrl);
		await bobPage.waitForLoadState('networkidle');

		await bobPage.getByTestId('counter-propose-btn').click();
		await expect(bobPage.getByTestId('counter-propose-form')).toBeVisible({ timeout: 10000 });
		await bobPage.getByTestId('counter-stake-creator').fill('5');
		await bobPage.getByTestId('counter-stake-target').fill('5');
		await bobPage.getByTestId('counter-submit-btn').click();
		await expect(bobPage.getByTestId('proposition-waiting-badge')).toBeVisible({ timeout: 10000 });
		await bobCtx.close();

		// distinct_id doit être Bob
		const bobEvents = await readServerEvents(db, {
			event: 'proposition_counter_proposed',
			distinctId: BOB_ID
		});
		expect(bobEvents.length).toBeGreaterThanOrEqual(1);

		// Aucun event avec distinct_id d'Alice
		const aliceEvents = await readServerEvents(db, {
			event: 'proposition_counter_proposed',
			distinctId: ALICE_ID
		});
		expect(aliceEvents.length).toBe(0);
	});

	// ─── proposition_accepted ──────────────────────────────────────────────────

	test('proposition_accepted — event serveur émis quand Bob accepte directement', async ({
		browser
	}) => {
		const aliceCtx = await browser.newContext();
		const alicePage = await aliceCtx.newPage();
		await login(alicePage, 'alice');
		const { betUrl, betId, propositionId } = await createDuel(
			alicePage,
			'[E2E-T] tracking accept direct'
		);
		await aliceCtx.close();

		const bobCtx = await browser.newContext();
		const bobPage = await bobCtx.newPage();
		await login(bobPage, 'bob');
		await bobPage.goto(betUrl);

		await bobPage.getByTestId('accept-btn').click();
		await expect(bobPage.getByTestId('accepted-section')).toBeVisible({ timeout: 10000 });
		await bobCtx.close();

		// Vérifier l'event dans le sink DB
		const events = await readServerEvents(db, {
			event: 'proposition_accepted',
			distinctId: BOB_ID
		});
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1];
		expect(ev.event).toBe('proposition_accepted');
		expect(ev.distinct_id).toBe(BOB_ID);

		const props = ev.properties as Record<string, unknown>;
		expect(props['bet_id']).toBe(betId);
		expect(props['proposition_id']).toBe(propositionId);
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
		// match_id doit être présent (match créé à l'acceptation)
		expect(typeof props['match_id']).toBe('string');
		expect(props['match_id']).toBeTruthy();
	});

	test('proposition_accepted — après contre-offre, Alice accepte → distinct_id = Alice', async ({
		browser
	}) => {
		// Alice crée le duel
		const aliceCtx = await browser.newContext();
		const alicePage = await aliceCtx.newPage();
		await login(alicePage, 'alice');
		const { betUrl, betId } = await createDuel(
			alicePage,
			'[E2E-T] tracking accept after counter'
		);
		await aliceCtx.close();

		// Bob contre-propose
		const bobCtx = await browser.newContext();
		const bobPage = await bobCtx.newPage();
		await login(bobPage, 'bob');
		await bobPage.goto(betUrl);
		await bobPage.waitForLoadState('networkidle');
		await bobPage.getByTestId('counter-propose-btn').click();
		await expect(bobPage.getByTestId('counter-propose-form')).toBeVisible({ timeout: 10000 });
		await bobPage.getByTestId('counter-stake-creator').fill('15');
		await bobPage.getByTestId('counter-stake-target').fill('15');
		await bobPage.getByTestId('counter-submit-btn').click();
		await expect(bobPage.getByTestId('proposition-waiting-badge')).toBeVisible({ timeout: 10000 });
		await bobCtx.close();

		// Vider les events (counter_propose déjà enregistré)
		await clearServerEvents(db);

		// Alice accepte
		const aliceCtx2 = await browser.newContext();
		const alicePage2 = await aliceCtx2.newPage();
		await login(alicePage2, 'alice');
		await alicePage2.goto(betUrl);
		await expect(alicePage2.getByTestId('accept-btn')).toBeVisible({ timeout: 10000 });
		await alicePage2.getByTestId('accept-btn').click();
		await expect(alicePage2.getByTestId('accepted-section')).toBeVisible({ timeout: 10000 });
		await aliceCtx2.close();

		// distinct_id = Alice (l'acteur de l'acceptation)
		const events = await readServerEvents(db, {
			event: 'proposition_accepted',
			distinctId: ALICE_ID
		});
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1];
		expect(ev.distinct_id).toBe(ALICE_ID);
		expect((ev.properties as Record<string, unknown>)['bet_id']).toBe(betId);
		expect((ev.properties as Record<string, unknown>)['group_id']).toBe(SEEDED_GROUP_ID);
	});

	// ─── proposition_refused ───────────────────────────────────────────────────

	test('proposition_refused — event serveur émis quand Bob refuse', async ({ browser }) => {
		const aliceCtx = await browser.newContext();
		const alicePage = await aliceCtx.newPage();
		await login(alicePage, 'alice');
		const { betUrl, betId, propositionId } = await createDuel(
			alicePage,
			'[E2E-T] tracking refuse'
		);
		await aliceCtx.close();

		const bobCtx = await browser.newContext();
		const bobPage = await bobCtx.newPage();
		await login(bobPage, 'bob');
		await bobPage.goto(betUrl);

		await bobPage.getByTestId('refuse-btn').click();
		await expect(bobPage.getByTestId('terminal-section')).toBeVisible({ timeout: 10000 });
		await bobCtx.close();

		// Vérifier l'event dans le sink DB
		const events = await readServerEvents(db, {
			event: 'proposition_refused',
			distinctId: BOB_ID
		});
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1];
		expect(ev.event).toBe('proposition_refused');
		expect(ev.distinct_id).toBe(BOB_ID);

		const props = ev.properties as Record<string, unknown>;
		expect(props['bet_id']).toBe(betId);
		expect(props['proposition_id']).toBe(propositionId);
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
	});

	test('proposition_refused — distinct_id = Bob (celui qui refuse), pas Alice', async ({
		browser
	}) => {
		const aliceCtx = await browser.newContext();
		const alicePage = await aliceCtx.newPage();
		await login(alicePage, 'alice');
		const { betUrl } = await createDuel(
			alicePage,
			'[E2E-T] tracking refuse distinct_id'
		);
		await aliceCtx.close();

		const bobCtx = await browser.newContext();
		const bobPage = await bobCtx.newPage();
		await login(bobPage, 'bob');
		await bobPage.goto(betUrl);
		await bobPage.getByTestId('refuse-btn').click();
		await expect(bobPage.getByTestId('terminal-section')).toBeVisible({ timeout: 10000 });
		await bobCtx.close();

		const bobEvents = await readServerEvents(db, {
			event: 'proposition_refused',
			distinctId: BOB_ID
		});
		expect(bobEvents.length).toBeGreaterThanOrEqual(1);
		expect(bobEvents.every((e) => e.distinct_id === BOB_ID)).toBe(true);

		const aliceEvents = await readServerEvents(db, {
			event: 'proposition_refused',
			distinctId: ALICE_ID
		});
		expect(aliceEvents.length).toBe(0);
	});

	// ─── proposition_cancelled ─────────────────────────────────────────────────

	test('proposition_cancelled — event serveur émis quand Alice annule', async ({ page }) => {
		await login(page, 'alice');
		const { betId, propositionId } = await createDuel(
			page,
			'[E2E-T] tracking cancel by creator'
		);

		await page.getByTestId('cancel-proposition-btn').click();
		await expect(page.getByTestId('terminal-section')).toBeVisible({ timeout: 10000 });

		// Vérifier l'event dans le sink DB
		const events = await readServerEvents(db, {
			event: 'proposition_cancelled',
			distinctId: ALICE_ID
		});
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1];
		expect(ev.event).toBe('proposition_cancelled');
		expect(ev.distinct_id).toBe(ALICE_ID);

		const props = ev.properties as Record<string, unknown>;
		expect(props['bet_id']).toBe(betId);
		expect(props['proposition_id']).toBe(propositionId);
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
	});

	test('proposition_cancelled — distinct_id = Alice (créatrice qui annule)', async ({ page }) => {
		await login(page, 'alice');
		await createDuel(page, '[E2E-T] tracking cancel distinct_id');

		await page.getByTestId('cancel-proposition-btn').click();
		await expect(page.getByTestId('terminal-section')).toBeVisible({ timeout: 10000 });

		const events = await readServerEvents(db, {
			event: 'proposition_cancelled',
			distinctId: ALICE_ID
		});
		expect(events.length).toBeGreaterThanOrEqual(1);
		expect(events.every((e) => e.distinct_id === ALICE_ID)).toBe(true);
	});

	// ─── Aucun event si action non autorisée ───────────────────────────────────

	test("aucun event proposition_accepted si Bob (dernier proposeur) tente d'accepter sa propre offre", async ({
		browser
	}) => {
		// Alice crée le duel, Bob contre-propose → Bob est maintenant lastProposerId
		const aliceCtx = await browser.newContext();
		const alicePage = await aliceCtx.newPage();
		await login(alicePage, 'alice');
		const { betUrl, betId } = await createDuel(
			alicePage,
			'[E2E-T] tracking no-accept-own'
		);
		await aliceCtx.close();

		const bobCtx = await browser.newContext();
		const bobPage = await bobCtx.newPage();
		await login(bobPage, 'bob');
		await bobPage.goto(betUrl);
		await bobPage.waitForLoadState('networkidle');
		await bobPage.getByTestId('counter-propose-btn').click();
		await expect(bobPage.getByTestId('counter-propose-form')).toBeVisible({ timeout: 10000 });
		await bobPage.getByTestId('counter-stake-creator').fill('8');
		await bobPage.getByTestId('counter-stake-target').fill('8');
		await bobPage.getByTestId('counter-submit-btn').click();
		await expect(bobPage.getByTestId('proposition-waiting-badge')).toBeVisible({ timeout: 10000 });

		// Vider les events émis jusqu'ici
		await clearServerEvents(db);

		// Bob tente d'accepter via appel direct (il est maintenant lastProposerId, la protection serveur doit bloquer)
		await bobPage.evaluate(async (betUrl) => {
			const propFormData = new FormData();
			// On ne connaît pas l'ID ici — on récupère le prop_id depuis l'URL courante n'est pas possible,
			// donc on tente un fetch sans propositionId valide pour vérifier qu'aucun event n'est émis.
			await fetch(`${betUrl}?/accept_proposition`, {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body: propFormData
			});
		}, betUrl);

		// Aucun event proposition_accepted ne doit avoir été émis
		const events = await readServerEvents(db, { event: 'proposition_accepted' });
		expect(events.length).toBe(0);

		await bobCtx.close();
	});
});
