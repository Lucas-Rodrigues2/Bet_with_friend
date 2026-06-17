# Backlog — Bet With Friend

Tableau de bord des stories. Le statut de référence est le frontmatter de
chaque fichier story ; ce tableau doit rester synchronisé.

**Workflow** : `/story S-0XX` lance la boucle dev → QA Playwright → corrections
→ PASS. Une story n'est jouable que si toutes ses dépendances sont `done`.

**Statuts** : `todo` → `in-progress` (dev) → `testing` (QA + audit sécurité) →
`tracking` (instrumentation PostHog) → `done`.

## E01 — Fondations & Auth

| Story                                 | Titre                                  | Statut      | Dépend de    |
| ------------------------------------- | -------------------------------------- | ----------- | ------------ |
| [S-001](S-001-layout-et-accueil.md)   | Layout, shadcn-svelte, page d'accueil  | done        | —            |
| [S-002](S-002-auth-email-password.md) | Inscription / connexion email+password | done        | S-001        |
| [S-003](S-003-connexion-google.md)    | Connexion Google OAuth                 | done        | S-002        |
| [S-004](S-004-invite-reclamable.md)   | Mode invité + réclamation de compte    | tracking    | S-002, S-003 |
| [S-005](S-005-profil.md)              | Profil : pseudo, avatar                | todo        | S-002        |

## E02 — Groupes & invitations

| Story                          | Titre                                  | Statut | Dépend de |
| ------------------------------ | -------------------------------------- | ------ | --------- |
| [S-010](S-010-creer-groupe.md) | Créer un groupe                        | todo   | S-002     |
| [S-011](S-011-invitations.md)  | Liens d'invitation + droit délégable   | todo   | S-010     |
| [S-012](S-012-membres.md)      | Gestion des membres (rôles, exclusion) | todo   | S-011     |
| [S-013](S-013-page-groupe.md)  | Page groupe (dashboard)                | todo   | S-010     |

## E03 — Pari « au plus proche »

| Story                                  | Titre                                       | Statut | Dépend de |
| -------------------------------------- | ------------------------------------------- | ------ | --------- |
| [S-020](S-020-creer-pari-closest.md)   | Créer un pari closest                       | todo   | S-013     |
| [S-021](S-021-participer-closest.md)   | Participer (estimation cachée)              | todo   | S-020     |
| [S-022](S-022-cycle-de-vie-closest.md) | Cycle de vie : clôture & soumission au jury | todo   | S-021     |

## E04 — Pari Oui/Non

| Story                         | Titre                                   | Statut | Dépend de |
| ----------------------------- | --------------------------------------- | ------ | --------- |
| [S-030](S-030-creer-duel.md)  | Créer un duel (cible, camps, mise)      | todo   | S-013     |
| [S-031](S-031-negociation.md) | Négociation (contre-offres, gages, 48h) | todo   | S-030     |
| [S-032](S-032-defi-ouvert.md) | Défi ouvert (max_opponents)             | todo   | S-030     |

## E05 — Jury & résolution

| Story                                | Titre                              | Statut | Dépend de    |
| ------------------------------------ | ---------------------------------- | ------ | ------------ |
| [S-040](S-040-vote-jury.md)          | Vote du jury                       | todo   | S-022, S-031 |
| [S-041](S-041-resolution-gains.md)   | Résolution & attribution des gains | todo   | S-040        |
| [S-042](S-042-annulation-unanime.md) | Annulation unanime                 | todo   | S-022, S-031 |
| [S-043](S-043-litige-admin.md)       | Litige → admin du groupe           | todo   | S-040        |

## E06 — Ardoise & gages

| Story                     | Titre                                 | Statut | Dépend de |
| ------------------------- | ------------------------------------- | ------ | --------- |
| [S-050](S-050-ardoise.md) | Ardoise (soldes, règlements)          | todo   | S-041     |
| [S-051](S-051-gages.md)   | Gages (accomplissement, confirmation) | todo   | S-041     |

## E07 — Notifications

| Story                                       | Titre                         | Statut | Dépend de |
| ------------------------------------------- | ----------------------------- | ------ | --------- |
| [S-060](S-060-notifications-in-app.md)      | Notifications in-app (cloche) | todo   | S-041     |
| [S-061](S-061-preferences-notifications.md) | Préférences par canal/type    | todo   | S-060     |
| [S-062](S-062-notifications-email.md)       | Notifications email           | todo   | S-061     |
| [S-063](S-063-web-push.md)                  | Web push                      | todo   | S-061     |

## E08 — Post-MVP

| Story                              | Titre                             | Statut | Dépend de           |
| ---------------------------------- | --------------------------------- | ------ | ------------------- |
| [S-070](S-070-fil-activite.md)     | Fil d'activité du groupe          | todo   | S-041               |
| [S-071](S-071-leaderboard.md)      | Leaderboard & stats               | todo   | S-050               |
| [S-072](S-072-historique.md)       | Historique des paris              | todo   | S-041               |
| [S-080](S-080-mobile-capacitor.md) | App mobile Capacitor + push natif | todo   | S-050, S-051, S-063 |
