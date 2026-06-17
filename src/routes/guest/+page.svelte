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
			errors?: Record<string, string[]>;
			pseudo?: string;
			message?: string;
		} | null
	);

	const loginHref = resolveRoute('/login');
	const signupHref = resolveRoute('/signup');
</script>

<div
	class="container mx-auto flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 py-16"
>
	<div class="w-full max-w-md">
		<div class="mb-8 text-center">
			<div class="mb-3 text-5xl">👤</div>
			<h1 class="text-foreground text-3xl font-bold">Continuer en invité</h1>
			<p class="text-muted-foreground mt-2">
				Rejoignez vos amis maintenant, créez votre compte plus tard.
			</p>
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
				<Label for="pseudo">Votre pseudo</Label>
				<Input
					id="pseudo"
					name="pseudo"
					type="text"
					placeholder="MonPseudo"
					value={f?.pseudo ?? ''}
					autocomplete="username"
					required
				/>
				{#if f?.errors?.pseudo}
					<p class="text-destructive text-sm">{f.errors.pseudo[0]}</p>
				{/if}
				<p class="text-muted-foreground text-xs">Entre 2 et 30 caractères</p>
			</div>

			<Button type="submit" class="mt-2 w-full" disabled={loading}>
				{loading ? 'Connexion…' : 'Continuer en invité'}
			</Button>
		</form>

		<div class="mt-6 text-center">
			<p class="text-muted-foreground text-sm">
				Vous aurez un compte invité temporaire. Vous pourrez le sécuriser plus tard.
			</p>
		</div>

		<div class="relative my-6">
			<div class="absolute inset-0 flex items-center">
				<span class="border-border w-full border-t"></span>
			</div>
			<div class="relative flex justify-center text-xs uppercase">
				<span class="bg-background text-muted-foreground px-2">ou</span>
			</div>
		</div>

		<div class="flex flex-col gap-3">
			<Button href={loginHref} variant="outline" class="w-full">Se connecter</Button>
			<Button href={signupHref} variant="outline" class="w-full">Créer un compte</Button>
		</div>
	</div>
</div>
