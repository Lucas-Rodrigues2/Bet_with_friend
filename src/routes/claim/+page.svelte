<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolveRoute } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { ActionData, PageData } from './$types';

	let { form, data }: { form: ActionData; data: PageData } = $props();

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
</script>

<div
	class="container mx-auto flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 py-16"
>
	<div class="w-full max-w-md">
		{#if f?.success}
			<div class="text-center">
				<div class="mb-4 text-5xl">✅</div>
				<h1 class="text-foreground text-2xl font-bold">Compte sécurisé !</h1>
				<p class="text-muted-foreground mt-3 leading-relaxed">
					Un email de confirmation a été envoyé à <strong>{f.email}</strong>.<br />
					Cliquez sur le lien pour finaliser la liaison de votre compte.
				</p>
				<p class="text-muted-foreground mt-4 text-sm">
					Votre historique et vos groupes sont préservés.
				</p>
				<div class="mt-6">
					<Button href={homeHref}>Retour à l'accueil</Button>
				</div>
			</div>
		{:else}
			<div class="mb-8 text-center">
				<div class="mb-3 text-5xl">🔒</div>
				<h1 class="text-foreground text-3xl font-bold">Sécurise ton compte</h1>
				<p class="text-muted-foreground mt-2">
					Bonjour <strong>{data.pseudo}</strong> ! Lie un email ou Google pour conserver ton historique
					pour toujours.
				</p>
			</div>

			<!-- Google linking -->
			<div class="mb-6">
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
					<Button type="submit" variant="outline" class="w-full gap-2" disabled={googleLoading}>
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
						{googleLoading ? 'Redirection…' : 'Lier avec Google'}
					</Button>
				</form>
			</div>

			<div class="relative mb-6">
				<div class="absolute inset-0 flex items-center">
					<span class="border-border w-full border-t"></span>
				</div>
				<div class="relative flex justify-center text-xs uppercase">
					<span class="bg-background text-muted-foreground px-2">ou</span>
				</div>
			</div>

			<!-- Email/password linking -->
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
					<Label for="password">Choisir un mot de passe</Label>
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
					{loading ? 'Sécurisation…' : 'Sécuriser avec email'}
				</Button>
			</form>

			<p class="text-muted-foreground mt-6 text-center text-sm">
				Tu pourras ensuite te connecter avec ces identifiants et retrouver ton historique.
			</p>
		{/if}
	</div>
</div>
