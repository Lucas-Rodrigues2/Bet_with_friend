<script lang="ts">
	import { resolveRoute } from '$lib/paths';
	import { track } from '$lib/analytics/client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const english: Record<string, string> = {
		"Fil d'activité": 'Activity',
		'Aucun événement pour le moment.': 'No activity yet.',
		'Chargement…': 'Loading…',
		'Voir plus': 'Show more'
	};
	const isEnglish = $derived(data.lang === 'en');
	function t(text: string): string {
		return isEnglish ? (english[text] ?? text) : text;
	}

	function activityLabel(event: PageData['events'][number]): string {
		if (!isEnglish) return event.label;
		const title = event.metadata?.betTitle ?? '';
		const other = event.metadata?.otherPseudo ?? '';
		const suffixes: Record<string, string> = {
			member_joined: ' a rejoint le groupe',
			bet_created: ` a créé le pari « ${title} »`,
			match_accepted: ` a accepté le duel de ${other}`,
			match_resolved: ` a gagné le pari « ${title} »`,
			forfeit_confirmed: ' a accompli son gage'
		};
		const suffix = suffixes[event.type];
		const user = suffix && event.label.endsWith(suffix) ? event.label.slice(0, -suffix.length) : '';
		switch (event.type) {
			case 'member_joined':
				return user ? `${user} joined the group` : 'A member joined the group';
			case 'bet_created':
				return user ? `${user} created the bet “${title}”` : `Bet created: “${title}”`;
			case 'match_accepted':
				return user ? `${user} accepted ${other}'s duel` : 'A duel was accepted';
			case 'match_resolved':
				return user ? `${user} won the bet “${title}”` : `Bet resolved: “${title}”`;
			case 'match_cancelled':
				return `Bet “${title}” cancelled`;
			case 'forfeit_confirmed':
				return user ? `${user} completed their forfeit` : 'A forfeit was completed';
			default:
				return 'Unknown event';
		}
	}

	const groupHref = $derived(resolveRoute('/app/groups/[id]', { id: data.group.id }));

	let allEvents = $state<PageData['events']>([]);
	let currentOffset = $state(0);
	let hasMore = $state(false);
	let loading = $state(false);

	$effect(() => {
		allEvents = data.events;
		currentOffset = data.offset;
		hasMore = data.hasMore;
	});

	// Track when the activity feed is viewed.
	// Depends on group id so it fires once per group visit (not on every loadMore).
	$effect(() => {
		const groupId = data.group.id;
		track('activity_viewed', {
			group_id: groupId,
			events_count: data.events.length
		});
	});

	async function loadMore() {
		if (loading || !hasMore) return;
		loading = true;
		const nextOffset = currentOffset + data.limit;
		try {
			const res = await fetch(`/api/groups/${data.group.id}/activity?offset=${nextOffset}`);
			if (!res.ok) return;
			const json = await res.json();
			allEvents = [...allEvents, ...json.events];
			hasMore = json.hasMore;
			currentOffset = nextOffset;
			track('activity_load_more', {
				group_id: data.group.id,
				offset: nextOffset,
				loaded_count: (json.events ?? []).length
			});
		} finally {
			loading = false;
		}
	}

	function formatDate(date: Date | string): string {
		const d = new Date(date);
		return d.toLocaleDateString(isEnglish ? 'en-GB' : 'fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function typeIcon(type: string): string {
		switch (type) {
			case 'member_joined':
				return '\u{1F464}';
			case 'bet_created':
				return '\u{1F3B2}';
			case 'match_accepted':
				return '\u{1F91D}';
			case 'match_resolved':
				return '\u{1F3C6}';
			case 'match_cancelled':
				return '\u274C';
			case 'forfeit_confirmed':
				return '\u2705';
			default:
				return '\u2022';
		}
	}
</script>

<div class="container mx-auto max-w-3xl px-4 py-10">
	<div class="mb-6">
		<a
			href={groupHref}
			class="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
		>
			← {data.group.name}
		</a>
	</div>

	<h1 class="text-foreground mb-8 text-2xl font-bold bw-display" data-testid="activity-title">
		{t("Fil d'activité")}
	</h1>

	{#if allEvents.length === 0}
		<div
			class="border-border rounded-lg border border-dashed p-10 text-center"
			data-testid="empty-activity"
		>
			<p class="text-muted-foreground text-sm">{t('Aucun événement pour le moment.')}</p>
		</div>
	{:else}
		<ul class="flex flex-col gap-3" data-testid="activity-list">
			{#each allEvents as event (event.id)}
				<li data-testid="activity-item">
					<a
						href={isEnglish ? `/en${event.link}` : event.link}
						class="border-border bg-card hover:bg-accent/30 flex items-start gap-4 rounded-lg border p-4 transition-colors"
					>
						<span class="mt-0.5 shrink-0 text-lg" aria-hidden="true">{typeIcon(event.type)}</span>
						<div class="min-w-0 flex-1">
							<p class="text-foreground text-sm" data-testid="activity-label">
								{activityLabel(event)}
							</p>
							<p class="text-muted-foreground mt-1 text-xs" data-testid="activity-date">
								{formatDate(event.date)}
							</p>
						</div>
					</a>
				</li>
			{/each}
		</ul>

		{#if hasMore}
			<div class="mt-6 text-center">
				<button
					onclick={loadMore}
					disabled={loading}
					class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-6 py-2 text-sm font-medium disabled:opacity-50"
					data-testid="load-more-btn"
				>
					{loading ? t('Chargement…') : t('Voir plus')}
				</button>
			</div>
		{/if}
	{/if}
</div>
