<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolveRoute } from '$app/paths';
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { track } from '$lib/analytics/client';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const groupHref = $derived(resolveRoute('/app/groups/[id]', { id: data.groupId }));

	// Form state
	let stakeType = $state<'points' | 'forfeit'>('points');
	let creatorSide = $state<'a' | 'b'>('a');
	let loading = $state(false);

	// Jury multi-select state
	let jurySelected = $state<Record<string, boolean>>({});

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

	let titleValue = $state(initialValues?.title ?? '');
	let descriptionValue = $state(initialValues?.description ?? '');
	let choiceAValue = $state(initialValues?.choiceA ?? '');
	let choiceBValue = $state(initialValues?.choiceB ?? '');
	let stakeCreatorValue = $state(initialValues?.stakeCreator ?? '');
	let stakeTargetValue = $state(initialValues?.stakeTarget ?? '');
	let forfeitCreatorValue = $state(initialValues?.forfeitCreator ?? '');
	let forfeitTargetValue = $state(initialValues?.forfeitTarget ?? '');
	let targetIdValue = $state(initialValues?.targetId ?? '');

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
		track('duel_form_opened', { group_id: groupId });
	});
</script>

<div class="container mx-auto max-w-2xl px-4 py-10">
	<div class="mb-6">
		<a
			href={groupHref}
			class="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
		>
			← Retour au groupe
		</a>
	</div>

	<h1 class="text-foreground mb-2 text-2xl font-bold">Nouveau duel Oui / Non</h1>
	<p class="text-muted-foreground mb-6 text-sm">
		Défiez un membre en choisissant votre camp et en proposant vos termes.
	</p>

	{#if errorMsg}
		<div
			class="bg-destructive/10 text-destructive mb-4 rounded-md px-4 py-3 text-sm"
			data-testid="form-error"
		>
			{errorMsg}
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
		<!-- Titre -->
		<div class="flex flex-col gap-1">
			<label for="title" class="text-foreground text-sm font-medium"
				>Titre du pari <span class="text-destructive">*</span></label
			>
			<input
				id="title"
				name="title"
				type="text"
				required
				placeholder="Ex : Il pleuvra demain à Paris"
				bind:value={titleValue}
				class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				data-testid="input-title"
			/>
			{#if fieldErrors?.title}
				<p class="text-destructive text-xs">{fieldErrors.title[0]}</p>
			{/if}
		</div>

		<!-- Description -->
		<div class="flex flex-col gap-1">
			<label for="description" class="text-foreground text-sm font-medium"
				>Description (optionnelle)</label
			>
			<textarea
				id="description"
				name="description"
				rows="2"
				placeholder="Précisez les règles, le contexte…"
				class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				data-testid="input-description"
				bind:value={descriptionValue}
			></textarea>
		</div>

		<!-- Choix A / B -->
		<div class="flex flex-col gap-3">
			<p class="text-foreground text-sm font-medium">
				Les deux camps <span class="text-destructive">*</span>
			</p>
			<div class="grid grid-cols-2 gap-3">
				<div class="flex flex-col gap-1">
					<label for="choiceA" class="text-foreground text-xs font-medium uppercase tracking-wide">
						Camp A
					</label>
					<input
						id="choiceA"
						name="choiceA"
						type="text"
						required
						placeholder="Ex : Oui, il pleuvra"
						bind:value={choiceAValue}
						class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						data-testid="input-choice-a"
					/>
					{#if fieldErrors?.choiceA}
						<p class="text-destructive text-xs">{fieldErrors.choiceA[0]}</p>
					{/if}
				</div>
				<div class="flex flex-col gap-1">
					<label for="choiceB" class="text-foreground text-xs font-medium uppercase tracking-wide">
						Camp B
					</label>
					<input
						id="choiceB"
						name="choiceB"
						type="text"
						required
						placeholder="Ex : Non, il ne pleuvra pas"
						bind:value={choiceBValue}
						class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						data-testid="input-choice-b"
					/>
					{#if fieldErrors?.choiceB}
						<p class="text-destructive text-xs">{fieldErrors.choiceB[0]}</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- Mon camp -->
		<fieldset class="flex flex-col gap-2">
			<legend class="text-foreground mb-1 text-sm font-medium">
				Mon camp <span class="text-destructive">*</span>
			</legend>
			<p class="text-muted-foreground text-xs">La cible hérite automatiquement de l'autre camp.</p>
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
					<span class="font-medium">Camp A</span>
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
					<span class="font-medium">Camp B</span>
					{#if choiceBValue}
						<span class="text-muted-foreground truncate text-xs">— {choiceBValue}</span>
					{/if}
				</label>
			</div>
		</fieldset>

		<!-- Cible -->
		<div class="flex flex-col gap-1">
			<label for="targetId" class="text-foreground text-sm font-medium">
				Adversaire (cible) <span class="text-destructive">*</span>
			</label>
			<p class="text-muted-foreground text-xs">
				La cible sera dans le camp {targetSide}{targetSideChoice ? ` — ${targetSideChoice}` : ''}.
			</p>
			<select
				id="targetId"
				name="targetId"
				required
				bind:value={targetIdValue}
				class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
				data-testid="select-target"
			>
				<option value="">— Choisissez un adversaire —</option>
				{#each data.otherMembers as member (member.userId)}
					<option value={member.userId} data-testid="target-option-{member.userId}">
						{member.pseudo}
					</option>
				{/each}
			</select>
			{#if fieldErrors?.targetId}
				<p class="text-destructive text-xs">{fieldErrors.targetId[0]}</p>
			{/if}
		</div>

		<!-- Résumé des camps -->
		{#if selectedTarget && choiceAValue && choiceBValue}
			<div class="bg-muted/50 rounded-md border border-dashed p-3 text-sm">
				<p class="text-foreground font-medium">Résumé :</p>
				<ul class="text-muted-foreground mt-1 flex flex-col gap-0.5 text-xs">
					<li>
						Vous ({creatorSide.toUpperCase()}) — {creatorSideChoice}
					</li>
					<li>
						{selectedTarget.pseudo} ({targetSide}) — {targetSideChoice}
					</li>
				</ul>
			</div>
		{/if}

		<!-- Type de mise -->
		<fieldset class="flex flex-col gap-3">
			<legend class="text-foreground mb-1 text-sm font-medium">
				Type de mise <span class="text-destructive">*</span>
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
					Gage
				</label>
			</div>

			{#if stakeType === 'points'}
				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<label for="stakeCreator" class="text-foreground text-xs font-medium">
							Ma mise (points) <span class="text-destructive">*</span>
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
							<p class="text-destructive text-xs">{fieldErrors.stakeCreator[0]}</p>
						{/if}
					</div>
					<div class="flex flex-col gap-1">
						<label for="stakeTarget" class="text-foreground text-xs font-medium">
							Sa mise (points) <span class="text-destructive">*</span>
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
							<p class="text-destructive text-xs">{fieldErrors.stakeTarget[0]}</p>
						{/if}
					</div>
				</div>
			{:else}
				<div class="flex flex-col gap-3">
					<div class="flex flex-col gap-1">
						<label for="forfeitCreator" class="text-foreground text-xs font-medium">
							Mon gage (si je perds) <span class="text-destructive">*</span>
						</label>
						<textarea
							id="forfeitCreator"
							name="forfeitCreator"
							rows="2"
							placeholder="Ex : Je fais la vaisselle pendant une semaine"
							class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							data-testid="input-forfeit-creator"
							bind:value={forfeitCreatorValue}
						></textarea>
						{#if fieldErrors?.forfeitCreator}
							<p class="text-destructive text-xs">{fieldErrors.forfeitCreator[0]}</p>
						{/if}
					</div>
					<div class="flex flex-col gap-1">
						<label for="forfeitTarget" class="text-foreground text-xs font-medium">
							Son gage (si il/elle perd) <span class="text-destructive">*</span>
						</label>
						<textarea
							id="forfeitTarget"
							name="forfeitTarget"
							rows="2"
							placeholder="Ex : Il/elle paie la prochaine tournée"
							class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							data-testid="input-forfeit-target"
							bind:value={forfeitTargetValue}
						></textarea>
						{#if fieldErrors?.forfeitTarget}
							<p class="text-destructive text-xs">{fieldErrors.forfeitTarget[0]}</p>
						{/if}
					</div>
				</div>
			{/if}
		</fieldset>

		<!-- Jury -->
		<fieldset class="flex flex-col gap-2">
			<legend class="text-foreground mb-1 text-sm font-medium">
				Jury (≥ 1 membre) <span class="text-destructive">*</span>
			</legend>
			<p class="text-muted-foreground text-xs">
				Les jurés désignent le gagnant. Un juré peut aussi être participant.
			</p>
			<div class="border-border divide-border rounded-md border divide-y" data-testid="jury-list">
				{#each data.otherMembers as member (member.userId)}
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
						<span class="text-foreground text-sm">{member.pseudo}</span>
					</label>
				{/each}
			</div>
			{#if fieldErrors?.juryUserIds}
				<p class="text-destructive text-xs">{fieldErrors.juryUserIds[0]}</p>
			{/if}
		</fieldset>

		<!-- Mode jury -->
		<fieldset class="flex flex-col gap-2">
			<legend class="text-foreground mb-1 text-sm font-medium">
				Mode du jury <span class="text-destructive">*</span>
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
					Majorité
				</label>
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<input type="radio" name="juryMode" value="unanimous" data-testid="jury-mode-unanimous" />
					Unanimité
				</label>
			</div>
		</fieldset>

		<!-- Expiration de la proposition -->
		<div class="flex flex-col gap-1">
			<label for="expirationHours" class="text-foreground text-sm font-medium">
				Délai de réponse (par défaut 48h)
			</label>
			<select
				id="expirationHours"
				name="expirationHours"
				class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
				data-testid="select-expiration"
			>
				<option value="24">24 heures</option>
				<option value="48" selected>48 heures (défaut)</option>
				<option value="72">72 heures</option>
				<option value="168">1 semaine</option>
			</select>
		</div>

		<!-- Submit -->
		<div class="flex gap-3 pt-2">
			<Button type="submit" disabled={loading} data-testid="submit-btn">
				{loading ? 'Envoi…' : 'Proposer le duel'}
			</Button>
			<Button type="button" variant="outline" href={groupHref} disabled={loading}>Annuler</Button>
		</div>
	</form>
</div>
