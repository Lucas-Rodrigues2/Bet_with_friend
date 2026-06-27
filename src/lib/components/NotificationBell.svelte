<script lang="ts">
	import {
		getNotificationLabel,
		getNotificationHref,
		type NotificationType,
		type NotificationItem
	} from '$lib/notifications';

	let { initialUnreadCount = 0 }: { initialUnreadCount: number } = $props();

	let isOpen = $state(false);
	// localCountOverride: null means "use server value from initialUnreadCount"
	let localCountOverride = $state<number | null>(null);
	let unreadCount = $derived(localCountOverride !== null ? localCountOverride : initialUnreadCount);
	let items = $state<NotificationItem[]>([]);
	let loading = $state(false);
	let intervalId: ReturnType<typeof setInterval> | undefined;

	async function fetchNotifications() {
		loading = true;
		try {
			const res = await fetch('/api/notifications');
			if (res.ok) {
				const data = await res.json();
				items = data.notifications.map(
					(n: {
						id: string;
						type: string;
						payload: Record<string, unknown>;
						readAt: string | null;
						createdAt: string;
					}) => ({
						id: n.id,
						type: n.type as NotificationType,
						payload: n.payload,
						readAt: n.readAt ? new Date(n.readAt) : null,
						createdAt: new Date(n.createdAt)
					})
				);
				localCountOverride = data.unreadCount;
			}
		} catch {
			// silently ignore fetch errors
		} finally {
			loading = false;
		}
	}

	async function fetchUnreadCount() {
		try {
			const res = await fetch('/api/notifications');
			if (res.ok) {
				const data = await res.json();
				localCountOverride = data.unreadCount;
			}
		} catch {
			// silently ignore
		}
	}

	async function markRead(notificationId: string) {
		try {
			await fetch('/api/notifications/mark-read', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: notificationId })
			});
		} catch {
			// silently ignore
		}
		items = items.map((n) => (n.id === notificationId ? { ...n, readAt: new Date() } : n));
		localCountOverride = Math.max(0, unreadCount - 1);
	}

	async function markAllRead() {
		try {
			await fetch('/api/notifications/mark-read', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ all: true })
			});
		} catch {
			// silently ignore
		}
		items = items.map((n) => ({ ...n, readAt: n.readAt ?? new Date() }));
		localCountOverride = 0;
	}

	function handleNotificationClick(item: NotificationItem) {
		if (!item.readAt) {
			markRead(item.id);
		}
		isOpen = false;
	}

	function togglePanel() {
		isOpen = !isOpen;
		if (isOpen) {
			fetchNotifications();
		}
	}

	function formatRelativeTime(date: Date): string {
		const diffMs = Date.now() - date.getTime();
		const diffMin = Math.floor(diffMs / 60_000);
		if (diffMin < 1) return "à l'instant";
		if (diffMin < 60) return `il y a ${diffMin} min`;
		const diffH = Math.floor(diffMin / 60);
		if (diffH < 24) return `il y a ${diffH} h`;
		const diffD = Math.floor(diffH / 24);
		return `il y a ${diffD} j`;
	}

	$effect(() => {
		// Poll every 30 seconds for unread count
		intervalId = setInterval(fetchUnreadCount, 30_000);
		return () => {
			if (intervalId !== undefined) clearInterval(intervalId);
		};
	});
</script>

<div class="relative" data-testid="notification-bell">
	<!-- Bell button -->
	<button
		type="button"
		onclick={togglePanel}
		aria-label="Notifications{unreadCount > 0 ? ` (${unreadCount} non lues)` : ''}"
		aria-expanded={isOpen}
		data-testid="notification-bell-button"
		class="relative flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		<!-- Bell icon (SVG) -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
			<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
		</svg>

		<!-- Unread badge -->
		{#if unreadCount > 0}
			<span
				class="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold text-destructive-foreground"
				data-testid="notification-badge"
				aria-hidden="true"
			>
				{unreadCount > 99 ? '99+' : unreadCount}
			</span>
		{/if}
	</button>

	<!-- Backdrop -->
	{#if isOpen}
		<div
			class="fixed inset-0 z-40"
			role="presentation"
			onclick={() => (isOpen = false)}
			onkeydown={() => {}}
		></div>

		<!-- Notification panel -->
		<div
			class="bg-popover text-popover-foreground absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border shadow-lg sm:w-96"
			data-testid="notification-panel"
			role="dialog"
			aria-label="Panneau des notifications"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b px-4 py-3">
				<h2 class="text-sm font-semibold">Notifications</h2>
				{#if unreadCount > 0}
					<button
						type="button"
						onclick={markAllRead}
						class="text-xs text-muted-foreground hover:text-foreground"
						data-testid="mark-all-read"
					>
						Tout marquer lu
					</button>
				{/if}
			</div>

			<!-- List -->
			<ul class="max-h-96 overflow-y-auto" aria-label="Liste des notifications">
				{#if loading}
					<li class="p-4 text-center text-sm text-muted-foreground">Chargement…</li>
				{:else if items.length === 0}
					<li class="p-6 text-center text-sm text-muted-foreground">
						Aucune notification pour l'instant.
					</li>
				{:else}
					{#each items as item (item.id)}
						{@const href = getNotificationHref(item.type, item.payload)}
						<li class="border-b last:border-b-0">
							{#if href}
								<a
									{href}
									onclick={() => handleNotificationClick(item)}
									class="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent {item.readAt
										? 'opacity-60'
										: ''}"
									data-testid="notification-item"
									data-read={item.readAt !== null}
								>
									<!-- Unread dot -->
									<span class="mt-1.5 flex-shrink-0">
										{#if !item.readAt}
											<span class="block h-2 w-2 rounded-full bg-primary" aria-label="Non lue"
											></span>
										{:else}
											<span class="block h-2 w-2 rounded-full bg-transparent"></span>
										{/if}
									</span>
									<div class="min-w-0 flex-1">
										<p class="text-sm leading-snug">
											{getNotificationLabel(item.type, item.payload)}
										</p>
										<p class="mt-0.5 text-xs text-muted-foreground">
											{formatRelativeTime(item.createdAt)}
										</p>
									</div>
								</a>
							{:else}
								<button
									type="button"
									onclick={() => handleNotificationClick(item)}
									class="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent {item.readAt
										? 'opacity-60'
										: ''}"
									data-testid="notification-item"
									data-read={item.readAt !== null}
								>
									<!-- Unread dot -->
									<span class="mt-1.5 flex-shrink-0">
										{#if !item.readAt}
											<span class="block h-2 w-2 rounded-full bg-primary" aria-label="Non lue"
											></span>
										{:else}
											<span class="block h-2 w-2 rounded-full bg-transparent"></span>
										{/if}
									</span>
									<div class="min-w-0 flex-1">
										<p class="text-sm leading-snug">
											{getNotificationLabel(item.type, item.payload)}
										</p>
										<p class="mt-0.5 text-xs text-muted-foreground">
											{formatRelativeTime(item.createdAt)}
										</p>
									</div>
								</button>
							{/if}
						</li>
					{/each}
				{/if}
			</ul>
		</div>
	{/if}
</div>
