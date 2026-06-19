---
id: S-011
epic: E02 — Groupes & invitations
status: done
depends_on: [S-010]
---

# S-011 — Liens d'invitation + droit délégable

## Contexte & objectif

Inviter ses amis dans un groupe via un lien partageable (docs/02).

## Décisions applicables

- Lien **réutilisable**, expiration (`expires_at`) et limite d'usages
  (`max_uses`) **optionnelles** ; révocable.
- **Entrée directe** : cliquer = rejoindre, pas de validation admin.
- **Admin seul par défaut**, mais il peut déléguer le droit d'inviter à des
  membres → **migration : ajouter `can_invite boolean default false` à
  `group_members`**.

## Critères d'acceptation

1. Sur la page groupe, un admin (ou membre avec `can_invite`) peut générer un
   lien d'invitation, avec expiration (jamais / 24h / 7j) et limite d'usages
   (illimité / N) optionnelles. Le lien est copiable.
2. Un membre sans `can_invite` ne voit pas l'option (et l'action serveur
   refuse, pas seulement l'UI).
3. L'admin peut activer/désactiver `can_invite` par membre.
4. Un utilisateur connecté qui ouvre `/invite/[token]` voit le nom du groupe et
   un bouton « Rejoindre » → il devient membre, `uses_count` incrémenté.
5. Un visiteur non connecté qui ouvre le lien passe par login/signup (ou
   invité, S-004) puis revient terminer l'entrée dans le groupe.
6. Lien expiré, épuisé (`uses_count >= max_uses`) ou révoqué → page « lien
   invalide », pas d'entrée.
7. Déjà membre → message « tu es déjà dans ce groupe », pas de doublon.
8. Un membre parti (soft-delete) qui re-rejoint via un lien retrouve son
   historique (réactivation : `removed_at = NULL`, pas de nouvelle ligne).
9. L'admin peut révoquer un lien actif.

## Scénarios E2E à couvrir

- Alice (admin) génère un lien → Bob l'ouvre → il est membre, visible dans la
  liste des membres.
- Lien avec `max_uses=1` : Bob rejoint, Carol obtient « lien invalide ».
- Lien révoqué → « lien invalide ».
- Bob (membre simple) ne peut pas générer de lien ; Alice lui donne
  `can_invite` → il peut.
- Redirection login : ouvrir le lien déconnecté → login alice → retour sur
  l'écran de confirmation d'entrée.

## Notes techniques

- Migration Drizzle : `can_invite` sur `group_members` (db:generate).
- Token : `crypto.randomUUID()` ou nanoid, colonne unique existante.
- Incrément `uses_count` atomique (UPDATE ... RETURNING dans la transaction
  qui insère le membre, avec garde sur max_uses).
- Conserver l'URL d'invite dans un paramètre `redirectTo` du login.
