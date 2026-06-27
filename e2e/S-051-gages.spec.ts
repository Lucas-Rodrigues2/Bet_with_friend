/**
 * S-051 — Gages : accomplissement & confirmation
 *
 * Critères d'acceptation :
 * 1. Page du pari résolu à gage : section « Gages » listant chaque débiteur
 *    et le statut (pending / done / not_done).
 * 2. Le débiteur d'un gage pending peut « J'ai fait mon gage » + upload de
 *    preuve optionnel → l'état passe à « en attente de confirmation ».
 * 3. Un gagnant peut Confirmer (done, confirmed_by) ou Refuser (retour pending).
 * 4. Un gagnant peut à tout moment marquer not_done (gage non tenu).
 * 5. La preuve uploadée est visible par les membres voyant le pari.
 * 6. Personne d'autre que débiteur/gagnants ne peut agir (vérifs serveur).
 * 7. Une section « Mes gages » sur le dashboard groupe liste les gages pending.
 *
 * Scénarios E2E :
 * - Bob (perdant) marque fait avec une image fixture → Alice confirme → done.
 * - Alice refuse la déclaration → Bob re-marque → Alice confirme.
 * - Alice marque not_done → affiché « gage non tenu ».
 * - Carol (tierce) n'a aucune action sur le gage.
 * - Section « Mes gages » visible sur le dashboard groupe pour Bob.
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { login } from './helpers/auth';
import { db } from './helpers/db';

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;

// User IDs from seed.sql
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// Fixture image for proof upload
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROOF_IMAGE = path.resolve(__dirname, 'fixtures/avatar.png');

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Creates a yesno forfeit duel already resolved.
 * Alice is winner (camp A), Bob is debtor/loser (camp B). Carol is juror.
 * Returns betId, matchId and forfeitId.
 */
async function createResolvedForfeitDuel(opts: {
	title: string;
	forfeitDescription?: string;
}): Promise<{ betId: string; matchId: string; forfeitId: string }> {
	const { title, forfeitDescription = 'Faire la vaisselle' } = opts;

	const [bet] = await db`
		INSERT INTO bets (group_id, creator_id, type, title, stake_type, forfeit_description, hide_answers, jury_mode, status)
		VALUES (
			${SEEDED_GROUP_ID}, ${ALICE_ID}, 'yesno', ${title},
			'forfeit', ${forfeitDescription}, false, 'majority', 'open'
		)
		RETURNING id
	`;

	await db`INSERT INTO yesno_bets (bet_id, mode, creator_side, choice_a, choice_b, accepted_count, max_opponents)
		VALUES (${bet.id}, 'duel', 'a', 'Oui', 'Non', 1, 1)`;

	// Visibility: Alice, Bob, Carol (so Carol can see but not act as winner/debtor)
	await db`
		INSERT INTO bet_visibility (bet_id, user_id)
		SELECT ${bet.id}, unnest(${db.array([ALICE_ID, BOB_ID, CAROL_ID])}::uuid[])
	`;

	await db`
		INSERT INTO propositions (bet_id, target_id, last_proposer_id, forfeit_creator, forfeit_target, status)
		VALUES (${bet.id}, ${BOB_ID}, ${BOB_ID}, 'Faire le café', ${forfeitDescription}, 'accepted')
	`;

	const [match] = await db`
		INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'resolved') RETURNING id
	`;

	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})`;

	await db`
		INSERT INTO match_participants (match_id, user_id, side)
		VALUES (${match.id}, ${ALICE_ID}, 'a'), (${match.id}, ${BOB_ID}, 'b')
	`;

	// Alice is winner
	await db`INSERT INTO match_winners (match_id, user_id) VALUES (${match.id}, ${ALICE_ID})`;

	// Bob has a pending forfeit
	const [forfeit] = await db`
		INSERT INTO forfeits (match_id, debtor_id) VALUES (${match.id}, ${BOB_ID}) RETURNING id
	`;

	return { betId: bet.id, matchId: match.id, forfeitId: forfeit.id };
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

test.afterEach(async () => {
	await db`DELETE FROM public.bets WHERE title LIKE '[E2E] S051%'`;
});

// ─── Scénario 1 : Bob marque fait avec preuve → Alice confirme → done ─────────

test('Bob marque son gage fait avec preuve → Alice confirme → statut done', async ({
	browser
}) => {
	const { betId, forfeitId } = await createResolvedForfeitDuel({
		title: '[E2E] S051 claim + confirm avec preuve'
	});

	// Bob visite la page du pari
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);
	await bobPage.waitForLoadState('networkidle');

	// Section gages visible
	await expect(bobPage.getByTestId('resolution-forfeits')).toBeVisible();

	// Un gage avec statut "À faire"
	const forfeitEntry = bobPage.getByTestId('forfeit-entry');
	await expect(forfeitEntry).toHaveCount(1);
	await expect(forfeitEntry.getByTestId('forfeit-debtor')).toContainText('Bob');
	await expect(forfeitEntry.getByTestId('forfeit-status')).toHaveText('À faire');

	// Bob ouvre le formulaire de déclaration
	await bobPage.getByTestId('show-claim-btn').click();
	await expect(bobPage.getByTestId('claim-form')).toBeVisible();

	// Upload une preuve (image fixture)
	await bobPage.getByTestId('proof-input').setInputFiles(PROOF_IMAGE);

	// Bob soumet
	const [claimResponse] = await Promise.all([
		bobPage.waitForResponse((r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'),
		bobPage.getByTestId('claim-btn').click()
	]);
	expect(claimResponse.status()).toBe(200);

	await bobPage.waitForLoadState('networkidle');

	// Le statut passe à "En attente de confirmation"
	await expect(bobPage.getByTestId('forfeit-status')).toHaveText('En attente de confirmation');
	await expect(bobPage.getByTestId('claim-pending-msg')).toBeVisible();

	// La preuve est visible (lien)
	await expect(bobPage.getByTestId('forfeit-proof-link')).toBeVisible();

	// Vérification DB : claimedAt non null
	const [forfeitRow] = await db`SELECT claimed_at, proof_url FROM forfeits WHERE id = ${forfeitId}`;
	expect(forfeitRow.claimed_at).not.toBeNull();
	expect(forfeitRow.proof_url).toBeTruthy();

	await bobCtx.close();

	// Alice (gagnante) visite la page
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage.waitForLoadState('networkidle');

	// Alice voit les boutons de gagnant : Confirmer, Refuser, Gage non tenu
	await expect(alicePage.getByTestId('winner-actions')).toBeVisible();
	await expect(alicePage.getByTestId('confirm-forfeit-btn')).toBeVisible();
	await expect(alicePage.getByTestId('reject-forfeit-btn')).toBeVisible();
	await expect(alicePage.getByTestId('not-done-forfeit-btn')).toBeVisible();

	// Alice confirme
	const [confirmResponse] = await Promise.all([
		alicePage.waitForResponse((r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'),
		alicePage.getByTestId('confirm-forfeit-btn').click()
	]);
	expect(confirmResponse.status()).toBe(200);

	await alicePage.waitForLoadState('networkidle');

	// Statut "Accompli ✓"
	await expect(alicePage.getByTestId('forfeit-status')).toContainText('Accompli');
	// "Confirmé par Alice"
	await expect(alicePage.getByTestId('forfeit-confirmed-by')).toContainText('Alice');

	// Les boutons de gagnant disparaissent (gage terminé)
	await expect(alicePage.getByTestId('winner-actions')).not.toBeVisible();

	// Vérification DB : status done, confirmed_by = Alice
	const [doneRow] = await db`SELECT status, confirmed_by FROM forfeits WHERE id = ${forfeitId}`;
	expect(doneRow.status).toBe('done');
	expect(doneRow.confirmed_by).toBe(ALICE_ID);

	await aliceCtx.close();
});

// ─── Scénario 2 : Alice refuse → Bob re-marque → Alice confirme ───────────────

test('Alice refuse → Bob re-marque → Alice confirme → done', async ({ browser }) => {
	const { betId, forfeitId } = await createResolvedForfeitDuel({
		title: '[E2E] S051 reject + reclaim + confirm'
	});

	// Bob marque fait sans preuve
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);
	await bobPage.waitForLoadState('networkidle');

	await bobPage.getByTestId('show-claim-btn').click();
	await expect(bobPage.getByTestId('claim-form')).toBeVisible();

	const [claimResponse1] = await Promise.all([
		bobPage.waitForResponse((r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'),
		bobPage.getByTestId('claim-btn').click()
	]);
	expect(claimResponse1.status()).toBe(200);
	await bobPage.waitForLoadState('networkidle');

	// Vérification : en attente de confirmation
	await expect(bobPage.getByTestId('forfeit-status')).toHaveText('En attente de confirmation');
	await bobCtx.close();

	// Alice refuse
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage.waitForLoadState('networkidle');

	await expect(alicePage.getByTestId('reject-forfeit-btn')).toBeVisible();
	const [rejectResponse] = await Promise.all([
		alicePage.waitForResponse((r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'),
		alicePage.getByTestId('reject-forfeit-btn').click()
	]);
	expect(rejectResponse.status()).toBe(200);
	await alicePage.waitForLoadState('networkidle');

	// Statut retour "À faire"
	await expect(alicePage.getByTestId('forfeit-status')).toHaveText('À faire');
	// Boutons confirmateur absents (claimed_at est null)
	await expect(alicePage.getByTestId('confirm-forfeit-btn')).not.toBeVisible();
	await expect(alicePage.getByTestId('reject-forfeit-btn')).not.toBeVisible();
	await aliceCtx.close();

	// Vérification DB : claimed_at null
	const [rejRow] = await db`SELECT claimed_at FROM forfeits WHERE id = ${forfeitId}`;
	expect(rejRow.claimed_at).toBeNull();

	// Bob re-marque fait
	const bobCtx2 = await browser.newContext();
	const bobPage2 = await bobCtx2.newPage();
	await login(bobPage2, 'bob');
	await bobPage2.goto(`${GROUP_URL}/bets/${betId}`);
	await bobPage2.waitForLoadState('networkidle');

	// Bob doit voir le bouton J'ai fait mon gage (statut retour à pending sans claimedAt)
	await expect(bobPage2.getByTestId('show-claim-btn')).toBeVisible();
	await bobPage2.getByTestId('show-claim-btn').click();

	const [claimResponse2] = await Promise.all([
		bobPage2.waitForResponse((r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'),
		bobPage2.getByTestId('claim-btn').click()
	]);
	expect(claimResponse2.status()).toBe(200);
	await bobPage2.waitForLoadState('networkidle');

	await expect(bobPage2.getByTestId('forfeit-status')).toHaveText('En attente de confirmation');
	await bobCtx2.close();

	// Alice confirme définitivement
	const aliceCtx2 = await browser.newContext();
	const alicePage2 = await aliceCtx2.newPage();
	await login(alicePage2, 'alice');
	await alicePage2.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage2.waitForLoadState('networkidle');

	await expect(alicePage2.getByTestId('confirm-forfeit-btn')).toBeVisible();
	const [confirmResponse] = await Promise.all([
		alicePage2.waitForResponse((r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'),
		alicePage2.getByTestId('confirm-forfeit-btn').click()
	]);
	expect(confirmResponse.status()).toBe(200);
	await alicePage2.waitForLoadState('networkidle');

	await expect(alicePage2.getByTestId('forfeit-status')).toContainText('Accompli');

	const [doneRow] = await db`SELECT status FROM forfeits WHERE id = ${forfeitId}`;
	expect(doneRow.status).toBe('done');

	await aliceCtx2.close();
});

// ─── Scénario 3 : Alice marque not_done → affiché « gage non tenu » ───────────

test('Alice marque not_done → statut « Gage non tenu » affiché dans historique', async ({
	browser
}) => {
	const { betId, forfeitId } = await createResolvedForfeitDuel({
		title: '[E2E] S051 not_done forfeit'
	});

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage.waitForLoadState('networkidle');

	// Alice voit le gage avec statut "À faire"
	await expect(alicePage.getByTestId('forfeit-status')).toHaveText('À faire');

	// Alice voit "Gage non tenu" même sans claim (can mark not_done at any time)
	await expect(alicePage.getByTestId('not-done-forfeit-btn')).toBeVisible();

	const [notDoneResponse] = await Promise.all([
		alicePage.waitForResponse((r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'),
		alicePage.getByTestId('not-done-forfeit-btn').click()
	]);
	expect(notDoneResponse.status()).toBe(200);
	await alicePage.waitForLoadState('networkidle');

	// Statut "Gage non tenu"
	await expect(alicePage.getByTestId('forfeit-status')).toHaveText('Gage non tenu');
	// Marqué non tenu par Alice
	await expect(alicePage.getByTestId('forfeit-not-done-by')).toContainText('Alice');

	// Plus de boutons gagnant (gage terminé)
	await expect(alicePage.getByTestId('winner-actions')).not.toBeVisible();

	// Vérification DB
	const [row] = await db`SELECT status, confirmed_by FROM forfeits WHERE id = ${forfeitId}`;
	expect(row.status).toBe('not_done');
	expect(row.confirmed_by).toBe(ALICE_ID);

	await aliceCtx.close();
});

// ─── Scénario 4 : Carol (tierce) n'a aucun bouton d'action ────────────────────

test('Carol (tierce - jurée non gagnante) ne voit aucun bouton d\'action sur le gage', async ({
	browser
}) => {
	const { betId } = await createResolvedForfeitDuel({
		title: '[E2E] S051 Carol tierce sans action'
	});

	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);
	await carolPage.waitForLoadState('networkidle');

	// Carol voit la section gages (elle est dans la visibilité)
	await expect(carolPage.getByTestId('resolution-forfeits')).toBeVisible();
	await expect(carolPage.getByTestId('forfeit-entry')).toHaveCount(1);
	await expect(carolPage.getByTestId('forfeit-status')).toHaveText('À faire');

	// Carol ne voit aucun bouton d'action (ni débiteur ni gagnante)
	await expect(carolPage.getByTestId('show-claim-btn')).not.toBeVisible();
	await expect(carolPage.getByTestId('winner-actions')).not.toBeVisible();
	await expect(carolPage.getByTestId('claim-section')).not.toBeVisible();

	await carolCtx.close();
});

// ─── Scénario 4b : Contrôle serveur — Carol ne peut pas agir via POST ─────────

test('Contrôle serveur : Carol ne peut pas claim_forfeit (n\'est pas débiteur)', async ({
	browser
}) => {
	const { betId, forfeitId } = await createResolvedForfeitDuel({
		title: '[E2E] S051 server guard Carol claim'
	});

	// Carol essaie de poster claim_forfeit avec un forfeitId valide mais elle n'est pas débiteur
	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);
	await carolPage.waitForLoadState('networkidle');

	// On simule un POST direct via fetch avec le bon forfaitId
	// SvelteKit renvoie une redirection (303) même pour les fail(), on vérifie l'état DB
	await carolPage.evaluate(
		async ({ betUrl, fId }) => {
			const formData = new FormData();
			formData.append('forfeitId', fId);
			await fetch(betUrl + '?/claim_forfeit', {
				method: 'POST',
				body: formData,
				redirect: 'manual' // ne pas suivre les redirections
			});
		},
		{ betUrl: `${GROUP_URL}/bets/${betId}`, fId: forfeitId }
	);

	// DB: forfeit toujours pending sans claimedAt (la requête n'a pas eu d'effet)
	const [row] = await db`SELECT claimed_at FROM forfeits WHERE id = ${forfeitId}`;
	expect(row.claimed_at).toBeNull();

	await carolCtx.close();
});

// ─── Scénario 5 : Section « Mes gages » sur le dashboard groupe ────────────────

test('Section « Mes gages » sur le dashboard groupe liste les gages pending de Bob', async ({
	browser
}) => {
	const { betId } = await createResolvedForfeitDuel({
		title: '[E2E] S051 mes gages dashboard'
	});

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}`);
	await bobPage.waitForLoadState('networkidle');

	// Section "Mes gages" visible
	await expect(bobPage.getByTestId('my-forfeits-section')).toBeVisible();

	// Au moins un item correspondant au pari créé
	const forfeitItems = bobPage.getByTestId('my-forfeit-item');
	// Peut en avoir d'autres (données seedées), on vérifie qu'au moins un correspond
	await expect(forfeitItems.first()).toBeVisible();

	// Trouver l'item de notre pari
	const myBetItem = bobPage.getByTestId('my-forfeit-title').filter({ hasText: '[E2E] S051 mes gages dashboard' });
	await expect(myBetItem).toBeVisible();

	// Statut "À faire"
	const myForfeitStatus = myBetItem.locator('..').locator('..').getByTestId('my-forfeit-status');
	await expect(myForfeitStatus).toHaveText('À faire');

	// Description du gage visible
	const myForfeitDesc = myBetItem.locator('..').getByTestId('my-forfeit-description');
	await expect(myForfeitDesc).toContainText('Faire la vaisselle');

	// Cliquer sur l'item redirige vers la page du pari
	await bobPage.getByTestId('my-forfeit-item').filter({ has: myBetItem }).locator('a').click();
	await expect(bobPage).toHaveURL(new RegExp(`/bets/${betId}`));

	await bobCtx.close();
});

// ─── Scénario 6 : Après claim, statut "En attente de confirmation" dans Mes gages

test('Après claim, statut "En attente de confirmation" dans la section Mes gages', async ({
	browser
}) => {
	const { betId, forfeitId } = await createResolvedForfeitDuel({
		title: '[E2E] S051 mes gages claimed status'
	});

	// Marquer le forfait comme claimed directement en DB
	await db`UPDATE forfeits SET claimed_at = now() WHERE id = ${forfeitId}`;

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}`);
	await bobPage.waitForLoadState('networkidle');

	// Trouver l'item de notre pari
	const myBetItem = bobPage.getByTestId('my-forfeit-title').filter({ hasText: '[E2E] S051 mes gages claimed status' });
	await expect(myBetItem).toBeVisible();

	// Statut "En attente de confirmation"
	const myForfeitStatus = myBetItem.locator('..').locator('..').getByTestId('my-forfeit-status');
	await expect(myForfeitStatus).toHaveText('En attente de confirmation');

	await bobCtx.close();
});

// ─── Scénario 7 : Preuve visible par Carol (membre voyant le pari) ─────────────

test('Preuve uploadée visible par Carol (membre dans la visibilité)', async ({ browser }) => {
	const { betId, forfeitId } = await createResolvedForfeitDuel({
		title: '[E2E] S051 preuve visible par Carol'
	});

	// Bob uploade une preuve via l'UI
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);
	await bobPage.waitForLoadState('networkidle');

	await bobPage.getByTestId('show-claim-btn').click();
	await bobPage.getByTestId('proof-input').setInputFiles(PROOF_IMAGE);

	const [claimResponse] = await Promise.all([
		bobPage.waitForResponse((r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'),
		bobPage.getByTestId('claim-btn').click()
	]);
	expect(claimResponse.status()).toBe(200);
	await bobPage.waitForLoadState('networkidle');

	// Preuve visible pour Bob
	await expect(bobPage.getByTestId('forfeit-proof-link')).toBeVisible();
	await bobCtx.close();

	// Carol voit la preuve aussi
	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);
	await carolPage.waitForLoadState('networkidle');

	// Carol voit le gage avec preuve
	await expect(carolPage.getByTestId('forfeit-entry')).toBeVisible();
	await expect(carolPage.getByTestId('forfeit-proof-link')).toBeVisible();

	const proofHref = await carolPage.getByTestId('forfeit-proof-link').getAttribute('href');
	expect(proofHref).toBeTruthy();

	// Vérification DB : proof_url non null
	const [row] = await db`SELECT proof_url FROM forfeits WHERE id = ${forfeitId}`;
	expect(row.proof_url).toBeTruthy();

	await carolCtx.close();
});

// ─── Scénario 8 : Claim sans preuve (preuve optionnelle) ──────────────────────

test('Bob peut claim sans preuve (preuve optionnelle)', async ({ browser }) => {
	const { betId, forfeitId } = await createResolvedForfeitDuel({
		title: '[E2E] S051 claim sans preuve'
	});

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);
	await bobPage.waitForLoadState('networkidle');

	await bobPage.getByTestId('show-claim-btn').click();
	// Ne pas uploader de preuve

	const [claimResponse] = await Promise.all([
		bobPage.waitForResponse((r) => r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'),
		bobPage.getByTestId('claim-btn').click()
	]);
	expect(claimResponse.status()).toBe(200);
	await bobPage.waitForLoadState('networkidle');

	// Statut en attente
	await expect(bobPage.getByTestId('forfeit-status')).toHaveText('En attente de confirmation');
	// Pas de lien preuve (pas uploadé)
	await expect(bobPage.getByTestId('forfeit-proof-link')).not.toBeVisible();

	// DB : claimed_at non null, proof_url null
	const [row] = await db`SELECT claimed_at, proof_url FROM forfeits WHERE id = ${forfeitId}`;
	expect(row.claimed_at).not.toBeNull();
	expect(row.proof_url).toBeNull();

	await bobCtx.close();
});
