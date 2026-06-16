<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolveRoute } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { ActionData, PageData } from './$types';

	let { form, data }: { form: ActionData; data: PageData } = $props();

	let loading = $state(false);

	const f = $derived(
		form as { errors?: Record<string, string[]>; email?: string; message?: string } | null
	);

	const forgotHref = resolveRoute('/forgot-password');
	const signupHref = resolveRoute('/signup');
	const googleHref = resolveRoute('/auth/google');
</script>

<div
	class="container mx-auto flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 py-16"
>
	<div class="w-full max-w-md">
		<div class="mb-8 text-center">
			<h1 class="text-foreground text-3xl font-bold">Se connecter</h1>
			<p class="text-muted-foreground mt-2">Content de vous revoir !</p>
		</div>

		{#if data.oauthError}
			<div class="bg-destructive/10 text-destructive mb-4 rounded-lg px-4 py-3 text-sm">
				La connexion Google a échoué : {data.oauthError}
			</div>
		{/if}

		<div class="mb-6">
			<Button href={googleHref} variant="outline" class="w-full gap-2">
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
				Continuer avec Google
			</Button>
		</div>

		<div class="relative mb-6">
			<div class="absolute inset-0 flex items-center">
				<span class="border-border w-full border-t"></span>
			</div>
			<div class="relative flex justify-center text-xs uppercase">
				<span class="bg-background text-muted-foreground px-2">ou</span>
			</div>
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
