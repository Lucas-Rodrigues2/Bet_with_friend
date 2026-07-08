<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		isPushSupported,
		subscribeToPush,
		unsubscribeFromPush,
		getCurrentEndpoint,
		getPermissionState,
		type PushPermissionState
	} from '$lib/push';
	import type { ActionData, PageData } from './$types';
	import type { NotifChannel, NotificationType } from '$lib/notifications';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Overrides locaux pour feedback instantané avant la confirmation serveur.
	// Clé "type:channel" -> valeur en attente. Quand le serveur confirme et que
	// data.prefs est rafraîchi (invalidateAll), l'override est nettoyé.
	let overrides = $state<Record<string, boolean>>({});

	const typedForm = $derived(
		form as
			| {
					action?: string;
					success?: boolean;
					message?: string;
					type?: string;
					channel?: string;
					enabled?: boolean;
			  }
			| null
			| undefined
	);

	function prefKey(type: string, channel: string) {
		return `${type}:${channel}`;
	}

	function prefValue(type: NotificationType, channel: NotifChannel): boolean {
		const key = prefKey(type, channel);
		if (key in overrides) return overrides[key];
		return data.prefs[type][channel];
	}

	// ─── Web Push : état de l'abonnement sur cet appareil ───────────────────────
	// La colonne « push » de la matrice n'est plus « bientôt » : elle est
	// active (les cases à cocher pilotent la préférence serveur ; le bouton
	// ci-dessous pilote l'abonnement navigateur « cet appareil »).
	let pushSupported = $state(false);
	let permission = $state<PushPermissionState>('default');
	let currentEndpoint = $state<string | null>(null);
	let pushBusy = $state(false);

	async function refreshPushState() {
		pushSupported = isPushSupported();
		permission = getPermissionState();
		currentEndpoint = await getCurrentEndpoint();
	}

	onMount(() => {
		void refreshPushState();
	});

	// true si cet appareil a un abonnement push actif enregistré côté serveur.
	// On compare l'endpoint courant (navigateur) avec la DB ; le serveur ne
	// renvoie que le compte, donc on se base sur la présence d'un endpoint
	// courant + l'existence d'au moins un abonnement serveur.
	let pushActiveHere = $derived(currentEndpoint !== null && (data.pushSubscriptionCount ?? 0) > 0);

	async function handleEnablePush() {
		pushBusy = true;
		try {
			const res = await subscribeToPush();
			if (!res.ok) {
				if (res.error === 'denied') {
					toast.error('Permission de notifications refusée.');
				} else if (res.error === 'unsupported') {
					toast.error('Votre navigateur ne supporte pas les notifications push.');
				} else {
					toast.error("Impossible de s'abonner aux notifications push.");
				}
				permission = getPermissionState();
				return;
			}
			// Enregistre l'abonnement côté serveur via form action (POST).
			const fd = new FormData();
			fd.set('endpoint', res.endpoint ?? '');
			fd.set('keys_p256dh', res.keys?.p256dh ?? '');
			fd.set('keys_auth', res.keys?.auth ?? '');
			const r = await fetch('?/subscribe_push', { method: 'POST', body: fd });
			if (!r.ok) {
				toast.error("Erreur lors de l'enregistrement de l'abonnement.");
				return;
			}
			toast.success('Notifications push activées sur cet appareil.');
			await invalidateAll();
			await refreshPushState();
		} finally {
			pushBusy = false;
		}
	}

	async function handleDisablePush() {
		pushBusy = true;
		try {
			// Désabonne le navigateur d'abord (best-effort).
			const unsub = await unsubscribeFromPush();
			// Supprime la ligne serveur même si le client n'a pas réussi à
			// unsubscribe (ex: abonnement expiré côté push service).
			const fd = new FormData();
			fd.set('endpoint', unsub.endpoint ?? currentEndpoint ?? '');
			const r = await fetch('?/unsubscribe_push', { method: 'POST', body: fd });
			if (!r.ok) {
				toast.error("Erreur lors de la suppression de l'abonnement.");
				return;
			}
			toast.success('Notifications push désactivées sur cet appareil.');
			await invalidateAll();
			await refreshPushState();
		} finally {
			pushBusy = false;
		}
	}

	function handleChange(type: NotificationType, channel: NotifChannel, event: Event) {
		const input = event.target as HTMLInputElement;
		const enabled = input.checked;
		overrides[prefKey(type, channel)] = enabled;

		// Soumission programmatique du formulaire concerné.
		const formEl = input.form;
		if (formEl) {
			const hidden = formEl.querySelector('input[name="enabled"]') as HTMLInputElement | null;
			if (hidden) hidden.value = enabled ? 'true' : 'false';
			formEl.requestSubmit();
		}
	}

	// Réaction aux retours de form actions
	$effect(() => {
		const f = typedForm;
		if (!f) return;

		if (f.action === 'update' && f.success) {
			if (f.type && f.channel) delete overrides[prefKey(f.type, f.channel)];
			toast.success('Préférence enregistrée.');
			invalidateAll();
		} else if (f.action === 'reset' && f.success) {
			overrides = {};
			toast.success('Préférences réinitialisées.');
			invalidateAll();
		} else if (f.message) {
			toast.error(f.message);
			invalidateAll();
		}
	});
</script>

<div class="container mx-auto max-w-4xl px-4 py-10">
	<div class="mb-8 flex items-center justify-between">
		<h1 class="text-foreground text-2xl font-bold">Préférences de notifications</h1>
		<form
			method="POST"
			action="?/reset"
			use:enhance={() => {
				return async ({ update }) => {
					await update();
				};
			}}
		>
			<Button type="submit" variant="outline" size="sm" data-testid="reset-prefs-btn">
				Réinitialiser
			</Button>
		</form>
	</div>

	<p class="text-muted-foreground mb-8 text-sm">
		Choisissez, pour chaque type d'événement et chaque canal, ce que vous souhaitez recevoir. Le
		canal email est actif : vous recevrez un mail à votre adresse pour les événements activés. Le
		canal push envoie une notification système sur vos appareils abonnés (activez-le ci-dessous pour
		cet appareil).
	</p>

	<!-- ─── Web Push : abonnement « cet appareil » ─────────────────────────── -->
	<section class="bg-card mb-8 rounded-lg border p-4" data-testid="push-subscription-section">
		<h2 class="text-foreground mb-2 text-lg font-semibold">Notifications push sur cet appareil</h2>
		<p class="text-muted-foreground mb-4 text-sm">
			Les cases de la colonne « Push » ci-dessous décident quels types d'événements déclenchent un
			push. Pour recevoir effectivement les notifications sur cet appareil, vous devez aussi
			l'autoriser ici.
		</p>

		{#if !pushSupported}
			<p class="text-muted-foreground text-sm" data-testid="push-unsupported-msg">
				Votre navigateur ne supporte pas les notifications push (Service Worker / Push API
				indisponibles).
			</p>
		{:else if pushActiveHere}
			<div class="flex flex-wrap items-center gap-3">
				<span class="text-sm font-medium text-green-600" data-testid="push-active-indicator">
					✓ Notifications push activées sur cet appareil
				</span>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={pushBusy}
					onclick={handleDisablePush}
					data-testid="disable-push-btn"
				>
					{pushBusy ? 'Désactivation…' : 'Désactiver sur cet appareil'}
				</Button>
			</div>
		{:else if permission === 'denied'}
			<p class="text-muted-foreground text-sm" data-testid="push-denied-msg">
				Vous avez refusé les notifications. Réautorisez-les dans les réglages du navigateur pour
				réessayer.
			</p>
		{:else}
			<div class="flex flex-wrap items-center gap-3">
				<Button
					type="button"
					size="sm"
					disabled={pushBusy}
					onclick={handleEnablePush}
					data-testid="enable-push-btn"
				>
					{pushBusy ? 'Activation…' : 'Activer les notifications push sur cet appareil'}
				</Button>
			</div>
		{/if}

		{#if (data.pushSubscriptionCount ?? 0) > 0}
			<p class="text-muted-foreground mt-3 text-xs" data-testid="push-subscription-count">
				{data.pushSubscriptionCount}
				abonnement{data.pushSubscriptionCount > 1 ? 's' : ''} push enregistré{data.pushSubscriptionCount >
				1
					? 's'
					: ''}
				sur votre compte (tous appareils confondus).
			</p>
		{/if}
	</section>

	<div class="flex flex-col gap-8" data-testid="notif-prefs-matrix">
		{#each data.themes as theme (theme.title)}
			<section class="bg-card rounded-lg border p-4" data-testid="notif-theme-{theme.title}">
				<h2 class="text-foreground mb-4 text-lg font-semibold">{theme.title}</h2>

				<div class="overflow-x-auto">
					<table class="w-full border-collapse">
						<thead>
							<tr class="border-b text-left">
								<th class="text-muted-foreground p-2 text-xs font-medium uppercase tracking-wide">
									Événement
								</th>
								{#each data.channels as channel (channel)}
									<th
										class="text-muted-foreground p-2 text-center text-xs font-medium uppercase tracking-wide"
									>
										<div class="flex flex-col items-center gap-0.5">
											<span>{data.channelLabels[channel]}</span>
										</div>
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each theme.types as type (type)}
								<tr class="border-b last:border-b-0" data-testid="notif-row-{type}">
									<th scope="row" class="text-foreground p-2 text-sm font-normal">
										{data.typeLabels[type]}
									</th>
									{#each data.channels as channel (channel)}
										{@const checked = prefValue(type, channel)}
										<td class="p-2 text-center">
											<form
												method="POST"
												action="?/update"
												use:enhance={() => {
													return async ({ update }) => {
														await update({ reset: false });
													};
												}}
												class="inline"
											>
												<input type="hidden" name="type" value={type} />
												<input type="hidden" name="channel" value={channel} />
												<input type="hidden" name="enabled" value={checked ? 'true' : 'false'} />
												<input
													type="checkbox"
													{checked}
													onchange={(e) => handleChange(type, channel, e)}
													aria-label="{data.typeLabels[type]} — {data.channelLabels[channel]}"
													data-testid="notif-checkbox-{type}-{channel}"
													class="h-4 w-4 cursor-pointer rounded border-border align-middle disabled:cursor-not-allowed"
												/>
											</form>
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/each}
	</div>
</div>
