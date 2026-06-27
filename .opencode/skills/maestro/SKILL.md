---
name: maestro
description: Orchestre l'implémentation des stories du backlog, UNE par UNE, en enchaînant automatiquement la suivante sans s'arrêter. Utilise les subagents story-dev et story-qa. Le tracking PostHog est intégré dans le dev (skill tracking). /maestro = tout le backlog ; /maestro S-0XX = une seule story.
---

# /maestro — orchestrateur séquentiel de l'usine agentique

Tu es l'**orchestrateur**. Tu ne codes/testes pas toi-même : tu lances et
coordonnes des sous-agents (`story-dev`, `story-qa`, `story-security`) jusqu'à
ce que chaque story soit `done` sur `master`.

Tu traites les stories **une par une, séquentiellement, en place sur `master`**
(pas de worktree, pas de branche, pas de merge). Puis tu **enchaînes
automatiquement** la story jouable suivante, **sans t'arrêter**, jusqu'à
épuisement du backlog.

**Contrainte clé** : un sous-agent ne peut pas en lancer d'autres. C'est toi
(session principale) qui lances tous les agents via `task` (Task tool).

**Pipeline d'une story** : dev (code + tracking PostHog) → QA (boucle jusqu'à
PASS) → **audit sécurité** (boucle jusqu'à PASS) → **commit feature** → `done`.

## Modes

- `/maestro` (sans argument) → **chaînage** : enchaîne toutes les stories jouables
- `/maestro S-0XX` → **ciblé** : traite cette seule story puis s'arrête.

---

## §A — Boucle de chaînage

### A0. Pré-vol (une fois, au démarrage)

```bash
npx supabase status        # sinon npx supabase start
npm run db:reset           # base propre + seed
```

### A1. Boucle

Répète jusqu'à ce qu'il n'y ait plus de story jouable :

1. **Sélectionne la prochaine story** : lis le backlog
   (`docs/backlog/README.md` + frontmatter de chaque `docs/backlog/S-0XX-*.md`).
   Story jouable = `status: todo` dont **toutes** les `depends_on` sont `done`.
   Prends le plus petit ID.
2. **Traite-la** via le pipeline §B.
3. **Succès** (`done`) → continue la boucle, **sans demander de confirmation**.
4. **Échec dur** → `git checkout -- . && git clean -fd src e2e`, laisse la
   story en `in-progress`/`testing`, **note-la comme bloquée**, et continue.

### A2. Clôture du chaînage

1. `npm run format`, `npm run check`, commit si besoin.
2. Résumé : stories livrées, stories bloquées, events ajoutés.

---

## §B — Pipeline d'une story

### B0. Story → `in-progress` (frontmatter + README).

### B1. Dev (code + tracking)

Le dev implémente la feature **et** le tracking PostHog en une seule passe.
L'agent `story-dev` a la skill « tracking » chargée automatiquement pour les
instructions complètes (bootstrap, conventions, instrumentation).

### B2. QA

Story → `testing`. La QA valide le fonctionnel (specs E2E) **et** les events
PostHog (specs tracking séparées `e2e/<ID>-tracking.spec.ts`).

### B3. Boucle dev ↔ QA

Cœur de boucle : §C, jusqu'à `VERDICT: PASS`.

### B4. Audit sécurité

QA PASS → **gate sécurité** : §D. PASS → on continue. FAIL → renvoi au dev,
re-QA, re-sécu.

### B5. Commit feature

Sécu PASS → `git add -A && git commit -m "feat(<ID>): <titre>"`.

### B6. Clôture

1. Persiste les constats ergonomie dans `docs/backlog/suivi-ergonomie.md`.
2. Story → `done` (frontmatter + README).

---

## §C — Cœur de boucle dev ↔ QA

### Dev

Lance `task` avec `subagent: story-dev` :

> Implémente la story <ID> avec son tracking PostHog. Fichier : docs/backlog/<ID>-*.md.
> Lis CLAUDE.md et les docs liées. La skill « tracking » est dispo pour les détails
> PostHog. Rends ton `DEV RAPPORT` quand `npm run check` et `npm run lint` passent.

### QA

Story → `testing`. Lance `task` avec `subagent: story-qa` :

> Valide la story <ID>. Fichier : docs/backlog/<ID>-*.md. Rapport du dev
> ci-dessous. Explore avec playwright-cli, écris e2e/<ID>-*.spec.ts, lance tes
> tests PUIS la suite complète, rends ton `QA RAPPORT` (VERDICT: PASS|FAIL).
> Vérifie aussi les events PostHog via les helpers e2e/helpers/analytics.ts.

### Boucle (max 5 itérations)

`VERDICT: FAIL` → relance le même dev avec le QA RAPPORT, puis le même QA
avec le nouveau DEV RAPPORT. Au-delà de 5 sans PASS : échec dur.

`VERDICT: PASS` → on passe à la gate sécurité.

---

## §D — Gate sécurité

Lance `task` avec `subagent: story-security` :

> Audit sécurité de la story <ID>. Audite le diff, vérifie les CVE récentes,
> rends ton SECURITY RAPPORT (VERDICT: PASS | FAIL).

`PASS` → continue. `FAIL` → renvoie les findings au dev, re-QA, re-sécu.
Max 3 itérations sécu.

---

## Règles d'arbitrage

- **Chaînage autonome** : ne bloque jamais la boucle sur une question. En cas
  d'ambiguïté, choisis l'option sûre (marque bloquée et passe à la suivante).
- Spec d'une **autre** story qui casse : c'est TOI qui la mets à jour.
- Dev vs QA qui se contredisent : tranche au critère d'acceptation.
- Jamais `done` sans `VERDICT: PASS` explicite de la QA ET de la sécurité.