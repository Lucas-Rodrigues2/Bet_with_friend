import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { fail, redirect, isRedirect } from '@sveltejs/kit';
import { z } from 'zod';

// Run the real claim action and callback; isolate DB and the Supabase network.
const context = vm.createContext({ URL });
const dependencies = {
	'@sveltejs/kit': { fail, redirect },
	zod: { z },
	'$lib/server/db/index': { db: {} },
	'$lib/server/db/schema': { profiles: {} },
	'drizzle-orm': { eq: () => {} },
	'$lib/server/analytics': { captureServer: () => {} }
};
async function load(path) {
	const source = await readFile(new URL(path, import.meta.url), 'utf8');
	const code = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.ESNext }
	}).outputText;
	const module = new vm.SourceTextModule(code, { context });
	await module.link((specifier) => {
		const exports = dependencies[specifier];
		assert.ok(exports, `unexpected import: ${specifier}`);
		return new vm.SyntheticModule(
			Object.keys(exports),
			function () {
				for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
			},
			{ context }
		);
	});
	await module.evaluate();
	return module.namespace;
}
const claim = await load('../src/routes/[[lang]]/claim/+page.server.ts');
const callback = await load('../src/routes/auth/callback/+server.ts');

function jar(initial = {}) {
	const values = new Map(Object.entries(initial));
	const writes = [];
	return {
		writes,
		get: (name) => values.get(name),
		set: (name, value, options) => {
			values.set(name, value);
			writes.push({ name, value, options });
		},
		delete: (name, options) => {
			values.delete(name);
			writes.push({ name, options, deleted: true });
		}
	};
}
async function captureRedirect(fn) {
	try {
		await fn();
	} catch (error) {
		assert.ok(isRedirect(error), `unexpected exception: ${error}`);
		return error;
	}
	assert.fail('expected redirect');
}

test('English guest linking preserves language through a rejected callback', async () => {
	const cookies = jar();
	const url = new URL('https://site.test/en/claim?/google');
	let options;
	const locals = {
		safeGetSession: async () => ({ session: {} }),
		supabase: {
			auth: {
				linkIdentity: async (input) => {
					options = input;
					return { data: { url: 'https://oauth.example/authorize?state=abc%2Bdef' }, error: null };
				}
			}
		}
	};
	const start = await captureRedirect(() => claim.actions.google({ locals, cookies, url }));
	assert.equal(start.status, 303);
	assert.equal(start.location, 'https://oauth.example/authorize?state=abc%2Bdef');
	assert.equal(options.provider, 'google');
	assert.equal(options.options.redirectTo, 'https://site.test/auth/callback');
	assert.equal(cookies.get('oauth_lang'), 'en');
	const write = cookies.writes.find((item) => item.name === 'oauth_lang' && !item.deleted);
	assert.equal(write.options.path, '/');
	assert.equal(write.options.httpOnly, true);
	assert.equal(write.options.sameSite, 'lax');
	assert.equal(write.options.maxAge, 600);
	assert.notEqual(write.options.secure, false);
	const rejected = await captureRedirect(() =>
		callback.GET({
			url: new URL('https://site.test/auth/callback?error=access_denied'),
			locals,
			cookies
		})
	);
	assert.equal(rejected.status, 303);
	assert.equal(rejected.location, '/en/login?error=oauth_failed');
	assert.equal(cookies.get('oauth_lang'), undefined);
});

test('French guest linking replaces a stale English cookie and returns to French on callback failure', async () => {
	const cookies = jar({ oauth_lang: 'en' });
	const locals = {
		safeGetSession: async () => ({ session: {} }),
		supabase: {
			auth: {
				linkIdentity: async () => ({
					data: { url: 'https://oauth.example/authorize?state=xyz' },
					error: null
				})
			}
		}
	};
	const start = await captureRedirect(() =>
		claim.actions.google({
			locals,
			cookies,
			url: new URL('https://site.test/claim?/google&lang=en')
		})
	);
	assert.equal(start.location, 'https://oauth.example/authorize?state=xyz');
	assert.equal(cookies.get('oauth_lang'), 'fr');
	const rejected = await captureRedirect(() =>
		callback.GET({ url: new URL('https://site.test/auth/callback'), locals, cookies })
	);
	assert.equal(rejected.location, '/login?error=oauth_failed');
	assert.equal(cookies.get('oauth_lang'), undefined);
});

test('provider errors return only the stable translatable message', async () => {
	const cookies = jar();
	const locals = {
		safeGetSession: async () => ({ session: {} }),
		supabase: {
			auth: {
				linkIdentity: async () => ({
					data: { url: null },
					error: { message: 'sensitive external provider details' }
				})
			}
		}
	};
	const response = await claim.actions.google({
		locals,
		cookies,
		url: new URL('https://site.test/en/claim?/google')
	});
	assert.equal(response.status, 400);
	assert.equal(response.data.message, 'Une erreur est survenue. Veuillez réessayer.');
	assert.ok(!JSON.stringify(response.data).includes('sensitive external provider details'));
});

test('email claim does not expose Supabase error details', async () => {
	dependencies['$lib/server/db/index'].db.select = () => ({
		from: () => ({ where: () => ({ limit: async () => [{ isAnonymous: true }] }) })
	});
	const locals = {
		safeGetSession: async () => ({ session: {}, user: { id: 'guest' } }),
		supabase: {
			auth: { updateUser: async () => ({ error: { message: 'sensitive provider detail' } }) }
		}
	};
	const form = new FormData();
	form.set('email', 'guest@example.test');
	form.set('password', 'password123');
	const request = new Request('https://site.test/en/claim?/email', { method: 'POST', body: form });
	const response = await claim.actions.email({ locals, cookies: jar(), request });
	assert.equal(response.status, 400);
	assert.equal(response.data.message, 'Une erreur est survenue. Veuillez réessayer.');
	assert.ok(!JSON.stringify(response.data).includes('sensitive provider detail'));
});

for (const [caseName, session, result, expectedStatus] of [
	['no session', null, null, 401],
	['provider error', {}, { data: { url: null }, error: { message: 'failed' } }, 400],
	['missing URL', {}, { data: { url: null }, error: null }, 500],
	['provider exception', {}, new Error('network failed'), null]
]) {
	test(`failed guest linking clears a stale language cookie: ${caseName}`, async () => {
		const cookies = jar({ oauth_lang: 'en' });
		const locals = {
			safeGetSession: async () => ({ session }),
			supabase: {
				auth: {
					linkIdentity: async () => {
						if (result instanceof Error) throw result;
						return result;
					}
				}
			}
		};
		const run = () =>
			claim.actions.google({ locals, cookies, url: new URL('https://site.test/claim?/google') });
		if (result instanceof Error) await assert.rejects(run, /network failed/);
		else assert.equal((await run()).status, expectedStatus);
		assert.equal(cookies.get('oauth_lang'), undefined);
		const deletion = cookies.writes.find((item) => item.name === 'oauth_lang' && item.deleted);
		assert.equal(deletion.options.path, '/');
	});
}
