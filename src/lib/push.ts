// ─── Web Push côté client (S-073) ─────────────────────────────────────────────
//
// Helpers pour demander la permission, enregistrer/désenregistrer un
// abonnement push auprès du navigateur, et le synchroniser avec le serveur
// (POST/DELETE vers la form action de /app/settings/notifications).
//
// Le service worker `/sw.js` est enregistré au chargement de l'app (layout)
// via registerServiceWorker() ; il doit être actif avant d'appeler
// `pushManager.subscribe` (qui requiert un SW actif sur le scope).

import { browser } from '$app/environment';
import { PUBLIC_VAPID_PUBLIC_KEY } from '$env/static/public';

export type PushPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

/** true si le navigateur supporte les notifications push + service workers. */
export function isPushSupported(): boolean {
	if (!browser) return false;
	return (
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window &&
		typeof navigator.serviceWorker.register === 'function'
	);
}

/** État courant de la permission Notification. */
export function getPermissionState(): PushPermissionState {
	if (!browser || !('Notification' in window)) return 'unsupported';
	return Notification.permission as PushPermissionState;
}

/**
 * Convertit la clé publique VAPID (base64url) en Uint8Array pour l'option
 * `applicationServerKey` de `pushManager.subscribe`.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	const buffer = new ArrayBuffer(raw.length);
	const result = new Uint8Array(buffer);
	for (let i = 0; i < raw.length; i++) {
		result[i] = raw.charCodeAt(i);
	}
	return result;
}

let _swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Enregistre le service worker `/sw.js`. Idempotent : ne réenregistre pas
 * s'il l'est déjà. Retourne la registration (active ou pas) pour permettre
 * `pushManager.subscribe`.
 *
 * Appelé au montage du layout app (browser-only).
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
	if (!browser || !('serviceWorker' in navigator)) return null;
	if (_swRegistration) return _swRegistration;
	try {
		// scope racine : le SW contrôle tout le site.
		_swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
		// S'assurer que le SW est actif avant de retourner.
		await navigator.serviceWorker.ready;
		return _swRegistration;
	} catch (err) {
		console.warn('[push] Failed to register service worker:', err);
		return null;
	}
}

export interface SubscribeResult {
	ok: boolean;
	endpoint?: string;
	keys?: { p256dh: string; auth: string };
	error?: 'denied' | 'unsupported' | 'no_sw' | 'subscribe_failed' | 'no_keys';
}

/**
 * Demande la permission Notification puis abonne le navigateur via
 * `pushManager.subscribe` (avec la clé publique VAPID). Renvoie l'abonnement
 * (endpoint + clés) à envoyer au serveur pour enregistrement.
 *
 * Ne lève jamais : renvoie un objet `SubscribeResult` explicite.
 */
export async function subscribeToPush(): Promise<SubscribeResult> {
	if (!isPushSupported()) return { ok: false, error: 'unsupported' };
	if (!PUBLIC_VAPID_PUBLIC_KEY) return { ok: false, error: 'no_keys' };

	const reg = await registerServiceWorker();
	if (!reg) return { ok: false, error: 'no_sw' };

	// Demande la permission (si déjà granted/denied, résolu immédiatement).
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return { ok: false, error: 'denied' };

	let subscription: PushSubscription;
	try {
		subscription = await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_PUBLIC_KEY)
		});
	} catch (err) {
		console.warn('[push] pushManager.subscribe failed:', err);
		return { ok: false, error: 'subscribe_failed' };
	}

	const json = subscription.toJSON();
	if (!json.keys || !json.keys.p256dh || !json.keys.auth) {
		return { ok: false, error: 'no_keys' };
	}
	return {
		ok: true,
		endpoint: subscription.endpoint,
		keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }
	};
}

export interface UnsubscribeResult {
	ok: boolean;
	endpoint?: string;
}

/**
 * Désabonne le navigateur courant (unsubscribe pushManager) et renvoie
 * l'endpoint à supprimer côté serveur. Best-effort, ne lève jamais.
 */
export async function unsubscribeFromPush(): Promise<UnsubscribeResult> {
	if (!isPushSupported()) return { ok: false };
	const reg = _swRegistration ?? (await registerServiceWorker());
	if (!reg) return { ok: false };
	try {
		const sub = await reg.pushManager.getSubscription();
		if (!sub) return { ok: true, endpoint: undefined };
		const endpoint = sub.endpoint;
		await sub.unsubscribe();
		return { ok: true, endpoint };
	} catch (err) {
		console.warn('[push] unsubscribe failed:', err);
		return { ok: false };
	}
}

/**
 * Endpoint courant de l'abonnement push actif sur cet appareil (ou null).
 * Utile pour afficher l'état « activé sur cet appareil » dans l'UI.
 */
export async function getCurrentEndpoint(): Promise<string | null> {
	if (!isPushSupported()) return null;
	const reg = _swRegistration ?? (await registerServiceWorker());
	if (!reg) return null;
	try {
		const sub = await reg.pushManager.getSubscription();
		return sub ? sub.endpoint : null;
	} catch {
		return null;
	}
}
