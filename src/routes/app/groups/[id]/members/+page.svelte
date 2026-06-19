<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { track } from '$lib/analytics/client';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const groupHref = $derived(resolveRoute('/app/groups/[id]', { id: data.group.id }));

	// Résultats du formulaire
	const f = $derived(
		form as {
			error?: string;
			kicked?: boolean;
			promoted?: boolean;
		} | null
	);

	// State pour les confirmations
	let confirmLeave = $state(false);
	let confirmKickUserId = $state<string | null>(null);

	// Nombre d'admins actifs
	const adminCount = $derived(data.members.filter((m) => m.role === 'admin').length);

	// L'utilisateur courant
	const currentMember = $derived(data.members.find((m) => m.userId === data.currentUserId));
	const isAdmin = $derived(currentMember?.role === 'admin');

	// L'utilisateur courant est-il le dernier admin ?
	const isLastAdmin = $derived(isAdmin && adminCount === 1);
</script>

<div class="container mx-auto max-w-3xl px-4 py-10">
	<!-- Navigation retour -->
	<div class="mb-6">
		<a
			href={groupHref}
			class="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
		>
			← {data.group.name}
		</a>
	</div>

	<!-- En-tête -->
	<div class="mb-8">
		<h1 class="text-foreground text-2xl font-bold" data-testid="members-title">
			Membres ({data.members.length})
		</h1>
		{#if data.group.role === 'admin'}
			<p class="text-muted-foreground mt-1 text-sm">
				Gérez les membres, les rôles et les droits d'invitation.
			</p>
		{/if}
	</div>

	<!-- Message d'erreur global -->
	{#if f?.error}
		<div
			class="bg-destructive/10 text-destructive mb-4 rounded-lg px-4 py-3 text-sm"
			data-testid="members-error"
		>
			{f.error}
		</div>
	{/if}

	<!-- Message succès -->
	{#if f?.kicked}
		<div
			class="bg-green-50 text-green-700 mb-4 rounded-lg px-4 py-3 text-sm"
			data-testid="members-success"
		>
			Le membre a été exclu du groupe.
		</div>
	{/if}
	{#if f?.promoted}
		<div
			class="bg-green-50 text-green-700 mb-4 rounded-lg px-4 py-3 text-sm"
			data-testid="members-success-promoted"
		>
			Le membre a été promu admin.
		</div>
	{/if}

	<!-- Liste des membres -->
	<section data-testid="members-list-section">
		<ul class="flex flex-col gap-3" data-testid="members-list">
			{#each data.members as member (member.userId)}
				{@const isSelf = member.userId === data.currentUserId}
				{@const isTargetAdmin = member.role === 'admin'}
				<li
					class="border-border bg-card rounded-lg border p-4"
					data-testid="member-item"
					data-member-id={member.userId}
				>
					<div class="flex items-center gap-3">
						<!-- Avatar -->
						{#if member.avatarUrl}
							<img
								src={member.avatarUrl}
								alt={member.pseudo}
								class="h-10 w-10 rounded-full object-cover"
							/>
						{:else}
							<div
								class="bg-muted text-muted-foreground flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium"
								aria-hidden="true"
							>
								{member.pseudo.charAt(0).toUpperCase()}
							</div>
						{/if}

						<!-- Infos membre -->
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2 flex-wrap">
								<span class="text-foreground font-medium" data-testid="member-pseudo">
									{member.pseudo}
									{#if isSelf}
										<span class="text-muted-foreground text-xs">(vous)</span>
									{/if}
								</span>

								<!-- Badge rôle -->
								{#if member.role === 'admin'}
									<span
										class="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium"
										data-testid="member-role-badge"
									>
										Admin
									</span>
								{:else}
									<span
										class="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium"
										data-testid="member-role-badge"
									>
										Membre
									</span>
								{/if}

								<!-- Badge can_invite -->
								{#if member.canInvite && member.role !== 'admin'}
									<span
										class="bg-green-100 text-green-700 rounded-full px-2 py-0.5 text-xs font-medium"
										data-testid="member-can-invite-badge"
									>
										Peut inviter
									</span>
								{/if}
							</div>
							<p class="text-muted-foreground mt-0.5 text-xs">
								Membre depuis le {new Date(member.joinedAt).toLocaleDateString('fr-FR', {
									day: 'numeric',
									month: 'long',
									year: 'numeric'
								})}
							</p>
						</div>

						<!-- Actions admin -->
						<div class="flex items-center gap-2 shrink-0">
							<!-- Bouton promouvoir (admin sur un membre non-admin, pas soi-même) -->
							{#if isAdmin && !isTargetAdmin && !isSelf}
								<form
									method="POST"
									action="?/promote"
									use:enhance={() => {
										return async ({ update }) => {
											await update({ reset: false });
										};
									}}
								>
									<input type="hidden" name="targetUserId" value={member.userId} />
									<Button
										type="submit"
										variant="outline"
										size="sm"
										data-testid="promote-btn-{member.userId}"
									>
										Promouvoir admin
									</Button>
								</form>
							{/if}

							<!-- Bouton exclure (admin sur un membre non-admin, pas soi-même) -->
							{#if isAdmin && !isTargetAdmin && !isSelf}
								{#if confirmKickUserId === member.userId}
									<div class="flex items-center gap-2">
										<span class="text-muted-foreground text-xs">Confirmer ?</span>
										<form
											method="POST"
											action="?/kick"
											use:enhance={() => {
												confirmKickUserId = null;
												return async ({ update }) => {
													await update({ reset: false });
												};
											}}
										>
											<input type="hidden" name="targetUserId" value={member.userId} />
											<Button
												type="submit"
												variant="destructive"
												size="sm"
												data-testid="confirm-kick-btn-{member.userId}"
											>
												Exclure
											</Button>
										</form>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onclick={() => (confirmKickUserId = null)}
										>
											Annuler
										</Button>
									</div>
								{:else}
									<Button
										type="button"
										variant="outline"
										size="sm"
										onclick={() => {
											confirmKickUserId = member.userId;
											track('kick_confirm_opened', {
												group_id: data.group.id,
												target_user_id: member.userId
											});
										}}
										data-testid="kick-btn-{member.userId}"
									>
										Exclure
									</Button>
								{/if}
							{/if}
						</div>
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<!-- Section Quitter le groupe -->
	<section class="mt-10 border-t pt-8" data-testid="leave-section">
		<h2 class="text-foreground mb-2 text-lg font-semibold">Quitter le groupe</h2>

		{#if isLastAdmin}
			<p class="text-muted-foreground mb-4 text-sm" data-testid="last-admin-warning">
				Vous êtes le dernier admin du groupe. Promouvez un autre membre en admin avant de pouvoir
				quitter.
			</p>
			<Button variant="outline" disabled data-testid="leave-btn">Quitter le groupe</Button>
		{:else if confirmLeave}
			<p class="text-foreground mb-4 text-sm">
				Êtes-vous sûr de vouloir quitter le groupe <strong>{data.group.name}</strong> ? Cette action est
				irréversible (sauf via un nouveau lien d'invitation).
			</p>
			<div class="flex gap-3">
				<form method="POST" action="?/leave" use:enhance>
					<Button type="submit" variant="destructive" data-testid="confirm-leave-btn">
						Quitter définitivement
					</Button>
				</form>
				<Button
					type="button"
					variant="outline"
					onclick={() => (confirmLeave = false)}
					data-testid="cancel-leave-btn"
				>
					Annuler
				</Button>
			</div>
		{:else}
			<p class="text-muted-foreground mb-4 text-sm">
				Vous pouvez quitter ce groupe à tout moment. Vos paris en cours continueront d'être actifs.
			</p>
			<Button
				type="button"
				variant="outline"
				onclick={() => {
					confirmLeave = true;
					track('leave_confirm_opened', { group_id: data.group.id });
				}}
				data-testid="leave-btn"
			>
				Quitter le groupe
			</Button>
		{/if}
	</section>
</div>
