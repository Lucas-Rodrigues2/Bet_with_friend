---
id: S-021
epic: E03 — Pari au plus proche
status: done
depends_on: [S-020]
---

# S-021 — Participer à un closest (estimation cachée)

## Contexte & objectif

Chaque membre de la liste de visibilité propose son estimation (réponse libre,
docs/04). Les estimations sont cachées si `hide_answers`.

## Décisions applicables

- Réponse **libre** (texte), pas forcément numérique.
- `hide_answers=true` → les estimations des autres sont masquées jusqu'à la
  clôture (deadline ou soumission au jury) ; on voit seulement **qui** a joué.
- Spectateur (docs/03) : membre de la liste qui n'a pas misé avant la deadline
  → voit le pari mais ne peut plus participer.
- Mise identique pour tous (celle du pari).

## Critères d'acceptation

1. Sur la page du pari (statut `open`), un membre de la liste qui n'a pas
   encore joué voit un champ « Mon estimation » + bouton « Miser X points » /
   « Parier (gage : Y) ».
2. Soumission → `match_participants` (answer + stake) ; il voit sa propre
   estimation et ne peut plus la modifier après la deadline ; **avant** la
   deadline il peut la modifier.
3. `hide_answers=true` : Bob ne voit pas l'estimation d'Alice (juste
   « Alice a joué ») tant que le match est `open`. Après clôture, tout le monde
   voit tout.
4. `hide_answers=false` : les estimations sont visibles en direct.
5. Deadline dépassée → plus de formulaire ; les non-participants de la liste
   deviennent spectateurs (bandeau « Tu n'as pas participé — spectateur »).
6. Hors liste de visibilité → toujours 404 (non-régression S-020).
7. Le créateur peut participer comme les autres.

## Scénarios E2E à couvrir

- Alice et Bob misent ; avec `hide_answers`, Bob ne voit pas la réponse
  d'Alice ; Carol (dans la liste) voit « 2 participants ».
- Bob modifie son estimation avant deadline → la nouvelle valeur est retenue.
- Pari avec deadline très courte (créée dans le passé proche impossible → la
  QA crée un pari sans deadline puis utilise la soumission au jury de S-022 ;
  pour cette story, tester la deadline via un pari seedé/inséré avec deadline
  passée par helper DB).
- `hide_answers=false` → estimations visibles.

## Notes techniques

- Upsert `match_participants` (PK match_id+user_id).
- La clôture par deadline n'a pas besoin de cron : statut **calculé** —
  `match.status='open'` ET deadline non passée ⇒ participable. S-022 formalise
  la transition.
- Helper E2E pour insérer des données directement en DB (deadline passée) :
  `e2e/helpers/db.ts` (connexion postgres à l'instance locale).
