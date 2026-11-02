import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real handle and cookie adapter, with Supabase isolated from network/credentials.
async function issueCookie({
	environment,
	url = 'http://example.test/',
	headers = {},
	dev = false
}) {
	const source = await readFile(new URL('../src/hooks.server.ts', import.meta.url), 'utf8');
	const compiled = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.ESNext }
	});
	let written;
	const imports = {
		'@supabase/ssr': {
			createServerClient: (_url, _key, { cookies }) => ({
				auth: {
					getSession: async () => {
						cookies.setAll([
							{
								name: 'sb-test-auth-token',
								value: 'test',
								options: { secure: false, path: '/wrong', httpOnly: true }
							}
						]);
						return { data: { session: null } };
					}
				}
			})
		},
		'$lib/i18n': { locTarget: (_pathname, location) => location },
		'$lib/server/request-limit': { consumeLimit: () => null },
		'$env/static/public': {
			PUBLIC_SUPABASE_URL: 'https://example.test',
			PUBLIC_SUPABASE_ANON_KEY: 'test'
		},
		'$app/environment': { dev },
		'$env/dynamic/private': { env: environment }
	};
	const context = vm.createContext({ URL, Request, Response, process: { env: environment } });
	const module = new vm.SourceTextModule(compiled.outputText, { context });
	await module.link((specifier) => {
		const values = imports[specifier];
		assert.ok(values, `unexpected import: ${specifier}`);
		return new vm.SyntheticModule(
			Object.keys(values),
			function () {
				for (const [name, value] of Object.entries(values)) this.setExport(name, value);
			},
			{ context }
		);
	});
	await module.evaluate();
	const event = {
		route: { id: '/' },
		url: new URL(url),
		request: new Request(url, { headers }),
		locals: {},
		getClientAddress: () => '127.0.0.1',
		cookies: {
			getAll: () => [],
			set: (name, value, options) => {
				written = { name, value, options };
			}
		}
	};
	await module.namespace.handle({ event, resolve: async () => new Response('ok') });
	assert.ok(written, 'Supabase cookie adapter should be invoked');
	assert.equal(written.options.path, '/');
	assert.equal(written.options.httpOnly, true);
	return { secure: written.options.secure, hasSecure: Object.hasOwn(written.options, 'secure') };
}

async function secureFor(input) {
	return (await issueCookie(input)).secure;
}

test('development delegates Secure defaults to SvelteKit rather than the cookie source', async () => {
	for (const url of ['http://localhost:5173/', 'http://100.88.54.21:5173/']) {
		const cookie = await issueCookie({ environment: { NODE_ENV: 'development' }, dev: true, url });
		assert.equal(cookie.hasSecure, false, url);
	}
});

test('production HTTP emits Secure cookies even if Supabase asks otherwise', async () => {
	assert.equal(await secureFor({ environment: { NODE_ENV: 'production' } }), true);
});

test('private HTTP preview explicitly opts in under development', async () => {
	assert.equal(
		await secureFor({
			environment: { NODE_ENV: 'development', ALLOW_INSECURE_PREVIEW_COOKIES: 'true' }
		}),
		false
	);
});

for (const [name, environment, url, headers] of [
	[
		'production cannot opt out even with flag',
		{ NODE_ENV: 'production', ALLOW_INSECURE_PREVIEW_COOKIES: 'true' }
	],
	['development without flag defaults to Secure', { NODE_ENV: 'development' }],
	[
		'preview-like NODE_ENV fails closed',
		{ NODE_ENV: 'preview', ALLOW_INSECURE_PREVIEW_COOKIES: 'true' }
	],
	['missing NODE_ENV fails closed', { ALLOW_INSECURE_PREVIEW_COOKIES: 'true' }],
	['flag must be exactly true', { NODE_ENV: 'development', ALLOW_INSECURE_PREVIEW_COOKIES: '1' }],
	['production HTTPS remains Secure', { NODE_ENV: 'production' }, 'https://example.test/'],
	[
		'forwarded headers cannot downgrade production',
		{ NODE_ENV: 'production', ALLOW_INSECURE_PREVIEW_COOKIES: 'true' },
		'http://example.test/',
		{ 'x-forwarded-proto': 'http', 'x-forwarded-host': 'localhost' }
	]
]) {
	test(name, async () => assert.equal(await secureFor({ environment, url, headers }), true));
}
