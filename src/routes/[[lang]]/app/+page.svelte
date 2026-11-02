<script lang="ts">
	import { page } from '$app/state';
	const english = $derived(page.url.pathname === '/en' || page.url.pathname.startsWith('/en/'));
	const translations: Record<string, string> = {
		'Mes groupes': 'My groups',
		'Mes paris': 'My bets',
		'Créer un groupe': 'Create a group',
		"Vous n'avez pas encore de groupe.": 'You have no groups yet.',
		'Créer votre premier groupe': 'Create your first group'
	};
	const t = (text: string) => (english ? (translations[text] ?? text) : text);
	import { resolveRoute } from '$lib/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const newGroupHref = resolveRoute('/app/groups/new');
	const myBetsHref = resolveRoute('/app/my-bets');
</script>

<div class="container mx-auto max-w-3xl px-4 py-10">
	<div class="mb-8 flex items-center justify-between">
		<h1 class="text-foreground text-2xl font-bold bw-display" data-testid="my-groups-title">
			{t('Mes groupes')}
		</h1>
		<div class="flex items-center gap-2">
			<Button href={myBetsHref} variant="outline" data-testid="my-bets-link"
				>{t('Mes paris')}</Button
			>
			<Button href={newGroupHref} data-testid="create-group-btn">{t('Créer un groupe')}</Button>
		</div>
	</div>

	{#if data.myGroups.length === 0}
		<div
			class="border-border rounded-lg border border-dashed p-12 text-center"
			data-testid="empty-groups"
		>
			<p class="text-muted-foreground mb-4">{t("Vous n'avez pas encore de groupe.")}</p>
			<Button href={newGroupHref} variant="outline">{t('Créer votre premier groupe')}</Button>
		</div>
	{:else}
		<ul class="flex flex-col gap-4" data-testid="groups-list">
			{#each data.myGroups as group (group.id)}
				<li>
					<a
						href={resolveRoute('/app/groups/[id]', { id: group.id })}
						class="border-border bg-card hover:border-primary block rounded-lg border p-5 transition-colors"
						data-testid="group-card"
					>
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<h2 class="text-foreground truncate font-semibold" data-testid="group-name">
									{group.name}
								</h2>
								{#if group.description}
									<p
										class="text-muted-foreground mt-1 truncate text-sm"
										data-testid="group-description"
									>
										{group.description}
									</p>
								{/if}
							</div>
							<div class="flex shrink-0 items-center gap-2">
								{#if group.role === 'admin'}
									<span
										class="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium"
										data-testid="group-admin-badge"
									>
										Admin
									</span>
								{/if}
								<span class="text-muted-foreground text-xs" data-testid="group-currency">
									{group.currency}
								</span>
							</div>
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
