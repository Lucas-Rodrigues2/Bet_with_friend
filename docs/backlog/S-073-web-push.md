---
id: S-073
epic: E07 — Notifications
status: todo
depends_on: [S-071]
---

# S-073 — Web push

## Contexte & objectif

Canal push navigateur (docs/00 décidé : « push web si autorisé ») : service
worker + Web Push API, opt-in explicite.

## Décisions applicables

- **Migration : table `push_subscriptions`** (`user_id`, `endpoint` unique,
  `keys` JSON, `created_at`).
- VAPID keys en env vars ; lib `web-push` côté serveur.
- Respecte `notification_preferences` (canal `push`).
- Un user peut avoir plusieurs abonnements (plusieurs navigateurs) ;
  abonnement expiré/invalide (410) → supprimé.

## Critères d'acceptation

1. Dans `/app/settings/notifications`, bouton « Activer les notifications
   push sur cet appareil » → permission navigateur → abonnement enregistré.
2. `notify()` envoie le push (titre, corps, lien profond) aux abonnements des
   destinataires dont la préférence push du type est activée.
3. Cliquer la notification système ouvre/focalise l'app sur la bonne page.
4. Désactivation possible (« cet appareil » → unsubscribe + suppression
   serveur).
5. Endpoint mort (410/404 du push service) → ligne supprimée, pas d'erreur
   visible.
6. La colonne « push » de la matrice de préférences devient pleinement
   active.

## Scénarios E2E à couvrir

Playwright + permissions : utiliser le contexte chromium avec
`--enable-features` / `context.grantPermissions(['notifications'])`.

- Bob active le push → ligne `push_subscriptions` créée (vérif via helper DB).
- Émission d'un événement → le serveur tente l'envoi sans erreur (en test,
  pointer vers un mock du push service OU vérifier l'appel via log/flag —
  documenter l'approche choisie ; le rendu de la notif système native n'est
  pas assertable par Playwright, l'assertion porte sur l'abonnement et
  l'absence d'erreur).
- Désabonnement → ligne supprimée.

## Notes techniques

- Service worker statique `static/sw.js` (events `push` + `notificationclick`).
- `src/lib/server/push.ts` : envoi best-effort post-transaction, même pattern
  que l'email.
- Générer les VAPID keys de dev dans `.env` (documenter dans CLAUDE.md à la
  story).
