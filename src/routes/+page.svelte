<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
</script>

<div
	class="container mx-auto flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 py-16"
>
	<div class="flex max-w-2xl flex-col items-center gap-6 text-center">
		<div class="text-6xl">🎲</div>

		<h1 class="text-foreground text-4xl font-bold tracking-tight sm:text-5xl">Bet With Friend</h1>

		<p class="text-muted-foreground text-xl leading-relaxed">
			Faites des paris entre amis avec des points virtuels ou des gages — sans jamais d'argent réel.
			Créez vos groupes, lancez vos défis et départagez les gagnants !
		</p>

		<div class="mt-4 flex flex-col gap-3 sm:flex-row">
			<Button href="/login" size="lg">Se connecter</Button>
			<Button href="/signup" variant="outline" size="lg">Créer un compte</Button>
		</div>
	</div>
</div>
