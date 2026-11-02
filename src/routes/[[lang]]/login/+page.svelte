<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolveRoute } from '$lib/paths';
	import type { ActionData, PageData } from './$types';

	let { form, data }: { form: ActionData; data: PageData } = $props();

	// bind:value préserve la saisie pendant l'hydratation ; un simple
	// value={...} est ré-écrit par Svelte et efface la saisie en cours.
	let emailValue = $state((form as { email?: string } | null)?.email ?? '');

	let loading = $state(false);

	const f = $derived(
		form as { errors?: Record<string, string[]>; email?: string; message?: string } | null
	);

	const isEnglish = $derived(page.url.pathname.startsWith('/en/'));
	const signupHref = $derived(isEnglish ? resolveRoute('/en/signup') : resolveRoute('/signup'));
	const forgotHref = resolveRoute('/forgot-password');
	const googleHref = $derived(`/auth/google?lang=${isEnglish ? 'en' : 'fr'}`);
	const guestHref = $derived(
		resolveRoute('/guest') +
			(data.redirectTo ? `?${new URLSearchParams({ redirectTo: data.redirectTo })}` : '')
	);
	const copy = $derived(
		isEnglish
			? {
					kicker: 'Member area',
					title: 'Log in',
					welcome: 'Welcome back!',
					oauth: 'Google sign-in failed. Please try again.',
					google: 'Continue with Google',
					or: 'or',
					email: 'Email address',
					emailPlaceholder: 'you@example.com',
					password: 'Password',
					forgot: 'Forgot password?',
					loading: 'Logging in…',
					submit: 'Log in',
					noAccount: 'No account yet?',
					signup: 'Create an account',
					guest: 'Continue as guest',
					invalidEmail: 'Invalid email address',
					passwordRequired: 'Password is required',
					credentials: 'Incorrect email or password. Please check your details.'
				}
			: {
					kicker: 'Espace membre',
					title: 'Se connecter',
					welcome: 'Content de vous revoir !',
					oauth: 'La connexion Google a échoué. Réessayez.',
					google: 'Continuer avec Google',
					or: 'ou',
					email: 'Adresse email',
					emailPlaceholder: 'vous@exemple.com',
					password: 'Mot de passe',
					forgot: 'Mot de passe oublié ?',
					loading: 'Connexion…',
					submit: 'Se connecter',
					noAccount: 'Pas encore de compte ?',
					signup: 'Créer un compte',
					guest: 'Continuer en invité',
					invalidEmail: 'Adresse email invalide',
					passwordRequired: 'Mot de passe requis',
					credentials: 'Identifiants incorrects. Vérifiez votre email et mot de passe.'
				}
	);
	const message = (value: string) =>
		isEnglish
			? ({
					'Adresse email invalide': 'Invalid email address',
					'Mot de passe requis': 'Password is required',
					'Identifiants incorrects. Vérifiez votre email et mot de passe.':
						'Incorrect email or password. Please check your details.'
				}[value] ?? value)
			: value;
</script>

<div
	class="container mx-auto flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 py-16"
>
	<div class="w-full max-w-md">
		<div class="bw-page-head text-center">
			<p class="bw-kicker justify-center">{copy.kicker}</p>
			<h1 class="bw-display text-4xl">{copy.title}</h1>
			<p class="text-muted-foreground">{copy.welcome}</p>
		</div>

		{#if data.oauthError}
			<div
				class="mb-4 rounded-xl border border-[var(--bw-danger)] bg-[var(--bw-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--bw-danger)]"
			>
				{copy.oauth}
			</div>
		{/if}

		<div class="bw-card bw-card-pad">
			<a href={googleHref} class="bw-btn bw-btn-outline bw-btn-block">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					class="h-5 w-5"
					aria-hidden="true"
				>
					<path
						d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
						fill="#4285F4"
					/>
					<path
						d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
						fill="#34A853"
					/>
					<path
						d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
						fill="#FBBC05"
					/>
					<path
						d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
						fill="#EA4335"
					/>
				</svg>
				{copy.google}
			</a>

			<div class="my-6 flex items-center gap-3">
				<hr class="bw-rule flex-1" />
				<span class="bw-chip">{copy.or}</span>
				<hr class="bw-rule flex-1" />
			</div>

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
					<label class="bw-label" for="email">{copy.email}</label>
					<input
						class="bw-input"
						id="email"
						name="email"
						type="email"
						placeholder={copy.emailPlaceholder}
						bind:value={emailValue}
						autocomplete="email"
						required
					/>
					{#if f?.errors?.email}
						<p class="bw-error">{message(f.errors.email[0])}</p>
					{/if}
				</div>

				<div class="bw-field">
					<div class="flex items-center justify-between">
						<label class="bw-label" for="password">{copy.password}</label>
						<a href={forgotHref} class="bw-link text-sm">{copy.forgot}</a>
					</div>
					<input
						class="bw-input"
						id="password"
						name="password"
						type="password"
						placeholder="••••••••"
						autocomplete="current-password"
						required
					/>
					{#if f?.errors?.password}
						<p class="bw-error">{message(f.errors.password[0])}</p>
					{/if}
				</div>

				<button type="submit" class="bw-btn bw-btn-block" disabled={loading}>
					{loading ? copy.loading : copy.submit}
				</button>
			</form>
		</div>

		<p class="text-muted-foreground mt-6 text-center text-sm">
			{copy.noAccount}
			<a href={signupHref} class="bw-link">{copy.signup}</a>
		</p>

		<div class="my-6 flex items-center gap-3">
			<hr class="bw-rule flex-1" />
			<span class="bw-chip">{copy.or}</span>
			<hr class="bw-rule flex-1" />
		</div>

		<p class="text-center text-sm">
			<a href={guestHref} class="bw-link">{copy.guest}</a>
		</p>
	</div>
</div>
