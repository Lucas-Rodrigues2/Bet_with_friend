import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Isolate only Supabase and Kit's environment; execute the actual hook and localization helper.
async function loadHandle() {
	const compile = async (path) =>
		ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
			compilerOptions: { module: ts.ModuleKind.ESNext }
		}).outputText;
	const context = vm.createContext({
		URL,
		Request,
		Response,
		Headers,
		TextDecoder,
		process: { env: {} }
	});
	const i18n = new vm.SourceTextModule(await compile('../src/lib/i18n/index.ts'), { context });
	await i18n.link((specifier) => {
		assert.equal(specifier, './catalog');
		return new vm.SyntheticModule(['tr', 'trf', 'trServer'], function () {}, { context });
	});
	await i18n.evaluate();
	const dependencies = {
		'@supabase/ssr': {
			createServerClient: () => ({
				auth: { getSession: async () => ({ data: { session: null } }) }
			})
		},
		'$lib/i18n': { locTarget: i18n.namespace.locTarget },
		'$lib/server/request-limit': { consumeLimit: () => null },
		'$env/static/public': {
			PUBLIC_SUPABASE_URL: 'https://example.test',
			PUBLIC_SUPABASE_ANON_KEY: 'test'
		},
		'$app/environment': { dev: false }
	};
	const module = new vm.SourceTextModule(await compile('../src/hooks.server.ts'), { context });
	await module.link((specifier) => {
		const values = dependencies[specifier];
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
	return module.namespace.handle;
}

const handle = await loadHandle();
async function run({ path = '/en/claim', data = false, action = false, response }) {
	const url = new URL(path, 'https://site.test');
	const event = {
		url,
		route: { id: '/[[lang]]/claim' },
		isDataRequest: data,
		request: new Request(
			url,
			action ? { method: 'POST', headers: { 'x-sveltekit-action': 'true' } } : {}
		),
		locals: {},
		cookies: { getAll: () => [], set: () => {} }
	};
	return handle({ event, resolve: async () => response });
}

test('server-data streaming is not blocked while pending chunks remain open', async () => {
	let controller;
	const stream = new ReadableStream({
		start(c) {
			controller = c;
			c.enqueue(new TextEncoder().encode('{"type":"data","nodes":[]}\n'));
		}
	});
	const pending = run({
		data: true,
		response: new Response(stream, { headers: { 'content-type': 'application/json' } })
	});
	const result = await Promise.race([
		pending,
		new Promise((resolve) => setTimeout(() => resolve('blocked'), 500))
	]);
	controller.close();
	assert.notEqual(result, 'blocked', 'hook waited for an unfinished data stream');
	assert.equal(await result.text(), '{"type":"data","nodes":[]}\n');
});

function jsonRedirect(location, extra = {}) {
	return new Response(JSON.stringify({ type: 'redirect', status: 303, location }), {
		status: 200,
		headers: { 'content-type': 'application/json', ...extra }
	});
}

test('rewritten action retains multiple Set-Cookie headers and metadata', async () => {
	const headers = new Headers({
		'content-type': 'application/json',
		'x-custom': 'preserved',
		'content-length': '1'
	});
	headers.append('set-cookie', 'first=1; Path=/; HttpOnly');
	headers.append('set-cookie', 'second=2; Path=/; Secure');
	const response = await run({
		action: true,
		response: new Response('{"type":"redirect","status":303,"location":"/login?x=1#frag"}', {
			headers
		})
	});
	assert.equal((await response.json()).location, '/en/login?x=1#frag');
	assert.deepEqual(response.headers.getSetCookie(), [
		'first=1; Path=/; HttpOnly',
		'second=2; Path=/; Secure'
	]);
	assert.equal(response.headers.get('x-custom'), 'preserved');
	assert.equal(response.headers.get('content-length'), null);
});

test('same redirect localization applies to HTTP and data, preserving query and fragment', async () => {
	for (const protocol of ['http', 'data', 'action']) {
		const target = '/login?next=%2Fapp%3Fx%3D1#details';
		const response = await run({
			data: protocol === 'data',
			action: protocol === 'action',
			response:
				protocol === 'http'
					? new Response(null, { status: 303, headers: { location: target } })
					: jsonRedirect(target)
		});
		const location =
			protocol === 'http' ? response.headers.get('location') : (await response.json()).location;
		assert.equal(location, '/en/login?next=%2Fapp%3Fx%3D1#details');
	}
});

test('external OAuth and unsafe network-path locations are never rewritten', async () => {
	for (const target of [
		'https://accounts.google.com/o/oauth2/auth?state=abc#done',
		'//evil.test/x',
		'/\\\\evil.test',
		'/%5cevil.test',
		'/%2f%2fevil.test',
		'/%00x',
		'/%zz'
	]) {
		for (const protocol of ['http', 'data', 'action']) {
			const response = await run({
				data: protocol === 'data',
				action: protocol === 'action',
				response:
					protocol === 'http'
						? new Response(null, { status: 303, headers: { location: target } })
						: jsonRedirect(target)
			});
			const actual =
				protocol === 'http' ? response.headers.get('location') : (await response.json()).location;
			assert.equal(actual, target, `${protocol}: ${target}`);
		}
	}
});

test('already localized, French and non-protocol JSON responses stay unchanged', async () => {
	for (const opts of [
		{ action: true, target: '/en/login?x=1#f' },
		{ data: true, path: '/claim', target: '/login' },
		{ target: '/login' }
	]) {
		const response = await run({ ...opts, response: jsonRedirect(opts.target) });
		assert.equal((await response.json()).location, opts.target);
	}
});

test('oversized redirect envelopes and ordinary data are passed through unbuffered', async () => {
	const large = '/login?' + 'a'.repeat(17000);
	const response = await run({ data: true, response: jsonRedirect(large) });
	assert.equal((await response.json()).location, large);
	const data = '{"type":"data","nodes":[]}';
	const dataResponse = await run({
		data: true,
		response: new Response(data, { headers: { 'content-type': 'application/json' } })
	});
	assert.equal(await dataResponse.text(), data);
});
