/**
 * S-040 — Vote du jury
 *
 * Critères d'acceptation :
 * 1. Un juré d'un match `judging` voit un panneau de vote : sélection du/des
 *    gagnant(s) parmi les participants (radio pour yesno, checkboxes pour closest)
 *    OU « Pas encore résolu ».
 * 2. Vote enregistré (jury_votes + jury_vote_winners), modifiable tant que le
 *    dépouillement (S-041) n'a pas conclu ; un juré = un vote (UNIQUE).
 * 3. Les votes déjà exprimés sont affichés à tous (juré → son choix).
 * 4. Un non-juré ne voit pas le panneau de vote (et l'action serveur refuse).
 * 5. Closest à gage `last_one` : le panneau demande aussi « qui est le plus loin ? ».
 * 6. Match yesno : un participant peut soumettre au jury (transition open → judging).
 *
 * Scénarios E2E :
 * - Closest : Carol (jurée) vote "Alice gagne" → vote visible par Alice et Bob.
 * - Closest : vote "Pas encore résolu" → affiché comme tel par tous.
 * - Closest last_one : sélecteur "Qui est le plus loin ?" visible pour un closest à gage last_one.
 * - Alice (non jurée, participante) ne voit pas le panneau de vote.
 * - Un juré peut modifier son vote avant conclusion.
 * - Yesno duel : Bob (participant) soumet au jury (transition open → judging).
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
// DAVE_ID is used as a 2nd juror in unanimous mode to prevent S-041 auto-resolution on first vote
const DAVE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a closest bet with optional stake type and forfeit_scope.
 * Alice = creator. Visibility = alice + bob. Juror = carol.
 * Returns { betId, matchId }.
 */
async function createClosestBet(opts: {
	title: string;
	stakeType?: 'points' | 'forfeit';
	forfeitScope?: 'all_losers' | 'last_one';
	withParticipants?: boolean;
	matchStatus?: 'open' | 'judging';
}): Promise<{ betId: string; matchId: string }> {
	const {
		title,
		stakeType = 'points',
		forfeitScope = 'all_losers',
		withParticipants = true,
		matchStatus = 'judging'
	} = opts;

	// Use unanimous + 2 jurés (Carol + Dave) so that 1 vote alone (S-040 tests)
	// does not trigger S-041 auto-resolution — the threshold requires both to agree.
	let betRow: { id: string }[];
	if (stakeType === 'points') {
		betRow = await db`
      INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, participation_deadline, jury_mode, status)
      VALUES (
        ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', ${title},
        'points', '10', false, null, 'unanimous', 'open'
      )
      RETURNING id
    `;
	} else {
		betRow = await db`
      INSERT INTO bets (group_id, creator_id, type, title, stake_type, forfeit_description, forfeit_scope, hide_answers, participation_deadline, jury_mode, status)
      VALUES (
        ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', ${title},
        'forfeit', 'Faire le café', ${forfeitScope}, false, null, 'unanimous', 'open'
      )
      RETURNING id
    `;
	}

	const bet = betRow[0];

	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    SELECT ${bet.id}, unnest(ARRAY[${ALICE_ID}, ${BOB_ID}]::uuid[])
  `;

	const [match] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, ${matchStatus}) RETURNING id
  `;

	await db`
    INSERT INTO match_jurors (match_id, user_id)
    SELECT ${match.id}, unnest(ARRAY[${CAROL_ID}, ${DAVE_ID}]::uuid[])
  `;

	if (withParticipants) {
		if (stakeType === 'points') {
			await db`
        INSERT INTO match_participants (match_id, user_id, answer, stake)
        VALUES (${match.id}, ${ALICE_ID}, '42', '10'),
               (${match.id}, ${BOB_ID}, '100', '10')
      `;
		} else {
			await db`
        INSERT INTO match_participants (match_id, user_id, answer)
        VALUES (${match.id}, ${ALICE_ID}, '42'),
               (${match.id}, ${BOB_ID}, '100')
      `;
		}
	}

	return { betId: bet.id, matchId: match.id };
}

/**
 * Creates a yesno duel bet (Alice vs Bob, Carol as juror).
 * Proposition is already accepted. Match created in given status.
 * Returns { betId, matchId }.
 */
async function createYesnoDuel(opts: {
	title: string;
	matchStatus?: 'open' | 'judging';
}): Promise<{ betId: string; matchId: string }> {
	const { title, matchStatus = 'open' } = opts;

	const [bet] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status)
    VALUES (
      ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'yesno', ${title},
      'points', '10', false, 'majority', 'open'
    )
    RETURNING id
  `;

	await db`
    INSERT INTO yesno_bets (bet_id, mode, creator_side, choice_a, choice_b, accepted_count, max_opponents)
    VALUES (${bet.id}, 'duel', 'a', 'Oui', 'Non', 1, 1)
  `;

	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    SELECT ${bet.id}, unnest(ARRAY[${ALICE_ID}, ${BOB_ID}]::uuid[])
  `;

	await db`
    INSERT INTO propositions (bet_id, target_id, last_proposer_id, stake_creator, stake_target, status)
    VALUES (${bet.id}, ${BOB_ID}, ${BOB_ID}, '10', '10', 'accepted')
  `;

	const [match] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, ${matchStatus}) RETURNING id
  `;

	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})`;

	await db`
    INSERT INTO match_participants (match_id, user_id, side, stake)
    VALUES (${match.id}, ${ALICE_ID}, 'a', '10'), (${match.id}, ${BOB_ID}, 'b', '10')
  `;

	return { betId: bet.id, matchId: match.id };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

test.afterEach(async () => {
	await db`DELETE FROM public.bets WHERE title LIKE '[E2E]%'`;
});

// ─── Scénario 1 : Carol (jurée) vote "Alice gagne" sur un closest ─────────────

test('Carol (jurée) vote "Alice gagne" → vote visible dans les votes exprimés', async ({
	browser
}) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S040 Carol vote Alice gagne'
	});

	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Badge En jugement
	await expect(carolPage.getByTestId('bet-status-badge')).toHaveText('En jugement');

	// Carol (jurée) voit le panneau de vote
	await expect(carolPage.getByTestId('jury-vote-section')).toBeVisible();
	await expect(carolPage.getByTestId('verdict-not-resolved')).toBeVisible();
	await expect(carolPage.getByTestId('verdict-winners-selected')).toBeVisible();

	// Le bouton "Voter" est désactivé tant qu'aucun verdict n'est sélectionné
	await expect(carolPage.getByTestId('cast-vote-btn')).toBeDisabled();

	// Svelte 5 reactivity : attendre la hydration avant de cliquer
	await carolPage.waitForLoadState('networkidle');
	await carolPage.waitForSelector('[data-testid="verdict-winners-selected"]');

	// Carol sélectionne "Désigner le(s) gagnant(s)" via le label (Svelte 5 onchange nécessite un vrai click)
	await carolPage
		.locator('label')
		.filter({ has: carolPage.getByTestId('verdict-winners-selected') })
		.click();

	// Les checkboxes des participants apparaissent
	await expect(carolPage.getByTestId('winners-selection')).toBeVisible();
	const winnerCheckboxes = carolPage.getByTestId('winner-checkbox');
	await expect(winnerCheckboxes).toHaveCount(2);

	// Carol coche Alice
	await carolPage
		.getByTestId('winners-selection')
		.locator('label')
		.filter({ hasText: 'Alice' })
		.locator('input')
		.check();

	// Le bouton Voter est maintenant actif
	await expect(carolPage.getByTestId('cast-vote-btn')).not.toBeDisabled();

	// Carol vote — attendre la réponse du serveur puis le rechargement complet des données
	const [voteResponse] = await Promise.all([
		carolPage.waitForResponse((r) =>
			r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		carolPage.getByTestId('cast-vote-btn').click()
	]);
	expect(voteResponse.status()).toBe(200);

	// Attendre que la page ait rechargé et que les nouvelles données soient rendues
	// (SvelteKit fait une navigation douce avec invalidation des données après redirect)
	await carolPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await carolPage.waitForLoadState('networkidle');

	// Les votes exprimés montrent le vote de Carol
	await expect(carolPage.getByTestId('jury-votes-display')).toBeVisible({ timeout: 10000 });
	const voteItem = carolPage.getByTestId('jury-vote-item');
	await expect(voteItem).toHaveCount(1);
	await expect(voteItem.getByTestId('jury-vote-juror')).toContainText('Carol');
	await expect(voteItem.getByTestId('jury-vote-winner')).toHaveText('Alice');

	// Le formulaire passe en "Modifier mon vote"
	await expect(carolPage.getByTestId('jury-vote-section')).toContainText('Modifier mon vote');

	// Vérification DB : le vote est enregistré
	const voteRows = await db`SELECT verdict FROM jury_votes WHERE match_id = ${matchId}`;
	expect(voteRows).toHaveLength(1);
	expect(voteRows[0].verdict).toBe('winners_selected');

	const winnerRows = await db`
    SELECT jvw.winner_user_id
    FROM jury_vote_winners jvw
    JOIN jury_votes jv ON jv.id = jvw.vote_id
    WHERE jv.match_id = ${matchId}
  `;
	expect(winnerRows).toHaveLength(1);
	expect(winnerRows[0].winner_user_id).toBe(ALICE_ID);

	await carolCtx.close();
});

// ─── Scénario 2 : Vote visible par Alice (participante, non jurée) ────────────

test('Vote de Carol visible par Alice (participante, non jurée)', async ({ browser }) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S040 Vote visible par Alice'
	});

	// Insérer directement un vote de Carol pour Alice
	const [vote] = await db`
    INSERT INTO jury_votes (match_id, juror_id, verdict)
    VALUES (${matchId}, ${CAROL_ID}, 'winners_selected')
    RETURNING id
  `;
	await db`INSERT INTO jury_vote_winners (vote_id, winner_user_id) VALUES (${vote.id}, ${ALICE_ID})`;

	// Alice accède à la page
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);

	// Alice voit le vote de Carol dans les votes exprimés
	await expect(alicePage.getByTestId('jury-votes-display')).toBeVisible();
	const voteItem = alicePage.getByTestId('jury-vote-item');
	await expect(voteItem).toHaveCount(1);
	await expect(voteItem.getByTestId('jury-vote-juror')).toContainText('Carol');
	await expect(voteItem.getByTestId('jury-vote-winner')).toHaveText('Alice');

	// Alice (non jurée) ne voit PAS le panneau de vote
	await expect(alicePage.getByTestId('jury-vote-section')).not.toBeVisible();

	// Alice voit le message "en attente du verdict"
	await expect(alicePage.getByTestId('judging-info-section')).toBeVisible();

	await aliceCtx.close();
});

// ─── Scénario 3 : Vote "Pas encore résolu" ────────────────────────────────────

test('Carol vote "Pas encore résolu" → affiché comme tel', async ({ browser }) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S040 Vote pas encore résolu'
	});

	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Svelte 5 reactivity : les radios avec onchange peuvent nécessiter d'attendre la hydration.
	// On attend d'abord que le panneau de vote soit complètement rendu.
	await carolPage.waitForLoadState('networkidle');
	await carolPage.waitForSelector('[data-testid="verdict-not-resolved"]');
	await carolPage.waitForSelector('[data-testid="verdict-winners-selected"]');

	// Carol sélectionne "Pas encore résolu"
	await carolPage.locator('label').filter({ has: carolPage.getByTestId('verdict-not-resolved') }).click();
	// Svelte 5 met à jour l'état de manière synchrone, mais la re-render peut prendre un tick
	await carolPage.waitForTimeout(200);
	await expect(carolPage.getByTestId('cast-vote-btn')).not.toBeDisabled();

	// Carol vote — attendre la réponse puis le rechargement complet
	const [voteResponse] = await Promise.all([
		carolPage.waitForResponse((r) =>
			r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		carolPage.getByTestId('cast-vote-btn').click()
	]);
	expect(voteResponse.status()).toBe(200);
	await carolPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await carolPage.waitForLoadState('networkidle');

	// Le vote s'affiche comme "Pas encore résolu"
	const voteItem = carolPage.getByTestId('jury-vote-item');
	await expect(voteItem).toHaveCount(1, { timeout: 10000 });
	await expect(voteItem.getByTestId('jury-vote-verdict')).toContainText('Pas encore résolu');

	// Vérification DB
	const voteRows = await db`SELECT verdict FROM jury_votes WHERE match_id = ${matchId}`;
	expect(voteRows[0].verdict).toBe('not_resolved');

	await carolCtx.close();
});

// ─── Scénario 4 : Un juré peut modifier son vote ──────────────────────────────

test('Carol modifie son vote : Alice → Pas encore résolu', async ({ browser }) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S040 Modification du vote'
	});

	// Insérer un vote initial de Carol pour Alice
	const [vote] = await db`
    INSERT INTO jury_votes (match_id, juror_id, verdict)
    VALUES (${matchId}, ${CAROL_ID}, 'winners_selected')
    RETURNING id
  `;
	await db`INSERT INTO jury_vote_winners (vote_id, winner_user_id) VALUES (${vote.id}, ${ALICE_ID})`;

	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Le panneau affiche "Modifier mon vote"
	await expect(carolPage.getByTestId('jury-vote-section')).toContainText('Modifier mon vote');

	// Le bouton vote dit "Modifier mon vote"
	await expect(carolPage.getByTestId('cast-vote-btn')).toHaveText('Modifier mon vote');

	// Carol change son verdict pour "Pas encore résolu"
	await carolPage.waitForLoadState('networkidle');
	await carolPage.waitForSelector('[data-testid="verdict-not-resolved"]');
	await carolPage.locator('label').filter({ has: carolPage.getByTestId('verdict-not-resolved') }).click();
	await carolPage.waitForTimeout(200);
	// Attendre la réponse du serveur puis le rechargement complet des données
	const [modifyResponse] = await Promise.all([
		carolPage.waitForResponse((r) =>
			r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		carolPage.getByTestId('cast-vote-btn').click()
	]);
	expect(modifyResponse.status()).toBe(200);
	await carolPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await carolPage.waitForLoadState('networkidle');

	// Le vote mis à jour s'affiche
	const voteItem = carolPage.getByTestId('jury-vote-item');
	await expect(voteItem).toHaveCount(1, { timeout: 10000 });
	await expect(voteItem.getByTestId('jury-vote-verdict')).toContainText('Pas encore résolu');

	// Vérification DB : un seul vote, verdict mis à jour
	const voteRows = await db`SELECT verdict FROM jury_votes WHERE match_id = ${matchId}`;
	expect(voteRows).toHaveLength(1);
	expect(voteRows[0].verdict).toBe('not_resolved');

	// Plus d'anciens gagnants en DB (delete cascade)
	const winnerRows = await db`
    SELECT jvw.* FROM jury_vote_winners jvw
    JOIN jury_votes jv ON jv.id = jvw.vote_id
    WHERE jv.match_id = ${matchId}
  `;
	expect(winnerRows).toHaveLength(0);

	await carolCtx.close();
});

// ─── Scénario 5 : Non-juré (Alice participante) ne voit pas le panneau ────────

test('Alice (participante, non jurée) ne voit pas le panneau de vote', async ({ page }) => {
	const { betId } = await createClosestBet({
		title: '[E2E] S040 Alice non jurée'
	});

	await login(page, 'alice');
	await page.goto(`${GROUP_URL}/bets/${betId}`);

	// Badge En jugement visible
	await expect(page.getByTestId('bet-status-badge')).toHaveText('En jugement');

	// Pas de panneau de vote pour Alice (non jurée)
	await expect(page.getByTestId('jury-vote-section')).not.toBeVisible();

	// Alice voit le message d'attente
	await expect(page.getByTestId('judging-info-section')).toBeVisible();
});

// ─── Scénario 6 : Closest gage last_one — sélecteur "qui est le plus loin ?" ─

test('Closest avec forfeit_scope=last_one : sélecteur loser visible dans le vote', async ({
	browser
}) => {
	const { betId } = await createClosestBet({
		title: '[E2E] S040 Closest last_one loser selection',
		stakeType: 'forfeit',
		forfeitScope: 'last_one'
	});

	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Attendre que la page soit complètement chargée
	await carolPage.waitForLoadState('networkidle');

	// Carol voit le panneau de vote
	await expect(carolPage.getByTestId('jury-vote-section')).toBeVisible();
	// Attendre que les radios soient cliquables
	await expect(carolPage.getByTestId('verdict-winners-selected')).toBeVisible();
	await expect(carolPage.getByTestId('verdict-not-resolved')).toBeVisible();

	// Carol sélectionne "Désigner le(s) gagnant(s)" via le label pour déclencher onchange Svelte 5
	await carolPage.locator('label').filter({ has: carolPage.getByTestId('verdict-winners-selected') }).click();
	await expect(carolPage.getByTestId('winners-selection')).toBeVisible();

	// Le sélecteur "Qui est le plus loin ?" est visible (last_one)
	await expect(carolPage.getByTestId('loser-selection')).toBeVisible();
	await expect(carolPage.getByTestId('loser-selection')).toContainText('Qui est le plus loin ?');

	// Des radios loser sont présents
	const loserRadios = carolPage.getByTestId('loser-radio');
	await expect(loserRadios).toHaveCount(2);

	await carolCtx.close();
});

// ─── Scénario 7 : Yesno duel open → soumission au jury par Bob ────────────────

test('Bob (participant yesno) soumet le duel au jury → badge En jugement', async ({ browser }) => {
	const { betId, matchId } = await createYesnoDuel({
		title: '[E2E] S040 Yesno soumission jury',
		matchStatus: 'open'
	});

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Bob voit le bouton "Soumettre au jury" (section yesno-specific)
	await expect(bobPage.getByTestId('submit-to-jury-yesno-section')).toBeVisible();
	await expect(bobPage.getByTestId('submit-to-jury-btn')).toBeVisible();
	await expect(bobPage.getByTestId('submit-to-jury-btn')).toContainText('Soumettre au jury');

	// Bob soumet — l'action redirect(303) vers la même page (reload des données)
	await Promise.all([
		bobPage.waitForResponse((r) =>
			r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		bobPage.getByTestId('submit-to-jury-btn').click()
	]);
	await bobPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await bobPage.waitForLoadState('networkidle');

	// Badge passe à "En jugement"
	await expect(bobPage.getByTestId('bet-status-badge')).toHaveText('En jugement', { timeout: 10000 });

	// Le bouton soumettre disparaît
	await expect(bobPage.getByTestId('submit-to-jury-yesno-section')).not.toBeVisible();

	// Vérification DB : match en judging
	const [matchRow] = await db`SELECT status FROM matches WHERE id = ${matchId}`;
	expect(matchRow.status).toBe('judging');

	await bobCtx.close();
});

// ─── Scénario 8 : Aucun vote exprimé → message "Aucun vote exprimé" ──────────

test('En jugement sans vote exprimé → section "Aucun vote exprimé"', async ({ page }) => {
	const { betId } = await createClosestBet({
		title: '[E2E] S040 Aucun vote exprimé'
	});

	await login(page, 'carol');
	await page.goto(`${GROUP_URL}/bets/${betId}`);

	// Le message "Aucun vote" s'affiche
	await expect(page.getByTestId('jury-votes-empty')).toBeVisible();
	await expect(page.getByTestId('jury-votes-display')).not.toBeVisible();
});

// ─── Scénario 9 : Bob (non-juré, participant) ne voit pas le panneau de vote ──

test('Bob (participant, non juré) ne voit pas le panneau de vote', async ({ browser }) => {
	const { betId } = await createClosestBet({
		title: '[E2E] S040 Bob non juré'
	});

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Badge En jugement
	await expect(bobPage.getByTestId('bet-status-badge')).toHaveText('En jugement');

	// Bob ne voit PAS le panneau de vote (non juré)
	await expect(bobPage.getByTestId('jury-vote-section')).not.toBeVisible();

	// Bob voit le message "en jugement"
	await expect(bobPage.getByTestId('judging-info-section')).toBeVisible();

	await bobCtx.close();
});

// ─── Scénario 10 : Pas de panneau de vote si match en 'open' ─────────────────

test("Pas de panneau de vote si le match est en statut 'open'", async ({ page }) => {
	const { betId } = await createClosestBet({
		title: '[E2E] S040 Pas de vote si open',
		matchStatus: 'open'
	});

	// Alice est dans la liste de visibilité → peut accéder au pari en open
	// (Carol ne peut pas car elle n'est pas dans la visibilité et le match n'est pas en judging)
	await login(page, 'alice');
	await page.goto(`${GROUP_URL}/bets/${betId}`);

	// Statut ouvert
	await expect(page.getByTestId('bet-status-badge')).toHaveText('Ouvert');

	// Aucun panneau de vote (pas encore en judging)
	await expect(page.getByTestId('jury-vote-section')).not.toBeVisible();
	await expect(page.getByTestId('jury-votes-display')).not.toBeVisible();
	await expect(page.getByTestId('jury-votes-empty')).not.toBeVisible();
});

// ─── Scénario 11 : Closest avec vote loser enregistré en DB ──────────────────

test('Vote closest last_one avec loser sélectionné → enregistré en DB', async ({ browser }) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S040 Vote avec loser DB',
		stakeType: 'forfeit',
		forfeitScope: 'last_one'
	});

	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Attendre que la page soit complètement chargée
	await carolPage.waitForLoadState('networkidle');
	await expect(carolPage.getByTestId('jury-vote-section')).toBeVisible();
	await expect(carolPage.getByTestId('verdict-winners-selected')).toBeVisible();

	// Carol sélectionne "Désigner le(s) gagnant(s)" via le label
	await carolPage.locator('label').filter({ has: carolPage.getByTestId('verdict-winners-selected') }).click();
	await expect(carolPage.getByTestId('winners-selection')).toBeVisible();

	// Carol coche Alice comme gagnante
	await carolPage
		.getByTestId('winners-selection')
		.locator('label')
		.filter({ hasText: 'Alice' })
		.locator('input[type="checkbox"]')
		.check();

	// Carol choisit Bob comme loser (le plus loin)
	await carolPage.getByTestId('loser-selection').locator('label').filter({ hasText: 'Bob' }).locator('input').click();

	// Carol vote — attendre la réponse puis le rechargement complet
	const [voteWithLoserResponse] = await Promise.all([
		carolPage.waitForResponse((r) =>
			r.url().includes(`/bets/${betId}`) && r.request().method() === 'POST'
		),
		carolPage.getByTestId('cast-vote-btn').click()
	]);
	expect(voteWithLoserResponse.status()).toBe(200);
	await carolPage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
	await carolPage.waitForLoadState('networkidle');

	// Vote visible avec gagnant et perdant
	const voteItem = carolPage.getByTestId('jury-vote-item');
	await expect(voteItem.getByTestId('jury-vote-winner')).toHaveText('Alice', { timeout: 10000 });
	await expect(voteItem.getByTestId('jury-vote-loser')).toHaveText('Bob');

	// Vérification DB : winner et loser enregistrés
	const winnerRows = await db`
    SELECT jvw.winner_user_id FROM jury_vote_winners jvw
    JOIN jury_votes jv ON jv.id = jvw.vote_id
    WHERE jv.match_id = ${matchId}
  `;
	expect(winnerRows[0].winner_user_id).toBe(ALICE_ID);

	const loserRows = await db`
    SELECT jvl.loser_user_id FROM jury_vote_losers jvl
    JOIN jury_votes jv ON jv.id = jvl.vote_id
    WHERE jv.match_id = ${matchId}
  `;
	expect(loserRows[0].loser_user_id).toBe(BOB_ID);

	await carolCtx.close();
});
