<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const appHref = resolveRoute('/app');
</script>

<div class="container mx-auto max-w-3xl px-4 py-10">
	<div class="mb-6">
		<a
			href={appHref}
			class="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
		>
			← Mes groupes
		</a>
	</div>

	<div class="flex items-start justify-between gap-4">
		<div>
			<div class="flex items-center gap-3">
				<h1 class="text-foreground text-2xl font-bold" data-testid="group-name">
					{data.group.name}
				</h1>
				{#if data.group.role === 'admin'}
					<span
						class="bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-xs font-medium"
						data-testid="admin-badge"
					>
						Admin
					</span>
				{/if}
			</div>

			{#if data.group.description}
				<p class="text-muted-foreground mt-2 text-sm" data-testid="group-description">
					{data.group.description}
				</p>
			{/if}

			<p class="text-muted-foreground mt-1 text-xs" data-testid="group-currency">
				Devise : {data.group.currency}
			</p>
		</div>
	</div>

	<div class="border-border mt-10 rounded-lg border border-dashed p-10 text-center">
		<p class="text-muted-foreground text-sm">
			Le tableau de bord complet du groupe sera disponible prochainement.
		</p>
		<Button href={appHref} variant="outline" class="mt-4">Retour à mes groupes</Button>
	</div>
</div>
