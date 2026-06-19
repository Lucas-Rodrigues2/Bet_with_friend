---
id: S-013
epic: E02 — Groupes & invitations
status: testing
depends_on: [S-010]
---

# S-013 — Page groupe (dashboard)

## Contexte & objectif

La page centrale d'un groupe : c'est de là qu'on voit les paris en cours et
qu'on en crée (les types de paris arrivent en E03/E04 — ici on pose la
structure).

## Décisions applicables

- Un membre ne voit que les paris dont il est dans la **liste de visibilité**
  (docs/03) — le dashboard doit être prêt pour ce filtre.

## Critères d'acceptation

1. `/app/groups/[id]` affiche : nom, image, devise, onglets/sections « Paris »,
   « Membres », « Ardoise » (placeholders pour les sections futures).
2. Section Paris : état vide propre (« Aucun pari — crée le premier ! ») +
   bouton « Nouveau pari » (menu : « Au plus proche » / « Oui/Non », liens vers
   les pages de création, placeholder tant que S-020/S-030 ne sont pas faites).
3. Le solde personnel d'ardoise du membre (placeholder « 0 » tant que S-050
   n'existe pas) est affiché dans la devise du groupe.
4. Non-membre → 404/403.

## Scénarios E2E à couvrir

- Alice ouvre son groupe → nom + sections visibles, état vide des paris.
- Bob (non membre) accède à l'URL → refus.
- Le bouton « Nouveau pari » propose les deux types.

## Notes techniques

- `+layout.server.ts` du groupe : charge groupe + adhésion (guard central pour
  toutes les sous-pages `/app/groups/[id]/**`).
- Garder la requête « liste des paris visibles » dans
  `src/lib/server/bets.ts` (S-020 la branchera sur `bet_visibility`).
