// ─── Service Worker PWA (S-080) — SvelteKit `src/service-worker.ts` ────────────
//
// Servi à `/service-worker.js` par SvelteKit (build + dev). Scope racine `/`.
// Responsabilités :
//   1. Offline fallback minimal : shell de l'app servable sans réseau (cache
//      des assets statiques construits + pages naviguées).
//   2. Stratégies de cache :
//        - assets versionnés (`_app/immutable/`, icônes, fonts) → cache-first.
//        - pages HTML / documents → network-first, fallback sur la page
//          offline dédiée (JAMAIS sur le cache des pages visitées : celles-ci
//          peuvent contenir des PII rendues pour un utilisateur connecté, et
//          le Cache Storage n'est pas vidé au logout → risque de fuite sur
//          appareil partagé).
//        - tout autre GET same-origin (`/api/*`, endpoints dynamiques auth)
//          → network-only, aucun cache (PII).
//   3. Conserve les événements Web Push de S-073 (`push` + `notificationclick`)
//      migrés depuis l'ancien `static/sw.js`.
//
// Ce fichier est bundlé par SvelteKit — il a accès au module `$service-worker`
// (build, files, version). Aucun import runtime Node/Browser non supporté par
// un SW.

import { version } from '$service-worker';

// ─── Caches & shell ────────────────────────────────────────────────────────────

const CACHE_SHELL = `bwf-shell-${version}`;
const CACHE_ASSETS = `bwf-assets-${version}`;
// Note : on ne maintient plus de cache des pages HTML visitées. Les pages
// rendues connectées contiennent des PII et le Cache Storage n'est pas vidé au
// logout → fuite sur appareil partagé. Les navigations hors-ligne retombent
// sur `/offline.html`.

// Shell offline minimal : UNIQUEMENT des pages non-auth (offline) + manifest.
// On ne pré-cache PAS `/` : la racine est rendue côté serveur et peut contenir
// des PII (groupes, paris, ardoise) pour l'utilisateur connecté. La resservir
// hors-ligne à un autre utilisateur sur un appareil partagé fuit des PII.
const SHELL_URLS = ['/offline.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
	// Pré-remplissage du shell offline minimal seulement. Les assets versionnés
	// (build) et le reste de `static/` sont mis en cache à la volée par le
	// fetch handler (cache-first) — on évite l'échec atomique d'un `addAll`
	// sur une ressource non disponible (fréquent en dev).
	event.waitUntil(
		(async () => {
			const shellCache = await caches.open(CACHE_SHELL);
			await Promise.all(
				SHELL_URLS.map(async (url) => {
					try {
						const response = await fetch(url);
						if (response.ok) {
							await shellCache.put(url, response);
						}
					} catch {
						/* best-effort : on réessaiera au prochain fetch */
					}
				})
			);
		})()
	);
	// Activation rapide : on ne bloque pas la navigation sur l'install.
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// Nettoie les anciennes versions de caches (y compris l'ancien
			// cache `bwf-pages-*` qui n'est plus utilisé depuis la correction
			// de fuite PII).
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => ![CACHE_SHELL, CACHE_ASSETS].includes(key))
					.map((key) => caches.delete(key))
			);
			// Prend le contrôle de tous les clients ouverts sans attendre reload.
			await self.clients.claim();
		})()
	);
});

// ─── Stratégies de cache (fetch) ───────────────────────────────────────────────

/**
 * Une requête est-elle un asset statique à cacher en cache-first ?
 * (assets Vite versionnés, icônes, polices, manifest, favicon).
 */
function isCacheableAsset(url: URL): boolean {
	return (
		url.pathname.startsWith('/_app/immutable/') ||
		url.pathname.startsWith('/icons/') ||
		url.pathname === '/manifest.webmanifest' ||
		url.pathname === '/favicon.svg' ||
		url.pathname === '/offline.html' ||
		/\.([0-9a-f]{8,})\.(js|css|woff2?|png|jpg|svg|webp)$/.test(url.pathname)
	);
}

/** Une requête est-elle une navigation document (HTML) ? */
function isDocumentRequest(request: Request): boolean {
	return request.mode === 'navigate' || (request.headers.get('accept') ?? '').includes('text/html');
}

self.addEventListener('fetch', (event) => {
	const request = event.request;

	// On ne gère que GET (les POST/PUT/... vont au réseau, jamais en cache).
	if (request.method !== 'GET') return;

	// On ne gère que les requêtes same-origin (les ressources cross-origin
	// tierces — avatars Supabase Storage, etc. — restent au réseau).
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	// 1) Assets statiques → cache-first, fallback réseau.
	if (isCacheableAsset(url)) {
		event.respondWith(
			(async () => {
				const cached = await caches.match(request);
				if (cached) return cached;
				try {
					const response = await fetch(request);
					const cache = await caches.open(CACHE_ASSETS);
					cache.put(request, response.clone());
					return response;
				} catch {
					// Pas de réseau et pas en cache : on tente le shell.
					const shell = await caches.match(request);
					return shell ?? Response.error();
				}
			})()
		);
		return;
	}

	// 2) Navigations (documents HTML) → network-first, fallback sur la page
	//    offline dédiée UNIQUEMENT. On NE met JAMAIS les pages rendues en
	//    cache : elles peuvent contenir des PII pour l'utilisateur connecté
	//    (groupes, paris, ardoise) et le Cache Storage survit au logout.
	if (isDocumentRequest(request)) {
		event.respondWith(
			(async () => {
				try {
					return await fetch(request);
				} catch {
					// Hors-ligne : on sert la page offline (non-auth), jamais
					// une page précédemment rendue (fuite PII).
					const offline = await caches.match('/offline.html');
					return offline ?? Response.error();
				}
			})()
		);
		return;
	}

	// 3) Autres requêtes GET same-origin (notamment `/api/*` et endpoints
	//    dynamiques authentifiés) : network-only, AUCUN cache. Ces réponses
	//    retournent des PII (notifications, activité de groupe, etc.) et ne
	//    doivent jamais être stockées.
	event.respondWith(
		(async () => {
			try {
				return await fetch(request);
			} catch {
				return Response.error();
			}
		})()
	);
});

// ─── Web Push (migré depuis `static/sw.js` — S-073) ────────────────────────────

self.addEventListener('push', (event) => {
	/** @type {{ title?: string, body?: string, url?: string|null }} */
	let data: { title?: string; body?: string; url?: string | null } = {
		title: 'Bet With Friend',
		body: 'Nouvelle notification',
		url: null
	};
	let parsed = false;
	try {
		if (event.data) {
			data = event.data.json();
			parsed = true;
		}
	} catch {
		/* payload non-JSON */
	}
	if (!parsed && event.data) {
		try {
			data.body = event.data.text();
		} catch {
			/* ignore */
		}
	}

	const title = data.title || 'Bet With Friend';
	const options = {
		body: data.body || '',
		// Lien profond transmis au click via `data`.
		data: { url: data.url || null },
		requireInteraction: false,
		tag: 'bwf-notification',
		// Remplace une notif existante du même tag (évite l'empilement).
		renotify: true
	};

	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
	const notification = event.notification;
	const rawUrl = (notification.data && notification.data.url) || '/';
	notification.close();

	// Défense en profondeur : le lien profond doit être sur la même origin que
	// le SW. Un payload push malveillant/compromis ne peut pas ouvrir une URL
	// externe (phishing) via openWindow/navigate. Sinon on retombe sur '/'.
	let targetUrl = '/';
	try {
		const parsed = new URL(rawUrl, self.location.origin);
		if (parsed.origin === self.location.origin) {
			targetUrl = parsed.href;
		}
	} catch {
		/* keep default '/' */
	}

	event.waitUntil(
		(async () => {
			const allClients = await self.clients.matchAll({
				type: 'window',
				includeUncontrolled: true
			});

			// Origin cible (absolue si url fournie, sinon l'origin du SW).
			let baseOrigin = self.location.origin;
			if (targetUrl.startsWith('http')) {
				try {
					baseOrigin = new URL(targetUrl).origin;
				} catch {
					/* keep default */
				}
			}

			// Pathname cible pour le focus préférentiel (même page).
			let targetPath: string | null = null;
			try {
				targetPath = new URL(targetUrl, self.location.origin).pathname;
			} catch {
				/* keep null */
			}

			const appClients = allClients.filter((c) => c.url.startsWith(baseOrigin));

			// 1) Privilégie une fenêtre déjà sur la bonne page (focus).
			for (const client of appClients) {
				if (targetPath && client.url.includes(targetPath)) {
					try {
						await client.focus();
						return;
					} catch {
						/* continue */
					}
				}
			}

			// 2) Sinon : focus la première fenêtre de l'app et navigue si possible.
			for (const client of appClients) {
				try {
					await client.focus();
					if ('navigate' in client) {
						await client.navigate(targetUrl);
					}
					return;
				} catch {
					/* continue */
				}
			}

			// 3) Aucune fenêtre correspondante → on en ouvre une sur la cible.
			try {
				await self.clients.openWindow(targetUrl);
			} catch {
				/* ignore */
			}
		})()
	);
});
