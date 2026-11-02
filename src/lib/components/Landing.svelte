<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import PwaInstallButton from '$lib/components/PwaInstallButton.svelte';
	import { resolveRoute } from '$lib/paths';
	import { ArrowRight, Check, CircleCheck, Clock3, LockKeyhole } from '@lucide/svelte';
	import type { LandingContent } from '$lib/landing/content';

	let { content, session }: { content: LandingContent; session: boolean } = $props();
	const signupHref = $derived(
		content.lang === 'en' ? resolveRoute('/en/signup') : resolveRoute('/signup')
	);
	const loginHref = $derived(
		content.lang === 'en' ? resolveRoute('/en/login') : resolveRoute('/login')
	);
</script>

<div class="bw-landing overflow-hidden">
	<!-- The landing is a Decide/Learn surface: an oversized editorial promise, with the
		actual game shown as a lively, tilted-inset scene rather than a generic feature grid. -->
	<section class="bw-hero" aria-labelledby="hero-title">
		<div class="bw-hero-inner">
			<div class="bw-hero-copy">
				<p class="bw-kicker"><span class="bw-live-dot"></span>{content.hero.badge}</p>
				<h1 id="hero-title">
					{content.hero.headlineLine1}<br />{content.hero.headlineLine2}
					<em>{content.hero.headlineEm}</em>
				</h1>
				<p class="bw-lede">{content.hero.tagline}</p>
				<p class="bw-description">{content.hero.sub}</p>
				{#if session}
					<Button href="/app" size="lg" class="bw-primary"
						>{content.hero.ctaApp}<ArrowRight /></Button
					>
				{:else}
					<div class="bw-actions">
						<Button href={signupHref} size="lg" class="bw-primary"
							>{content.hero.ctaPrimary}<ArrowRight /></Button
						>
						<a class="bw-secondary" href={loginHref}>{content.hero.ctaSecondary}</a>
					</div>
				{/if}
				<div class="bw-assurance">
					{#each content.hero.chips as chip (chip)}<span><Check size={15} />{chip}</span>{/each}
				</div>
				<p class="bw-points-note">{content.hero.pointsNote}</p>
			</div>

			<div class="bw-game-scene" aria-label={content.mockup.groupName}>
				<div class="bw-scene-caption">
					<span>{content.hero.sceneCaption}</span><span>01 / 03</span>
				</div>
				<div class="bw-game-card">
					<header class="bw-game-header">
						<div class="bw-group-mark">⚽</div>
						<div class="bw-group-title">
							<strong>{content.mockup.groupName}</strong><small>{content.mockup.members}</small>
						</div>
						<div class="bw-avatars" aria-hidden="true"><i>L</i><i>M</i><i>A</i><i>+5</i></div>
					</header>
					<div class="bw-game-body">
						<div class="bw-game-meta">
							<span class="bw-open-tag">{content.mockup.status}</span><span
								><Clock3 size={14} />{content.mockup.deadline}</span
							>
						</div>
						<p class="bw-question-type">{content.mockup.format}</p>
						<h2>{content.mockup.question}</h2>
						<div class="bw-game-facts">
							<div class="bw-stake">
								<small>{content.mockup.stakeLabel}</small><strong>{content.mockup.stake}</strong>
							</div>
							<div class="bw-private">
								<small>{content.mockup.answersLabel}</small><strong
									><LockKeyhole size={15} />{content.mockup.answers}</strong
								>
							</div>
						</div>
						<div class="bw-pick">
							<div class="bw-pick-title">
								<strong>{content.mockup.guessTitle}</strong><span>{content.mockup.played}</span>
							</div>
							<div class="bw-input-row">
								<span>{content.mockup.placeholder}</span><b>{content.mockup.join}</b>
							</div>
						</div>
					</div>
				</div>
				<div class="bw-verdict">
					<span><CircleCheck size={20} /></span>
					<div>
						<small>{content.mockup.verdictLabel}</small><strong>{content.mockup.verdict}</strong>
					</div>
					<span class="bw-verdict-points">+120 pts</span>
				</div>
				<div class="bw-scene-stamp">
					{content.hero.sceneStamp1}<br />{content.hero.sceneStamp2}
				</div>
			</div>
		</div>
		<div class="bw-hero-foot">
			<span>{content.hero.footLeft}</span><span>{content.hero.footRight}</span>
		</div>
	</section>

	<section class="bw-how" aria-labelledby="fonctionnement-title">
		<div class="bw-section-wrap">
			<div class="bw-section-heading">
				<p class="bw-kicker">{content.how.eyebrow}</p>
				<h2 id="fonctionnement-title">{content.how.title}</h2>
			</div>
			<div class="bw-steps">
				{#each content.how.steps as step (step.number)}
					<article class="bw-step">
						<span class="bw-step-number">{step.number}</span>
						<div>
							<h3>{step.title}</h3>
							<p>{step.text}</p>
						</div>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<section class="bw-formats" aria-labelledby="formats-title">
		<div class="bw-section-wrap">
			<p class="bw-kicker">{content.formats.eyebrow}</p>
			<h2 id="formats-title">{content.formats.title}</h2>
			<p class="bw-section-intro">{content.formats.intro}</p>
			<div class="bw-format-list">
				<article>
					<span class="bw-format-index">{content.formats.closest.tag}</span>
					<h3>{content.formats.closest.title}</h3>
					<p>{content.formats.closest.text}</p>
					<blockquote>{content.formats.closest.example}</blockquote>
				</article>
				<article>
					<span class="bw-format-index">{content.formats.challenge.tag}</span>
					<h3>{content.formats.challenge.title}</h3>
					<p>{content.formats.challenge.text}</p>
					<blockquote>{content.formats.challenge.example}</blockquote>
				</article>
			</div>
		</div>
	</section>

	<section class="bw-rules" aria-labelledby="regles-title">
		<div class="bw-section-wrap bw-rules-layout">
			<div>
				<p class="bw-kicker">{content.rules.eyebrow}</p>
				<h2 id="regles-title">{content.rules.title}</h2>
				<p class="bw-section-intro">{content.rules.intro}</p>
				<span class="bw-rule-seal">{content.rules.seal1}<br />{content.rules.seal2}</span>
			</div>
			<div class="bw-rule-list">
				{#each content.rules.items as item, i (item.title)}<article>
						<span>0{i + 1}</span>
						<div>
							<h3>{item.title}</h3>
							<p>{item.text}</p>
						</div>
					</article>{/each}
			</div>
		</div>
	</section>

	<section class="bw-faq" aria-labelledby="faq-title">
		<div class="bw-section-wrap bw-faq-layout">
			<h2 id="faq-title">{content.faq.title}</h2>
			<div class="bw-faq-list">
				{#each content.faq.items as item (item.q)}<details>
						<summary>{item.q}<span>+</span></summary>
						<p>{item.a}</p>
					</details>{/each}
			</div>
		</div>
	</section>

	<section class="bw-closer">
		<div class="bw-closer-inner">
			<div>
				<p class="bw-kicker">{content.cta.eyebrow}</p>
				<h2>{content.cta.title}</h2>
				<p>{content.cta.text}</p>
			</div>
			<div class="bw-closer-actions">
				{#if session}<Button href="/app" size="lg" class="bw-primary"
						>{content.hero.ctaApp}<ArrowRight /></Button
					>{:else}<Button href={signupHref} size="lg" class="bw-primary"
						>{content.hero.ctaPrimary}<ArrowRight /></Button
					>{/if}<PwaInstallButton />
			</div>
		</div>
	</section>
	<footer class="bw-footer">
		<div><strong>BET WITH FRIENDS</strong><span>{content.footer.claim}</span></div>
		<p>{content.footer.note}</p>
		<a href={content.lang === 'fr' ? '/en' : '/'} data-testid="lang-switch"
			>{content.langSwitchLabel} ↗</a
		>
	</footer>
</div>

<style>
	.bw-landing {
		--ink: #17201d;
		--paper: #f7f7f2;
		--line: #d8dcd4;
		--muted: #66716c;
		--lime: #d6f36a;
		background: var(--paper);
		color: var(--ink);
		font-family: Arial, Helvetica, sans-serif;
	}
	.bw-hero {
		background: #f0f1e9;
		position: relative;
		border-bottom: 1px solid var(--line);
	}
	.bw-hero-inner {
		max-width: 1280px;
		margin: auto;
		padding: 82px 44px 74px;
		min-height: 635px;
		display: grid;
		grid-template-columns: 0.86fr 1.14fr;
		gap: 42px;
		align-items: center;
	}
	.bw-hero-copy {
		position: relative;
		z-index: 2;
		padding: 20px 0;
	}
	.bw-kicker {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #69736b;
		margin: 0 0 23px;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.bw-live-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #79a92b;
		box-shadow: 0 0 0 4px #79a92b1c;
	}
	.bw-hero h1 {
		font-size: clamp(64px, 7.4vw, 108px);
		letter-spacing: -0.085em;
		line-height: 0.87;
		margin: 0 0 29px;
		font-weight: 750;
	}
	.bw-hero h1 em {
		font-family: Georgia, serif;
		font-weight: 400;
		letter-spacing: -0.09em;
		color: #648c20;
	}
	.bw-lede {
		font-size: 22px;
		line-height: 1.35;
		letter-spacing: -0.035em;
		max-width: 450px;
		margin: 0 0 12px;
		font-weight: 600;
	}
	.bw-description {
		font-size: 15px;
		line-height: 1.65;
		color: var(--muted);
		max-width: 425px;
		margin: 0 0 28px;
	}
	.bw-actions {
		display: flex;
		align-items: center;
		gap: 22px;
		flex-wrap: wrap;
	}
	:global(.bw-primary) {
		background: var(--ink) !important;
		color: white !important;
		border-radius: 999px !important;
		height: 50px !important;
		padding: 0 22px !important;
		font-weight: 700;
	}
	.bw-secondary {
		color: var(--ink);
		font-size: 14px;
		font-weight: 700;
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.bw-assurance {
		display: flex;
		gap: 15px;
		flex-wrap: wrap;
		margin-top: 24px;
	}
	.bw-assurance span {
		display: flex;
		align-items: center;
		gap: 6px;
		color: #56615a;
		font-size: 12px;
	}
	.bw-points-note {
		font-size: 11px;
		color: #788078;
		margin-top: 16px;
	}
	.bw-game-scene {
		position: relative;
		padding: 0 16px 22px 0;
		max-width: 680px;
		width: 100%;
		margin: 0 auto;
		transform: rotate(1.2deg);
	}
	.bw-game-scene:before {
		content: '';
		position: absolute;
		inset: 32px 0 0 35px;
		background: var(--lime);
		transform: rotate(-4deg);
	}
	.bw-scene-caption {
		display: flex;
		justify-content: space-between;
		margin: 0 4px 12px;
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.14em;
		color: #727a70;
	}
	.bw-game-card {
		position: relative;
		background: white;
		border: 1px solid #d9ddd6;
		box-shadow: 0 18px 50px #303a3018;
	}
	.bw-game-header {
		height: 66px;
		padding: 0 22px;
		border-bottom: 1px solid #eceee9;
		display: flex;
		align-items: center;
		gap: 11px;
	}
	.bw-group-mark {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		background: #eef1e5;
		border-radius: 50%;
		font-size: 17px;
	}
	.bw-group-title {
		display: grid;
		gap: 4px;
		font-size: 12px;
	}
	.bw-group-title small {
		font-size: 10px;
		color: #92988f;
	}
	.bw-avatars {
		display: flex;
		margin-left: auto;
	}
	.bw-avatars i {
		font-style: normal;
		width: 25px;
		height: 25px;
		margin-left: -5px;
		border: 2px solid white;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 8px;
		font-weight: 800;
		background: #e7c9a9;
	}
	.bw-avatars i:nth-child(2) {
		background: #e5bfc1;
	}
	.bw-avatars i:nth-child(3) {
		background: #d4dfb4;
	}
	.bw-avatars i:nth-child(4) {
		background: #edf0e8;
		color: #67716a;
	}
	.bw-game-body {
		padding: 24px 28px 27px;
	}
	.bw-game-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 10px;
		color: #737d75;
	}
	.bw-game-meta > span:last-child {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.bw-open-tag {
		background: #eaf4d9;
		color: #4c761e;
		padding: 6px 9px;
		font-weight: 700;
	}
	.bw-question-type {
		margin: 23px 0 8px;
		font-size: 9px;
		font-weight: 800;
		color: #919890;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.bw-game-body h2 {
		font-family: Georgia, serif;
		font-size: clamp(23px, 3vw, 36px);
		line-height: 1.1;
		letter-spacing: -0.045em;
		margin: 0;
		max-width: 480px;
	}
	.bw-game-facts {
		display: flex;
		gap: 11px;
		margin-top: 23px;
	}
	.bw-game-facts > div {
		flex: 1;
		padding: 12px 14px;
		display: grid;
		gap: 7px;
		background: #f5f6f0;
	}
	.bw-game-facts small,
	.bw-verdict small {
		font-size: 9px;
		color: #81897f;
	}
	.bw-game-facts strong {
		font-size: 13px;
	}
	.bw-stake {
		background: #edf3dd !important;
	}
	.bw-stake strong {
		color: #486a1f;
	}
	.bw-private strong {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.bw-pick {
		margin-top: 13px;
		padding: 13px 14px;
		border: 1px solid #e5e8e1;
	}
	.bw-pick-title,
	.bw-input-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.bw-pick-title strong {
		font-size: 11px;
	}
	.bw-pick-title span {
		font-size: 9px;
		color: #92988f;
	}
	.bw-input-row {
		margin-top: 10px;
		background: #f4f5f1;
		color: #9aa097;
		font-size: 10px;
		padding: 6px 6px 6px 11px;
	}
	.bw-input-row b {
		padding: 9px 14px;
		background: #17201d;
		color: white;
		font-size: 10px;
	}
	.bw-verdict {
		position: relative;
		margin: 12px 0 0 34px;
		background: white;
		border: 1px solid #d9ddd6;
		padding: 11px 14px;
		display: flex;
		align-items: center;
		gap: 10px;
		box-shadow: 0 5px 15px #303a3010;
	}
	.bw-verdict > span:first-child {
		color: #719b34;
	}
	.bw-verdict div {
		display: grid;
		gap: 3px;
	}
	.bw-verdict div strong {
		font-size: 11px;
	}
	.bw-verdict-points {
		margin-left: auto;
		font-size: 11px;
		font-weight: 800;
		color: #598222;
	}
	.bw-scene-stamp {
		position: absolute;
		right: -3px;
		bottom: -15px;
		background: var(--ink);
		color: var(--lime);
		font-size: 8px;
		line-height: 1.45;
		font-weight: 800;
		letter-spacing: 0.1em;
		padding: 12px 15px;
		transform: rotate(-5deg);
	}
	.bw-hero-foot {
		height: 42px;
		border-top: 1px solid #dfe2da;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 max(calc((100% - 1190px) / 2), 28px);
		font-size: 9px;
		letter-spacing: 0.11em;
		font-weight: 800;
		color: #82897f;
	}
	.bw-section-wrap {
		max-width: 1160px;
		margin: auto;
		padding: 106px 38px;
	}
	.bw-how {
		background: #19221e;
		color: #f5f6f0;
	}
	.bw-how .bw-kicker {
		color: #c4d78c;
	}
	.bw-section-heading {
		display: grid;
		grid-template-columns: 0.75fr 1.25fr;
		align-items: start;
		gap: 30px;
	}
	.bw-section-heading h2,
	.bw-formats h2,
	.bw-rules h2,
	.bw-faq h2 {
		font-family: Georgia, serif;
		font-weight: 400;
		font-size: clamp(38px, 5vw, 64px);
		line-height: 0.98;
		letter-spacing: -0.055em;
		margin: 0;
		max-width: 650px;
	}
	.bw-steps {
		margin-top: 76px;
		border-top: 1px solid #ffffff34;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
	}
	.bw-step {
		padding: 23px 26px 8px 0;
		display: grid;
		grid-template-columns: 42px 1fr;
		gap: 12px;
		border-right: 1px solid #ffffff2b;
	}
	.bw-step + .bw-step {
		padding-left: 25px;
	}
	.bw-step:last-child {
		border: 0;
	}
	.bw-step-number {
		font-size: 11px;
		color: #bacf7e;
		font-weight: 700;
		padding-top: 4px;
	}
	.bw-step h3 {
		font-size: 20px;
		letter-spacing: -0.03em;
		margin: 0 0 9px;
	}
	.bw-step p {
		font-size: 13px;
		line-height: 1.7;
		color: #b2b9b1;
		margin: 0;
		max-width: 260px;
	}
	.bw-formats {
		background: #f7f7f2;
	}
	.bw-formats > .bw-section-wrap > .bw-kicker {
		margin-bottom: 20px;
	}
	.bw-section-intro {
		max-width: 560px;
		color: var(--muted);
		font-size: 15px;
		line-height: 1.7;
	}
	.bw-format-list {
		margin-top: 46px;
		border-top: 1px solid var(--line);
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	.bw-format-list article {
		padding: 28px 40px 10px 0;
	}
	.bw-format-list article + article {
		border-left: 1px solid var(--line);
		padding-left: 40px;
		padding-right: 0;
	}
	.bw-format-index {
		font-size: 9px;
		letter-spacing: 0.12em;
		font-weight: 800;
		color: #718d43;
	}
	.bw-format-list h3 {
		font:
			36px Georgia,
			serif;
		letter-spacing: -0.04em;
		margin: 15px 0 10px;
	}
	.bw-format-list p {
		font-size: 14px;
		line-height: 1.65;
		color: var(--muted);
		max-width: 440px;
	}
	.bw-format-list blockquote {
		font:
			italic 17px Georgia,
			serif;
		margin: 23px 0 0;
		padding: 14px 0;
		border-top: 1px solid var(--line);
		color: #39433c;
	}
	.bw-rules {
		background: #e9ecdf;
	}
	.bw-rules-layout {
		display: grid;
		grid-template-columns: 0.85fr 1.15fr;
		gap: 100px;
	}
	.bw-rule-seal {
		display: inline-block;
		margin-top: 34px;
		border: 1px solid #99a58a;
		border-radius: 50%;
		width: 112px;
		height: 112px;
		display: grid;
		place-content: center;
		text-align: center;
		font-size: 9px;
		line-height: 1.5;
		font-weight: 800;
		letter-spacing: 0.08em;
		transform: rotate(-9deg);
		color: #58732e;
	}
	.bw-rule-list {
		border-top: 1px solid #bec5b7;
	}
	.bw-rule-list article {
		display: grid;
		grid-template-columns: 45px 1fr;
		gap: 12px;
		padding: 20px 0;
		border-bottom: 1px solid #bec5b7;
	}
	.bw-rule-list article > span {
		font-size: 10px;
		color: #72805f;
		font-weight: 800;
		padding-top: 3px;
	}
	.bw-rule-list h3 {
		font-size: 15px;
		margin: 0 0 6px;
	}
	.bw-rule-list p {
		font-size: 13px;
		line-height: 1.6;
		color: #626d61;
		margin: 0;
	}
	.bw-faq {
		background: #f7f7f2;
	}
	.bw-faq-layout {
		display: grid;
		grid-template-columns: 0.75fr 1.25fr;
		gap: 80px;
	}
	.bw-faq h2 {
		font-size: 48px;
	}
	.bw-faq-list {
		border-top: 1px solid var(--line);
	}
	.bw-faq details {
		border-bottom: 1px solid var(--line);
		padding: 19px 0;
	}
	.bw-faq summary {
		cursor: pointer;
		list-style: none;
		display: flex;
		justify-content: space-between;
		gap: 18px;
		font-weight: 700;
		font-size: 14px;
	}
	.bw-faq summary::-webkit-details-marker {
		display: none;
	}
	.bw-faq summary span {
		font-size: 20px;
		font-weight: 400;
		transition: transform 0.2s;
	}
	.bw-faq details[open] summary span {
		transform: rotate(45deg);
	}
	.bw-faq details p {
		font-size: 13px;
		line-height: 1.7;
		color: var(--muted);
		max-width: 600px;
		margin: 12px 28px 0 0;
	}
	.bw-closer {
		background: var(--lime);
		padding: 54px 38px;
	}
	.bw-closer-inner {
		max-width: 1084px;
		margin: auto;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 35px;
	}
	.bw-closer .bw-kicker {
		color: #586644;
		margin-bottom: 12px;
	}
	.bw-closer h2 {
		font:
			clamp(36px, 5vw, 58px)/0.98 Georgia,
			serif;
		letter-spacing: -0.06em;
		margin: 0;
		max-width: 680px;
	}
	.bw-closer-inner > div:first-child > p:last-child {
		font-size: 14px;
		color: #4d5941;
		margin: 13px 0 0;
	}
	.bw-closer-actions {
		display: grid;
		justify-items: start;
		gap: 10px;
		flex: none;
	}
	.bw-footer {
		max-width: 1160px;
		margin: auto;
		padding: 28px 38px;
		display: flex;
		align-items: center;
		gap: 24px;
		font-size: 10px;
		color: #747e75;
	}
	.bw-footer > div {
		display: grid;
		gap: 4px;
	}
	.bw-footer > div strong {
		font-size: 11px;
		letter-spacing: 0.1em;
		color: var(--ink);
	}
	.bw-footer > p {
		margin: 0 auto;
	}
	.bw-footer a {
		color: var(--ink);
		font-weight: 700;
		text-decoration: underline;
		text-underline-offset: 4px;
		white-space: nowrap;
	}
	@media (max-width: 900px) {
		.bw-hero-inner {
			padding: 60px 28px;
			grid-template-columns: 0.9fr 1.1fr;
			gap: 15px;
		}
		.bw-hero h1 {
			font-size: clamp(56px, 8vw, 78px);
		}
		.bw-game-body {
			padding: 20px;
		}
		.bw-rules-layout {
			gap: 45px;
		}
		.bw-section-wrap {
			padding: 82px 28px;
		}
	}
	@media (max-width: 680px) {
		.bw-hero-inner {
			display: flex;
			flex-direction: column;
			align-items: stretch;
			padding: 45px 21px 37px;
			gap: 40px;
		}
		.bw-hero-copy {
			padding: 0;
		}
		.bw-hero h1 {
			font-size: 76px;
		}
		.bw-lede {
			font-size: 19px;
		}
		.bw-game-scene {
			max-width: 500px;
			padding-right: 9px;
		}
		.bw-game-body {
			padding: 18px 16px 19px;
		}
		.bw-game-header {
			padding: 0 15px;
		}
		.bw-game-body h2 {
			font-size: 25px;
		}
		.bw-scene-stamp {
			right: -5px;
		}
		.bw-hero-foot {
			padding: 0 20px;
			font-size: 8px;
			gap: 15px;
		}
		.bw-section-wrap {
			padding: 72px 22px;
		}
		.bw-section-heading {
			display: block;
		}
		.bw-section-heading .bw-kicker {
			margin-bottom: 20px;
		}
		.bw-section-heading h2,
		.bw-formats h2,
		.bw-rules h2 {
			font-size: 46px;
		}
		.bw-steps {
			margin-top: 42px;
			display: block;
		}
		.bw-step,
		.bw-step + .bw-step {
			padding: 18px 0;
			border-right: 0;
			border-bottom: 1px solid #ffffff2b;
		}
		.bw-step:last-child {
			border-bottom: 0;
		}
		.bw-step p {
			max-width: none;
		}
		.bw-format-list {
			display: block;
			margin-top: 32px;
		}
		.bw-format-list article,
		.bw-format-list article + article {
			padding: 23px 0;
			border-left: 0;
			border-bottom: 1px solid var(--line);
		}
		.bw-format-list article + article {
			border-top: 0;
		}
		.bw-rules-layout,
		.bw-faq-layout {
			grid-template-columns: 1fr;
			gap: 40px;
		}
		.bw-rule-seal {
			width: 90px;
			height: 90px;
			margin-top: 20px;
		}
		.bw-faq h2 {
			font-size: 43px;
		}
		.bw-closer {
			padding: 42px 22px;
		}
		.bw-closer-inner {
			align-items: flex-start;
			flex-direction: column;
		}
		.bw-footer {
			padding: 25px 22px;
			align-items: flex-start;
			flex-wrap: wrap;
			gap: 12px;
		}
		.bw-footer > p {
			margin: 0;
			order: 3;
			width: 100%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bw-landing * {
			scroll-behavior: auto !important;
			transition: none !important;
		}
	}
</style>
