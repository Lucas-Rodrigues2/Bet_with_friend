import { test } from 'node:test';
import assert from 'node:assert/strict';

// Start a local Vite server separately; no database writes or authenticated sessions are required.
const base = process.env.TEST_BASE_URL ?? 'http://localhost:5198';

async function request(path, options = {}) {
	return fetch(new URL(path, base), { redirect: 'manual', ...options });
}

test('real enhanced logout action keeps English', async () => {
	const response = await request('/en/logout', {
		method: 'POST',
		headers: {
			origin: base,
			accept: 'application/json',
			'x-sveltekit-action': 'true',
			'content-type': 'application/x-www-form-urlencoded'
		},
		body: ''
	});
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { type: 'redirect', status: 303, location: '/en' });
});

test('protected client data navigation returns the SvelteKit redirect protocol', async () => {
	const response = await request('/en/app/__data.json?x-sveltekit-invalidated=111');
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { type: 'redirect', location: '/en/login' });
});

test('native redirects and French actions retain their expected destinations', async () => {
	const english = await request('/en/invite/abc');
	assert.equal(english.status, 303);
	assert.equal(english.headers.get('location'), '/en/login?redirectTo=%2Fen%2Finvite%2Fabc');
	const french = await request('/logout', {
		method: 'POST',
		headers: {
			origin: base,
			accept: 'text/html',
			'content-type': 'application/x-www-form-urlencoded'
		},
		body: ''
	});
	assert.equal(french.status, 303);
	assert.equal(french.headers.get('location'), '/');
});

test('real client data navigation preserves English and invitation query', async () => {
	const response = await request('/en/invite/abc/__data.json?x-sveltekit-invalidated=111');
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		type: 'redirect',
		location: '/en/login?redirectTo=%2Fen%2Finvite%2Fabc'
	});
});
