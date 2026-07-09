<script lang="ts">
	// ─── Bouton d'installation PWA (S-080) ────────────────────────────────────
	//
	// Affiche « Installer l'app sur mon téléphone » et déclenche l'installation
	// native quand `beforeinstallprompt` est disponible (Chrome/Edge/Android).
	// Sinon, ouvre un panneau d'instructions pas-à-pas selon la plateforme
	// (iOS Safari, Chrome Android, etc.).
	//
	// Masqué automatiquement si l'app est déjà installée (display-mode standalone)
	// ou non exécutée dans un navigateur.

	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { track } from '$lib/analytics/client';
	import { Smartphone } from '@lucide/svelte';

	type Platform = 'android' | 'ios' | 'chrome' | 'edge' | 'safari' | 'firefox' | 'other';

	interface BeforeInstallPromptEvent extends Event {
		platform?: string;
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	let deferredPrompt = $state<BeforeInstallPromptEvent | null>(null);
	let installed = $state(false);
	let showInstructions = $state(false);

	// `beforeinstallprompt` / `appinstalled` ne font pas partie de WindowEventMap :
	// on cible via le type `EventTarget` (addEventListener accepte un `string`).
	// `window` n'existe pas en SSR → on garde une référence nullable.
	const target: EventTarget | null = browser ? window : null;

	function detectPlatform(): Platform {
		if (!browser) return 'other';
		const ua = navigator.userAgent;
		// iOS Safari (iPhone/iPad) — avant tout car UA contient aussi "Safari".
		if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
		if (/Android/i.test(ua)) return 'android';
		if (/Edg\//i.test(ua)) return 'edge';
		if (/Chrome/i.test(ua) && !/Edg\//i.test(ua)) return 'chrome';
		if (/Firefox/i.test(ua)) return 'firefox';
		if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'safari';
		return 'other';
	}

	function detectInstalled(): boolean {
		if (!browser) return false;
		// display-mode standalone = déjà lancé comme app installée.
		return window.matchMedia('(display-mode: standalone)').matches;
	}

	onMount(() => {
		if (!browser) return;
		installed = detectInstalled();

		const onBeforeInstallPrompt = (e: Event) => {
			// Empêche le prompt automatique mini-infobar ; on le déclenche nous.
			e.preventDefault();
			deferredPrompt = e as BeforeInstallPromptEvent;
		};
		const onAppInstalled = () => {
			deferredPrompt = null;
			installed = true;
		};

		target?.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
		target?.addEventListener('appinstalled', onAppInstalled);

		// Réévalue `installed` si le mode d'affichage change (post-install).
		const mql = window.matchMedia('(display-mode: standalone)');
		const onChange = (ev: MediaQueryListEvent) => {
			installed = ev.matches;
		};
		mql.addEventListener('change', onChange);

		return () => {
			target?.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
			target?.removeEventListener('appinstalled', onAppInstalled);
			mql.removeEventListener('change', onChange);
		};
	});

	async function handleInstallClick() {
		const platform = detectPlatform();

		// Cas 1 : beforeinstallprompt dispo → installation native en un clic.
		if (deferredPrompt) {
			track('pwa_install_prompted', { platform });
			try {
				await deferredPrompt.prompt();
				const choice = await deferredPrompt.userChoice;
				if (choice.outcome === 'accepted') {
					track('pwa_install_accepted', { platform });
					installed = true;
				} else {
					track('pwa_install_dismissed', { platform });
				}
			} catch {
				/* ignore : ne casse pas l'UX */
			} finally {
				deferredPrompt = null;
			}
			return;
		}

		// Cas 2 : pas de beforeinstallprompt (ex. iOS Safari) → instructions.
		track('pwa_install_instructions_viewed', { platform });
		showInstructions = !showInstructions;
	}
</script>

{#if browser && !installed}
	<div class="flex flex-col items-center gap-3" data-testid="pwa-install">
		<Button
			onclick={handleInstallClick}
			variant="outline"
			size="lg"
			data-testid="pwa-install-button"
		>
			<Smartphone class="size-5" />
			Installer l'app sur mon téléphone
		</Button>

		{#if showInstructions}
			<div
				class="bg-card text-card-foreground w-full max-w-md rounded-lg border p-5 text-left shadow-sm"
				data-testid="pwa-install-instructions"
			>
				{#if detectPlatform() === 'ios'}
					<h3 class="mb-2 font-semibold">Installer sur iPhone / iPad (Safari)</h3>
					<ol class="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
						<li>
							Appuyez sur le bouton <strong>Partager</strong>
							<span aria-hidden="true">⎋</span> en bas de l'écran.
						</li>
						<li>
							Faites défiler puis touchez <strong>« Sur l'écran d'accueil »</strong>.
						</li>
						<li>Confirmez en touchant <strong>« Ajouter »</strong>.</li>
					</ol>
					<p class="text-muted-foreground mt-3 text-xs">
						L'icône de Bet With Friend apparaît sur votre écran d'accueil et s'ouvre en plein écran.
					</p>
				{:else if detectPlatform() === 'android'}
					<h3 class="mb-2 font-semibold">Installer sur Android (Chrome)</h3>
					<ol class="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
						<li>
							Appuyez sur le menu <strong>⋮</strong> en haut à droite de Chrome.
						</li>
						<li>
							Touchez <strong>« Ajouter à l'écran d'accueil »</strong>.
						</li>
						<li>Confirmez en touchant <strong>« Installer »</strong>.</li>
					</ol>
				{:else if detectPlatform() === 'safari'}
					<h3 class="mb-2 font-semibold">Installer sur macOS (Safari)</h3>
					<ol class="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
						<li>
							Dans le menu <strong>Fichier</strong>, choisissez
							<strong>« Ajouter au Dock »</strong>.
						</li>
						<li>L'app s'ouvre ensuite comme une application depuis le Dock.</li>
					</ol>
				{:else}
					<h3 class="mb-2 font-semibold">Installer l'app</h3>
					<ol class="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
						<li>
							Ouvrez le menu du navigateur (souvent <strong>⋮</strong> ou
							<strong>⎋</strong>).
						</li>
						<li>
							Choisissez <strong>« Installer l'application »</strong> ou
							<strong>« Ajouter à l'écran d'accueil »</strong>.
						</li>
					</ol>
				{/if}
			</div>
		{/if}
	</div>
{/if}
