<script lang="ts">
	import { page } from '$app/state';
	const english = $derived(page.url.pathname === '/en' || page.url.pathname.startsWith('/en/'));
	function t(fr: string, en: string) {
		return english ? en : fr;
	}
	import { enhance } from '$app/forms';
	import { resolveRoute } from '$lib/paths';
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { track } from '$lib/analytics/client';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const groupHref = $derived(resolveRoute('/app/groups/[id]', { id: data.groupId }));

	// Mode toggle: 'duel' or 'open'
	let mode = $state<'duel' | 'open'>('duel');

	// Form state
	let stakeType = $state<'points' | 'forfeit'>('points');
	let creatorSide = $state<'a' | 'b'>('a');
	let loading = $state(false);

	// Jury multi-select state
	let jurySelected = $state<Record<string, boolean>>({});

	// Visibility multi-select state (open mode)
	let visibilitySelected = $state<Record<string, boolean>>({});

	// Error from form action
	const errorMsg = $derived((form as { error?: string } | null)?.error ?? null);

	// Field errors
	const fieldErrors = $derived(
		(form as { fieldErrors?: Record<string, string[]> } | null)?.fieldErrors ?? null
	);

	// Recover previous values if form failed
	const initialValues = untrack(
		() => (form as { values?: Record<string, string> } | null)?.values ?? null
	);

	// Restore mode from failed form submission
	$effect(() => {
		if (initialValues?.mode === 'open') mode = 'open';
	});

	let titleValue = $state(initialValues?.title ?? '');
	let descriptionValue = $state(initialValues?.description ?? '');
	let choiceAValue = $state(initialValues?.choiceA ?? '');
	let choiceBValue = $state(initialValues?.choiceB ?? '');
	let stakeCreatorValue = $state(initialValues?.stakeCreator ?? '');
	let stakeTargetValue = $state(initialValues?.stakeTarget ?? '');
	let stakeOpponentValue = $state(initialValues?.stakeOpponent ?? '');
	let forfeitCreatorValue = $state(initialValues?.forfeitCreator ?? '');
	let forfeitTargetValue = $state(initialValues?.forfeitTarget ?? '');
	let forfeitOpponentValue = $state(initialValues?.forfeitOpponent ?? '');
	let targetIdValue = $state(initialValues?.targetId ?? '');
	let maxOpponentsValue = $state(initialValues?.maxOpponents ?? '1');

	// Derive the selected target member for display
	const selectedTarget = $derived(
		data.otherMembers.find((m) => m.userId === targetIdValue) ?? null
	);

	// Derive what the target side label is
	const targetSide = $derived(creatorSide === 'a' ? 'B' : 'A');
	const targetSideChoice = $derived(creatorSide === 'a' ? choiceBValue : choiceAValue);
	const creatorSideChoice = $derived(creatorSide === 'a' ? choiceAValue : choiceBValue);

	// Track duel form opened — read group_id reactively so Svelte doesn't optimize away
	$effect(() => {
		const groupId = data.groupId;
		track('duel_form_opened', { group_id: groupId, mode });
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

	<h1 class="text-foreground mb-2 text-2xl font-bold bw-display">
		{t('Nouveau défi', 'New challenge')}
	</h1>
	<p class="text-muted-foreground mb-6 text-sm">
		{t(
			'Choisissez le mode : duel direct ou défi ouvert à plusieurs.',
			'Choose a mode: a direct duel or an open challenge for multiple players.'
		)}
	</p>

	<!-- Mode toggle -->
	<div class="mb-6" data-testid="mode-toggle">
		<div class="flex gap-2">
			<button
				type="button"
				onclick={() => (mode = 'duel')}
				class="rounded-md px-4 py-2 text-sm font-medium transition-colors {mode === 'duel'
					? 'bg-primary text-primary-foreground'
					: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
				data-testid="mode-duel"
			>
				{t('Duel (1 adversaire)', 'Duel (1 opponent)')}
			</button>
			<button
				type="button"
				onclick={() => (mode = 'open')}
				class="rounded-md px-4 py-2 text-sm font-medium transition-colors {mode === 'open'
					? 'bg-primary text-primary-foreground'
					: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
				data-testid="mode-open"
			>
				{t('Ouvert à tous (plusieurs)', 'Open to everyone (multiple opponents)')}
			</button>
		</div>
		<p class="text-muted-foreground mt-2 text-xs">
			{#if mode === 'duel'}
				{t(
					'Vous défiez une personne spécifique. Les termes sont négociables.',
					'Challenge a specific person. The terms are negotiable.'
				)}
			{:else}
				{t(
					'Vous lancez un défi ouvert. Les N premiers membres qui acceptent verrouillent. Termes fixes, pas de négociation.',
					'Start an open challenge. The first members to accept fill the available places. Terms are fixed, with no negotiation.'
				)}
			{/if}
		</p>
	</div>

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
		data-testid="yesno-bet-form"
	>
		<!-- Hidden mode field -->
		<input type="hidden" name="mode" value={mode} />

		<!-- Titre -->
		<div class="flex flex-col gap-1">
			<label for="title" class="text-foreground text-sm font-medium"
				>{t('Titre du pari', 'Bet title')} <span class="text-destructive">*</span></label
			>
			<input
				id="title"
				name="title"
				type="text"
				required
				placeholder={t('Ex : Il pleuvra demain à Paris', 'e.g. It will rain tomorrow in London')}
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
				rows="2"
				placeholder={t('Précisez les règles, le contexte…', 'Add rules or context…')}
				class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				data-testid="input-description"
				bind:value={descriptionValue}
			></textarea>
		</div>

		<!-- Choix A / B -->
		<div class="flex flex-col gap-3">
			<p class="text-foreground text-sm font-medium">
				{t('Les deux camps', 'Both sides')} <span class="text-destructive">*</span>
			</p>
			<div class="grid grid-cols-2 gap-3">
				<div class="flex flex-col gap-1">
					<label for="choiceA" class="text-foreground text-xs font-medium uppercase tracking-wide">
						{t('Camp A', 'Side A')}
					</label>
					<input
						id="choiceA"
						name="choiceA"
						type="text"
						required
						placeholder={t('Ex : Oui, il pleuvra', 'e.g. Yes, it will rain')}
						bind:value={choiceAValue}
						class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						data-testid="input-choice-a"
					/>
					{#if fieldErrors?.choiceA}
						<p class="text-destructive text-xs">{localizeError(fieldErrors.choiceA[0])}</p>
					{/if}
				</div>
				<div class="flex flex-col gap-1">
					<label for="choiceB" class="text-foreground text-xs font-medium uppercase tracking-wide">
						{t('Camp B', 'Side B')}
					</label>
					<input
						id="choiceB"
						name="choiceB"
						type="text"
						required
						placeholder={t('Ex : Non, il ne pleuvra pas', "e.g. No, it won't rain")}
						bind:value={choiceBValue}
						class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						data-testid="input-choice-b"
					/>
					{#if fieldErrors?.choiceB}
						<p class="text-destructive text-xs">{localizeError(fieldErrors.choiceB[0])}</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- Mon camp -->
		<fieldset class="flex flex-col gap-2">
			<legend class="text-foreground mb-1 text-sm font-medium">
				{t('Mon camp', 'My side')} <span class="text-destructive">*</span>
			</legend>
			<p class="text-muted-foreground text-xs">
				{mode === 'duel'
					? t(
							"La cible hérite automatiquement de l'autre camp.",
							'The opponent automatically joins the other side.'
						)
					: t(
							"Les adversaires héritent automatiquement de l'autre camp.",
							'Opponents automatically join the other side.'
						)}
			</p>
			<div class="grid grid-cols-2 gap-3">
				<label
					class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors {creatorSide ===
					'a'
						? 'border-primary bg-primary/5'
						: 'border-border'}"
				>
					<input
						type="radio"
						name="creatorSide"
						value="a"
						checked={creatorSide === 'a'}
						onchange={() => (creatorSide = 'a')}
						class="sr-only"
						data-testid="creator-side-a"
					/>
					<span class="font-medium">{t('Camp A', 'Side A')}</span>
					{#if choiceAValue}
						<span class="text-muted-foreground truncate text-xs">— {choiceAValue}</span>
					{/if}
				</label>
				<label
					class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors {creatorSide ===
					'b'
						? 'border-primary bg-primary/5'
						: 'border-border'}"
				>
					<input
						type="radio"
						name="creatorSide"
						value="b"
						checked={creatorSide === 'b'}
						onchange={() => (creatorSide = 'b')}
						class="sr-only"
						data-testid="creator-side-b"
					/>
					<span class="font-medium">{t('Camp B', 'Side B')}</span>
					{#if choiceBValue}
						<span class="text-muted-foreground truncate text-xs">— {choiceBValue}</span>
					{/if}
				</label>
			</div>
		</fieldset>

		{#if mode === 'duel'}
			<!-- Cible (duel mode only) -->
			<div class="flex flex-col gap-1" data-testid="target-section">
				<label for="targetId" class="text-foreground text-sm font-medium">
					{t('Adversaire (cible)', 'Opponent')} <span class="text-destructive">*</span>
				</label>
				<p class="text-muted-foreground text-xs">
					{t('La cible sera dans le camp', 'The opponent will be on side')}
					{targetSide}{targetSideChoice ? ` — ${targetSideChoice}` : ''}.
				</p>
				<select
					id="targetId"
					name="targetId"
					required={mode === 'duel'}
					bind:value={targetIdValue}
					class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
					data-testid="select-target"
				>
					<option value="">{t('— Choisissez un adversaire —', '— Choose an opponent —')}</option>
					{#each data.otherMembers as member (member.userId)}
						<option value={member.userId} data-testid="target-option-{member.userId}">
							{member.pseudo}
						</option>
					{/each}
				</select>
				{#if fieldErrors?.targetId}
					<p class="text-destructive text-xs">{localizeError(fieldErrors.targetId[0])}</p>
				{/if}
			</div>

			<!-- Résumé des camps (duel) -->
			{#if selectedTarget && choiceAValue && choiceBValue}
				<div class="bg-muted/50 rounded-md border border-dashed p-3 text-sm">
					<p class="text-foreground font-medium">{t('Résumé :', 'Summary:')}</p>
					<ul class="text-muted-foreground mt-1 flex flex-col gap-0.5 text-xs">
						<li>
							{t('Vous', 'You')} ({creatorSide.toUpperCase()}) — {creatorSideChoice}
						</li>
						<li>
							{selectedTarget.pseudo} ({targetSide}) — {targetSideChoice}
						</li>
					</ul>
				</div>
			{/if}
		{:else}
			<!-- Visibilité (open mode) -->
			<fieldset class="flex flex-col gap-2" data-testid="visibility-section">
				<legend class="text-foreground mb-1 text-sm font-medium">
					{t('Qui peut voir et accepter ce défi', 'Who can see and accept this challenge')}
					<span class="text-destructive">*</span>
				</legend>
				<p class="text-muted-foreground text-xs">
					{t(
						'Vous êtes automatiquement inclus. Les membres sélectionnés pourront accepter le défi.',
						'You are included automatically. Selected members can accept the challenge.'
					)}
				</p>
				<div
					class="border-border divide-border rounded-md border divide-y"
					data-testid="visibility-list"
				>
					{#each data.allMembers.filter((m) => m.userId !== data.currentUserId) as member (member.userId)}
						<label
							class="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent/50"
							data-testid="visibility-member-{member.userId}"
						>
							<input
								type="checkbox"
								name="visibilityUserIds"
								value={member.userId}
								bind:checked={visibilitySelected[member.userId]}
								class="h-4 w-4 rounded border-border"
							/>
							<span class="text-foreground text-sm">{member.pseudo}</span>
						</label>
					{/each}
				</div>
				{#if fieldErrors?.visibilityUserIds}
					<p class="text-destructive text-xs">{localizeError(fieldErrors.visibilityUserIds[0])}</p>
				{/if}
			</fieldset>

			<!-- Max adversaires (open mode) -->
			<div class="flex flex-col gap-1" data-testid="max-opponents-section">
				<label for="maxOpponents" class="text-foreground text-sm font-medium">
					{t("Nombre max d'adversaires", 'Maximum number of opponents')}
					<span class="text-destructive">*</span>
				</label>
				<p class="text-muted-foreground text-xs">
					{t(
						'Le défi sera "complet" dès que ce nombre d\'adversaires ont accepté.',
						'The challenge will be full once this many opponents have accepted.'
					)}
				</p>
				<input
					id="maxOpponents"
					name="maxOpponents"
					type="number"
					min="1"
					step="1"
					placeholder="1"
					bind:value={maxOpponentsValue}
					class="border-border bg-background text-foreground w-32 rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					data-testid="input-max-opponents"
				/>
				{#if fieldErrors?.maxOpponents}
					<p class="text-destructive text-xs">{localizeError(fieldErrors.maxOpponents[0])}</p>
				{/if}
			</div>
		{/if}

		<!-- Type de mise -->
		<fieldset class="flex flex-col gap-3">
			<legend class="text-foreground mb-1 text-sm font-medium">
				{t('Type de mise', 'Stake type')} <span class="text-destructive">*</span>
			</legend>
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
				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<label for="stakeCreator" class="text-foreground text-xs font-medium">
							{t('Ma mise (points)', 'My stake (points)')} <span class="text-destructive">*</span>
						</label>
						<input
							id="stakeCreator"
							name="stakeCreator"
							type="number"
							min="0.01"
							step="0.01"
							placeholder="10"
							bind:value={stakeCreatorValue}
							class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							data-testid="input-stake-creator"
						/>
						{#if fieldErrors?.stakeCreator}
							<p class="text-destructive text-xs">{localizeError(fieldErrors.stakeCreator[0])}</p>
						{/if}
					</div>
					<div class="flex flex-col gap-1">
						{#if mode === 'duel'}
							<label for="stakeTarget" class="text-foreground text-xs font-medium">
								{t('Sa mise (points)', 'Their stake (points)')}
								<span class="text-destructive">*</span>
							</label>
							<input
								id="stakeTarget"
								name="stakeTarget"
								type="number"
								min="0.01"
								step="0.01"
								placeholder="5"
								bind:value={stakeTargetValue}
								class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
								data-testid="input-stake-target"
							/>
							{#if fieldErrors?.stakeTarget}
								<p class="text-destructive text-xs">{localizeError(fieldErrors.stakeTarget[0])}</p>
							{/if}
						{:else}
							<label for="stakeOpponent" class="text-foreground text-xs font-medium">
								{t('Mise adversaire (points)', "Opponent's stake (points)")}
								<span class="text-destructive">*</span>
							</label>
							<input
								id="stakeOpponent"
								name="stakeOpponent"
								type="number"
								min="0.01"
								step="0.01"
								placeholder="5"
								bind:value={stakeOpponentValue}
								class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
								data-testid="input-stake-opponent"
							/>
							{#if fieldErrors?.stakeOpponent}
								<p class="text-destructive text-xs">
									{localizeError(fieldErrors.stakeOpponent[0])}
								</p>
							{/if}
						{/if}
					</div>
				</div>
			{:else}
				<div class="flex flex-col gap-3">
					<div class="flex flex-col gap-1">
						<label for="forfeitCreator" class="text-foreground text-xs font-medium">
							{t('Mon gage (si je perds)', 'My forfeit (if I lose)')}
							<span class="text-destructive">*</span>
						</label>
						<textarea
							id="forfeitCreator"
							name="forfeitCreator"
							rows="2"
							placeholder={t(
								'Ex : Je fais la vaisselle pendant une semaine',
								'e.g. I do the dishes for a week'
							)}
							class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							data-testid="input-forfeit-creator"
							bind:value={forfeitCreatorValue}
						></textarea>
						{#if fieldErrors?.forfeitCreator}
							<p class="text-destructive text-xs">{localizeError(fieldErrors.forfeitCreator[0])}</p>
						{/if}
					</div>
					<div class="flex flex-col gap-1">
						{#if mode === 'duel'}
							<label for="forfeitTarget" class="text-foreground text-xs font-medium">
								{t('Son gage (si il/elle perd)', 'Their forfeit (if they lose)')}
								<span class="text-destructive">*</span>
							</label>
							<textarea
								id="forfeitTarget"
								name="forfeitTarget"
								rows="2"
								placeholder={t(
									'Ex : Il/elle paie la prochaine tournée',
									'e.g. They buy the next round'
								)}
								class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
								data-testid="input-forfeit-target"
								bind:value={forfeitTargetValue}
							></textarea>
							{#if fieldErrors?.forfeitTarget}
								<p class="text-destructive text-xs">
									{localizeError(fieldErrors.forfeitTarget[0])}
								</p>
							{/if}
						{:else}
							<label for="forfeitOpponent" class="text-foreground text-xs font-medium">
								{t('Gage adversaire (si il/elle perd)', "Opponent's forfeit (if they lose)")}
								<span class="text-destructive">*</span>
							</label>
							<textarea
								id="forfeitOpponent"
								name="forfeitOpponent"
								rows="2"
								placeholder={t(
									'Ex : Il/elle paie la prochaine tournée',
									'e.g. They buy the next round'
								)}
								class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
								data-testid="input-forfeit-opponent"
								bind:value={forfeitOpponentValue}
							></textarea>
							{#if fieldErrors?.forfeitOpponent}
								<p class="text-destructive text-xs">
									{localizeError(fieldErrors.forfeitOpponent[0])}
								</p>
							{/if}
						{/if}
					</div>
				</div>
			{/if}
		</fieldset>

		<!-- Jury -->
		<fieldset class="flex flex-col gap-2">
			<legend class="text-foreground mb-1 text-sm font-medium">
				{t('Jury (≥ 1 membre)', 'Jury (≥ 1 member)')} <span class="text-destructive">*</span>
			</legend>
			<p class="text-muted-foreground text-xs">
				{t(
					'Les jurés désignent le gagnant. Un juré peut aussi être participant.',
					'The jurors choose the winner. A juror may also participate.'
				)}
			</p>
			<div class="border-border divide-border rounded-md border divide-y" data-testid="jury-list">
				{#each data.allMembers as member (member.userId)}
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
						<span class="text-foreground text-sm">
							{member.pseudo}{member.userId === data.currentUserId ? t(' (moi)', ' (me)') : ''}
						</span>
					</label>
				{/each}
			</div>
			{#if fieldErrors?.juryUserIds}
				<p class="text-destructive text-xs">{localizeError(fieldErrors.juryUserIds[0])}</p>
			{/if}
		</fieldset>

		<!-- Mode jury -->
		<fieldset class="flex flex-col gap-2">
			<legend class="text-foreground mb-1 text-sm font-medium">
				{t('Mode du jury', 'Jury decision rule')} <span class="text-destructive">*</span>
			</legend>
			<div class="flex gap-4">
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<input
						type="radio"
						name="juryMode"
						value="majority"
						checked={true}
						data-testid="jury-mode-majority"
					/>
					{t('Majorité', 'Majority')}
				</label>
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<input type="radio" name="juryMode" value="unanimous" data-testid="jury-mode-unanimous" />
					{t('Unanimité', 'Unanimity')}
				</label>
			</div>
		</fieldset>

		{#if mode === 'duel'}
			<!-- Expiration de la proposition (duel only) -->
			<div class="flex flex-col gap-1">
				<label for="expirationHours" class="text-foreground text-sm font-medium">
					{t('Délai de réponse (par défaut 48h)', 'Response time (48 hours by default)')}
				</label>
				<select
					id="expirationHours"
					name="expirationHours"
					class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
					data-testid="select-expiration"
				>
					<option value="24">{t('24 heures', '24 hours')}</option>
					<option value="48" selected>{t('48 heures (défaut)', '48 hours (default)')}</option>
					<option value="72">{t('72 heures', '72 hours')}</option>
					<option value="168">{t('1 semaine', '1 week')}</option>
				</select>
			</div>
		{/if}

		<!-- Submit -->
		<div class="flex gap-3 pt-2">
			<Button type="submit" disabled={loading} data-testid="submit-btn">
				{#if loading}
					{t('Envoi…', 'Sending…')}
				{:else if mode === 'duel'}
					{t('Proposer le duel', 'Propose duel')}
				{:else}
					{t('Lancer le défi ouvert', 'Start open challenge')}
				{/if}
			</Button>
			<Button type="button" variant="outline" href={groupHref} disabled={loading}
				>{t('Annuler', 'Cancel')}</Button
			>
		</div>
	</form>
</div>
