/**
 * S-020 — Créer un pari « au plus proche »
 *
 * Critères d'acceptation :
 * 1. Formulaire /app/groups/[id]/bets/new/closest : titre, description, type de mise,
 *    deadline, hide_answers, visibilité, jury + mode.
 * 2. Soumission valide → bets + bet_visibility + match + match_jurors ; redirect vers détail.
 * 3. Page détail : titre, mise, deadline, jury, visibilité, bouton « Participer ».
 * 4. Validation : titre vide, montant ≤ 0, deadline passée, jury vide → erreurs.
 * 5. Membre hors visibilité → 404 (liste et URL directe).
 * 6. Pas d'UI de modification de la visibilité après création.
 *
 * Scénarios :
 * - Alice crée un closest (points, 10) visible par alice+bob+carol, jury=carol →
 *   pari visible pour Alice et Bob, PAS pour Dave
 * - Création avec gage + scope « tous les perdants »
 * - Deadline passée refusée ; jury vide refusé
 * - Page détail montre jury et mise
 */
import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;
const NEW_CLOSEST_URL = `${GROUP_URL}/bets/new/closest`;

// UUIDs from seed.sql
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

/**
 * Remplit un champ texte lié à `bind:value` (Svelte 5) de façon fiable en mode headless.
 *
 * Le problème : Playwright fill() dispatche un event `input` mais Svelte 5 avec
 * `bind:value` en mode SSR/hydratation peut ne pas propager la valeur au $state
 * si un re-render Svelte se produit juste après (race condition timing).
 * Cette fonction utilise `evaluate` pour set la valeur ET dispatcher les events
 * dans le même tick JS, garantissant la synchronisation avec le $state Svelte.
 */
async function svelteFill(page: Page, testId: string, value: string): Promise<void> {
	await page.evaluate(
		([tid, val]) => {
			const el = document.querySelector(
				`[data-testid="${tid}"]`
			) as HTMLInputElement | HTMLTextAreaElement | null;
			if (el) {
				el.focus();
				// Set native value (bypasse les vérifications DOM)
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
				// Dispatcher input + change pour que Svelte 5 mette à jour $state
				el.dispatchEvent(new Event('input', { bubbles: true }));
				el.dispatchEvent(new Event('change', { bubbles: true }));
			}
		},
		[testId, value]
	);
}

test.afterEach(async () => {
	// Cleanup bets created during tests (via cascade: bet_visibility, matches, match_jurors)
	await db`DELETE FROM public.bets WHERE title LIKE '[E2E]%'`;
});

// Note : on n'appelle PAS db.end() ici car db est un singleton partagé avec
// les autres specs (S-030-tracking etc.). Chaque spec qui a besoin d'une
// connexion dédiée crée sa propre instance postgres.

// ─── Auth guard ───────────────────────────────────────────────────────────────

test('accès /bets/new/closest sans session → redirection /login', async ({ page }) => {
	await page.goto(NEW_CLOSEST_URL);
	await expect(page).toHaveURL(/\/login/);
});

// ─── Guard non-membre ─────────────────────────────────────────────────────────

test('Dave (non membre) accède à /bets/new/closest → 404', async ({ page }) => {
	await login(page, 'dave');
	await page.goto(NEW_CLOSEST_URL);
	await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
});

// ─── Formulaire — structure ───────────────────────────────────────────────────

test('formulaire de création closest affiché pour Alice', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);

	// Titre de la page
	await expect(page.getByRole('heading', { name: 'Nouveau pari « au plus proche »' })).toBeVisible();

	// Champ titre
	await expect(page.getByTestId('input-title')).toBeVisible();

	// Champ description
	await expect(page.getByTestId('input-description')).toBeVisible();

	// Type de mise (points par défaut)
	await expect(page.getByTestId('stake-type-points')).toBeChecked();
	await expect(page.getByTestId('stake-type-forfeit')).not.toBeChecked();

	// Champ montant visible (mode points)
	await expect(page.getByTestId('input-stake-amount')).toBeVisible();

	// Deadline optionnelle
	await expect(page.getByTestId('input-deadline')).toBeVisible();

	// Hide answers coché par défaut
	await expect(page.getByTestId('input-hide-answers')).toBeChecked();

	// Liste visibilité contient Alice (cochée, désactivée)
	await expect(
		page.getByTestId(`visibility-member-${CAROL_ID}`).getByRole('checkbox', { name: 'Carol' })
	).toBeVisible();

	// Liste jury
	await expect(
		page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox', { name: 'Carol' })
	).toBeVisible();

	// Bouton créer
	await expect(page.getByTestId('submit-btn')).toBeVisible();

	// Lien retour
	await expect(page.getByRole('link', { name: '← Retour au groupe' })).toBeVisible();
});

test('Alice (créatrice) apparaît dans la visibilité cochée et désactivée', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);

	// Alice est toujours incluse, case désactivée
	const aliceCheckbox = page.getByRole('checkbox', { name: 'Alice (moi)' }).first();
	await expect(aliceCheckbox).toBeChecked();
	await expect(aliceCheckbox).toBeDisabled();
});

test('sélection du type Gage affiche les champs description et périmètre', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);

	// Attendre l'hydratation Svelte initiale ($effect visibilitySelected)
	await expect(page.getByRole('checkbox', { name: 'Alice (moi)' }).first()).toBeChecked();

	// Champ montant présent en mode points
	await expect(page.getByTestId('input-stake-amount')).toBeVisible();

	// Passer en mode gage : utiliser evaluate pour déclencher l'onchange Svelte 5
	// (click() ne déclenche pas l'événement 'change' de façon fiable sur les radios Svelte 5)
	await page.evaluate(() => {
		const radio = document.querySelector('[data-testid="stake-type-forfeit"]') as HTMLInputElement;
		if (radio) {
			radio.checked = true;
			radio.dispatchEvent(new Event('change', { bubbles: true }));
		}
	});

	// Champs gage visibles
	await expect(page.getByTestId('input-forfeit-description')).toBeVisible();
	await expect(page.getByTestId('forfeit-scope-all')).toBeVisible();
	await expect(page.getByTestId('forfeit-scope-last')).toBeVisible();

	// Champ montant disparaît
	await expect(page.getByTestId('input-stake-amount')).not.toBeVisible();
});

// ─── Scénario principal : Alice crée un closest (points) ──────────────────────

test('Alice crée un closest (points, 10), visible bob+carol, jury=carol', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);

	// Visibilité : cocher Bob et Carol AVANT de remplir les champs texte (évite la
	// race condition Svelte 5 bind:value + Playwright fill : le re-render causé par
	// toggleVisibility écrase le $state titleValue si fill() n'a pas encore propagé
	// l'event input au moment du re-render).
	await page
		.getByTestId(`visibility-member-${BOB_ID}`)
		.getByRole('checkbox', { name: 'Bob' })
		.check();
	await page
		.getByTestId(`visibility-member-${CAROL_ID}`)
		.getByRole('checkbox', { name: 'Carol' })
		.check();

	// Jury : cocher Carol
	await page
		.getByTestId(`jury-member-${CAROL_ID}`)
		.getByRole('checkbox', { name: 'Carol' })
		.check();

	// Titre et description via svelteFill() : contourne la race condition Svelte 5
	// bind:value en mode headless (set valeur + dispatch events dans le même tick JS)
	await svelteFill(page, 'input-title', '[E2E] Combien de buts dans le match ?');
	await svelteFill(page, 'input-description', '[E2E] Description optionnelle');

	// Montant (input number, moins affecté par la race condition)
	await page.getByTestId('input-stake-amount').fill('10');

	// Soumettre
	await page.getByTestId('submit-btn').click();

	// Redirection vers la page détail du pari
	await expect(page).toHaveURL(
		new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`)
	);

	// Page détail : titre visible
	await expect(page.getByTestId('bet-title')).toHaveText('[E2E] Combien de buts dans le match ?');

	// Mise : 10 points (affiché avec décimales : "10.00 points")
	await expect(page.getByTestId('stake-amount')).toContainText('10');

	// Badge type
	await expect(page.getByTestId('bet-type-badge')).toHaveText('Au plus proche');

	// Statut open
	await expect(page.getByTestId('bet-status-badge')).toHaveText('Ouvert');
});

test('page détail montre le jury (Carol) et la mise (10 points)', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);

	// Attendre l'hydratation Svelte initiale ($effect visibilitySelected)
	await expect(page.getByRole('checkbox', { name: 'Alice (moi)' }).first()).toBeChecked();

	// Coche jury d'abord (évite race condition Svelte 5 bind:value)
	await page
		.getByTestId(`jury-member-${CAROL_ID}`)
		.getByRole('checkbox', { name: 'Carol' })
		.check();
	await expect(
		page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox', { name: 'Carol' })
	).toBeChecked();
	await svelteFill(page, 'input-title', '[E2E] Test jury et mise');
	// Vérifier que le titre a bien été rempli avant de soumettre
	await expect(page.getByTestId('input-title')).toHaveValue('[E2E] Test jury et mise');
	await page.getByTestId('input-stake-amount').fill('10');

	await page.getByTestId('submit-btn').click();
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	// Jury section visible avec Carol
	await expect(page.getByTestId('bet-jury')).toBeVisible();
	const juryItems = page.getByTestId('jury-member');
	await expect(juryItems).toHaveCount(1);
	await expect(juryItems.first()).toContainText('Carol');

	// Mise visible
	await expect(page.getByTestId('bet-stake')).toBeVisible();
	await expect(page.getByTestId('stake-amount')).toContainText('10');

	// Bouton participer (placeholder)
	await expect(page.getByTestId('participate-btn')).toBeVisible();
	await expect(page.getByTestId('participate-btn')).toBeDisabled();
});

test('page détail montre la visibilité (liste figée)', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);

	// Checkboxes d'abord (évite race condition Svelte 5 bind:value)
	await page
		.getByTestId(`visibility-member-${BOB_ID}`)
		.getByRole('checkbox', { name: 'Bob' })
		.check();
	await page
		.getByTestId(`jury-member-${CAROL_ID}`)
		.getByRole('checkbox', { name: 'Carol' })
		.check();
	await svelteFill(page, 'input-title', '[E2E] Test visibilite');
	await page.getByTestId('input-stake-amount').fill('5');

	await page.getByTestId('submit-btn').click();
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	// Section visibilité visible
	await expect(page.getByTestId('bet-visibility')).toBeVisible();

	// Message « figée »
	await expect(page.getByTestId('bet-visibility')).toContainText(
		'La liste de visibilité est figée à la création et ne peut pas être modifiée.'
	);

	// Pas de bouton de modification sur la page
	await expect(page.getByRole('button', { name: /modifier.*visibilité/i })).not.toBeVisible();
});

// ─── Scénario gage ────────────────────────────────────────────────────────────

test('Alice crée un closest avec gage + scope tous les perdants', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);

	// Attendre l'hydratation Svelte initiale ($effect visibilitySelected)
	await expect(page.getByRole('checkbox', { name: 'Alice (moi)' }).first()).toBeChecked();

	// Passer en mode gage : utiliser evaluate pour déclencher l'onchange Svelte 5
	// (click() ne déclenche pas l'événement 'change' de façon fiable sur les radios Svelte 5)
	await page.evaluate(() => {
		const radio = document.querySelector('[data-testid="stake-type-forfeit"]') as HTMLInputElement;
		if (radio) {
			radio.checked = true;
			radio.dispatchEvent(new Event('change', { bubbles: true }));
		}
	});
	// Attendre que le bloc forfeit soit visible (le $state stakeType doit être mis à jour)
	await expect(page.getByTestId('input-forfeit-description')).toBeVisible();

	// Périmètre et jury (checkboxes/radios avant les fill)
	await page.getByTestId('forfeit-scope-all').check();
	await page
		.getByTestId(`jury-member-${CAROL_ID}`)
		.getByRole('checkbox', { name: 'Carol' })
		.check();
	// Vérification pour laisser Svelte se stabiliser avant les fill()
	await expect(
		page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox', { name: 'Carol' })
	).toBeChecked();

	// Champs texte en dernier via svelteFill() pour contourner la race condition
	// Svelte 5 bind:value en mode headless
	await svelteFill(page, 'input-title', '[E2E] Pari avec gage');
	await svelteFill(page, 'input-forfeit-description', 'Faire la vaisselle');

	await page.getByTestId('submit-btn').click();

	// Redirection vers détail
	await expect(page).toHaveURL(
		new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`)
	);

	// Détail du gage visible
	await expect(page.getByTestId('forfeit-description')).toContainText('Faire la vaisselle');
	await expect(page.getByTestId('forfeit-scope')).toContainText('Tous les perdants');
});

// ─── Visibilité : Bob voit le pari, Dave non ──────────────────────────────────

test('pari visible pour Bob (dans liste), invisible pour Dave (hors liste)', async ({
	browser
}) => {
	// Créer le pari en tant qu'Alice
	const aliceContext = await browser.newContext();
	const alicePage = await aliceContext.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(NEW_CLOSEST_URL);

	// Checkboxes d'abord (évite race condition Svelte 5 bind:value)
	// Cocher Bob, ne pas cocher Carol (Dave n'est pas membre)
	await alicePage
		.getByTestId(`visibility-member-${BOB_ID}`)
		.getByRole('checkbox', { name: 'Bob' })
		.check();

	// Jury : Carol
	await alicePage
		.getByTestId(`jury-member-${CAROL_ID}`)
		.getByRole('checkbox', { name: 'Carol' })
		.check();

	await svelteFill(alicePage, 'input-title', '[E2E] Visibilite alice+bob');
	await alicePage.getByTestId('input-stake-amount').fill('10');

	await alicePage.getByTestId('submit-btn').click();
	await alicePage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const betUrl = alicePage.url();
	const betId = betUrl.split('/bets/')[1];

	await aliceContext.close();

	// Bob doit voir le pari dans la liste du groupe
	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();
	await login(bobPage, 'bob');
	await bobPage.goto(GROUP_URL);

	await expect(bobPage.getByText('[E2E] Visibilite alice+bob')).toBeVisible();

	// Bob peut accéder à la page détail
	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);
	await expect(bobPage.getByTestId('bet-title')).toHaveText('[E2E] Visibilite alice+bob');

	await bobContext.close();

	// Dave ne voit PAS le pari dans la liste (Dave n'est pas membre du groupe)
	// Dave essaie d'accéder directement par l'URL → 404
	const daveContext = await browser.newContext();
	const davePage = await daveContext.newPage();
	await login(davePage, 'dave');

	// Dave n'est pas membre du groupe, donc la page groupe elle-même est 404
	await davePage.goto(`${GROUP_URL}/bets/${betId}`);
	await expect(davePage.getByRole('heading', { name: '404' })).toBeVisible();

	await daveContext.close();
});

test('Carol (dans visibilité) voit le pari, mais un membre sans visibilité → 404 par URL', async ({
	browser
}) => {
	// Créer un pari visible seulement par Alice (créateur)
	const aliceContext = await browser.newContext();
	const alicePage = await aliceContext.newPage();
	await login(alicePage, 'alice');
	await alicePage.goto(NEW_CLOSEST_URL);

	// Attendre l'hydratation Svelte initiale ($effect visibilitySelected)
	await expect(alicePage.getByRole('checkbox', { name: 'Alice (moi)' }).first()).toBeChecked();

	// Jury : Carol (checkbox avant les fill pour éviter race condition Svelte 5)
	await alicePage
		.getByTestId(`jury-member-${CAROL_ID}`)
		.getByRole('checkbox', { name: 'Carol' })
		.check();
	// Vérification pour laisser Svelte se stabiliser avant les fill
	await expect(
		alicePage.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox', { name: 'Carol' })
	).toBeChecked();

	// Ne cocher ni Bob ni Carol dans la visibilité
	await svelteFill(alicePage, 'input-title', '[E2E] Visible Alice seulement');
	// Vérifier que le titre a été rempli avant de soumettre
	await expect(alicePage.getByTestId('input-title')).toHaveValue('[E2E] Visible Alice seulement');
	await alicePage.getByTestId('input-stake-amount').fill('10');

	await alicePage.getByTestId('submit-btn').click();
	await alicePage.waitForURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	const betUrl = alicePage.url();
	const betId = betUrl.split('/bets/')[1];

	await aliceContext.close();

	// Bob est membre du groupe mais pas dans la liste de visibilité → 404 par URL directe
	const bobContext = await browser.newContext();
	const bobPage = await bobContext.newPage();
	await login(bobPage, 'bob');

	await bobPage.goto(`${GROUP_URL}/bets/${betId}`);
	await expect(bobPage.getByRole('heading', { name: '404' })).toBeVisible();

	// Bob ne voit pas le pari dans la liste du groupe
	await bobPage.goto(GROUP_URL);
	await expect(bobPage.getByText('[E2E] Visible Alice seulement')).not.toBeVisible();

	await bobContext.close();
});

// ─── Validations ─────────────────────────────────────────────────────────────

test('titre vide → erreur de validation', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);

	// Ne pas remplir le titre
	await page.getByTestId('input-stake-amount').fill('10');
	await page
		.getByTestId(`jury-member-${CAROL_ID}`)
		.getByRole('checkbox', { name: 'Carol' })
		.check();

	await page.getByTestId('submit-btn').click();

	// Le formulaire HTML5 bloque ou une erreur serveur s'affiche
	// En HTML5, required bloque la soumission côté client
	// On reste sur la page
	await expect(page).toHaveURL(NEW_CLOSEST_URL);
});

test('montant ≤ 0 → erreur serveur', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);

	// Attendre l'hydratation Svelte initiale ($effect visibilitySelected)
	await expect(page.getByRole('checkbox', { name: 'Alice (moi)' }).first()).toBeChecked();

	// Jury d'abord (checkbox avant fill pour éviter race condition Svelte 5)
	await page
		.getByTestId(`jury-member-${CAROL_ID}`)
		.getByRole('checkbox', { name: 'Carol' })
		.check();
	await expect(
		page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox', { name: 'Carol' })
	).toBeChecked();

	await svelteFill(page, 'input-title', '[E2E] Montant invalide');
	// Vérifier que le titre a bien été rempli avant de continuer
	await expect(page.getByTestId('input-title')).toHaveValue('[E2E] Montant invalide');

	// Bypasser la validation HTML5 min="0.01" en utilisant JS
	await page.evaluate(() => {
		const input = document.querySelector('[data-testid="input-stake-amount"]') as HTMLInputElement;
		if (input) {
			input.removeAttribute('min');
			input.value = '-5';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.dispatchEvent(new Event('change', { bubbles: true }));
		}
	});

	await page.getByTestId('submit-btn').click();

	// Erreur affichée
	await expect(page.getByTestId('form-error')).toBeVisible();
	await expect(page.getByTestId('form-error')).toContainText('supérieur à 0');
});

test('deadline passée → erreur serveur', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);

	// Attendre l'hydratation Svelte initiale ($effect visibilitySelected)
	await expect(page.getByRole('checkbox', { name: 'Alice (moi)' }).first()).toBeChecked();

	// Jury d'abord (checkbox avant fill pour éviter race condition Svelte 5)
	await page
		.getByTestId(`jury-member-${CAROL_ID}`)
		.getByRole('checkbox', { name: 'Carol' })
		.check();
	await expect(
		page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox', { name: 'Carol' })
	).toBeChecked();

	await svelteFill(page, 'input-title', '[E2E] Deadline passée');
	await expect(page.getByTestId('input-title')).toHaveValue('[E2E] Deadline passée');
	await page.getByTestId('input-stake-amount').fill('10');

	// Mettre une date dans le passé (bypasser le min HTML5)
	await page.evaluate(() => {
		const input = document.querySelector('[data-testid="input-deadline"]') as HTMLInputElement;
		if (input) {
			input.removeAttribute('min');
			input.value = '2020-01-01T10:00';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.dispatchEvent(new Event('change', { bubbles: true }));
		}
	});

	await page.getByTestId('submit-btn').click();

	// Erreur affichée
	await expect(page.getByTestId('form-error')).toBeVisible();
	await expect(page.getByTestId('form-error')).toContainText('futur');
});

test('jury vide → erreur serveur', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);

	// Attendre que Svelte ait fini l'hydratation ($effect initial sur visibilitySelected)
	// en vérifiant que la checkbox Alice est cochée (indique que $effect s'est exécuté)
	await expect(page.getByRole('checkbox', { name: 'Alice (moi)' }).first()).toBeChecked();

	// Pas de checkbox ici (test jury vide)
	await svelteFill(page, 'input-title', '[E2E] Jury vide');
	await page.getByTestId('input-stake-amount').fill('10');
	// Ne cocher aucun jury

	await page.getByTestId('submit-btn').click();

	// Erreur affichée
	await expect(page.getByTestId('form-error')).toBeVisible();
	await expect(page.getByTestId('form-error')).toContainText('jury');
});

// ─── Navigation ──────────────────────────────────────────────────────────────

test('lien « Annuler » renvoie vers le groupe', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);

	await page.getByRole('link', { name: 'Annuler' }).click();
	await expect(page).toHaveURL(GROUP_URL);
});

test('lien retour vers le groupe depuis la page détail', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);

	// Attendre l'hydratation Svelte initiale ($effect visibilitySelected)
	await expect(page.getByRole('checkbox', { name: 'Alice (moi)' }).first()).toBeChecked();

	// Jury d'abord (checkbox avant fill pour éviter race condition Svelte 5)
	await page
		.getByTestId(`jury-member-${CAROL_ID}`)
		.getByRole('checkbox', { name: 'Carol' })
		.check();
	// Vérification pour laisser Svelte se stabiliser avant les fill
	await expect(
		page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox', { name: 'Carol' })
	).toBeChecked();
	await svelteFill(page, 'input-title', '[E2E] Test retour');
	// Vérifier que le titre a bien été rempli
	await expect(page.getByTestId('input-title')).toHaveValue('[E2E] Test retour');
	await page.getByTestId('input-stake-amount').fill('5');

	await page.getByTestId('submit-btn').click();
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	await page.getByRole('link', { name: '← Retour au groupe' }).click();
	await expect(page).toHaveURL(GROUP_URL);
});

test('pari créé apparaît dans la liste du groupe pour Alice', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(NEW_CLOSEST_URL);

	// Attendre l'hydratation Svelte initiale ($effect visibilitySelected)
	await expect(page.getByRole('checkbox', { name: 'Alice (moi)' }).first()).toBeChecked();

	// Jury d'abord (checkbox avant fill pour éviter race condition Svelte 5)
	await page
		.getByTestId(`jury-member-${CAROL_ID}`)
		.getByRole('checkbox', { name: 'Carol' })
		.check();
	await expect(
		page.getByTestId(`jury-member-${CAROL_ID}`).getByRole('checkbox', { name: 'Carol' })
	).toBeChecked();
	await svelteFill(page, 'input-title', '[E2E] Pari dans la liste');
	await expect(page.getByTestId('input-title')).toHaveValue('[E2E] Pari dans la liste');
	await page.getByTestId('input-stake-amount').fill('15');

	await page.getByTestId('submit-btn').click();
	await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}/bets/[0-9a-f-]+`));

	// Retourner au groupe
	await page.goto(GROUP_URL);

	// Le pari apparaît dans la liste
	await expect(page.getByText('[E2E] Pari dans la liste')).toBeVisible();
});
