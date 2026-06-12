---
id: S-071
epic: E08 — Post-MVP
status: todo
depends_on: [S-050]
---

# S-071 — Leaderboard & stats

## Contexte & objectif

Classement du groupe (docs/07) : qui gagne le plus, qui doit le plus — le
carburant des vannes.

## Décisions applicables

- Classement par **gains nets cumulés** (somme ledger créditeur − débiteur,
  réglé ou non) + stats : paris joués, gagnés, % victoire, gages accomplis.
- Période : tout temps + filtre « 30 derniers jours ».
- Ne compte que les matchs `resolved`.

## Critères d'acceptation

1. Onglet « Classement » du groupe : tableau trié par gains nets (pseudo,
   gains nets, paris joués, gagnés, %, gages faits).
2. Filtre de période fonctionne.
3. Les membres soft-deleted ayant un historique apparaissent (grisés).
4. Groupe sans pari résolu → état vide propre.

## Scénarios E2E à couvrir

- Après les paris résolus des stories précédentes (ou seed via helpers DB) :
  ordre correct du classement et chiffres exacts sur un cas calculé à la main.
- Filtre 30 jours avec une vieille écriture antidatée (helper DB) → exclue.

## Notes techniques

- Agrégats SQL dans `src/lib/server/stats.ts` (joins ledger + match_winners +
  match_participants), pas de calcul côté client.
