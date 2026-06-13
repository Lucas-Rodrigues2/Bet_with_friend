import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Charge le .env du worktree courant (isolation parallèle) puis .env.test en
// repli. N'écrase jamais une variable déjà présente dans l'environnement.
// En mode parallèle, scripts/worktree.mjs écrit un .env avec les ports décalés
// (PUBLIC_SUPABASE_URL, DATABASE_URL, PLAYWRIGHT_PORT) propres au slot.
for (const file of ['.env', '.env.test']) {
	const p = path.resolve(process.cwd(), file);
	if (!fs.existsSync(p)) continue;
	for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
		if (line.trim().startsWith('#')) continue;
		const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
		if (!m) continue;
		const key = m[1];
		let val = m[2];
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
			val = val.slice(1, -1);
		if (process.env[key] === undefined) process.env[key] = val;
	}
}

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 5173);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: [['html', { open: 'never' }], ['list']],
	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure'
	},
	projects: [
		{
			name: 'setup',
			testMatch: /global\.setup\.ts/
		},
		{
			name: 'smoke',
			testMatch: /S-000-smoke\.spec\.ts/,
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'chromium',
			testMatch: /S-(?!000)\d{3}.*\.spec\.ts/,
			use: {
				...devices['Desktop Chrome']
			},
			dependencies: ['setup']
		}
	],
	webServer: {
		command: `npm run dev -- --port ${PORT} --strictPort`,
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
