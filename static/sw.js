// ─── Service Worker — Web Push (S-073) ────────────────────────────────────────
//
// Écoute les événements `push` (notification système avec titre/corps/lien
// profond) et `notificationclick` (focus/ouverture de l'app sur la bonne page).
//
// Ce fichier est servi statiquement à la racine (`/sw.js`) — ne pas modifier
// le scope. Il ne dépend d'aucun bundle : vanilla JS, pas d'import.

self.addEventListener('install', () => {
	// Activation immédiate : pas de cache à peupler.
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
	/** @type {{ title?: string, body?: string, url?: string|null }} */
	let data = { title: 'Bet With Friend', body: 'Nouvelle notification', url: null };
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
			let targetPath = null;
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
