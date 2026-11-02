<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolveRoute } from '$lib/paths';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	// bind:value préserve la saisie pendant l'hydratation ; un simple
	// value={...} est ré-écrit par Svelte et efface la saisie en cours.
	let pseudoValue = $state((form as { pseudo?: string } | null)?.pseudo ?? '');

	let loading = $state(false);

	const f = $derived(
		form as {
			errors?: Record<string, string[]>;
			pseudo?: string;
			message?: string;
		} | null
	);

	const isEnglish = $derived(page.url.pathname.startsWith('/en/'));
	const loginHref = $derived(isEnglish ? resolveRoute('/en/login') : resolveRoute('/login'));
	const signupHref = $derived(isEnglish ? resolveRoute('/en/signup') : resolveRoute('/signup'));

	const copy = $derived(
		isEnglish
			? {
					kicker: 'Guest mode',
					title: 'Continue as guest',
					subtitle: 'Join your friends now, create your account later.',
					pseudo: 'Your username',
					placeholder: 'MyUsername',
					hint: 'Between 2 and 30 characters',
					loading: 'Signing in…',
					submit: 'Continue as guest',
					note: "You'll have a temporary guest account. You can secure it later.",
					or: 'or',
					login: 'Log in',
					signup: 'Create an account'
				}
			: {
					kicker: 'Mode invité',
					title: 'Continuer en invité',
					subtitle: 'Rejoignez vos amis maintenant, créez votre compte plus tard.',
					pseudo: 'Votre pseudo',
					placeholder: 'MonPseudo',
					hint: 'Entre 2 et 30 caractères',
					loading: 'Connexion…',
					submit: 'Continuer en invité',
					note: 'Vous aurez un compte invité temporaire. Vous pourrez le sécuriser plus tard.',
					or: 'ou',
					login: 'Se connecter',
					signup: 'Créer un compte'
				}
	);

	// Les messages serveur sont émis en français : on les traduit côté client.
	const message = (value: string) =>
		isEnglish
			? ({
					'Le pseudo doit faire au moins 2 caractères':
						'The username must be at least 2 characters',
					'Le pseudo ne peut pas dépasser 30 caractères':
						'The username cannot exceed 30 characters',
					'Impossible de créer une session invité. Veuillez réessayer.':
						'Unable to create a guest session. Please try again.',
					'Erreur lors de la création du profil. Veuillez réessayer.':
						'Error creating the profile. Please try again.'
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
			<p class="text-muted-foreground">
				{copy.subtitle}
			</p>
		</div>

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
					<label class="bw-label" for="pseudo">{copy.pseudo}</label>
					<input
						class="bw-input"
						id="pseudo"
						name="pseudo"
						type="text"
						placeholder={copy.placeholder}
						bind:value={pseudoValue}
						autocomplete="username"
						required
					/>
					{#if f?.errors?.pseudo}
						<p class="bw-error">{message(f.errors.pseudo[0])}</p>
					{/if}
					<p class="bw-help">{copy.hint}</p>
				</div>

				<button type="submit" class="bw-btn bw-btn-block" disabled={loading}>
					{loading ? copy.loading : copy.submit}
				</button>
			</form>

			<div class="mt-6 text-center">
				<p class="bw-help">
					{copy.note}
				</p>
			</div>
		</div>

		<div class="my-6 flex items-center gap-3">
			<hr class="bw-rule flex-1" />
			<span class="bw-chip">{copy.or}</span>
			<hr class="bw-rule flex-1" />
		</div>

		<div class="flex flex-col items-center gap-3">
			<a href={loginHref} class="bw-btn bw-btn-outline bw-btn-block">{copy.login}</a>
			<a href={signupHref} class="bw-btn bw-btn-outline bw-btn-block">{copy.signup}</a>
		</div>
	</div>
</div>
