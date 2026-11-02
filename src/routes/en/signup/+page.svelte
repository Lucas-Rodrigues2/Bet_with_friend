<script lang="ts">
	// Relais vers la page unique [[lang]] — évite la duplication de code.
	// (Ce fichier existe encore pour la route historique /en ; la suppression du
	// dossier obsolète est en attente d'approbation.)
	import SignupPage from '../../[[lang]]/signup/+page.svelte';
	import type { ComponentProps } from 'svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	// Les types $types sont nominatifs par route : conversion à la frontière.
	const pageProps = $derived({ form } as unknown as ComponentProps<typeof SignupPage>);
</script>

<SignupPage {...pageProps} />
