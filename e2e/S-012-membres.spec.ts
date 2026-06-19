/**
 * S-012 — Gestion des membres
 *
 * Critères d'acceptation :
 * 1. Page « Membres » : liste (avatar, pseudo, rôle, badge can_invite), visible par tous.
 * 2. Un membre peut quitter (confirmation) → soft-delete, disparaît de sa liste.
 * 3. L'admin peut exclure un membre (pas un autre admin) → soft-delete.
 * 4. L'admin peut promouvoir un membre en admin.
 * 5. Le dernier admin ne peut pas quitter sans promouvoir quelqu'un (message explicite).
 * 6. Un membre exclu qui accède aux pages du groupe par URL → 404.
 * 7. Les paris en cours d'un membre exclu restent listés (historique).
 *
 * Scénarios :
 * - Alice exclut Bob → Bob ne voit plus le groupe ; accès URL direct → refus.
 * - Bob re-rejoint via un nouveau lien → il retrouve le groupe (réactivation).
 * - Carol quitte le groupe d'elle-même.
 * - Alice seule admin tente de quitter → bloquée ; elle promeut Carol → peut quitter.
 * - Membre simple ne voit pas les boutons exclure/promouvoir (et l'action serveur refuse).
 */
import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers/auth';
import { db } from './helpers/db';

// Groupe seedé : Alice admin, Bob et Carol membres, Dave non-membre
const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;
const MEMBERS_URL = `${GROUP_URL}/members`;

// IDs des users seedés
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const DAVE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

/**
 * Remet un membre soft-deleted à l'état actif
 */
async function restoreMember(groupId: string, userId: string) {
	await db`UPDATE group_members SET removed_at = NULL WHERE group_id = ${groupId} AND user_id = ${userId}`;
}

/**
 * Remet le rôle d'un membre
 */
async function setRole(groupId: string, userId: string, role: 'admin' | 'member') {
	await db`UPDATE group_members SET role = ${role} WHERE group_id = ${groupId} AND user_id = ${userId}`;
}

/**
 * Supprime un membre de façon hard (pour nettoyer les membres ajoutés en test)
 */
async function hardDeleteMember(groupId: string, userId: string) {
	await db`DELETE FROM group_members WHERE group_id = ${groupId} AND user_id = ${userId}`;
}

/**
 * Crée une invitation en DB directement
 */
async function createTestInvitation(groupId: string, createdBy: string): Promise<string> {
	const token = crypto.randomUUID();
	await db`
		INSERT INTO group_invitations (group_id, token, created_by, expires_at, max_uses, revoked_at)
		VALUES (${groupId}, ${token}, ${createdBy}, NULL, NULL, NULL)
	`;
	return token;
}

test.describe('S-012 — Gestion des membres', () => {
	// Nettoyage global : restaurer l'état initial du groupe seedé
	test.afterEach(async () => {
		try {
			// Restaurer Bob et Carol s'ils ont été exclus
			await restoreMember(SEEDED_GROUP_ID, BOB_ID);
			await restoreMember(SEEDED_GROUP_ID, CAROL_ID);
			// Remettre Alice admin (au cas où elle aurait quitté ou Bob aurait été promu)
			await restoreMember(SEEDED_GROUP_ID, ALICE_ID);
			await setRole(SEEDED_GROUP_ID, ALICE_ID, 'admin');
			await setRole(SEEDED_GROUP_ID, BOB_ID, 'member');
			await setRole(SEEDED_GROUP_ID, CAROL_ID, 'member');
			// Retirer Dave s'il avait rejoint
			await db`UPDATE group_members SET removed_at = NOW() WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${DAVE_ID} AND removed_at IS NULL`;
		} catch {
			// Ignore cleanup errors
		}
	});

	// ─── Critère 1 : Page Membres visible par tous les membres ───────────────────

	test('Alice (admin) voit la page Membres avec la liste complète', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(MEMBERS_URL);

		// Titre de la page
		await expect(page.getByTestId('members-title')).toBeVisible();
		await expect(page.getByTestId('members-title')).toContainText('Membres');

		// Liste des membres
		const memberItems = page.getByTestId('member-item');
		await expect(memberItems).toHaveCount(3);

		// Vérifier les pseudos
		const pseudos = page.getByTestId('member-pseudo');
		await expect(pseudos.first()).toBeVisible();

		// Alice a le badge Admin
		const roleBadges = page.getByTestId('member-role-badge');
		await expect(roleBadges.first()).toBeVisible();
	});

	test('Alice voit son badge Admin et (vous) sur sa propre entrée', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(MEMBERS_URL);

		// Alice voit "(vous)" et son badge Admin
		await expect(page.getByTestId('member-pseudo').filter({ hasText: 'Alice' })).toContainText(
			'(vous)'
		);
		await expect(page.getByTestId('member-item').filter({ hasText: 'Alice' })).toContainText(
			'Admin'
		);
	});

	test('Bob (membre) peut voir la page Membres', async ({ page }) => {
		await login(page, 'bob');
		await page.goto(MEMBERS_URL);

		// Titre visible
		await expect(page.getByTestId('members-title')).toBeVisible();
		await expect(page.getByTestId('members-title')).toContainText('Membres');

		// Liste visible
		await expect(page.getByTestId('member-item').first()).toBeVisible();
	});

	test('La page Membres contient un lien retour vers la page groupe', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(MEMBERS_URL);

		// Lien de retour
		const backLink = page.getByRole('link', { name: /Les potes du test/ });
		await expect(backLink).toBeVisible();
		await expect(backLink).toHaveAttribute('href', GROUP_URL);
	});

	test('Le lien "Gérer les membres" est visible sur la page groupe (admin)', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(GROUP_URL);

		const membersLink = page.getByTestId('members-page-link');
		await expect(membersLink).toBeVisible();
		await expect(membersLink).toHaveAttribute('href', MEMBERS_URL);
	});

	// ─── Critère 2 : Membre peut quitter ─────────────────────────────────────────

	test('Carol peut quitter le groupe avec confirmation', async ({ page }) => {
		await login(page, 'carol');
		await page.goto(MEMBERS_URL);
		await page.waitForLoadState('networkidle');

		// Le bouton Quitter est visible
		await expect(page.getByTestId('leave-btn')).toBeVisible();

		// Cliquer sur Quitter → affiche la confirmation
		await page.getByTestId('leave-btn').click();

		// Le message de confirmation est visible
		await expect(page.getByTestId('confirm-leave-btn')).toBeVisible();
		await expect(page.getByTestId('cancel-leave-btn')).toBeVisible();

		// Confirmer
		await page.getByTestId('confirm-leave-btn').click();

		// Redirigée vers /app
		await expect(page).toHaveURL(/\/app$/);

		// Vérifier en DB que Carol est soft-deleted
		const rows = await db`
			SELECT removed_at FROM group_members
			WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${CAROL_ID}
		`;
		expect(rows).toHaveLength(1);
		expect(rows[0].removed_at).not.toBeNull();
	});

	test('Carol après avoir quitté ne voit plus le groupe dans sa liste', async ({ page }) => {
		// Setup : Carol quitte
		await db`UPDATE group_members SET removed_at = NOW() WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${CAROL_ID}`;

		await login(page, 'carol');
		await page.goto('/app');

		// La liste de groupes de Carol ne contient plus "Les potes du test"
		await expect(page.getByText('Les potes du test')).not.toBeVisible();
	});

	test('Le bouton Annuler sur la confirmation de départ annule', async ({ page }) => {
		await login(page, 'carol');
		await page.goto(MEMBERS_URL);
		await page.waitForLoadState('networkidle');

		await page.getByTestId('leave-btn').click();
		await expect(page.getByTestId('confirm-leave-btn')).toBeVisible();

		// Annuler
		await page.getByTestId('cancel-leave-btn').click();

		// Le bouton Quitter est de nouveau visible
		await expect(page.getByTestId('leave-btn')).toBeVisible();
		await expect(page.getByTestId('confirm-leave-btn')).not.toBeVisible();

		// Carol est toujours membre en DB
		const rows = await db`
			SELECT removed_at FROM group_members
			WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${CAROL_ID}
		`;
		expect(rows[0].removed_at).toBeNull();
	});

	// ─── Critère 3 : Admin peut exclure un membre ─────────────────────────────────

	test('Alice exclut Bob avec confirmation → Bob disparaît de la liste', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(MEMBERS_URL);
		await page.waitForLoadState('networkidle');

		// Le bouton Exclure de Bob est visible
		await expect(page.getByTestId(`kick-btn-${BOB_ID}`)).toBeVisible();

		// Cliquer sur Exclure → confirmation
		await page.getByTestId(`kick-btn-${BOB_ID}`).click();
		await expect(page.getByTestId(`confirm-kick-btn-${BOB_ID}`)).toBeVisible();

		// Confirmer l'exclusion
		await page.getByTestId(`confirm-kick-btn-${BOB_ID}`).click();

		// Message de succès
		await expect(page.getByTestId('members-success')).toBeVisible();

		// Bob n'est plus dans la liste
		await expect(page.getByTestId('members-title')).toContainText('Membres (2)');
		await expect(page.getByTestId('member-item').filter({ hasText: 'Bob' })).not.toBeVisible();

		// Vérifier en DB
		const rows = await db`
			SELECT removed_at FROM group_members
			WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${BOB_ID}
		`;
		expect(rows[0].removed_at).not.toBeNull();
	});

	test('Alice ne peut pas exclure un autre admin', async ({ page }) => {
		// Promouvoir Bob en admin d'abord
		await setRole(SEEDED_GROUP_ID, BOB_ID, 'admin');

		await login(page, 'alice');
		await page.goto(MEMBERS_URL);

		// Le bouton Exclure de Bob (maintenant admin) ne doit pas être visible
		await expect(page.getByTestId(`kick-btn-${BOB_ID}`)).not.toBeVisible();

		// Reset Bob to member
		await setRole(SEEDED_GROUP_ID, BOB_ID, 'member');
	});

	// ─── Critère 4 : Admin peut promouvoir un membre ─────────────────────────────

	test('Alice promeut Bob en admin', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(MEMBERS_URL);

		// Le bouton Promouvoir de Bob est visible
		await expect(page.getByTestId(`promote-btn-${BOB_ID}`)).toBeVisible();

		// Cliquer sur Promouvoir
		await page.getByTestId(`promote-btn-${BOB_ID}`).click();

		// Message de succès
		await expect(page.getByTestId('members-success-promoted')).toBeVisible();

		// Bob est maintenant admin
		await expect(page.getByTestId('member-item').filter({ hasText: 'Bob' })).toContainText('Admin');

		// Vérifier en DB
		const rows = await db`
			SELECT role FROM group_members
			WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${BOB_ID}
		`;
		expect(rows[0].role).toBe('admin');
	});

	test('Après promotion d\'un membre, le bouton Promouvoir disparaît pour lui', async ({
		page
	}) => {
		await login(page, 'alice');
		await page.goto(MEMBERS_URL);

		// Promouvoir Bob
		await page.getByTestId(`promote-btn-${BOB_ID}`).click();
		await expect(page.getByTestId('members-success-promoted')).toBeVisible();

		// Plus de bouton Promouvoir pour Bob
		await expect(page.getByTestId(`promote-btn-${BOB_ID}`)).not.toBeVisible();
	});

	// ─── Critère 5 : Dernier admin ne peut pas quitter ───────────────────────────

	test('Alice (dernier admin) voit le message de blocage et le bouton désactivé', async ({
		page
	}) => {
		await login(page, 'alice');
		await page.goto(MEMBERS_URL);

		// Message d'avertissement visible
		await expect(page.getByTestId('last-admin-warning')).toBeVisible();
		await expect(page.getByTestId('last-admin-warning')).toContainText('dernier admin');

		// Le bouton Quitter est désactivé
		await expect(page.getByTestId('leave-btn')).toBeDisabled();
	});

	test('Alice promeut Carol puis peut quitter le groupe', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(MEMBERS_URL);

		// Alice est le dernier admin → bouton désactivé
		await expect(page.getByTestId('leave-btn')).toBeDisabled();

		// Promouvoir Carol en admin
		await page.getByTestId(`promote-btn-${CAROL_ID}`).click();
		await expect(page.getByTestId('members-success-promoted')).toBeVisible();

		// Maintenant Alice peut quitter
		await expect(page.getByTestId('last-admin-warning')).not.toBeVisible();
		await expect(page.getByTestId('leave-btn')).not.toBeDisabled();

		// Alice clique sur Quitter (attendre que la page soit stable après la promotion)
		await page.waitForLoadState('networkidle');
		await page.getByTestId('leave-btn').click();
		await expect(page.getByTestId('confirm-leave-btn')).toBeVisible();

		// Confirme
		await page.getByTestId('confirm-leave-btn').click();

		// Redirigée vers /app
		await expect(page).toHaveURL(/\/app$/);

		// Vérifier en DB qu'Alice est soft-deleted
		const rows = await db`
			SELECT removed_at FROM group_members
			WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${ALICE_ID}
		`;
		expect(rows[0].removed_at).not.toBeNull();
	});

	test('Le serveur refuse que le dernier admin quitte (protection double)', async ({ page }) => {
		// Alice est le seul admin du groupe seedé
		await login(page, 'alice');

		// Tentative directe via action serveur
		const response = await page.evaluate(async (membersUrl) => {
			const r = await fetch(`${membersUrl}?/leave`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'x-sveltekit-action': 'true'
				},
				body: ''
			});
			const body = await r.json();
			return { httpStatus: r.status, type: body?.type, actionStatus: body?.status };
		}, MEMBERS_URL);

		// SvelteKit retourne 200 mais avec failure 400
		expect(response.httpStatus).toBe(200);
		expect(response.type).toBe('failure');

		// Alice est toujours admin en DB
		const rows = await db`
			SELECT removed_at FROM group_members
			WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${ALICE_ID}
		`;
		expect(rows[0].removed_at).toBeNull();
	});

	// ─── Critère 6 : Membre exclu bloqué à l'accès URL ───────────────────────────

	test('Bob exclu ne peut plus accéder à la page groupe', async ({ browser }) => {
		// Exclure Bob
		await db`UPDATE group_members SET removed_at = NOW() WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${BOB_ID}`;

		const context = await browser.newContext();
		const page = await context.newPage();

		await login(page, 'bob');
		await page.goto(GROUP_URL);

		// Bob voit une erreur 404
		await expect(page.getByRole('heading', { name: '404' })).toBeVisible();

		await context.close();
	});

	test('Bob exclu ne peut pas accéder à la page membres par URL directe', async ({ browser }) => {
		// Exclure Bob
		await db`UPDATE group_members SET removed_at = NOW() WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${BOB_ID}`;

		const context = await browser.newContext();
		const page = await context.newPage();

		await login(page, 'bob');
		await page.goto(MEMBERS_URL);

		// Bob voit une erreur 404
		await expect(page.getByRole('heading', { name: '404' })).toBeVisible();

		await context.close();
	});

	test('Dave (non-membre) ne peut pas accéder à la page membres', async ({ page }) => {
		await login(page, 'dave');
		await page.goto(MEMBERS_URL);

		// Dave voit une erreur 404
		await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
	});

	// ─── Scénario de réactivation via invitation ──────────────────────────────────

	test('Bob exclu peut re-rejoindre via un nouveau lien d\'invitation', async ({ browser }) => {
		// Exclure Bob
		await db`UPDATE group_members SET removed_at = NOW() WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${BOB_ID}`;

		// Créer un lien d'invitation
		const token = await createTestInvitation(SEEDED_GROUP_ID, ALICE_ID);

		// Bob utilise le lien
		const context = await browser.newContext();
		const page = await context.newPage();

		await login(page, 'bob');
		await page.goto(`/invite/${token}`);

		// Page d'invitation valide
		await expect(page.getByTestId('invite-join-btn')).toBeVisible();

		// Rejoindre
		await page.getByTestId('invite-join-btn').click();

		// Redirigé vers le groupe
		await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}`));

		// Vérifier en DB que Bob est de nouveau actif
		const rows = await db`
			SELECT removed_at, role FROM group_members
			WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${BOB_ID}
			AND removed_at IS NULL
		`;
		expect(rows).toHaveLength(1);

		await context.close();

		// Nettoyage de l'invitation
		await db`DELETE FROM group_invitations WHERE token = ${token}`;
	});

	// ─── Critère : Membre simple ne voit pas les boutons admin ────────────────────

	test('Bob (membre) ne voit pas les boutons Exclure et Promouvoir', async ({ page }) => {
		await login(page, 'bob');
		await page.goto(MEMBERS_URL);

		// Aucun bouton Exclure ou Promouvoir visible
		await expect(page.getByTestId(`kick-btn-${CAROL_ID}`)).not.toBeVisible();
		await expect(page.getByTestId(`promote-btn-${CAROL_ID}`)).not.toBeVisible();
		await expect(page.getByTestId(`kick-btn-${ALICE_ID}`)).not.toBeVisible();
		await expect(page.getByTestId(`promote-btn-${ALICE_ID}`)).not.toBeVisible();
	});

	test('Membre sans droits admin : action kick refusée par le serveur', async ({ page }) => {
		await login(page, 'bob');

		const response = await page.evaluate(
			async ({ membersUrl, carolId }) => {
				const r = await fetch(`${membersUrl}?/kick`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'x-sveltekit-action': 'true'
					},
					body: `targetUserId=${carolId}`
				});
				const body = await r.json();
				return { httpStatus: r.status, type: body?.type, actionStatus: body?.status };
			},
			{ membersUrl: MEMBERS_URL, carolId: CAROL_ID }
		);

		// Doit être refusé
		expect(response.httpStatus).toBe(200);
		expect(response.type).toBe('failure');

		// Carol est toujours membre en DB
		const rows = await db`
			SELECT removed_at FROM group_members
			WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${CAROL_ID}
		`;
		expect(rows[0].removed_at).toBeNull();
	});

	test('Membre sans droits admin : action promote refusée par le serveur', async ({ page }) => {
		await login(page, 'bob');

		const response = await page.evaluate(
			async ({ membersUrl, carolId }) => {
				const r = await fetch(`${membersUrl}?/promote`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'x-sveltekit-action': 'true'
					},
					body: `targetUserId=${carolId}`
				});
				const body = await r.json();
				return { httpStatus: r.status, type: body?.type, actionStatus: body?.status };
			},
			{ membersUrl: MEMBERS_URL, carolId: CAROL_ID }
		);

		// Doit être refusé
		expect(response.httpStatus).toBe(200);
		expect(response.type).toBe('failure');

		// Carol est toujours membre (pas admin) en DB
		const rows = await db`
			SELECT role FROM group_members
			WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${CAROL_ID}
		`;
		expect(rows[0].role).toBe('member');
	});

	// ─── Guards d'authentification ────────────────────────────────────────────────

	test('Accès sans session → redirection /login', async ({ page }) => {
		await page.goto(MEMBERS_URL);
		await expect(page).toHaveURL(/\/login/);
	});

	// ─── Badge can_invite ─────────────────────────────────────────────────────────

	test('Un membre avec can_invite affiche le badge "Peut inviter"', async ({ page }) => {
		// Donner can_invite à Bob
		await db`UPDATE group_members SET can_invite = true WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${BOB_ID}`;

		await login(page, 'alice');
		await page.goto(MEMBERS_URL);

		// Bob a le badge can_invite
		const bobItem = page.getByTestId('member-item').filter({ hasText: 'Bob' });
		await expect(bobItem.getByTestId('member-can-invite-badge')).toBeVisible();
		await expect(bobItem.getByTestId('member-can-invite-badge')).toHaveText('Peut inviter');

		// Nettoyage
		await db`UPDATE group_members SET can_invite = false WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${BOB_ID}`;
	});
});
