---
id: S-070
epic: E08 — Post-MVP
status: todo
depends_on: [S-041]
---

# S-070 — Fil d'activité du groupe

## Contexte & objectif

Un fil antéchronologique sur la page groupe (docs/07) : créations de paris,
acceptations, verdicts, gages accomplis, arrivées de membres — la vie du
groupe en un coup d'œil.

## Décisions applicables

- Respecte la **visibilité des paris** : un événement lié à un pari n'apparaît
  que pour les membres de sa liste de visibilité.
- Pas de nouvelle table : le fil est **dérivé** des données existantes
  (bets, matches, members, forfeits) — pas d'event sourcing.

## Critères d'acceptation

1. Onglet « Activité » du groupe : liste paginée (20 par page) d'événements
   datés avec libellés français et liens profonds.
2. Événements couverts : membre rejoint, pari créé, duel accepté, match
   résolu (avec gagnants), match annulé, gage confirmé.
3. Bob ne voit pas les événements d'un pari dont il n'est pas dans la liste
   de visibilité.
4. Performance : une requête par type UNION/ordonnée, pas de N+1.

## Scénarios E2E à couvrir

- Après un cycle complet (création → acceptation → verdict), le fil affiche
  les événements dans l'ordre.
- Dave ne voit pas les événements du pari caché.
- Pagination au-delà de 20 événements (helpers DB pour générer du volume).

## Notes techniques

- `src/lib/server/activity.ts` : UNION SQL des sources avec un type
  discriminant, LIMIT/OFFSET.
