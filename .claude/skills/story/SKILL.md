---
name: story
description: Orchestre l'implémentation des stories du backlog. Deux modes - /story S-0XX (une story, en place) et /story wave (jusqu'à 3 stories parallélisables en parallèle, worktrees isolés, tracking PostHog, merge + intégration).
---

# /story — orchestrateur de l'usine agentique

Tu es l'**orchestrateur**. Tu ne codes/testes pas toi-même : tu lances et
coordonnes des sous-agents (`story-dev`, `story-qa`, `story-tracker`,
`integration-qa`) jusqu'à ce que les stories soient `done` et intégrées sur
`master`.

**Contrainte clé** : un sous-agent ne peut pas en lancer d'autres. C'est toi
(session principale) qui lances tous les agents, conserves leurs IDs, et les
relances par SendMessage (contexte conservé). Tu peux paralléliser avec
`run_in_background: true`.

**Pipeline d'une story** : dev → QA (boucle jusqu'à PASS) → **commit feature** →
**tracker PostHog** → (commit tracking) → merge → contrôle d'intégration.

## Choix du mode

- `/story S-0XX` → **mode story unique** : cette seule story, en place sur
  `master`. Voir §A.
- `/story wave` (ou `/story` sans argument) → **mode vague parallèle** : jusqu'à
  3 stories parallélisables, une par worktree isolé, en parallèle, puis merge
  sérialisé + intégration. Voir §B.

---

# §A — Mode story unique (`/story S-0XX`)

### A0. Pré-vol

1. Lis `docs/backlog/<ID>-*.md`. Introuvable → stop, liste les IDs valides.
2. Frontmatter : `done` → stop. `depends_on` non toutes `done` → stop, indique
   les manquantes.
3. Environnement (dépôt principal, stack par défaut) :
   ```bash
   npx supabase status        # sinon npx supabase start
   npm run db:reset
   ```
4. Story → `in-progress` (frontmatter + `docs/backlog/README.md`).

### A1. Dev → A2. QA → A3. Boucle

Cœur de boucle commun en §C, dans le dépôt principal (pas de worktree).

### A4. Commit feature + tracker

1. QA PASS → commit de la feature validée :
   `git add -A && git commit -m "feat(<ID>): <titre>"`.
2. **Tracker** : §D (mode story). PASS → tracking committé. DEFERRED → ajouts
   annulés, suivi noté.

### A5. Clôture

1. Story → `done` (frontmatter + README). `npm run format`, `npm run check`.
2. Commit final si nécessaire (format/tracking).
3. Résumé : livré, itérations dev↔QA, tests, events ajoutés, prochaine story jouable.

---

# §B — Mode vague parallèle (`/story wave`)

### B0. Planifier la vague

1. Lis le backlog (README + frontmatter).
2. **Stories jouables** = `todo` dont toutes les `depends_on` sont `done`.
3. Sélectionne jusqu'à **3** stories **mutuellement parallélisables** : aucune ne
   dépend d'une autre de la sélection ; zones de code **disjointes** (lis « Notes
   techniques » : routes, tables, composants). Recouvrement net → n'en prends
   qu'une, garde l'autre. Dans le doute, conservateur.
4. Affecte un **slot** (1, 2, 3) à chacune. Annonce la composition avant de lancer.
5. Une seule story jouable → bascule en mode story unique (§A).

### B0.5. Bootstrap analytics (une seule fois, sur master, AVANT les worktrees)

Si l'infra PostHog n'existe pas encore (`src/lib/server/analytics.ts` absent) :
lance `story-tracker` en **mode bootstrap** sur le dépôt principal, attends son
PASS, commit `chore: bootstrap analytics PostHog`. Indispensable de le faire ici :
les worktrees découpés ensuite hériteront de l'infra (sinon 3 trackers la
créeraient en parallèle → conflits de merge garantis).

### B1. Monter les worktrees isolés

Pour chaque story, en parallèle (commandes longues → arrière-plan) :
```bash
node scripts/worktree.mjs setup <ID> <slot>
```
Crée `.worktrees/<ID>` sur `story/<ID>`, décale ports Supabase + dev, écrit le
`.env`, installe les deps, démarre la stack dédiée. Note pour chaque story :
chemin du worktree, port dev, project_id. Passe chaque story à `in-progress`.

### B2. Pipelines en parallèle (dev → QA → commit → tracker)

Pour chaque story, dans **son** worktree (agents `run_in_background: true`),
en parallèle des autres :

1. Cœur de boucle dev↔QA (§C) jusqu'à PASS. **Chaque agent travaille dans
   `.worktrees/<ID>`** sur le port dev du slot — précise-le dans son prompt :
   > Tu travailles dans le worktree `.worktrees/<ID>` (et nulle part ailleurs).
   > Place-t'y avant toute commande. Serveur dev sur http://localhost:<devPort>.
   > Stack Supabase isolée (project_id <projectId>).
2. QA PASS → **commit feature** sur la branche (depuis le worktree) :
   `git add -A && git commit -m "feat(<ID>): <titre>"`.
3. **Tracker** (§D, mode story) dans le worktree.
   - PASS → il a committé le tracking.
   - DEFERRED → ajouts annulés, branche au state QA-validé, suivi noté.

Gère les 3 pipelines indépendamment : avance chaque story dès que son agent rend
la main, sans attendre les autres. Une story est « prête au merge » après B2.3.

### B3. File de merge (sérialisée)

Dès qu'une story est prête, ajoute-la à la file. Traite les merges **un par un**
(jamais en parallèle), dans l'ordre des IDs, depuis le dépôt principal sur
`master` à jour :
```bash
git merge --no-ff story/<ID> -m "feat(<ID>): <titre>"
```
- **Conflit** : trivial → résous + `git commit`. Non trivial → relance l'agent
  `story-dev` de la story (SendMessage) pour qu'il résolve sur sa branche, ou
  demande à l'utilisateur si l'arbitrage est métier. Ne devine jamais.
- Marque la story `done` (frontmatter + README) **après** merge réussi.

### B4. Contrôle d'intégration (après CHAQUE merge)

Lance `integration-qa` (`subagent_type: integration-qa`) sur le dépôt principal :
> Merge de <ID> sur master fait. Vérifie l'app intégrée : npm ci, db:reset,
> check, lint, suite E2E COMPLÈTE. Rends ton INTEGRATION RAPPORT.

- `PASS` → merge suivant.
- `FAIL` → **fix-forward** (relance `story-dev` sur master si cause locale claire,
  puis re-intégration) ou **revert** (`git revert --no-edit <commit_merge>`,
  story → `testing`, signale), puis re-intégration. Jamais le merge suivant tant
  que ce n'est pas au vert.

### B5. Teardown

Story mergée **et** intégration verte → démonte son worktree :
```bash
node scripts/worktree.mjs teardown <ID> --delete-branch
```
Échec persistant (boucle §C épuisée, conflit/tracking non résolu) → **garde** le
worktree pour debug, ne merge pas, signale.

### B6. Clôture de vague

1. `npm run format` sur master, `npm run check`, commit si besoin.
2. `node scripts/worktree.mjs list` → aucun worktree orphelin.
3. Résumé : stories livrées/mergées, events ajoutés (ou différés), échecs (avec
   worktree conservé), intégration, prochaine vague.
4. **Une vague par invocation** par défaut ; propose `/story wave` à nouveau s'il
   reste des stories. (Si l'utilisateur a demandé d'enchaîner → reboucle en B0.)

---

# §C — Cœur de boucle dev ↔ QA (commun)

> En mode vague, préfixe chaque prompt d'agent par la consigne worktree (§B2.1)
> et conserve séparément l'ID des agents dev / QA de **chaque** story.

### Dev

`story-dev` (`subagent_type: story-dev`) :
> Implémente la story <ID>. Fichier : docs/backlog/<ID>-*.md. Lis CLAUDE.md et
> les docs liées. Rends ton `DEV RAPPORT` quand `npm run check` et `npm run lint`
> passent.

Conserve l'ID de l'agent (corrections via SendMessage au **même** agent).

### QA

Story → `testing`. `story-qa` (`subagent_type: story-qa`) :
> Valide la story <ID>. Fichier : docs/backlog/<ID>-*.md. Rapport du dev
> ci-dessous. Explore avec playwright-cli, écris e2e/<ID>-*.spec.ts, lance tes
> tests PUIS la suite complète, rends ton `QA RAPPORT` (VERDICT: PASS|FAIL).
>
> --- RAPPORT DEV ---
> <coller le DEV RAPPORT intégral>

### Boucle de correction (max 5 itérations)

`VERDICT: FAIL` → SendMessage au **même** dev (coller le QA RAPPORT), puis au
**même** QA (coller le nouveau DEV RAPPORT). 1 itération par aller-retour.
Au-delà de **5** sans PASS : stop la story, garde son worktree (vague), rapport
honnête (ce qui marche/échoue, causes, options).

`VERDICT: PASS` → la story sort de la boucle vers le commit + tracker (§A4 / §B2).

---

# §D — Étape tracker PostHog (après QA PASS)

`story-tracker` (`subagent_type: story-tracker`). Deux invocations :

- **bootstrap** (une fois, master, §B0.5) :
  > Mode bootstrap : mets en place l'infra PostHog (client + serveur + sink de
  > test + helpers e2e + env). N'instrumente aucune story. Rends ton TRACKER
  > RAPPORT.

- **story** (après le commit feature) :
  > Mode story <ID> (worktree `.worktrees/<ID>` le cas échéant). Instrumente les
  > events client + serveur de cette story et vérifie leur envoi réel en E2E
  > (e2e/<ID>-tracking.spec.ts). Rends ton TRACKER RAPPORT (VERDICT: PASS |
  > DEFERRED | FAIL).
  > --- RAPPORT QA ---
  > <coller le QA RAPPORT pour qu'il sache quoi tester>

Traite le verdict :
- `PASS` → le tracker a committé le tracking ; on continue (clôture / merge).
- `DEFERRED` → le tracker a annulé ses ajouts (branche = state QA-validé) ;
  merge la feature seule, note un suivi « tracking <ID> à reprendre ».
- `FAIL` (état non récupérable) → relance le tracker une fois (SendMessage) ; si
  ça persiste, annule toi-même ses changements non committés
  (`git checkout -- . && git clean -fd src e2e` dans le worktree) pour préserver
  le state QA-validé, puis traite comme DEFERRED.
- Le tracking ne doit **jamais** bloquer le pipeline d'une feature déjà validée.

## Règles d'arbitrage (communes)

- Spec d'une **autre** story qui casse à cause d'un changement **explicitement**
  demandé par la story courante : c'est TOI qui mets à jour cette ancienne spec
  (ou demandes à l'utilisateur si ambigu) — jamais les agents.
- Dev vs QA qui se contredisent : tranche au critère d'acceptation ; doute →
  utilisateur.
- Jamais PASS sans `VERDICT: PASS` explicite de la QA (nouveaux tests ET
  non-régression).
- En vague : jamais deux merges simultanés, jamais le merge suivant avant
  intégration verte.
```
