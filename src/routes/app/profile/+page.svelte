<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let loadingPseudo = $state(false);
	let loadingAvatar = $state(false);
	let loadingDelete = $state(false);

	// Initiales pour l'avatar par défaut
	const initials = $derived(
		data.profile?.pseudo
			? data.profile.pseudo
					.split(' ')
					.map((w: string) => w[0])
					.join('')
					.toUpperCase()
					.slice(0, 2)
			: '?'
	);

	// Prévisualisation locale avant upload
	let previewUrl = $state<string | null>(null);

	function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			previewUrl = URL.createObjectURL(file);
		} else {
			previewUrl = null;
		}
	}

	// L'URL d'avatar affichée (préférer la prévisualisation locale sinon l'URL stockée)
	const displayAvatarUrl = $derived(previewUrl ?? data.profile?.avatarUrl ?? null);

	// Formulaire typé pour accès dans le template
	const typedForm = $derived(
		form as
			| {
					action?: string;
					success?: boolean;
					message?: string;
					pseudo?: string;
					errors?: Record<string, string[]>;
			  }
			| null
			| undefined
	);

	// Réaction aux retours de form actions
	$effect(() => {
		const f = typedForm;
		if (!f) return;

		if (f.action === 'updatePseudo' && f.success) {
			toast.success('Pseudo mis à jour !');
			previewUrl = null;
			invalidateAll();
		} else if (f.action === 'uploadAvatar' && f.success) {
			toast.success('Avatar mis à jour !');
			previewUrl = null;
			invalidateAll();
		} else if (f.action === 'deleteAvatar' && f.success) {
			toast.success('Avatar supprimé.');
			previewUrl = null;
			invalidateAll();
		} else if (f.message) {
			toast.error(f.message);
		}
	});
</script>

<div class="container mx-auto max-w-2xl px-4 py-10">
	<h1 class="text-foreground mb-8 text-2xl font-bold">Mon profil</h1>

	<!-- Section avatar -->
	<section class="mb-10">
		<h2 class="text-foreground mb-4 text-lg font-semibold">Avatar</h2>

		<div class="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
			<!-- Affichage avatar / initiales -->
			<div class="shrink-0">
				{#if displayAvatarUrl}
					<img
						src={displayAvatarUrl}
						alt="Avatar de {data.profile?.pseudo}"
						class="h-24 w-24 rounded-full border object-cover"
						data-testid="avatar-img"
					/>
				{:else}
					<div
						class="bg-primary text-primary-foreground flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold"
						data-testid="avatar-initials"
					>
						{initials}
					</div>
				{/if}
			</div>

			<!-- Formulaire upload -->
			<div class="flex flex-col gap-3">
				<form
					method="POST"
					action="?/uploadAvatar"
					enctype="multipart/form-data"
					use:enhance={() => {
						loadingAvatar = true;
						return async ({ update }) => {
							loadingAvatar = false;
							await update({ reset: false });
						};
					}}
					class="flex flex-col gap-2"
				>
					<Label for="avatar" class="text-muted-foreground text-sm">
						jpg, png ou webp — max 2 Mo
					</Label>
					<div class="flex flex-wrap gap-2">
						<Input
							id="avatar"
							name="avatar"
							type="file"
							accept="image/jpeg,image/png,image/webp"
							onchange={handleFileChange}
							class="max-w-xs"
							data-testid="avatar-input"
						/>
						<Button type="submit" variant="outline" size="sm" disabled={loadingAvatar}>
							{loadingAvatar ? 'Upload…' : "Changer l'avatar"}
						</Button>
					</div>
				</form>

				{#if data.profile?.avatarUrl}
					<form
						method="POST"
						action="?/deleteAvatar"
						use:enhance={() => {
							loadingDelete = true;
							return async ({ update }) => {
								loadingDelete = false;
								await update();
							};
						}}
					>
						<Button
							type="submit"
							variant="ghost"
							size="sm"
							class="text-destructive hover:text-destructive"
							disabled={loadingDelete}
							data-testid="delete-avatar-btn"
						>
							{loadingDelete ? 'Suppression…' : "Supprimer l'avatar"}
						</Button>
					</form>
				{/if}
			</div>
		</div>
	</section>

	<!-- Section pseudo -->
	<section class="mb-10">
		<h2 class="text-foreground mb-4 text-lg font-semibold">Pseudo</h2>

		<form
			method="POST"
			action="?/updatePseudo"
			use:enhance={() => {
				loadingPseudo = true;
				return async ({ update }) => {
					loadingPseudo = false;
					await update({ reset: false });
				};
			}}
			class="flex max-w-sm flex-col gap-4"
		>
			<div class="flex flex-col gap-1.5">
				<Label for="pseudo">Pseudo (2–30 caractères)</Label>
				<Input
					id="pseudo"
					name="pseudo"
					type="text"
					minlength={2}
					maxlength={30}
					value={typedForm?.action === 'updatePseudo' && typedForm?.pseudo
						? typedForm.pseudo
						: (data.profile?.pseudo ?? '')}
					autocomplete="nickname"
					required
					data-testid="pseudo-input"
				/>
				{#if typedForm?.action === 'updatePseudo' && typedForm?.errors?.pseudo}
					<p class="text-destructive text-sm" data-testid="pseudo-error">
						{typedForm.errors.pseudo[0]}
					</p>
				{/if}
			</div>

			<Button type="submit" class="w-fit" disabled={loadingPseudo} data-testid="save-pseudo-btn">
				{loadingPseudo ? 'Enregistrement…' : 'Enregistrer'}
			</Button>
		</form>
	</section>

	<!-- Infos compte -->
	<section>
		<h2 class="text-foreground mb-4 text-lg font-semibold">Compte</h2>
		<div class="text-muted-foreground text-sm">
			{#if data.profile?.isAnonymous}
				<p>Vous êtes connecté en tant qu'invité.</p>
			{:else}
				<p>Compte sécurisé.</p>
			{/if}
		</div>
	</section>
</div>
