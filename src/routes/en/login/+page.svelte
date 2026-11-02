<script lang="ts">
	// Relais vers la page unique [[lang]] — évite la duplication de code.
	// (Ce fichier existe encore pour la route historique /en ; la suppression du
	// dossier obsolète est en attente d'approbation.)
	import LoginPage from '../../[[lang]]/login/+page.svelte';
	import type { ComponentProps } from 'svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	// Les types $types sont nominatifs par route : conversion à la frontière.
	const pageProps = $derived({ data, form } as unknown as ComponentProps<typeof LoginPage>);
</script>

<LoginPage {...pageProps} />
