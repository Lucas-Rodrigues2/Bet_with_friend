<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolveRoute } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let { form } = $props();

	let loading = $state(false);

	const loginHref = resolveRoute('/login');
	const forgotHref = resolveRoute('/forgot-password');
</script>

<div
	class="container mx-auto flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 py-16"
>
	<div class="w-full max-w-md">
		{#if form?.success}
			<div class="text-center">
				<div class="mb-4 text-5xl">📧</div>
				<h1 class="text-foreground text-2xl font-bold">Email envoyé</h1>
				<p class="text-muted-foreground mt-3 leading-relaxed">
					Si un compte existe pour <strong>{form.email}</strong>, vous recevrez un lien pour
					réinitialiser votre mot de passe.
				</p>
				<p class="text-muted-foreground mt-4 text-sm">
					<a href={loginHref} class="text-primary hover:underline">Retour à la connexion</a>
				</p>
			</div>
		{:else}
			<div class="mb-8 text-center">
				<h1 class="text-foreground text-3xl font-bold">Mot de passe oublié</h1>
				<p class="text-muted-foreground mt-2">
					Saisissez votre email pour recevoir un lien de réinitialisation.
				</p>
			</div>

			<form
				method="POST"
				action={forgotHref}
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="flex flex-col gap-4"
			>
				<div class="flex flex-col gap-1.5">
					<Label for="email">Adresse email</Label>
					<Input
						id="email"
						name="email"
						type="email"
						placeholder="vous@exemple.com"
						value={form?.email ?? ''}
						autocomplete="email"
						required
					/>
					{#if form?.errors?.email}
						<p class="text-destructive text-sm">{form.errors.email[0]}</p>
					{/if}
				</div>

				<Button type="submit" class="mt-2 w-full" disabled={loading}>
					{loading ? 'Envoi…' : 'Envoyer le lien'}
				</Button>
			</form>

			<p class="text-muted-foreground mt-6 text-center text-sm">
				<a href={loginHref} class="text-primary hover:underline">Retour à la connexion</a>
			</p>
		{/if}
	</div>
</div>
