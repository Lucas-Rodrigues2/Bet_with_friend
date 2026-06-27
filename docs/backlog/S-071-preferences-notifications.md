---
id: S-071
epic: E07 — Notifications
status: todo
depends_on: [S-070]
---

# S-071 — Préférences de notifications

## Contexte & objectif

Décision (docs/00) : **tout est paramétrable** — l'utilisateur choisit, par
type d'événement et par canal (in-app / email / push), ce qu'il reçoit.

## Décisions applicables

- **Migration : table `notification_preferences`**
  (`user_id`, `type`, `channel` enum `in_app|email|push`, `enabled`,
  PK user+type+channel) — défauts : tout activé en in-app, événements
  « importants » (proposition, verdict, gage) activés en email/push.
- S-072/S-073 consulteront ces préférences ; dès cette story, le canal
  in-app la respecte.

## Critères d'acceptation

1. Page `/app/settings/notifications` : matrice types × canaux (cases à
   cocher), regroupée par thème (Paris, Jury, Ardoise & gages, Groupe).
2. Les colonnes email/push sont visibles mais marquées « bientôt » tant que
   les canaux n'existent pas — l'état est néanmoins persisté.
3. Décocher un type en in-app → l'événement n'apparaît plus dans la cloche
   (pas d'insertion `notifications`, ou insertion filtrée — choisir et
   documenter : préférer **filtrer à l'émission**).
4. Les défauts s'appliquent sans ligne explicite (absence = défaut).
5. Sauvegarde instantanée (toast de confirmation), persiste après reload.

## Scénarios E2E à couvrir

- Bob désactive « contre-offre » in-app → Alice contre-propose → pas de
  nouvelle notification chez Bob ; il réactive → les suivantes arrivent.
- La matrice persiste après rechargement.
- Les préférences de Bob n'affectent pas Alice.

## Notes techniques

- `notify()` (S-070) devient le point d'application des préférences :
  résoudre les préférences des destinataires en une requête, filtrer par
  canal.
- Helper `getEffectivePrefs(userId)` avec les défauts codés dans
  `src/lib/server/notifications.ts`.
