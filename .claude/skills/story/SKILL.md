---
name: story
description: Orchestre l'implémentation complète d'une story du backlog - boucle agent dev → agent QA → corrections jusqu'à PASS. Usage - /story S-0XX
---

# /story S-0XX — boucle dev → QA → corrections → done

Tu es l'**orchestrateur**. Tu ne codes pas et tu ne testes pas toi-même : tu
fais dialoguer l'agent `story-dev` et l'agent `story-qa` jusqu'au PASS.
L'argument est l'ID de la story (ex : `S-001`). Sans argument, demande-le.

## Étape 0 — Pré-vol

1. Lis `docs/backlog/<ID>-*.md`. Si introuvable → stop, liste les IDs valides.
2. Vérifie le frontmatter :
   - `status: done` → stop, prévenir que la story est déjà faite.
   - `depends_on` : chaque dépendance doit être `done` dans son propre fichier.
     Sinon → stop, indiquer quelles dépendances manquent et proposer la
     prochaine story jouable.
3. Vérifie l'environnement :
   ```bash
   npx supabase status        # sinon : npx supabase start
   npm run db:reset           # base propre + seed
   ```
   Serveur dev : s'il ne tourne pas, lance `npm run dev` en arrière-plan et
   attends que http://localhost:5173 réponde.
4. Passe la story à `status: in-progress` dans son frontmatter et mets à jour
   la ligne correspondante dans `docs/backlog/README.md`.

## Étape 1 — Dev

Lance l'agent **story-dev** (tool Agent, `subagent_type: story-dev`) avec :

> Implémente la story <ID>. Fichier : docs/backlog/<ID>-*.md.
> Lis CLAUDE.md et les docs liées avant de coder. Rends ton rapport
> `DEV RAPPORT` quand `npm run check` et `npm run lint` passent.

Conserve l'**ID de l'agent** retourné : les corrections passeront par
SendMessage au **même** agent (contexte conservé).

## Étape 2 — QA

Passe la story à `status: testing`. Lance l'agent **story-qa**
(`subagent_type: story-qa`) avec :

> Valide la story <ID>. Fichier : docs/backlog/<ID>-*.md.
> Rapport du dev ci-dessous. Explore l'app avec playwright-cli, écris
> e2e/<ID>-*.spec.ts, lance tes tests PUIS la suite complète, et rends ton
> `QA RAPPORT` avec VERDICT: PASS ou FAIL.
>
> --- RAPPORT DEV ---
> <coller le DEV RAPPORT intégral>

Conserve aussi l'ID de cet agent.

## Étape 3 — Boucle de correction (max 5 itérations)

Parse le `VERDICT:` du rapport QA :

- **FAIL** → renvoie le rapport QA au **même** agent story-dev via SendMessage :

  > La QA a rendu FAIL sur <ID>. Corrige le code de l'app (pas les tests).
  > --- RAPPORT QA ---
  > <coller le QA RAPPORT intégral>

  Puis renvoie le nouveau DEV RAPPORT au **même** agent story-qa via SendMessage :

  > Le dev a corrigé. Re-teste <ID> : tes specs + suite complète. Nouveau rapport.
  > --- RAPPORT DEV ---
  > <coller>

  Compte 1 itération par aller-retour. Au-delà de **5 itérations** sans PASS :
  stop, story → `status: todo` (ou laisse `testing`), et présente à
  l'utilisateur un résumé honnête : ce qui marche, ce qui échoue encore, les
  causes probables, et les options.

- **PASS** → étape 4.

## Étape 4 — Clôture

1. Story → `status: done` dans le frontmatter + ligne mise à jour dans
   `docs/backlog/README.md`.
2. `npm run format` puis vérifie `npm run check` une dernière fois.
3. Commit unique (code + specs + backlog) :
   ```bash
   git add -A
   git commit -m "feat(<ID>): <titre de la story>"
   ```
4. Résumé final à l'utilisateur : ce qui a été livré, nombre d'itérations
   dev↔QA, tests ajoutés, et la prochaine story jouable du backlog.

## Règles d'arbitrage

- Si la QA signale qu'une spec d'une **autre** story casse à cause d'un
  changement de comportement **explicitement demandé** par la story courante :
  c'est TOI qui mets à jour cette ancienne spec (ou demandes à l'utilisateur si
  ambigu) — jamais les agents.
- Si dev et QA se contredisent (le dev dit que le test est faux, la QA dit que
  c'est un bug) : lis le critère d'acceptation de la story et tranche. En cas
  de doute, demande à l'utilisateur.
- Ne jamais conclure PASS toi-même sans un `VERDICT: PASS` explicite de la QA
  couvrant les nouveaux tests ET la non-régression.
