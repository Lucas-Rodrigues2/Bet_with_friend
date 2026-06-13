<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolveRoute } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { createSupabaseBrowserClient } from '$lib/supabase';
	import { onMount } from 'svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let loading = $state(false);
	let sessionReady = $state(false);
	let sessionError = $state('');

	const f = $derived(
		form as {
			errors?: Record<string, string[]>;
			message?: string;
		} | null
	);

	const forgotHref = resolveRoute('/forgot-password');

	onMount(async () => {
		// Supabase sends the recovery token in the URL fragment.
		// We let the browser client pick it up automatically.
		const supabase = createSupabaseBrowserClient();
		const { data, error } = await supabase.auth.getSession();

		if (error || !data.session) {
			// Try to exchange the token from the hash
			const hashParams = new URLSearchParams(window.location.hash.slice(1));
			const accessToken = hashParams.get('access_token');
			const refreshToken = hashParams.get('refresh_token');
			const type = hashParams.get('type');

			if (type === 'recovery' && accessToken && refreshToken) {
				const { error: sessionErr } = await supabase.auth.setSession({
					access_token: accessToken,
					refresh_token: refreshToken
				});
				if (sessionErr) {
					sessionError = 'Le lien de réinitialisation est invalide ou expiré.';
				} else {
					sessionReady = true;
				}
			} else {
				sessionError = 'Le lien de réinitialisation est invalide ou expiré.';
			}
		} else {
			sessionReady = true;
		}
	});
</script>

<div
	class="container mx-auto flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 py-16"
>
	<div class="w-full max-w-md">
		<div class="mb-8 text-center">
			<h1 class="text-foreground text-3xl font-bold">Nouveau mot de passe</h1>
			<p class="text-muted-foreground mt-2">Choisissez un nouveau mot de passe sécurisé.</p>
		</div>

		{#if sessionError}
			<div class="bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm text-center">
				{sessionError}
			</div>
			<p class="text-muted-foreground mt-4 text-center text-sm">
				<a href={forgotHref} class="text-primary hover:underline"> Demander un nouveau lien </a>
			</p>
		{:else}
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
					<Label for="password">Nouveau mot de passe</Label>
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

				<div class="flex flex-col gap-1.5">
					<Label for="passwordConfirm">Confirmer le mot de passe</Label>
					<Input
						id="passwordConfirm"
						name="passwordConfirm"
						type="password"
						placeholder="••••••••"
						autocomplete="new-password"
						required
					/>
					{#if f?.errors?.passwordConfirm}
						<p class="text-destructive text-sm">{f.errors.passwordConfirm[0]}</p>
					{/if}
				</div>

				<Button type="submit" class="mt-2 w-full" disabled={loading || !sessionReady}>
					{loading ? 'Mise à jour…' : 'Mettre à jour le mot de passe'}
				</Button>
			</form>
		{/if}
	</div>
</div>
