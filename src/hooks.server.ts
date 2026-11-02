import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';
import { locTarget } from '$lib/i18n';
import { consumeLimit } from '$lib/server/request-limit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { dev } from '$app/environment';

export const handle: Handle = async ({ event, resolve }) => {
	const route = event.route.id?.replace(/^\/\[\[lang\]\]/, '') || event.url.pathname;
	const path = route.replace(/^\/(en|fr)(?=\/|$)/, '') || '/';
	const method = event.request.method;
	const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
	const isSensitiveAuth =
		isWrite && ['/guest', '/login', '/signup', '/forgot-password'].includes(path);
	const isApiRead = method === 'GET' && path.startsWith('/api/');
	// REQUEST_LIMIT_ENABLED, si défini explicitement, prime sur le défaut
	// (limiteur actif en dev, opt-in en production). Cela permet aux suites de
	// test de le désactiver pour les scénarios non concernés ; la spec S-016
	// vérifie elle le limiteur avec celui-ci actif.
	const limiterOn =
		process.env.REQUEST_LIMIT_ENABLED !== undefined
			? process.env.REQUEST_LIMIT_ENABLED === 'true'
			: dev;
	if (limiterOn && (isWrite || isApiRead)) {
		let address: string;
		try {
			address = event.getClientAddress();
		} catch {
			// Fail closed if the adapter cannot identify the peer; never trust arbitrary headers.
			address = 'unavailable';
		}
		const bucket = isSensitiveAuth ? 'auth' : isWrite ? 'write' : 'api-read';
		const retryAfter = consumeLimit(
			`${bucket}:${address}`,
			isSensitiveAuth ? 12 : isWrite ? 120 : 300,
			60_000
		);
		if (retryAfter !== null) {
			const message = event.url.pathname.startsWith('/en/')
				? 'Too many requests. Please try again later.'
				: 'Trop de requêtes. Réessaie dans un instant.';
			const enhanced = event.request.headers.get('x-sveltekit-action') === 'true';
			return new Response(
				enhanced ? JSON.stringify({ type: 'error', status: 429, error: { message } }) : message,
				{
					status: 429,
					headers: {
						'content-type': enhanced
							? 'application/json; charset=utf-8'
							: 'text/plain; charset=utf-8',
						'retry-after': String(retryAfter),
						'cache-control': 'no-store'
					}
				}
			);
		}
	}

	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					// In dev, let SvelteKit apply its localhost-only default. Otherwise fail
					// closed; the HTTP preview opt-in requires NODE_ENV=development.
					const cookieOptions = { ...options, path: '/' };
					delete cookieOptions.secure;
					if (
						process.env.NODE_ENV === 'development' &&
						process.env.ALLOW_INSECURE_PREVIEW_COOKIES === 'true'
					) {
						cookieOptions.secure = false;
					} else if (!dev || process.env.NODE_ENV === 'production') {
						cookieOptions.secure = true;
					}
					event.cookies.set(name, value, cookieOptions);
				});
			}
		}
	});

	/**
	 * Unlike `supabase.auth.getSession()`, which returns the session _without_
	 * validating the JWT, this function also calls `getUser()` to validate the
	 * JWT before trusting it.
	 */
	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();

		if (!session) {
			return { session: null, user: null };
		}

		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();

		if (error) {
			return { session: null, user: null };
		}

		return { session, user };
	};

	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	// Protect /app/* routes (French /app/... and English /en/app/... — same rule).
	const isEnglishPage = event.url.pathname === '/en' || event.url.pathname.startsWith('/en/');
	const pathWithoutLang = isEnglishPage ? event.url.pathname.slice(3) || '/' : event.url.pathname;
	if (pathWithoutLang.startsWith('/app') && !session) {
		return new Response(null, {
			status: 303,
			headers: { Location: isEnglishPage ? '/en/login' : '/login' }
		});
	}

	const response = await resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		},
		transformPageChunk({ html }) {
			return isEnglishPage ? html.replace('<html lang="fr">', '<html lang="en">') : html;
		}
	});

	// Les redirections internes des loads/actions sont localisées ici :
	// depuis /en/..., elles visent /en/... — la décision de redirection
	// (et donc la logique métier/sécurité) reste inchangée.
	const localize = (location: string): string => {
		// Only rewrite root-relative same-origin paths. Never turn an external or
		// browser-normalized network-path reference into a different destination.
		try {
			const decoded = decodeURIComponent(location);
			const unsafeCharacters = Array.from(decoded).some((char) => {
				const code = char.charCodeAt(0);
				return char === '\\' || code < 32 || code === 127;
			});
			if (
				!location.startsWith('/') ||
				location.startsWith('//') ||
				decoded.startsWith('//') ||
				unsafeCharacters ||
				new URL(location, event.url).origin !== event.url.origin
			)
				return location;
			const localized = locTarget(event.url.pathname, location);
			return new URL(localized, event.url).origin === event.url.origin ? localized : location;
		} catch {
			return location;
		}
	};
	if (isEnglishPage && response.status >= 300 && response.status < 400) {
		const location = response.headers.get('location');
		if (location) response.headers.set('location', localize(location));
	}

	// Enhanced actions and client-side server loads encode redirects in JSON,
	// not Location. Restrict inspection to those SvelteKit protocol responses;
	// API JSON and streamed data must pass through untouched.
	const isAction =
		event.request.method === 'POST' && event.request.headers.get('x-sveltekit-action') === 'true';
	if (
		isEnglishPage &&
		(event.isDataRequest || isAction) &&
		response.status === 200 &&
		response.headers.get('content-type')?.split(';', 1)[0].trim() === 'application/json'
	) {
		// Kit serializes redirect envelopes to a single string-backed Response.
		// Inspect one bounded chunk only: data responses may stream indefinitely.
		const reader = response.clone().body?.getReader();
		if (!reader) return response;
		try {
			const { value } = await reader.read();
			if (!value || value.byteLength > 16_384) return response;
			const result: unknown = JSON.parse(new TextDecoder().decode(value));
			if (
				result &&
				typeof result === 'object' &&
				'type' in result &&
				result.type === 'redirect' &&
				'location' in result &&
				typeof result.location === 'string'
			) {
				const location = localize(result.location);
				if (location !== result.location) {
					const headers = new Headers(response.headers);
					headers.delete('content-length');
					headers.delete('content-encoding');
					return new Response(JSON.stringify({ ...result, location }), {
						status: response.status,
						statusText: response.statusText,
						headers
					});
				}
			}
		} catch {
			// Non-JSON or streaming bodies are not redirect envelopes.
		} finally {
			// Do not await cancellation: tee cancellation may wait for the other branch.
			void reader.cancel().catch(() => {});
		}
	}

	return response;
};
