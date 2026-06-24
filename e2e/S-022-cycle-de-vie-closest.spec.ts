/**
 * S-022 — Cycle de vie : clôture & soumission au jury
 *
 * Critères d'acceptation :
 * 1. Bouton « Soumettre au jury » visible par tout participant d'un match open
 *    (pas par un spectateur) → statut judging, plus aucune participation possible.
 * 2. Deadline atteinte → match passe en judging (transition lazy au chargement).
 * 3. En judging, les estimations deviennent visibles de tous (fin du hide_answers).
 * 4. Un juré non présent dans la liste de visibilité ne voyait pas le pari avant ;
 *    dès judging, il le voit dans une section « À juger » de la page groupe.
 * 5. La page du pari affiche clairement le statut (badge : Ouvert / En jugement).
 *
 * Scénarios E2E :
 * - Bob (participant) clique « Soumettre au jury » → badge « En jugement »,
 *   formulaire d'estimation disparaît.
 * - Carol (jurée, hors liste de visibilité) ne voyait pas le pari → après soumission,
 *   il apparaît dans son « À juger ».
 * - Les estimations cachées se révèlent en judging.
 * - Un spectateur n'a pas le bouton « Soumettre ».
 * - Deadline passée → transition lazy vers judging au chargement de la page.
 * - Non-régression : création + participation inchangées.
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;

// User IDs from seed.sql
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

/**
 * Helper: create a closest bet in the DB and return { betId, matchId }.
 * Alice is creator. Visibility: alice + bob (+ carol optionally). Juror: carol.
 * Carol is NOT in the visibility list by default.
 */
async function createClosestBet(opts: {
	title: string;
	hideAnswers: boolean;
	deadline?: Date | null;
	stakeAmount?: string;
	carolInVisibility?: boolean;
}): Promise<{ betId: string; matchId: string }> {
	const { title, hideAnswers, deadline = null, stakeAmount = '10', carolInVisibility = false } =
		opts;

	const [bet] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, participation_deadline, jury_mode, status)
    VALUES (
      ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', ${title},
      'points', ${stakeAmount}, ${hideAnswers},
      ${deadline}, 'majority', 'open'
    )
    RETURNING id
  `;

	const visibilityUsers = [ALICE_ID, BOB_ID];
	if (carolInVisibility) visibilityUsers.push(CAROL_ID);

	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    SELECT ${bet.id}, unnest(${visibilityUsers}::uuid[])
  `;

	const [match] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'open') RETURNING id
  `;

	await db`
    INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})
  `;

	return { betId: bet.id, matchId: match.id };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

test.afterEach(async () => {
	await db`DELETE FROM public.bets WHERE title LIKE '[E2E]%'`;
});

// ─── Scénario 1 : Bob (participant) voit le bouton « Soumettre au jury » ──────

test('Bob (participant, match open) voit le bouton Soumettre au jury', async ({ browser }) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S022 Bob peut soumettre',
		hideAnswers: true
	});

	// Bob participe
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${BOB_ID}, '42', '10')
  `;

	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Le bouton "Soumettre au jury" doit être visible pour Bob (participant)
	await expect(bobPage.getByTestId('submit-to-jury-section')).toBeVisible();
	await expect(bobPage.getByTestId('submit-to-jury-btn')).toBeVisible();
	await expect(bobPage.getByTestId('submit-to-jury-btn')).toContainText('Soumettre au jury');

	// Le statut est "Ouvert"
	await expect(bobPage.getByTestId('bet-status-badge')).toHaveText('Ouvert');

	await bobContext.close();
});

// ─── Scénario 2 : Alice (spectateur, non-participant) n'a pas le bouton ───────

test('Alice (non-participant) ne voit pas le bouton Soumettre au jury', async ({ page }) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S022 Alice spectateur',
		hideAnswers: true
	});

	// Seul Bob participe
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${BOB_ID}, '42', '10')
  `;

	await login(page, 'alice');
	await page.goto(`${GROUP_URL}/bets/${betId}`);

	// Alice n'est pas participant → pas de bouton Soumettre
	await expect(page.getByTestId('submit-to-jury-section')).not.toBeVisible();
	await expect(page.getByTestId('submit-to-jury-btn')).not.toBeVisible();

	// Mais Alice peut participer (formulaire visible)
	await expect(page.getByTestId('participate-section')).toBeVisible();
	await expect(page.getByTestId('answer-input')).toBeVisible();
});

// ─── Scénario 3 : Bob clique Soumettre → statut passe à En jugement ───────────

test('Bob clique Soumettre au jury → badge En jugement, formulaire disparaît', async ({
	browser
}) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S022 Soumission jury Bob',
		hideAnswers: true
	});

	// Alice et Bob participent
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${ALICE_ID}, '50', '10'), (${matchId}, ${BOB_ID}, '42', '10')
  `;

	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Bob voit le bouton Soumettre au jury
	await expect(bobPage.getByTestId('submit-to-jury-btn')).toBeVisible();

	// Bob clique pour soumettre
	await bobPage.getByTestId('submit-to-jury-btn').click();

	// Après soumission, la page se recharge
	await bobPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));

	// Le badge passe à "En jugement"
	await expect(bobPage.getByTestId('bet-status-badge')).toHaveText('En jugement');

	// Le bouton Soumettre disparaît (match déjà en judging)
	await expect(bobPage.getByTestId('submit-to-jury-section')).not.toBeVisible();
	await expect(bobPage.getByTestId('submit-to-jury-btn')).not.toBeVisible();

	// Le formulaire de participation disparaît aussi
	await expect(bobPage.getByTestId('answer-input')).not.toBeVisible();

	// En judging, Bob voit son estimation en lecture seule
	await expect(bobPage.getByTestId('participate-section')).toBeVisible();
	await expect(bobPage.getByTestId('my-answer')).toBeVisible();

	// Vérification DB : le match est maintenant en judging
	const [matchRow] = await db`SELECT status FROM matches WHERE id = ${matchId}`;
	expect(matchRow.status).toBe('judging');

	await bobContext.close();
});

// ─── Scénario 4 : Les estimations se révèlent en judging ──────────────────────

test('En judging, les estimations cachées (hide_answers=true) se révèlent', async ({
	browser
}) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S022 Révélation estimations',
		hideAnswers: true
	});

	// Alice et Bob participent
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${ALICE_ID}, '999', '10'), (${matchId}, ${BOB_ID}, '42', '10')
  `;

	// Soumettre au jury directement en DB
	await db`UPDATE matches SET status = 'judging' WHERE id = ${matchId}`;

	// Bob accède à la page en judging
	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Statut : En jugement
	await expect(bobPage.getByTestId('bet-status-badge')).toHaveText('En jugement');

	// Les estimations sont visibles (plus de "Réponse cachée")
	const aliceItem = bobPage.getByTestId('participant-item').filter({ hasText: 'Alice' });
	await expect(aliceItem.getByTestId('participant-answer')).toHaveText('999');

	const bobItem = bobPage.getByTestId('participant-item').filter({ hasText: 'Bob' });
	await expect(bobItem.getByTestId('participant-answer')).toHaveText('42');

	// "Réponse cachée" ne doit plus être visible
	await expect(bobPage.getByTestId('answer-hidden')).not.toBeVisible();

	// Section description des réponses : "Visibles par tous"
	const hideAnswersSection = bobPage.getByTestId('bet-hide-answers');
	await expect(hideAnswersSection).toContainText('Visibles par tous');

	await bobContext.close();
});

// ─── Scénario 5 : Carol (jurée hors visibilité) voit le pari en « À juger » ──

test('Carol (jurée hors liste de visibilité) voit le pari en À juger après soumission', async ({
	browser
}) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S022 Carol À juger',
		hideAnswers: true,
		carolInVisibility: false // Carol n'est PAS dans la liste de visibilité
	});

	// Bob participe et soumet au jury
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${BOB_ID}, '42', '10')
  `;
	await db`UPDATE matches SET status = 'judging' WHERE id = ${matchId}`;

	// Carol se connecte et va sur la page groupe
	const carolContext = await browser.newContext();
	const carolPage = await carolContext.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(GROUP_URL);

	// Carol ne voit pas le pari dans la section "Paris en cours" (hors visibilité)
	const betsList = carolPage.getByTestId('bets-list');
	// Le pari n'est pas dans la liste normale
	await expect(carolPage.getByTestId('bets-section')).not.toContainText('[E2E] S022 Carol À juger');

	// Carol voit le pari dans la section "À juger"
	const betsToJudgeSection = carolPage.getByTestId('bets-to-judge-section');
	await expect(betsToJudgeSection).toBeVisible();

	const betToJudge = betsToJudgeSection.getByTestId('bet-to-judge-item').filter({
		hasText: '[E2E] S022 Carol À juger'
	});
	await expect(betToJudge).toBeVisible();
	await expect(betToJudge.getByTestId('bet-to-judge-status')).toContainText('En jugement');

	// Carol peut cliquer sur le lien et accéder à la page du pari
	await betToJudge.click();
	await carolPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));

	// Carol voit la page du pari avec le badge "En jugement"
	await expect(carolPage.getByTestId('bet-status-badge')).toHaveText('En jugement');
	await expect(carolPage.getByTestId('bet-title')).toHaveText('[E2E] S022 Carol À juger');

	// Carol (jurée) voit le panneau de vote (implémenté par S-040)
	await expect(carolPage.getByTestId('jury-vote-section')).toBeVisible();
	// Le vrai panneau de vote S-040 remplace le placeholder — les radios de verdict sont visibles
	await expect(carolPage.getByTestId('verdict-not-resolved')).toBeVisible();
	await expect(carolPage.getByTestId('verdict-winners-selected')).toBeVisible();

	await carolContext.close();
});

// ─── Scénario 6 : Carol ne voyait pas le pari avant soumission ────────────────

test("Carol (jurée hors visibilité) ne voit pas le pari en 'open' — 404 par URL", async ({
	browser
}) => {
	const { betId } = await createClosestBet({
		title: '[E2E] S022 Carol 404 avant judging',
		hideAnswers: true,
		carolInVisibility: false // Carol NOT in visibility
	});

	// Match reste en 'open' (pas soumis)
	const carolContext = await browser.newContext();
	const carolPage = await carolContext.newPage();
	await login(carolPage, 'carol');

	// Carol essaie d'accéder au pari → 404
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);
	await expect(carolPage.getByRole('heading', { name: '404' })).toBeVisible();

	// Carol ne voit pas de section "À juger" (match pas encore en judging)
	await carolPage.goto(GROUP_URL);
	await expect(carolPage.getByTestId('bets-to-judge-section')).not.toBeVisible();

	await carolContext.close();
});

// ─── Scénario 7 : Deadline passée → transition lazy vers judging ───────────────

test('Deadline passée → transition lazy vers judging au chargement de la page', async ({
	page
}) => {
	const pastDeadline = new Date('2020-01-01T10:00:00Z');
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S022 Deadline judging lazy',
		hideAnswers: true,
		deadline: pastDeadline
	});

	// Bob participe avant la deadline (historiquement)
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${BOB_ID}, '42', '10')
  `;

	// Alice charge la page → la transition lazy doit se faire
	await login(page, 'alice');
	await page.goto(`${GROUP_URL}/bets/${betId}`);

	// La page doit afficher le statut "En jugement" (transition lazy appliquée)
	await expect(page.getByTestId('bet-status-badge')).toHaveText('En jugement');

	// Plus de formulaire de participation
	await expect(page.getByTestId('answer-input')).not.toBeVisible();

	// Vérification DB : le match doit maintenant être en judging
	const [matchRow] = await db`SELECT status FROM matches WHERE id = ${matchId}`;
	expect(matchRow.status).toBe('judging');
});

// ─── Scénario 8 : Badge "Ouvert" sur un match open ────────────────────────────

test('Badge Ouvert affiché pour un match en statut open', async ({ page }) => {
	const { betId } = await createClosestBet({
		title: '[E2E] S022 Badge ouvert',
		hideAnswers: true
	});

	await login(page, 'alice');
	await page.goto(`${GROUP_URL}/bets/${betId}`);

	await expect(page.getByTestId('bet-status-badge')).toHaveText('Ouvert');
	await expect(page.getByTestId('bet-status-badge')).toBeVisible();
});

// ─── Scénario 9 : Un non-membre du groupe n'a pas accès (404) ─────────────────

test('Dave (non membre du groupe) ne peut pas accéder au pari → 404', async ({ browser }) => {
	const { betId } = await createClosestBet({
		title: '[E2E] S022 Dave non membre',
		hideAnswers: true
	});

	const daveContext = await browser.newContext();
	const davePage = await daveContext.newPage();
	await login(davePage, 'dave');
	await davePage.goto(`${GROUP_URL}/bets/${betId}`);

	await expect(davePage.getByRole('heading', { name: '404' })).toBeVisible();

	await daveContext.close();
});

// ─── Scénario 10 : Idempotence — double soumission → pas d'erreur ────────────

test("Double soumission au jury → idempotent (pas d'erreur)", async ({ browser }) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S022 Idempotence soumission',
		hideAnswers: true
	});

	// Bob participe et le match est déjà en judging
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${BOB_ID}, '42', '10')
  `;
	await db`UPDATE matches SET status = 'judging' WHERE id = ${matchId}`;

	// Bob accède à la page (déjà en judging → pas de bouton soumettre)
	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Le statut est déjà En jugement
	await expect(bobPage.getByTestId('bet-status-badge')).toHaveText('En jugement');

	// Le bouton Soumettre n'est plus visible (match déjà en judging)
	await expect(bobPage.getByTestId('submit-to-jury-section')).not.toBeVisible();

	await bobContext.close();
});

// ─── Scénario 11 : Description "Réponses : Cachées jusqu'à la soumission" ─────

test('En open avec hide_answers=true, message indique que réponses sont cachées', async ({
	page
}) => {
	const { betId } = await createClosestBet({
		title: '[E2E] S022 Message réponses cachées',
		hideAnswers: true
	});

	await login(page, 'alice');
	await page.goto(`${GROUP_URL}/bets/${betId}`);

	// Section réponses : doit indiquer qu'elles sont cachées
	await expect(page.getByTestId('bet-hide-answers')).toBeVisible();
	// Le texte doit indiquer que les réponses sont cachées jusqu'à la soumission au jury
	await expect(page.getByTestId('bet-hide-answers')).not.toContainText('Visibles par tous');
});

// ─── Scénario 12 : Non-régression — création et participation inchangées ──────

test('[non-régression] Création de pari et participation toujours fonctionnelles', async ({
	page
}) => {
	// Ce test vérifie que S-020 et S-021 n'ont pas régressé
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S022 Non-régression création+participation',
		hideAnswers: false
	});

	// Alice peut participer (match open)
	await login(page, 'alice');
	await page.goto(`${GROUP_URL}/bets/${betId}`);

	// Page de détail visible
	await expect(page.getByTestId('bet-title')).toHaveText(
		'[E2E] S022 Non-régression création+participation'
	);

	// Statut: Ouvert
	await expect(page.getByTestId('bet-status-badge')).toHaveText('Ouvert');

	// Formulaire de participation visible
	await expect(page.getByTestId('participate-section')).toBeVisible();
	await expect(page.getByTestId('answer-input')).toBeVisible();

	// Alice peut participer
	await page.waitForLoadState('networkidle');
	await page.getByTestId('answer-input').fill('100');
	await expect(page.getByTestId('answer-input')).toHaveValue('100');
	await page.getByTestId('participate-btn').click();

	// Après participation, page rechargée
	await expect(page.getByTestId('participate-btn')).toHaveText('Modifier', { timeout: 10000 });

	// hide_answers=false → estimation visible immédiatement
	const aliceItem = page.getByTestId('participant-item').filter({ hasText: 'Alice' });
	await expect(aliceItem.getByTestId('participant-answer')).toHaveText('100');

	// Alice est maintenant participante → bouton Soumettre visible
	await expect(page.getByTestId('submit-to-jury-section')).toBeVisible();
	await expect(page.getByTestId('submit-to-jury-btn')).toBeVisible();
});
