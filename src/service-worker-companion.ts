// ─── Service Worker companion (S-080) ─────────────────────────────────────────
//
// Module côté client qui enregistre le service worker PWA SvelteKit
// (`/service-worker.js`, construit depuis `src/service-worker.ts`) le plus tôt
// possible au chargement de l'app. Importé pour son effet de bord depuis
// `src/routes/+layout.svelte`.
//
// SvelteKit injecte aussi son propre `navigator.serviceWorker.register` sur
// l'événement `load` (par défaut `kit.serviceWorker.register = true`) ; les
// deux enregistrements ciblent le même SW avec le même scope `/` → le
// navigateur déduplique, aucun effet de bord. Cet appel garantit en plus que
// `registerServiceWorker()` (`src/lib/push.ts`) dispose d'une registration
// mise en cache pour `pushManager.subscribe` côté push Web (S-073).

import { browser } from '$app/environment';
import { registerServiceWorker } from '$lib/push';

if (browser) {
	void registerServiceWorker();
}
