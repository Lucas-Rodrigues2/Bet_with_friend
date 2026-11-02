import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const group = '/app/groups/11111111-1111-1111-8111-111111111111';

if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
	test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } });
}

test('le menu du groupe reste disponible et indique la section active', async ({ page }) => {
	await login(page, 'alice');
	await page.goto(group);
	const nav = page.getByTestId('group-tabs');
	await expect(nav.getByTestId('tab-overview')).toHaveAttribute('aria-current', 'page');
	for (const [tab, suffix] of [
		['tab-bets', '/bets'],
		['tab-ledger', '/ledger'],
		['tab-activity', '/activity'],
		['tab-leaderboard', '/leaderboard'],
		['tab-members', '/members'],
		['tab-overview', '']
	]) {
		await nav.getByTestId(tab).click();
		await expect(page).toHaveURL(new RegExp(`${group}${suffix}$`));
		await expect(nav).toBeVisible();
		await expect(nav.getByTestId(tab)).toHaveAttribute('aria-current', 'page');
	}
});

test('le menu reste utilisable en anglais sur mobile', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await login(page, 'alice');
	await page.goto(`/en${group}`);
	const nav = page.getByTestId('group-tabs');
	await expect(nav.getByTestId('tab-overview')).toHaveText('Overview');
	await nav.getByTestId('tab-ledger').click();
	await expect(page).toHaveURL(`/en${group}/ledger`);
	await expect(nav.getByTestId('tab-ledger')).toHaveAttribute('aria-current', 'page');
	await nav.getByTestId('tab-bets').click();
	await expect(page).toHaveURL(`/en${group}/bets`);
	await expect(nav.getByTestId('tab-bets')).toHaveAttribute('aria-current', 'page');
});
