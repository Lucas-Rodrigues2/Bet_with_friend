import { chromium } from '@playwright/test';

const base = 'http://100.88.54.21:4173';
const group = '/app/groups/11111111-1111-1111-8111-111111111111';
const browser = await chromium.launch({
	executablePath: '/home/lucas-hermes/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'
});
try {
	const owner = await browser.newPage();
	await owner.goto(base + '/login');
	await owner.locator('[name=email]').fill('alice@test.local');
	await owner.locator('[name=password]').fill('test-password-123');
	await owner.locator('button[type=submit]').click();
	await owner.waitForURL('**/');
	await owner.goto(base + group);
	await owner.getByTestId('invite-btn').click();
	await owner.getByTestId('invite-expiration').selectOption('24h');
	await owner.getByTestId('create-invite-btn').click();
	await owner.getByTestId('invite-link-input').waitFor();
	const invite = await owner.getByTestId('invite-link-input').inputValue();
	console.log('Création du lien par Alice : OK');

	const guest = await browser.newPage();
	await guest.goto(base + '/guest');
	await guest.locator('[name=pseudo]').fill('TestInviteDirect');
	await guest.locator('button[type=submit]').click();
	await guest.waitForURL(base + '/', { timeout: 15000 });
	await guest.getByTestId('guest-banner').waitFor();
	console.log('Création du compte invité : OK');
	await guest.goto(invite);
	await guest.getByTestId('invite-join-btn').waitFor();
	await guest.getByTestId('invite-join-btn').click();
	await guest.waitForURL(base + group, { timeout: 15000 });
	console.log('Invité déjà connecté : groupe rejoint : OK');
	await guest.goto(base + group + '/members');
	if (!(await guest.getByText('TestInviteDirect', { exact: true }).count()))
		throw new Error('Membre invité non visible');
	console.log('Membre invité affiché dans le groupe : OK');

	const visitor = await browser.newPage();
	await visitor.goto(invite);
	console.log('Visiteur non connecté : page finale', new URL(visitor.url()).pathname);
	const guestLink = visitor.getByRole('link', { name: 'Continuer en invité' });
	console.log(
		'Le lien invité conserve la destination :',
		(await guestLink.getAttribute('href')).includes('redirectTo=') ? 'OUI' : 'NON'
	);
	await guestLink.click();
	await visitor.locator('[name=pseudo]').fill('TestInviteParcours');
	await visitor.locator('button[type=submit]').click();
	await visitor.waitForURL((u) => !u.pathname.endsWith('/guest'), { timeout: 15000 });
	console.log('Après création depuis invitation : page finale', new URL(visitor.url()).pathname);
	console.log(
		'Retour automatique à l’invitation :',
		new URL(visitor.url()).pathname.startsWith('/invite/') ? 'OUI' : 'NON'
	);
	await visitor.goto(invite);
	await visitor.getByTestId('invite-join-btn').waitFor();
	await visitor.getByTestId('invite-join-btn').click();
	await visitor.waitForURL(base + group, { timeout: 15000 });
	await visitor.goto(base + group + '/members');
	if (!(await visitor.getByText('TestInviteParcours', { exact: true }).count()))
		throw new Error('Second invité non visible');
	console.log('Après réouverture manuelle : groupe rejoint : OK');
} finally {
	await browser.close();
}
