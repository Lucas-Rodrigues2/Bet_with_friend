<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolveRoute } from '$app/paths';
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
		return m.userId === data.currentUserId ? `${m.pseudo} (moi)` : m.pseudo;
	}

	// Track closest form opened — émis une seule fois au montage côté client
	onMount(() => {
		track('closest_form_opened', { group_id: data.groupId });
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

	<h1 class="text-foreground mb-6 text-2xl font-bold">Nouveau pari « au plus proche »</h1>

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
		data-testid="closest-bet-form"
	>
		<!-- Titre -->
		<div class="flex flex-col gap-1">
			<label for="title" class="text-foreground text-sm font-medium"
				>Titre <span class="text-destructive">*</span></label
			>
			<input
				id="title"
				name="title"
				type="text"
				required
				placeholder="Ex : Combien de buts dans le match ?"
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
				rows="3"
				placeholder="Précisez les règles, le contexte…"
				class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				data-testid="input-description"
				bind:value={descriptionValue}
			></textarea>
		</div>

		<!-- Type de mise -->
		<fieldset class="flex flex-col gap-3">
			<legend class="text-foreground mb-1 text-sm font-medium"
				>Type de mise <span class="text-destructive">*</span></legend
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
					Gage
				</label>
			</div>

			{#if stakeType === 'points'}
				<div class="flex flex-col gap-1">
					<label for="stakeAmount" class="text-foreground text-sm font-medium">
						Montant (en {data.currency}) <span class="text-destructive">*</span>
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
						<p class="text-destructive text-xs">{fieldErrors.stakeAmount[0]}</p>
					{/if}
				</div>
			{:else}
				<div class="flex flex-col gap-3">
					<div class="flex flex-col gap-1">
						<label for="forfeitDescription" class="text-foreground text-sm font-medium">
							Description du gage <span class="text-destructive">*</span>
						</label>
						<textarea
							id="forfeitDescription"
							name="forfeitDescription"
							rows="2"
							placeholder="Ex : Faire la vaisselle pendant une semaine"
							class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							data-testid="input-forfeit-description"
							bind:value={forfeitDescriptionValue}
						></textarea>
						{#if fieldErrors?.forfeitDescription}
							<p class="text-destructive text-xs">{fieldErrors.forfeitDescription[0]}</p>
						{/if}
					</div>

					<fieldset class="flex flex-col gap-2">
						<legend class="text-foreground text-sm font-medium">
							Périmètre du gage <span class="text-destructive">*</span>
						</legend>
						<label class="flex cursor-pointer items-center gap-2 text-sm">
							<input
								type="radio"
								name="forfeitScope"
								value="all_losers"
								checked={!prevValues?.forfeitScope || prevValues.forfeitScope === 'all_losers'}
								data-testid="forfeit-scope-all"
							/>
							Tous les perdants
						</label>
						<label class="flex cursor-pointer items-center gap-2 text-sm">
							<input
								type="radio"
								name="forfeitScope"
								value="last_one"
								checked={prevValues?.forfeitScope === 'last_one'}
								data-testid="forfeit-scope-last"
							/>
							Le dernier seulement
						</label>
						{#if fieldErrors?.forfeitScope}
							<p class="text-destructive text-xs">{fieldErrors.forfeitScope[0]}</p>
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
				Cacher les réponses jusqu'à la clôture
			</label>
		</div>

		<!-- Deadline -->
		<div class="flex flex-col gap-1">
			<label for="participationDeadline" class="text-foreground text-sm font-medium">
				Date limite de participation (optionnelle)
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
				<p class="text-destructive text-xs">{fieldErrors.participationDeadline[0]}</p>
			{/if}
		</div>

		<!-- Visibilité -->
		<fieldset class="flex flex-col gap-2">
			<legend class="text-foreground mb-1 text-sm font-medium">
				Qui peut voir ce pari ? <span class="text-destructive">*</span>
			</legend>
			<p class="text-muted-foreground text-xs">
				Le créateur est toujours inclus. La liste sera figée à la création.
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
				Jury (≥ 1 membre) <span class="text-destructive">*</span>
			</legend>
			<p class="text-muted-foreground text-xs">
				Les jurés désignent le(s) gagnant(s). Un juré peut aussi participer.
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
				<p class="text-destructive text-xs">{fieldErrors.juryUserIds[0]}</p>
			{/if}
		</fieldset>

		<!-- Mode jury -->
		<fieldset class="flex flex-col gap-2">
			<legend class="text-foreground mb-1 text-sm font-medium"
				>Mode du jury <span class="text-destructive">*</span></legend
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
					Majorité
				</label>
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<input
						type="radio"
						name="juryMode"
						value="unanimous"
						checked={prevValues?.juryMode === 'unanimous'}
						data-testid="jury-mode-unanimous"
					/>
					Unanimité
				</label>
			</div>
		</fieldset>

		<!-- Submit -->
		<div class="flex gap-3 pt-2">
			<Button type="submit" disabled={loading} data-testid="submit-btn">
				{loading ? 'Création…' : 'Créer le pari'}
			</Button>
			<Button type="button" variant="outline" href={groupHref} disabled={loading}>Annuler</Button>
		</div>
	</form>
</div>
