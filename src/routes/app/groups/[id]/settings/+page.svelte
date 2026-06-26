<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const groupHref = $derived(resolveRoute('/app/groups/[id]', { id: data.group.id }));

	// Le formulaire de suppression nécessite une confirmation par le nom du groupe
	let deleteConfirm = $state('');
	let showDeleteForm = $state(false);
	let renaming = $state(false);
	let deleting = $state(false);

	const f = $derived(
		form as {
			renamed?: boolean;
			newName?: string;
			deleteError?: string;
			renameErrors?: { name?: string[] };
			values?: { name?: string };
			error?: string;
		} | null
	);

	// Nom courant (mis à jour après renommage réussi)
	let currentName = $derived(f?.renamed && f?.newName ? f.newName : data.group.name);

	const deleteConfirmMatches = $derived(deleteConfirm === currentName);
</script>

<div class="container mx-auto max-w-2xl px-4 py-10">
	<!-- Navigation retour -->
	<div class="mb-6">
		<a
			href={groupHref}
			class="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
		>
			← Retour au groupe
		</a>
	</div>

	<h1 class="text-foreground mb-8 text-2xl font-bold" data-testid="settings-title">
		Paramètres du groupe
	</h1>

	<!-- Message d'erreur global -->
	{#if f?.error}
		<div
			class="bg-destructive/10 text-destructive mb-6 rounded-lg px-4 py-3 text-sm"
			data-testid="global-error"
		>
			{f.error}
		</div>
	{/if}

	<!-- Section Renommer -->
	<section class="border-border bg-card mb-6 rounded-lg border p-6" data-testid="rename-section">
		<h2 class="text-foreground mb-4 text-lg font-semibold">Renommer le groupe</h2>

		{#if f?.renamed}
			<div
				class="mb-4 rounded-lg bg-green-100 px-4 py-3 text-sm text-green-700"
				data-testid="rename-success"
			>
				Le groupe a été renommé en « {f.newName} ».
			</div>
		{/if}

		<form
			method="POST"
			action="?/rename"
			data-testid="rename-form"
			use:enhance={() => {
				renaming = true;
				return async ({ update }) => {
					renaming = false;
					await update({ reset: false });
				};
			}}
		>
			<div class="flex flex-col gap-2">
				<label for="group-name" class="text-foreground text-sm font-medium">Nom du groupe</label>
				<input
					id="group-name"
					name="name"
					type="text"
					required
					minlength={2}
					maxlength={50}
					value={f?.values?.name ?? currentName}
					class="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1"
					data-testid="group-name-input"
				/>
				{#if f?.renameErrors?.name}
					<p class="text-destructive text-xs" data-testid="name-error">
						{f.renameErrors.name[0]}
					</p>
				{/if}
			</div>

			<div class="mt-4">
				<Button type="submit" disabled={renaming} data-testid="rename-submit-btn">
					{renaming ? 'Enregistrement…' : 'Enregistrer le nom'}
				</Button>
			</div>
		</form>
	</section>

	<!-- Section Supprimer -->
	<section class="border-destructive/30 bg-card rounded-lg border p-6" data-testid="delete-section">
		<h2 class="text-foreground mb-2 text-lg font-semibold">Supprimer le groupe</h2>
		<p class="text-muted-foreground mb-4 text-sm">
			La suppression est irréversible. Les paris et l'ardoise sont conservés en base mais le groupe
			ne sera plus accessible.
		</p>

		{#if !showDeleteForm}
			<Button
				variant="destructive"
				onclick={() => (showDeleteForm = true)}
				data-testid="delete-group-btn"
			>
				Supprimer le groupe
			</Button>
		{:else}
			<div
				class="border-destructive/20 bg-destructive/5 rounded-lg border p-4"
				data-testid="delete-confirm-form"
			>
				<p class="text-foreground mb-3 text-sm font-medium">
					Pour confirmer, saisissez le nom exact du groupe :
					<strong>{currentName}</strong>
				</p>

				{#if f?.deleteError}
					<div
						class="bg-destructive/10 text-destructive mb-3 rounded px-3 py-2 text-sm"
						data-testid="delete-error"
					>
						{f.deleteError}
					</div>
				{/if}

				<form
					method="POST"
					action="?/delete"
					data-testid="delete-form"
					use:enhance={() => {
						deleting = true;
						return async ({ update }) => {
							deleting = false;
							await update({ reset: false });
						};
					}}
				>
					<input
						type="text"
						name="confirm"
						bind:value={deleteConfirm}
						placeholder={currentName}
						class="border-border bg-background text-foreground mb-3 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1"
						data-testid="delete-confirm-input"
					/>

					<div class="flex gap-2">
						<Button
							type="submit"
							variant="destructive"
							disabled={!deleteConfirmMatches || deleting}
							data-testid="delete-confirm-btn"
						>
							{deleting ? 'Suppression…' : 'Supprimer définitivement'}
						</Button>
						<Button
							type="button"
							variant="outline"
							onclick={() => {
								showDeleteForm = false;
								deleteConfirm = '';
							}}
							data-testid="delete-cancel-btn"
						>
							Annuler
						</Button>
					</div>
				</form>
			</div>
		{/if}
	</section>
</div>
