<script lang="ts">
	let { data } = $props();
</script>

<div
	class="container mx-auto flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 py-16"
>
	<div class="flex max-w-md flex-col items-center gap-4 text-center">
		<div class="text-5xl">🎲</div>
		<h1 class="text-foreground text-3xl font-bold">Tableau de bord</h1>
		<p class="text-muted-foreground">
			Bienvenue, <strong>{data.profile?.pseudo ?? 'ami'}</strong> !
		</p>
	</div>
</div>
