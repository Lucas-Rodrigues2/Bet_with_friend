---
id: S-031
epic: E04 — Pari Oui/Non
status: testing
depends_on: [S-030]
---

# S-031 — Négociation du duel

## Contexte & objectif

Le cœur social du oui/non (docs/05) : la cible accepte, refuse ou
contre-propose (mises, gages, jurés) — aller-retour jusqu'à acceptation,
refus, annulation ou expiration.

## Décisions applicables

- Négociables : `stake_creator`, `stake_target` (la cote n'est que leur
  rapport), gages par camp, **liste de jurés** (docs/06 : jury négocié).
- Expiration **48 h** (ou la valeur du pari) à chaque nouvelle offre.
- **Historique immuable** des offres (`proposition_offers`).
- **Gel après acceptation** : tout est figé, un `match` est créé.
- Seul **celui qui n'a pas fait la dernière offre** peut accepter/contre-proposer.

## Critères d'acceptation

1. La cible d'une proposition `negotiating` a trois actions : **Accepter**,
   **Refuser**, **Contre-proposer** (formulaire pré-rempli des termes actuels).
2. Contre-proposition → nouvelle ligne `proposition_offers`, `propositions`
   mise à jour (termes courants, `last_proposer_id`, `expires_at` repoussé),
   et c'est maintenant au créateur d'accepter/refuser/contre-proposer.
   L'auteur de la dernière offre ne peut qu'**annuler** ou attendre.
3. **Accepter** → `propositions.status=accepted`, création du `match`
   (statut `open` — il attend la soumission au jury) avec
   `match_participants` (2 joueurs, side a/b, stakes gelés) et `match_jurors`
   (jury final négocié) ; `yesno_bets.accepted_count` incrémenté atomiquement.
4. **Refuser** → `status=refused`, le duel est terminé (bet `cancelled` si
   aucune proposition acceptée).
5. **Annuler** (créateur, tant que pas accepté) → `status=cancelled`.
6. Proposition expirée (lazy) → `status=expired`, affichée comme telle, plus
   d'actions possibles.
7. L'historique complet des offres (qui, quoi, quand) est affiché sur la page
   du duel, ordre chronologique.
8. Négociation du jury : la contre-offre peut modifier la liste de jurés ;
   la liste finale = celle des derniers termes acceptés.

## Scénarios E2E à couvrir

- Bob contre-propose (15/15) → Alice voit les nouveaux termes + historique de
  2 offres ; Alice accepte → match créé, page « Duel accepté », termes gelés.
- Bob refuse directement → duel refusé/terminé.
- Alice annule avant réponse de Bob.
- Carol (hors duel) ne peut faire aucune action (URL directe refusée).
- Après acceptation : plus aucun bouton de négociation.
- Expiration : proposition avec `expires_at` passé (helper DB) → actions
  bloquées, statut « expirée ».

## Notes techniques

- Machine à états dans `src/lib/server/propositions.ts` — transactions
  Drizzle, vérifs d'autorisation (qui peut quoi selon `last_proposer_id` et
  `status`) côté serveur systématiques.
- Création du match à l'acceptation = la transaction la plus délicate du
  projet à date (match + participants + jurors + update proposition + counter).
- Realtime (optionnel ici) : le polling/refresh suffit, le realtime viendra
  avec les notifs.
