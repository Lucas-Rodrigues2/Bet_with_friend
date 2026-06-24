import { test } from '@playwright/test';
import { login } from './helpers/auth';
import { interceptPosthog } from './helpers/analytics';

const SEEDED_GROUP_ID = '11111111-1111-1111-8111-111111111111';
const NEW_YESNO_URL = `/app/groups/${SEEDED_GROUP_ID}/bets/new/yesno`;

test('debug S-030 - what events are captured', async ({ page }) => {
	const { getCapturedEvents, exposeSpyPromise } = interceptPosthog(page);
	await exposeSpyPromise;

	await login(page, 'alice');
	await page.goto(NEW_YESNO_URL);
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(1000);

	const events = getCapturedEvents();
	console.log('Captured events:', JSON.stringify(events, null, 2));
	console.log('Number of events:', events.length);

	// Check if __playwright_trackSpy exists in the window
	const spyExists = await page.evaluate(
		() => typeof (window as unknown as Record<string, unknown>)['__playwright_trackSpy']
	);
	console.log('Spy type in window:', spyExists);

	// Manually call track from inside the page
	await page.evaluate(() => {
		const spy = (window as unknown as Record<string, unknown>)['__playwright_trackSpy'] as
			| ((e: string, p: Record<string, unknown>) => void)
			| undefined;
		console.log('spy type:', typeof spy);
		if (typeof spy === 'function') {
			spy('manual_test_event', { test: true });
		}
	});
	await page.waitForTimeout(100);
	const events2 = getCapturedEvents();
	console.log('Events after manual call:', JSON.stringify(events2, null, 2));
});
