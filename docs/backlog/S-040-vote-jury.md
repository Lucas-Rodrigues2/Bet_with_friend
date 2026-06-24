---
id: S-040
epic: E05 — Jury & résolution
status: testing
depends_on: [S-022, S-031]
---

# S-040 — Vote du jury

## Contexte & objectif

Quand un match est en `judging`, chaque juré vote (docs/06) : il désigne le(s)
gagnant(s) ou déclare « pas encore résolu ». Cette story couvre le vote ; le
dépouillement et les effets (gains) sont en S-041.

## Décisions applicables

- Votes **visibles** (non anonymes).
- Verdicts possibles : `winners_selected` (+ liste de gagnants) ou
  `not_resolved` (renvoyer le match en attente).
- Closest : plusieurs gagnants possibles. Yesno : **un seul gagnant** (un des
  deux camps).
- Si `forfeit_scope='last_one'` (closest à gage) : le vote désigne **aussi le
  « dernier »** → prévoir ce champ dans le vote (migration : table
  `jury_vote_losers` ou colonne dédiée — au choix du dev, documenter).
- Un juré peut être joueur.
- Le yesno doit aussi avoir son « Soumettre au jury » (même mécanique que
  S-022, à brancher ici si pas déjà fait pour les matchs yesno).

## Critères d'acceptation

1. Un juré d'un match `judging` voit un panneau de vote : sélection du/des
   gagnant(s) parmi les participants (radio pour yesno, checkboxes pour
   closest) OU « Pas encore résolu ».
2. Vote enregistré (`jury_votes` + `jury_vote_winners`), modifiable tant que
   le dépouillement (S-041) n'a pas conclu ; un juré = un vote
   (contrainte UNIQUE existante).
3. Les votes déjà exprimés sont affichés à tous (juré → son choix).
4. Un non-juré ne voit pas le panneau (et l'action serveur refuse).
5. Closest à gage `last_one` : le panneau demande aussi « qui est le plus
   loin ? ».
6. Match yesno : un participant peut soumettre au jury (transition
   `open → judging`) comme pour le closest.

## Scénarios E2E à couvrir

- Duel accepté (S-031) soumis au jury par Bob → Carol (jurée) vote
  « Alice gagne » → son vote s'affiche, visible par Alice et Bob.
- Closest avec 2 jurés : un vote « pas encore résolu » s'affiche comme tel.
- Dave (non juré) n'a pas de panneau de vote.
- Un juré modifie son vote avant conclusion.

## Notes techniques

- `src/lib/server/jury.ts` : enregistrement du vote (transaction : delete
  re-vote précédent + insert, ou upsert + sync `jury_vote_winners`).
- Le dépouillement (atteinte unanimité/majorité) est volontairement laissé à
  S-041 — ici on stocke et on affiche.
- Migration éventuelle pour le « dernier » (gage last_one) : préférer une
  table `jury_vote_losers(vote_id, loser_user_id)` symétrique de
  `jury_vote_winners`.
