---
id: S-043
epic: E05 — Jury & résolution
status: todo
depends_on: [S-040]
---

# S-043 — Litige → admin du groupe

## Contexte & objectif

Dernier recours pendant le jugement (docs/06 §B) : un participant peut flaguer
le match « contesté » ; l'admin du groupe tranche à la place du jury.

## Décisions applicables

- Contestation possible **uniquement pendant `judging`** (le verdict rendu est
  définitif).
- `matches.status='contested'` (enum existant).
- L'admin du groupe rend la décision finale : désigner gagnant(s) (mêmes
  effets que S-041) ou annuler le match.
- Historique immuable affiché pour arbitrer (offres, votes).

## Critères d'acceptation

1. En `judging`, tout participant peut « Contester » (avec un motif texte
   court) → statut `contested`, le jury ne peut plus voter.
2. L'admin du groupe voit une section « Litiges » et la page du match avec
   tout l'historique (participants, mises, offres de négociation, votes du
   jury, motif).
3. L'admin tranche : gagnant(s) → mêmes effets que la résolution S-041
   (ledger/forfeits, `resolved`) ; ou annulation → `cancelled`.
4. Un non-admin ne peut pas trancher (action serveur refusée).
5. Si l'admin contesté est lui-même partie prenante… il tranche quand même
   (assumé : petit groupe, pression sociale — documenté).

## Scénarios E2E à couvrir

- Duel en jugement : Bob conteste avec motif → Carol (jurée) ne peut plus
  voter ; Alice (admin) tranche pour Bob → ledger correct, statut résolu.
- L'admin annule un match contesté → aucun mouvement d'ardoise.
- Dave (membre simple) ne voit pas les actions d'arbitrage.

## Notes techniques

- Réutiliser `resolution.ts` (S-041) pour appliquer la décision admin —
  même fonction d'application des gains, source différente (admin vs jury).
- Ajouter le motif : colonne `contest_reason`/`contested_by` sur `matches`
  (migration légère) ou table dédiée si plusieurs contestations possibles —
  préférer la colonne (une contestation suffit à basculer).
