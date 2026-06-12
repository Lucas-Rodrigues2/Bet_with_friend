# 02 — Groupes & invitations

## Objectif

Un utilisateur crée un **groupe** et y invite ses amis via un **lien**.
Le groupe est le cercle social dans lequel vivent les paris.

## Fonctionnement souhaité

- N'importe quel utilisateur peut créer un groupe (il en devient l'admin).
- Le groupe a un nom (et éventuellement une description / image).
- Invitation via **lien partageable** (WhatsApp, SMS...).
- Un utilisateur peut appartenir à plusieurs groupes.

## Données minimales

- **Groupe** : `id`, `nom`, `créateur_id`, `date_création`.
- **Membre** : `groupe_id`, `user_id`, `rôle` (admin/membre), `date_arrivée`.
- **Invitation** : `groupe_id`, `token`, `date_expiration`, `usage_max`.

## Challenge / réflexions

- **Sécurité du lien** : un lien unique réutilisable peut fuiter (capture
  d'écran repartagée) et faire entrer des inconnus. Options :
  - lien **expirant** (ex. 7 jours),
  - lien à **usage limité** (N personnes max),
  - **validation par l'admin** avant l'entrée effective.
  - Au minimum : pouvoir **révoquer / régénérer** le lien.
- **Qui peut inviter ?** Seulement l'admin, ou tout membre ? Pour un groupe de
  potes, laisser tout le monde inviter est plus naturel — mais l'admin doit
  pouvoir reprendre la main.
- **Rôles** : faut-il vraiment un admin ? Utile pour : retirer un membre,
  supprimer le groupe, arbitrer un litige (voir [06](06-resolution-litiges-argent.md)).
- **Quitter / exclure** : que deviennent les paris en cours d'un membre qui
  part ou est exclu ? (mises engagées, paris non résolus...). À ne pas oublier.
- **Sous-groupes ?** Tu prévois déjà de choisir qui voit chaque pari
  (voir [03](03-visibilite-des-paris.md)). Attention à ne pas réinventer des
  sous-groupes de façon désordonnée.

## Points à trancher

- [x] **DÉCIDÉ : lien réutilisable** avec expiration et limite d'usages
      optionnelles (`expires_at`, `max_uses`), révocable par l'admin.
- [x] **DÉCIDÉ : entrée directe** — cliquer le lien = rejoindre, pas de
      validation admin.
- [x] **DÉCIDÉ : admin seul par défaut, droit délégable** — seul l'admin crée
      des liens, mais il peut accorder ce droit à des membres (flag
      `can_invite` sur `group_members`).
- [x] **DÉCIDÉ : soft-delete, les paris continuent** — un membre qui part ou
      est exclu (`removed_at`) ne voit plus le groupe, mais ses paris en cours
      vont à leur terme et l'ardoise est mise à jour normalement.
