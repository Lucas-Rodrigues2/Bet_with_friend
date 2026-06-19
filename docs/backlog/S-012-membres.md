---
id: S-012
epic: E02 — Groupes & invitations
status: in-progress
depends_on: [S-011]
---

# S-012 — Gestion des membres

## Contexte & objectif

Lister les membres d'un groupe, gérer les rôles, quitter le groupe, exclure un
membre (docs/02).

## Décisions applicables

- **Soft-delete** (`removed_at`) : un membre exclu/parti ne voit plus le
  groupe, mais **ses paris en cours continuent** et son ardoise reste.
- Rôles : admin / member ; l'admin peut promouvoir un membre admin.

## Critères d'acceptation

1. Page « Membres » du groupe : liste (avatar, pseudo, rôle, badge
   `can_invite`), visible par tous les membres.
2. Un membre peut **quitter** le groupe (confirmation) → soft-delete, il ne
   voit plus le groupe dans sa liste ni ses pages.
3. L'admin peut **exclure** un membre (pas un autre admin) → soft-delete.
4. L'admin peut **promouvoir** un membre en admin.
5. Le dernier admin ne peut pas quitter sans promouvoir quelqu'un d'abord
   (message explicite).
6. Un membre exclu qui tente d'accéder aux pages du groupe par URL → 404/403.
7. Les paris en cours d'un membre exclu restent listés avec son pseudo
   (l'historique ne se réécrit pas).

## Scénarios E2E à couvrir

- Alice exclut Bob → Bob ne voit plus le groupe ; accès URL direct → refus.
- Bob re-rejoint via un nouveau lien → il retrouve le groupe (réactivation).
- Carol quitte le groupe d'elle-même.
- Alice seule admin tente de quitter → bloquée ; elle promeut Carol → peut
  quitter.
- Membre simple ne voit pas les boutons exclure/promouvoir (et l'action
  serveur refuse).

## Notes techniques

- Toutes les requêtes « membres du groupe » filtrent `removed_at IS NULL` —
  centraliser dans un helper `src/lib/server/groups.ts`.
- RLS déjà posée en S-010 : vérifier qu'elle exclut bien les soft-deleted.
