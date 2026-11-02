import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { db } from './helpers/db';

const group = '/app/groups/11111111-1111-1111-8111-111111111111';
const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
	test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } });
}

// Les invités créés par ces scénarios rejoignent le groupe seedé : les retirer
// après la spec pour que les autres scénarios (comptes de membres) restent stables.
test.afterAll(async () => {
	try {
		await db`
			DELETE FROM public.group_members
			WHERE group_id = ${SEEDED_GROUP_ID}
			  AND user_id IN (SELECT id FROM public.profiles WHERE pseudo LIKE 'Invitefr%' OR pseudo LIKE 'Inviteen%')`;
		await db`DELETE FROM public.profiles WHERE pseudo LIKE 'Invitefr%' OR pseudo LIKE 'Inviteen%'`;
		await db`DELETE FROM public.group_invitations WHERE group_id = ${SEEDED_GROUP_ID}`;
	} catch {
		// Ignore cleanup errors
	}
});

for (const lang of ['fr', 'en'] as const) {
 for (const javascriptEnabled of [true, false]) {
	test(`un visiteur ${lang} retrouve son invitation après création du compte invité (JS: ${javascriptEnabled})`, async ({ browser }) => {
		const ownerContext = await browser.newContext();
		const owner = await ownerContext.newPage();
		await login(owner, 'alice');
		await owner.goto(group);
		await owner.waitForLoadState('networkidle');
		await owner.getByTestId('invite-btn').click();
		await owner.getByTestId('invite-expiration').selectOption('24h');
		await owner.getByTestId('create-invite-btn').click();
		const invite = new URL(await owner.getByTestId('invite-link-input').inputValue());
		const invitePath = `${lang === 'en' ? '/en' : ''}${invite.pathname}`;
		const visitorContext = await browser.newContext({ javascriptEnabled });
		const visitor = await visitorContext.newPage();
		await visitor.goto(invitePath);
		await expect(visitor).toHaveURL(new RegExp(`${lang === 'en' ? '/en' : ''}/login\\?`));
		await visitor.getByRole('link', { name: lang === 'en' ? 'Continue as guest' : 'Continuer en invité' }).click();
		await visitor.waitForLoadState('networkidle');
		await visitor.locator('[name=pseudo]').fill(`Invite${lang}${Date.now()}`);
		await visitor.locator('button[type=submit]').click();
		await expect(visitor).toHaveURL(new RegExp(`${invitePath}$`));
		await expect(visitor.getByTestId('invite-join-btn')).toHaveText(lang === 'en' ? 'Join the group' : 'Rejoindre le groupe');
		await visitor.getByTestId('invite-join-btn').click();
		await expect(visitor).toHaveURL(`${lang === 'en' ? '/en' : ''}${group}`);
		for (const bad of ['https://example.com', '//example.com', '/\\\\example.com', '/invite/../x', '/invite/test?x=1']) {
			const result = await visitor.request.get(`${lang === 'en' ? '/en' : ''}/guest?${new URLSearchParams({ redirectTo: bad })}`, { maxRedirects: 0 });
			expect(result.status()).toBe(303);
			expect(result.headers().location).toBe(lang === 'en' ? '/en' : '/');
		}
		await visitor.goto(`${lang === 'en' ? '/en' : ''}/invite/nonexistent-token`);
		await expect(visitor.getByTestId('invite-invalid-title')).toHaveText(lang === 'en' ? 'Invalid link' : 'Lien invalide');
		await ownerContext.close();
		await visitorContext.close();
	});
 }
}
