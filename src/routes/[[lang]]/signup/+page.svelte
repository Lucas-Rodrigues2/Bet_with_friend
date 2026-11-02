<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolveRoute } from '$lib/paths';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	// bind:value préserve la saisie pendant l'hydratation ; un simple
	// value={...} est ré-écrit par Svelte et efface la saisie en cours.
	let emailValue = $state((form as { email?: string } | null)?.email ?? '');
	let pseudoValue = $state((form as { pseudo?: string } | null)?.pseudo ?? '');

	let loading = $state(false);

	const f = $derived(
		form as {
			success?: boolean;
			errors?: Record<string, string[]>;
			email?: string;
			pseudo?: string;
			message?: string;
		} | null
	);

	const isEnglish = $derived(page.url.pathname.startsWith('/en/'));
	const loginHref = $derived(isEnglish ? resolveRoute('/en/login') : resolveRoute('/login'));
	const googleHref = $derived(`/auth/google?lang=${isEnglish ? 'en' : 'fr'}`);
	const guestHref = resolveRoute('/guest');
	const copy = $derived(
		isEnglish
			? {
					kicker: 'New member',
					verify: 'Check your email',
					sent: 'A confirmation link was sent to',
					activate: 'Click the link to activate your account.',
					already: 'Already have an account?',
					login: 'Log in',
					title: 'Create an account',
					welcome: 'Join your friends on Bet With Friends!',
					google: 'Continue with Google',
					or: 'or',
					email: 'Email address',
					emailPlaceholder: 'you@example.com',
					username: 'Username',
					usernamePlaceholder: 'YourName',
					password: 'Password',
					passwordHint: 'At least 8 characters',
					creating: 'Creating…',
					create: 'Create my account',
					guest: 'Continue as guest',
					invalidEmail: 'Invalid email address',
					pseudoMin: 'Username must be at least 2 characters',
					pseudoMax: 'Username cannot exceed 30 characters',
					passwordMin: 'Password must be at least 8 characters',
					passwordMax: 'Password is too long'
				}
			: {
					kicker: 'Nouveau membre',
					verify: 'Vérifiez vos emails',
					sent: 'Un lien de confirmation a été envoyé à',
					activate: 'Cliquez sur ce lien pour activer votre compte.',
					already: 'Déjà un compte ?',
					login: 'Se connecter',
					title: 'Créer un compte',
					welcome: 'Rejoignez vos amis sur Bet With Friends !',
					google: 'Continuer avec Google',
					or: 'ou',
					email: 'Adresse email',
					emailPlaceholder: 'vous@exemple.com',
					username: 'Pseudo',
					usernamePlaceholder: 'VotreNom',
					password: 'Mot de passe',
					passwordHint: 'Au moins 8 caractères',
					creating: 'Création…',
					create: 'Créer mon compte',
					guest: 'Continuer en invité',
					invalidEmail: 'Adresse email invalide',
					pseudoMin: 'Le pseudo doit faire au moins 2 caractères',
					pseudoMax: 'Le pseudo ne peut pas dépasser 30 caractères',
					passwordMin: 'Le mot de passe doit faire au moins 8 caractères',
					passwordMax: 'Le mot de passe est trop long'
				}
	);
	const message = (value: string) =>
		isEnglish
			? ({
					'Adresse email invalide': 'Invalid email address',
					'Le pseudo doit faire au moins 2 caractères': 'Username must be at least 2 characters',
					'Le pseudo ne peut pas dépasser 30 caractères': 'Username cannot exceed 30 characters',
					'Le mot de passe doit faire au moins 8 caractères':
						'Password must be at least 8 characters',
					'Le mot de passe est trop long': 'Password is too long'
				}[value] ?? value)
			: value;
</script>

<div
	class="container mx-auto flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 py-16"
>
	<div class="w-full max-w-md">
		{#if f?.success}
			<div class="bw-card bw-card-pad text-center">
				<div class="mb-4 text-5xl">📧</div>
				<h1 class="bw-display text-3xl">{copy.verify}</h1>
				<p class="text-muted-foreground mt-3 leading-relaxed">
					{copy.sent} <strong>{f.email}</strong>.<br />
					{copy.activate}
				</p>
				<p class="text-muted-foreground mt-4 text-sm">
					{copy.already}
					<a href={loginHref} class="bw-link">{copy.login}</a>
				</p>
			</div>
		{:else}
			<div class="bw-page-head text-center">
				<p class="bw-kicker justify-center">{copy.kicker}</p>
				<h1 class="bw-display text-4xl">{copy.title}</h1>
				<p class="text-muted-foreground">{copy.welcome}</p>
			</div>

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
						<label class="bw-label" for="pseudo">{copy.username}</label>
						<input
							class="bw-input"
							id="pseudo"
							name="pseudo"
							type="text"
							placeholder={copy.usernamePlaceholder}
							bind:value={pseudoValue}
							autocomplete="username"
							required
						/>
						{#if f?.errors?.pseudo}
							<p class="bw-error">{message(f.errors.pseudo[0])}</p>
						{/if}
					</div>

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

					<button type="submit" class="bw-btn bw-btn-block" disabled={loading}>
						{loading ? copy.creating : copy.create}
					</button>
				</form>
			</div>

			<p class="text-muted-foreground mt-6 text-center text-sm">
				{copy.already}
				<a href={loginHref} class="bw-link">{copy.login}</a>
			</p>

			<div class="my-6 flex items-center gap-3">
				<hr class="bw-rule flex-1" />
				<span class="bw-chip">{copy.or}</span>
				<hr class="bw-rule flex-1" />
			</div>

			<p class="text-center text-sm">
				<a href={guestHref} class="bw-link">{copy.guest}</a>
			</p>
		{/if}
	</div>
</div>
