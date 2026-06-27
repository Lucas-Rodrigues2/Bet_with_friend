---
id: S-080
epic: E08 — Post-MVP
status: todo
depends_on: [S-050, S-051, S-073]
---

# S-080 — App mobile Capacitor + push natif

## Contexte & objectif

Emballer l'app web dans Capacitor pour iOS/Android (docs/09) avec
notifications push natives (FCM/APNs).

## Décisions applicables

- Capacitor déjà configuré (`capacitor.config.ts`, appId
  `com.betwithfriend.app`).
- L'app mobile pointe vers le serveur SvelteKit hébergé (la logique métier
  est côté serveur → l'app est une webview du site déployé, ou build
  `server.url` Capacitor vers la prod).
- Push natif via `@capacitor/push-notifications`, tokens stockés dans
  `push_subscriptions` (étendre avec une colonne `platform`).

## Critères d'acceptation

1. `npx cap sync` + build Android débouchent sur une app qui se lance et
   affiche l'app connectée au serveur.
2. Login Google et email/password fonctionnent dans la webview (redirections
   OAuth configurées).
3. Enregistrement du token push natif → notifications reçues sur événement.
4. Safe areas / viewport mobile corrects sur les écrans principaux.

## Scénarios E2E à couvrir

⚠️ Hors périmètre Playwright (pas d'émulateur dans la boucle QA). La QA de
cette story se limite à : build web OK, non-régression complète de la suite
E2E, et une **checklist manuelle** documentée dans la story au moment de
l'implémentation.

## Notes techniques

- Décision d'architecture à confirmer au lancement de la story :
  `server.url` (webview du site) vs build statique embarqué + API distante.
  Avec la logique en SvelteKit server, `server.url` est le chemin court.
- FCM : projet Firebase, clés dans l'env ; APNs nécessite un compte Apple
  Developer (peut être différé — Android d'abord).
