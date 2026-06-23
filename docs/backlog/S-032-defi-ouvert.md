---
id: S-032
epic: E04 — Pari Oui/Non
status: tracking
depends_on: [S-030]
---

# S-032 — Défi ouvert (multi-adversaires, termes fixes)

## Contexte & objectif

Second mode du oui/non (docs/05) : le créateur lance un défi à plusieurs
membres, **termes fixes non négociables**, les N premiers qui acceptent
verrouillent. Chaque acceptation = un duel 1v1 indépendant (un match).

## Décisions applicables

- Mode `open` : multi-cibles, **aucune négociation** (pas de contre-offre).
- `max_opponents` fixe le nombre max d'acceptations ;
  `accepted_count` incrémenté **atomiquement** (décision schéma : éviter la
  course quand deux personnes acceptent en même temps).
- Visibilité = la liste choisie à la création (figée).
- Jury fixé par le créateur (non négociable dans ce mode).

## Critères d'acceptation

1. Le formulaire yesno (S-030) propose le mode « Défi ouvert » : mêmes champs
   sans cible unique — à la place, liste de visibilité + `max_opponents`.
2. Chaque membre visible (hors créateur) voit le défi avec **Accepter** /
   **Refuser** (refus = juste pour son compteur, n'empêche pas les autres).
3. Accepter → création d'un `match` 1v1 (créateur vs accepteur, termes du
   pari) + incrément atomique `accepted_count` ; si
   `accepted_count = max_opponents`, le défi passe « complet » et les autres
   ne peuvent plus accepter (bet `closed`).
4. Deux acceptations simultanées ne dépassent jamais `max_opponents`
   (garde SQL, pas seulement UI).
5. La page du défi liste les duels créés (un par accepteur) avec leur statut.

## Scénarios E2E à couvrir

- Alice lance un défi ouvert max 2, visible par bob+carol+dave → Bob et Carol
  acceptent → 2 matchs ; Dave voit « complet », pas de bouton.
- Refus de Bob n'empêche pas Carol d'accepter.
- La page liste les 2 duels.
- Non-régression : le mode duel (S-030/S-031) fonctionne toujours.

## Notes techniques

- `UPDATE yesno_bets SET accepted_count = accepted_count + 1 WHERE bet_id = X
AND accepted_count < max_opponents RETURNING ...` dans la transaction de
  création du match — si 0 ligne, refuser (course perdue).
- Réutiliser la fabrique de match de S-031.
