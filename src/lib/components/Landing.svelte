<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import PwaInstallButton from '$lib/components/PwaInstallButton.svelte';
	import { resolveRoute } from '$app/paths';
	import { ArrowRight, Check, CircleCheck, Clock3, LockKeyhole } from '@lucide/svelte';
	import type { LandingContent } from '$lib/landing/content';

	let { content, session }: { content: LandingContent; session: boolean } = $props();
</script>

<div class="overflow-hidden bg-[#fbfaf7] text-slate-900">
	<!-- Hero -->
	<section class="border-b border-slate-200">
		<div
			class="container mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[0.95fr_1.05fr]"
		>
			<div class="max-w-xl">
				<p class="text-sm font-medium text-slate-500">{content.hero.badge}</p>

				<h1 class="mt-4 font-serif text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">
					Bet With Friends
				</h1>

				<p class="mt-5 text-xl leading-relaxed text-slate-700 sm:text-2xl">
					{content.hero.tagline}
				</p>
				<p class="mt-3 max-w-lg leading-relaxed text-slate-500">
					{content.hero.sub}
				</p>

				{#if session}
					<div class="mt-8">
						<Button href="/app" size="lg" class="h-12 rounded-full bg-slate-950 px-6 text-base">
							{content.hero.ctaApp}
							<ArrowRight />
						</Button>
					</div>
				{:else}
					<div class="mt-8 flex flex-col gap-3 sm:flex-row">
						<Button href="/signup" size="lg" class="h-12 rounded-full bg-slate-950 px-6 text-base">
							{content.hero.ctaPrimary}
							<ArrowRight />
						</Button>
						<Button
							href="/login"
							variant="outline"
							size="lg"
							class="h-12 rounded-full border-slate-300 bg-white px-6 text-base"
						>
							{content.hero.ctaSecondary}
						</Button>
					</div>
				{/if}

				<div class="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
					{#each content.hero.chips as chip (chip)}
						<span class="flex items-center gap-1.5"
							><Check class="size-4 text-emerald-600" /> {chip}</span
						>
					{/each}
				</div>
			</div>

			<!-- Aperçu de l'app -->
			<div class="mx-auto w-full max-w-xl lg:mx-0">
				<div
					class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-30px_rgba(15,23,42,0.25)]"
				>
					<div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
						<div class="flex items-center gap-3">
							<div
								class="flex size-9 items-center justify-center rounded-xl bg-slate-950 text-lg"
								aria-hidden="true"
							>
								⚽
							</div>
							<div>
								<p class="text-sm font-bold">{content.mockup.groupName}</p>
								<p class="text-xs text-slate-400">{content.mockup.members}</p>
							</div>
						</div>
						<div class="flex -space-x-2" aria-hidden="true">
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
								>{content.mockup.status}</span
							>
							<span class="flex items-center gap-1.5 text-xs text-slate-400"
								><Clock3 class="size-3.5" /> {content.mockup.deadline}</span
							>
						</div>
						<p class="text-xs font-bold text-slate-400">{content.mockup.format}</p>
						<h2 class="mt-2 font-serif text-2xl leading-tight sm:text-3xl">
							{content.mockup.question}
						</h2>

						<div class="mt-6 grid grid-cols-2 gap-3">
							<div class="rounded-xl bg-amber-50 p-4">
								<p class="text-xs font-semibold text-amber-800/60">{content.mockup.stakeLabel}</p>
								<p class="mt-1 text-xl font-black text-amber-950">{content.mockup.stake}</p>
							</div>
							<div class="rounded-xl bg-slate-50 p-4">
								<p class="text-xs font-semibold text-slate-400">{content.mockup.answersLabel}</p>
								<p class="mt-1 flex items-center gap-2 text-sm font-bold">
									<LockKeyhole class="size-4" />
									{content.mockup.answers}
								</p>
							</div>
						</div>

						<div class="mt-5 rounded-xl border border-slate-200 p-4">
							<div class="flex items-center justify-between">
								<p class="text-sm font-bold">{content.mockup.guessTitle}</p>
								<span class="text-xs text-slate-400">{content.mockup.played}</span>
							</div>
							<div class="mt-3 flex gap-2">
								<div
									class="flex h-11 flex-1 items-center rounded-xl bg-slate-100 px-4 text-sm text-slate-400"
								>
									{content.mockup.placeholder}
								</div>
								<div
									class="flex h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white"
								>
									{content.mockup.join}
								</div>
							</div>
						</div>
					</div>
				</div>

				<div
					class="mt-3 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white p-3 pr-5"
				>
					<div
						class="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"
					>
						<CircleCheck class="size-5" />
					</div>
					<div>
						<p class="text-xs text-slate-400">{content.mockup.verdictLabel}</p>
						<p class="text-sm font-extrabold">{content.mockup.verdict}</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Fonctionnement -->
	<section class="bg-slate-950 py-16 text-white sm:py-24" aria-labelledby="fonctionnement-title">
		<div class="container mx-auto max-w-6xl px-4 sm:px-6">
			<p class="text-sm font-medium text-amber-300">{content.how.eyebrow}</p>
			<h2 id="fonctionnement-title" class="mt-3 max-w-2xl font-serif text-4xl sm:text-5xl">
				{content.how.title}
			</h2>

			<div class="mt-12 grid gap-8 md:grid-cols-3">
				{#each content.how.steps as step (step.number)}
					<div>
						<div class="flex items-center gap-3">
							<span class="font-mono text-sm text-white/40">{step.number}</span>
							<div
								class="flex size-10 items-center justify-center rounded-xl bg-white/10 text-amber-300"
							>
								<step.icon class="size-5" />
							</div>
						</div>
						<h3 class="mt-5 text-xl font-bold">{step.title}</h3>
						<p class="mt-2 leading-relaxed text-slate-400">{step.text}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- Formats -->
	<section class="py-16 sm:py-24" aria-labelledby="formats-title">
		<div class="container mx-auto max-w-6xl px-4 sm:px-6">
			<p class="text-sm font-medium text-slate-500">{content.formats.eyebrow}</p>
			<h2 id="formats-title" class="mt-3 max-w-2xl font-serif text-4xl sm:text-5xl">
				{content.formats.title}
			</h2>
			<p class="mt-4 max-w-xl leading-relaxed text-slate-500">{content.formats.intro}</p>

			<div class="mt-10 grid gap-6 lg:grid-cols-2">
				<article class="rounded-2xl border border-slate-200 bg-white p-7 sm:p-9">
					<p class="text-sm font-bold text-slate-400">{content.formats.closest.tag}</p>
					<h3 class="mt-2 font-serif text-3xl">{content.formats.closest.title}</h3>
					<p class="mt-3 leading-relaxed text-slate-600">{content.formats.closest.text}</p>
					<p class="mt-5 rounded-xl bg-slate-50 p-4 text-sm font-medium text-slate-700">
						{content.formats.closest.example}
					</p>
				</article>

				<article class="rounded-2xl border border-slate-200 bg-white p-7 sm:p-9">
					<p class="text-sm font-bold text-slate-400">{content.formats.challenge.tag}</p>
					<h3 class="mt-2 font-serif text-3xl">{content.formats.challenge.title}</h3>
					<p class="mt-3 leading-relaxed text-slate-600">{content.formats.challenge.text}</p>
					<p class="mt-5 rounded-xl bg-slate-50 p-4 text-sm font-medium text-slate-700">
						{content.formats.challenge.example}
					</p>
				</article>
			</div>
		</div>
	</section>

	<!-- Règles -->
	<section class="border-y border-slate-200 bg-white py-16 sm:py-24" aria-labelledby="regles-title">
		<div class="container mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
			<div>
				<p class="text-sm font-medium text-slate-500">{content.rules.eyebrow}</p>
				<h2 id="regles-title" class="mt-3 font-serif text-4xl sm:text-5xl">
					{content.rules.title}
				</h2>
				<p class="mt-5 leading-relaxed text-slate-500">{content.rules.intro}</p>
			</div>
			<div class="grid gap-4 sm:grid-cols-2">
				{#each content.rules.items as item (item.title)}
					<div class="rounded-2xl border border-slate-200 p-6">
						<h3 class="font-extrabold">{item.title}</h3>
						<p class="mt-2 text-sm leading-relaxed text-slate-500">{item.text}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- FAQ -->
	<section class="py-16 sm:py-20" aria-labelledby="faq-title">
		<div class="container mx-auto max-w-3xl px-4 sm:px-6">
			<h2 id="faq-title" class="font-serif text-3xl sm:text-4xl">{content.faq.title}</h2>
			<div class="mt-8 divide-y divide-slate-200">
				{#each content.faq.items as item (item.q)}
					<details class="group py-4">
						<summary
							class="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-semibold text-slate-800"
						>
							{item.q}
							<span
								class="text-slate-400 transition-transform group-open:rotate-45"
								aria-hidden="true">+</span
							>
						</summary>
						<p class="mt-3 leading-relaxed text-slate-500">{item.a}</p>
					</details>
				{/each}
			</div>
		</div>
	</section>

	<!-- Appel à l'action -->
	<section class="px-4 pb-16 sm:px-6 sm:pb-24">
		<div
			class="container mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center sm:px-12"
		>
			<p class="text-sm font-medium text-slate-500">{content.cta.eyebrow}</p>
			<h2 class="mt-3 font-serif text-4xl sm:text-5xl">{content.cta.title}</h2>
			<p class="mx-auto mt-4 max-w-xl text-lg text-slate-600">{content.cta.text}</p>
			<div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
				{#if session}
					<Button href="/app" size="lg" class="h-12 rounded-full bg-slate-950 px-7 text-base"
						>{content.hero.ctaApp} <ArrowRight /></Button
					>
				{:else}
					<Button href="/signup" size="lg" class="h-12 rounded-full bg-slate-950 px-7 text-base"
						>{content.hero.ctaPrimary} <ArrowRight /></Button
					>
				{/if}
				<PwaInstallButton />
			</div>
		</div>
	</section>

	<footer class="border-t border-slate-200 px-4 py-8 text-sm text-slate-500 sm:px-6">
		<div
			class="container mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row"
		>
			<p class="font-bold text-slate-800">{content.footer.claim}</p>
			<div class="flex items-center gap-4">
				<p>{content.footer.note}</p>
				<a
					href={content.lang === 'fr' ? resolveRoute('/en') : resolveRoute('/')}
					class="rounded-full border border-slate-300 px-3 py-1 font-medium text-slate-600 transition-colors hover:bg-slate-100"
					data-testid="lang-switch">{content.langSwitchLabel}</a
				>
			</div>
		</div>
	</footer>
</div>
