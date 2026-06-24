---
id: S-041
epic: E05 — Jury & résolution
status: tracking
depends_on: [S-040]
---

# S-041 — Résolution & attribution des gains

## Contexte & objectif

Le dépouillement (docs/06) : quand les votes atteignent le seuil (unanimité ou
majorité), le match est **résolu** — gagnants enregistrés, ardoise mise à jour
(points) ou gages créés.

## Décisions applicables

- Mode `unanimous` : tous les jurés ont voté le même verdict (mêmes gagnants).
  Mode `majority` : > 50 % des jurés d'accord sur le même ensemble de gagnants.
- **Verdict immédiatement définitif** (aucun délai de contestation).
- Pot = somme des mises ; **partage égal** entre gagnants (closest) ;
  yesno : le perdant doit `stake` au gagnant selon les mises gelées de la
  proposition.
- Points → `ledger_entries` (débiteur/créancier par paire) ; gage →
  `forfeits` (statut `pending`, débiteurs selon `forfeit_scope`).
- « Pas encore résolu » majoritaire/unanime → le match repart en `open`
  (retour en attente, docs/06).

## Critères d'acceptation

1. Après chaque vote, le serveur évalue le seuil :
   - atteint avec gagnants → `matches.status=resolved`, `resolved_at`,
     `match_winners` (+ `share`), écritures `ledger_entries` (points) ou
     `forfeits` (gage) en **une transaction** ;
   - atteint sur `not_resolved` → match repart en `open` (votes purgés) ;
   - sinon → rien (on attend les autres jurés).
2. Yesno points : une écriture ledger perdant→gagnant du montant de la mise
   du perdant (stakes gelés à l'acceptation).
3. Closest points multi-gagnants : chaque perdant doit (sa mise) répartie à
   parts égales entre les gagnants (arrondi au centime, reste au premier
   gagnant — documenter).
4. Gage `all_losers` : un `forfeits` par perdant ; `last_one` : un seul, pour
   le « dernier » désigné (S-040).
5. La page du pari résolu affiche : verdict, gagnants, détail des votes, et
   « X doit Y points à Z » / gage(s) en attente.
6. Idempotence : un vote rejoué/dupliqué ne crée jamais de double écriture
   ledger.

## Scénarios E2E à couvrir

- Duel 10 vs 5, jury 1 juré (unanimité), Carol vote Alice → résolu : « Bob
  doit 5 à Alice » affiché.
- Closest 3 joueurs mise 10, jury majorité 2/3 : deux jurés votent
  {Alice, Bob} gagnants → résolu, partage égal affiché (Carol doit 5 à Alice
  et 5 à Bob).
- Jury 2 jurés unanimité : après 1 vote → toujours `judging` ; le 2e vote
  différent → toujours `judging` (pas de seuil) ; le 2e juré s'aligne →
  résolu.
- « Pas encore résolu » unanime → match de nouveau ouvert.
- Duel à gage → `forfeits` pending visible sur la page (le flux complet gage
  est S-051).

## Notes techniques

- `src/lib/server/resolution.ts` : `evaluateVerdict(matchId)` appelé dans la
  même transaction que l'enregistrement du vote (S-040) — verrouiller le match
  (`SELECT ... FOR UPDATE`) pour éviter les doubles résolutions.
- Comparaison d'ensembles de gagnants : trier les ids et comparer.
- Les montants ledger en `numeric` — utiliser des entiers de centimes ou
  `numeric` Drizzle, pas de float JS.
