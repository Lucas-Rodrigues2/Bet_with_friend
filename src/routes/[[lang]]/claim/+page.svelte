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
	let googleLoading = $state(false);

	const f = $derived(
		form as {
			success?: boolean;
			errors?: Record<string, string[]>;
			email?: string;
			message?: string;
		} | null
	);

	const homeHref = resolveRoute('/');

	const isEnglish = $derived(page.url.pathname.startsWith('/en/'));

	const copy = $derived(
		isEnglish
			? {
					kicker: 'Account security',
					doneTitle: 'Account secured!',
					doneText1: (email: string) => `A confirmation email was sent to ${email}.`,
					doneText2: 'Click the link to finish linking your account.',
					doneNote: 'Your history and groups are preserved.',
					home: 'Back to home',
					title: 'Secure your account',
					subtitle: (pseudo: string) =>
						`Hi ${pseudo}! Link an email or Google account to keep your history forever.`,
					googleLoading: 'Redirecting…',
					google: 'Link with Google',
					or: 'or',
					email: 'Email address',
					placeholder: 'you@example.com',
					password: 'Choose a password',
					passwordHint: 'At least 8 characters',
					loading: 'Securing…',
					submit: 'Secure with email',
					footnote: 'You can then log in with these credentials and find your history again.'
				}
			: {
					kicker: 'Sécurisation',
					doneTitle: 'Compte sécurisé !',
					doneText1: (email: string) => `Un email de confirmation a été envoyé à ${email}.`,
					doneText2: 'Cliquez sur le lien pour finaliser la liaison de votre compte.',
					doneNote: 'Votre historique et vos groupes sont préservés.',
					home: "Retour à l'accueil",
					title: 'Sécurise ton compte',
					subtitle: (pseudo: string) =>
						`Bonjour ${pseudo} ! Lie un email ou Google pour conserver ton historique pour toujours.`,
					googleLoading: 'Redirection…',
					google: 'Lier avec Google',
					or: 'ou',
					email: 'Adresse email',
					placeholder: 'vous@exemple.com',
					password: 'Choisir un mot de passe',
					passwordHint: 'Au moins 8 caractères',
					loading: 'Sécurisation…',
					submit: 'Sécuriser avec email',
					footnote:
						'Tu pourras ensuite te connecter avec ces identifiants et retrouver ton historique.'
				}
	);

	// Les messages serveur sont émis en français : on les traduit côté client.
	const message = (value: string) =>
		isEnglish
			? ({
					'Adresse email invalide': 'Invalid email address',
					'Le mot de passe doit faire au moins 8 caractères':
						'The password must be at least 8 characters',
					'Une erreur est survenue. Veuillez réessayer.': 'An error occurred. Please try again.'
				}[value] ?? value)
			: value;
</script>

<div
	class="container mx-auto flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 py-16"
>
	<div class="w-full max-w-md">
		{#if f?.success}
			<div class="bw-card bw-card-pad text-center">
				<div class="mb-4 text-5xl">✅</div>
				<h1 class="bw-display text-3xl">{copy.doneTitle}</h1>
				<p class="text-muted-foreground mt-3 leading-relaxed">
					{copy.doneText1(f.email ?? '')}<br />
					{copy.doneText2}
				</p>
				<p class="bw-help mt-4">{copy.doneNote}</p>
				<div class="mt-6">
					<a href={homeHref} class="bw-btn">{copy.home}</a>
				</div>
			</div>
		{:else}
			<div class="bw-page-head text-center">
				<p class="bw-kicker justify-center">{copy.kicker}</p>
				<h1 class="bw-display text-4xl">{copy.title}</h1>
				<p class="text-muted-foreground">{copy.subtitle(data.pseudo ?? '')}</p>
			</div>

			<div class="bw-card bw-card-pad">
				<!-- Lier un compte Google -->
				<form
					method="POST"
					action="?/google"
					use:enhance={() => {
						googleLoading = true;
						return async ({ update }) => {
							googleLoading = false;
							await update();
						};
					}}
				>
					<button type="submit" class="bw-btn bw-btn-outline bw-btn-block" disabled={googleLoading}>
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
						{googleLoading ? copy.googleLoading : copy.google}
					</button>
				</form>

				<div class="my-6 flex items-center gap-3">
					<hr class="bw-rule flex-1" />
					<span class="bw-chip">{copy.or}</span>
					<hr class="bw-rule flex-1" />
				</div>

				<!-- Lier un compte email + mot de passe -->
				<form
					method="POST"
					action="?/email"
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
							placeholder={copy.placeholder}
							bind:value={emailValue}
							autocomplete="email"
							required
						/>
						{#if f?.errors?.email}
							<p class="bw-error">{message(f.errors.email[0])}</p>
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
						{loading ? copy.loading : copy.submit}
					</button>
				</form>

				<p class="bw-help mt-6 text-center">
					{copy.footnote}
				</p>
			</div>
		{/if}
	</div>
</div>
