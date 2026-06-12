---
id: S-062
epic: E07 — Notifications
status: todo
depends_on: [S-061]
---

# S-062 — Notifications email

## Contexte & objectif

Canal email (docs/00 décidé) : envoyer un mail pour les événements activés
dans les préférences.

## Décisions applicables

- Provider : **Resend** (simple, tier gratuit) — à confirmer avec
  l'utilisateur au lancement de la story si un autre provider est préféré.
- En **local/test** : pas d'envoi réel — capture via Mailpit (inclus dans
  Supabase local, port 54324) ou un transport « fichier/console » testable.
- Respecte `notification_preferences` (canal `email`).
- Lien de désinscription rapide vers les settings dans chaque mail.

## Critères d'acceptation

1. `notify()` envoie aussi un email aux destinataires dont la préférence
   email du type est activée : sujet + corps français, lien profond vers la
   page concernée.
2. Templates minimaux par thème (proposition, verdict, gage, ardoise) —
   texte simple, pas de design complexe.
3. Échec d'envoi → loggé, n'empêche jamais l'action métier (envoi
   asynchrone/best-effort après la transaction).
4. En local, les mails sont capturés et consultables (Mailpit API) — pas
   d'envoi externe.
5. Footer : lien « gérer mes notifications ».

## Scénarios E2E à couvrir

- Alice défie Bob (préférence email activée par défaut) → l'API Mailpit
  contient un mail pour bob@test.local avec le lien du duel.
- Bob désactive l'email « proposition » → plus de mail au défi suivant
  (in-app continue).
- Une action métier réussit même si l'envoi échoue (provider coupé en test).

## Notes techniques

- Abstraction `src/lib/server/email.ts` : interface `sendEmail`, impl Resend
  (prod) + impl SMTP local (Mailpit écoute en SMTP sur l'instance Supabase
  locale) — switch par env var.
- L'envoi se fait **après** commit de la transaction métier (file simple :
  `setImmediate`/await détaché + try/catch loggé).
- La QA interroge Mailpit : `http://127.0.0.1:54324/api/v1/messages`.
