---
name: tracking
description: Instructions pour instrumenter le tracking PostHog (client + serveur) sur une story. Bootstrap de l'infra si nécessaire. Conventions d'events, vérification E2E. Utilisé automatiquement par l'agent story-dev quand il implémente une story.
---

# Tracking PostHog — instructions pour le dev

Tu ajoutes le tracking **en même temps** que la feature, pas après.

## Approche retenue (décidée)

**Client + serveur**, même `distinct_id` (= `user.id` Supabase) des deux côtés
pour que PostHog fusionne sur une seule personne. Vérification : **envoi réel**
vérifié plus tard par la QA via les helpers E2E.

## Convention de nommage

- `snake_case`
- Verbe au passé pour les faits métier (`bet_created`, `match_resolved`)
- Propriétés : ids pertinents (`group_id`, `bet_id`, `bet_type`)
- **Jamais de PII** (pas d'email, pas de nom)
- Cohérent avec les events déjà présents

## §1 — Bootstrap de l'infra (à faire UNE SEULE FOIS si absent)

Si `src/lib/server/analytics.ts` n'existe pas :

1. `npm install posthog-js posthog-node`.
2. **Client** — `src/lib/analytics/client.ts` :
   - `initAnalytics()` : init `posthog-js` côté navigateur **seulement** (garde
     `if (!browser) return`), avec `PUBLIC_POSTHOG_KEY` / `PUBLIC_POSTHOG_HOST`.
     Si la clé absente → no-op.
   - `identifyUser(userId)` : `posthog.identify(userId)` au login.
   - `track(event, properties?)` : wrapper de `posthog.capture`.
   - Init dans `src/routes/+layout.svelte` (`onMount`, browser-only).
3. **Serveur** — `src/lib/server/analytics.ts` :
   - Singleton `posthog-node` (clé = `POSTHOG_KEY` ?? `PUBLIC_POSTHOG_KEY`,
     host = `POSTHOG_HOST` ?? `PUBLIC_POSTHOG_HOST`), `flushAt: 1, flushInterval: 0`
     en non-prod pour envoi immédiat.
   - `captureServer({ distinctId, event, properties })` — appelé **après** le
     commit de la transaction Drizzle.
   - **Sink de test** : quand `ANALYTICS_TEST_SINK=db` (en test), `captureServer`
     insère AUSSI dans `analytics_events_test (id, distinct_id, event, properties
     jsonb, created_at)`. Ajoute cette table au schéma Drizzle + `npm run db:push`.
4. **Env** : `.env.test` (et `.env.example` si présent) :
   ```
   PUBLIC_POSTHOG_KEY=phc_test_dummy
   PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
   ANALYTICS_TEST_SINK=db
   ```
5. **Helper E2E** — crée `e2e/helpers/analytics.ts` si pas déjà fait :
   - `interceptPosthog(page)` : intercepte réseau posthog-js.
   - `readServerEvents(db, { event?, distinctId? })` : lit `analytics_events_test`.
   - `clearServerEvents(db)` : vide la table entre tests.

## §2 — Instrumenter la story courante

Identifie les events utiles de cette story :

- **Client** (UX/parcours) : ouverture formulaire, étape tunnel, navigation clé.
  Via `track(...)` dans les composants.
- **Serveur** (faits métier infalsifiables) : action réussie après commit DB.
  Via `captureServer(...)` dans la form action, après la transaction.

## §3 — Vérification basique

Avant de rendre la main, vérifie au moins que :
- Les imports sont corrects (pas d'erreur `npm run check`)
- Les events ne contiennent pas de PII
- Le helper `e2e/helpers/analytics.ts` existe (ou tu l'as créé au bootstrap)
- Le sink de test `ANALYTICS_TEST_SINK=db` est dans `.env.test`

Les tests E2E complets de tracking seront écrits et exécutés par la QA.

## Règles

- N'affaiblis jamais le comportement de la feature pour faire passer le tracking.
- Les events **serveur** sont la source de vérité métier (après commit DB).
- Les events **client** complètent l'UX.
- Pas de PII dans les propriétés.
