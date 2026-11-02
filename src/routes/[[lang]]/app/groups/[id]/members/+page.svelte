<script lang="ts">
	import { resolveRoute } from '$lib/paths';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { track } from '$lib/analytics/client';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const english: Record<string, string> = {
		Membres: 'Members',
		"Gérez les membres, les rôles et les droits d'invitation.":
			'Manage members, roles and invitation permissions.',
		'Le membre a été exclu du groupe.': 'The member was removed from the group.',
		'Le membre a été promu admin.': 'The member was promoted to admin.',
		'(vous)': '(you)',
		Membre: 'Member',
		'Peut inviter': 'Can invite',
		'Membre depuis le': 'Member since',
		'Promouvoir admin': 'Promote to admin',
		'Confirmer ?': 'Confirm?',
		Exclure: 'Remove',
		Annuler: 'Cancel',
		'Quitter le groupe': 'Leave group',
		'Vous êtes le dernier admin du groupe. Promouvez un autre membre en admin avant de pouvoir quitter.':
			'You are the last admin in the group. Promote another member to admin before leaving.',
		'Êtes-vous sûr de vouloir quitter le groupe': 'Are you sure you want to leave the group',
		"? Cette action est irréversible (sauf via un nouveau lien d'invitation).":
			'? This action is irreversible (unless you receive a new invitation link).',
		'Quitter définitivement': 'Leave permanently',
		"Vous pouvez quitter ce groupe à tout moment. Vos paris en cours continueront d'être actifs.":
			'You can leave this group at any time. Your current bets will remain active.',
		'Non authentifié.': 'Not signed in.',
		'Groupe invalide.': 'Invalid group.',
		'Paramètres invalides.': 'Invalid parameters.',
		'Accès refusé.': 'Access denied.',
		'Seul un admin peut exclure un membre.': 'Only an admin can remove a member.',
		'Membre introuvable.': 'Member not found.',
		"Impossible d'exclure un admin.": 'An admin cannot be removed.',
		'Vous êtes le dernier admin. Promouvez un autre membre avant de quitter.':
			'You are the last admin. Promote another member before leaving.',
		'Accès refusé — seul un admin peut promouvoir un membre.':
			'Access denied — only an admin can promote a member.',
		'Ce membre est déjà admin.': 'This member is already an admin.'
	};
	const isEnglish = $derived(data.lang === 'en');
	function t(text: string): string {
		return isEnglish ? (english[text] ?? text) : text;
	}

	function localError(message: string): string {
		return isEnglish ? (english[message] ?? 'Unable to update the group member.') : message;
	}

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
		<h1 class="text-foreground text-2xl font-bold bw-display" data-testid="members-title">
			{t('Membres')} ({data.members.length})
		</h1>
		{#if data.group.role === 'admin'}
			<p class="text-muted-foreground mt-1 text-sm">
				{t("Gérez les membres, les rôles et les droits d'invitation.")}
			</p>
		{/if}
	</div>

	<!-- Message d'erreur global -->
	{#if f?.error}
		<div
			class="bg-destructive/10 text-destructive mb-4 rounded-lg px-4 py-3 text-sm"
			data-testid="members-error"
		>
			{localError(f.error)}
		</div>
	{/if}

	<!-- Message succès -->
	{#if f?.kicked}
		<div
			class="bg-green-50 text-green-700 mb-4 rounded-lg px-4 py-3 text-sm"
			data-testid="members-success"
		>
			{t('Le membre a été exclu du groupe.')}
		</div>
	{/if}
	{#if f?.promoted}
		<div
			class="bg-green-50 text-green-700 mb-4 rounded-lg px-4 py-3 text-sm"
			data-testid="members-success-promoted"
		>
			{t('Le membre a été promu admin.')}
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
										<span class="text-muted-foreground text-xs">{t('(vous)')}</span>
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
										{t('Membre')}
									</span>
								{/if}

								<!-- Badge can_invite -->
								{#if member.canInvite && member.role !== 'admin'}
									<span
										class="bg-green-100 text-green-700 rounded-full px-2 py-0.5 text-xs font-medium"
										data-testid="member-can-invite-badge"
									>
										{t('Peut inviter')}
									</span>
								{/if}
							</div>
							<p class="text-muted-foreground mt-0.5 text-xs">
								{t('Membre depuis le')}
								{new Date(member.joinedAt).toLocaleDateString(isEnglish ? 'en-GB' : 'fr-FR', {
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
										{t('Promouvoir admin')}
									</Button>
								</form>
							{/if}

							<!-- Bouton exclure (admin sur un membre non-admin, pas soi-même) -->
							{#if isAdmin && !isTargetAdmin && !isSelf}
								{#if confirmKickUserId === member.userId}
									<div class="flex items-center gap-2">
										<span class="text-muted-foreground text-xs">{t('Confirmer ?')}</span>
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
												{t('Exclure')}
											</Button>
										</form>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onclick={() => (confirmKickUserId = null)}
										>
											{t('Annuler')}
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
										{t('Exclure')}
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
		<h2 class="text-foreground mb-2 text-lg font-semibold">{t('Quitter le groupe')}</h2>

		{#if isLastAdmin}
			<p class="text-muted-foreground mb-4 text-sm" data-testid="last-admin-warning">
				{t(
					'Vous êtes le dernier admin du groupe. Promouvez un autre membre en admin avant de pouvoir quitter.'
				)}
			</p>
			<Button variant="outline" disabled data-testid="leave-btn">{t('Quitter le groupe')}</Button>
		{:else if confirmLeave}
			<p class="text-foreground mb-4 text-sm">
				{t('Êtes-vous sûr de vouloir quitter le groupe')} <strong>{data.group.name}</strong>
				{t("? Cette action est irréversible (sauf via un nouveau lien d'invitation).")}
			</p>
			<div class="flex gap-3">
				<form method="POST" action="?/leave" use:enhance>
					<Button type="submit" variant="destructive" data-testid="confirm-leave-btn">
						{t('Quitter définitivement')}
					</Button>
				</form>
				<Button
					type="button"
					variant="outline"
					onclick={() => (confirmLeave = false)}
					data-testid="cancel-leave-btn"
				>
					{t('Annuler')}
				</Button>
			</div>
		{:else}
			<p class="text-muted-foreground mb-4 text-sm">
				{t(
					"Vous pouvez quitter ce groupe à tout moment. Vos paris en cours continueront d'être actifs."
				)}
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
				{t('Quitter le groupe')}
			</Button>
		{/if}
	</section>
</div>
