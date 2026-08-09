<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import PwaInstallButton from '$lib/components/PwaInstallButton.svelte';
	import {
		ArrowRight,
		Check,
		ChevronRight,
		CircleCheck,
		Clock3,
		Gavel,
		Gift,
		LockKeyhole,
		MessagesSquare,
		Sparkles,
		Target,
		Trophy,
		UsersRound
	} from '@lucide/svelte';

	let { data } = $props();

	const steps = [
		{
			number: '01',
			title: 'Rassemble ta bande',
			text: 'Crée un groupe et partage un lien. Tes amis peuvent même rejoindre en invité, sans friction.',
			icon: UsersRound
		},
		{
			number: '02',
			title: 'Lance le débat',
			text: 'Choisis un défi, une mise en points ou un gage, les participants et les membres du jury.',
			icon: MessagesSquare
		},
		{
			number: '03',
			title: 'Laisse le jury trancher',
			text: "Quand l'événement a eu lieu, le jury vote. Le verdict met automatiquement les comptes à jour.",
			icon: Gavel
		}
	];
</script>

<svelte:head>
	<title>Bet With Friend — Les paris entre amis, sans argent réel</title>
	<meta
		name="description"
		content="Créez un groupe, lancez des paris entre amis avec des points ou des gages, puis laissez votre jury désigner les gagnants."
	/>
	<link rel="canonical" href="https://bet-with-friends.fly.dev/" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://bet-with-friends.fly.dev/" />
	<meta property="og:title" content="Bet With Friend" />
	<meta
		property="og:description"
		content="Paris entre amis avec points virtuels ou gages, sans jamais d'argent réel."
	/>
</svelte:head>

<div class="overflow-hidden bg-[#fbfaf7] text-slate-950">
	<section class="relative border-b border-slate-200/80">
		<div
			class="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(#cbd5e1_0.75px,transparent_0.75px)] [background-size:22px_22px]"
		></div>
		<div
			class="pointer-events-none absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-amber-200/40 blur-3xl"
		></div>

		<div
			class="container relative mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:py-28"
		>
			<div class="max-w-xl">
				<div
					class="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-100/80 px-3 py-1.5 text-xs font-bold tracking-wide text-amber-950 uppercase"
				>
					<Sparkles class="size-3.5" />
					Les débats ont enfin un arbitre
				</div>
				<h1 class="text-5xl leading-[0.95] font-black tracking-[-0.055em] sm:text-6xl lg:text-7xl">
					Bet With Friend
				</h1>
				<p class="mt-6 max-w-lg text-xl leading-relaxed font-medium text-slate-600 sm:text-2xl">
					Transforme les <span class="text-slate-950">« je te parie que… »</span> en vrais défis entre
					amis.
				</p>
				<p class="mt-3 max-w-lg leading-relaxed text-slate-500">
					Un groupe, une prédiction, un jury. À la fin, l'app se souvient de qui avait raison et
					tient les comptes. Jamais d'argent réel.
				</p>

				{#if data.session}
					<div class="mt-8">
						<Button href="/app" size="lg" class="h-12 rounded-full bg-slate-950 px-6 text-base">
							Mes groupes <ArrowRight />
						</Button>
					</div>
				{:else}
					<div class="mt-8 flex flex-col gap-3 sm:flex-row">
						<Button href="/signup" size="lg" class="h-12 rounded-full bg-slate-950 px-6 text-base">
							Créer un compte <ArrowRight />
						</Button>
						<Button
							href="/login"
							variant="outline"
							size="lg"
							class="h-12 rounded-full border-slate-300 bg-white/70 px-6 text-base"
						>
							Se connecter
						</Button>
					</div>
				{/if}
				<div class="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
					<span class="flex items-center gap-1.5"
						><Check class="size-4 text-emerald-600" /> Gratuit</span
					>
					<span class="flex items-center gap-1.5"
						><Check class="size-4 text-emerald-600" /> Sans carte bancaire</span
					>
				</div>
			</div>

			<div class="relative mx-auto w-full max-w-xl lg:mx-0">
				<div class="absolute -inset-4 rotate-2 rounded-[2rem] bg-slate-900/5"></div>
				<div
					class="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_30px_80px_-30px_rgba(15,23,42,0.3)]"
				>
					<div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
						<div class="flex items-center gap-3">
							<div class="flex size-9 items-center justify-center rounded-xl bg-slate-950 text-lg">
								⚽
							</div>
							<div>
								<p class="text-sm font-bold">Les potes du dimanche</p>
								<p class="text-xs text-slate-400">8 membres</p>
							</div>
						</div>
						<div class="flex -space-x-2" aria-label="Membres du groupe">
							<span
								class="flex size-8 items-center justify-center rounded-full border-2 border-white bg-sky-200 text-xs font-bold"
								>L</span
							>
							<span
								class="flex size-8 items-center justify-center rounded-full border-2 border-white bg-rose-200 text-xs font-bold"
								>M</span
							>
							<span
								class="flex size-8 items-center justify-center rounded-full border-2 border-white bg-violet-200 text-xs font-bold"
								>A</span
							>
							<span
								class="flex size-8 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-xs font-bold text-slate-500"
								>+5</span
							>
						</div>
					</div>

					<div class="p-5 sm:p-7">
						<div class="mb-4 flex items-center justify-between gap-3">
							<span
								class="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700"
								>Ouvert</span
							>
							<span class="flex items-center gap-1.5 text-xs text-slate-400"
								><Clock3 class="size-3.5" /> Jusqu'à 20h45</span
							>
						</div>
						<p class="text-xs font-bold tracking-wider text-slate-400 uppercase">
							Pari au plus proche
						</p>
						<h2 class="mt-2 text-2xl leading-tight font-extrabold tracking-tight sm:text-3xl">
							Combien de buts ce soir ?
						</h2>

						<div class="mt-6 grid grid-cols-2 gap-3">
							<div class="rounded-2xl bg-amber-50 p-4">
								<p class="text-xs font-semibold text-amber-800/60">Mise</p>
								<p class="mt-1 text-xl font-black text-amber-950">5 points</p>
							</div>
							<div class="rounded-2xl bg-slate-50 p-4">
								<p class="text-xs font-semibold text-slate-400">Réponses</p>
								<p class="mt-1 flex items-center gap-2 text-sm font-bold">
									<LockKeyhole class="size-4" /> Cachées
								</p>
							</div>
						</div>

						<div class="mt-5 rounded-2xl border border-slate-200 p-4">
							<div class="flex items-center justify-between">
								<p class="text-sm font-bold">Ta prédiction</p>
								<span class="text-xs text-slate-400">3 amis ont joué</span>
							</div>
							<div class="mt-3 flex gap-2">
								<div
									class="flex h-11 flex-1 items-center rounded-xl bg-slate-100 px-4 text-sm text-slate-400"
								>
									Écris ta réponse…
								</div>
								<div
									class="flex h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white"
								>
									Participer
								</div>
							</div>
						</div>
					</div>
				</div>

				<div
					class="absolute -right-3 -bottom-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white p-3 pr-5 shadow-xl sm:-right-8"
				>
					<div
						class="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"
					>
						<CircleCheck class="size-5" />
					</div>
					<div>
						<p class="text-xs text-slate-400">Dernier verdict</p>
						<p class="text-sm font-extrabold">Marie gagne +15 pts</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="bg-slate-950 py-20 text-white sm:py-28" aria-labelledby="fonctionnement-title">
		<div class="container mx-auto max-w-6xl px-4 sm:px-6">
			<div class="max-w-2xl">
				<p class="text-sm font-bold tracking-widest text-amber-300 uppercase">
					Simple comme une discussion de groupe
				</p>
				<h2
					id="fonctionnement-title"
					class="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-5xl"
				>
					Du pari lancé au verdict, tout est cadré.
				</h2>
			</div>

			<div class="mt-14 grid gap-px overflow-hidden rounded-3xl bg-white/15 md:grid-cols-3">
					{#each steps as step (step.number)}
					<div class="group relative bg-slate-950 p-7 sm:p-9">
						<div class="flex items-start justify-between">
							<div
								class="flex size-12 items-center justify-center rounded-2xl bg-white/10 text-amber-300 transition-transform group-hover:-rotate-3 group-hover:scale-105"
							>
								<step.icon class="size-5" />
							</div>
							<span class="font-mono text-sm text-white/30">{step.number}</span>
						</div>
						<h3 class="mt-8 text-xl font-bold">{step.title}</h3>
						<p class="mt-3 leading-relaxed text-slate-400">{step.text}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<section class="py-20 sm:py-28" aria-labelledby="formats-title">
		<div class="container mx-auto max-w-6xl px-4 sm:px-6">
			<div class="flex flex-col justify-between gap-5 md:flex-row md:items-end">
				<div class="max-w-2xl">
					<p class="text-sm font-bold tracking-widest text-violet-600 uppercase">
						À chacun son terrain de jeu
					</p>
					<h2 id="formats-title" class="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-5xl">
						Deux façons de se challenger.
					</h2>
				</div>
				<p class="max-w-sm text-slate-500">
					Match, voyage, défi personnel ou prédiction improbable : le format s'adapte à la question.
				</p>
			</div>

			<div class="mt-12 grid gap-5 lg:grid-cols-2">
				<article class="overflow-hidden rounded-3xl border border-violet-200 bg-violet-50">
					<div class="p-7 sm:p-9">
						<div
							class="flex size-12 items-center justify-center rounded-2xl bg-violet-600 text-white"
						>
							<Target class="size-6" />
						</div>
						<p class="mt-8 text-sm font-bold tracking-wider text-violet-600 uppercase">
							Tous ensemble
						</p>
						<h3 class="mt-2 text-3xl font-black tracking-tight">Au plus proche</h3>
						<p class="mt-3 max-w-md leading-relaxed text-slate-600">
							Chacun propose sa réponse, visible ou secrète. Le jury peut désigner un ou plusieurs
							gagnants.
						</p>
					</div>
					<div class="mx-5 mb-5 rounded-2xl border border-violet-200 bg-white p-5 sm:mx-7 sm:mb-7">
						<p class="text-sm font-bold">« Qui arrivera le plus près du temps du marathon ? »</p>
						<div class="mt-4 flex items-center gap-3 text-xs text-slate-500">
							<span class="rounded-full bg-violet-100 px-2.5 py-1 font-semibold text-violet-700"
								>4 réponses</span
							>
							<span>Pot partagé en cas d'égalité</span>
						</div>
					</div>
				</article>

				<article class="overflow-hidden rounded-3xl border border-sky-200 bg-sky-50">
					<div class="p-7 sm:p-9">
						<div class="flex size-12 items-center justify-center rounded-2xl bg-sky-600 text-white">
							<ChevronRight class="size-6" />
						</div>
						<p class="mt-8 text-sm font-bold tracking-wider text-sky-600 uppercase">
							Face-à-face ou défi ouvert
						</p>
						<h3 class="mt-2 text-3xl font-black tracking-tight">Oui ou non</h3>
						<p class="mt-3 max-w-md leading-relaxed text-slate-600">
							Défie un ami et négociez vos mises, ou lance des termes fixes aux premiers qui oseront
							accepter.
						</p>
					</div>
					<div class="mx-5 mb-5 rounded-2xl border border-sky-200 bg-white p-5 sm:mx-7 sm:mb-7">
						<p class="text-sm font-bold">« Lucas finira-t-il la course en moins de 2 h ? »</p>
						<div class="mt-4 grid grid-cols-2 gap-2 text-center text-xs font-bold">
							<span class="rounded-xl bg-emerald-50 px-3 py-2.5 text-emerald-700">Oui · 10 pts</span
							>
							<span class="rounded-xl bg-rose-50 px-3 py-2.5 text-rose-700">Non · 15 pts</span>
						</div>
					</div>
				</article>
			</div>
		</div>
	</section>

	<section class="border-y border-slate-200 bg-white py-20 sm:py-28" aria-labelledby="regles-title">
		<div
			class="container mx-auto grid max-w-6xl gap-14 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center"
		>
			<div>
				<p class="text-sm font-bold tracking-widest text-emerald-700 uppercase">
					La compétition, sans les embrouilles
				</p>
				<h2 id="regles-title" class="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-5xl">
					L'app garde les règles et les comptes.
				</h2>
				<p class="mt-5 leading-relaxed text-slate-500">
					Tout le monde sait ce qui a été accepté, qui doit voter et ce que le résultat change. Il
					ne reste qu'à se chambrer.
				</p>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div class="rounded-2xl border border-slate-200 p-6">
					<Trophy class="size-6 text-amber-600" />
					<h3 class="mt-5 font-extrabold">Points & classement</h3>
					<p class="mt-2 text-sm leading-relaxed text-slate-500">
						Les gains alimentent l'ardoise et le classement de chaque groupe.
					</p>
				</div>
				<div class="rounded-2xl border border-slate-200 p-6">
					<Gift class="size-6 text-rose-600" />
					<h3 class="mt-5 font-extrabold">Gages mémorables</h3>
					<p class="mt-2 text-sm leading-relaxed text-slate-500">
						Remplace les points par un gage à réaliser si tu perds.
					</p>
				</div>
				<div class="rounded-2xl border border-slate-200 p-6">
					<Gavel class="size-6 text-violet-600" />
					<h3 class="mt-5 font-extrabold">Verdict par le jury</h3>
					<p class="mt-2 text-sm leading-relaxed text-slate-500">
						Des membres choisis à l'avance votent à la majorité ou à l'unanimité.
					</p>
				</div>
				<div class="rounded-2xl border border-slate-200 p-6">
					<LockKeyhole class="size-6 text-sky-600" />
					<h3 class="mt-5 font-extrabold">Entre vous uniquement</h3>
					<p class="mt-2 text-sm leading-relaxed text-slate-500">
						Tu choisis précisément qui voit et rejoint chaque pari.
					</p>
				</div>
			</div>
		</div>
	</section>

	<section class="px-4 py-16 sm:px-6 sm:py-24">
		<div
			class="container relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-amber-300 px-6 py-14 text-center sm:px-12 sm:py-20"
		>
			<div
				class="pointer-events-none absolute -top-28 -left-20 size-72 rounded-full border-[45px] border-white/20"
			></div>
			<div
				class="pointer-events-none absolute -right-20 -bottom-32 size-80 rounded-full border-[55px] border-slate-950/10"
			></div>
			<div class="relative mx-auto max-w-2xl">
				<p class="font-bold tracking-widest text-amber-950/60 uppercase">
					Le prochain pari est à toi
				</p>
				<h2 class="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-5xl">
					Alors, qui avait raison ?
				</h2>
				<p class="mx-auto mt-4 max-w-xl text-lg text-amber-950/70">
					Crée ton groupe en quelques secondes et ne laisse plus aucun « je te l'avais dit » sans
					preuve.
				</p>
				<div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
					{#if data.session}
						<Button href="/app" size="lg" class="h-12 rounded-full bg-slate-950 px-7 text-base"
							>Ouvrir mes groupes <ArrowRight /></Button
						>
					{:else}
						<Button href="/signup" size="lg" class="h-12 rounded-full bg-slate-950 px-7 text-base"
							>Lancer mon premier pari <ArrowRight /></Button
						>
					{/if}
					<PwaInstallButton />
				</div>
			</div>
		</div>
	</section>

	<footer class="border-t border-slate-200 px-4 py-8 text-sm text-slate-500 sm:px-6">
		<div
			class="container mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row"
		>
			<p class="font-bold text-slate-800">🎲 Bet With Friend</p>
			<p>Points virtuels et gages uniquement. Jamais d'argent réel.</p>
		</div>
	</footer>
</div>
