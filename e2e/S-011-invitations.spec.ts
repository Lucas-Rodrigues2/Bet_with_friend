/**
 * S-011 — Liens d'invitation + droit délégable
 *
 * Critères d'acceptation :
 * 1. Admin ou can_invite → bouton Inviter visible + formulaire fonctionnel
 * 2. Membre sans can_invite → bouton masqué ET action refuse (403)
 * 3. Admin peut toggler can_invite par membre
 * 4. /invite/[token] connecté → rejoindre → redirigé vers groupe
 * 5. Non connecté → redirect login + redirectTo → retour sur invitation
 * 6. Lien expiré/épuisé/révoqué → page "lien invalide"
 * 7. Déjà membre → redirect direct vers le groupe
 * 8. Admin peut révoquer un lien
 *
 * Scénarios :
 * - Alice (admin) génère un lien → Dave l'ouvre → visible dans membres
 * - Lien max_uses=1 : Dave rejoint, Carol obtient "lien invalide"
 * - Lien révoqué → "lien invalide"
 * - Bob (membre) ne voit pas le bouton Inviter
 * - Non connecté ouvre /invite/[token] → redirect login → retour sur invitation
 *
 * CORRECTIF : L'action toggleCanInvite utilisait z.string().uuid() qui rejetait
 * les UUIDs seedés (aaaaaaaa-..., bbbbbbbb-...) car Zod v4 exige version UUID
 * 1-8 dans le 3ème groupe. Corrigé en remplaçant par z.string().regex(...).
 */
import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers/auth';
import { db } from './helpers/db';

// Groupe seedé : Alice admin, Bob et Carol membres, Dave non-membre
const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;

// IDs des users seedés
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

/**
 * Helper : crée une invitation en DB directement (bypass UI pour vitesse)
 */
async function createTestInvitation(opts: {
	groupId: string;
	createdBy: string;
	expiresAt?: Date | null;
	maxUses?: number | null;
	revokedAt?: Date | null;
}): Promise<string> {
	const token = crypto.randomUUID();
	await db`
    INSERT INTO group_invitations (group_id, token, created_by, expires_at, max_uses, revoked_at)
    VALUES (
      ${opts.groupId},
      ${token},
      ${opts.createdBy},
      ${opts.expiresAt ?? null},
      ${opts.maxUses ?? null},
      ${opts.revokedAt ?? null}
    )
  `;
	return token;
}

/**
 * Helper : nettoie les invitations et membres de test
 */
async function cleanInvitations(groupId: string) {
	await db`DELETE FROM group_invitations WHERE group_id = ${groupId}`;
}

async function removeMemberFromGroup(groupId: string, userId: string) {
	await db`DELETE FROM group_members WHERE group_id = ${groupId} AND user_id = ${userId}`;
}

async function resetCanInvite(groupId: string, userId: string) {
	await db`UPDATE group_members SET can_invite = false WHERE group_id = ${groupId} AND user_id = ${userId}`;
}

test.describe('S-011 — Liens d\'invitation + droit délégable', () => {
	// Nettoyage global après tous les tests
	test.afterAll(async () => {
		try {
			await cleanInvitations(SEEDED_GROUP_ID);
			// Remettre Dave hors du groupe seedé s'il avait rejoint
			await removeMemberFromGroup(SEEDED_GROUP_ID, 'dddddddd-dddd-dddd-dddd-dddddddddddd');
			// Reset can_invite pour les membres seedés
			await resetCanInvite(SEEDED_GROUP_ID, BOB_ID);
			await resetCanInvite(SEEDED_GROUP_ID, 'cccccccc-cccc-cccc-cccc-cccccccccccc');
		} catch {
			// Ignore cleanup errors
		}
	});

	// ─── Bouton Inviter : visibilité selon le rôle ───────────────────────────────

	test('Alice (admin) voit le bouton Inviter sur la page du groupe', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(GROUP_URL);

		await expect(page.getByTestId('invite-btn')).toBeVisible();
	});

	test('Bob (membre sans can_invite) ne voit pas le bouton Inviter', async ({ page }) => {
		// S'assurer que Bob n'a pas can_invite
		await resetCanInvite(SEEDED_GROUP_ID, BOB_ID);

		await login(page, 'bob');
		await page.goto(GROUP_URL);

		// Le bouton Inviter ne doit pas être visible
		await expect(page.getByTestId('invite-btn')).not.toBeVisible();

		// La section Liens d'invitation non plus
		await expect(page.getByTestId('invitations-section')).not.toBeVisible();
	});

	// ─── Formulaire de création d'invitation ─────────────────────────────────────

	test('Alice ouvre le formulaire d\'invitation avec expiration et max_uses', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(GROUP_URL);
		await page.waitForLoadState('networkidle');

		// Cliquer sur le bouton Inviter
		await page.getByTestId('invite-btn').click();

		// Le formulaire doit être visible
		await expect(page.getByTestId('invite-form')).toBeVisible();

		// Les champs expiration et max_uses doivent être présents
		await expect(page.getByTestId('invite-expiration')).toBeVisible();
		await expect(page.getByTestId('invite-max-uses')).toBeVisible();

		// Options d'expiration
		await expect(page.getByTestId('invite-expiration')).toHaveValue('never');
		// Options max_uses
		await expect(page.getByTestId('invite-max-uses')).toHaveValue('unlimited');

		// Bouton de création
		await expect(page.getByTestId('create-invite-btn')).toBeVisible();
	});

	test('Alice génère un lien d\'invitation illimité et le voit dans la liste', async ({
		page
	}) => {
		await cleanInvitations(SEEDED_GROUP_ID);

		await login(page, 'alice');
		await page.goto(GROUP_URL);
		await page.waitForLoadState('networkidle');

		// Ouvrir le formulaire
		await page.getByTestId('invite-btn').click();
		await expect(page.getByTestId('invite-form')).toBeVisible();

		// Soumettre avec les valeurs par défaut (jamais / illimité)
		await page.getByTestId('create-invite-btn').click();

		// Le lien créé doit apparaître
		await expect(page.getByTestId('new-invite-link')).toBeVisible();
		const linkInput = page.getByTestId('invite-link-input');
		await expect(linkInput).toBeVisible();

		// Le lien doit pointer vers /invite/[token]
		const linkValue = await linkInput.inputValue();
		expect(linkValue).toMatch(/\/invite\/[0-9a-f-]{36}/);

		// Le bouton copier doit être visible
		await expect(page.getByTestId('copy-invite-btn')).toBeVisible();

		// La liste des invitations doit contenir un élément actif
		await expect(page.getByTestId('invitations-list')).toBeVisible();
		await expect(page.getByTestId('invitation-item').first()).toBeVisible();
		await expect(page.getByTestId('invite-status-badge').first()).toHaveText('Actif');
	});

	test('Alice génère un lien avec expiration 24h', async ({ page }) => {
		await cleanInvitations(SEEDED_GROUP_ID);

		await login(page, 'alice');
		await page.goto(GROUP_URL);
		await page.waitForLoadState('networkidle');

		await page.getByTestId('invite-btn').click();
		await expect(page.getByTestId('invite-form')).toBeVisible();

		// Sélectionner 24h
		await page.getByTestId('invite-expiration').selectOption('24h');

		await page.getByTestId('create-invite-btn').click();

		// Le lien doit être créé
		await expect(page.getByTestId('new-invite-link')).toBeVisible();

		// Vérifier en DB que expires_at est bien défini
		const rows = await db`SELECT expires_at FROM group_invitations WHERE group_id = ${SEEDED_GROUP_ID}`;
		expect(rows).toHaveLength(1);
		expect(rows[0].expires_at).not.toBeNull();
		const expiresAt = new Date(rows[0].expires_at);
		const now = new Date();
		// expires_at doit être dans ~24h (tolérance 5 min)
		const diffHours = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
		expect(diffHours).toBeGreaterThan(23.9);
		expect(diffHours).toBeLessThan(24.1);
	});

	test('Alice génère un lien avec max_uses=1', async ({ page }) => {
		await cleanInvitations(SEEDED_GROUP_ID);

		await login(page, 'alice');
		await page.goto(GROUP_URL);
		await page.waitForLoadState('networkidle');

		await page.getByTestId('invite-btn').click();
		await expect(page.getByTestId('invite-form')).toBeVisible();

		// Sélectionner 1 utilisation
		await page.getByTestId('invite-max-uses').selectOption('1');

		await page.getByTestId('create-invite-btn').click();

		// Le lien doit être créé
		await expect(page.getByTestId('new-invite-link')).toBeVisible();

		// Vérifier en DB
		const rows =
			await db`SELECT max_uses FROM group_invitations WHERE group_id = ${SEEDED_GROUP_ID}`;
		expect(rows).toHaveLength(1);
		expect(rows[0].max_uses).toBe(1);
	});

	// ─── Page /invite/[token] : utilisateur connecté ─────────────────────────────

	test('/invite/[token] valide → affiche le nom du groupe et le bouton Rejoindre', async ({
		page
	}) => {
		const token = await createTestInvitation({
			groupId: SEEDED_GROUP_ID,
			createdBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
		});

		await login(page, 'alice');
		await page.goto(`/invite/${token}`);

		// Nom du groupe visible
		await expect(page.getByTestId('invite-group-name')).toBeVisible();
		await expect(page.getByTestId('invite-group-name')).toContainText('Les potes du test');

		// Bouton Rejoindre visible
		await expect(page.getByTestId('invite-join-btn')).toBeVisible();
		await expect(page.getByTestId('invite-join-btn')).toHaveText('Rejoindre le groupe');
	});

	test('Dave rejoindre via un lien → redirigé vers le groupe, visible dans membres', async ({
		page
	}) => {
		// S'assurer que Dave n'est pas membre du groupe seedé
		await removeMemberFromGroup(SEEDED_GROUP_ID, 'dddddddd-dddd-dddd-dddd-dddddddddddd');

		const token = await createTestInvitation({
			groupId: SEEDED_GROUP_ID,
			createdBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
		});

		await login(page, 'dave');
		await page.goto(`/invite/${token}`);

		// Page d'invitation valide
		await expect(page.getByTestId('invite-join-btn')).toBeVisible();

		// Rejoindre le groupe
		await page.getByTestId('invite-join-btn').click();

		// Redirigé vers le groupe
		await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}`));

		// Dave est maintenant visible dans la liste des membres
		await expect(page.getByTestId('group-name')).toHaveText('Les potes du test');
		const memberItems = page.getByTestId('member-item');
		await expect(memberItems).toHaveCount(4);

		// Vérifier en DB
		const rows =
			await db`SELECT role FROM group_members WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' AND removed_at IS NULL`;
		expect(rows).toHaveLength(1);
		expect(rows[0].role).toBe('member');

		// Vérifier que uses_count a été incrémenté
		const invRows = await db`SELECT uses_count FROM group_invitations WHERE token = ${token}`;
		expect(invRows[0].uses_count).toBe(1);

		// Nettoyage : retirer Dave du groupe
		await removeMemberFromGroup(SEEDED_GROUP_ID, 'dddddddd-dddd-dddd-dddd-dddddddddddd');
	});

	test('Déjà membre clique sur un lien → redirigé directement vers le groupe', async ({
		page
	}) => {
		const token = await createTestInvitation({
			groupId: SEEDED_GROUP_ID,
			createdBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
		});

		// Bob est déjà membre du groupe seedé
		await login(page, 'bob');
		await page.goto(`/invite/${token}`);

		// Bob clique sur Rejoindre (il est déjà membre)
		await expect(page.getByTestId('invite-join-btn')).toBeVisible();
		await page.getByTestId('invite-join-btn').click();

		// Redirigé directement vers le groupe (déjà membre → redirect immédiat)
		await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}`));
	});

	// ─── Page /invite/[token] : token invalide ────────────────────────────────────

	test('Token inexistant → page "lien invalide"', async ({ page }) => {
		await login(page, 'alice');
		await page.goto('/invite/00000000-0000-4000-a000-000000000000');

		await expect(page.getByTestId('invite-invalid-title')).toBeVisible();
		await expect(page.getByTestId('invite-invalid-title')).toHaveText('Lien invalide');
		await expect(page.getByTestId('invite-invalid-message')).toContainText('introuvable ou invalide');
	});

	test('Token révoqué → page "lien invalide"', async ({ page }) => {
		const token = await createTestInvitation({
			groupId: SEEDED_GROUP_ID,
			createdBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			revokedAt: new Date()
		});

		await login(page, 'alice');
		await page.goto(`/invite/${token}`);

		await expect(page.getByTestId('invite-invalid-title')).toBeVisible();
		await expect(page.getByTestId('invite-invalid-title')).toHaveText('Lien invalide');
		await expect(page.getByTestId('invite-invalid-message')).toContainText('révoqué');
	});

	test('Token expiré → page "lien invalide"', async ({ page }) => {
		const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // il y a 24h
		const token = await createTestInvitation({
			groupId: SEEDED_GROUP_ID,
			createdBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			expiresAt: pastDate
		});

		await login(page, 'alice');
		await page.goto(`/invite/${token}`);

		await expect(page.getByTestId('invite-invalid-title')).toBeVisible();
		await expect(page.getByTestId('invite-invalid-message')).toContainText('expiré');
	});

	test('Token épuisé (max_uses atteint) → page "lien invalide"', async ({ page }) => {
		// Créer un lien max_uses=1 et déjà utilisé 1 fois
		const token = await createTestInvitation({
			groupId: SEEDED_GROUP_ID,
			createdBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			maxUses: 1
		});
		// Marquer comme utilisé
		await db`UPDATE group_invitations SET uses_count = 1 WHERE token = ${token}`;

		await login(page, 'alice');
		await page.goto(`/invite/${token}`);

		await expect(page.getByTestId('invite-invalid-title')).toBeVisible();
		await expect(page.getByTestId('invite-invalid-message')).toContainText('limite');
	});

	test('Lien avec max_uses=1 : Dave rejoint, Carol obtient "lien invalide"', async ({
		browser
	}) => {
		// S'assurer que Dave n'est pas membre
		await removeMemberFromGroup(SEEDED_GROUP_ID, 'dddddddd-dddd-dddd-dddd-dddddddddddd');

		const token = await createTestInvitation({
			groupId: SEEDED_GROUP_ID,
			createdBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			maxUses: 1
		});

		// Dave rejoint avec le lien
		const contextDave = await browser.newContext();
		const pageDave = await contextDave.newPage();
		await login(pageDave, 'dave');
		await pageDave.goto(`/invite/${token}`);
		await expect(pageDave.getByTestId('invite-join-btn')).toBeVisible();
		await pageDave.getByTestId('invite-join-btn').click();
		await expect(pageDave).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}`));
		await contextDave.close();

		// Carol essaie d'utiliser le même lien → lien invalide (épuisé)
		const contextCarol = await browser.newContext();
		const pageCarol = await contextCarol.newPage();
		await login(pageCarol, 'carol');
		await pageCarol.goto(`/invite/${token}`);
		await expect(pageCarol.getByTestId('invite-invalid-title')).toBeVisible();
		await expect(pageCarol.getByTestId('invite-invalid-message')).toContainText('limite');
		await contextCarol.close();

		// Nettoyage
		await removeMemberFromGroup(SEEDED_GROUP_ID, 'dddddddd-dddd-dddd-dddd-dddddddddddd');
	});

	// ─── Non connecté → redirect login + redirectTo ───────────────────────────────

	test('Visiteur non connecté → redirigé vers login avec redirectTo', async ({ page }) => {
		const token = await createTestInvitation({
			groupId: SEEDED_GROUP_ID,
			createdBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
		});

		// Naviguer sans session
		await page.goto(`/invite/${token}`);

		// Doit être redirigé vers /login avec le bon redirectTo
		await expect(page).toHaveURL(new RegExp(`/login\\?redirectTo=.*invite.*${token}`));
	});

	test('Visiteur non connecté → après login, retour sur la page d\'invitation', async ({
		page
	}) => {
		const token = await createTestInvitation({
			groupId: SEEDED_GROUP_ID,
			createdBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
		});

		// Naviguer sans session → redirect vers login
		await page.goto(`/invite/${token}`);
		await expect(page).toHaveURL(new RegExp('/login'));

		// Se connecter
		await page.getByRole('textbox', { name: 'Adresse email' }).fill(USERS.alice.email);
		await page.getByRole('textbox', { name: 'Mot de passe' }).fill(USERS.alice.password);
		await page.getByRole('button', { name: /se connecter/i }).click();

		// Doit revenir sur la page d'invitation (redirectTo)
		await expect(page).toHaveURL(new RegExp(`/invite/${token}`));

		// La page d'invitation doit être affichée
		await expect(page.getByTestId('invite-join-btn')).toBeVisible();
	});

	// ─── Révocation d'un lien ──────────────────────────────────────────────────────

	test('Admin peut révoquer un lien actif', async ({ page }) => {
		await cleanInvitations(SEEDED_GROUP_ID);

		const token = await createTestInvitation({
			groupId: SEEDED_GROUP_ID,
			createdBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
		});

		await login(page, 'alice');
		await page.goto(GROUP_URL);

		// La liste des invitations doit être visible
		await expect(page.getByTestId('invitations-list')).toBeVisible();
		await expect(page.getByTestId('invite-status-badge').first()).toHaveText('Actif');

		// Bouton Révoquer visible
		await expect(page.getByTestId('revoke-invite-btn').first()).toBeVisible();

		// Révoquer le lien
		await page.getByTestId('revoke-invite-btn').first().click();

		// Le lien doit maintenant être inactif
		await expect(page.getByTestId('invite-status-badge').first()).toHaveText('Inactif');
		await expect(page.getByTestId('revoke-invite-btn')).not.toBeVisible();

		// Vérifier en DB
		const rows = await db`SELECT revoked_at FROM group_invitations WHERE token = ${token}`;
		expect(rows[0].revoked_at).not.toBeNull();
	});

	test('Lien révoqué → visiter l\'URL → page "lien invalide"', async ({ page }) => {
		const token = await createTestInvitation({
			groupId: SEEDED_GROUP_ID,
			createdBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			revokedAt: new Date()
		});

		await login(page, 'alice');
		await page.goto(`/invite/${token}`);

		await expect(page.getByTestId('invite-invalid-title')).toHaveText('Lien invalide');
		await expect(page.getByTestId('invite-invalid-message')).toContainText('révoqué');
	});

	// ─── Bob (membre sans can_invite) : action serveur refuse (403) ──────────────

	test('Membre sans can_invite : action createInvite refusée (403)', async ({ page }) => {
		// S'assurer que Bob n'a pas can_invite
		await resetCanInvite(SEEDED_GROUP_ID, BOB_ID);

		await login(page, 'bob');

		// Tenter l'action directement (bypass UI)
		// Note: SvelteKit form actions retournent HTTP 200 mais avec {type: "failure", status: 403}
		const response = await page.evaluate(async (groupId) => {
			const r = await fetch(`/app/groups/${groupId}?/createInvite`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'x-sveltekit-action': 'true'
				},
				body: 'expiration=never&maxUses=unlimited'
			});
			const body = await r.json();
			return { httpStatus: r.status, actionStatus: body?.status, type: body?.type };
		}, SEEDED_GROUP_ID);

		// SvelteKit retourne HTTP 200 mais le status d'action est 403 (refusé)
		expect(response.httpStatus).toBe(200);
		expect(response.type).toBe('failure');
		expect(response.actionStatus).toBe(403);
	});

	// ─── Toggle can_invite ─────────────────────────────────────────────────────────

	test(
		'Admin peut toggler can_invite (fix: Zod regex accepte les UUIDs seedés)',
		async ({ page }) => {
			// Anciennement documenté comme BUG : z.string().uuid() dans Zod v4 rejetait les UUIDs seedés
			// (bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb). Corrigé en remplaçant par z.string().regex(...)
			await resetCanInvite(SEEDED_GROUP_ID, BOB_ID);

			await login(page, 'alice');

			// Naviguer vers la page du groupe pour obtenir un formulaire valide avec cookies
			await page.goto(GROUP_URL);
			await page.waitForLoadState('networkidle');

			// Cliquer sur le bouton toggle can_invite de Bob via l'UI
			const toggleBtn = page.getByTestId(`toggle-can-invite-${BOB_ID}`);
			await expect(toggleBtn).toBeVisible();
			await expect(toggleBtn).toHaveText('Ne peut pas inviter');

			// Intercepter la requête pour s'assurer qu'elle aboutit
			const responsePromise = page.waitForResponse(
				(resp) => resp.url().includes('toggleCanInvite') && resp.status() === 200
			);

			// Cliquer sur le toggle
			await toggleBtn.click();

			// Attendre la réponse du serveur
			const resp = await responsePromise;
			const respBody = await resp.json();

			// La réponse doit indiquer un succès (pas de failure)
			expect(respBody.type).not.toBe('failure');

			// Attendre que l'UI se mette à jour
			await page.waitForLoadState('networkidle');

			// Le bouton doit maintenant afficher "Peut inviter"
			await expect(page.getByTestId(`toggle-can-invite-${BOB_ID}`)).toHaveText('Peut inviter');

			// Vérifier en DB que can_invite a bien été mis à true
			const rows =
				await db`SELECT can_invite FROM group_members WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${BOB_ID}`;
			expect(rows[0].can_invite).toBe(true);

			// Nettoyage
			await resetCanInvite(SEEDED_GROUP_ID, BOB_ID);
		}
	);

	test('La section Liens d\'invitation est visible pour un membre avec can_invite (DB direct)', async ({
		page
	}) => {
		// Donner can_invite à Bob directement en DB (bypass l'action serveur bugguée)
		await db`UPDATE group_members SET can_invite = true WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${BOB_ID}`;

		await login(page, 'bob');
		await page.goto(GROUP_URL);

		// Bob avec can_invite doit voir le bouton Inviter
		await expect(page.getByTestId('invite-btn')).toBeVisible();

		// Et la section invitations
		await expect(page.getByTestId('invitations-section')).toBeVisible();

		// Nettoyage
		await resetCanInvite(SEEDED_GROUP_ID, BOB_ID);
	});

	test('Membre avec can_invite peut créer un lien d\'invitation', async ({ page }) => {
		// Donner can_invite à Bob directement en DB
		await db`UPDATE group_members SET can_invite = true WHERE group_id = ${SEEDED_GROUP_ID} AND user_id = ${BOB_ID}`;
		// S'assurer que les invitations précédentes sont nettoyées
		await cleanInvitations(SEEDED_GROUP_ID);

		await login(page, 'bob');
		await page.goto(GROUP_URL);
		await page.waitForLoadState('networkidle');

		// Ouvrir le formulaire
		await page.getByTestId('invite-btn').click();
		await expect(page.getByTestId('invite-form')).toBeVisible();

		// Soumettre
		await page.getByTestId('create-invite-btn').click();

		// Un lien doit être créé
		await expect(page.getByTestId('new-invite-link')).toBeVisible();

		// Nettoyage
		await resetCanInvite(SEEDED_GROUP_ID, BOB_ID);
		await cleanInvitations(SEEDED_GROUP_ID);
	});

	// ─── Affichage UI du toggle can_invite ────────────────────────────────────────

	test('Alice voit les boutons can_invite pour les membres non-admin', async ({ page }) => {
		await login(page, 'alice');
		await page.goto(GROUP_URL);

		// Bob et Carol ne sont pas admin → Alice voit les boutons toggle
		await expect(page.getByTestId(`toggle-can-invite-${BOB_ID}`)).toBeVisible();
		await expect(page.getByTestId(`toggle-can-invite-cccccccc-cccc-cccc-cccc-cccccccccccc`)).toBeVisible();

		// Le texte indique "Ne peut pas inviter" pour les membres sans can_invite
		await expect(page.getByTestId(`toggle-can-invite-${BOB_ID}`)).toHaveText('Ne peut pas inviter');
	});

	test('Bob (membre) ne voit pas les boutons toggle can_invite', async ({ page }) => {
		await login(page, 'bob');
		await page.goto(GROUP_URL);

		// Bob ne peut pas modifier les droits des autres
		await expect(page.getByTestId(`toggle-can-invite-${BOB_ID}`)).not.toBeVisible();
	});

	// ─── Copie du lien ────────────────────────────────────────────────────────────

	test('Le bouton copier dans la liste des invitations est visible pour les liens actifs', async ({
		page
	}) => {
		await cleanInvitations(SEEDED_GROUP_ID);

		const token = await createTestInvitation({
			groupId: SEEDED_GROUP_ID,
			createdBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
		});

		await login(page, 'alice');
		await page.goto(GROUP_URL);

		// Liste d'invitations avec le lien actif
		await expect(page.getByTestId('invitations-list')).toBeVisible();

		// Le bouton copier doit être visible pour le lien actif
		await expect(page.getByTestId('copy-existing-invite-btn').first()).toBeVisible();

		// Le champ URL doit contenir le bon lien
		const urlField = page.locator('[data-testid="invite-url-field"]').first();
		await expect(urlField).toHaveValue(new RegExp(`/invite/${token}`));
	});

	// ─── Sécurité : non-membre ne peut pas utiliser les actions d'invitation ──────

	test('Dave (non-membre) ne peut pas créer un lien via l\'action serveur', async ({ page }) => {
		await login(page, 'dave');

		// Note: SvelteKit form actions retournent HTTP 200 mais avec {type: "failure", status: 403}
		const response = await page.evaluate(async (groupId) => {
			const r = await fetch(`/app/groups/${groupId}?/createInvite`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'x-sveltekit-action': 'true'
				},
				body: 'expiration=never&maxUses=unlimited'
			});
			const body = await r.json();
			return { httpStatus: r.status, actionStatus: body?.status, type: body?.type };
		}, SEEDED_GROUP_ID);

		// SvelteKit retourne HTTP 200 mais le status d'action est 403 (accès refusé pour non-membre)
		expect(response.httpStatus).toBe(200);
		expect(response.type).toBe('failure');
		expect(response.actionStatus).toBe(403);
	});
});
