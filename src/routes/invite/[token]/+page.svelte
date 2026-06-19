<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let loading = $state(false);

	const f = $derived(form as { error?: string } | null);
</script>

<div
	class="container mx-auto flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 py-16"
>
	<div class="w-full max-w-md text-center">
		{#if data.invalid}
			<!-- Lien invalide -->
			<div class="mb-6">
				<div
					class="bg-destructive/10 text-destructive mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-3xl"
					aria-hidden="true"
				>
					✕
				</div>
				<h1 class="text-foreground text-2xl font-bold" data-testid="invite-invalid-title">
					Lien invalide
				</h1>
				<p class="text-muted-foreground mt-3" data-testid="invite-invalid-message">
					{#if data.reason === 'expired'}
						Ce lien d'invitation a expiré.
					{:else if data.reason === 'exhausted'}
						Ce lien d'invitation a atteint sa limite d'utilisations.
					{:else if data.reason === 'revoked'}
						Ce lien d'invitation a été révoqué.
					{:else}
						Ce lien d'invitation est introuvable ou invalide.
					{/if}
				</p>
			</div>
			<Button href="/" variant="outline">Retour à l'accueil</Button>
		{:else if data.alreadyMember}
			<!-- Déjà membre -->
			<div class="mb-6">
				<h1 class="text-foreground text-2xl font-bold" data-testid="invite-already-member-title">
					Tu es déjà dans ce groupe
				</h1>
				<p class="text-muted-foreground mt-3" data-testid="invite-already-member-message">
					Tu es déjà membre de <strong>{data.groupName}</strong>.
				</p>
			</div>
			<Button href="/app/groups/{data.groupId}" data-testid="invite-go-group-btn">
				Aller au groupe
			</Button>
		{:else}
			<!-- Invitation valide -->
			<div class="mb-8">
				<h1 class="text-foreground text-2xl font-bold" data-testid="invite-group-name">
					Rejoindre <em>{data.groupName}</em>
				</h1>
				<p class="text-muted-foreground mt-3">
					Tu as été invité à rejoindre le groupe <strong>{data.groupName}</strong>.
				</p>
			</div>

			{#if f?.error}
				<div
					class="bg-destructive/10 text-destructive mb-4 rounded-lg px-4 py-3 text-sm"
					data-testid="invite-error"
				>
					{f.error}
				</div>
			{/if}

			<form
				method="POST"
				action="?/join"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
			>
				<Button type="submit" class="w-full" disabled={loading} data-testid="invite-join-btn">
					{loading ? 'Rejoindre…' : 'Rejoindre le groupe'}
				</Button>
			</form>
		{/if}
	</div>
</div>
