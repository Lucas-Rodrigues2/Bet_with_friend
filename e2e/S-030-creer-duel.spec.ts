/**
 * S-030 — Créer un duel Oui/Non
 *
 * Critères d'acceptation :
 * 1. Formulaire /app/groups/[id]/bets/new/yesno : titre, description, choix A/B,
 *    mon camp (A|B), cible (un membre actif ≠ créateur), mise (points : ma mise +
 *    sa mise ; gage : mon gage + son gage), jury + mode, expiration (défaut 48h).
 * 2. Soumission → bets(type=yesno, status=open) + yesno_bets(mode=duel) +
 *    propositions(status=negotiating, expires_at) + proposition_jurors +
 *    bet_visibility = {créateur, cible} (figée).
 * 3. La cible voit le duel avec badge « Proposition reçue » ; les autres ne le voient pas.
 * 4. La page du duel montre : 2 camps, mises, gages éventuels, jury proposé, échéance.
 * 5. Validation : cible obligatoire, choix A ≠ choix B non vides, mises > 0 si points.
 *
 * Scénarios :
 * - Alice défie Bob (« Il pleuvra demain », A=Oui, camp A d'Alice, 10 vs 5)
 *   → Bob voit la proposition, Carol ne voit pas le pari.
 * - La page duel affiche camps/mises/échéance correctement.
 * - Validation : pas de cible → erreur.
 *
 * Note sur le select cible (Svelte 5 bind:value race condition) :
 * Lorsque page.fill() met à jour les champs texte (choiceA/B), Svelte 5 re-render
 * et reset le select à targetIdValue=''. Pour contourner, on appelle selectOption()
 * EN DERNIER, juste avant les mises (qui n'impactent pas le state du select).
 */
import { test, expect, type Page } from '@playwright/test';
import postgres from 'postgres';
import { login } from './helpers/auth';
import { db } from './helpers/db';

// Connexion dédiée pour les assertions DB de ce spec.
// On crée une nouvelle instance pour éviter d'être affecté par db.end() appelé
// dans d'autres specs (notamment S-020) qui partagent le même singleton db.
const DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const dbOwn = postgres(DATABASE_URL, { max: 3 });

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;
const NEW_YESNO_URL = `${GROUP_URL}/bets/new/yesno`;

// UUIDs from seed.sql
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
 * Remplit le formulaire de création d'un duel yesno (points) pour Alice vs Bob.
 *
 * Pattern Svelte 5 : selectOption() est appelé EN DERNIER (après tous les fill()
 * qui causent des re-renders) pour éviter la race condition qui reset le select.
 */
async function fillDuelForm(
	page: Page,
	opts: {
		title: string;
		choiceA?: string;
		choiceB?: string;
		targetId?: string;
		stakeCreator?: string;
		stakeTarget?: string;
		juryId?: string;
	}
): Promise<void> {
	const choiceA = opts.choiceA ?? 'Oui';
	const choiceB = opts.choiceB ?? 'Non';
	const targetId = opts.targetId ?? BOB_ID;
	const juryId = opts.juryId ?? CAROL_ID;

	// 1. Choix A/B via fill natif (ces fills déclenchent des re-renders Svelte)
	await page.getByTestId('input-choice-a').fill(choiceA);
	await page.getByTestId('input-choice-b').fill(choiceB);

	// 2. Jury (checkbox — peut causer un re-render mais n'affecte pas le select)
	await page
		.getByTestId(`jury-member-${juryId}`)
		.getByRole('checkbox')
		.check();

	// 3. Titre via svelteFill
	await svelteFill(page, 'input-title', opts.title);

	// 4. Mises AVANT la sélection finale (pour éviter qu'un re-render Svelte 5
	// provoqué par les fills ne resette le select)
	if (opts.stakeCreator !== undefined) {
		await page.getByTestId('input-stake-creator').fill(opts.stakeCreator);
	}
	if (opts.stakeTarget !== undefined) {
		await page.getByTestId('input-stake-target').fill(opts.stakeTarget);
	}

	// 5. Sélection de la cible EN TOUT DERNIER pour éviter la race condition Svelte 5 :
	// fill() sur les inputs (choix A/B, mises) → re-render Svelte → targetIdValue reset à ''
	// On place ce selectOption après tous les fills pour qu'il soit le dernier re-render.
	await page.getByTestId('select-target').selectOption({ value: targetId });
}

test.afterEach(async () => {
	try {
		await dbOwn`DELETE FROM public.bets WHERE title LIKE '[E2E]%'`;
	} catch {
		// Ignore DB cleanup errors
	}
});

test.afterAll(async () => {
	await dbOwn.end();
});

// ─── Auth guard ───────────────────────────────────────────────────────────────

test('accès /bets/new/yesno sans session → redirection /login', async ({ page }) => {
	await page.goto(NEW_YESNO_URL);
	await expect(page).toHaveURL(/\/login/);
});

// ─── Guard non-membre ─────────────────────────────────────────────────────────

test('Dave (non membre) accède à /bets/new/yesno → 404', async ({ page }) => {
	await login(page, 'dave');
	await page.goto(NEW_YESNO_URL);
	await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
});

// ─── Formulaire — structure ───────────────────────────────────────────────────

test('formulaire de création yesno affiché pour Alice', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	// Titre de la page
	await expect(page.getByRole('heading', { name: 'Nouveau duel Oui / Non' })).toBeVisible();

	// Champ titre
	await expect(page.getByTestId('input-title')).toBeVisible();

	// Champ description
	await expect(page.getByTestId('input-description')).toBeVisible();

	// Champs choix A et B
	await expect(page.getByTestId('input-choice-a')).toBeVisible();
	await expect(page.getByTestId('input-choice-b')).toBeVisible();

	// Camp du créateur : A sélectionné par défaut
	await expect(page.getByTestId('creator-side-a')).toBeChecked();
	await expect(page.getByTestId('creator-side-b')).not.toBeChecked();

	// Select cible
	await expect(page.getByTestId('select-target')).toBeVisible();

	// Type de mise : points par défaut
	await expect(page.getByTestId('stake-type-points')).toBeChecked();
	await expect(page.getByTestId('stake-type-forfeit')).not.toBeChecked();

	// Champs mises points
	await expect(page.getByTestId('input-stake-creator')).toBeVisible();
	await expect(page.getByTestId('input-stake-target')).toBeVisible();

	// Jury avec Bob et Carol listés
	await expect(page.getByTestId(`jury-member-${BOB_ID}`)).toBeVisible();
	await expect(page.getByTestId(`jury-member-${CAROL_ID}`)).toBeVisible();

	// Mode jury
	await expect(page.getByTestId('jury-mode-majority')).toBeChecked();
	await expect(page.getByTestId('jury-mode-unanimous')).not.toBeChecked();

	// Select expiration avec valeur par défaut 48h
	await expect(page.getByTestId('select-expiration')).toBeVisible();

	// Bouton soumettre
	await expect(page.getByTestId('submit-btn')).toBeVisible();

	// Lien retour et annuler
	await expect(page.getByRole('link', { name: '← Retour au groupe' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Annuler' })).toBeVisible();
});

test('select cible exclut Alice (créatrice) et liste Bob et Carol', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	// Le select propose Bob et Carol mais pas Alice
	const options = await page.locator('[data-testid="select-target"] option').allTextContents();
	expect(options.some((o) => /Bob/i.test(o))).toBe(true);
	expect(options.some((o) => /Carol/i.test(o))).toBe(true);
	expect(options.some((o) => /Alice/i.test(o))).toBe(false);
});

test('sélection du type Gage affiche les champs de gage par camp', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	// Attendre hydratation complète (networkidle) avant d'interagir
	await page.waitForLoadState('networkidle');

	// En mode points, les champs mises sont visibles
	await expect(page.getByTestId('input-stake-creator')).toBeVisible();
	await expect(page.getByTestId('input-stake-target')).toBeVisible();

	// Passer en mode gage via click direct (déclenche le onchange Svelte 5)
	await page.getByTestId('stake-type-forfeit').click();

	// Champs gage visibles
	await expect(page.getByTestId('input-forfeit-creator')).toBeVisible();
	await expect(page.getByTestId('input-forfeit-target')).toBeVisible();

	// Champs mises disparaissent
	await expect(page.getByTestId('input-stake-creator')).not.toBeVisible();
	await expect(page.getByTestId('input-stake-target')).not.toBeVisible();
});

test("résumé des camps s'affiche quand titre A, titre B et cible sont sélectionnés", async ({
	page
}) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	// Remplir les choix via svelteFill EN PREMIER (déclenche des re-renders Svelte 5)
	// puis sélectionner la cible EN DERNIER pour éviter la race condition :
	// fill() → re-render Svelte 5 → targetIdValue reset à ''
	await svelteFill(page, 'input-choice-a', 'Oui');
	await svelteFill(page, 'input-choice-b', 'Non');

	// Attendre que les re-renders Svelte se stabilisent
	await page.waitForTimeout(200);

	// Sélectionner la cible après stabilisation
	await page.getByTestId('select-target').selectOption({ value: BOB_ID });

	// Le résumé doit apparaître
	await expect(page.getByText('Résumé :')).toBeVisible({ timeout: 5000 });
});

// ─── Scénarios de soumission ─────────────────────────────────────────────────

test('Alice défie Bob (points 10 vs 5) → redirection vers page duel', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	await fillDuelForm(page, {
		title: '[E2E] Il pleuvra demain',
		stakeCreator: '10',
		stakeTarget: '5'
	});

	await page.getByTestId('submit-btn').click();

	await expect(page).toHaveURL(
		new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`)
	);
});

test('page duel affiche badge type, titre, camps, mises et échéance', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	await fillDuelForm(page, {
		title: '[E2E] Il pleuvra demain détail',
		stakeCreator: '10',
		stakeTarget: '5'
	});
	await page.getByTestId('submit-btn').click();

	await expect(page).toHaveURL(
		new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`)
	);

	// Type badge : Duel Oui / Non
	await expect(page.getByTestId('bet-type-badge')).toHaveText('Duel Oui / Non');

	// Titre
	await expect(page.getByTestId('bet-title')).toHaveText('[E2E] Il pleuvra demain détail');

	// Status : En négociation (badge proposition, renommé par S-031)
	await expect(page.getByTestId('proposition-status-badge')).toContainText('En négociation');

	// Section camps
	await expect(page.getByTestId('yesno-camps')).toBeVisible();
	await expect(page.getByTestId('camp-a-choice')).toHaveText('Oui');
	await expect(page.getByTestId('camp-b-choice')).toHaveText('Non');

	// Alice est dans le camp A (créatrice, camp A)
	await expect(page.getByTestId('camp-a-player')).toContainText('Alice');

	// Section mises
	await expect(page.getByTestId('yesno-stakes')).toBeVisible();
	await expect(page.getByTestId('stake-creator')).toContainText('10');
	await expect(page.getByTestId('stake-target')).toContainText('5');

	// Échéance visible
	await expect(page.getByTestId('proposition-expiry')).toBeVisible();
	await expect(page.getByTestId('expiry-value')).not.toBeEmpty();

	// Jury visible
	await expect(page.getByTestId('bet-jury')).toBeVisible();
	await expect(page.getByTestId('jury-member')).toBeVisible();

	// Visibilité figée (uniquement créateur et cible)
	await expect(page.getByTestId('bet-visibility')).toBeVisible();
	await expect(page.getByTestId('bet-visibility')).toContainText(
		'La liste de visibilité est figée à la création et ne peut pas être modifiée.'
	);

	// Visibilité = 2 participants (Alice + Bob)
	const visMembers = page.getByTestId('visibility-member');
	await expect(visMembers).toHaveCount(2);
});

test('page duel affiche le camp A (Alice) et camp B (Bob)', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	await fillDuelForm(page, {
		title: '[E2E] Test camps A/B',
		choiceA: 'Oui il pleuvra',
		choiceB: 'Non il ne pleuvra pas',
		stakeCreator: '10',
		stakeTarget: '5'
	});
	await page.getByTestId('submit-btn').click();

	await expect(page).toHaveURL(
		new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`)
	);

	await expect(page.getByTestId('camp-a-choice')).toHaveText('Oui il pleuvra');
	await expect(page.getByTestId('camp-b-choice')).toHaveText('Non il ne pleuvra pas');
	await expect(page.getByTestId('camp-a-player')).toContainText('Alice');
	await expect(page.getByTestId('camp-b-player')).toContainText('Bob');
});

test('Alice crée duel avec camp B → camp A pour Bob, camp B pour Alice', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	// Attendre hydratation complète avant d'interagir avec les radios (Svelte 5)
	await page.waitForLoadState('networkidle');

	// Alice choisit le camp B en cliquant sur le label (radio sr-only)
	await page.locator('label').filter({ has: page.getByTestId('creator-side-b') }).click();
	await expect(page.getByTestId('creator-side-b')).toBeChecked();

	await fillDuelForm(page, {
		title: '[E2E] Test camp B créateur',
		stakeCreator: '10',
		stakeTarget: '5'
	});
	await page.getByTestId('submit-btn').click();

	await expect(page).toHaveURL(
		new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`)
	);

	await expect(page.getByTestId('camp-b-player')).toContainText('Alice');
	await expect(page.getByTestId('camp-a-player')).toContainText('Bob');
});

// ─── Scénario gage ────────────────────────────────────────────────────────────

test('Alice crée un duel avec gage par camp', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	// Attendre hydratation complète avant d'interagir avec les radios Svelte 5
	await page.waitForLoadState('networkidle');

	// Passer en mode gage
	await page.getByTestId('stake-type-forfeit').click();
	await expect(page.getByTestId('input-forfeit-creator')).toBeVisible();

	// Choix, jury, titre, puis sélection cible en dernier
	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');
	await page
		.getByTestId(`jury-member-${CAROL_ID}`)
		.getByRole('checkbox')
		.check();
	await svelteFill(page, 'input-title', '[E2E] Duel avec gage');
	await svelteFill(page, 'input-forfeit-creator', 'Je fais la vaisselle');
	await svelteFill(page, 'input-forfeit-target', 'Il paie la tournée');
	await page.getByTestId('select-target').selectOption({ value: BOB_ID });

	await page.getByTestId('submit-btn').click();

	await expect(page).toHaveURL(
		new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`)
	);

	await expect(page.getByTestId('forfeit-creator')).toContainText('Je fais la vaisselle');
	await expect(page.getByTestId('forfeit-target')).toContainText('Il paie la tournée');
});

// ─── Visibilité : Bob voit proposition, Carol ne la voit pas ─────────────────

test('Bob (cible) voit le duel avec badge Proposition reçue, Carol ne le voit pas', async ({
	browser
}) => {
	const aliceContext = await browser.newContext();
	const alicePage = await aliceContext.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(NEW_YESNO_URL);

	await alicePage.getByTestId('input-choice-a').fill('Oui');
	await alicePage.getByTestId('input-choice-b').fill('Non');
	await alicePage.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox').check();
	await svelteFill(alicePage, 'input-title', '[E2E] Visibilite duel');
	await alicePage.getByTestId('select-target').selectOption({ value: BOB_ID });
	await alicePage.getByTestId('input-stake-creator').fill('10');
	await alicePage.getByTestId('input-stake-target').fill('5');
	await alicePage.getByTestId('submit-btn').click();
	await alicePage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const betUrl = alicePage.url();
	const betId = betUrl.split('/bets/')[1];
	await aliceContext.close();

	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(GROUP_URL);
	await expect(bobPage.getByText('[E2E] Visibilite duel')).toBeVisible();

	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);
	await expect(bobPage.getByTestId('bet-title')).toHaveText('[E2E] Visibilite duel');
	await expect(bobPage.getByTestId('proposition-received-badge')).toBeVisible();
	await expect(bobPage.getByTestId('proposition-received-badge')).toHaveText('À toi de jouer');
	await bobContext.close();

	const carolContext = await browser.newContext();
	const carolPage = await carolContext.newPage();
	await login(carolPage, 'carol');
	await carolPage.goto(GROUP_URL);
	await expect(carolPage.getByText('[E2E] Visibilite duel')).not.toBeVisible();

	await carolPage.goto(`${GROUP_URL}/bets/${betId}`);
	await expect(carolPage.getByRole('heading', { name: '404' })).toBeVisible();
	await carolContext.close();
});

test('Alice (créatrice) voit le duel dans la liste du groupe', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	await fillDuelForm(page, {
		title: '[E2E] Duel dans liste',
		stakeCreator: '10',
		stakeTarget: '5'
	});
	await page.getByTestId('submit-btn').click();
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	await page.goto(GROUP_URL);
	await expect(page.getByText('[E2E] Duel dans liste')).toBeVisible();
});

// ─── Validations ─────────────────────────────────────────────────────────────

test('pas de cible sélectionnée → validation bloque la soumission', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	await svelteFill(page, 'input-title', '[E2E] Duel sans cible');
	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');
	await page.getByTestId('input-stake-creator').fill('10');
	await page.getByTestId('input-stake-target').fill('5');
	await page
		.getByTestId(`jury-member-${CAROL_ID}`)
		.getByRole('checkbox', { name: 'Carol' })
		.check();
	// Ne pas sélectionner de cible

	await page.getByTestId('submit-btn').click();

	// Validation HTML5 (select required) bloque : on reste sur la page
	await expect(page).toHaveURL(NEW_YESNO_URL);
});

test('mise créateur ≤ 0 → erreur de validation', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');
	await page
		.getByTestId(`jury-member-${CAROL_ID}`)
		.getByRole('checkbox', { name: 'Carol' })
		.check();
	await svelteFill(page, 'input-title', '[E2E] Mise invalide');
	// Bypasser la validation HTML5 min="0.01"
	await page.evaluate(() => {
		const input = document.querySelector(
			'[data-testid="input-stake-creator"]'
		) as HTMLInputElement;
		if (input) {
			input.removeAttribute('min');
			input.value = '-5';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.dispatchEvent(new Event('change', { bubbles: true }));
		}
	});
	await page.getByTestId('input-stake-target').fill('5');
	// Cible en dernier
	await page.getByTestId('select-target').selectOption({ value: BOB_ID });

	await page.getByTestId('submit-btn').click();

	await expect(page.getByTestId('form-error')).toBeVisible();
	await expect(page.getByTestId('form-error')).toContainText('supérieure à 0');
});

test('jury vide → erreur de validation', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Non');
	await svelteFill(page, 'input-title', '[E2E] Jury vide');
	await page.getByTestId('input-stake-creator').fill('10');
	await page.getByTestId('input-stake-target').fill('5');
	// Cible en dernier, pas de jury
	await page.getByTestId('select-target').selectOption({ value: BOB_ID });

	await page.getByTestId('submit-btn').click();

	await expect(page.getByTestId('form-error')).toBeVisible();
	await expect(page.getByTestId('form-error')).toContainText('jury');
});

test('choix A identique à choix B → erreur de validation', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	await page.getByTestId('input-choice-a').fill('Oui');
	await page.getByTestId('input-choice-b').fill('Oui');
	await page
		.getByTestId(`jury-member-${CAROL_ID}`)
		.getByRole('checkbox', { name: 'Carol' })
		.check();
	await svelteFill(page, 'input-title', '[E2E] Choix identiques');
	await page.getByTestId('input-stake-creator').fill('10');
	await page.getByTestId('input-stake-target').fill('5');
	// Cible en dernier
	await page.getByTestId('select-target').selectOption({ value: BOB_ID });

	await page.getByTestId('submit-btn').click();

	await expect(page.getByTestId('form-error')).toBeVisible();
	await expect(page.getByTestId('form-error')).toContainText('différents');
});

// ─── Données en DB ────────────────────────────────────────────────────────────

test('création duel → lignes DB : bets, yesno_bets, propositions, bet_visibility', async ({
	page
}) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	await fillDuelForm(page, {
		title: '[E2E] Duel DB check',
		stakeCreator: '10',
		stakeTarget: '5'
	});
	await page.getByTestId('submit-btn').click();

	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const betId = page.url().split('/bets/')[1];

	const bets = await dbOwn`SELECT type, status FROM public.bets WHERE id = ${betId}`;
	expect(bets).toHaveLength(1);
	expect(bets[0].type).toBe('yesno');
	expect(bets[0].status).toBe('open');

	const yesnoBets = await dbOwn`SELECT mode FROM public.yesno_bets WHERE bet_id = ${betId}`;
	expect(yesnoBets).toHaveLength(1);
	expect(yesnoBets[0].mode).toBe('duel');

	const propositions =
		await dbOwn`SELECT status, expires_at FROM public.propositions WHERE bet_id = ${betId}`;
	expect(propositions).toHaveLength(1);
	expect(propositions[0].status).toBe('negotiating');
	expect(propositions[0].expires_at).not.toBeNull();

	const visibility = await dbOwn`SELECT user_id FROM public.bet_visibility WHERE bet_id = ${betId}`;
	expect(visibility).toHaveLength(2);
});

// ─── Navigation ──────────────────────────────────────────────────────────────

test('lien "Annuler" renvoie vers le groupe', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	await page.getByRole('link', { name: 'Annuler' }).click();
	await expect(page).toHaveURL(GROUP_URL);
});

test('lien retour vers le groupe depuis la page duel', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);

	await fillDuelForm(page, {
		title: '[E2E] Test retour',
		stakeCreator: '10',
		stakeTarget: '5'
	});
	await page.getByTestId('submit-btn').click();

	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	await page.getByRole('link', { name: '← Retour au groupe' }).click();
	await expect(page).toHaveURL(GROUP_URL);
});

// ─── Bouton Accepter (placeholder S-031) ─────────────────────────────────────

test('bouton Accepter sur page duel visible mais désactivé pour la cible (placeholder S-031)', async ({
	browser
}) => {
	const aliceContext = await browser.newContext();
	const alicePage = await aliceContext.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(NEW_YESNO_URL);

	await alicePage.getByTestId('input-choice-a').fill('Oui');
	await alicePage.getByTestId('input-choice-b').fill('Non');
	await alicePage.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox').check();
	await svelteFill(alicePage, 'input-title', '[E2E] Test bouton accepter');
	await alicePage.getByTestId('select-target').selectOption({ value: BOB_ID });
	await alicePage.getByTestId('input-stake-creator').fill('10');
	await alicePage.getByTestId('input-stake-target').fill('5');
	await alicePage.getByTestId('submit-btn').click();
	await alicePage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const betId = alicePage.url().split('/bets/')[1];
	await aliceContext.close();

	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);

	await expect(bobPage.getByTestId('accept-btn')).toBeVisible();
	await expect(bobPage.getByTestId('accept-btn')).toBeEnabled();
	await bobContext.close();
});
