<script lang="ts">
	import { page } from '$app/state';
	const english = $derived(page.url.pathname === '/en' || page.url.pathname.startsWith('/en/'));
	function t(fr: string, en: string) {
		return english ? en : fr;
	}
	import { enhance } from '$app/forms';
	import { resolveRoute } from '$lib/paths';
	import { untrack } from 'svelte';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { track } from '$lib/analytics/client';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const groupHref = $derived(resolveRoute('/app/groups/[id]', { id: data.groupId }));

	// Form state
	let stakeType = $state<'points' | 'forfeit'>('points');
	let loading = $state(false);

	// Visibility & jury multi-select state
	// Creator is always included in visibility
	// currentUserId is a server-provided constant for this page session
	const currentUserId = $derived(data.currentUserId);
	// Use $state objects for bidirectional bind:checked binding.
	// Svelte 5 tracks property mutations through its proxy mechanism.
	let visibilitySelected = $state<Record<string, boolean>>({});
	$effect(() => {
		// Ensure the creator is always selected (runs once on mount and if currentUserId changes)
		if (currentUserId) {
			visibilitySelected[currentUserId] = true;
		}
	});
	let jurySelected = $state<Record<string, boolean>>({});

	// Error from form action
	const errorMsg = $derived((form as { error?: string } | null)?.error ?? null);

	// Field errors
	const fieldErrors = $derived(
		(form as { fieldErrors?: Record<string, string[]> } | null)?.fieldErrors ?? null
	);

	// Recover previous values if form failed
	const prevValues = $derived((form as { values?: Record<string, string> } | null)?.values ?? null);

	// Form field state — initialized one-shot from form values (untrack) to avoid re-render
	// wiping user input when the $effect for visibilitySelected triggers a reactive update.
	const initialValues = untrack(
		() => (form as { values?: Record<string, string> } | null)?.values ?? null
	);
	let titleValue = $state(initialValues?.title ?? '');
	let descriptionValue = $state(initialValues?.description ?? '');
	let stakeAmountValue = $state(initialValues?.stakeAmount ?? '');
	let forfeitDescriptionValue = $state(initialValues?.forfeitDescription ?? '');
	let participationDeadlineValue = $state(initialValues?.participationDeadline ?? '');

	// Deadline min: now (datetime-local format)
	// Returns a string like '2024-01-15T10:30' for use in datetime-local input
	function nowDatetimeLocal(): string {
		// Format current time as YYYY-MM-DDThh:mm without using mutable Date instance
		const now = Date.now();
		const isoStr = new Date(now).toISOString();
		return isoStr.slice(0, 16);
	}

	function memberLabel(m: (typeof data.members)[0]) {
		return m.userId === data.currentUserId ? `${m.pseudo}${t(' (moi)', ' (me)')}` : m.pseudo;
	}

	// Track closest form opened — émis une seule fois au montage côté client
	onMount(() => {
		track('closest_form_opened', { group_id: data.groupId });
	});

	function localizeError(message: string): string {
		if (!english) return message;
		const messages: Record<string, string> = {
			'Le titre est obligatoire.': 'A title is required.',
			'Le choix A est obligatoire.': 'Choice A is required.',
			'Le choix B est obligatoire.': 'Choice B is required.',
			'Les deux choix doivent être différents.': 'The two choices must be different.',
			'La mise du créateur doit être supérieure à 0.':
				"The creator's stake must be greater than 0.",
			'La mise de la cible doit être supérieure à 0.':
				"The opponent's stake must be greater than 0.",
			'Le gage du créateur est obligatoire.': "The creator's forfeit is required.",
			'Le gage de la cible est obligatoire.': "The opponent's forfeit is required.",
			"Le nombre max d'adversaires est obligatoire.":
				'The maximum number of opponents is required.',
			"Le nombre max d'adversaires doit être au moins 1.":
				'The maximum number of opponents must be at least 1.',
			'La mise des adversaires doit être supérieure à 0.':
				"The opponents' stake must be greater than 0.",
			'Le gage des adversaires est obligatoire.': "The opponents' forfeit is required.",
			'Le montant doit être supérieur à 0.': 'The amount must be greater than 0.',
			'La description du gage est obligatoire.': 'A forfeit description is required.',
			'Le périmètre du gage est obligatoire.': 'Choose who forfeits.',
			'Non authentifié.': 'Not authenticated.',
			'Groupe invalide.': 'Invalid group.',
			'Accès refusé.': 'Access denied.',
			'Le jury doit avoir au moins un membre.': 'The jury must have at least one member.',
			'Un ou plusieurs jurés sont invalides.': 'One or more jurors are invalid.',
			'Le défi doit être visible par au moins un autre membre.':
				'The challenge must be visible to at least one other member.',
			'Erreur lors de la création du défi ouvert.': 'Could not create the open challenge.',
			'Vous ne pouvez pas vous défier vous-même.': 'You cannot challenge yourself.',
			"La cible sélectionnée n'est pas un membre actif du groupe.":
				'The selected opponent is not an active group member.',
			'Erreur lors de la création du duel.': 'Could not create the duel.',
			'Un ou plusieurs membres de visibilité sont invalides.':
				'One or more selected members are invalid.',
			'Date limite invalide.': 'Invalid deadline.',
			'La date limite doit être dans le futur.': 'The deadline must be in the future.',
			'Erreur lors de la création du pari.': 'Could not create the bet.'
		};
		return messages[message] ?? 'Please check the form and try again.';
	}
</script>

<div class="container mx-auto max-w-2xl px-4 py-10">
	<div class="mb-6">
		<a
			href={groupHref}
			class="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
		>
			{t('← Retour au groupe', '← Back to group')}
		</a>
	</div>

	<h1 class="text-foreground mb-6 text-2xl font-bold bw-display">
		{t('Nouveau pari « au plus proche »', 'New closest guess bet')}
	</h1>

	{#if errorMsg}
		<div
			class="bg-destructive/10 text-destructive mb-4 rounded-md px-4 py-3 text-sm"
			data-testid="form-error"
		>
			{localizeError(errorMsg)}
		</div>
	{/if}

	<form
		method="POST"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				loading = false;
				await update();
			};
		}}
		class="flex flex-col gap-6"
		data-testid="closest-bet-form"
	>
		<!-- Titre -->
		<div class="flex flex-col gap-1">
			<label for="title" class="text-foreground text-sm font-medium"
				>{t('Titre', 'Title')} <span class="text-destructive">*</span></label
			>
			<input
				id="title"
				name="title"
				type="text"
				required
				placeholder={t('Ex : Combien de buts dans le match ?', 'e.g. How many goals in the match?')}
				bind:value={titleValue}
				class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				data-testid="input-title"
			/>
			{#if fieldErrors?.title}
				<p class="text-destructive text-xs">{localizeError(fieldErrors.title[0])}</p>
			{/if}
		</div>

		<!-- Description -->
		<div class="flex flex-col gap-1">
			<label for="description" class="text-foreground text-sm font-medium"
				>{t('Description (optionnelle)', 'Description (optional)')}</label
			>
			<textarea
				id="description"
				name="description"
				rows="3"
				placeholder={t('Précisez les règles, le contexte…', 'Add rules or context…')}
				class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				data-testid="input-description"
				bind:value={descriptionValue}
			></textarea>
		</div>

		<!-- Type de mise -->
		<fieldset class="flex flex-col gap-3">
			<legend class="text-foreground mb-1 text-sm font-medium"
				>{t('Type de mise', 'Stake type')} <span class="text-destructive">*</span></legend
			>
			<div class="flex gap-4">
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<input
						type="radio"
						name="stakeType"
						value="points"
						checked={stakeType === 'points'}
						onchange={() => (stakeType = 'points')}
						data-testid="stake-type-points"
					/>
					Points
				</label>
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<input
						type="radio"
						name="stakeType"
						value="forfeit"
						checked={stakeType === 'forfeit'}
						onchange={() => (stakeType = 'forfeit')}
						data-testid="stake-type-forfeit"
					/>
					{t('Gage', 'Forfeit')}
				</label>
			</div>

			{#if stakeType === 'points'}
				<div class="flex flex-col gap-1">
					<label for="stakeAmount" class="text-foreground text-sm font-medium">
						{t('Montant (en', 'Amount (in')}
						{data.currency}) <span class="text-destructive">*</span>
					</label>
					<input
						id="stakeAmount"
						name="stakeAmount"
						type="number"
						min="0.01"
						step="0.01"
						placeholder="10"
						bind:value={stakeAmountValue}
						class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						data-testid="input-stake-amount"
					/>
					{#if fieldErrors?.stakeAmount}
						<p class="text-destructive text-xs">{localizeError(fieldErrors.stakeAmount[0])}</p>
					{/if}
				</div>
			{:else}
				<div class="flex flex-col gap-3">
					<div class="flex flex-col gap-1">
						<label for="forfeitDescription" class="text-foreground text-sm font-medium">
							{t('Description du gage', 'Forfeit description')}
							<span class="text-destructive">*</span>
						</label>
						<textarea
							id="forfeitDescription"
							name="forfeitDescription"
							rows="2"
							placeholder={t(
								'Ex : Faire la vaisselle pendant une semaine',
								'e.g. Do the dishes for a week'
							)}
							class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							data-testid="input-forfeit-description"
							bind:value={forfeitDescriptionValue}
						></textarea>
						{#if fieldErrors?.forfeitDescription}
							<p class="text-destructive text-xs">
								{localizeError(fieldErrors.forfeitDescription[0])}
							</p>
						{/if}
					</div>

					<fieldset class="flex flex-col gap-2">
						<legend class="text-foreground text-sm font-medium">
							{t('Périmètre du gage', 'Who forfeits')} <span class="text-destructive">*</span>
						</legend>
						<label class="flex cursor-pointer items-center gap-2 text-sm">
							<input
								type="radio"
								name="forfeitScope"
								value="all_losers"
								checked={!prevValues?.forfeitScope || prevValues.forfeitScope === 'all_losers'}
								data-testid="forfeit-scope-all"
							/>
							{t('Tous les perdants', 'All losers')}
						</label>
						<label class="flex cursor-pointer items-center gap-2 text-sm">
							<input
								type="radio"
								name="forfeitScope"
								value="last_one"
								checked={prevValues?.forfeitScope === 'last_one'}
								data-testid="forfeit-scope-last"
							/>
							{t('Le dernier seulement', 'Only the last player')}
						</label>
						{#if fieldErrors?.forfeitScope}
							<p class="text-destructive text-xs">{localizeError(fieldErrors.forfeitScope[0])}</p>
						{/if}
					</fieldset>
				</div>
			{/if}
		</fieldset>

		<!-- Cacher les réponses -->
		<div class="flex items-center gap-2">
			<input
				id="hideAnswers"
				name="hideAnswers"
				type="checkbox"
				checked={prevValues ? prevValues.hideAnswers === 'on' : true}
				class="h-4 w-4 rounded border-border"
				data-testid="input-hide-answers"
			/>
			<label for="hideAnswers" class="text-foreground cursor-pointer text-sm">
				{t("Cacher les réponses jusqu'à la clôture", 'Hide answers until participation closes')}
			</label>
		</div>

		<!-- Deadline -->
		<div class="flex flex-col gap-1">
			<label for="participationDeadline" class="text-foreground text-sm font-medium">
				{t('Date limite de participation (optionnelle)', 'Participation deadline (optional)')}
			</label>
			<input
				id="participationDeadline"
				name="participationDeadline"
				type="datetime-local"
				min={nowDatetimeLocal()}
				bind:value={participationDeadlineValue}
				class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
				data-testid="input-deadline"
			/>
			{#if fieldErrors?.participationDeadline}
				<p class="text-destructive text-xs">
					{localizeError(fieldErrors.participationDeadline[0])}
				</p>
			{/if}
		</div>

		<!-- Visibilité -->
		<fieldset class="flex flex-col gap-2">
			<legend class="text-foreground mb-1 text-sm font-medium">
				{t('Qui peut voir ce pari ?', 'Who can see this bet?')}
				<span class="text-destructive">*</span>
			</legend>
			<p class="text-muted-foreground text-xs">
				{t(
					'Le créateur est toujours inclus. La liste sera figée à la création.',
					'The creator is always included. The list is fixed when the bet is created.'
				)}
			</p>
			<div
				class="border-border rounded-md border divide-y divide-border"
				data-testid="visibility-list"
			>
				{#each data.members as member (member.userId)}
					<label
						class="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent/50 {member.userId ===
						data.currentUserId
							? 'opacity-70'
							: ''}"
						data-testid="visibility-member-{member.userId}"
					>
						<input
							type="checkbox"
							name="visibilityUserIds"
							value={member.userId}
							bind:checked={visibilitySelected[member.userId]}
							disabled={member.userId === data.currentUserId}
							class="h-4 w-4 rounded border-border"
						/>
						<span class="text-foreground text-sm">{memberLabel(member)}</span>
					</label>
				{/each}
			</div>
		</fieldset>

		<!-- Jury -->
		<fieldset class="flex flex-col gap-2">
			<legend class="text-foreground mb-1 text-sm font-medium">
				{t('Jury (≥ 1 membre)', 'Jury (≥ 1 member)')} <span class="text-destructive">*</span>
			</legend>
			<p class="text-muted-foreground text-xs">
				{t(
					'Les jurés désignent le(s) gagnant(s). Un juré peut aussi participer.',
					'The jurors choose the winner(s). A juror may also participate.'
				)}
			</p>
			<div class="border-border rounded-md border divide-y divide-border" data-testid="jury-list">
				{#each data.members as member (member.userId)}
					<label
						class="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent/50"
						data-testid="jury-member-{member.userId}"
					>
						<input
							type="checkbox"
							name="juryUserIds"
							value={member.userId}
							bind:checked={jurySelected[member.userId]}
							class="h-4 w-4 rounded border-border"
						/>
						<span class="text-foreground text-sm">{memberLabel(member)}</span>
					</label>
				{/each}
			</div>
			{#if fieldErrors?.juryUserIds}
				<p class="text-destructive text-xs">{localizeError(fieldErrors.juryUserIds[0])}</p>
			{/if}
		</fieldset>

		<!-- Mode jury -->
		<fieldset class="flex flex-col gap-2">
			<legend class="text-foreground mb-1 text-sm font-medium"
				>{t('Mode du jury', 'Jury decision rule')} <span class="text-destructive">*</span></legend
			>
			<div class="flex gap-4">
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<input
						type="radio"
						name="juryMode"
						value="majority"
						checked={!prevValues?.juryMode || prevValues.juryMode === 'majority'}
						data-testid="jury-mode-majority"
					/>
					{t('Majorité', 'Majority')}
				</label>
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<input
						type="radio"
						name="juryMode"
						value="unanimous"
						checked={prevValues?.juryMode === 'unanimous'}
						data-testid="jury-mode-unanimous"
					/>
					{t('Unanimité', 'Unanimity')}
				</label>
			</div>
		</fieldset>

		<!-- Submit -->
		<div class="flex gap-3 pt-2">
			<Button type="submit" disabled={loading} data-testid="submit-btn">
				{loading ? t('Création…', 'Creating…') : t('Créer le pari', 'Create bet')}
			</Button>
			<Button type="button" variant="outline" href={groupHref} disabled={loading}
				>{t('Annuler', 'Cancel')}</Button
			>
		</div>
	</form>
</div>
