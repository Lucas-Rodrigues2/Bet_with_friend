/**
 * S-050 — Ardoise (soldes, règlements)
 *
 * Critères d'acceptation :
 * 1. Onglet "Ardoise" : solde net global + détail par personne (netting des ledger_entries non réglées).
 * 2. Vue globale "toutes les dettes du groupe" (paires nettes) visible par tous les membres.
 * 3. Le créancier peut "Marquer comme réglé" → entries settled=true, solde à 0, historique conservé.
 * 4. Le débiteur ne peut pas marquer réglé (bouton absent).
 * 5. Chaque écriture référence son match (lien vers le pari d'origine si match_id présent).
 * 6. Le solde affiché sur le dashboard groupe est réel (myNetBalance).
 *
 * Scénarios E2E :
 * - Duel résolu (Bob doit 5 à Alice via ledger + match) : ardoise affiche la dette, lien vers le pari.
 * - Dettes croisées (Alice doit 10 à Bob, Bob doit 4 à Alice) → affichage net : Alice doit 6 à Bob.
 * - Alice (créancière) marque réglé → solde 0, section réglées alimentée ; Bob ne peut pas.
 * - Dashboard groupe : solde net réel avec lien vers /ledger.
 */
import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';

// User IDs from seed.sql
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a fresh isolated group for S-050 tests.
 * Returns the group id.
 */
async function createTestGroup(name: string): Promise<string> {
	const [row] = await db`
    INSERT INTO groups (name, currency, creator_id)
    VALUES (${name}, 'EUR', ${ALICE_ID})
    RETURNING id
  `;
	await db`
    INSERT INTO group_members (group_id, user_id, role)
    VALUES
      (${row.id}, ${ALICE_ID}, 'admin'),
      (${row.id}, ${BOB_ID}, 'member')
  `;
	return row.id;
}

/**
 * Creates a minimal yesno bet + resolved match + ledger entry in a group.
 * Allows testing bet links in the ledger.
 * Returns { betId, matchId }.
 */
async function createResolvedDuelWithLedger(
	groupId: string,
	title: string,
	debtorId: string,
	creditorId: string,
	amount: number
): Promise<{ betId: string; matchId: string }> {
	const [betRow] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status)
    VALUES (${groupId}, ${ALICE_ID}, 'yesno', ${title}, 'points', ${amount}, false, 'majority', 'closed')
    RETURNING id
  `;
	const betId = betRow.id;

	const [matchRow] = await db`
    INSERT INTO matches (bet_id, status, resolved_at)
    VALUES (${betId}, 'resolved', now())
    RETURNING id
  `;
	const matchId = matchRow.id;

	await db`
    INSERT INTO ledger_entries (group_id, match_id, debtor_id, creditor_id, amount)
    VALUES (${groupId}, ${matchId}, ${debtorId}, ${creditorId}, ${amount})
  `;

	return { betId, matchId };
}

/**
 * Creates a raw ledger entry (no match, no bet link) in a group.
 */
async function createLedgerEntry(
	groupId: string,
	debtorId: string,
	creditorId: string,
	amount: number
): Promise<void> {
	await db`
    INSERT INTO ledger_entries (group_id, debtor_id, creditor_id, amount)
    VALUES (${groupId}, ${debtorId}, ${creditorId}, ${amount})
  `;
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

test.afterEach(async () => {
	// Delete E2E test groups (cascades to ledger_entries, bets, etc.)
	await db`DELETE FROM public.groups WHERE name LIKE '[E2E] S050%'`;
});

// ─── Scénario 1 : Duel résolu → ardoise avec lien vers le pari ───────────────

test('Duel résolu : ardoise affiche "Bob te doit 5 EUR" avec lien vers le pari', async ({
	browser
}) => {
	const groupId = await createTestGroup('[E2E] S050 Ardoise duel résolu');
	const { betId } = await createResolvedDuelWithLedger(
		groupId,
		'[E2E] S050 pari duel test',
		BOB_ID,
		ALICE_ID,
		5
	);

	const ledgerUrl = `/app/groups/${groupId}/ledger`;

	// ── Vue Alice (créancière) ────────────────────────────────────────────────

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(ledgerUrl);
	await alicePage.waitForLoadState('networkidle');

	// Solde net global positif
	const aliceBalance = alicePage.getByTestId('my-net-balance');
	await expect(aliceBalance).toBeVisible();
	await expect(aliceBalance).toContainText('+5.00 EUR');

	// Paire : Bob te doit 5.00 EUR
	const pairCard = alicePage.getByTestId('pair-card').first();
	await expect(pairCard).toBeVisible();
	await expect(pairCard.getByTestId('pair-label')).toContainText('Bob');
	await expect(pairCard.getByTestId('pair-label')).toContainText('5.00 EUR');

	// Lien vers le pari présent
	const betLink = alicePage.getByTestId('bet-link').first();
	await expect(betLink).toBeVisible();
	await expect(betLink).toHaveAttribute('href', new RegExp(`/bets/${betId}`));

	// Bouton "Marquer réglé" visible pour la créancière
	await expect(alicePage.getByTestId('settle-btn')).toBeVisible();

	await aliceCtx.close();

	// ── Vue Bob (débiteur) ────────────────────────────────────────────────────

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(ledgerUrl);
	await bobPage.waitForLoadState('networkidle');

	// Solde net négatif pour Bob
	const bobBalance = bobPage.getByTestId('my-net-balance');
	await expect(bobBalance).toBeVisible();
	await expect(bobBalance).toContainText('-5.00 EUR');

	// Paire : Tu dois 5.00 EUR à Alice
	const bobPairCard = bobPage.getByTestId('pair-card').first();
	await expect(bobPairCard).toBeVisible();
	await expect(bobPairCard.getByTestId('pair-label')).toContainText('Tu dois');
	await expect(bobPairCard.getByTestId('pair-label')).toContainText('5.00 EUR');

	// Lien vers le pari visible aussi pour Bob
	const bobBetLink = bobPage.getByTestId('bet-link').first();
	await expect(bobBetLink).toBeVisible();
	await expect(bobBetLink).toHaveAttribute('href', new RegExp(`/bets/${betId}`));

	// Pas de bouton "Marquer réglé" pour le débiteur
	await expect(bobPage.getByTestId('settle-btn')).not.toBeVisible();

	await bobCtx.close();
});

// ─── Scénario 2 : Vue globale "toutes les dettes du groupe" ──────────────────

test('Vue globale : section "Toutes les dettes du groupe" liste les paires nettes', async ({
	page
}) => {
	const groupId = await createTestGroup('[E2E] S050 Vue globale');

	// Bob doit 5 EUR à Alice
	await createLedgerEntry(groupId, BOB_ID, ALICE_ID, 5);
	// Alice doit 3 EUR à Bob (dette croisée)
	await createLedgerEntry(groupId, ALICE_ID, BOB_ID, 3);
	// Net : Bob doit 2 EUR à Alice

	await login(page, 'alice');
	await page.goto(`/app/groups/${groupId}/ledger`);
	await page.waitForLoadState('networkidle');

	// Section globale présente
	const allPairsSection = page.getByTestId('all-pairs-section');
	await expect(allPairsSection).toBeVisible();

	// Liste les paires nettes
	const allPairsList = page.getByTestId('all-pairs-list');
	await expect(allPairsList).toBeVisible();

	// Exactement 1 paire nette visible (Bob doit 2 EUR à Alice)
	const allPairItems = page.getByTestId('all-pair-item');
	await expect(allPairItems).toHaveCount(1);

	// Le débiteur est Bob, créancier est Alice, montant net = 2 EUR
	const pairItem = allPairItems.first();
	await expect(pairItem.getByTestId('all-pair-debtor')).toHaveText('Bob');
	await expect(pairItem.getByTestId('all-pair-amount')).toContainText('2.00 EUR');
	await expect(pairItem.getByTestId('all-pair-creditor')).toHaveText('Alice');
});

// ─── Scénario 3 : Dettes croisées → affichage net ────────────────────────────

test('Dettes croisées : A doit 10 à B, B doit 4 à A → A doit 6 à B affiché', async ({
	browser
}) => {
	const groupId = await createTestGroup('[E2E] S050 Dettes croisées');

	// Alice doit 10 EUR à Bob
	await createLedgerEntry(groupId, ALICE_ID, BOB_ID, 10);
	// Bob doit 4 EUR à Alice (dette inverse)
	await createLedgerEntry(groupId, BOB_ID, ALICE_ID, 4);

	// Net : Alice doit 6 EUR à Bob

	const ledgerUrl = `/app/groups/${groupId}/ledger`;

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(ledgerUrl);
	await alicePage.waitForLoadState('networkidle');

	// Solde net d'Alice : -6.00 EUR (elle doit de l'argent)
	await expect(alicePage.getByTestId('my-net-balance')).toContainText('-6.00 EUR');

	// Paire : Tu dois 6.00 EUR à Bob
	const pairCard = alicePage.getByTestId('pair-card').first();
	await expect(pairCard.getByTestId('pair-label')).toContainText('Tu dois');
	await expect(pairCard.getByTestId('pair-label')).toContainText('6.00 EUR');
	await expect(pairCard.getByTestId('other-pseudo')).toContainText('Bob');

	// Pas de bouton settle (Alice est débitrice nette)
	await expect(alicePage.getByTestId('settle-btn')).not.toBeVisible();

	await aliceCtx.close();

	// Vue globale : 1 paire nette Bob→Alice non, Alice→Bob de 6 EUR
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(ledgerUrl);
	await bobPage.waitForLoadState('networkidle');

	// Solde net de Bob : +6.00 EUR
	await expect(bobPage.getByTestId('my-net-balance')).toContainText('+6.00 EUR');

	// Bouton settle visible pour Bob (créancier net)
	await expect(bobPage.getByTestId('settle-btn')).toBeVisible();

	await bobCtx.close();
});

// ─── Scénario 4 : Créancier marque réglé → solde 0, section réglées ──────────

test('Alice (créancière) marque réglé → solde 0, section réglées alimentée', async ({
	browser
}) => {
	const groupId = await createTestGroup('[E2E] S050 Marquer réglé');

	// Bob doit 5 EUR à Alice
	await createLedgerEntry(groupId, BOB_ID, ALICE_ID, 5);

	const ledgerUrl = `/app/groups/${groupId}/ledger`;

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(ledgerUrl);
	await alicePage.waitForLoadState('networkidle');

	// Solde actif : +5.00 EUR
	await expect(alicePage.getByTestId('my-net-balance')).toContainText('+5.00 EUR');
	await expect(alicePage.getByTestId('settle-btn')).toBeVisible();

	// La section réglées n'existe pas encore
	await expect(alicePage.getByTestId('settled-section')).not.toBeVisible();

	// Alice clique "Marquer réglé"
	const [settleResponse] = await Promise.all([
		alicePage.waitForResponse((r) => r.url().includes('/ledger') && r.request().method() === 'POST'),
		alicePage.getByTestId('settle-btn').click()
	]);
	expect(settleResponse.status()).toBe(200);

	// Attendre le rechargement des données
	await alicePage.waitForLoadState('networkidle');

	// Toast de succès
	await expect(alicePage.getByText('Dette marquée comme réglée.')).toBeVisible({ timeout: 5000 });

	// Solde repasse à 0
	await expect(alicePage.getByTestId('my-net-balance')).toContainText('+0.00 EUR');

	// Aucune dette en cours
	await expect(alicePage.getByTestId('no-personal-debt')).toBeVisible();

	// Section réglées alimentée
	await expect(alicePage.getByTestId('settled-section')).toBeVisible();
	const settledItems = alicePage.getByTestId('settled-item');
	await expect(settledItems).toHaveCount(1);
	await expect(settledItems.first().getByTestId('settled-debtor')).toHaveText('Bob');
	await expect(settledItems.first().getByTestId('settled-creditor')).toHaveText('Alice');
	await expect(settledItems.first().getByTestId('settled-badge')).toHaveText('Réglé');

	// ── Vérification DB ──────────────────────────────────────────────────────

	const settledRows = await db`
    SELECT settled FROM ledger_entries
    WHERE group_id = ${groupId} AND debtor_id = ${BOB_ID} AND creditor_id = ${ALICE_ID}
  `;
	expect(settledRows.every((r: { settled: boolean }) => r.settled === true)).toBe(true);

	await aliceCtx.close();
});

// ─── Scénario 5 : Bob (débiteur) ne peut pas marquer réglé ───────────────────

test('Bob (débiteur) ne peut pas marquer réglé — bouton absent, DB intacte', async ({
	browser
}) => {
	const groupId = await createTestGroup('[E2E] S050 Débiteur ne peut pas régler');

	// Bob doit 5 EUR à Alice
	await createLedgerEntry(groupId, BOB_ID, ALICE_ID, 5);

	const ledgerUrl = `/app/groups/${groupId}/ledger`;

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(ledgerUrl);
	await bobPage.waitForLoadState('networkidle');

	// Bob voit la paire (il doit à Alice)
	const pairCard = bobPage.getByTestId('pair-card').first();
	await expect(pairCard).toBeVisible();
	await expect(pairCard.getByTestId('pair-label')).toContainText('Tu dois');
	await expect(pairCard.getByTestId('pair-label')).toContainText('5.00 EUR');

	// Pas de bouton "Marquer réglé" pour le débiteur (UI protection principale)
	await expect(bobPage.getByTestId('settle-btn')).not.toBeVisible();

	// Vérification via soumission directe du formulaire : SvelteKit encode
	// le résultat de fail() dans le corps de la réponse (pas le code HTTP brut),
	// l'important est que les données DB restent intactes.
	const settleResult = await bobPage.evaluate(
		async ({ groupId, BOB_ID, ALICE_ID }) => {
			const res = await fetch(`/app/groups/${groupId}/ledger?/settle`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: `debtorId=${BOB_ID}&creditorId=${ALICE_ID}`
			});
			const text = await res.text();
			return { status: res.status, body: text };
		},
		{ groupId, BOB_ID, ALICE_ID }
	);

	// Le résultat doit contenir une erreur — soit HTTP 4xx soit body avec "error"
	const hasError =
		settleResult.status >= 400 ||
		settleResult.body.includes('error') ||
		settleResult.body.includes('créancier');
	expect(hasError).toBe(true);

	// Les entrées restent non réglées (vérification DB de protection serveur)
	const unsetterRows = await db`
    SELECT settled FROM ledger_entries
    WHERE group_id = ${groupId} AND debtor_id = ${BOB_ID} AND creditor_id = ${ALICE_ID}
  `;
	expect(unsetterRows.every((r: { settled: boolean }) => r.settled === false)).toBe(true);

	await bobCtx.close();
});

// ─── Scénario 6 : Règlement avec dettes croisées → tout settled, solde 0 ─────

test('Règlement dettes croisées : Alice marque réglé → toutes les entries settled', async ({
	browser
}) => {
	const groupId = await createTestGroup('[E2E] S050 Règlement croisé');

	// Alice doit 4 EUR à Bob (dette inverse)
	await createLedgerEntry(groupId, ALICE_ID, BOB_ID, 4);
	// Bob doit 10 EUR à Alice
	await createLedgerEntry(groupId, BOB_ID, ALICE_ID, 10);
	// Net : Bob doit 6 EUR à Alice → Alice est créancière nette

	const ledgerUrl = `/app/groups/${groupId}/ledger`;

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(ledgerUrl);
	await alicePage.waitForLoadState('networkidle');

	// Solde net : +6.00 EUR
	await expect(alicePage.getByTestId('my-net-balance')).toContainText('+6.00 EUR');

	// Alice marque réglé
	await Promise.all([
		alicePage.waitForResponse((r) => r.url().includes('/ledger') && r.request().method() === 'POST'),
		alicePage.getByTestId('settle-btn').click()
	]);
	await alicePage.waitForLoadState('networkidle');

	// Solde à 0
	await expect(alicePage.getByTestId('my-net-balance')).toContainText('+0.00 EUR');

	// ── Vérification DB : toutes les entries (dans les 2 sens) sont settled ──

	const allRows = await db`
    SELECT settled FROM ledger_entries
    WHERE group_id = ${groupId}
      AND (
        (debtor_id = ${BOB_ID} AND creditor_id = ${ALICE_ID}) OR
        (debtor_id = ${ALICE_ID} AND creditor_id = ${BOB_ID})
      )
  `;
	expect(allRows).toHaveLength(2);
	expect(allRows.every((r: { settled: boolean }) => r.settled === true)).toBe(true);

	await aliceCtx.close();
});

// ─── Scénario 7 : Dashboard groupe affiche le solde net réel ─────────────────

test('Dashboard groupe : solde personnel réel + lien vers /ledger', async ({ browser }) => {
	const groupId = await createTestGroup('[E2E] S050 Dashboard solde');

	// Bob doit 12 EUR à Alice
	await createLedgerEntry(groupId, BOB_ID, ALICE_ID, 12);

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`/app/groups/${groupId}`);
	await alicePage.waitForLoadState('networkidle');

	// Section Ardoise sur le dashboard
	const ledgerSection = alicePage.getByTestId('ledger-section');
	await expect(ledgerSection).toBeVisible();

	// Lien vers l'ardoise complète
	await expect(alicePage.getByTestId('ledger-link')).toHaveAttribute(
		'href',
		`/app/groups/${groupId}/ledger`
	);

	// Solde +12.00 EUR affiché sur la carte
	const ledgerCard = alicePage.getByTestId('ledger-card');
	await expect(ledgerCard).toBeVisible();
	await expect(alicePage.getByTestId('ledger-balance')).toContainText('+12.00 EUR');

	// La carte est un lien cliquable vers /ledger
	await expect(ledgerCard).toHaveAttribute('href', `/app/groups/${groupId}/ledger`);

	// ── Vue Bob (débiteur) ────────────────────────────────────────────────────

	await aliceCtx.close();
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`/app/groups/${groupId}`);
	await bobPage.waitForLoadState('networkidle');

	await expect(bobPage.getByTestId('ledger-balance')).toContainText('-12.00 EUR');

	await bobCtx.close();
});

// ─── Scénario 8 : État vide — aucune dette en cours ──────────────────────────

test('État vide : aucune dette → message affiché, pas de plantage', async ({ page }) => {
	const groupId = await createTestGroup('[E2E] S050 État vide');

	await login(page, 'alice');
	await page.goto(`/app/groups/${groupId}/ledger`);
	await page.waitForLoadState('networkidle');

	// Solde à 0
	await expect(page.getByTestId('my-net-balance')).toContainText('+0.00 EUR');

	// Message "à jour"
	await expect(page.getByTestId('no-personal-debt')).toBeVisible();

	// Section globale : "Aucune dette dans le groupe"
	await expect(page.getByTestId('all-pairs-section')).toBeVisible();
	await expect(page.getByTestId('all-pairs-list')).not.toBeVisible();

	// Pas de section réglées (rien à montrer)
	await expect(page.getByTestId('settled-section')).not.toBeVisible();
});

// ─── Scénario 9 : Accès refusé — non-membre ──────────────────────────────────

test('Accès refusé : non-membre redirigé avec 404', async ({ page }) => {
	const groupId = await createTestGroup('[E2E] S050 Accès refusé');

	// Carol n'est PAS membre du groupe (seuls Alice et Bob le sont)
	await login(page, 'carol');
	const response = await page.goto(`/app/groups/${groupId}/ledger`);

	// Doit renvoyer 404 ou rediriger
	const status = response?.status() ?? 0;
	const url = page.url();
	const isRedirected = url.includes('/app') && !url.includes('/ledger');
	expect(status === 404 || isRedirected || status === 200).toBeTruthy();
	// Si on arrive sur la page, ce doit être une page d'erreur (pas un accès valide)
	if (status === 200 && url.includes('/ledger')) {
		// Vérifie que le contenu n'est pas accessible — la page doit afficher une erreur
		await expect(page.getByText('Groupe introuvable')).toBeVisible();
	}
});
