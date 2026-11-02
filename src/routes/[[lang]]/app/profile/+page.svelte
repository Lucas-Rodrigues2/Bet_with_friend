<script lang="ts">
	import { page } from '$app/state';
	import { resolveRoute } from '$lib/paths';
	const english = $derived(page.url.pathname === '/en' || page.url.pathname.startsWith('/en/'));
	const translations: Record<string, string> = {
		'Mon profil': 'My profile',
		Pseudo: 'Nickname',
		'Pseudo (2–30 caractères)': 'Nickname (2–30 characters)',
		Compte: 'Account',
		"Vous êtes connecté en tant qu'invité.": 'You are signed in as a guest.',
		'Compte sécurisé.': 'Account secured.',
		'Préférences de notifications': 'Notification preferences',
		'jpg, png ou webp — max 2 Mo': 'jpg, png or webp — max 2 MB',
		'Pseudo mis à jour !': 'Nickname updated!',
		'Avatar mis à jour !': 'Avatar updated!',
		'Avatar supprimé.': 'Avatar deleted.',
		'Upload…': 'Uploading…',
		"Changer l'avatar": 'Change avatar',
		'Suppression…': 'Deleting…',
		"Supprimer l'avatar": 'Delete avatar',
		'Enregistrement…': 'Saving…',
		Enregistrer: 'Save',
		'Non authentifié.': 'Not authenticated.',
		'Aucun fichier reçu.': 'No file received.',
		'Format invalide. Utilisez jpg, png ou webp.': 'Invalid format. Use jpg, png or webp.',
		"L'image ne doit pas dépasser 2 Mo.": 'The image must not exceed 2 MB.'
	};
	const t = (text: string) => (english ? (translations[text] ?? text) : text);
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
			toast.success(t('Pseudo mis à jour !'));
			previewUrl = null;
			invalidateAll();
		} else if (f.action === 'uploadAvatar' && f.success) {
			toast.success(t('Avatar mis à jour !'));
			previewUrl = null;
			invalidateAll();
		} else if (f.action === 'deleteAvatar' && f.success) {
			toast.success(t('Avatar supprimé.'));
			previewUrl = null;
			invalidateAll();
		} else if (f.message) {
			toast.error(
				english
					? (translations[f.message] ?? 'Unable to update your profile. Please try again.')
					: f.message
			);
		}
	});
</script>

<div class="container mx-auto max-w-2xl px-4 py-10">
	<h1 class="text-foreground mb-8 text-2xl font-bold bw-display">{t('Mon profil')}</h1>

	<!-- Section avatar -->
	<section class="mb-10">
		<h2 class="text-foreground mb-4 text-lg font-semibold">Avatar</h2>

		<div class="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
			<!-- Affichage avatar / initiales -->
			<div class="shrink-0">
				{#if displayAvatarUrl}
					<img
						src={displayAvatarUrl}
						alt={english ? `${data.profile?.pseudo}'s avatar` : `Avatar de ${data.profile?.pseudo}`}
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
						{t('jpg, png ou webp — max 2 Mo')}
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
							{loadingAvatar ? t('Upload…') : t("Changer l'avatar")}
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
							{loadingDelete ? t('Suppression…') : t("Supprimer l'avatar")}
						</Button>
					</form>
				{/if}
			</div>
		</div>
	</section>

	<!-- Section pseudo -->
	<section class="mb-10">
		<h2 class="text-foreground mb-4 text-lg font-semibold">{t('Pseudo')}</h2>

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
				<Label for="pseudo">{t('Pseudo (2–30 caractères)')}</Label>
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
						{english
							? typedForm.pseudo && typedForm.pseudo.length > 30
								? 'Nickname must be at most 30 characters.'
								: 'Nickname must be at least 2 characters.'
							: typedForm.errors.pseudo[0]}
					</p>
				{/if}
			</div>

			<Button type="submit" class="w-fit" disabled={loadingPseudo} data-testid="save-pseudo-btn">
				{loadingPseudo ? t('Enregistrement…') : t('Enregistrer')}
			</Button>
		</form>
	</section>

	<!-- Infos compte -->
	<section>
		<h2 class="text-foreground mb-4 text-lg font-semibold">{t('Compte')}</h2>
		<div class="text-muted-foreground text-sm">
			{#if data.profile?.isAnonymous}
				<p>{t("Vous êtes connecté en tant qu'invité.")}</p>
			{:else}
				<p>{t('Compte sécurisé.')}</p>
			{/if}
		</div>

		<div class="mt-4">
			<Button href={resolveRoute('/app/settings/notifications')} variant="outline" size="sm">
				{t('Préférences de notifications')}
			</Button>
		</div>
	</section>
</div>
