---
id: S-010
epic: E02 — Groupes & invitations
status: todo
depends_on: [S-002]
---

# S-010 — Créer un groupe

## Contexte & objectif

Le groupe est le cercle social où vivent les paris (docs/02). N'importe quel
utilisateur connecté peut créer un groupe ; il en devient l'admin.

## Décisions applicables

- Créateur = admin (`group_members.role = 'admin'`).
- Devise unique par groupe (`groups.currency`, défaut EUR) — utilisée pour
  l'affichage de l'ardoise.
- Description et image optionnelles.

## Critères d'acceptation

1. `/app` (accueil connecté) liste « Mes groupes » + bouton « Créer un groupe ».
2. Formulaire : nom (obligatoire, 2–50), description (optionnel), devise
   (select, défaut EUR) → création : ligne `groups` + ligne `group_members`
   admin, redirection vers la page du groupe.
3. Nom vide/trop court → erreur de validation.
4. Un utilisateur ne voit dans « Mes groupes » que les groupes dont il est
   membre actif (`removed_at IS NULL`).

## Scénarios E2E à couvrir

- Alice crée « Groupe E2E <unique> » → redirigée sur la page groupe, le nom
  s'affiche, badge admin.
- Le groupe apparaît dans « Mes groupes » d'alice.
- Bob ne voit pas ce groupe dans sa liste.
- Nom vide refusé.

## Notes techniques

- Form action + transaction Drizzle (groups + group_members ensemble).
- RLS : SELECT sur `groups`/`group_members` limité aux membres actifs —
  première vraie policy du projet, poser le pattern (helper SQL
  `is_group_member(group_id)`).
- Routes suggérées : `/app` (liste), `/app/groups/new`, `/app/groups/[id]`
  (placeholder ici, dashboard complet en S-013).
