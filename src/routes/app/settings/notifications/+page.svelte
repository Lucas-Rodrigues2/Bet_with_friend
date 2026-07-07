<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
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

	function isChannelComingSoon(channel: NotifChannel): boolean {
		return channel === 'email' || channel === 'push';
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
		Choisissez, pour chaque type d'événement et chaque canal, ce que vous souhaitez recevoir. Les
		canaux email et push sont affichés « bientôt » — l'état est néanmoins sauvegardé pour quand ils
		seront disponibles.
	</p>

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
											{#if isChannelComingSoon(channel)}
												<span
													class="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-normal normal-case"
												>
													bientôt
												</span>
											{/if}
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
