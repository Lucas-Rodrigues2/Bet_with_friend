<script lang="ts">
	import { page } from '$app/state';
	const english = $derived(page.url.pathname === '/en' || page.url.pathname.startsWith('/en/'));
	const translations: Record<string, string> = {
		'← Retour': '← Back',
		'Créer un groupe': 'Create a group',
		'Invitez vos amis et commencez à parier ensemble.':
			'Invite your friends and start betting together.',
		'Nom du groupe': 'Group name',
		'(optionnelle)': '(optional)',
		"Devise de l'ardoise": 'Ledger currency',
		'GBP — Livre sterling (£)': 'GBP — Pound sterling (£)',
		Annuler: 'Cancel',
		'Création…': 'Creating…',
		'Créer le groupe': 'Create group'
	};
	const t = (text: string) => (english ? (translations[text] ?? text) : text);
	import { resolveRoute } from '$lib/paths';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let loading = $state(false);

	const appHref = resolveRoute('/app');

	const typedForm = $derived(
		form as
			| {
					errors?: Record<string, string[]>;
					values?: { name?: string; description?: string; currency?: string };
					message?: string;
			  }
			| null
			| undefined
	);
</script>

<div class="container mx-auto max-w-lg px-4 py-10">
	<div class="mb-8">
		<a
			href={appHref}
			class="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
		>
			{t('← Retour')}
		</a>
		<h1 class="text-foreground text-2xl font-bold bw-display">{t('Créer un groupe')}</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			{t('Invitez vos amis et commencez à parier ensemble.')}
		</p>
	</div>

	<form
		method="POST"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				loading = false;
				await update({ reset: false });
			};
		}}
		class="flex flex-col gap-6"
		data-testid="create-group-form"
	>
		<!-- Nom -->
		<div class="flex flex-col gap-1.5">
			<Label for="name">{t('Nom du groupe')} <span class="text-destructive">*</span></Label>
			<Input
				id="name"
				name="name"
				type="text"
				minlength={2}
				maxlength={50}
				placeholder={english ? 'e.g. Office friends' : 'Ex : Les potes du bureau'}
				required
				value={typedForm?.values?.name ?? ''}
				data-testid="group-name-input"
			/>
			{#if typedForm?.errors?.name}
				<p class="text-destructive text-sm" data-testid="group-name-error">
					{english
						? typedForm.values?.name && typedForm.values.name.length > 50
							? 'The name must be at most 50 characters.'
							: 'The name must be at least 2 characters.'
						: typedForm.errors.name[0]}
				</p>
			{/if}
		</div>

		<!-- Description -->
		<div class="flex flex-col gap-1.5">
			<Label for="description"
				>Description <span class="text-muted-foreground text-xs">{t('(optionnelle)')}</span></Label
			>
			<textarea
				id="description"
				name="description"
				rows={3}
				maxlength={500}
				placeholder={english ? 'A short group description…' : 'Une petite description du groupe…'}
				class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				data-testid="group-description-input">{typedForm?.values?.description ?? ''}</textarea
			>
			{#if typedForm?.errors?.description}
				<p class="text-destructive text-sm" data-testid="group-description-error">
					{english
						? 'The description must be at most 500 characters.'
						: typedForm.errors.description[0]}
				</p>
			{/if}
		</div>

		<!-- Devise -->
		<div class="flex flex-col gap-1.5">
			<Label for="currency">{t("Devise de l'ardoise")}</Label>
			<select
				id="currency"
				name="currency"
				class="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				data-testid="group-currency-select"
			>
				<option
					value="EUR"
					selected={!typedForm?.values?.currency || typedForm.values.currency === 'EUR'}
					>EUR — Euro (€)</option
				>
				<option value="USD" selected={typedForm?.values?.currency === 'USD'}
					>USD — Dollar ($)</option
				>
				<option value="GBP" selected={typedForm?.values?.currency === 'GBP'}
					>{t('GBP — Livre sterling (£)')}</option
				>
			</select>
		</div>

		{#if typedForm?.message}
			<p class="text-destructive text-sm" data-testid="form-error">
				{english ? 'Unable to create the group. Please try again.' : typedForm.message}
			</p>
		{/if}

		<div class="flex gap-3">
			<Button type="submit" disabled={loading} data-testid="submit-create-group">
				{loading ? t('Création…') : t('Créer le groupe')}
			</Button>
			<Button href={appHref} variant="outline">{t('Annuler')}</Button>
		</div>
	</form>
</div>
