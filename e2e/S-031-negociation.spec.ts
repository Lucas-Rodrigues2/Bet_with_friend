/**
 * S-031 — Négociation du duel Oui/Non
 *
 * Critères d'acceptation :
 * 1. La cible (Bob) a Accepter / Refuser / Contre-proposer ; le créateur (Alice) attend.
 * 2. Contre-proposition → nouvelle ligne proposition_offers, terms mis à jour,
 *    lastProposerId change (now creator's turn), expires_at repoussé.
 * 3. Accepter → proposition.status=accepted, match créé (open), match_participants×2,
 *    match_jurors, yesno_bets.accepted_count incrémenté.
 * 4. Refuser → proposition.status=refused ; bet.status=cancelled si aucune proposition
 *    acceptée.
 * 5. Annuler (créateur) → proposition.status=cancelled.
 * 6. Expiration lazy → status=expired au chargement, actions bloquées.
 * 7. Historique des offres visible en ordre chronologique.
 * 8. Carol (hors duel) → 404 par URL directe.
 * 9. Après acceptation : pas de boutons de négociation, section "Duel accepté".
 *
 * Scénarios :
 * - Bob contre-propose (15/15) → Alice voit historique 2 offres, Alice accepte → match créé.
 * - Bob refuse directement → duel refusé/terminé.
 * - Alice annule avant réponse de Bob.
 * - Carol (hors duel) : URL directe → 404.
 * - Après acceptation : plus de boutons de négociation.
 * - Expiration : proposition with expires_at in the past → actions bloquées.
 */
import { test, expect, type Page } from '@playwright/test';
import postgres from 'postgres';
import { login, USERS } from './helpers/auth';

const DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const dbOwn = postgres(DATABASE_URL, { max: 3 });

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;
const NEW_YESNO_URL = `${GROUP_URL}/bets/new/yesno`;

const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Remplit un champ texte lié à `bind:value` (Svelte 5) de façon fiable en mode headless.
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
 * Crée un duel Alice→Bob via le formulaire /bets/new/yesno.
 * Retourne l'URL de la page du duel et l'ID du pari.
 */
async function createDuel(
	page: Page,
	opts: {
		title: string;
		stakeCreator?: string;
		stakeTarget?: string;
	}
): Promise<{ betUrl: string; betId: string }> {
	await page.goto(NEW_YESNO_URL);

	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');
	await page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox').check();
	await svelteFill(page, 'input-title', opts.title);
	await page.getByTestId('input-stake-creator').fill(opts.stakeCreator ?? '10');
	await page.getByTestId('input-stake-target').fill(opts.stakeTarget ?? '15');
	// Select target LAST (Svelte 5 race condition: fill() re-renders reset the select)
	await page.getByTestId('select-target').selectOption({ value: BOB_ID });
	await page.getByTestId('submit-btn').click();

	await expect(page).toHaveURL(
		new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`)
	);
	const betUrl = page.url();
	const betId = betUrl.split('/bets/')[1];
	return { betUrl, betId };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

test.afterEach(async () => {
	try {
		await dbOwn`DELETE FROM public.bets WHERE title LIKE '[E2E]%'`;
	} catch {
		// Ignore
	}
});

test.afterAll(async () => {
	await dbOwn.end();
});

// ─── Scénario 1 : Bob contre-propose, Alice voit l'historique, Alice accepte ──

test('Bob contre-propose (15/15) → Alice voit 2 offres ; Alice accepte → match créé', async ({
	browser
}) => {
	// === Alice crée le duel ===
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betUrl, betId } = await createDuel(alicePage, {
		title: '[E2E] Nego counter + accept',
		stakeCreator: '10',
		stakeTarget: '15'
	});

	// Alice sees "En attente de réponse" badge and cancel button (no accept/refuse)
	await expect(alicePage.getByTestId('proposition-waiting-badge')).toBeVisible();
	await expect(alicePage.getByTestId('cancel-proposition-btn')).toBeVisible();
	await expect(alicePage.getByTestId('accept-btn')).not.toBeVisible();
	await expect(alicePage.getByTestId('refuse-btn')).not.toBeVisible();

	// History: 1 initial offer
	const offers1 = alicePage.getByTestId('offer-item');
	await expect(offers1).toHaveCount(1);
	await expect(alicePage.getByTestId('offers-history')).toContainText('Historique des offres (1)');

	// === Bob counter-proposes (15/15) ===
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(betUrl);

	// Bob sees "À toi de jouer" badge
	await expect(bobPage.getByTestId('proposition-received-badge')).toBeVisible();
	await expect(bobPage.getByTestId('proposition-received-badge')).toHaveText('À toi de jouer');

	// Bob sees accept/refuse/counter buttons
	await expect(bobPage.getByTestId('accept-btn')).toBeVisible();
	await expect(bobPage.getByTestId('refuse-btn')).toBeVisible();
	await expect(bobPage.getByTestId('counter-propose-btn')).toBeVisible();

	// Bob opens counter-propose form (wait for page to fully hydrate before interacting)
	await bobPage.waitForLoadState('networkidle');
	await bobPage.getByTestId('counter-propose-btn').click();
	await expect(bobPage.getByTestId('counter-propose-form')).toBeVisible({ timeout: 10000 });

	// Form is pre-filled with current terms
	await expect(bobPage.getByTestId('counter-stake-creator')).toHaveValue('10.00');
	await expect(bobPage.getByTestId('counter-stake-target')).toHaveValue('15.00');

	// Bob changes to 15/15
	await bobPage.getByTestId('counter-stake-creator').fill('15');
	await bobPage.getByTestId('counter-stake-target').fill('15');
	await bobPage.getByTestId('counter-submit-btn').click();

	// After Bob's counter-propose: Bob sees "En attente de réponse"
	await expect(bobPage.getByTestId('proposition-waiting-badge')).toBeVisible();
	await expect(bobPage.getByTestId('accept-btn')).not.toBeVisible();

	// Bob sees 2 offers in history
	await expect(bobPage.getByTestId('offers-history')).toContainText('Historique des offres (2)');
	const offersAfterCounter = bobPage.getByTestId('offer-item');
	await expect(offersAfterCounter).toHaveCount(2);

	// === Alice reloads and sees Bob's counter-offer ===
	await alicePage.reload();

	// Alice now sees "À toi de jouer"
	await expect(alicePage.getByTestId('proposition-received-badge')).toBeVisible();

	// Alice sees 2 offers
	await expect(alicePage.getByTestId('offers-history')).toContainText('Historique des offres (2)');
	const aliceOffers = alicePage.getByTestId('offer-item');
	await expect(aliceOffers).toHaveCount(2);

	// First offer: Alice 10/15
	await expect(alicePage.getByTestId('offer-item').first().getByTestId('offer-stake-creator')).toContainText('10.00');
	await expect(alicePage.getByTestId('offer-item').first().getByTestId('offer-stake-target')).toContainText('15.00');

	// Second offer: Bob 15/15
	await expect(alicePage.getByTestId('offer-item').nth(1).getByTestId('offer-stake-creator')).toContainText('15.00');
	await expect(alicePage.getByTestId('offer-item').nth(1).getByTestId('offer-stake-target')).toContainText('15.00');

	// Current terms updated (stakes section shows 15/15)
	await expect(alicePage.getByTestId('stake-creator')).toContainText('15.00');
	await expect(alicePage.getByTestId('stake-target')).toContainText('15.00');

	// Alice accepts
	await alicePage.getByTestId('accept-btn').click();

	// After acceptance: "Duel accepté !" section visible
	await expect(alicePage.getByTestId('accepted-section')).toBeVisible();
	await expect(alicePage.getByTestId('accepted-section')).toContainText('Duel accepté');

	// No more negotiation action buttons
	await expect(alicePage.getByTestId('negotiation-actions')).not.toBeVisible();

	// Proposition status badge shows "Acceptée"
	await expect(alicePage.getByTestId('proposition-status-badge')).toHaveText('Acceptée');

	// Jury section title changes from "Jury proposé" to "Jury"
	await expect(alicePage.getByTestId('bet-jury')).toContainText('Jury — Majorité');

	// === Verify DB: match created with correct participants and jurors ===
	const propRows = await dbOwn`SELECT status, stake_creator, stake_target FROM propositions WHERE bet_id = ${betId}`;
	expect(propRows).toHaveLength(1);
	expect(propRows[0].status).toBe('accepted');
	expect(propRows[0].stake_creator).toBe('15.00');
	expect(propRows[0].stake_target).toBe('15.00');

	const matchRows = await dbOwn`SELECT id, status FROM matches WHERE bet_id = ${betId}`;
	expect(matchRows).toHaveLength(1);
	expect(matchRows[0].status).toBe('open');

	const participants = await dbOwn`
		SELECT mp.user_id, mp.side, mp.stake
		FROM match_participants mp
		WHERE mp.match_id = ${matchRows[0].id}
		ORDER BY mp.side
	`;
	expect(participants).toHaveLength(2);
	// Alice is side a (creator, camp A)
	const alicePart = participants.find((p) => p.user_id === ALICE_ID);
	expect(alicePart).toBeDefined();
	expect(alicePart!.side).toBe('a');
	expect(alicePart!.stake).toBe('15.00');
	// Bob is side b (target)
	const bobPart = participants.find((p) => p.user_id === BOB_ID);
	expect(bobPart).toBeDefined();
	expect(bobPart!.side).toBe('b');
	expect(bobPart!.stake).toBe('15.00');

	const jurors = await dbOwn`SELECT user_id FROM match_jurors WHERE match_id = ${matchRows[0].id}`;
	expect(jurors).toHaveLength(1);
	expect(jurors[0].user_id).toBe(CAROL_ID);

	const yesnoBet = await dbOwn`SELECT accepted_count FROM yesno_bets WHERE bet_id = ${betId}`;
	expect(yesnoBet[0].accepted_count).toBe(1);

	await aliceCtx.close();
	await bobCtx.close();
});

// ─── Scénario 2 : Bob refuse directement ─────────────────────────────────────

test('Bob refuse directement → proposition refused, bet cancelled', async ({ browser }) => {
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betUrl, betId } = await createDuel(alicePage, {
		title: '[E2E] Nego refuse',
		stakeCreator: '10',
		stakeTarget: '15'
	});
	await aliceCtx.close();

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(betUrl);

	// Bob refuses
	await bobPage.getByTestId('refuse-btn').click();

	// Page reloads: shows "Ce duel a été refusé."
	await expect(bobPage.getByTestId('terminal-section')).toBeVisible();
	await expect(bobPage.getByTestId('terminal-section')).toContainText('refusé');

	// Proposition status badge: Refusée
	await expect(bobPage.getByTestId('proposition-status-badge')).toHaveText('Refusée');

	// No negotiation actions
	await expect(bobPage.getByTestId('negotiation-actions')).not.toBeVisible();

	// DB: proposition refused, bet cancelled
	const propRows = await dbOwn`SELECT status FROM propositions WHERE bet_id = ${betId}`;
	expect(propRows[0].status).toBe('refused');

	const betRows = await dbOwn`SELECT status FROM bets WHERE id = ${betId}`;
	expect(betRows[0].status).toBe('cancelled');

	await bobCtx.close();
});

// ─── Scénario 3 : Alice annule avant réponse de Bob ──────────────────────────

test('Alice annule le duel (créateur) → proposition cancelled', async ({ page }) => {
	await login(page, 'alice');
	const { betId } = await createDuel(page, {
		title: '[E2E] Nego cancel by creator',
		stakeCreator: '10',
		stakeTarget: '15'
	});

	// Alice sees cancel button
	await expect(page.getByTestId('cancel-proposition-btn')).toBeVisible();

	// Alice cancels
	await page.getByTestId('cancel-proposition-btn').click();

	// Page shows "Ce duel a été annulé par le créateur."
	await expect(page.getByTestId('terminal-section')).toBeVisible();
	await expect(page.getByTestId('terminal-section')).toContainText('annulé par le créateur');

	// Proposition status badge: Annulée
	await expect(page.getByTestId('proposition-status-badge')).toHaveText('Annulée');

	// DB: proposition cancelled
	const propRows = await dbOwn`SELECT status FROM propositions WHERE bet_id = ${betId}`;
	expect(propRows[0].status).toBe('cancelled');

	const betRows = await dbOwn`SELECT status FROM bets WHERE id = ${betId}`;
	expect(betRows[0].status).toBe('cancelled');
});

// ─── Scénario 4 : Carol (hors duel) → 404 ────────────────────────────────────

test('Carol (hors duel) accède directement à la page duel → 404', async ({ browser }) => {
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betUrl } = await createDuel(alicePage, {
		title: '[E2E] Nego carol 404'
	});
	await aliceCtx.close();

	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(betUrl);

	await expect(carolPage.getByRole('heading', { name: '404' })).toBeVisible();
	await carolCtx.close();
});

// ─── Scénario 5 : Après acceptation → plus de boutons de négociation ─────────

test('après acceptation : plus de boutons de négociation visibles', async ({ browser }) => {
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betUrl, betId } = await createDuel(alicePage, {
		title: '[E2E] Nego post-accept UI',
		stakeCreator: '10',
		stakeTarget: '10'
	});
	await aliceCtx.close();

	// Bob accepts directly
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(betUrl);
	await bobPage.getByTestId('accept-btn').click();

	// Accepted section visible
	await expect(bobPage.getByTestId('accepted-section')).toBeVisible();

	// No negotiation-actions section
	await expect(bobPage.getByTestId('negotiation-actions')).not.toBeVisible();

	// No accept/refuse/counter buttons
	await expect(bobPage.getByTestId('accept-btn')).not.toBeVisible();
	await expect(bobPage.getByTestId('refuse-btn')).not.toBeVisible();
	await expect(bobPage.getByTestId('counter-propose-btn')).not.toBeVisible();
	await expect(bobPage.getByTestId('cancel-proposition-btn')).not.toBeVisible();

	await bobCtx.close();

	// Alice also sees accepted state
	const aliceCtx2 = await browser.newContext();
	const alicePage2 = await aliceCtx2.newPage();
	await login(alicePage2, 'alice');
	await alicePage2.goto(betUrl);

	await expect(alicePage2.getByTestId('accepted-section')).toBeVisible();
	await expect(alicePage2.getByTestId('negotiation-actions')).not.toBeVisible();

	await aliceCtx2.close();
});

// ─── Scénario 6 : Expiration lazy ────────────────────────────────────────────

test('proposition expirée (expires_at dans le passé) → statut expirée, actions bloquées', async ({
	page
}) => {
	await login(page, 'alice');
	const { betId } = await createDuel(page, {
		title: '[E2E] Nego expired',
		stakeCreator: '10',
		stakeTarget: '15'
	});

	// Manually set expires_at in the past via DB
	await dbOwn`
		UPDATE propositions
		SET expires_at = NOW() - INTERVAL '1 hour'
		WHERE bet_id = ${betId}
	`;

	// Reload the page to trigger lazy expiration
	await page.reload();

	// Proposition status badge: Expirée
	await expect(page.getByTestId('proposition-status-badge')).toHaveText('Expirée');

	// Terminal section visible with "expiré"
	await expect(page.getByTestId('terminal-section')).toBeVisible();
	await expect(page.getByTestId('terminal-section')).toContainText('expiré');

	// No actions
	await expect(page.getByTestId('negotiation-actions')).not.toBeVisible();
	await expect(page.getByTestId('accept-btn')).not.toBeVisible();

	// DB: proposition status = expired
	const propRows = await dbOwn`SELECT status FROM propositions WHERE bet_id = ${betId}`;
	expect(propRows[0].status).toBe('expired');
});

// ─── Scénario 7 : Historique des offres en ordre chronologique ───────────────

test('historique des offres affiché dans le bon ordre chronologique', async ({ browser }) => {
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betUrl } = await createDuel(alicePage, {
		title: '[E2E] Nego historique order',
		stakeCreator: '10',
		stakeTarget: '20'
	});

	// Alice's initial offer is in history
	await expect(alicePage.getByTestId('offer-item').first()).toContainText('Offre initiale');
	const firstOfferAuthor = await alicePage.getByTestId('offer-item').first().getByTestId('offer-author').textContent();
	expect(firstOfferAuthor).toMatch(/Alice/);
	await aliceCtx.close();

	// Bob counter-proposes
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(betUrl);
	await bobPage.waitForLoadState('networkidle');
	await bobPage.getByTestId('counter-propose-btn').click();
	await expect(bobPage.getByTestId('counter-propose-form')).toBeVisible({ timeout: 10000 });
	await bobPage.getByTestId('counter-stake-creator').fill('12');
	await bobPage.getByTestId('counter-stake-target').fill('18');
	await bobPage.getByTestId('counter-submit-btn').click();

	// 2 offers now
	await expect(bobPage.getByTestId('offer-item')).toHaveCount(2);

	// First offer: Alice (initial)
	const offerAuthors = await bobPage.getByTestId('offer-author').allTextContents();
	expect(offerAuthors[0]).toMatch(/Alice/);
	expect(offerAuthors[1]).toMatch(/Bob/);

	// Second offer stakes = 12/18
	await expect(bobPage.getByTestId('offer-item').nth(1).getByTestId('offer-stake-creator')).toContainText('12.00');
	await expect(bobPage.getByTestId('offer-item').nth(1).getByTestId('offer-stake-target')).toContainText('18.00');
	await bobCtx.close();
});

// ─── Scénario 8 : Modification du jury dans la contre-offre ──────────────────

test('contre-offre avec modification du jury → jury remplacé après acceptation', async ({
	browser
}) => {
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');

	// Alice creates a duel with Carol as jury
	const { betUrl, betId } = await createDuel(alicePage, {
		title: '[E2E] Nego jury change',
		stakeCreator: '10',
		stakeTarget: '10'
	});
	await aliceCtx.close();

	// Bob counter-proposes and changes jury to Bob himself
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(betUrl);

	await bobPage.waitForLoadState('networkidle');
	await bobPage.getByTestId('counter-propose-btn').click();
	await expect(bobPage.getByTestId('counter-propose-form')).toBeVisible({ timeout: 10000 });

	// Enable jury modification via clicking the label (Svelte 5 bind:checked needs click on label)
	await bobPage.locator('label').filter({ has: bobPage.getByTestId('change-jury-checkbox') }).click();
	await expect(bobPage.getByTestId('counter-jury-section')).toBeVisible({ timeout: 5000 });

	// Select Bob as jury member (find checkbox with value=BOB_ID in the jury section)
	// The jury section lists visibility members: Alice and Bob
	// Use the checkbox with value matching BOB_ID
	const bobJuryCheckbox = bobPage.getByTestId('counter-jury-section')
		.locator(`input[type="checkbox"][value="${BOB_ID}"]`);
	await bobJuryCheckbox.check();
	await expect(bobJuryCheckbox).toBeChecked();

	await bobPage.getByTestId('counter-submit-btn').click();

	// After counter-propose: Bob sees "En attente de réponse"
	await expect(bobPage.getByTestId('proposition-waiting-badge')).toBeVisible({ timeout: 10000 });

	// Alice accepts
	const aliceCtx2 = await browser.newContext();
	const alicePage2 = await aliceCtx2.newPage();
	await login(alicePage2, 'alice');
	await alicePage2.goto(betUrl);

	// Alice should see "À toi de jouer" (Bob is now lastProposerId)
	await expect(alicePage2.getByTestId('proposition-received-badge')).toBeVisible({ timeout: 10000 });
	await alicePage2.getByTestId('accept-btn').click();

	// After acceptance: "Duel accepté" section visible
	await expect(alicePage2.getByTestId('accepted-section')).toBeVisible({ timeout: 10000 });

	// Jury section shows updated jury (Bob)
	await expect(alicePage2.getByTestId('bet-jury')).toContainText('Bob');

	// DB: match_jurors should have Bob only
	const matchRows = await dbOwn`SELECT id FROM matches WHERE bet_id = ${betId}`;
	expect(matchRows).toHaveLength(1);
	const jurors = await dbOwn`SELECT user_id FROM match_jurors WHERE match_id = ${matchRows[0].id}`;
	expect(jurors.some((j) => j.user_id === BOB_ID)).toBe(true);
	// Carol should NOT be in match_jurors (jury was replaced)
	expect(jurors.some((j) => j.user_id === CAROL_ID)).toBe(false);

	await aliceCtx2.close();
	await bobCtx.close();
});

// ─── Scénario 9 : Seul celui qui n'a pas fait la dernière offre peut accepter ─

test("Alice (dernier proposeur initial) ne peut pas accepter son propre duel", async ({ page }) => {
	await login(page, 'alice');
	const { betId } = await createDuel(page, {
		title: '[E2E] Nego creator cannot accept own offer',
		stakeCreator: '10',
		stakeTarget: '15'
	});

	// Alice (last proposer) should NOT see the accept/refuse/counter buttons
	await expect(page.getByTestId('accept-btn')).not.toBeVisible();
	await expect(page.getByTestId('refuse-btn')).not.toBeVisible();
	await expect(page.getByTestId('counter-propose-btn')).not.toBeVisible();

	// Alice sees the waiting message
	await expect(page.getByTestId('waiting-message')).toBeVisible();
	await expect(page.getByTestId('waiting-message')).toContainText('dernière offre');

	// Alice CAN cancel
	await expect(page.getByTestId('cancel-proposition-btn')).toBeVisible();

	void betId; // used for cleanup
});

// ─── Scénario 10 : Affichage initial de la page duel (vue créateur) ──────────

test('page duel yesno affiche les termes initiaux, historique 1 offre, expiry', async ({
	page
}) => {
	await login(page, 'alice');
	await createDuel(page, {
		title: '[E2E] Nego initial display',
		stakeCreator: '10',
		stakeTarget: '20'
	});

	// Status badge
	await expect(page.getByTestId('proposition-status-badge')).toHaveText('En négociation');

	// Camps
	await expect(page.getByTestId('camp-a-choice')).toHaveText('Oui');
	await expect(page.getByTestId('camp-b-choice')).toHaveText('Non');
	await expect(page.getByTestId('camp-a-player')).toContainText('Alice');
	await expect(page.getByTestId('camp-b-player')).toContainText('Bob');

	// Stakes
	await expect(page.getByTestId('stake-creator')).toContainText('10.00');
	await expect(page.getByTestId('stake-target')).toContainText('20.00');

	// Expiry visible
	await expect(page.getByTestId('proposition-expiry')).toBeVisible();
	await expect(page.getByTestId('expiry-value')).not.toBeEmpty();

	// Jury section
	await expect(page.getByTestId('bet-jury')).toContainText('Carol');

	// History: 1 initial offer
	await expect(page.getByTestId('offers-history')).toContainText('Historique des offres (1)');
	await expect(page.getByTestId('offer-item').first()).toContainText('Offre initiale');
});

// ─── Scénario 11 : Bob accepte directement sans contre-proposer ──────────────

test('Bob accepte directement (sans contre-proposer) → match créé immédiatement', async ({
	browser
}) => {
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betUrl, betId } = await createDuel(alicePage, {
		title: '[E2E] Nego direct accept',
		stakeCreator: '10',
		stakeTarget: '10'
	});
	await aliceCtx.close();

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(betUrl);

	// Bob accepts directly
	await bobPage.getByTestId('accept-btn').click();

	// Page shows accepted section
	await expect(bobPage.getByTestId('accepted-section')).toBeVisible();
	await expect(bobPage.getByTestId('proposition-status-badge')).toHaveText('Acceptée');

	// Only 1 offer in history (the initial one from Alice)
	await expect(bobPage.getByTestId('offer-item')).toHaveCount(1);

	// DB: proposition accepted
	const propRows = await dbOwn`SELECT status FROM propositions WHERE bet_id = ${betId}`;
	expect(propRows[0].status).toBe('accepted');

	// DB: match created
	const matchRows = await dbOwn`SELECT status FROM matches WHERE bet_id = ${betId}`;
	expect(matchRows).toHaveLength(1);
	expect(matchRows[0].status).toBe('open');

	await bobCtx.close();
});

// ─── Scénario 12 : Accès sans session → redirection /login ───────────────────

test('accès page duel sans session → redirection /login', async ({ page }) => {
	await page.goto(`${GROUP_URL}/bets/22222222-2222-2222-2222-222222222222`);
	await expect(page).toHaveURL(/\/login/);
});
