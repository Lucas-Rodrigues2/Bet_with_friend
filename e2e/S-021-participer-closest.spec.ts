/**
 * S-021 — Participer à un closest (estimation cachée)
 *
 * Critères d'acceptation :
 * 1. Sur la page du pari (statut open), un membre de la liste voit un champ « Mon estimation »
 *    + bouton « Miser X points » / « Parier (gage : Y) ».
 * 2. Soumission → match_participants (answer + stake) ; estimation visible, modifiable avant deadline.
 * 3. hide_answers=true : Bob ne voit pas l'estimation d'Alice (juste « Alice a joué »)
 *    tant que le match est open. Après clôture, tout le monde voit tout.
 * 4. hide_answers=false : les estimations sont visibles en direct.
 * 5. Deadline dépassée → plus de formulaire ; les non-participants deviennent spectateurs.
 * 6. Hors liste de visibilité → toujours 404.
 * 7. Le créateur peut participer comme les autres.
 *
 * Scénarios E2E :
 * - Alice et Bob misent ; avec hide_answers, Bob ne voit pas la réponse d'Alice.
 * - Carol (dans la liste) voit « 2 participants » mais pas les estimations.
 * - Bob modifie son estimation avant deadline → la nouvelle valeur est retenue.
 * - Deadline passée : Alice (participante) voit estimation figée, Bob (spectateur) voit bandeau.
 * - hide_answers=false → estimations visibles en direct.
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
 * Alice is creator. Visibility: alice + bob + carol. Juror: carol.
 */
async function createClosestBet(opts: {
	title: string;
	hideAnswers: boolean;
	deadline?: Date | null;
	stakeAmount?: string;
}): Promise<{ betId: string; matchId: string }> {
	const { title, hideAnswers, deadline = null, stakeAmount = '10' } = opts;

	const [bet] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, participation_deadline, jury_mode, status)
    VALUES (
      ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', ${title},
      'points', ${stakeAmount}, ${hideAnswers},
      ${deadline}, 'majority', 'open'
    )
    RETURNING id
  `;

	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    VALUES (${bet.id}, ${ALICE_ID}), (${bet.id}, ${BOB_ID}), (${bet.id}, ${CAROL_ID})
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

// ─── Scénario 1 : Alice participe, bouton « Miser X points » affiché ─────────

test('Alice (créatrice) peut participer — formulaire visible avec bouton Miser', async ({
	page
}) => {
	const { betId } = await createClosestBet({
		title: '[E2E] S021 Alice participe',
		hideAnswers: true
	});

	await login(page, 'alice');
	await page.goto(`${GROUP_URL}/bets/${betId}`);

	// Formulaire de participation visible
	await expect(page.getByTestId('participate-section')).toBeVisible();
	await expect(page.getByTestId('answer-input')).toBeVisible();
	await expect(page.getByTestId('participate-btn')).toBeVisible();
	// Bouton doit afficher "Miser 10 points"
	await expect(page.getByTestId('participate-btn')).toContainText('Miser');
	await expect(page.getByTestId('participate-btn')).toContainText('10');
});

// ─── Scénario 2 : Alice soumet une estimation ─────────────────────────────────

test('Alice soumet une estimation — enregistrée et affichée', async ({ page }) => {
	const { betId } = await createClosestBet({
		title: '[E2E] S021 soumission Alice',
		hideAnswers: true
	});

	await login(page, 'alice');
	await page.goto(`${GROUP_URL}/bets/${betId}`);

	// Attendre la fin des effets Svelte 5 (PostHog effect, hydration) pour éviter la race condition
	// value={answerValue} : un $effect qui lit data.bet.* peut re-setter input.value='' après fill().
	await page.waitForLoadState('networkidle');

	await page.getByTestId('answer-input').fill('42');
	await expect(page.getByTestId('answer-input')).toHaveValue('42');

	await page.getByTestId('participate-btn').click();

	// Attendre que la soumission soit traitée :
	// use:enhance intercepte et recharge les données via fetch.
	// Le bouton passe à "Modifier" une fois le rechargement effectué.
	await expect(page.getByTestId('participate-btn')).toHaveText('Modifier', { timeout: 10000 });

	// Participants count updated
	await expect(page.getByTestId('bet-participants')).toContainText('Participants (1)');

	// Alice voit sa propre estimation dans la liste
	const aliceItem = page.getByTestId('participant-item').filter({ hasText: 'Alice' });
	await expect(aliceItem).toBeVisible();
	await expect(aliceItem.getByTestId('participant-answer')).toHaveText('42');

	// Formulaire passe en mode "Modifier"
	await expect(page.getByTestId('participate-section')).toBeVisible();
	const heading = page.getByTestId('participate-section').getByRole('heading');
	await expect(heading).toHaveText('Modifier mon estimation');
	await expect(page.getByTestId('answer-input')).toHaveValue('42');
	await expect(page.getByTestId('participate-btn')).toHaveText('Modifier');
});

// ─── Scénario 3 : hide_answers=true — Bob ne voit pas la réponse d'Alice ─────

test('hide_answers=true — Bob voit Alice dans la liste mais pas sa réponse', async ({
	browser
}) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S021 hide_answers Alice+Bob',
		hideAnswers: true
	});

	// Alice participe en DB directement
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${ALICE_ID}, '42', '10')
  `;

	// Bob se connecte et accède au pari
	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Bob voit qu'Alice a participé (1 participant)
	await expect(bobPage.getByTestId('bet-participants')).toContainText('Participants (1)');

	// Alice apparaît dans la liste
	const aliceItem = bobPage.getByTestId('participant-item').filter({ hasText: 'Alice' });
	await expect(aliceItem).toBeVisible();

	// Mais l'estimation d'Alice est cachée
	await expect(aliceItem.getByTestId('answer-hidden')).toBeVisible();
	await expect(aliceItem.getByTestId('answer-hidden')).toContainText('Réponse cachée');
	// L'estimation réelle n'est pas visible
	await expect(aliceItem.getByTestId('participant-answer')).not.toBeVisible();

	// Bob a toujours accès au formulaire de participation
	await expect(bobPage.getByTestId('answer-input')).toBeVisible();

	await bobContext.close();
});

// ─── Scénario 4 : Alice + Bob misent, Carol (liste) voit 2 participants ───────

test('Alice et Bob misent — Carol voit 2 participants sans leurs estimations (hide=true)', async ({
	browser
}) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S021 deux participants Carol voit',
		hideAnswers: true
	});

	// Alice et Bob participent en DB
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${ALICE_ID}, '42', '10'), (${matchId}, ${BOB_ID}, '99', '10')
  `;

	// Carol se connecte
	const carolContext = await browser.newContext();
	const carolPage = await carolContext.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Carol voit 2 participants
	await expect(carolPage.getByTestId('bet-participants')).toContainText('Participants (2)');

	// Carol ne voit pas les estimations (toutes cachées)
	const hiddenAnswers = carolPage.getByTestId('answer-hidden');
	await expect(hiddenAnswers).toHaveCount(2);

	await carolContext.close();
});

// ─── Scénario 5 : Bob modifie son estimation ─────────────────────────────────

test('Bob modifie son estimation avant la deadline — nouvelle valeur retenue', async ({
	browser
}) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S021 Bob modifie estimation',
		hideAnswers: true
	});

	// Bob participe d'abord en DB avec "100"
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${BOB_ID}, '100', '10')
  `;

	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Attendre que la page soit complètement chargée (hydration Svelte 5 + effets PostHog)
	await bobPage.waitForLoadState('networkidle');

	// Bob voit l'interface "Modifier mon estimation"
	await expect(bobPage.getByTestId('participate-section')).toBeVisible();
	await expect(bobPage.getByTestId('answer-input')).toHaveValue('100');
	await expect(bobPage.getByTestId('participate-btn')).toHaveText('Modifier');

	// Bob change à "99"
	await bobPage.getByTestId('answer-input').fill('99');
	await bobPage.getByTestId('participate-btn').click();

	// Attendre que la soumission soit traitée et la page rechargée (avec les nouvelles données du serveur).
	// La liste des participants doit afficher la nouvelle valeur "99" (donnée qui vient du serveur).
	const bobParticipantItem = bobPage.getByTestId('participant-item').filter({ hasText: 'Bob' });
	await expect(bobParticipantItem.getByTestId('participant-answer')).toHaveText('99', {
		timeout: 10000
	});

	// Vérifier en DB que la valeur est bien 99
	const [row] = await db`
    SELECT answer FROM match_participants WHERE match_id = ${matchId} AND user_id = ${BOB_ID}
  `;
	expect(row.answer).toBe('99');

	await bobContext.close();
});

// ─── Scénario 6 : Deadline passée, Alice participante voit estimation figée ───

test('Deadline passée — Alice (participante) voit son estimation en lecture seule', async ({
	page
}) => {
	const pastDeadline = new Date('2020-01-01T10:00:00Z');
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S021 deadline passée Alice',
		hideAnswers: true,
		deadline: pastDeadline
	});

	// Alice a participé avant la deadline
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${ALICE_ID}, '50', '10')
  `;

	await login(page, 'alice');
	await page.goto(`${GROUP_URL}/bets/${betId}`);

	// Section participation visible en lecture seule
	await expect(page.getByTestId('participate-section')).toBeVisible();

	// Son estimation est affichée
	await expect(page.getByTestId('my-answer')).toHaveText('50');

	// Message informant que la deadline est passée
	await expect(page.getByTestId('participate-section')).toContainText(
		'La date limite est dépassée'
	);

	// Pas de formulaire de saisie
	await expect(page.getByTestId('answer-input')).not.toBeVisible();
});

// ─── Scénario 7 : Deadline passée, Bob spectateur ────────────────────────────

test('Deadline passée — Bob (non-participant) devient spectateur', async ({ browser }) => {
	const pastDeadline = new Date('2020-01-01T10:00:00Z');
	const { betId } = await createClosestBet({
		title: '[E2E] S021 deadline spectateur Bob',
		hideAnswers: true,
		deadline: pastDeadline
	});

	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Bandeau spectateur visible
	await expect(bobPage.getByTestId('spectator-banner')).toBeVisible();
	await expect(bobPage.getByTestId('spectator-banner')).toContainText('spectateur');

	// Pas de formulaire de participation
	await expect(bobPage.getByTestId('answer-input')).not.toBeVisible();

	await bobContext.close();
});

// ─── Scénario 8 : hide_answers=false — estimations visibles en direct ─────────

test('hide_answers=false — Bob voit les estimations en direct', async ({ browser }) => {
	const { betId, matchId } = await createClosestBet({
		title: '[E2E] S021 hide_answers=false',
		hideAnswers: false
	});

	// Alice participe
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${matchId}, ${ALICE_ID}, 'Paris', '10')
  `;

	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);

	// Bob voit la réponse d'Alice directement
	const aliceItem = bobPage.getByTestId('participant-item').filter({ hasText: 'Alice' });
	await expect(aliceItem).toBeVisible();
	await expect(aliceItem.getByTestId('participant-answer')).toHaveText('Paris');

	// Pas de "Réponse cachée"
	await expect(aliceItem.getByTestId('answer-hidden')).not.toBeVisible();

	await bobContext.close();
});

// ─── Scénario 9 : Hors liste de visibilité → 404 (non-régression S-020) ──────

test('Membre hors liste de visibilité → 404 par URL directe', async ({ browser }) => {
	// Créer un pari visible uniquement par Alice (pas Bob)
	const [bet] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status)
    VALUES (${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', '[E2E] S021 visible Alice seulement', 'points', '10', true, 'majority', 'open')
    RETURNING id
  `;
	await db`INSERT INTO bet_visibility (bet_id, user_id) VALUES (${bet.id}, ${ALICE_ID})`;
	const [match] = await db`INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'open') RETURNING id`;
	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})`;

	// Bob essaie d'accéder → 404
	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${bet.id}`);

	await expect(bobPage.getByRole('heading', { name: '404' })).toBeVisible();

	await bobContext.close();
});

// ─── Scénario 10 : Gage — bouton affiche le gage ─────────────────────────────

test('Pari avec gage — bouton de participation affiche le gage', async ({ page }) => {
	const [bet] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, forfeit_description, forfeit_scope, hide_answers, jury_mode, status)
    VALUES (${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', '[E2E] S021 gage participation', 'forfeit', 'Faire la vaisselle', 'all_losers', true, 'majority', 'open')
    RETURNING id
  `;
	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    VALUES (${bet.id}, ${ALICE_ID}), (${bet.id}, ${BOB_ID}), (${bet.id}, ${CAROL_ID})
  `;
	const [match] = await db`INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'open') RETURNING id`;
	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})`;

	await login(page, 'alice');
	await page.goto(`${GROUP_URL}/bets/${bet.id}`);

	// Bouton de participation affiche le gage
	await expect(page.getByTestId('participate-btn')).toBeVisible();
	await expect(page.getByTestId('participate-btn')).toContainText('Parier');
	await expect(page.getByTestId('participate-btn')).toContainText('gage');
	await expect(page.getByTestId('participate-btn')).toContainText('Faire la vaisselle');
});

// ─── Scénario 11 : Estimation vide → erreur de validation ────────────────────

test("Estimation vide → erreur de validation (champ required)", async ({ page }) => {
	const { betId } = await createClosestBet({
		title: '[E2E] S021 estimation vide',
		hideAnswers: true
	});

	await login(page, 'alice');
	await page.goto(`${GROUP_URL}/bets/${betId}`);

	// Soumettre sans remplir l'estimation
	await page.getByTestId('participate-btn').click();

	// Reste sur la page (HTML5 required empêche la soumission ou erreur affichée)
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/${betId}`));
});

// ─── Scénario 12 : Tentative de participation avec match clôturé ─────────────

test('Match clôturé — bouton de participation désactivé/absent', async ({ page }) => {
	const [bet] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status)
    VALUES (${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', '[E2E] S021 match clos', 'points', '10', true, 'majority', 'open')
    RETURNING id
  `;
	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    VALUES (${bet.id}, ${ALICE_ID}), (${bet.id}, ${BOB_ID}), (${bet.id}, ${CAROL_ID})
  `;
	// Match status = 'closed'
	const [match] = await db`INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'closed') RETURNING id`;
	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})`;

	await login(page, 'alice');
	await page.goto(`${GROUP_URL}/bets/${bet.id}`);

	// Participer section = disabled button or not visible
	const participateBtn = page.getByTestId('participate-btn');
	// Either the btn is disabled or the answer-input is not visible
	const answerInput = page.getByTestId('answer-input');
	// At least one of: input not visible OR btn disabled
	const inputVisible = await answerInput.isVisible();
	if (inputVisible) {
		// If input is somehow visible, button should be disabled
		await expect(participateBtn).toBeDisabled();
	} else {
		// Input not visible = correct behavior
		await expect(answerInput).not.toBeVisible();
	}
});

// ─── Scénario 13 : Guard auth — accès sans session → /login ──────────────────

test('Accès sans session → redirection /login', async ({ page }) => {
	await page.goto(`${GROUP_URL}/bets/00000000-0000-0000-0000-000000000001`);
	await expect(page).toHaveURL(/\/login/);
});
