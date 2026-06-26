---
id: S-014
epic: E02 — Groupes & invitations
status: testing
depends_on: [S-012, S-013]
---

# S-014 — Renommer / supprimer un groupe

## Contexte & objectif

L'admin d'un groupe doit pouvoir corriger le **nom** d'un groupe (faute de
frappe, renommage) et **supprimer** un groupe devenu inutile, depuis la page du
groupe (docs/02). Réservé aux admins, comme l'exclusion/promotion (S-012).

## Décisions applicables

- **Réservé aux admins** du groupe (`group_members.role = 'admin'`). Un membre
  simple ne voit pas les actions et l'action serveur refuse.
- Renommage : mêmes contraintes que la création (S-010) — nom **obligatoire,
  2–50 caractères**.
- Suppression = **soft-delete** (`groups.archived_at`), cohérent avec le
  soft-delete des membres (S-012) : l'historique (paris, ardoise, gages) n'est
  **jamais** réécrit ni perdu. Un groupe archivé disparaît de « Mes groupes » de
  tous les membres et ses pages renvoient 404/403.
- La suppression exige une **confirmation explicite** (saisie du nom du groupe
  ou modale de confirmation) pour éviter l'accident.
- La liste de visibilité d'un pari reste figée (décision produit globale) : le
  renommage du groupe n'affecte pas les paris existants au-delà de l'affichage
  du nom courant.

## Critères d'acceptation

1. Depuis la page du groupe (S-013), une entrée « Paramètres » / « Modifier le
   groupe » visible **uniquement par les admins**.
2. **Renommer** : formulaire pré-rempli avec le nom courant → enregistrement →
   le nouveau nom s'affiche partout (page groupe, « Mes groupes »).
3. Nom vide / < 2 / > 50 caractères → erreur de validation, pas de modification.
4. **Supprimer** : action protégée par confirmation → `archived_at` posé ; le
   groupe disparaît de « Mes groupes » de **tous** les membres.
5. Après suppression, tout accès aux pages du groupe (y compris par URL
   directe) → 404/403, pour l'admin comme pour les membres.
6. Un membre simple ne voit ni « Modifier » ni « Supprimer » ; les actions
   serveur correspondantes refusent (403) même appelées directement.
7. Les paris et l'ardoise d'un groupe supprimé ne sont pas effacés en base
   (soft-delete), conformément à la décision.

## Scénarios E2E à couvrir

- Alice (admin) renomme « Les potes du test » → le nouveau nom s'affiche sur la
  page groupe et dans sa liste « Mes groupes ».
- Renommage avec nom vide / 1 caractère → refusé.
- Bob (membre simple) ne voit pas les boutons modifier/supprimer ; appel direct
  de l'action serveur → 403.
- Alice supprime le groupe (avec confirmation) → il disparaît de « Mes groupes »
  d'Alice **et** de Bob ; accès URL directe → refus.
- Un pari/une ardoise existants restent présents en base après suppression
  (vérif via état serveur ou réactivation non régressée).

## Notes techniques

- **Migration** : ajouter `groups.archived_at timestamptz NULL` (Drizzle →
  `db:generate`). Le seul soft-delete actuel est sur `group_members`.
- Centraliser dans `src/lib/server/groups.ts` : les requêtes « groupes d'un
  utilisateur » et les helpers d'accès filtrent désormais `archived_at IS NULL`.
- RLS : étendre les policies SELECT de `groups`/`group_members` pour exclure les
  groupes archivés (filet de sécurité ; la vérité métier reste dans les actions).
- Form actions + Zod (réutiliser le schéma de validation du nom de S-010).
  Vérifier le rôle admin **côté serveur** avant toute écriture.
- Route suggérée : `/app/groups/[id]/settings` (rename + delete).
