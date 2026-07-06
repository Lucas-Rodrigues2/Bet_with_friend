/**
 * S-061 — Leaderboard & stats
 *
 * Critères d'acceptation :
 * 1. Onglet « Classement » du groupe : tableau trié par gains nets (pseudo,
 *    gains nets, paris joués, gagnés, %, gages faits).
 * 2. Filtre de période fonctionne (tout temps + 30 derniers jours).
 * 3. Les membres soft-deleted ayant un historique apparaissent (grisés, "(parti)").
 * 4. Groupe sans pari résolu → état vide propre (empty-leaderboard).
 *
 * Scénarios E2E :
 * - Scénario déterministe : crée/résout des paris via helpers DB avec montants
 *   connus → vérifie ordre du classement + chiffres exacts (gains nets, joués,
 *   gagnés, % victoire, gages faits).
 * - Filtre 30 jours : une vieille écriture antidatée à >30 j est exclue des
 *   gains en mode 30d, incluse en "tout temps".
 * - Membre soft-deleted avec historique apparaît (grisé, "(parti)").
 * - Groupe sans pari résolu → empty-leaderboard.
 * - Visibilité bet_visibility : un membre non dans la liste ne voit pas les
 *   chiffres d'un pari (cohérent avec S-060).
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';

// User IDs from seed.sql
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const DAVE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── Helpers DB ──────────────────────────────────────────────────────────────

/**
 * Crée un groupe [E2E] avec une liste de membres. Alice est admin.
 * Retourne l'id du groupe.
 */
async function createGroup(name: string, memberIds: string[]): Promise<string> {
	const [group] = await db`
		INSERT INTO public.groups (name, description, currency, creator_id)
		VALUES (${name}, 'Groupe E2E S-061', 'PTS', ${ALICE_ID})
		RETURNING id
	`;
	for (const uid of memberIds) {
		const role = uid === ALICE_ID ? 'admin' : 'member';
		await db`
			INSERT INTO public.group_members (group_id, user_id, role)
			VALUES (${group.id}, ${uid}, ${role})
		`;
	}
	return String(group.id);
}

interface Participant {
	userId: string;
	stake?: number;
	side?: 'a' | 'b';
	answer?: string;
}

interface LedgerEntry {
	debtor: string;
	creditor: string;
	amount: number;
}

/**
 * Crée un pari (points) résolu : bet + visibility + match résolu + participants
 * + winners + ledger entries. Tous les timestamps par défaut à now().
 */
async function createResolvedPointsMatch(opts: {
	groupId: string;
	title: string;
	type: 'closest' | 'yesno';
	participants: Participant[];
	winners: { userId: string; share?: number }[];
	ledger: LedgerEntry[];
	visibility?: string[]; // defaults to all participants + ALICE
	resolvedAt?: Date;
	ledgerCreatedAt?: Date; // antidatation des écritures ledger
}): Promise<{ betId: string; matchId: string }> {
	const {
		groupId,
		title,
		type,
		participants,
		winners,
		ledger,
		visibility,
		resolvedAt,
		ledgerCreatedAt
	} = opts;

	const [bet] = await db`
		INSERT INTO public.bets (
			group_id, creator_id, type, title, stake_type, stake_amount,
			hide_answers, jury_mode, status
		) VALUES (
			${groupId}, ${ALICE_ID}, ${type}, ${title}, 'points', '10',
			false, 'majority', 'open'
		)
		RETURNING id
	`;

	const visibilityIds = visibility ?? [
		...new Set([ALICE_ID, ...participants.map((p) => p.userId)])
	];
	await db`
		INSERT INTO public.bet_visibility (bet_id, user_id)
		SELECT ${bet.id}, unnest(${db.array(visibilityIds)}::uuid[])
	`;

	const resolvedAtValue = resolvedAt ?? new Date();
	const [match] = await db`
		INSERT INTO public.matches (bet_id, status, resolved_at, created_at)
		VALUES (${bet.id}, 'resolved', ${resolvedAtValue}, ${resolvedAtValue})
		RETURNING id
	`;

	for (const p of participants) {
		if (type === 'yesno') {
			await db`
				INSERT INTO public.match_participants (match_id, user_id, side, stake)
				VALUES (${match.id}, ${p.userId}, ${p.side ?? 'a'}, ${p.stake ?? 10})
			`;
		} else {
			await db`
				INSERT INTO public.match_participants (match_id, user_id, answer, stake)
				VALUES (${match.id}, ${p.userId}, ${p.answer ?? '42'}, ${p.stake ?? 10})
			`;
		}
	}

	for (const w of winners) {
		await db`
			INSERT INTO public.match_winners (match_id, user_id, share)
			VALUES (${match.id}, ${w.userId}, ${w.share ?? null})
		`;
	}

	for (const e of ledger) {
		const createdAt = ledgerCreatedAt ?? new Date();
		await db`
			INSERT INTO public.ledger_entries (
				group_id, match_id, debtor_id, creditor_id, amount, created_at
			) VALUES (
				${groupId}, ${match.id}, ${e.debtor}, ${e.creditor}, ${e.amount}, ${createdAt}
			)
		`;
	}

	return { betId: String(bet.id), matchId: String(match.id) };
}

/**
 * Crée un pari à gage (forfeit) résolu, avec un forfeit done+confirmed.
 */
async function createResolvedForfeitMatch(opts: {
	groupId: string;
	title: string;
	type: 'closest' | 'yesno';
	participants: Participant[];
	winners: string[];
	forfeitDebtor: string;
	confirmedBy?: string;
	visibility?: string[];
	resolvedAt?: Date;
}): Promise<{ betId: string; matchId: string }> {
	const { groupId, title, type, participants, winners, forfeitDebtor, confirmedBy, visibility, resolvedAt } = opts;

	const [bet] = await db`
		INSERT INTO public.bets (
			group_id, creator_id, type, title, stake_type, forfeit_description,
			forfeit_scope, hide_answers, jury_mode, status
		) VALUES (
			${groupId}, ${ALICE_ID}, ${type}, ${title}, 'forfeit', 'Faire la vaisselle',
			'all_losers', false, 'majority', 'open'
		)
		RETURNING id
	`;

	const visibilityIds = visibility ?? [
		...new Set([ALICE_ID, ...participants.map((p) => p.userId)])
	];
	await db`
		INSERT INTO public.bet_visibility (bet_id, user_id)
		SELECT ${bet.id}, unnest(${db.array(visibilityIds)}::uuid[])
	`;

	const resolvedAtValue = resolvedAt ?? new Date();
	const [match] = await db`
		INSERT INTO public.matches (bet_id, status, resolved_at, created_at)
		VALUES (${bet.id}, 'resolved', ${resolvedAtValue}, ${resolvedAtValue})
		RETURNING id
	`;

	for (const p of participants) {
		if (type === 'yesno') {
			await db`
				INSERT INTO public.match_participants (match_id, user_id, side)
				VALUES (${match.id}, ${p.userId}, ${p.side ?? 'a'})
			`;
		} else {
			await db`
				INSERT INTO public.match_participants (match_id, user_id, answer)
				VALUES (${match.id}, ${p.userId}, ${p.answer ?? '42'})
			`;
		}
	}

	for (const w of winners) {
		await db`
			INSERT INTO public.match_winners (match_id, user_id, share)
			VALUES (${match.id}, ${w}, null)
		`;
	}

	await db`
		INSERT INTO public.forfeits (match_id, debtor_id, status, confirmed_by, claimed_at, created_at)
		VALUES (
			${match.id}, ${forfeitDebtor}, 'done',
			${confirmedBy ?? ALICE_ID}, ${resolvedAtValue}, ${resolvedAtValue}
		)
	`;

	return { betId: String(bet.id), matchId: String(match.id) };
}

/**
 * Nettoie toutes les données [E2E] S-061 (bets, groups cascades).
 */
async function cleanup() {
	// Supprimer les ledger_entries liées aux paris E2E S-061 avant les bets
	// (FK match_id ON DELETE SET NULL → ouphans sinon).
	await db`
		DELETE FROM public.ledger_entries
		WHERE match_id IN (
			SELECT m.id FROM public.matches m
			JOIN public.bets b ON b.id = m.bet_id
			WHERE b.title LIKE '[E2E] S061%'
		)
	`;
	await db`DELETE FROM public.bets WHERE title LIKE '[E2E] S061%'`;
	await db`DELETE FROM public.groups WHERE name LIKE '[E2E] S061%'`;
}

// ─── Scénario 1 : Classement déterministe (tout temps) ─────────────────────

test.describe('S-061 — Leaderboard & stats', () => {
	test.afterEach(async () => {
		await cleanup();
	});

	test('Scénario déterministe : ordre + chiffres exacts (gains nets, joués, gagnés, %, gages)', async ({
		page
	}) => {
		// ── Mise en place (cas calculé à la main) ───────────────────────────────
		// Groupe PTS avec Alice (admin), Bob, Carol (active sans historique), Dave.
		const groupId = await createGroup('[E2E] S061 Deterministic', [
			ALICE_ID,
			BOB_ID,
			CAROL_ID,
			DAVE_ID
		]);

		// Match 1 — yesno points 10 vs 5, Alice gagne → Bob doit 5 à Alice.
		await createResolvedPointsMatch({
			groupId,
			title: '[E2E] S061 M1 yesno points',
			type: 'yesno',
			participants: [
				{ userId: ALICE_ID, side: 'a', stake: 10 },
				{ userId: BOB_ID, side: 'b', stake: 5 }
			],
			winners: [{ userId: ALICE_ID, share: 5 }],
			ledger: [{ debtor: BOB_ID, creditor: ALICE_ID, amount: 5 }]
		});

		// Match 2 — closest points 3 joueurs (Alice, Bob, Dave) mise 10,
		// Alice + Bob gagnent → Dave doit 5 à Alice et 5 à Bob.
		await createResolvedPointsMatch({
			groupId,
			title: '[E2E] S061 M2 closest points',
			type: 'closest',
			participants: [
				{ userId: ALICE_ID, stake: 10, answer: '42' },
				{ userId: BOB_ID, stake: 10, answer: '100' },
				{ userId: DAVE_ID, stake: 10, answer: '75' }
			],
			winners: [
				{ userId: ALICE_ID, share: 5 },
				{ userId: BOB_ID, share: 5 }
			],
			ledger: [
				{ debtor: DAVE_ID, creditor: ALICE_ID, amount: 5 },
				{ debtor: DAVE_ID, creditor: BOB_ID, amount: 5 }
			]
		});

		// Match 3 — yesno à gage, Alice gagne → Bob doit un gage (fait/confirmé).
		await createResolvedForfeitMatch({
			groupId,
			title: '[E2E] S061 M3 yesno forfeit',
			type: 'yesno',
			participants: [
				{ userId: ALICE_ID, side: 'a' },
				{ userId: BOB_ID, side: 'b' }
			],
			winners: [ALICE_ID],
			forfeitDebtor: BOB_ID,
			confirmedBy: ALICE_ID
		});

		// ── Calculs attendus (tout temps) ───────────────────────────────────────
		// Alice : net = +5 (M1) + 5 (M2) = +10 ; joués=3 ; gagnés=3 ; %=100% ; gages=0
		// Bob   : net = -5 (M1) + 5 (M2) = 0   ; joués=3 ; gagnés=1 ; %=33%  ; gages=1
		// Carol : net = 0                       ; joués=0 ; gagnés=0 ; %=—   ; gages=0
		// Dave  : net = -5 -5 = -10            ; joués=1 ; gagnés=0 ; %=0%  ; gages=0
		// Ordre (net DESC, won DESC, played DESC, pseudo ASC) :
		//   Alice (+10), Bob (0, won=1), Carol (0, won=0), Dave (-10)

		// ── Navigation ──────────────────────────────────────────────────────────
		await login(page, 'alice');
		const groupUrl = `/app/groups/${groupId}`;
		await page.goto(groupUrl);
		await expect(page.getByTestId('tab-leaderboard')).toBeVisible();
		await page.getByTestId('tab-leaderboard').click();
		await page.waitForURL(new RegExp(`${groupUrl}/leaderboard`));
		await expect(page.getByTestId('leaderboard-title')).toHaveText('Classement');
		await expect(page.getByTestId('leaderboard-table')).toBeVisible();

		// ── Vérifications du tableau ────────────────────────────────────────────
		const rows = page.getByTestId('leaderboard-row');
		await expect(rows).toHaveCount(4);

		// Rang 1 — Alice
		const r0 = rows.nth(0);
		await expect(r0.getByTestId('leaderboard-rank')).toHaveText('1');
		await expect(r0.getByTestId('leaderboard-pseudo')).toContainText('Alice');
		await expect(r0.getByTestId('leaderboard-net')).toHaveText('+10.00 PTS');
		await expect(r0.getByTestId('leaderboard-played')).toHaveText('3');
		await expect(r0.getByTestId('leaderboard-won')).toHaveText('3');
		await expect(r0.getByTestId('leaderboard-winrate')).toHaveText('100%');
		await expect(r0.getByTestId('leaderboard-forfeits')).toHaveText('0');

		// Rang 2 — Bob
		const r1 = rows.nth(1);
		await expect(r1.getByTestId('leaderboard-rank')).toHaveText('2');
		await expect(r1.getByTestId('leaderboard-pseudo')).toContainText('Bob');
		await expect(r1.getByTestId('leaderboard-net')).toHaveText('+0.00 PTS');
		await expect(r1.getByTestId('leaderboard-played')).toHaveText('3');
		await expect(r1.getByTestId('leaderboard-won')).toHaveText('1');
		await expect(r1.getByTestId('leaderboard-winrate')).toHaveText('33%');
		await expect(r1.getByTestId('leaderboard-forfeits')).toHaveText('1');

		// Rang 3 — Carol (active sans historique, 0 partout)
		const r2 = rows.nth(2);
		await expect(r2.getByTestId('leaderboard-pseudo')).toContainText('Carol');
		await expect(r2.getByTestId('leaderboard-net')).toHaveText('+0.00 PTS');
		await expect(r2.getByTestId('leaderboard-played')).toHaveText('0');
		await expect(r2.getByTestId('leaderboard-won')).toHaveText('0');
		await expect(r2.getByTestId('leaderboard-winrate')).toHaveText('—');
		await expect(r2.getByTestId('leaderboard-forfeits')).toHaveText('0');

		// Rang 4 — Dave (perdant net -10)
		const r3 = rows.nth(3);
		await expect(r3.getByTestId('leaderboard-pseudo')).toContainText('Dave');
		await expect(r3.getByTestId('leaderboard-net')).toHaveText('-10.00 PTS');
		await expect(r3.getByTestId('leaderboard-played')).toHaveText('1');
		await expect(r3.getByTestId('leaderboard-won')).toHaveText('0');
		await expect(r3.getByTestId('leaderboard-winrate')).toHaveText('0%');
		await expect(r3.getByTestId('leaderboard-forfeits')).toHaveText('0');

		// Ordre des pseudos dans l'ordre attendu
		await expect(rows.locator('[data-testid="leaderboard-pseudo"]')).toHaveText([
			'Alice',
			'Bob',
			'Carol',
			'Dave'
		]);

		// Le titre du bouton période indique "30 derniers jours" (mode courant = all)
		await expect(page.getByTestId('period-toggle')).toHaveText('30 derniers jours');
	});

	// ─── Scénario 2 : Filtre 30 jours exclut une vieille écriture ─────────────

	test('Filtre 30 jours : vieille écriture antidatée exclue en 30d, incluse en tout temps', async ({
		page
	}) => {
		const groupId = await createGroup('[E2E] S061 Filter', [ALICE_ID, BOB_ID]);

		// Match récent : Bob doit 5 à Alice (now).
		await createResolvedPointsMatch({
			groupId,
			title: '[E2E] S061 Filter M recent',
			type: 'yesno',
			participants: [
				{ userId: ALICE_ID, side: 'a', stake: 10 },
				{ userId: BOB_ID, side: 'b', stake: 5 }
			],
			winners: [{ userId: ALICE_ID, share: 5 }],
			ledger: [{ debtor: BOB_ID, creditor: ALICE_ID, amount: 5 }]
		});

		// Match antidaté à 40 jours : Bob doit 20 à Alice (résolu il y a 40j,
		// écriture ledger créée il y a 40j).
		const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
		await createResolvedPointsMatch({
			groupId,
			title: '[E2E] S061 Filter M old',
			type: 'yesno',
			participants: [
				{ userId: ALICE_ID, side: 'a', stake: 20 },
				{ userId: BOB_ID, side: 'b', stake: 20 }
			],
			winners: [{ userId: ALICE_ID, share: 20 }],
			ledger: [{ debtor: BOB_ID, creditor: ALICE_ID, amount: 20 }],
			resolvedAt: oldDate,
			ledgerCreatedAt: oldDate
		});

		// ── Période "tout temps" ────────────────────────────────────────────────
		// Alice net = +5 + 20 = +25 ; Bob net = -25.
		await login(page, 'alice');
		const leaderboardUrl = `/app/groups/${groupId}/leaderboard`;
		await page.goto(`${leaderboardUrl}?period=all`);
		await expect(page.getByTestId('leaderboard-table')).toBeVisible();

		const rowsAll = page.getByTestId('leaderboard-row');
		await expect(rowsAll).toHaveCount(2);
		await expect(rowsAll.nth(0).getByTestId('leaderboard-pseudo')).toContainText('Alice');
		await expect(rowsAll.nth(0).getByTestId('leaderboard-net')).toHaveText('+25.00 PTS');
		await expect(rowsAll.nth(1).getByTestId('leaderboard-pseudo')).toContainText('Bob');
		await expect(rowsAll.nth(1).getByTestId('leaderboard-net')).toHaveText('-25.00 PTS');

		// ── Période 30 jours ────────────────────────────────────────────────────
		// La vieille écriture (20) est exclue des gains : Alice +5, Bob -5.
		// Le match old est aussi exclu de joués/gagnés (resolved_at > 30j).
		await page.goto(`${leaderboardUrl}?period=30d`);
		await expect(page.getByTestId('leaderboard-table')).toBeVisible();
		await expect(page.getByTestId('period-toggle')).toHaveText('Tout temps');

		const rows30 = page.getByTestId('leaderboard-row');
		await expect(rows30).toHaveCount(2);
		await expect(rows30.nth(0).getByTestId('leaderboard-pseudo')).toContainText('Alice');
		await expect(rows30.nth(0).getByTestId('leaderboard-net')).toHaveText('+5.00 PTS');
		await expect(rows30.nth(0).getByTestId('leaderboard-played')).toHaveText('1');
		await expect(rows30.nth(0).getByTestId('leaderboard-won')).toHaveText('1');
		await expect(rows30.nth(1).getByTestId('leaderboard-pseudo')).toContainText('Bob');
		await expect(rows30.nth(1).getByTestId('leaderboard-net')).toHaveText('-5.00 PTS');
		await expect(rows30.nth(1).getByTestId('leaderboard-played')).toHaveText('1');
		await expect(rows30.nth(1).getByTestId('leaderboard-won')).toHaveText('0');

		// ── Toggle via le bouton ─────────────────────────────────────────────────
		// On est en 30d, le bouton affiche "Tout temps" et ramène en mode all.
		await page.getByTestId('period-toggle').click();
		await page.waitForURL(/\?period=all$/);
		await expect(page.getByTestId('leaderboard-table')).toBeVisible();
		await expect(page.getByTestId('period-toggle')).toHaveText('30 derniers jours');
		await expect(page.getByTestId('leaderboard-row').nth(0).getByTestId('leaderboard-net')).toHaveText(
			'+25.00 PTS'
		);
	});

	// ─── Scénario 3 : Membre soft-deleted avec historique ────────────────────

	test('Membre soft-deleted avec historique apparaît grisé avec "(parti)"', async ({
		page
	}) => {
		// Dave a un historique (un pari résolu où il doit 10 à Alice), puis est
		// soft-deleted du groupe. Il doit rester visible dans le classement.
		const groupId = await createGroup('[E2E] S061 SoftDelete', [ALICE_ID, BOB_ID, DAVE_ID]);

		await createResolvedPointsMatch({
			groupId,
			title: '[E2E] S061 SoftDelete M1',
			type: 'yesno',
			participants: [
				{ userId: ALICE_ID, side: 'a', stake: 10 },
				{ userId: DAVE_ID, side: 'b', stake: 10 }
			],
			winners: [{ userId: ALICE_ID, share: 10 }],
			ledger: [{ debtor: DAVE_ID, creditor: ALICE_ID, amount: 10 }]
		});

		// Soft-delete Dave
		await db`UPDATE public.group_members SET removed_at = NOW()
			WHERE group_id = ${groupId} AND user_id = ${DAVE_ID}`;

		await login(page, 'alice');
		await page.goto(`/app/groups/${groupId}/leaderboard`);
		await expect(page.getByTestId('leaderboard-table')).toBeVisible();

		const rows = page.getByTestId('leaderboard-row');
		await expect(rows).toHaveCount(3); // Alice, Bob (0), Dave (parti)

		// Dave est bien présent, marqué "(parti)", avec son historique (-10).
		const daveRow = rows.filter({ hasText: 'Dave' });
		await expect(daveRow).toHaveCount(1);
		await expect(daveRow.getByTestId('leaderboard-pseudo')).toContainText('(parti)');
		await expect(daveRow.getByTestId('leaderboard-net')).toHaveText('-10.00 PTS');

		// La ligne est grisée (opacity-50)
		await expect(daveRow).toHaveClass(/opacity-50/);

		// Alice reste active (non grisée) et en tête.
		const aliceRow = rows.filter({ hasText: 'Alice' });
		await expect(aliceRow).toHaveCount(1);
		await expect(aliceRow).not.toHaveClass(/opacity-50/);
		await expect(aliceRow.getByTestId('leaderboard-net')).toHaveText('+10.00 PTS');
	});

	// ─── Scénario 4 : Groupe sans pari résolu → état vide ─────────────────────

	test('Groupe sans pari résolu → état vide propre (empty-leaderboard)', async ({ page }) => {
		const groupId = await createGroup('[E2E] S061 Empty', [ALICE_ID, BOB_ID]);

		// Un pari en cours (non résolu) ne doit pas compter.
		const [bet] = await db`
			INSERT INTO public.bets (
				group_id, creator_id, type, title, stake_type, stake_amount,
				hide_answers, jury_mode, status
			) VALUES (
				${groupId}, ${ALICE_ID}, 'closest', '[E2E] S061 Empty open',
				'points', '10', false, 'majority', 'open'
			)
			RETURNING id
		`;
		await db`
			INSERT INTO public.bet_visibility (bet_id, user_id)
			SELECT ${bet.id}, unnest(${db.array([ALICE_ID, BOB_ID])}::uuid[])
		`;
		await db`INSERT INTO public.matches (bet_id, status) VALUES (${bet.id}, 'open')`;

		await login(page, 'alice');
		await page.goto(`/app/groups/${groupId}/leaderboard`);
		await expect(page.getByTestId('empty-leaderboard')).toBeVisible();
		await expect(page.getByTestId('leaderboard-table')).toHaveCount(0);
		await expect(page.getByText('Aucun pari résolu')).toBeVisible();

		// L'onglet Classement reste accessible depuis la page groupe.
		await page.goto(`/app/groups/${groupId}`);
		await expect(page.getByTestId('tab-leaderboard')).toBeVisible();
	});

	// ─── Scénario 5 : Visibilité bet_visibility ──────────────────────────────

	test('Visibilité : un pari non visible par le viewer ne contribue pas à son classement', async ({
		browser
	}) => {
		// Pari entre Bob et Dave, visibility = {Bob, Dave} (Alice non incluse).
		// Alice ne doit pas voir les chiffres de ce pari dans son classement ;
		// Bob, qui est dans la visibility, les voit.
		const groupId = await createGroup('[E2E] S061 Visibility', [ALICE_ID, BOB_ID, DAVE_ID]);

		await createResolvedPointsMatch({
			groupId,
			title: '[E2E] S061 Visibility M1',
			type: 'yesno',
			participants: [
				{ userId: BOB_ID, side: 'a', stake: 10 },
				{ userId: DAVE_ID, side: 'b', stake: 10 }
			],
			winners: [{ userId: BOB_ID, share: 10 }],
			ledger: [{ debtor: DAVE_ID, creditor: BOB_ID, amount: 10 }],
			visibility: [BOB_ID, DAVE_ID] // Alice exclue volontairement
		});

		// ── Vue d'Alice : le pari n'est pas dans sa visibility → 0 partout ─────────
		const aliceCtx = await browser.newContext();
		const alicePage = await aliceCtx.newPage();
		await login(alicePage, 'alice');
		await alicePage.goto(`/app/groups/${groupId}/leaderboard`);

		// hasResolvedMatches est basé sur les paris visibles par Alice → false
		// (le seul pari résolu ne lui est pas visible) → empty-leaderboard.
		await expect(alicePage.getByTestId('empty-leaderboard')).toBeVisible();
		await expect(alicePage.getByTestId('leaderboard-table')).toHaveCount(0);
		await aliceCtx.close();

		// ── Vue de Bob : le pari est visible → Bob +10, Dave -10 ──────────────────
		const bobCtx = await browser.newContext();
		const bobPage = await bobCtx.newPage();
		await login(bobPage, 'bob');
		await bobPage.goto(`/app/groups/${groupId}/leaderboard`);
		await expect(bobPage.getByTestId('leaderboard-table')).toBeVisible();

		const bobRows = bobPage.getByTestId('leaderboard-row');
		await expect(bobRows).toHaveCount(3); // Bob, Dave, Alice (0)
		// Bob en tête avec +10
		await expect(bobRows.nth(0).getByTestId('leaderboard-pseudo')).toContainText('Bob');
		await expect(bobRows.nth(0).getByTestId('leaderboard-net')).toHaveText('+10.00 PTS');
		await expect(bobRows.nth(0).getByTestId('leaderboard-played')).toHaveText('1');
		await expect(bobRows.nth(0).getByTestId('leaderboard-won')).toHaveText('1');
		// Dave perdant -10
		const daveRow = bobRows.filter({ hasText: 'Dave' });
		await expect(daveRow.getByTestId('leaderboard-net')).toHaveText('-10.00 PTS');
		await bobCtx.close();
	});
});
