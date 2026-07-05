/**
 * S-060 — Fil d'activité du groupe
 *
 * Critères d'acceptation :
 * 1. Onglet « Activité » du groupe : liste paginée (20 par page) d'événements datés
 *    avec libellés français et liens profonds.
 * 2. Événements couverts : membre rejoint, pari créé, duel accepté, match résolu
 *    (avec gagnants), match annulé, gage confirmé.
 * 3. Bob ne voit pas les événements d'un pari dont il n'est pas dans la liste
 *    de visibilité.
 * 4. Performance : une requête par type UNION/ordonnée, pas de N+1.
 *
 * Scénarios E2E :
 * - Après un cycle complet (création → acceptation → verdict), le fil affiche
 *   les événements dans l'ordre.
 * - Dave ne voit pas les événements du pari caché.
 * - Pagination au-delà de 20 événements (helpers DB pour générer du volume).
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;
const ACTIVITY_URL = `${GROUP_URL}/activity`;

// User IDs from seed.sql
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const DAVE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

test.describe('S-060 — Fil d activité du groupe', () => {
	test.describe('Onglet Activité accessible', () => {
		test('affiche l onglet Activité dans les tabs du groupe', async ({ page }) => {
			await login(page, 'alice');
			await page.goto(GROUP_URL);

			await expect(page.getByTestId('tab-activity')).toBeVisible();
			await expect(page.getByTestId('tab-activity')).toHaveText('Activité');
		});

		test('navigation vers la page activité depuis les tabs', async ({ page }) => {
			await login(page, 'alice');
			await page.goto(GROUP_URL);

			await page.getByTestId('tab-activity').click();
			await expect(page).toHaveURL(ACTIVITY_URL);
			await expect(page.getByTestId('activity-title')).toBeVisible();
		});

		test('page activité affiche un état vide si aucun événement', async ({ page }) => {
			await login(page, 'alice');
			await page.goto(ACTIVITY_URL);

			await expect(page.getByTestId('empty-activity')).toBeVisible();
			await expect(page.getByTestId('empty-activity')).toContainText(
				'Aucun événement pour le moment'
			);
		});

		test('lien retour vers le groupe', async ({ page }) => {
			await login(page, 'alice');
			await page.goto(ACTIVITY_URL);

			await page.getByRole('link', { name: '← Les potes du test' }).click();
			await expect(page).toHaveURL(GROUP_URL);
		});

		test('accès sans session → redirection /login', async ({ page }) => {
			await page.goto(ACTIVITY_URL);
			await expect(page).toHaveURL(/\/login/);
		});

		test('Dave (non membre) → 404', async ({ page }) => {
			await login(page, 'dave');
			await page.goto(ACTIVITY_URL);

			await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
		});
	});

	test.describe('Événements visibles dans le fil', () => {
		test.beforeEach(async () => {
			// Nettoyer les données de test préexistantes
			await db`DELETE FROM public.jury_vote_winners WHERE vote_id IN (
				SELECT jv.id FROM public.jury_votes jv
				JOIN public.matches m ON m.id = jv.match_id
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.jury_votes WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.match_cancellations WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.match_winners WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.ledger_entries WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.forfeits WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.match_participants WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.match_jurors WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.matches WHERE bet_id IN (
				SELECT id FROM public.bets WHERE title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.bet_visibility WHERE bet_id IN (
				SELECT id FROM public.bets WHERE title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.bets WHERE title LIKE '[E2E]%'`;
		});

		test('affiche member_joined pour les membres du groupe', async ({ page }) => {
			await login(page, 'alice');
			await page.goto(ACTIVITY_URL);

			// Les 3 membres seedés devraient apparaître (Alice, Bob, Carol ont rejoint)
			const items = page.getByTestId('activity-item');
			await expect(items).toHaveCount(3);

			const labels = await page.getByTestId('activity-label').allTextContents();
			expect(labels).toEqual(
				expect.arrayContaining([
					expect.stringMatching(/Alice a rejoint le groupe/),
					expect.stringMatching(/Bob a rejoint le groupe/),
					expect.stringMatching(/Carol a rejoint le groupe/)
				])
			);
		});

		test('affiche bet_created après création d un pari', async ({ page }) => {
			// Créer un pari visible par Alice
			const [bet] = await db`
				INSERT INTO public.bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status, created_at)
				VALUES (${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', '[E2E] Test Closest', 'points', '10', false, 'majority', 'open', now())
				RETURNING id
			`;
			await db`
				INSERT INTO public.bet_visibility (bet_id, user_id)
				VALUES (${bet.id}, ${ALICE_ID}), (${bet.id}, ${BOB_ID})
			`;
			await db`
				INSERT INTO public.matches (bet_id, status)
				VALUES (${bet.id}, 'open')
			`;

			await login(page, 'alice');
			await page.goto(ACTIVITY_URL);

			await expect(
				page.getByTestId('activity-item', { hasText: '[E2E] Test Closest' }).first()
			).toBeVisible();
			const labels = await page.getByTestId('activity-label').allTextContents();
			expect(labels).toEqual(
				expect.arrayContaining([expect.stringContaining('a créé le pari « [E2E] Test Closest »')])
			);
		});

		test('affiche match_resolved après résolution d un pari', async ({ page }) => {
			// Créer un pari + match résolu avec gagnant Alice
			const [bet] = await db`
				INSERT INTO public.bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status, created_at)
				VALUES (${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', '[E2E] Résolu', 'points', '10', false, 'majority', 'closed', now() - interval '1 hour')
				RETURNING id
			`;
			await db`
				INSERT INTO public.bet_visibility (bet_id, user_id)
				VALUES (${bet.id}, ${ALICE_ID}), (${bet.id}, ${BOB_ID})
			`;
			const [match] = await db`
				INSERT INTO public.matches (bet_id, status, resolved_at)
				VALUES (${bet.id}, 'resolved', now())
				RETURNING id
			`;
			await db`
				INSERT INTO public.match_winners (match_id, user_id)
				VALUES (${match.id}, ${ALICE_ID})
			`;

			await login(page, 'alice');
			await page.goto(ACTIVITY_URL);

			await expect(
				page.getByTestId('activity-item', { hasText: '[E2E] Résolu' }).first()
			).toBeVisible();
			const labels = await page.getByTestId('activity-label').allTextContents();
			expect(labels).toEqual(
				expect.arrayContaining([expect.stringContaining('Alice a gagné le pari « [E2E] Résolu »')])
			);
		});

		test('affiche match_accepted pour un duel accepté', async ({ page }) => {
			// Créer un yesno duel bet + match avec participants (Bob a accepté le duel d Alice)
			const [bet] = await db`
				INSERT INTO public.bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status, created_at)
				VALUES (${SEEDED_GROUP_ID}, ${ALICE_ID}, 'yesno', '[E2E] Duel accepté', 'points', '10', false, 'majority', 'open', now() - interval '2 hours')
				RETURNING id
			`;
			await db`
				INSERT INTO public.yesno_bets (bet_id, choice_a, choice_b, creator_side, mode)
				VALUES (${bet.id}, 'Oui', 'Non', 'a', 'duel')
			`;
			await db`
				INSERT INTO public.bet_visibility (bet_id, user_id)
				VALUES (${bet.id}, ${ALICE_ID}), (${bet.id}, ${BOB_ID})
			`;
			const [match] = await db`
				INSERT INTO public.matches (bet_id, status, created_at)
				VALUES (${bet.id}, 'open', now())
				RETURNING id
			`;
			await db`
				INSERT INTO public.match_participants (match_id, user_id, side)
				VALUES (${match.id}, ${ALICE_ID}, 'a'), (${match.id}, ${BOB_ID}, 'b')
			`;

			await login(page, 'alice');
			await page.goto(ACTIVITY_URL);

			await expect(
				page.getByTestId('activity-item', { hasText: '[E2E] Duel accepté' }).first()
			).toBeVisible();
			const labels = await page.getByTestId('activity-label').allTextContents();
			expect(labels).toEqual(
				expect.arrayContaining([expect.stringContaining('Bob a accepté le duel de Alice')])
			);
		});

		test('affiche match_cancelled pour un match annulé', async ({ page }) => {
			const [bet] = await db`
				INSERT INTO public.bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status, created_at)
				VALUES (${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', '[E2E] Annulé', 'points', '10', false, 'majority', 'cancelled', now() - interval '3 hours')
				RETURNING id
			`;
			await db`
				INSERT INTO public.bet_visibility (bet_id, user_id)
				VALUES (${bet.id}, ${ALICE_ID}), (${bet.id}, ${BOB_ID})
			`;
			const [match] = await db`
				INSERT INTO public.matches (bet_id, status, created_at)
				VALUES (${bet.id}, 'cancelled', now() - interval '2 hours')
				RETURNING id
			`;
			await db`
				INSERT INTO public.match_cancellations (match_id, user_id, created_at)
				VALUES (${match.id}, ${ALICE_ID}, now() - interval '1 hour')
			`;

			await login(page, 'alice');
			await page.goto(ACTIVITY_URL);

			await expect(
				page.getByTestId('activity-item', { hasText: '[E2E] Annulé' }).first()
			).toBeVisible();
			const labels = await page.getByTestId('activity-label').allTextContents();
			expect(labels).toEqual(
				expect.arrayContaining([expect.stringContaining('Pari « [E2E] Annulé » annulé')])
			);
		});

		test('affiche forfeit_confirmed pour un gage accompli', async ({ page }) => {
			const [bet] = await db`
				INSERT INTO public.bets (group_id, creator_id, type, title, stake_type, forfeit_description, hide_answers, jury_mode, status, created_at)
				VALUES (${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', '[E2E] Gage', 'forfeit', 'Faire un gage', false, 'majority', 'closed', now() - interval '3 hours')
				RETURNING id
			`;
			await db`
				INSERT INTO public.bet_visibility (bet_id, user_id)
				VALUES (${bet.id}, ${ALICE_ID}), (${bet.id}, ${BOB_ID})
			`;
			const [match] = await db`
				INSERT INTO public.matches (bet_id, status, resolved_at)
				VALUES (${bet.id}, 'resolved', now() - interval '2 hours')
				RETURNING id
			`;
			await db`
				INSERT INTO public.match_winners (match_id, user_id)
				VALUES (${match.id}, ${BOB_ID})
			`;
			await db`
				INSERT INTO public.forfeits (match_id, debtor_id, status, claimed_at, confirmed_by)
				VALUES (${match.id}, ${ALICE_ID}, 'done', now() - interval '1 hour', ${BOB_ID})
			`;

			// Bob voit le gage (il est dans bet_visibility)
			await login(page, 'alice');
			await page.goto(ACTIVITY_URL);

			await expect(
				page.getByTestId('activity-label', { hasText: 'a accompli son gage' }).first()
			).toBeVisible();
			const labels = await page.getByTestId('activity-label').allTextContents();
			expect(labels).toEqual(
				expect.arrayContaining([expect.stringContaining('Alice a accompli son gage')])
			);
		});

		test('ordre antéchronologique des événements', async ({ page }) => {
			// Créer 3 paris à des dates différentes
			for (let i = 0; i < 3; i++) {
				const hoursAgo = (i + 1) * 10;
				const [bet] = await db`
					INSERT INTO public.bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status, created_at)
					VALUES (${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', '[E2E] Pari ' || ${String(i)}, 'points', '10', false, 'majority', 'open', now() - (${hoursAgo} * interval '1 hour'))
					RETURNING id
				`;
				await db`
					INSERT INTO public.bet_visibility (bet_id, user_id)
					VALUES (${bet.id}, ${ALICE_ID}), (${bet.id}, ${BOB_ID})
				`;
				await db`
					INSERT INTO public.matches (bet_id, status, created_at)
					VALUES (${bet.id}, 'open', now() - (${hoursAgo} * interval '1 hour'))
				`;
			}

			await login(page, 'alice');
			await page.goto(ACTIVITY_URL);

			// Attendre que les 3 paris soient rendus
			await expect(page.getByText('[E2E] Pari 0', { exact: false }).first()).toBeVisible();
			await expect(page.getByText('[E2E] Pari 1', { exact: false }).first()).toBeVisible();
			await expect(page.getByText('[E2E] Pari 2', { exact: false }).first()).toBeVisible();
			// Les événements bet_created doivent être dans l'ordre antéchronologique
			const labels = await page.getByTestId('activity-label').allTextContents();
			const betEvents = labels.filter((l) => l.includes('[E2E] Pari'));
			expect(betEvents.length).toBe(3);
			// Pari 0 (plus récent, 10h) devrait venir avant Pari 2 (plus ancien, 30h)
			expect(betEvents[0]).toContain('[E2E] Pari 0');
			expect(betEvents[1]).toContain('[E2E] Pari 1');
			expect(betEvents[2]).toContain('[E2E] Pari 2');
		});
	});

	test.describe('Visibilité des événements', () => {
		test.beforeEach(async () => {
			await db`DELETE FROM public.jury_vote_winners WHERE vote_id IN (
				SELECT jv.id FROM public.jury_votes jv
				JOIN public.matches m ON m.id = jv.match_id
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.jury_votes WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.match_cancellations WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.match_winners WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.ledger_entries WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.forfeits WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.match_participants WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.match_jurors WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.matches WHERE bet_id IN (
				SELECT id FROM public.bets WHERE title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.bet_visibility WHERE bet_id IN (
				SELECT id FROM public.bets WHERE title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.bets WHERE title LIKE '[E2E]%'`;
		});

		test('Bob voit les événements d un pari où il est dans la visibilité', async ({ page }) => {
			const [bet] = await db`
				INSERT INTO public.bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status, created_at)
				VALUES (${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', '[E2E] Visible par Bob', 'points', '10', false, 'majority', 'open', now())
				RETURNING id
			`;
			await db`
				INSERT INTO public.bet_visibility (bet_id, user_id)
				VALUES (${bet.id}, ${ALICE_ID}), (${bet.id}, ${BOB_ID})
			`;
			await db`
				INSERT INTO public.matches (bet_id, status)
				VALUES (${bet.id}, 'open')
			`;

			await login(page, 'bob');
			await page.goto(ACTIVITY_URL);

			// Attendre que le pari soit rendu (allTextContents ne retry pas)
			await expect(
				page.getByTestId('activity-item', { hasText: '[E2E] Visible par Bob' }).first()
			).toBeVisible();
			const labels = await page.getByTestId('activity-label').allTextContents();
			expect(labels).toEqual(
				expect.arrayContaining([
					expect.stringContaining('Alice a créé le pari « [E2E] Visible par Bob »')
				])
			);
		});

		test('Dave ne voit pas les événements d un pari caché', async ({ page }) => {
			// Pari visible seulement par Alice et Bob (pas Dave)
			const [bet] = await db`
				INSERT INTO public.bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status, created_at)
				VALUES (${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', '[E2E] Caché de Dave', 'points', '10', false, 'majority', 'open', now())
				RETURNING id
			`;
			await db`
				INSERT INTO public.bet_visibility (bet_id, user_id)
				VALUES (${bet.id}, ${ALICE_ID}), (${bet.id}, ${BOB_ID})
			`;
			await db`
				INSERT INTO public.matches (bet_id, status)
				VALUES (${bet.id}, 'open')
			`;

			await login(page, 'dave');
			await page.goto(ACTIVITY_URL);

			const labels = await page.getByTestId('activity-label').allTextContents();
			expect(labels).not.toEqual(
				expect.arrayContaining([
					expect.stringContaining('[E2E] Caché de Dave')
				])
			);
		});
	});

	test.describe('Pagination', () => {
		test.beforeEach(async () => {
			await db`DELETE FROM public.jury_vote_winners WHERE vote_id IN (
				SELECT jv.id FROM public.jury_votes jv
				JOIN public.matches m ON m.id = jv.match_id
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.jury_votes WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.match_cancellations WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.match_winners WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.ledger_entries WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.forfeits WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.match_participants WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.match_jurors WHERE match_id IN (
				SELECT m.id FROM public.matches m
				JOIN public.bets b ON b.id = m.bet_id
				WHERE b.title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.matches WHERE bet_id IN (
				SELECT id FROM public.bets WHERE title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.bet_visibility WHERE bet_id IN (
				SELECT id FROM public.bets WHERE title LIKE '[E2E]%'
			)`;
			await db`DELETE FROM public.bets WHERE title LIKE '[E2E]%'`;
		});

		test('affiche un bouton Voir plus quand il y a plus de 20 événements et charge la suite', async ({ page }) => {
			// Créer 25 paris visibles par Alice (donc 25 bet_created + 3 member_joined = 28 events)
			for (let i = 0; i < 25; i++) {
				const hoursAgo = (i + 1);
				const [bet] = await db`
					INSERT INTO public.bets (group_id, creator_id, type, title, stake_type, stake_amount, hide_answers, jury_mode, status, created_at)
					VALUES (${SEEDED_GROUP_ID}, ${ALICE_ID}, 'closest', '[E2E] Pagination ' || ${String(i)}, 'points', '10', false, 'majority', 'open', now() - (${hoursAgo} * interval '1 minute'))
					RETURNING id
				`;
				await db`
					INSERT INTO public.bet_visibility (bet_id, user_id)
					VALUES (${bet.id}, ${ALICE_ID})
				`;
				await db`
					INSERT INTO public.matches (bet_id, status, created_at)
					VALUES (${bet.id}, 'open', now() - (${hoursAgo} * interval '1 minute'))
				`;
			}

			await login(page, 'alice');
			await page.goto(ACTIVITY_URL);

			// Devrait avoir exactement 20 items visibles (3 member_joined + 17 bet_created sur la première page)
			// En fait: 3 member_joined (seed) + 25 bet_created = 28 total, limit=20
			const items = page.getByTestId('activity-item');
			// Les member_joined sont les plus anciens, donc les bet_created récents passent devant
			// 28 events, page 1 = 20
			await expect(items).toHaveCount(20);

			// Bouton Voir plus visible
			const loadMoreBtn = page.getByTestId('load-more-btn');
			await expect(loadMoreBtn).toBeVisible();
			await expect(loadMoreBtn).toHaveText('Voir plus');

			// Cliquer pour charger la suite
			await loadMoreBtn.click();

			// Maintenant on devrait voir 28 events
			await expect(items).toHaveCount(28);

			// Le bouton devrait avoir disparu
			await expect(loadMoreBtn).not.toBeVisible();
		});
	});
});