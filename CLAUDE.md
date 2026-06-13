# Bet With Friend

Application web (puis mobile) de paris entre amis : points virtuels + ardoise de
dettes par groupe, **jamais d'argent réel**. Conception complète dans `docs/`.

## Stack

- **SvelteKit 2 + Svelte 5 (runes)** — front ET logique métier (form actions / endpoints serveur)
- **Supabase** — PostgreSQL, Auth (Google + email/password + invité anonyme), Realtime, Storage
- **Drizzle ORM** — schéma dans `src/lib/server/db/schema.ts`, accès DB côté serveur uniquement
- **Tailwind CSS v4 + shadcn-svelte** — UI
- **Playwright** — tests E2E dans `e2e/`
- **Capacitor** — app mobile (fin de backlog, ne pas s'en préoccuper avant S-080)

## Commandes

```bash
npm run dev              # serveur de dev (http://localhost:5173)
npm run check            # svelte-check (typage) — OBLIGATOIRE avant de rendre la main
npm run lint             # prettier + eslint
npm run format           # prettier --write
npm run test:e2e         # suite Playwright complète (= non-régression)
npm run test:e2e -- e2e/S-0XX-*.spec.ts   # tests d'une story
npx playwright-cli       # pilotage interactif d'un navigateur (exploration, debug,
                         # génération de tests) — voir .claude/skills/playwright-cli/SKILL.md
npm run db:reset         # reset + seed de la base Supabase LOCALE
npm run db:push          # pousse le schéma Drizzle (dev rapide)
npm run db:generate      # génère une migration SQL depuis le schéma
npx supabase start|stop|status            # instance Supabase locale (Docker)
```

## Environnements

- **Dev & tests E2E : Supabase local** (Docker). `.env` pointe vers l'instance
  locale (`http://127.0.0.1:54321`). Le projet cloud sert plus tard pour la prod.
- Users de test seedés (`supabase/seed.sql`) : `alice@test.local`,
  `bob@test.local`, `carol@test.local`, `dave@test.local` — mot de passe commun
  `test-password-123`. Alice est admin du groupe seedé « Les potes du test ».

## Architecture

- `src/routes/` — pages + form actions. **Toute écriture DB passe par le
  serveur SvelteKit** (jamais de write supabase-js côté client).
- `src/lib/server/` — logique métier, transactions Drizzle. Code serveur only.
- `src/lib/components/` — composants UI (shadcn-svelte dans `src/lib/components/ui/`).
- supabase-js côté client : auth, realtime, storage **en lecture** seulement.
- RLS Supabase = filet de sécurité, la vérité métier vit dans les actions serveur.
- Validation des inputs avec **Zod** dans les form actions.

## Concepts métier clés

- `bet` = définition d'un pari ; `match` = instance résolvable (un duel accepté
  ou un closest soumis). Voir `docs/10-modele-de-donnees.md`.
- 2 types de paris : `closest` (multi-joueurs, jury désigne les gagnants) et
  `yesno` (duel négocié ou défi ouvert).
- Mise : points (→ ardoise `ledger_entries`) OU gage (`forfeits`), jamais les deux.
- Liste de visibilité d'un pari : **figée à la création, jamais modifiable**.
- Verdict du jury : immédiatement définitif. Votes visibles (non anonymes).
- Toutes les décisions produit sont cochées `DÉCIDÉ` dans `docs/*.md` — les
  respecter, ne pas les re-trancher.

## Usine agentique

- Backlog : `docs/backlog/README.md` (tableau de bord) + une story par fichier
  `docs/backlog/S-0XX-*.md` (statut dans le frontmatter).
- `/story S-0XX` : une story, en place sur `master`, boucle dev → QA → PASS.
- `/story wave` : jusqu'à 3 stories parallélisables en parallèle, chacune dans un
  worktree isolé (`.worktrees/<ID>`, branche `story/<ID>`, stack Supabase + port
  dev dédiés via `scripts/worktree.mjs`), puis merge sérialisé sur `master` avec
  contrôle d'intégration après chaque merge.
- Agents : `.claude/agents/story-dev.md` (implémente), `.claude/agents/story-qa.md`
  (teste, n'écrit que dans `e2e/`), `.claude/agents/integration-qa.md` (vérifie
  l'app intégrée après merge, lecture seule).
- Isolation parallèle : `node scripts/worktree.mjs setup|teardown|list` gère les
  worktrees + stacks Supabase décalées (slots 1-3). `playwright.config.ts` lit le
  port via `PLAYWRIGHT_PORT` (depuis le `.env` du worktree).
- La QA explore l'app avec **playwright-cli** (skill
  `.claude/skills/playwright-cli/`) avant d'écrire ses specs : snapshots,
  locators générés, debug via `npx playwright test --debug=cli` + `playwright-cli attach`.
- Convention : chaque story livre ses specs `e2e/S-0XX-*.spec.ts` ; la suite
  complète constitue la non-régression. **Ne jamais modifier les specs des
  autres stories pour faire passer la sienne** (sauter un test = le signaler).
- Une story n'est `done` que quand la QA rend `VERDICT: PASS` sur SA story ET
  sur la suite complète.

## Conventions de code

- Svelte 5 : runes (`$state`, `$derived`, `$props`), pas de stores legacy.
- Prettier : tabs, single quotes, width 100 (`.prettierrc`) — `npm run format`.
- Commits : `feat(S-0XX): titre` pour les stories, conventionnels sinon.
- Textes UI en **français** (utilisateurs cibles francophones).
