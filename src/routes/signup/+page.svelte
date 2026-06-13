<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolveRoute } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

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

	const loginHref = resolveRoute('/login');
</script>

<div
	class="container mx-auto flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 py-16"
>
	<div class="w-full max-w-md">
		{#if f?.success}
			<div class="text-center">
				<div class="mb-4 text-5xl">📧</div>
				<h1 class="text-foreground text-2xl font-bold">Vérifiez vos emails</h1>
				<p class="text-muted-foreground mt-3 leading-relaxed">
					Un lien de confirmation a été envoyé à <strong>{f.email}</strong>.<br />
					Cliquez sur ce lien pour activer votre compte.
				</p>
				<p class="text-muted-foreground mt-4 text-sm">
					Déjà un compte ?
					<a href={loginHref} class="text-primary hover:underline">Se connecter</a>
				</p>
			</div>
		{:else}
			<div class="mb-8 text-center">
				<h1 class="text-foreground text-3xl font-bold">Créer un compte</h1>
				<p class="text-muted-foreground mt-2">Rejoignez vos amis sur Bet With Friend !</p>
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
					<div class="bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm">
						{f.message}
					</div>
				{/if}

				<div class="flex flex-col gap-1.5">
					<Label for="email">Adresse email</Label>
					<Input
						id="email"
						name="email"
						type="email"
						placeholder="vous@exemple.com"
						value={f?.email ?? ''}
						autocomplete="email"
						required
					/>
					{#if f?.errors?.email}
						<p class="text-destructive text-sm">{f.errors.email[0]}</p>
					{/if}
				</div>

				<div class="flex flex-col gap-1.5">
					<Label for="pseudo">Pseudo</Label>
					<Input
						id="pseudo"
						name="pseudo"
						type="text"
						placeholder="VotreNom"
						value={f?.pseudo ?? ''}
						autocomplete="username"
						required
					/>
					{#if f?.errors?.pseudo}
						<p class="text-destructive text-sm">{f.errors.pseudo[0]}</p>
					{/if}
				</div>

				<div class="flex flex-col gap-1.5">
					<Label for="password">Mot de passe</Label>
					<Input
						id="password"
						name="password"
						type="password"
						placeholder="••••••••"
						autocomplete="new-password"
						required
					/>
					{#if f?.errors?.password}
						<p class="text-destructive text-sm">{f.errors.password[0]}</p>
					{/if}
					<p class="text-muted-foreground text-xs">Au moins 8 caractères</p>
				</div>

				<Button type="submit" class="mt-2 w-full" disabled={loading}>
					{loading ? 'Création…' : 'Créer mon compte'}
				</Button>
			</form>

			<p class="text-muted-foreground mt-6 text-center text-sm">
				Déjà un compte ?
				<a href={loginHref} class="text-primary hover:underline">Se connecter</a>
			</p>
		{/if}
	</div>
</div>
