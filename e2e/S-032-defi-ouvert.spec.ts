/**
 * S-032 — Défi ouvert (multi-adversaires, termes fixes)
 *
 * Critères d'acceptation :
 * 1. Le formulaire yesno propose le mode « Défi ouvert » (toggle duel/open).
 * 2. En mode open : champs visibilité (checkboxes membres hors créateur) + max_opponents.
 * 3. Bob et Carol (membres visibles) voient le défi avec bouton "Accepter le défi".
 * 4. Accepter → match 1v1 créé, accepted_count incrémenté ; si complet, plus personne n'accepte.
 * 5. La page liste les duels créés avec leur statut.
 *
 * Scénarios E2E :
 * - Alice lance un défi ouvert max 2, visible par Bob+Carol → Bob et Carol acceptent → 2 matchs.
 * - Dave (hors groupe) → 404 (jamais dans la visibilité).
 * - Créateur ne peut pas accepter son propre défi.
 * - Membre hors visibilité → 404 (Carol hors visibilité sur défi max 1 Bob uniquement).
 * - Refus de Bob n'empêche pas Carol d'accepter (bouton Refuser non présent en mode open,
 *   mais absence de Bob ne bloque pas Carol).
 * - Défi complet → badge "Complet", plus de bouton Accepter.
 * - Non-régression mode duel : le toggle duel s'affiche et fonctionne.
 * - DB : bets, yesno_bets(mode=open), bet_visibility, bet_jurors, matches créés correctement.
 */
import { test, expect, type Page } from '@playwright/test';
import postgres from 'postgres';
import { login } from './helpers/auth';

const DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const dbOwn = postgres(DATABASE_URL, { max: 3 });

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;
const NEW_YESNO_URL = `${GROUP_URL}/bets/new/yesno`;

// UUIDs from seed.sql
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

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
 * Crée un défi ouvert via le formulaire.
 * Retourne l'URL de la page du défi et le betId.
 */
async function createOpenChallenge(
	page: Page,
	opts: {
		title: string;
		choiceA?: string;
		choiceB?: string;
		visibilityIds?: string[]; // which members to check (default: bob + carol)
		maxOpponents?: number;
		stakeCreator?: string;
		stakeOpponent?: string;
		juryId?: string;
	}
): Promise<{ betUrl: string; betId: string }> {
	await page.goto(NEW_YESNO_URL);
	// Attendre que la page soit hydratée avant d'interagir avec le toggle
	await page.waitForLoadState('networkidle');

	// Switch to open mode
	await page.getByTestId('mode-open').click();
	// Attendre que Svelte 5 ait re-rendu en mode open (section visibility doit apparaître)
	await expect(page.getByTestId('visibility-section')).toBeVisible({ timeout: 5000 });

	// Title
	await svelteFill(page, 'input-title', opts.title);

	// Choices
	await page.getByTestId('input-choice-a').fill(opts.choiceA ?? 'Oui');
	await page.getByTestId('input-choice-b').fill(opts.choiceB ?? 'Non');

	// Visibility checkboxes
	const visibilityIds = opts.visibilityIds ?? [BOB_ID, CAROL_ID];
	for (const userId of visibilityIds) {
		await page
			.getByTestId(`visibility-member-${userId}`)
			.getByRole('checkbox')
			.check();
	}

	// Max opponents
	await page.getByTestId('input-max-opponents').fill(String(opts.maxOpponents ?? 2));

	// Stakes
	await page.getByTestId('input-stake-creator').fill(opts.stakeCreator ?? '10');
	await page.getByTestId('input-stake-opponent').fill(opts.stakeOpponent ?? '5');

	// Jury
	const juryId = opts.juryId ?? CAROL_ID;
	await page.getByTestId(`jury-member-${juryId}`).getByRole('checkbox').check();

	// Submit
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
		// Ignore cleanup errors
	}
});

test.afterAll(async () => {
	await dbOwn.end();
});

// ─── Formulaire — toggle mode ─────────────────────────────────────────────────

test('formulaire yesno affiche le toggle mode duel/open', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	// Le titre de la page a changé pour refléter les deux modes
	await expect(page.getByRole('heading', { name: 'Nouveau pari Oui / Non' })).toBeVisible();

	// Toggle visible
	await expect(page.getByTestId('mode-toggle')).toBeVisible();
	await expect(page.getByTestId('mode-duel')).toBeVisible();
	await expect(page.getByTestId('mode-open')).toBeVisible();

	// Par défaut, mode duel
	// En mode duel : la section cible est visible
	await expect(page.getByTestId('select-target')).toBeVisible();
	// En mode duel : la section visibilité est absente
	await expect(page.getByTestId('visibility-section')).not.toBeVisible();
});

test('toggle vers mode Défi ouvert affiche les champs spécifiques (visibilité, max adversaires)', async ({
	page
}) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);
	// Attendre hydratation complète avant de cliquer
	await page.waitForLoadState('networkidle');

	// Passer en mode open
	await page.getByTestId('mode-open').click();

	// Section visibilité apparaît (attendre que Svelte 5 re-rende)
	await expect(page.getByTestId('visibility-section')).toBeVisible({ timeout: 5000 });

	// Membres : Bob et Carol listés (pas Alice — elle est créatrice)
	await expect(
		page.getByTestId(`visibility-member-${BOB_ID}`)
	).toBeVisible();
	await expect(
		page.getByTestId(`visibility-member-${CAROL_ID}`)
	).toBeVisible();

	// Champ max adversaires visible
	await expect(page.getByTestId('input-max-opponents')).toBeVisible();

	// La cible (mode duel) disparaît
	await expect(page.getByTestId('select-target')).not.toBeVisible();

	// Le bouton soumettre change de texte
	await expect(page.getByTestId('submit-btn')).toHaveText('Lancer le défi ouvert');
});

test('bouton soumettre en mode duel affiche "Proposer le duel"', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	// Mode duel par défaut
	await expect(page.getByTestId('submit-btn')).toHaveText('Proposer le duel');
});

// ─── Création du défi ouvert ──────────────────────────────────────────────────

test('Alice crée un défi ouvert max 2 visible Bob+Carol → redirection page défi', async ({
	page
}) => {
	await login(page, 'alice');

	const { betUrl } = await createOpenChallenge(page, {
		title: '[E2E] Défi ouvert max 2'
	});

	// Redirigé vers la page du pari
	expect(betUrl).toMatch(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	// Badge "Défi ouvert"
	await expect(page.getByTestId('bet-type-badge')).toHaveText('Défi ouvert');

	// Status badge "Ouvert"
	await expect(page.getByTestId('bet-status-badge')).toContainText('Ouvert');

	// Titre
	await expect(page.getByTestId('bet-title')).toHaveText('[E2E] Défi ouvert max 2');
});

test('page défi ouvert affiche mises fixes, jury, progression, visibilité', async ({ page }) => {
	await login(page, 'alice');

	await createOpenChallenge(page, {
		title: '[E2E] Défi ouvert détail',
		stakeCreator: '10',
		stakeOpponent: '5',
		maxOpponents: 2
	});

	// Camps
	await expect(page.getByTestId('camp-a-choice')).toHaveText('Oui');
	await expect(page.getByTestId('camp-b-choice')).toHaveText('Non');
	await expect(page.getByTestId('camp-a-player')).toContainText('Alice');

	// Mises fixes
	await expect(page.getByTestId('open-stakes')).toBeVisible();
	await expect(page.getByTestId('open-stake-creator')).toContainText('10.00');
	await expect(page.getByTestId('open-stake-opponent')).toContainText('5.00');

	// Jury
	await expect(page.getByTestId('open-jury')).toBeVisible();
	await expect(page.getByTestId('open-jury')).toContainText('Carol');

	// Progression 0/2
	await expect(page.getByTestId('open-challenge-progress')).toBeVisible();
	await expect(page.getByTestId('open-challenge-progress')).toContainText('0 / 2');

	// Créateur ne voit pas le bouton Accepter
	await expect(page.getByTestId('creator-cannot-accept-msg')).toBeVisible();
	await expect(page.getByTestId('accept-open-btn')).not.toBeVisible();

	// Visibilité figée : Alice, Bob, Carol
	await expect(page.getByTestId('bet-visibility')).toBeVisible();
	const visMembers = page.getByTestId('visibility-member');
	await expect(visMembers).toHaveCount(3);
	await expect(page.getByTestId('bet-visibility')).toContainText(
		'La liste de visibilité est figée à la création et ne peut pas être modifiée.'
	);
});

// ─── Données en DB ────────────────────────────────────────────────────────────

test('création défi ouvert → lignes DB : bets, yesno_bets(mode=open), bet_visibility, bet_jurors', async ({
	page
}) => {
	await login(page, 'alice');

	const { betId } = await createOpenChallenge(page, {
		title: '[E2E] Défi ouvert DB check'
	});

	// bets table
	const bets = await dbOwn`SELECT type, status FROM public.bets WHERE id = ${betId}`;
	expect(bets).toHaveLength(1);
	expect(bets[0].type).toBe('yesno');
	expect(bets[0].status).toBe('open');

	// yesno_bets: mode = open
	const yesnoBets =
		await dbOwn`SELECT mode, max_opponents, accepted_count FROM public.yesno_bets WHERE bet_id = ${betId}`;
	expect(yesnoBets).toHaveLength(1);
	expect(yesnoBets[0].mode).toBe('open');
	expect(parseInt(yesnoBets[0].max_opponents)).toBe(2);
	expect(parseInt(yesnoBets[0].accepted_count)).toBe(0);

	// bet_visibility: Alice + Bob + Carol = 3
	const visibility =
		await dbOwn`SELECT user_id FROM public.bet_visibility WHERE bet_id = ${betId} ORDER BY user_id`;
	expect(visibility).toHaveLength(3);
	const visIds = visibility.map((v: { user_id: string }) => v.user_id).sort();
	expect(visIds).toContain(ALICE_ID);
	expect(visIds).toContain(BOB_ID);
	expect(visIds).toContain(CAROL_ID);

	// bet_jurors: Carol
	const jurors =
		await dbOwn`SELECT user_id FROM public.bet_jurors WHERE bet_id = ${betId}`;
	expect(jurors).toHaveLength(1);
	expect(jurors[0].user_id).toBe(CAROL_ID);

	// Pas de proposition (mode open n'utilise pas propositions)
	const props =
		await dbOwn`SELECT id FROM public.propositions WHERE bet_id = ${betId}`;
	expect(props).toHaveLength(0);
});

// ─── Visibilité ───────────────────────────────────────────────────────────────

test('Bob (visible) voit le défi dans la liste groupe ; Dave (non membre) ne peut pas y accéder', async ({
	browser
}) => {
	// Alice crée le défi
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betUrl } = await createOpenChallenge(alicePage, {
		title: '[E2E] Visibilité défi ouvert'
	});
	await aliceCtx.close();

	// Bob voit le défi dans la liste du groupe
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(GROUP_URL);
	await expect(bobPage.getByText('[E2E] Visibilité défi ouvert')).toBeVisible();

	// Bob accède à la page du défi
	await bobPage.goto(betUrl);
	await expect(bobPage.getByTestId('bet-title')).toHaveText('[E2E] Visibilité défi ouvert');
	await expect(bobPage.getByTestId('bet-type-badge')).toHaveText('Défi ouvert');
	await expect(bobPage.getByTestId('accept-open-btn')).toBeVisible();
	await bobCtx.close();

	// Dave n'est pas dans le groupe seedé → 404 même sans visibilité
	const daveCtx = await browser.newContext();
	const davePage = await daveCtx.newPage();
	await login(davePage, 'dave');
	await davePage.goto(betUrl);
	await expect(davePage.getByRole('heading', { name: '404' })).toBeVisible();
	await daveCtx.close();
});

test('membre hors visibilité (Carol exclue) → 404', async ({ browser }) => {
	// Alice crée un défi visible uniquement par Bob (max 1)
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betUrl } = await createOpenChallenge(alicePage, {
		title: '[E2E] Visibilité exclusive bob',
		visibilityIds: [BOB_ID], // Carol exclue
		maxOpponents: 1,
		juryId: BOB_ID
	});
	await aliceCtx.close();

	// Carol ne devrait pas voir le défi (hors visibilité)
	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(betUrl);
	await expect(carolPage.getByRole('heading', { name: '404' })).toBeVisible();
	await carolCtx.close();
});

// ─── Scénario principal : Bob et Carol acceptent, 2 matchs ───────────────────

test('Alice crée max 2, Bob accepte, Carol accepte → 2 matchs ; défi complet', async ({
	browser
}) => {
	// === Alice crée le défi ===
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betUrl, betId } = await createOpenChallenge(alicePage, {
		title: '[E2E] Scénario complet 2 matchs',
		maxOpponents: 2,
		stakeCreator: '10',
		stakeOpponent: '5'
	});

	// Alice voit progression 0/2 et "Vous êtes le créateur"
	await expect(alicePage.getByTestId('open-challenge-progress')).toContainText('0 / 2');
	await expect(alicePage.getByTestId('creator-cannot-accept-msg')).toBeVisible();
	await aliceCtx.close();

	// === Bob accepte ===
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(betUrl);

	// Bob voit le bouton Accepter
	await expect(bobPage.getByTestId('accept-open-btn')).toBeVisible();
	await bobPage.getByTestId('accept-open-btn').click();

	// Après acceptation : Bob voit "Vous avez déjà accepté"
	await expect(bobPage.getByTestId('already-accepted-msg')).toBeVisible();
	await expect(bobPage.getByTestId('already-accepted-msg')).toContainText(
		'Vous avez déjà accepté ce défi'
	);
	await expect(bobPage.getByTestId('open-challenge-progress')).toContainText('1 / 2');

	// Un match créé dans la liste
	await expect(bobPage.getByTestId('open-matches-list')).toBeVisible();
	const matchItems1 = bobPage.getByTestId('open-match-item');
	await expect(matchItems1).toHaveCount(1);
	await expect(matchItems1.first().getByTestId('match-acceptor')).toContainText('Bob');
	await bobCtx.close();

	// === Carol accepte ===
	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(betUrl);

	// Carol voit encore le bouton (défi pas encore complet avec 1/2)
	await expect(carolPage.getByTestId('accept-open-btn')).toBeVisible();
	await carolPage.getByTestId('accept-open-btn').click();

	// Après la 2e acceptation : défi complet
	await expect(carolPage.getByTestId('already-accepted-msg')).toBeVisible();
	await expect(carolPage.getByTestId('open-challenge-progress')).toContainText('2 / 2');
	await expect(carolPage.getByTestId('open-challenge-full-msg')).toBeVisible();
	await expect(carolPage.getByTestId('open-challenge-full-msg')).toContainText('complet');

	// Badge status = "Complet"
	await expect(carolPage.getByTestId('bet-status-badge')).toContainText('Complet');

	// 2 matchs listés
	await expect(carolPage.getByTestId('open-matches-list')).toBeVisible();
	const matchItems2 = carolPage.getByTestId('open-match-item');
	await expect(matchItems2).toHaveCount(2);
	await carolCtx.close();

	// === Vérification DB ===
	const yesnoBet =
		await dbOwn`SELECT accepted_count FROM public.yesno_bets WHERE bet_id = ${betId}`;
	expect(parseInt(yesnoBet[0].accepted_count)).toBe(2);

	const bet = await dbOwn`SELECT status FROM public.bets WHERE id = ${betId}`;
	expect(bet[0].status).toBe('closed');

	const matches =
		await dbOwn`SELECT id, status FROM public.matches WHERE bet_id = ${betId} ORDER BY created_at`;
	expect(matches).toHaveLength(2);
	expect(matches[0].status).toBe('open');
	expect(matches[1].status).toBe('open');

	// Vérifier les participants de chaque match : Alice vs Bob + Alice vs Carol
	for (const match of matches) {
		const participants =
			await dbOwn`SELECT user_id, side FROM public.match_participants WHERE match_id = ${match.id} ORDER BY side`;
		expect(participants).toHaveLength(2);

		// Alice est toujours dans le camp A (créatrice, side=a)
		const alicePart = participants.find((p: { user_id: string }) => p.user_id === ALICE_ID);
		expect(alicePart).toBeDefined();
		expect(alicePart!.side).toBe('a');

		// match_jurors = Carol (jury fixé à la création)
		const jurors =
			await dbOwn`SELECT user_id FROM public.match_jurors WHERE match_id = ${match.id}`;
		expect(jurors).toHaveLength(1);
		expect(jurors[0].user_id).toBe(CAROL_ID);
	}
});

// ─── Créateur ne peut pas accepter ───────────────────────────────────────────

test('Alice (créatrice) ne voit pas le bouton Accepter, voit message créateur', async ({
	page
}) => {
	await login(page, 'alice');
	const { betUrl: _ } = await createOpenChallenge(page, {
		title: '[E2E] Créateur ne peut pas accepter'
	});

	// Pas de bouton Accepter
	await expect(page.getByTestId('accept-open-btn')).not.toBeVisible();
	// Message explicatif créateur
	await expect(page.getByTestId('creator-cannot-accept-msg')).toBeVisible();
});

// ─── Déjà accepté → pas de double acceptation ────────────────────────────────

test('Bob ne peut pas accepter deux fois le même défi', async ({ browser }) => {
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betUrl, betId } = await createOpenChallenge(alicePage, {
		title: '[E2E] Pas de double acceptation',
		maxOpponents: 3 // Laisse de la place pour tester
	});
	await aliceCtx.close();

	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(betUrl);

	// Bob accepte une fois
	await bobPage.getByTestId('accept-open-btn').click();
	await expect(bobPage.getByTestId('already-accepted-msg')).toBeVisible();

	// Bob ne voit plus le bouton Accepter (déjà accepté)
	await expect(bobPage.getByTestId('accept-open-btn')).not.toBeVisible();

	// Rechargement → toujours "déjà accepté"
	await bobPage.reload();
	await expect(bobPage.getByTestId('already-accepted-msg')).toBeVisible();
	await expect(bobPage.getByTestId('accept-open-btn')).not.toBeVisible();

	// DB : 1 seul match
	const matches =
		await dbOwn`SELECT COUNT(*) as cnt FROM public.matches WHERE bet_id = ${betId}`;
	expect(parseInt(matches[0].cnt)).toBe(1);

	// accepted_count = 1
	const yesnoBet =
		await dbOwn`SELECT accepted_count FROM public.yesno_bets WHERE bet_id = ${betId}`;
	expect(parseInt(yesnoBet[0].accepted_count)).toBe(1);

	await bobCtx.close();
});

// ─── Défi complet → plus d'acceptation possible ───────────────────────────────

test('défi max 1 : Bob accepte → complet → carol voit "Défi complet" sans bouton', async ({
	browser
}) => {
	const aliceCtx = await browser.newContext();
	const alicePage = await aliceCtx.newPage();
	await login(alicePage, 'alice');
	const { betUrl } = await createOpenChallenge(alicePage, {
		title: '[E2E] Défi max 1',
		maxOpponents: 1
	});
	await aliceCtx.close();

	// Bob accepte
	const bobCtx = await browser.newContext();
	const bobPage = await bobCtx.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(betUrl);
	await bobPage.getByTestId('accept-open-btn').click();
	await expect(bobPage.getByTestId('open-challenge-full-msg')).toBeVisible();
	await expect(bobPage.getByTestId('bet-status-badge')).toContainText('Complet');
	await bobCtx.close();

	// Carol voit le défi complet, sans bouton Accepter
	const carolCtx = await browser.newContext();
	const carolPage = await carolCtx.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(betUrl);
	await expect(carolPage.getByTestId('open-challenge-full-msg')).toBeVisible();
	await expect(carolPage.getByTestId('accept-open-btn')).not.toBeVisible();
	await expect(carolPage.getByTestId('open-challenge-full-static')).toBeVisible();
	await carolCtx.close();
});

// ─── Scénario avec gage ───────────────────────────────────────────────────────

test('Alice crée un défi ouvert avec gage → page affiche gages créateur et adversaire', async ({
	page
}) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);
	await page.waitForLoadState('networkidle');

	// Mode open
	await page.getByTestId('mode-open').click();
	await expect(page.getByTestId('visibility-section')).toBeVisible({ timeout: 5000 });

	// Titre
	await svelteFill(page, 'input-title', '[E2E] Défi ouvert avec gage');

	// Choix
	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');

	// Visibilité
	await page.getByTestId(`visibility-member-${BOB_ID}`).getByRole('checkbox').check();
	await page.getByTestId(`visibility-member-${CAROL_ID}`).getByRole('checkbox').check();

	// Max adversaires
	await page.getByTestId('input-max-opponents').fill('2');

	// Type de mise : gage
	await page.getByTestId('stake-type-forfeit').click();

	// Gages
	await svelteFill(page, 'input-forfeit-creator', 'Je fais la vaisselle');
	await svelteFill(page, 'input-forfeit-opponent', 'Il paie la tournée');

	// Jury
	await page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox').check();

	// Submit
	await page.getByTestId('submit-btn').click();

	await expect(page).toHaveURL(
		new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`)
	);

	// Gages affichés
	await expect(page.getByTestId('open-forfeit-creator')).toContainText('Je fais la vaisselle');
	await expect(page.getByTestId('open-forfeit-opponent')).toContainText('Il paie la tournée');
});

// ─── Validations ─────────────────────────────────────────────────────────────

test('mode open sans membre dans la visibilité → erreur de validation', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);
	await page.waitForLoadState('networkidle');

	// Mode open
	await page.getByTestId('mode-open').click();
	await expect(page.getByTestId('visibility-section')).toBeVisible({ timeout: 5000 });

	// Titre
	await svelteFill(page, 'input-title', '[E2E] Défi sans visibilité');

	// Choix
	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');

	// Pas de visibilité cochée
	// Max adversaires et mise
	await page.getByTestId('input-max-opponents').fill('1');
	await page.getByTestId('input-stake-creator').fill('10');
	await page.getByTestId('input-stake-opponent').fill('5');

	// Jury
	await page.getByTestId(`jury-member-${BOB_ID}`).getByRole('checkbox').check();

	await page.getByTestId('submit-btn').click();

	// Erreur : pas assez de membres dans la visibilité
	await expect(page.getByTestId('form-error')).toBeVisible();
	await expect(page.getByTestId('form-error')).toContainText('visible');
});

test('mode open sans jury → erreur de validation', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);
	await page.waitForLoadState('networkidle');

	// Mode open
	await page.getByTestId('mode-open').click();
	await expect(page.getByTestId('visibility-section')).toBeVisible({ timeout: 5000 });

	// Remplir le minimum sauf le jury
	await svelteFill(page, 'input-title', '[E2E] Défi sans jury');
	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');
	await page.getByTestId(`visibility-member-${BOB_ID}`).getByRole('checkbox').check();
	await page.getByTestId('input-max-opponents').fill('1');
	await page.getByTestId('input-stake-creator').fill('10');
	await page.getByTestId('input-stake-opponent').fill('5');
	// Pas de jury coché

	await page.getByTestId('submit-btn').click();

	await expect(page.getByTestId('form-error')).toBeVisible();
	await expect(page.getByTestId('form-error')).toContainText('jury');
});

// ─── Redirection /login sans session ─────────────────────────────────────────

test('accès /bets/new/yesno sans session → redirection /login', async ({ page }) => {
	await page.goto(NEW_YESNO_URL);
	await expect(page).toHaveURL(/\/login/);
});

// ─── Navigation ──────────────────────────────────────────────────────────────

test('lien retour depuis page défi ouvert → groupe', async ({ page }) => {
	await login(page, 'alice');

	await createOpenChallenge(page, {
		title: '[E2E] Retour navigation'
	});

	await page.getByRole('link', { name: '← Retour au groupe' }).click();
	await expect(page).toHaveURL(GROUP_URL);
});

test('défi ouvert apparaît dans la liste du groupe (vue créateur)', async ({ page }) => {
	await login(page, 'alice');

	await createOpenChallenge(page, {
		title: '[E2E] Défi dans liste groupe'
	});

	await page.goto(GROUP_URL);
	await expect(page.getByText('[E2E] Défi dans liste groupe')).toBeVisible();
});

// ─── Non-régression : mode duel encore fonctionnel ───────────────────────────

test('non-régression : créer un duel (mode duel) via le nouveau formulaire', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	// Le mode duel est le défaut
	await expect(page.getByTestId('mode-duel')).toBeVisible();
	await expect(page.getByTestId('select-target')).toBeVisible();

	// Remplir le formulaire duel
	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');
	await page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox').check();
	await svelteFill(page, 'input-title', '[E2E] Duel non-régression S-032');
	await page.getByTestId('input-stake-creator').fill('10');
	await page.getByTestId('input-stake-target').fill('5');
	// Cible en dernier (Svelte 5 race condition)
	await page.getByTestId('select-target').selectOption({ value: BOB_ID });

	await page.getByTestId('submit-btn').click();

	await expect(page).toHaveURL(
		new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`)
	);

	// Badge = Duel Oui / Non (pas Défi ouvert)
	await expect(page.getByTestId('bet-type-badge')).toHaveText('Duel Oui / Non');
});
