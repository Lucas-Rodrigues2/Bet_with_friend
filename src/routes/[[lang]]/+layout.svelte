<script lang="ts">
	import './layout.css';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import GuestBanner from '$lib/components/GuestBanner.svelte';
	import NotificationBell from '$lib/components/NotificationBell.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { initAnalytics, identifyUser } from '$lib/analytics/client';
	import { tr, trf, lp, switchLangPath, type Lang, type MessageKey } from '$lib/i18n';
	// Effet de bord : enregistre le service worker PWA au chargement (S-080).
	import '../../service-worker-companion';

	let { children, data } = $props();

	const L: Lang = $derived(data.lang ?? 'fr');
	/** Raccourci de traduction : toute clé non cataloguée est une erreur TS. */
	const t = (k: MessageKey) => tr(L, k);

	const homeHref = $derived(lp(L, '/'));
	const profileHref = $derived(lp(L, '/app/profile'));
	const loginHref = $derived(lp(L, '/login'));
	const signupHref = $derived(lp(L, '/signup'));
	const logoutAction = $derived(lp(L, '/logout'));
	// Sélecteur de langue : même page, autre langue.
	const otherLang: Lang = $derived(L === 'en' ? 'fr' : 'en');
	const langSwitchLabel = $derived(L === 'en' ? 'Français' : 'English');

	onMount(() => {
		initAnalytics();
		if (data.session?.user?.id) {
			identifyUser(data.session.user.id);
		}
	});

	// Initiales pour l'avatar par défaut
	const initials = $derived(
		data.profile?.pseudo
			? data.profile.pseudo
					.split(' ')
					.map((w: string) => w[0])
					.join('')
					.toUpperCase()
					.slice(0, 2)
			: '?'
	);

	// Au logout, on vide le Cache Storage du service worker PWA AVANT que la
	// navigation n'ait lieu : les pages et assets ont pu être rendus avec des
	// PII pour l'utilisateur courant (S-080 : correction de fuite sur appareil
	// partagé). Best-effort : si l'API CacheStorage n'existe pas, on laisse la
	// navigation continuer.
	async function clearPwaCachesOnLogout(event: SubmitEvent) {
		event.preventDefault();
		try {
			if (typeof caches !== 'undefined' && caches.keys) {
				const keys = await caches.keys();
				await Promise.all(keys.map((k) => caches.delete(k)));
			}
		} catch {
			/* best-effort */
		}
		(event.target as HTMLFormElement).submit();
	}
</script>

<div class="flex min-h-screen flex-col">
	<header
		class="sticky top-0 z-50 border-b border-[var(--bw-line)] bg-[var(--bw-paper)]/95 backdrop-blur"
		style="padding-top: env(safe-area-inset-top);"
	>
		<div class="container mx-auto flex h-16 items-center justify-between px-4">
			<a href={homeHref} class="flex items-center gap-2.5">
				<img
					src="/icons/icon-192.png"
					alt=""
					class="h-9 w-9 rounded-full border border-[var(--bw-line)] object-cover"
				/>
				<span class="text-[17px] font-bold tracking-[-0.02em]">Gentle Wagers</span>
			</a>

			<nav class="flex items-center gap-2 sm:gap-3">
				<a
					href={`/lang/${otherLang}`}
					class="bw-badge hover:bg-[var(--bw-paper-deep)]"
					data-testid="header-lang-switch"
					hreflang={otherLang}
				>
					{langSwitchLabel}
				</a>
				{#if data.session && data.profile}
					<NotificationBell initialUnreadCount={data.unreadNotificationsCount ?? 0} lang={L} />
					<a
						href={profileHref}
						class="flex items-center gap-2 hover:opacity-80"
						aria-label={t('Mon profil')}
						data-testid="header-profile-link"
					>
						{#if data.profile.avatarUrl}
							<img
								src={data.profile.avatarUrl}
								alt={trf(L, 'Avatar de {name}', { name: data.profile.pseudo })}
								class="h-9 w-9 rounded-full border border-[var(--bw-line)] object-cover"
								data-testid="header-avatar"
							/>
						{:else}
							<div
								class="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bw-ink)] text-xs font-bold text-white"
								data-testid="header-avatar-initials"
							>
								{initials}
							</div>
						{/if}
						<span class="hidden text-sm sm:inline">
							<strong data-testid="header-pseudo">{data.profile.pseudo}</strong>
						</span>
					</a>
					<form method="POST" action={logoutAction} onsubmit={clearPwaCachesOnLogout}>
						<Button type="submit" variant="outline" size="sm">{t('Déconnexion')}</Button>
					</form>
				{:else if data.session}
					<form method="POST" action={logoutAction} onsubmit={clearPwaCachesOnLogout}>
						<Button type="submit" variant="outline" size="sm">{t('Déconnexion')}</Button>
					</form>
				{:else}
					<Button href={loginHref} variant="outline" size="sm">{t('Se connecter')}</Button>
					<Button href={signupHref} size="sm">{t('Créer un compte')}</Button>
				{/if}
			</nav>
		</div>
	</header>

	{#if data.profile?.isAnonymous}
		<GuestBanner lang={L} />
	{/if}

	<main class="flex-1" style="padding-bottom: env(safe-area-inset-bottom);">
		{@render children()}
	</main>
</div>

<Toaster />
