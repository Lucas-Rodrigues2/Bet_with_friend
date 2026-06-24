---
id: S-042
epic: E05 — Jury & résolution
status: tracking
depends_on: [S-022, S-031]
---

# S-042 — Annulation unanime

## Contexte & objectif

Le filet anti-blocage (docs/06) : chaque joueur d'un match a un bouton
« Annuler ». Si **tous** les joueurs le cliquent, le match est annulé et les
mises remboursées. Sinon, le match reste en vie indéfiniment (pari zombie
accepté).

## Décisions applicables

- Unanimité des **joueurs** (pas des jurés).
- Possible tant que le match n'est pas `resolved`/`cancelled` (y compris en
  `judging`).
- Annulé avant résolution → aucune écriture d'ardoise n'existe encore, donc
  « remboursement » = simplement aucun effet + statut `cancelled`.
- C'est aussi le **seul recours** après un verdict ? Non — décision : le
  verdict est définitif ; l'annulation unanime ne s'applique **que** avant
  résolution.

## Critères d'acceptation

1. Chaque participant d'un match `open|judging` voit « Demander
   l'annulation » ; son clic est enregistré (`match_cancellations`) et
   affiché (« 1/2 joueurs veulent annuler »).
2. Un joueur peut retirer sa demande tant que l'unanimité n'est pas atteinte.
3. Quand le dernier joueur clique → `matches.status=cancelled` ; pour un
   yesno, le bet repasse/reste cohérent ; plus aucune action possible sur le
   match ; affichage « Pari annulé d'un commun accord ».
4. Un match `resolved` n'offre plus le bouton (et l'action serveur refuse).
5. Les jurés ne votent plus sur un match annulé.

## Scénarios E2E à couvrir

- Duel : Alice demande l'annulation (1/2) ; Bob aussi → annulé, vote jury
  impossible.
- Alice retire sa demande avant Bob → compteur 0/2.
- Closest 3 joueurs : 2/3 ne suffit pas.
- Match résolu : pas de bouton (non-régression sur S-041).

## Notes techniques

- Transaction : insert `match_cancellations` + comptage participants vs
  demandes + transition éventuelle, avec verrou sur le match (même pattern que
  S-041).
