/**
 * S-011 — Tracking PostHog (liens d'invitation)
 *
 * Events instrumentés dans cette story :
 *   - invitation_created { group_id, expiration, max_uses }
 *       (serveur, action createInvite après transaction DB réussie)
 *   - invitation_revoked { group_id, invitation_id }
 *       (serveur, action revokeInvite après transaction DB réussie)
 *   - group_joined_via_invite { group_id, group_name }
 *       (serveur, action join de /invite/[token] après entrée dans le groupe)
 *   - invite_link_copied { group_id }
 *       (client, bouton "Copier" dans la page groupe)
 *
 * Ce spec vérifie :
 *   1. invitation_created est bien inséré dans le sink DB avec le bon distinct_id et les bonnes properties.
 *   2. invitation_revoked est bien inséré dans le sink DB avec le bon distinct_id et properties.
 *   3. group_joined_via_invite est bien inséré dans le sink DB avec le bon distinct_id et properties.
 *   4. invite_link_copied est bien capturé par le spy client (window.__playwright_trackSpy).
 */
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';
import { interceptPosthog, readServerEvents, clearServerEvents } from './helpers/analytics';

// IDs seedés
const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DAVE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// Groupe seedé : Alice admin, Bob et Carol membres, Dave non-membre
const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const GROUP_URL = `/app/groups/${SEEDED_GROUP_ID}`;

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

async function cleanInvitations(groupId: string) {
	await db`DELETE FROM group_invitations WHERE group_id = ${groupId}`;
}

async function removeMemberFromGroup(groupId: string, userId: string) {
	await db`DELETE FROM group_members WHERE group_id = ${groupId} AND user_id = ${userId}`;
}

test.describe('S-011 — Tracking PostHog invitations', () => {
	test.beforeEach(async () => {
		await clearServerEvents(db);
	});

	test.afterAll(async () => {
		await clearServerEvents(db);
		try {
			await cleanInvitations(SEEDED_GROUP_ID);
			await removeMemberFromGroup(SEEDED_GROUP_ID, DAVE_ID);
		} catch {
			// Ignore cleanup errors
		}
	});

	// ─── Event serveur : invitation_created ──────────────────────────────────────

	test('invitation_created — event serveur émis après création de lien (expiration=never, unlimited)', async ({
		page
	}) => {
		await cleanInvitations(SEEDED_GROUP_ID);

		await login(page, 'alice');
		await page.goto(GROUP_URL);
		await page.waitForLoadState('networkidle');

		// Ouvrir le formulaire et créer un lien avec les valeurs par défaut
		await page.getByTestId('invite-btn').click();
		await expect(page.getByTestId('invite-form')).toBeVisible();
		await page.getByTestId('create-invite-btn').click();

		// Attendre la réponse (lien créé)
		await expect(page.getByTestId('new-invite-link')).toBeVisible();

		const events = await readServerEvents(db, { event: 'invitation_created', distinctId: ALICE_ID });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1];
		expect(ev.event).toBe('invitation_created');
		expect(ev.distinct_id).toBe(ALICE_ID);

		const props = ev.properties as Record<string, unknown>;
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
		expect(props['expiration']).toBe('never');
		expect(props['max_uses']).toBeNull();
	});

	test('invitation_created — event serveur avec expiration 24h et max_uses=1', async ({
		page
	}) => {
		await cleanInvitations(SEEDED_GROUP_ID);

		await login(page, 'alice');
		await page.goto(GROUP_URL);
		await page.waitForLoadState('networkidle');

		await page.getByTestId('invite-btn').click();
		await expect(page.getByTestId('invite-form')).toBeVisible();

		await page.getByTestId('invite-expiration').selectOption('24h');
		await page.getByTestId('invite-max-uses').selectOption('1');

		await page.getByTestId('create-invite-btn').click();
		await expect(page.getByTestId('new-invite-link')).toBeVisible();

		const events = await readServerEvents(db, { event: 'invitation_created', distinctId: ALICE_ID });
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1];
		const props = ev.properties as Record<string, unknown>;
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
		expect(props['expiration']).toBe('24h');
		expect(props['max_uses']).toBe(1);
	});

	// ─── Event serveur : invitation_revoked ──────────────────────────────────────

	test('invitation_revoked — event serveur émis après révocation d\'un lien', async ({
		page
	}) => {
		await cleanInvitations(SEEDED_GROUP_ID);

		// Créer un lien via DB directement pour avoir un ID connu
		const token = await createTestInvitation({
			groupId: SEEDED_GROUP_ID,
			createdBy: ALICE_ID
		});

		// Récupérer l'ID de l'invitation en DB
		const invRows =
			await db`SELECT id FROM group_invitations WHERE token = ${token}`;
		const invitationId = invRows[0].id as string;

		await login(page, 'alice');
		await page.goto(GROUP_URL);
		await page.waitForLoadState('networkidle');

		// La liste des invitations doit être visible
		await expect(page.getByTestId('invitations-list')).toBeVisible();
		await expect(page.getByTestId('invite-status-badge').first()).toHaveText('Actif');

		// Révoquer le lien et attendre la réponse du serveur
		const responsePromise = page.waitForResponse(
			(resp) => resp.url().includes('revokeInvite') && resp.status() === 200
		);
		await page.getByTestId('revoke-invite-btn').first().click();
		await responsePromise;

		// Le lien doit maintenant être inactif (UI mise à jour)
		await expect(page.getByTestId('invite-status-badge').first()).toHaveText('Inactif');
		// Petite attente pour que captureServer finisse d'écrire dans la DB
		await page.waitForTimeout(200);

		const events = await readServerEvents(db, {
			event: 'invitation_revoked',
			distinctId: ALICE_ID
		});
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1];
		expect(ev.event).toBe('invitation_revoked');
		expect(ev.distinct_id).toBe(ALICE_ID);

		const props = ev.properties as Record<string, unknown>;
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
		expect(props['invitation_id']).toBe(invitationId);
	});

	// ─── Event serveur : group_joined_via_invite ──────────────────────────────────

	test('group_joined_via_invite — event serveur émis quand Dave rejoint via lien', async ({
		page
	}) => {
		// S'assurer que Dave n'est pas membre du groupe seedé
		await removeMemberFromGroup(SEEDED_GROUP_ID, DAVE_ID);

		const token = await createTestInvitation({
			groupId: SEEDED_GROUP_ID,
			createdBy: ALICE_ID
		});

		await login(page, 'dave');
		await page.goto(`/invite/${token}`);

		// Page d'invitation valide
		await expect(page.getByTestId('invite-join-btn')).toBeVisible();

		// Rejoindre le groupe
		await page.getByTestId('invite-join-btn').click();

		// Redirigé vers le groupe
		await expect(page).toHaveURL(new RegExp(`/app/groups/${SEEDED_GROUP_ID}`));

		const events = await readServerEvents(db, {
			event: 'group_joined_via_invite',
			distinctId: DAVE_ID
		});
		expect(events.length).toBeGreaterThanOrEqual(1);

		const ev = events[events.length - 1];
		expect(ev.event).toBe('group_joined_via_invite');
		expect(ev.distinct_id).toBe(DAVE_ID);

		const props = ev.properties as Record<string, unknown>;
		expect(props['group_id']).toBe(SEEDED_GROUP_ID);
		// group_name ne doit pas être un PII sensible (nom du groupe, non l'email)
		expect(typeof props['group_name']).toBe('string');

		// Nettoyage
		await removeMemberFromGroup(SEEDED_GROUP_ID, DAVE_ID);
	});

	test('group_joined_via_invite — pas d\'event quand le lien est invalide', async ({
		page
	}) => {
		await login(page, 'dave');
		await page.goto('/invite/00000000-0000-4000-a000-000000000000');

		// Page "lien invalide" → pas de join
		await expect(page.getByTestId('invite-invalid-title')).toBeVisible();

		const events = await readServerEvents(db, { event: 'group_joined_via_invite' });
		expect(events.length).toBe(0);
	});

	// ─── Event client : invite_link_copied ───────────────────────────────────────

	test('invite_link_copied — event client capturé quand Alice copie un lien (lien nouvellement créé)', async ({
		page
	}) => {
		await cleanInvitations(SEEDED_GROUP_ID);

		// interceptPosthog AVANT toute navigation (exposeFunction doit être enregistrée avant)
		const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
		await exposeSpyPromise;

		await login(page, 'alice');
		await page.goto(GROUP_URL);
		await page.waitForLoadState('networkidle');

		// Créer un lien via le formulaire
		await page.getByTestId('invite-btn').click();
		await expect(page.getByTestId('invite-form')).toBeVisible();
		await page.getByTestId('create-invite-btn').click();
		await expect(page.getByTestId('new-invite-link')).toBeVisible();

		// Cliquer sur le bouton "Copier" du lien nouvellement créé
		await page.getByTestId('copy-invite-btn').click();

		// Vérifier que le spy a bien capturé l'event invite_link_copied
		// Laisser un court instant au microtask de résoudre
		await page.waitForTimeout(100);

		const clientEvents = getCapturedEvents();
		const copyEvent = clientEvents.find((e) => e.event === 'invite_link_copied');
		expect(copyEvent).toBeDefined();
		expect(copyEvent!.properties['group_id']).toBe(SEEDED_GROUP_ID);
	});

	test('invite_link_copied — event client capturé depuis la liste des invitations existantes', async ({
		page
	}) => {
		await cleanInvitations(SEEDED_GROUP_ID);

		// Créer une invitation via DB
		await createTestInvitation({
			groupId: SEEDED_GROUP_ID,
			createdBy: ALICE_ID
		});

		// interceptPosthog AVANT toute navigation
		const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
		await exposeSpyPromise;

		await login(page, 'alice');
		await page.goto(GROUP_URL);
		await page.waitForLoadState('networkidle');

		// Le lien existant doit être visible dans la liste
		await expect(page.getByTestId('invitations-list')).toBeVisible();

		// Cliquer sur le bouton "Copier" de la liste des invitations existantes
		await page.getByTestId('copy-existing-invite-btn').first().click();

		// Laisser un court instant au microtask de résoudre
		await page.waitForTimeout(100);

		const clientEvents = getCapturedEvents();
		const copyEvent = clientEvents.find((e) => e.event === 'invite_link_copied');
		expect(copyEvent).toBeDefined();
		expect(copyEvent!.properties['group_id']).toBe(SEEDED_GROUP_ID);
	});
});
