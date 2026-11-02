<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolveRoute } from '$lib/paths';
	import { createSupabaseBrowserClient } from '$lib/supabase';
	import { onMount } from 'svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let loading = $state(false);
	let sessionReady = $state(false);
	let sessionError = $state('');

	const f = $derived(
		form as {
			errors?: Record<string, string[]>;
			message?: string;
		} | null
	);

	const isEnglish = $derived(page.url.pathname.startsWith('/en/'));
	const forgotHref = $derived(resolveRoute('/forgot-password'));

	const copy = $derived(
		isEnglish
			? {
					kicker: 'Account recovery',
					title: 'New password',
					subtitle: 'Choose a new secure password.',
					invalidLink: 'The reset link is invalid or expired.',
					newLink: 'Request a new link',
					password: 'New password',
					passwordHint: 'At least 8 characters',
					confirm: 'Confirm password',
					loading: 'Updating…',
					submit: 'Update password'
				}
			: {
					kicker: 'Récupération',
					title: 'Nouveau mot de passe',
					subtitle: 'Choisissez un nouveau mot de passe sécurisé.',
					invalidLink: 'Le lien de réinitialisation est invalide ou expiré.',
					newLink: 'Demander un nouveau lien',
					password: 'Nouveau mot de passe',
					passwordHint: 'Au moins 8 caractères',
					confirm: 'Confirmer le mot de passe',
					loading: 'Mise à jour…',
					submit: 'Mettre à jour le mot de passe'
				}
	);

	// Les messages serveur sont émis en français : on les traduit côté client.
	const message = (value: string) =>
		isEnglish
			? ({
					'Le mot de passe doit faire au moins 8 caractères':
						'The password must be at least 8 characters',
					'Les mots de passe ne correspondent pas.': 'Passwords do not match.',
					'Une erreur est survenue. Veuillez réessayer.': 'An error occurred. Please try again.'
				}[value] ?? value)
			: value;

	onMount(async () => {
		// Supabase sends the recovery token in the URL fragment.
		// We let the browser client pick it up automatically.
		const supabase = createSupabaseBrowserClient();
		const { data, error } = await supabase.auth.getSession();

		if (error || !data.session) {
			// Try to exchange the token from the hash
			const hashParams = new URLSearchParams(window.location.hash.slice(1));
			const accessToken = hashParams.get('access_token');
			const refreshToken = hashParams.get('refresh_token');
			const type = hashParams.get('type');

			if (type === 'recovery' && accessToken && refreshToken) {
				const { error: sessionErr } = await supabase.auth.setSession({
					access_token: accessToken,
					refresh_token: refreshToken
				});
				if (sessionErr) {
					sessionError = copy.invalidLink;
				} else {
					sessionReady = true;
				}
			} else {
				sessionError = copy.invalidLink;
			}
		} else {
			sessionReady = true;
		}
	});
</script>

<div
	class="container mx-auto flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 py-16"
>
	<div class="w-full max-w-md">
		<div class="bw-page-head text-center">
			<p class="bw-kicker justify-center">{copy.kicker}</p>
			<h1 class="bw-display text-4xl">{copy.title}</h1>
			<p class="text-muted-foreground">{copy.subtitle}</p>
		</div>

		{#if sessionError}
			<div class="bw-card bw-card-pad text-center">
				<div
					class="rounded-xl border border-[var(--bw-danger)] bg-[var(--bw-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--bw-danger)]"
				>
					{sessionError}
				</div>
				<p class="mt-4 text-sm">
					<a href={forgotHref} class="bw-link"> {copy.newLink} </a>
				</p>
			</div>
		{:else}
			<div class="bw-card bw-card-pad">
				<form
					method="POST"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							await update();
						};
					}}
					class="flex flex-col gap-4"
				>
					{#if f?.message}
						<div
							class="rounded-xl border border-[var(--bw-danger)] bg-[var(--bw-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--bw-danger)]"
						>
							{message(f.message)}
						</div>
					{/if}

					<div class="bw-field">
						<label class="bw-label" for="password">{copy.password}</label>
						<input
							class="bw-input"
							id="password"
							name="password"
							type="password"
							placeholder="••••••••"
							autocomplete="new-password"
							required
						/>
						{#if f?.errors?.password}
							<p class="bw-error">{message(f.errors.password[0])}</p>
						{/if}
						<p class="bw-help">{copy.passwordHint}</p>
					</div>

					<div class="bw-field">
						<label class="bw-label" for="passwordConfirm">{copy.confirm}</label>
						<input
							class="bw-input"
							id="passwordConfirm"
							name="passwordConfirm"
							type="password"
							placeholder="••••••••"
							autocomplete="new-password"
							required
						/>
						{#if f?.errors?.passwordConfirm}
							<p class="bw-error">{message(f.errors.passwordConfirm[0])}</p>
						{/if}
					</div>

					<button type="submit" class="bw-btn bw-btn-block" disabled={loading || !sessionReady}>
						{loading ? copy.loading : copy.submit}
					</button>
				</form>
			</div>
		{/if}
	</div>
</div>
