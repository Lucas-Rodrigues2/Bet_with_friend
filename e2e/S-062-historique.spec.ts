/**
 * S-062 — Historique des paris
 *
 * Critères d'acceptation :
 * 1. Onglet « Paris » du groupe : filtres En cours / En jugement / Terminés /
 *    Annulés + recherche par titre.
 * 2. Vue « Mes paris » transverse aux groupes (gagnés/perdus/en cours).
 * 3. La page d'un pari terminé affiche le récit complet : participations,
 *    négociation (yesno), votes du jury, verdict, mouvements d'ardoise/gages.
 * 4. Aucune action possible sur un pari terminé (lecture seule).
 *
 * Scénarios E2E :
 * - Filtres : un pari résolu apparaît sous « Terminés » (et PAS sous « En cours ») ;
 *   un défi ouvert mixte (un match résolu + un match ouvert) reste classé
 *   « En cours » tant qu'un match est ouvert.
 * - Recherche par titre.
 * - « Mes paris » d'Alice agrège deux groupes (helper DB pour le second groupe
 *   + pari résolu où Alice gagne).
 * - La page du pari résolu montre votes + verdict + gagnants + mouvements
 *   ardoise (non-régression S-041).
 * - Aucune action possible sur un pari terminé (lecture seule).
 * - Respect de la visibilité d'origine (un membre non dans bet_visibility ne
 *   voit pas le pari dans la liste).
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;
const BETS_URL = `${GROUP_URL}/bets`;
const MY_BETS_URL = `/app/my-bets`;

// User IDs from seed.sql
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const DAVE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── Helpers DB ───────────────────────────────────────────────────────────────

/**
 * Crée un duel yesno résolu : Alice (camp A) vs Bob (camp B), Carol jurée,
 * verdict "winners_selected" → Alice gagnante. Crée le match en judging puis
 * insère le vote + résout le match + crée match_winners + ledger_entries en DB
 * (comme evaluateVerdict le ferait).
 */
async function createResolvedYesnoDuel(opts: {
	groupId: string;
	title: string;
	stakeCreator?: number;
	stakeTarget?: number;
}): Promise<{ betId: string; matchId: string }> {
	const { groupId, title, stakeCreator = 10, stakeTarget = 5 } = opts;

	const [betRow] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount,
                      hide_answers, jury_mode, status)
    VALUES (
      ${groupId}, ${ALICE_ID}, 'yesno', ${title},
      'points', ${stakeCreator}, false, 'majority', 'open'
    )
    RETURNING id
  `;

	const bet = betRow;

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
    VALUES (${bet.id}, ${BOB_ID}, ${BOB_ID}, ${stakeCreator}, ${stakeTarget}, 'accepted')
  `;

	const [match] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'judging') RETURNING id
  `;

	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})`;

	await db`
    INSERT INTO match_participants (match_id, user_id, side, stake)
    VALUES (${match.id}, ${ALICE_ID}, 'a', ${stakeCreator}),
           (${match.id}, ${BOB_ID}, 'b', ${stakeTarget})
  `;

	// Carol vote Alice gagnante
	const [vote] = await db`
    INSERT INTO jury_votes (match_id, juror_id, verdict)
    VALUES (${match.id}, ${CAROL_ID}, 'winners_selected')
    RETURNING id
  `;
	await db`INSERT INTO jury_vote_winners (vote_id, winner_user_id) VALUES (${vote.id}, ${ALICE_ID})`;

	// Résolution
	await db`UPDATE matches SET status = 'resolved', resolved_at = now() WHERE id = ${match.id}`;
	await db`INSERT INTO match_winners (match_id, user_id, share) VALUES (${match.id}, ${ALICE_ID}, ${stakeTarget.toFixed(2)})`;
	await db`
    INSERT INTO ledger_entries (group_id, match_id, debtor_id, creditor_id, amount)
    VALUES (${groupId}, ${match.id}, ${BOB_ID}, ${ALICE_ID}, ${stakeTarget.toFixed(2)})
  `;

	return { betId: bet.id, matchId: match.id };
}

/**
 * Crée un pari closest ouvert (Alice + Bob participants, Carol jurée) —
 * utilisé pour le filtre « En cours ».
 */
async function createOpenClosest(opts: {
	groupId: string;
	title: string;
}): Promise<{ betId: string; matchId: string }> {
	const { groupId, title } = opts;

	const [betRow] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount,
                      hide_answers, jury_mode, status)
    VALUES (
      ${groupId}, ${ALICE_ID}, 'closest', ${title},
      'points', '10', false, 'majority', 'open'
    )
    RETURNING id
  `;
	const bet = betRow;

	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    SELECT ${bet.id}, unnest(ARRAY[${ALICE_ID}, ${BOB_ID}]::uuid[])
  `;

	const [match] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'open') RETURNING id
  `;
	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})`;
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${match.id}, ${ALICE_ID}, '42', '10'),
           (${match.id}, ${BOB_ID}, '100', '10')
  `;

	return { betId: bet.id, matchId: match.id };
}

/**
 * Crée un pari closest résolu (Alice gagnante, Bob perdant) — pour le détail
 * lecteur seule + non-régression S-041 (votes + verdict + ardoise).
 */
async function createResolvedClosest(opts: {
	groupId: string;
	title: string;
}): Promise<{ betId: string; matchId: string }> {
	const { groupId, title } = opts;

	const [betRow] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount,
                      hide_answers, jury_mode, status)
    VALUES (
      ${groupId}, ${ALICE_ID}, 'closest', ${title},
      'points', '10', false, 'majority', 'open'
    )
    RETURNING id
  `;
	const bet = betRow;

	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    SELECT ${bet.id}, unnest(ARRAY[${ALICE_ID}, ${BOB_ID}]::uuid[])
  `;

	const [match] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'judging') RETURNING id
  `;
	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})`;
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${match.id}, ${ALICE_ID}, '42', '10'),
           (${match.id}, ${BOB_ID}, '100', '10')
  `;

	const [vote] = await db`
    INSERT INTO jury_votes (match_id, juror_id, verdict)
    VALUES (${match.id}, ${CAROL_ID}, 'winners_selected')
    RETURNING id
  `;
	await db`INSERT INTO jury_vote_winners (vote_id, winner_user_id) VALUES (${vote.id}, ${ALICE_ID})`;

	await db`UPDATE matches SET status = 'resolved', resolved_at = now() WHERE id = ${match.id}`;
	await db`INSERT INTO match_winners (match_id, user_id, share) VALUES (${match.id}, ${ALICE_ID}, '10.00')`;
	await db`
    INSERT INTO ledger_entries (group_id, match_id, debtor_id, creditor_id, amount)
    VALUES (${groupId}, ${match.id}, ${BOB_ID}, ${ALICE_ID}, '10.00')
  `;

	return { betId: bet.id, matchId: match.id };
}

/**
 * Crée un pari annulé : closest avec un match en status='cancelled' +
 * une demande d'annulation (match_cancellations) pour chaque participant.
 */
async function createCancelledClosest(opts: {
	groupId: string;
	title: string;
}): Promise<{ betId: string; matchId: string }> {
	const { groupId, title } = opts;

	const [betRow] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount,
                      hide_answers, jury_mode, status)
    VALUES (
      ${groupId}, ${ALICE_ID}, 'closest', ${title},
      'points', '10', false, 'majority', 'open'
    )
    RETURNING id
  `;
	const bet = betRow;

	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    SELECT ${bet.id}, unnest(ARRAY[${ALICE_ID}, ${BOB_ID}]::uuid[])
  `;

	const [match] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'cancelled') RETURNING id
  `;
	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match.id}, ${CAROL_ID})`;
	await db`
    INSERT INTO match_participants (match_id, user_id, answer, stake)
    VALUES (${match.id}, ${ALICE_ID}, '42', '10'),
           (${match.id}, ${BOB_ID}, '100', '10')
  `;
	await db`
    INSERT INTO match_cancellations (match_id, user_id)
    SELECT ${match.id}, unnest(ARRAY[${ALICE_ID}, ${BOB_ID}]::uuid[])
  `;

	return { betId: bet.id, matchId: match.id };
}

/**
 * Crée un défi ouvert yesno (mode='open', max_opponents=2) avec deux matches :
 *  - match 1 : Alice vs Bob, résolu (Alice gagnante)
 *  - match 2 : Alice vs Dave, encore ouvert
 * Le pari doit être classé « En cours » (hasOpen) malgré un match résolu.
 */
async function createOpenChallengeMixte(opts: {
	groupId: string;
	title: string;
}): Promise<{ betId: string; resolvedMatchId: string; openMatchId: string }> {
	const { groupId, title } = opts;

	const [betRow] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount,
                      hide_answers, jury_mode, status)
    VALUES (
      ${groupId}, ${ALICE_ID}, 'yesno', ${title},
      'points', '10', false, 'majority', 'open'
    )
    RETURNING id
  `;
	const bet = betRow;

	await db`
    INSERT INTO yesno_bets (bet_id, mode, creator_side, choice_a, choice_b,
                             accepted_count, max_opponents, open_stake_creator, open_stake_opponent)
    VALUES (${bet.id}, 'open', 'a', 'Oui', 'Non', 2, 2, '10', '10')
  `;

	// Visibilité : Alice (créatrice) + Bob + Dave (accepteurs potentiels) + Carol (jurée)
	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    SELECT ${bet.id}, unnest(ARRAY[${ALICE_ID}, ${BOB_ID}, ${DAVE_ID}, ${CAROL_ID}]::uuid[])
  `;
	await db`
    INSERT INTO bet_jurors (bet_id, user_id)
    SELECT ${bet.id}, unnest(ARRAY[${CAROL_ID}]::uuid[])
  `;

	// Match 1 (résolu) : Alice vs Bob
	const [match1] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'judging') RETURNING id
  `;
	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match1.id}, ${CAROL_ID})`;
	await db`
    INSERT INTO match_participants (match_id, user_id, side, stake)
    VALUES (${match1.id}, ${ALICE_ID}, 'a', '10'),
           (${match1.id}, ${BOB_ID}, 'b', '10')
  `;
	const [vote1] = await db`
    INSERT INTO jury_votes (match_id, juror_id, verdict)
    VALUES (${match1.id}, ${CAROL_ID}, 'winners_selected')
    RETURNING id
  `;
	await db`INSERT INTO jury_vote_winners (vote_id, winner_user_id) VALUES (${vote1.id}, ${ALICE_ID})`;
	await db`UPDATE matches SET status = 'resolved', resolved_at = now() WHERE id = ${match1.id}`;
	await db`INSERT INTO match_winners (match_id, user_id, share) VALUES (${match1.id}, ${ALICE_ID}, '10.00')`;
	await db`
    INSERT INTO ledger_entries (group_id, match_id, debtor_id, creditor_id, amount)
    VALUES (${groupId}, ${match1.id}, ${BOB_ID}, ${ALICE_ID}, '10.00')
  `;

	// Match 2 (ouvert) : Alice vs Dave
	const [match2] = await db`
    INSERT INTO matches (bet_id, status) VALUES (${bet.id}, 'open') RETURNING id
  `;
	await db`INSERT INTO match_jurors (match_id, user_id) VALUES (${match2.id}, ${CAROL_ID})`;
	await db`
    INSERT INTO match_participants (match_id, user_id, side, stake)
    VALUES (${match2.id}, ${ALICE_ID}, 'a', '10'),
           (${match2.id}, ${DAVE_ID}, 'b', '10')
  `;

	return { betId: bet.id, resolvedMatchId: match1.id, openMatchId: match2.id };
}

/**
 * Crée un second groupe de test (Alice admin, Bob + Carol membres) et un pari
 * yesno résolu où Alice gagne. Retourne le groupe + le pari.
 */
async function createSecondGroupWithResolvedBet(
	title: string
): Promise<{ groupId: string; groupName: string; betId: string; matchId: string }> {
	const groupName = `E2E S062 Group Second ${Date.now()}`;
	const [groupRow] = await db`
    INSERT INTO groups (name, description, currency, creator_id, created_at)
    VALUES (${groupName}, 'Groupe secondaire E2E S-062', 'EUR', ${ALICE_ID}, now())
    RETURNING id
  `;
	const groupId = groupRow.id;

	await db`
    INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES
      (${groupId}, ${ALICE_ID}, 'admin', now()),
      (${groupId}, ${BOB_ID}, 'member', now()),
      (${groupId}, ${CAROL_ID}, 'member', now())
  `;

	const { betId, matchId } = await createResolvedYesnoDuel({ groupId, title });

	return { groupId, groupName, betId, matchId };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

test.afterEach(async () => {
	// Supprimer les ledger_entries liées aux paris E2E S-062 avant les paris
	await db`
		DELETE FROM ledger_entries
		WHERE match_id IN (
			SELECT m.id FROM matches m
			JOIN bets b ON b.id = m.bet_id
			WHERE b.title LIKE '[E2E] S062%'
		)
	`;
	await db`DELETE FROM bets WHERE title LIKE '[E2E] S062%'`;
	await db`DELETE FROM groups WHERE name LIKE 'E2E S062%'`;
});

// ─── 1. Filtres : pari résolu sous « Terminés », pas sous « En cours » ─────────

test('Filtres : un pari résolu apparaît sous « Terminés » et PAS sous « En cours »', async ({
	browser
}) => {
	const { betId } = await createResolvedYesnoDuel({
		groupId: SEEDED_GROUP_ID,
		title: '[E2E] S062 Résolu duel points',
		stakeCreator: 10,
		stakeTarget: 5
	});

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');

	// Filtre « Terminés » → le pari y apparaît
	await alicePage.goto(`${BETS_URL}?filter=resolved`);
	await alicePage.waitForLoadState('networkidle');
	await expect(alicePage.getByTestId('group-bets-list')).toBeVisible();
	const item = alicePage.getByTestId('group-bet-item').filter({
		hasText: '[E2E] S062 Résolu duel points'
	});
	await expect(item).toHaveCount(1);
	await expect(item.getByTestId('group-bet-title')).toHaveText('[E2E] S062 Résolu duel points');
	await expect(item.getByTestId('group-bet-status')).toHaveText('Terminé');

	// Filtre « En cours » → le pari n'y apparaît pas
	await alicePage.goto(`${BETS_URL}?filter=active`);
	await alicePage.waitForLoadState('networkidle');
	// Soit la liste est vide, soit elle ne contient pas ce pari
	const activeItems = alicePage.getByTestId('group-bet-item');
	const activeCount = await activeItems.count();
	for (let i = 0; i < activeCount; i++) {
		await expect(
			activeItems.nth(i).getByTestId('group-bet-title')
		).not.toHaveText('[E2E] S062 Résolu duel points');
	}

	// Filtre « Tous » → le pari y apparaît aussi
	await alicePage.goto(`${BETS_URL}`);
	await alicePage.waitForLoadState('networkidle');
	await expect(
		alicePage.getByTestId('group-bet-item').filter({
			hasText: '[E2E] S062 Résolu duel points'
		})
	).toHaveCount(1);

	await aliceCtx.close();
});

// ─── 2. Défi ouvert mixte (1 résolu + 1 ouvert) classé « En cours » ────────────

test('Défi ouvert mixte (un match résolu + un match ouvert) reste classé « En cours »', async ({
	browser
}) => {
	const { betId } = await createOpenChallengeMixte({
		groupId: SEEDED_GROUP_ID,
		title: '[E2E] S062 Défi ouvert mixte'
	});

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');

	// Sous « En cours » : visible, badge « En cours »
	await alicePage.goto(`${BETS_URL}?filter=active`);
	await alicePage.waitForLoadState('networkidle');
	const activeItem = alicePage.getByTestId('group-bet-item').filter({
		hasText: '[E2E] S062 Défi ouvert mixte'
	});
	await expect(activeItem).toHaveCount(1);
	await expect(activeItem.getByTestId('group-bet-status')).toHaveText('En cours');

	// Sous « Terminés » : NON visible (hasOpen → displayStatus=active)
	await alicePage.goto(`${BETS_URL}?filter=resolved`);
	await alicePage.waitForLoadState('networkidle');
	const resolvedItems = alicePage.getByTestId('group-bet-item');
	const resolvedCount = await resolvedItems.count();
	for (let i = 0; i < resolvedCount; i++) {
		await expect(
			resolvedItems.nth(i).getByTestId('group-bet-title')
		).not.toHaveText('[E2E] S062 Défi ouvert mixte');
	}

	// Sous « Tous » : visible
	await alicePage.goto(`${BETS_URL}`);
	await alicePage.waitForLoadState('networkidle');
	await expect(
		alicePage.getByTestId('group-bet-item').filter({
			hasText: '[E2E] S062 Défi ouvert mixte'
		})
	).toHaveCount(1);

	await aliceCtx.close();
});

// ─── 3. Filtre « Annulés » ─────────────────────────────────────────────────────

test('Filtre « Annulés » : un pari annulé apparaît sous ce filtre', async ({ browser }) => {
	await createCancelledClosest({
		groupId: SEEDED_GROUP_ID,
		title: '[E2E] S062 Pari annulé'
	});

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');

	await alicePage.goto(`${BETS_URL}?filter=cancelled`);
	await alicePage.waitForLoadState('networkidle');
	const item = alicePage.getByTestId('group-bet-item').filter({
		hasText: '[E2E] S062 Pari annulé'
	});
	await expect(item).toHaveCount(1);
	await expect(item.getByTestId('group-bet-status')).toHaveText('Annulé');

	// Et non sous « En cours »
	await alicePage.goto(`${BETS_URL}?filter=active`);
	await alicePage.waitForLoadState('networkidle');
	const activeItems = alicePage.getByTestId('group-bet-item');
	const activeCount = await activeItems.count();
	for (let i = 0; i < activeCount; i++) {
		await expect(activeItems.nth(i).getByTestId('group-bet-title')).not.toHaveText(
			'[E2E] S062 Pari annulé'
		);
	}

	await aliceCtx.close();
});

// ─── 4. Recherche par titre ───────────────────────────────────────────────────

test('Recherche par titre : filtre la liste sur le substring saisi', async ({ browser }) => {
	await createOpenClosest({
		groupId: SEEDED_GROUP_ID,
		title: '[E2E] S062 Recherche Trésor'
	});
	await createResolvedYesnoDuel({
		groupId: SEEDED_GROUP_ID,
		title: '[E2E] S062 Recherche PasMoi'
	});

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');

	// Recherche « Trésor » → seul le pari correspondant apparaît
	await alicePage.goto(`${BETS_URL}?q=Tr%C3%A9sor`);
	await alicePage.waitForLoadState('networkidle');
	const items = alicePage.getByTestId('group-bet-item');
	await expect(items).toHaveCount(1);
	await expect(items.getByTestId('group-bet-title')).toHaveText('[E2E] S062 Recherche Trésor');

	// Recherche ne correspondant à rien → état vide
	await alicePage.goto(`${BETS_URL}?q=ZZZNOPE`);
	await alicePage.waitForLoadState('networkidle');
	await expect(alicePage.getByTestId('group-bets-empty')).toBeVisible();
	await expect(alicePage.getByTestId('group-bets-list')).toHaveCount(0);

	// Recherche via le formulaire (GET) conserve le filtre actif
	await alicePage.goto(`${BETS_URL}?filter=resolved`);
	await alicePage.waitForLoadState('networkidle');
	await alicePage.getByTestId('group-bets-search-input').fill('PasMoi');
	await Promise.all([
		alicePage.waitForURL((url) => url.searchParams.get('q') === 'PasMoi', { timeout: 10000 }),
		alicePage.getByTestId('group-bets-search-submit').click()
	]);
	await alicePage.waitForLoadState('networkidle');
	// L'URL conserve filter=resolved + q=PasMoi
	expect(alicePage.url()).toContain('filter=resolved');
	expect(alicePage.url()).toContain('q=PasMoi');
	const found = alicePage.getByTestId('group-bet-item');
	await expect(found).toHaveCount(1);
	await expect(found.getByTestId('group-bet-title')).toHaveText('[E2E] S062 Recherche PasMoi');

	await aliceCtx.close();
});

// ─── 5. « Mes paris » d'Alice agrège deux groupes ──────────────────────────────

test('« Mes paris » d\'Alice agrège deux groupes (gagnés)', async ({ browser }) => {
	// Pari résolu dans le groupe seedé (Alice gagnante)
	await createResolvedYesnoDuel({
		groupId: SEEDED_GROUP_ID,
		title: '[E2E] S062 Mes paris seeded'
	});

	// Second groupe + pari résolu (Alice gagnante)
	const second = await createSecondGroupWithResolvedBet('[E2E] S062 Mes paris second');

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');

	// Filtre « Tous » → on retrouve les deux paris (deux groupes distincts)
	await alicePage.goto(`${MY_BETS_URL}`);
	await alicePage.waitForLoadState('networkidle');

	const allItems = alicePage.getByTestId('my-bet-item');
	const allCount = await allItems.count();
	expect(allCount).toBeGreaterThanOrEqual(2);

	// Vérifier la présence des deux titres
	const titles = await allItems.getByTestId('my-bet-title').allTextContents();
	expect(titles).toContain('[E2E] S062 Mes paris seeded');
	expect(titles).toContain('[E2E] S062 Mes paris second');

	// Vérifier que les noms de groupes sont distincts et affichés
	const groupNames = await allItems.locator('.text-muted-foreground.text-xs').allTextContents();
	const allGroupTexts = groupNames.join('||');
	expect(allGroupTexts).toContain('Les potes du test');
	expect(allGroupTexts).toContain(second.groupName);

	// Filtre « Gagnés » → les deux paris (Alice gagnante sur les deux)
	await alicePage.goto(`${MY_BETS_URL}?filter=won`);
	await alicePage.waitForLoadState('networkidle');
	const wonItems = alicePage.getByTestId('my-bet-item');
	const wonCount = await wonItems.count();
	expect(wonCount).toBeGreaterThanOrEqual(2);
	const wonTitles = await wonItems.getByTestId('my-bet-title').allTextContents();
	expect(wonTitles).toContain('[E2E] S062 Mes paris seeded');
	expect(wonTitles).toContain('[E2E] S062 Mes paris second');
	// Toutes les pastilles sont « Gagné »
	const wonOutcomes = await wonItems.getByTestId('my-bet-outcome').allTextContents();
	for (const o of wonOutcomes) {
		expect(o).toBe('Gagné');
	}

	// Filtre « Perdus » → aucun de ces deux paris (Alice a gagné)
	await alicePage.goto(`${MY_BETS_URL}?filter=lost`);
	await alicePage.waitForLoadState('networkidle');
	const lostItems = alicePage.getByTestId('my-bet-item');
	const lostCount = await lostItems.count();
	for (let i = 0; i < lostCount; i++) {
		const t = await lostItems.nth(i).getByTestId('my-bet-title').textContent();
		expect(t).not.toBe('[E2E] S062 Mes paris seeded');
		expect(t).not.toBe('[E2E] S062 Mes paris second');
	}

	await aliceCtx.close();
});

// ─── 6. Détail d'un pari résolu : votes + verdict + gagnants + ardoise ────────
//    (non-régression S-041)

test('Détail d\'un pari résolu : votes + verdict + gagnants + mouvements ardoise (S-041)', async ({
	browser
}) => {
	const { betId, matchId } = await createResolvedYesnoDuel({
		groupId: SEEDED_GROUP_ID,
		title: '[E2E] S062 Détail résolu',
		stakeCreator: 10,
		stakeTarget: 5
	});

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage.waitForLoadState('networkidle');

	// Section résolution visible
	await expect(alicePage.getByTestId('resolution-section')).toBeVisible({ timeout: 10000 });

	// Gagnant : Alice avec +5.00 pts
	await expect(alicePage.getByTestId('resolution-winners')).toBeVisible();
	const winner = alicePage.getByTestId('resolution-winner');
	await expect(winner).toHaveCount(1);
	await expect(winner).toContainText('Alice');
	await expect(winner.getByTestId('winner-share')).toHaveText('+5.00 pts');

	// Ardoise : Bob doit 5.00 pts à Alice
	await expect(alicePage.getByTestId('resolution-ledger')).toBeVisible();
	const ledgerEntry = alicePage.getByTestId('ledger-entry');
	await expect(ledgerEntry).toHaveCount(1);
	await expect(ledgerEntry.getByTestId('ledger-debtor')).toHaveText('Bob');
	await expect(ledgerEntry.getByTestId('ledger-amount')).toHaveText('5.00 pts');
	await expect(ledgerEntry.getByTestId('ledger-creditor')).toHaveText('Alice');

	// Votes du jury visibles (Carol, verdict winners_selected → Alice)
	await expect(alicePage.getByTestId('jury-votes-display')).toBeVisible();
	const voteItem = alicePage.getByTestId('jury-vote-item');
	await expect(voteItem).toHaveCount(1);
	await expect(voteItem.getByTestId('jury-vote-juror')).toContainText('Carol');
	await expect(voteItem.getByTestId('jury-vote-winner')).toContainText('Alice');

	await aliceCtx.close();
});

// ─── 7. Aucune action possible sur un pari terminé (lecture seule) ─────────────

test('Pari terminé : aucune action possible (lecture seule)', async ({ browser }) => {
	const { betId } = await createResolvedClosest({
		groupId: SEEDED_GROUP_ID,
		title: '[E2E] S062 Lecture seule'
	});

	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}/bets/${betId}`);
	await alicePage.waitForLoadState('networkidle');

	// Badge statut « Résolu »
	await expect(alicePage.getByTestId('bet-status-badge')).toHaveText('Résolu');

	// Section résolution visible (récit complet)
	await expect(alicePage.getByTestId('resolution-section')).toBeVisible({ timeout: 10000 });

	// Aucun bouton d'action ne doit être présent / actionnable
	await expect(alicePage.getByTestId('participate-btn')).toHaveCount(0);
	await expect(alicePage.getByTestId('submit-to-jury-btn')).toHaveCount(0);
	await expect(alicePage.getByTestId('submit-to-jury-section')).toHaveCount(0);
	await expect(alicePage.getByTestId('submit-to-jury-yesno-section')).toHaveCount(0);
	await expect(alicePage.getByTestId('accept-btn')).toHaveCount(0);
	await expect(alicePage.getByTestId('refuse-btn')).toHaveCount(0);
	await expect(alicePage.getByTestId('counter-propose-btn')).toHaveCount(0);
	await expect(alicePage.getByTestId('cancel-proposition-btn')).toHaveCount(0);
	await expect(alicePage.getByTestId('request-cancellation-btn')).toHaveCount(0);
	await expect(alicePage.getByTestId('cancellation-section')).toHaveCount(0);
	await expect(alicePage.getByTestId('accept-open-btn')).toHaveCount(0);

	// Panneau de vote du jury absent (match résolu, plus en judging)
	await expect(alicePage.getByTestId('jury-vote-section')).toHaveCount(0);
	await expect(alicePage.getByTestId('cast-vote-btn')).toHaveCount(0);

	// La section « Mon estimation » s'affiche en lecture seule (pas de bouton)
	const participateSection = alicePage.getByTestId('participate-section');
	await expect(participateSection).toHaveCount(1);
	await expect(participateSection.getByTestId('my-answer')).toHaveText('42');

	await aliceCtx.close();
});

// ─── 8. Respect de la visibilité d'origine ─────────────────────────────────────

test('Visibilité : un membre non dans bet_visibility ne voit pas le pari dans la liste', async ({
	browser
}) => {
	// Pari visible uniquement par Alice + Bob (Carol est membre du groupe mais
	// pas dans bet_visibility → ne doit pas voir ce pari)
	const [betRow] = await db`
    INSERT INTO bets (group_id, creator_id, type, title, stake_type, stake_amount,
                      hide_answers, jury_mode, status)
    VALUES (
      ${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', '[E2E] S062 Caché Carol',
      'points', '10', false, 'majority', 'open'
    )
    RETURNING id
  `;
	await db`
    INSERT INTO bet_visibility (bet_id, user_id)
    SELECT ${betRow.id}, unnest(ARRAY[${ALICE_ID}, ${BOB_ID}]::uuid[])
  `;
	await db`
    INSERT INTO matches (bet_id, status) VALUES (${betRow.id}, 'open')
  `;

	// Alice (dans la visibilité) voit le pari
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${BETS_URL}`);
	await alicePage.waitForLoadState('networkidle');
	await expect(
		alicePage.getByTestId('group-bet-item').filter({
			hasText: '[E2E] S062 Caché Carol'
		})
	).toHaveCount(1);
	await aliceCtx.close();

	// Carol (membre du groupe mais PAS dans bet_visibility) ne voit pas le pari
	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(`${BETS_URL}`);
	await carolPage.waitForLoadState('networkidle');
	const carolItems = carolPage.getByTestId('group-bet-item');
	const carolCount = await carolItems.count();
	for (let i = 0; i < carolCount; i++) {
		await expect(carolItems.nth(i).getByTestId('group-bet-title')).not.toHaveText(
			'[E2E] S062 Caché Carol'
		);
	}
	await carolCtx.close();
});

// ─── 9. Onglet « Paris » du groupe accessible depuis la home du groupe ─────────

test('Onglet « Paris » (tab-bets) redirige vers la liste filtrable', async ({ browser }) => {
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`${GROUP_URL}`);
	await alicePage.waitForLoadState('networkidle');

	// L'onglet « Paris » existe et pointe vers /bets
	const tabBets = alicePage.getByTestId('tab-bets');
	await expect(tabBets).toBeVisible();
	await Promise.all([
		alicePage.waitForURL(/\/bets/, { timeout: 10000 }),
		tabBets.click()
	]);
	await alicePage.waitForLoadState('networkidle');
	expect(alicePage.url()).toContain(`/bets`);
	await expect(alicePage.getByTestId('group-bets-title')).toHaveText('Paris');
	await expect(alicePage.getByTestId('group-bets-filters')).toBeVisible();

	await aliceCtx.close();
});

// ─── 10. Bouton « Mes paris » depuis la home app ──────────────────────────────

test('Bouton « Mes paris » depuis /app mène à la vue transverse', async ({ browser }) => {
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(`/app`);
	await alicePage.waitForLoadState('networkidle');

	const link = alicePage.getByTestId('my-bets-link');
	await expect(link).toBeVisible();
	await Promise.all([
		alicePage.waitForURL(/\/app\/my-bets/, { timeout: 10000 }),
		link.click()
	]);
	await alicePage.waitForLoadState('networkidle');
	expect(alicePage.url()).toContain(`/app/my-bets`);
	await expect(alicePage.getByTestId('my-bets-title')).toHaveText('Mes paris');
	await expect(alicePage.getByTestId('my-bets-filters')).toBeVisible();

	await aliceCtx.close();
});
