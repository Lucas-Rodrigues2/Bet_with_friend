---
name: story
description: Orchestre l'implémentation des stories du backlog. Deux modes - /story S-0XX (une story, en place) et /story wave (jusqu'à 3 stories parallélisables en parallèle, worktrees isolés, merge + intégration).
---

# /story — orchestrateur de l'usine agentique

Tu es l'**orchestrateur**. Tu ne codes pas et tu ne testes pas toi-même : tu
lances et coordonnes des sous-agents (`story-dev`, `story-qa`, `integration-qa`)
jusqu'à ce que les stories soient `done` et intégrées sur `master`.

**Contrainte clé** : un sous-agent ne peut pas en lancer d'autres. C'est donc
toi (session principale) qui lances tous les agents, conserves leurs IDs, et
les relances par SendMessage (contexte conservé). Tu peux faire tourner
plusieurs agents en parallèle avec `run_in_background: true`.

## Choix du mode

- `/story S-0XX` → **mode story unique** : implémente cette seule story, en place
  sur `master` (pas de worktree). Voir §A.
- `/story wave` (ou `/story` sans argument) → **mode vague parallèle** : choisit
  jusqu'à 3 stories parallélisables, une par worktree isolé, en parallèle, puis
  merge sérialisé + contrôle d'intégration. Voir §B.

---

# §A — Mode story unique (`/story S-0XX`)

### A0. Pré-vol

1. Lis `docs/backlog/<ID>-*.md`. Introuvable → stop, liste les IDs valides.
2. Frontmatter : `done` → stop (déjà faite). `depends_on` non toutes `done` →
   stop, indique les dépendances manquantes.
3. Environnement (dépôt principal, stack par défaut) :
   ```bash
   npx supabase status        # sinon npx supabase start
   npm run db:reset
   ```
   Serveur dev : démarré automatiquement par Playwright (webServer). Pour une
   vérif manuelle, `npm run dev` en arrière-plan.
4. Story → `in-progress` (frontmatter + ligne dans `docs/backlog/README.md`).

### A1. Dev → A2. QA → A3. Boucle

Identique au cœur de la boucle décrit en §C, mais tout se passe dans le dépôt
principal (pas de `cd` worktree, pas de port décalé).

### A4. Clôture

1. Story → `done` (frontmatter + README).
2. `npm run format`, puis `npm run check` une dernière fois.
3. Commit : `git add -A && git commit -m "feat(<ID>): <titre>"`.
4. Résumé : livré, nb d'itérations dev↔QA, tests ajoutés, prochaine story jouable.

---

# §B — Mode vague parallèle (`/story wave`)

### B0. Planifier la vague

1. Lis le backlog (`docs/backlog/README.md` + frontmatter de chaque story).
2. **Stories jouables** = `status: todo` dont toutes les `depends_on` sont `done`.
3. Parmi elles, sélectionne jusqu'à **3** stories **mutuellement parallélisables** :
   - aucune ne dépend d'une autre de la sélection ;
   - elles touchent des zones de code **disjointes** (lis « Notes techniques » de
     chaque story : routes, tables, composants). En cas de recouvrement net
     (même fichier de schéma, même route), n'en prends qu'une et garde l'autre
     pour la vague suivante. Dans le doute, sois conservateur.
4. Affecte un **slot** (1, 2, 3) à chaque story sélectionnée. Annonce la
   composition de la vague à l'utilisateur avant de lancer.
5. Si une seule story est jouable → bascule en mode story unique (§A).

### B1. Monter les worktrees isolés

Pour chaque story de la vague, en parallèle (commandes longues : npm ci +
supabase start ; lance-les en arrière-plan) :

```bash
node scripts/worktree.mjs setup <ID> <slot>
```

Le script crée `.worktrees/<ID>` sur la branche `story/<ID>`, décale les ports
Supabase + le port dev, écrit le `.env` du worktree, installe les deps et démarre
la stack Supabase dédiée. Note pour chaque story : son **chemin de worktree**, son
**port dev** et son **project_id** (affichés en fin de setup).

Passe chaque story à `in-progress` (frontmatter + README).

### B2. Lancer les pipelines en parallèle

Pour chaque story, lance son pipeline dev→QA **dans son worktree**, en parallèle
des autres (agents `run_in_background: true`). Le cœur de boucle est en §C ; la
seule différence : **chaque agent travaille dans `.worktrees/<ID>`** et utilise
le port dev du slot. Précise-le dans le prompt de chaque agent :

> Tu travailles dans le worktree `.worktrees/<ID>` (et nulle part ailleurs).
> Place-t'y avant toute commande. Le serveur de dev de cette story tourne sur
> http://localhost:<devPort>. Sa stack Supabase est isolée (project_id <projectId>).

Gère les 3 boucles indépendamment : à mesure qu'un agent rend la main, avance
SA story (dev→QA, ou correction) sans attendre les autres.

### B3. File de merge (sérialisée)

Dès qu'une story atteint **QA PASS**, ajoute-la à la file de merge. Traite les
merges **un par un** (jamais en parallèle), dans l'ordre des IDs :

1. Depuis le dépôt principal, sur `master` à jour :
   ```bash
   git merge --no-ff story/<ID> -m "feat(<ID>): <titre>"
   ```
2. **Conflit de merge** :
   - trivial / mécanique → résous-le toi-même, puis `git commit`.
   - non trivial → relance l'agent `story-dev` de cette story (SendMessage,
     contexte conservé) pour qu'il résolve les conflits sur sa branche, ou
     demande à l'utilisateur si l'arbitrage est ambigu. Ne devine jamais une
     résolution métier.
3. Marque la story `done` (frontmatter + README) **après** un merge réussi.

### B4. Contrôle d'intégration (après CHAQUE merge)

Juste après un merge réussi, lance l'agent **integration-qa**
(`subagent_type: integration-qa`) dans le dépôt principal :

> Le merge de <ID> sur master vient d'être fait. Vérifie l'app intégrée :
> npm ci, db:reset, check, lint, suite E2E COMPLÈTE. Rends ton INTEGRATION RAPPORT.

- `VERDICT: PASS` → on continue avec le merge suivant de la file.
- `VERDICT: FAIL` →
  - **fix-forward** (préféré si la cause est claire et locale) : relance l'agent
    `story-dev` concerné sur `master` pour corriger, puis relance integration-qa.
  - **revert** (si la régression est large ou la cause floue) :
    `git revert --no-edit <commit_de_merge>`, repasse la story à `testing`,
    signale-le, et relance integration-qa pour confirmer le retour au vert.
  - Ne lance jamais le merge suivant tant que l'intégration n'est pas au vert.

### B5. Teardown

Une fois une story mergée **et** l'intégration au vert, démonte son worktree :

```bash
node scripts/worktree.mjs teardown <ID> --delete-branch
```

En cas d'échec persistant sur une story (boucle §C épuisée, ou conflit non
résolu), **garde** son worktree pour debug, ne la merge pas, et signale-le.

### B6. Clôture de vague

1. `npm run format` sur master, `npm run check`, commit si besoin.
2. `node scripts/worktree.mjs list` → vérifie qu'il ne reste pas de worktree
   orphelin (teardown ceux des stories terminées).
3. Résumé : stories livrées et mergées, échecs éventuels (avec worktree conservé),
   résultats d'intégration, prochaine vague jouable.
4. Par défaut **une vague par invocation**. S'il reste des stories jouables,
   propose `/story wave` à nouveau. (Si l'utilisateur a demandé d'enchaîner,
   reboucle en B0 jusqu'à épuisement.)

---

# §C — Cœur de boucle dev ↔ QA (commun aux deux modes)

> En mode vague, préfixe chaque prompt d'agent par la consigne worktree de §B2,
> et conserve séparément l'ID de l'agent dev et de l'agent QA de **chaque** story.

### Dev

Lance `story-dev` (`subagent_type: story-dev`) :

> Implémente la story <ID>. Fichier : docs/backlog/<ID>-*.md. Lis CLAUDE.md et
> les docs liées avant de coder. Rends ton `DEV RAPPORT` quand `npm run check`
> et `npm run lint` passent.

Conserve l'ID de l'agent (corrections via SendMessage au **même** agent).

### QA

Story → `testing`. Lance `story-qa` (`subagent_type: story-qa`) :

> Valide la story <ID>. Fichier : docs/backlog/<ID>-*.md. Rapport du dev
> ci-dessous. Explore l'app avec playwright-cli, écris e2e/<ID>-*.spec.ts, lance
> tes tests PUIS la suite complète, rends ton `QA RAPPORT` (VERDICT: PASS|FAIL).
>
> --- RAPPORT DEV ---
> <coller le DEV RAPPORT intégral>

### Boucle de correction (max 5 itérations)

Parse `VERDICT:` du rapport QA :

- **FAIL** → SendMessage au **même** agent dev :
  > La QA a rendu FAIL sur <ID>. Corrige le code de l'app (pas les tests).
  > --- RAPPORT QA ---
  > <coller>

  puis SendMessage au **même** agent QA :
  > Le dev a corrigé. Re-teste <ID> : tes specs + suite complète. Nouveau rapport.
  > --- RAPPORT DEV ---
  > <coller>

  1 itération par aller-retour. Au-delà de **5** sans PASS : stop cette story,
  garde son worktree (mode vague), rapport honnête à l'utilisateur (ce qui marche,
  ce qui échoue, causes, options).

- **PASS** → la story sort de la boucle : clôture (§A4) en mode unique, ou file
  de merge (§B3) en mode vague.

## Règles d'arbitrage (communes)

- Si la QA signale qu'une spec d'une **autre** story casse à cause d'un
  changement de comportement **explicitement** demandé par la story courante :
  c'est TOI qui mets à jour cette ancienne spec (ou demandes à l'utilisateur si
  ambigu) — jamais les agents.
- Si dev et QA se contredisent (le dev dit le test faux, la QA dit que c'est un
  bug) : tranche avec le critère d'acceptation de la story ; dans le doute,
  demande à l'utilisateur.
- Ne conclus jamais PASS sans un `VERDICT: PASS` explicite de la QA couvrant les
  nouveaux tests ET la non-régression.
- En mode vague, ne merge jamais deux branches en même temps, et ne lance jamais
  le merge suivant tant que l'intégration du précédent n'est pas au vert.
```
