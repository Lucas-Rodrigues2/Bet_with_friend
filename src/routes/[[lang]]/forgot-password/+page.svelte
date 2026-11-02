<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolveRoute } from '$lib/paths';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	// bind:value préserve la saisie pendant l'hydratation ; un simple
	// value={...} est ré-écrit par Svelte et efface la saisie en cours.
	let emailValue = $state((form as { email?: string } | null)?.email ?? '');

	let loading = $state(false);

	const f = $derived(
		form as { success?: boolean; errors?: Record<string, string[]>; email?: string } | null
	);

	const isEnglish = $derived(page.url.pathname.startsWith('/en/'));
	const loginHref = $derived(isEnglish ? resolveRoute('/en/login') : resolveRoute('/login'));

	const copy = $derived(
		isEnglish
			? {
					kicker: 'Account recovery',
					sent: 'Email sent',
					sentTo:
						'If an account exists for {email}, you will receive a link to reset your password.',
					back: 'Back to login',
					title: 'Forgot password',
					sub: 'Enter your email to receive a reset link.',
					email: 'Email address',
					emailPlaceholder: 'you@example.com',
					loading: 'Sending…',
					submit: 'Send the link',
					invalidEmail: 'Invalid email address'
				}
			: {
					kicker: 'Récupération',
					sent: 'Email envoyé',
					sentTo:
						'Si un compte existe pour {email}, vous recevrez un lien pour réinitialiser votre mot de passe.',
					back: 'Retour à la connexion',
					title: 'Mot de passe oublié',
					sub: 'Saisissez votre email pour recevoir un lien de réinitialisation.',
					email: 'Adresse email',
					emailPlaceholder: 'vous@exemple.com',
					loading: 'Envoi…',
					submit: 'Envoyer le lien',
					invalidEmail: 'Adresse email invalide'
				}
	);
	const message = (value: string) =>
		isEnglish ? ({ 'Adresse email invalide': 'Invalid email address' }[value] ?? value) : value;
</script>

<div
	class="container mx-auto flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 py-16"
>
	<div class="w-full max-w-md">
		{#if f?.success}
			<div class="bw-card bw-card-pad text-center">
				<div class="mb-4 text-5xl">📬</div>
				<h1 class="bw-display text-3xl">{copy.sent}</h1>
				<p class="text-muted-foreground mt-3">
					{copy.sentTo.replace('{email}', f.email ?? '')}
				</p>
				<p class="mt-6">
					<a href={loginHref} class="bw-link">{copy.back}</a>
				</p>
			</div>
		{:else}
			<div class="bw-page-head text-center">
				<p class="bw-kicker justify-center">{copy.kicker}</p>
				<h1 class="bw-display text-4xl">{copy.title}</h1>
				<p class="text-muted-foreground">{copy.sub}</p>
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

					<button type="submit" class="bw-btn bw-btn-block" disabled={loading}>
						{loading ? copy.loading : copy.submit}
					</button>
				</form>
			</div>

			<p class="mt-6 text-center text-sm">
				<a href={loginHref} class="bw-link">{copy.back}</a>
			</p>
		{/if}
	</div>
</div>
