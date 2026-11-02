<script lang="ts">
	import { page } from '$app/state';
	const english = $derived(page.url.pathname === '/en' || page.url.pathname.startsWith('/en/'));
	function t(fr: string, en: string) {
		return english ? en : fr;
	}
	import { resolveRoute } from '$lib/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const groupHref = $derived(resolveRoute('/app/groups/[id]', { id: data.groupId }));
</script>

<div class="container mx-auto max-w-3xl px-4 py-10">
	<div class="mb-6">
		<a
			href={groupHref}
			class="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
		>
			{t('← Retour au groupe', '← Back to group')}
		</a>
	</div>

	<div class="border-border rounded-lg border border-dashed p-12 text-center">
		<h1 class="text-foreground mb-2 text-xl font-bold bw-display">
			{t('Nouveau pari', 'New bet')}
		</h1>
		<p class="text-muted-foreground mb-6 text-sm">
			{t(
				'La création de paris sera disponible prochainement.',
				'Bet creation will be available soon.'
			)}
		</p>
		<Button href={groupHref} variant="outline">{t('Retour au groupe', 'Back to group')}</Button>
	</div>
</div>
