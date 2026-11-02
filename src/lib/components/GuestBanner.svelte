<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { tr, lp, type Lang, type MessageKey } from '$lib/i18n';

	let { lang = 'fr' }: { lang?: Lang } = $props();

	const t = (k: MessageKey) => tr(lang, k);
	const claimHref = $derived(lp(lang, '/claim'));
</script>

<div
	class="border-b border-[var(--bw-line)] bg-[#f6edd7] px-4 py-2.5"
	role="alert"
	data-testid="guest-banner"
>
	<div class="container mx-auto flex items-center justify-between gap-4">
		<p class="text-sm text-[#7a5a1c]">
			<strong>{t('Compte invité')}</strong>
			{t('— Sécurise ton historique pour ne rien perdre.')}
		</p>
		<Button href={claimHref} size="sm" class="shrink-0">
			{t('Sécuriser mon compte')}
		</Button>
	</div>
</div>
