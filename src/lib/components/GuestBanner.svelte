<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';

	const claimHref = resolveRoute('/claim');
</script>

<div
	class="bg-amber-50 border-amber-200 border-b px-4 py-2"
	role="alert"
	data-testid="guest-banner"
>
	<div class="container mx-auto flex items-center justify-between gap-4">
		<p class="text-amber-800 text-sm">
			<strong>Compte invité</strong> — Sécurise ton historique pour ne rien perdre.
		</p>
		<Button
			href={claimHref}
			size="sm"
			class="shrink-0 bg-amber-600 hover:bg-amber-700 text-white border-0"
		>
			Sécuriser mon compte
		</Button>
	</div>
</div>
