---
id: S-051
epic: E06 — Ardoise & gages
status: todo
depends_on: [S-041]
---

# S-051 — Gages : accomplissement & confirmation

## Contexte & objectif

Cycle de vie du gage après résolution (docs/08) : le perdant accomplit
l'action, la marque faite (preuve optionnelle), un gagnant confirme.

## Décisions applicables

- `forfeits` créés par S-041 (statut `pending`).
- **Le perdant marque « fait »** avec preuve **optionnelle** (photo/vidéo →
  Supabase Storage), **un gagnant confirme** (`confirmed_by`).
- Le gagnant peut aussi marquer `not_done` (gage non tenu) — **aucune
  sanction**, juste l'historique visible.
- Le pari n'est « entièrement clos » que quand tous ses gages sont confirmés
  `done` (ou marqués `not_done`) — affichage, pas de blocage fonctionnel.

## Critères d'acceptation

1. Page du pari résolu à gage : section « Gages » listant chaque débiteur et
   le statut (`pending` / `done` / `not_done`).
2. Le débiteur d'un gage `pending` peut « J'ai fait mon gage » + upload de
   preuve optionnel → l'état passe à « en attente de confirmation »
   (sous-état UI : `pending` + marqué fait).
3. Un **gagnant** du match peut alors **Confirmer** (`done`, `confirmed_by`)
   ou **Refuser** (retour « à faire », avec possibilité de re-marquer).
4. Un gagnant peut à tout moment marquer `not_done` (gage non tenu) —
   l'historique du pari l'affiche sans sanction.
5. La preuve uploadée est visible par les membres voyant le pari.
6. Personne d'autre que débiteur/gagnants ne peut agir (vérifs serveur).
7. Une section « Mes gages » (sur le dashboard groupe ou le profil) liste les
   gages en attente du membre.

## Scénarios E2E à couvrir

- Duel à gage résolu : Bob (perdant) marque fait avec une image fixture →
  Alice confirme → statut `done` avec preuve visible.
- Alice refuse la première déclaration → Bob re-marque → Alice confirme.
- Alice marque `not_done` → affiché « gage non tenu » dans l'historique.
- Carol (tierce) n'a aucune action.

## Notes techniques

- « Marqué fait mais pas confirmé » : ajouter une colonne `claimed_at` sur
  `forfeits` (migration légère) plutôt qu'un nouvel enum.
- Bucket Storage `proofs` (lecture restreinte ? en local : public suffit,
  noter la durcification prod).
- Réutiliser le pattern d'upload de S-005.
