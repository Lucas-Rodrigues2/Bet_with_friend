---
name: story
description: Orchestre l'implémentation des stories du backlog, UNE par UNE, en enchaînant automatiquement la suivante sans s'arrêter. /story = enchaîne tout le backlog jouable ; /story S-0XX = cette seule story.
---

# /story — orchestrateur séquentiel de l'usine agentique

Tu es l'**orchestrateur**. Tu ne codes/testes pas toi-même : tu lances et
coordonnes des sous-agents (`story-dev`, `story-qa`, `story-security`,
`story-tracker`) jusqu'à ce que chaque story soit `done` sur `master`.

Tu traites les stories **une par une, séquentiellement, en place sur `master`**
(pas de worktree, pas de branche, pas de merge — une seule story en cours à la
fois). Puis tu **enchaînes automatiquement** la story jouable suivante, **sans
t'arrêter**, jusqu'à épuisement du backlog.

**Contrainte clé** : un sous-agent ne peut pas en lancer d'autres. C'est toi
(session principale) qui lances tous les agents, conserves leurs IDs, et les
relances par SendMessage (contexte conservé).

**Pipeline d'une story** : dev → QA (boucle jusqu'à PASS) → **audit sécurité**
(boucle jusqu'à PASS) → **commit feature** → statut `tracking` puis agent
**tracker PostHog** (commit tracking) → **passe sécu ciblée tracking** → `done`.

(« `tracking` » = le **statut** de la story ; le « **tracker** » = l'agent
`story-tracker` qui instrumente PostHog. Deux choses distinctes.)

## Modes

- `/story` (sans argument) → **chaînage** : enchaîne toutes les stories jouables
  du backlog, une par une, sans s'arrêter. Voir §A.
- `/story S-0XX` → **ciblé** : traite cette seule story puis s'arrête.

---

# §A — Boucle de chaînage

### A0. Pré-vol (une fois, au démarrage)

```bash
npx supabase status        # sinon npx supabase start
npm run db:reset           # base propre + seed
```

Le serveur dev est démarré automatiquement par Playwright (webServer).

### A1. Boucle

Répète jusqu'à ce qu'il n'y ait plus de story jouable :

1. **Sélectionne la prochaine story** : lis le backlog
   (`docs/backlog/README.md` + frontmatter de chaque `docs/backlog/S-0XX-*.md`).
   Story jouable = `status: todo` dont **toutes** les `depends_on` sont `done`.
   Prends le plus petit ID. Aucune jouable → va en A2 (clôture).
2. **Traite-la** via le pipeline §B.
3. **Succès** (`done`) → continue la boucle (story suivante), **sans demander
   de confirmation**.
4. **Échec dur** (une gate ne passe pas après le max d'itérations, ou conflit
   non résoluble) → restaure un arbre propre
   (`git checkout -- . && git clean -fd src e2e`), laisse la story en
   `in-progress`/`testing`, **note-la comme bloquée**, et continue avec la
   prochaine story jouable **qui n'en dépend pas**. Si plus rien n'est jouable,
   va en A2.

> **Mode ciblé** (`/story S-0XX`) : fais A0 puis le pipeline §B pour cette seule
> story, et arrête-toi (pas de boucle).

### A2. Clôture du chaînage

1. `npm run format`, `npm run check`, commit si besoin.
2. Résumé : stories livrées, stories bloquées (avec cause), events ajoutés (ou
   différés), et l'état final du backlog.

---

# §B — Pipeline d'une story (en place sur `master`)

### B0. Démarrage

Story → `in-progress` (frontmatter + `docs/backlog/README.md`).

### B1. Dev → B2. QA → B3. Boucle

Cœur de boucle dev ↔ QA : §C, jusqu'à `VERDICT: PASS`.

### B4. Audit sécurité

QA PASS → **gate sécurité** : §D. PASS → on continue. FAIL → renvoi au dev,
re-QA, re-sécu (boucle décrite en §D).

### B5. Commit feature

Sécu PASS → `git add -A && git commit -m "feat(<ID>): <titre>"`.

### B6. Tracking PostHog

1. Story → `tracking` (frontmatter + README).
2. **Tracker** : §E. PASS → tracking committé puis **passe sécu ciblée** (§E.bis).
   DEFERRED → ajouts annulés, suivi noté, pas de passe sécu tracking.

### B7. Clôture de la story

1. **Persiste les constats ergonomie** : reprends la section « ERGONOMIE — à
   changer pour le dev » du dernier QA RAPPORT. S'il y a des constats
   `majeur`/`mineur` (les `bloquant` ont déjà été corrigés via la boucle FAIL),
   ajoute une entrée pour la story en tête de `docs/backlog/suivi-ergonomie.md`
   (gabarit dans le fichier, ordre antéchronologique, statut `à faire`). Si
   « RAS », n'écris rien.
2. Story → `done` (frontmatter + README). (Le `format`/`check` global est fait
   en A2 à la fin du chaînage.)

---

# §C — Cœur de boucle dev ↔ QA

### Dev

`story-dev` (`subagent_type: story-dev`) :

> Implémente la story <ID>. Fichier : docs/backlog/<ID>-\*.md. Lis CLAUDE.md et
> les docs liées. Rends ton `DEV RAPPORT` quand `npm run check` et `npm run lint`
> passent.

Conserve l'ID de l'agent (corrections via SendMessage au **même** agent).

### QA

Story → `testing`. `story-qa` (`subagent_type: story-qa`) :

> Valide la story <ID>. Fichier : docs/backlog/<ID>-_.md. Rapport du dev
> ci-dessous. Explore avec playwright-cli, écris e2e/<ID>-_.spec.ts, lance tes
> tests PUIS la suite complète (non-régression), rends ton `QA RAPPORT`
> (VERDICT: PASS|FAIL).
>
> --- RAPPORT DEV ---
> <coller le DEV RAPPORT intégral>

La suite E2E complète lancée par la QA **est** le contrôle de non-régression
(pas de merge, donc pas d'étape d'intégration séparée).

### Boucle de correction (max 5 itérations)

`VERDICT: FAIL` → SendMessage au **même** dev (coller le QA RAPPORT), puis au
**même** QA (coller le nouveau DEV RAPPORT). 1 itération par aller-retour.
Au-delà de **5** sans PASS : échec dur (retour en A1.4).

`VERDICT: PASS` → on passe à la gate sécurité (§D).

---

# §D — Gate sécurité (après QA PASS, avant le commit feature)

`story-security` (`subagent_type: story-security`). Tourne **toujours sur Claude
Opus 4.8** (figé dans son frontmatter — ne le surcharge pas). **Lecture seule** :
il diagnostique, il ne corrige pas. Peut consulter internet (WebSearch/WebFetch)
pour les CVE/avis récents.

> Audit sécurité de la story <ID>. Audite le diff de la story, vérifie les CVE
> récentes des dépendances touchées, rends ton SECURITY RAPPORT
> (VERDICT: PASS | FAIL).
> --- RAPPORT QA ---
> <coller le QA RAPPORT pour le contexte de surface d'attaque>

Traite le verdict :

- `PASS` (aucun finding HIGH/CRITICAL) → on continue (commit feature). Note les
  findings MEDIUM/LOW comme suivi, sans bloquer.
- `FAIL` (≥ 1 finding bloquant) → **renvoie les findings au même `story-dev`**
  (SendMessage), il corrige, puis **re-QA** (même `story-qa`), puis **re-sécu**
  (même agent). 1 itération = dev → QA → sécu. Au-delà de **3** itérations sécu
  sans PASS : échec dur (retour en A1.4). Ne commit **jamais** une feature avec
  un finding bloquant non résolu.

---

# §E — Tracker PostHog (après le commit feature)

`story-tracker` (`subagent_type: story-tracker`) :

> Mode story <ID>. Instrumente les events client + serveur de cette story et
> vérifie leur envoi réel en E2E (e2e/<ID>-tracking.spec.ts). Rends ton TRACKER
> RAPPORT (VERDICT: PASS | DEFERRED | FAIL).
> --- RAPPORT QA ---
> <coller le QA RAPPORT pour qu'il sache quoi tester>

> **Bootstrap (une seule fois)** : si l'infra PostHog n'existe pas encore
> (`src/lib/server/analytics.ts` absent), lance d'abord `story-tracker` en mode
> bootstrap, attends son PASS, commit `chore: bootstrap analytics PostHog`,
> **avant** d'instrumenter la première story.

Traite le verdict :

- `PASS` → tracking committé ; **passe par la passe sécu ciblée (§E.bis)**.
- `DEFERRED` → ajouts annulés (state QA-validé conservé) ; note un suivi
  « tracking <ID> à reprendre ». Pas de passe sécu tracking (aucun code ajouté).
- `FAIL` (état non récupérable) → relance le tracker une fois (SendMessage) ; si
  ça persiste, annule toi-même ses changements non committés
  (`git checkout -- . && git clean -fd src e2e`), puis traite comme DEFERRED.
- Le tracking ne **bloque jamais** une feature déjà validée (sauf finding sécu
  bloquant : §E.bis → on dégrade en DEFERRED, on ne stoppe pas le chaînage).

### §E.bis — Passe sécu ciblée tracking (si tracker PASS)

L'instrumentation ajoute du code **après** la gate sécu feature → re-audit du
diff de tracking. `story-security` (Opus 4.8), scopé :

> Passe sécu ciblée tracking <ID>. Audite **uniquement** le diff d'instrumentation
> `git diff <commit-feature>..HEAD`. Priorités : PII dans les events (email,
> pseudo, token, ids privés), confusion `PUBLIC_*` vs secrets serveur, logique du
> sink de test (`ANALYTICS_TEST_SINK`) qui écrirait en prod, capture client de
> params de route sensibles. Rends ton SECURITY RAPPORT (VERDICT: PASS | FAIL).

- `PASS` → clôture (B7).
- `FAIL` → renvoie les findings au **même `story-tracker`** (SendMessage), il
  corrige, recommit, re-sécu tracking. Max **3** itérations. Sans convergence :
  le tracker **annule ses ajouts** (retour state QA-validé), on dégrade en
  DEFERRED (feature seule conservée, suivi noté). Une faille analytics ne part
  jamais sur `master`, mais ne stoppe pas le chaînage.

---

## Règles d'arbitrage

- **Chaînage autonome** : ne bloque **jamais** la boucle sur une question. En cas
  d'ambiguïté qui demanderait normalement l'avis de l'utilisateur, choisis
  l'option **sûre** (marque la story bloquée et passe à la suivante, ou dégrade
  le tracking en DEFERRED) plutôt que d'attendre une réponse. (En mode ciblé
  `/story S-0XX`, tu peux demander à l'utilisateur.)
- Spec d'une **autre** story qui casse à cause d'un changement **explicitement**
  demandé par la story courante : c'est TOI qui mets à jour cette ancienne spec —
  jamais les agents.
- Dev vs QA qui se contredisent : tranche au critère d'acceptation de la story.
- Jamais `done` sans `VERDICT: PASS` explicite de la QA (nouveaux tests ET
  non-régression) ET de la sécurité.
