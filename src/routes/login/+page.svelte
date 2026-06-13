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
		form as { errors?: Record<string, string[]>; email?: string; message?: string } | null
	);

	const forgotHref = resolveRoute('/forgot-password');
	const signupHref = resolveRoute('/signup');
</script>

<div
	class="container mx-auto flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 py-16"
>
	<div class="w-full max-w-md">
		<div class="mb-8 text-center">
			<h1 class="text-foreground text-3xl font-bold">Se connecter</h1>
			<p class="text-muted-foreground mt-2">Content de vous revoir !</p>
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
				<div class="flex items-center justify-between">
					<Label for="password">Mot de passe</Label>
					<a href={forgotHref} class="text-primary text-sm hover:underline">
						Mot de passe oublié ?
					</a>
				</div>
				<Input
					id="password"
					name="password"
					type="password"
					placeholder="••••••••"
					autocomplete="current-password"
					required
				/>
				{#if f?.errors?.password}
					<p class="text-destructive text-sm">{f.errors.password[0]}</p>
				{/if}
			</div>

			<Button type="submit" class="mt-2 w-full" disabled={loading}>
				{loading ? 'Connexion…' : 'Se connecter'}
			</Button>
		</form>

		<p class="text-muted-foreground mt-6 text-center text-sm">
			Pas encore de compte ?
			<a href={signupHref} class="text-primary hover:underline">Créer un compte</a>
		</p>
	</div>
</div>
