---
id: S-072
epic: E08 — Post-MVP
status: todo
depends_on: [S-041]
---

# S-072 — Historique des paris

## Contexte & objectif

Retrouver les paris terminés (docs/07) : « qui avait raison ? » — l'archive
consultable du groupe et de l'utilisateur.

## Décisions applicables

- Historique **immuable** : les pages des paris résolus/annulés restent
  consultables à vie (participants, mises, offres, votes, verdict).
- Respecte la visibilité d'origine du pari.

## Critères d'acceptation

1. Onglet « Paris » du groupe : filtres En cours / En jugement / Terminés /
   Annulés + recherche par titre.
2. Vue « Mes paris » transverse aux groupes (gagnés/perdus/en cours).
3. La page d'un pari terminé affiche le récit complet : participations,
   négociation (yesno), votes du jury, verdict, mouvements d'ardoise/gages.
4. Aucune action possible sur un pari terminé (lecture seule).

## Scénarios E2E à couvrir

- Filtres : un pari résolu apparaît sous « Terminés », plus sous « En cours ».
- Recherche par titre.
- « Mes paris » d'Alice agrège deux groupes (helper DB pour le second).
- La page du pari résolu montre votes + verdict (non-régression S-041).

## Notes techniques

- Étendre les requêtes de `src/lib/server/bets.ts` avec filtres/statuts —
  réutiliser les composants de page de pari existants en mode lecture seule.
