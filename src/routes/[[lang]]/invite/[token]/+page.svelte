<script lang="ts">
	import { page } from '$app/state';
	import { resolveRoute } from '$lib/paths';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let loading = $state(false);

	const f = $derived(form as { error?: string } | null);
	const en = $derived(page.url.pathname.startsWith('/en/'));
	const copy = $derived(
		en
			? {
					invalid: 'Invalid link',
					expired: 'This invitation link has expired.',
					exhausted: 'This invitation link has reached its usage limit.',
					revoked: 'This invitation link has been revoked.',
					notFound: 'This invitation link could not be found or is invalid.',
					home: 'Back to home',
					already: 'You are already in this group',
					alreadyMember: 'You are already a member of',
					go: 'Go to group',
					join: 'Join',
					invited: 'You have been invited to join the group',
					joining: 'Joining…',
					joinGroup: 'Join the group',
					loginRequired: 'You must be logged in to join a group.',
					invalidError: 'This invitation link is invalid, expired or exhausted.'
				}
			: {
					invalid: 'Lien invalide',
					expired: 'Ce lien d’invitation a expiré.',
					exhausted: 'Ce lien d’invitation a atteint sa limite d’utilisations.',
					revoked: 'Ce lien d’invitation a été révoqué.',
					notFound: 'Ce lien d’invitation est introuvable ou invalide.',
					home: 'Retour à l’accueil',
					already: 'Tu es déjà dans ce groupe',
					alreadyMember: 'Tu es déjà membre de',
					go: 'Aller au groupe',
					join: 'Rejoindre',
					invited: 'Tu as été invité à rejoindre le groupe',
					joining: 'Rejoindre…',
					joinGroup: 'Rejoindre le groupe',
					loginRequired: 'Vous devez être connecté pour rejoindre un groupe.',
					invalidError: "Ce lien d'invitation est invalide, expiré ou épuisé."
				}
	);
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
					{copy.invalid}
				</h1>
				<p class="text-muted-foreground mt-3" data-testid="invite-invalid-message">
					{#if data.reason === 'expired'}
						{copy.expired}
					{:else if data.reason === 'exhausted'}
						{copy.exhausted}
					{:else if data.reason === 'revoked'}
						{copy.revoked}
					{:else}
						{copy.notFound}
					{/if}
				</p>
			</div>
			<Button href={resolveRoute('/')} variant="outline">{copy.home}</Button>
		{:else if data.alreadyMember}
			<!-- Déjà membre -->
			<div class="mb-6">
				<h1 class="text-foreground text-2xl font-bold" data-testid="invite-already-member-title">
					{copy.already}
				</h1>
				<p class="text-muted-foreground mt-3" data-testid="invite-already-member-message">
					{copy.alreadyMember} <strong>{data.groupName}</strong>.
				</p>
			</div>
			<Button
				href={resolveRoute('/app/groups/[id]', { id: data.groupId ?? '' })}
				data-testid="invite-go-group-btn"
			>
				{copy.go}
			</Button>
		{:else}
			<!-- Invitation valide -->
			<div class="mb-8">
				<h1 class="text-foreground text-2xl font-bold" data-testid="invite-group-name">
					{copy.join} <em>{data.groupName}</em>
				</h1>
				<p class="text-muted-foreground mt-3">
					{copy.invited} <strong>{data.groupName}</strong>.
				</p>
			</div>

			{#if f?.error}
				<div
					class="bg-destructive/10 text-destructive mb-4 rounded-lg px-4 py-3 text-sm"
					data-testid="invite-error"
				>
					{en
						? f.error === 'Vous devez être connecté pour rejoindre un groupe.'
							? copy.loginRequired
							: copy.invalidError
						: f.error}
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
					{loading ? copy.joining : copy.joinGroup}
				</Button>
			</form>
		{/if}
	</div>
</div>
