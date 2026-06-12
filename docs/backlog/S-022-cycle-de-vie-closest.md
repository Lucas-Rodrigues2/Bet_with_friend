---
id: S-022
epic: E03 — Pari au plus proche
status: todo
depends_on: [S-021]
---

# S-022 — Cycle de vie : clôture & soumission au jury

## Contexte & objectif

Formaliser la machine à états du pari (docs/06 §D) : `open` → `closed`
(deadline) → `judging` (soumission au jury) ; révéler le pari au jury au bon
moment.

## Décisions applicables

- **N'importe quel participant** peut cliquer « Soumettre au jury » à tout
  moment ; ça ferme aussi les mises.
- La deadline ferme les mises (`closed`) mais ne soumet pas au jury toute
  seule… **sauf** si une deadline existe : docs/06 dit qu'elle déclenche aussi
  la soumission → deadline atteinte = `judging` direct.
- Tant que le match n'est pas soumis, **le jury ne voit pas le pari** (sauf
  s'il est aussi dans la liste de visibilité comme joueur/spectateur).
- Statuts sur `matches.status` : `open → judging` (ou `closed` transitoire).

## Critères d'acceptation

1. Bouton « Soumettre au jury » visible par tout **participant** d'un match
   `open` (pas par un spectateur) → statut `judging`, plus aucune
   participation/modification possible.
2. Deadline atteinte → le match passe en `judging` (transition appliquée
   paresseusement au chargement : pas de cron).
3. En `judging`, les estimations deviennent visibles de tous (fin du
   `hide_answers`).
4. Un juré **non présent dans la liste de visibilité** ne voyait pas le pari
   avant ; dès `judging`, il le voit dans une section « À juger » de la page
   groupe et peut ouvrir la page du pari.
5. La page du pari affiche clairement le statut (badge : Ouvert / En jugement).

## Scénarios E2E à couvrir

- Bob (participant) clique « Soumettre au jury » → badge « En jugement », le
  formulaire d'estimation disparaît pour tous.
- Carol (jurée, hors liste de visibilité) ne voyait pas le pari → après
  soumission, il apparaît dans son « À juger ».
- Les estimations cachées se révèlent en `judging`.
- Un spectateur n'a pas le bouton « Soumettre ».
- Non-régression : création + participation inchangées.

## Notes techniques

- Transition paresseuse : helper `resolveMatchStatus(match)` dans
  `src/lib/server/matches.ts`, appelé dans les loads ; écrit la transition en
  DB quand la deadline est franchie (UPDATE conditionnel idempotent).
- RLS : la visibilité du pari pour les jurés s'ouvre quand
  `matches.status IN ('judging', ...)` — ajuster la policy posée en S-020.
- Préparer la place du vote (S-040) sur la page du pari.
