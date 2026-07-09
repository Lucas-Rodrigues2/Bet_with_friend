---
id: S-080
epic: E08 — Post-MVP
status: done
depends_on: [S-050, S-051, S-073]
---

# S-080 — App mobile PWA installable (sans store)

## Contexte & objectif

Rendre le site installable comme une app native sur mobile (iOS/Android)
**sans passer par les stores d'applications**, via une **PWA** (Progressive
Web App). Une fois installée, l'app apparaît comme une icône sur l'écran
d'accueil et s'ouvre en plein écran — mais c'est au final juste un lien vers
le site déployé.

Approche retenue : PWA (manifest + service worker + Web Push), en remplacement
de l'emballage Capacitor précédemment envisagé. La logique métier étant côté
serveur SvelteKit, l'app installée n'est qu'un shell pointant vers le site
hébergé — aucun build natif à maintenir, pas de store à publier.

## Décisions applicables

- **PWA** : `manifest.webmanifest` + `service worker` (SvelteKit `service-worker.ts`).
- Installation depuis le navigateur (Chrome/Edge/Android → « Ajouter à l'écran
  d'accueil » ; Safari iOS → « Sur l'écran d'accueil »).
- Push via **Web Push API** (VAPID), non FCM/APNs natifs. Tokens `PushSubscription`
  (endpoint + keys) stockés dans `push_subscriptions` (remplacer la sémantique
  `platform` par le endpoint Web Push).
- Pas de Capacitor, pas de build natif, pas de compte store developer.
- Responsive / safe areas déjà gérés côté UI web → réutilisés tels quels.

## Critères d'acceptation

1. `manifest.webmanifest` valide (nom, icônes 192/512, `display: standalone`,
   `theme_color`, `start_url`), référencé depuis `app.html`.
2. Service worker enregistré : offline fallback minimal (shell de l'app
   serviable sans réseau) et cache des assets statiques.
3. Lighthouse PWA → score installable (au moins le manifest + SW + HTTPS).
4. Installation réelle possible depuis Chrome Android et Safari iOS (icône
   sur l'écran d'accueil, ouverture fullscreen standalone).
5. Un **bouton « Installer l'app sur mon téléphone »** est présent sur le
   site (page d'accueil / menu) :
   - Détecte l'événement `beforeinstallprompt` (Android) pour proposer
     l'installation native en un clic quand disponible.
   - Sinon, affiche les instructions pas-à-pas selon le navigateur (Safari iOS
     « Partager → Sur l'écran d'accueil », Chrome Android « ⋮ → Ajouter à
     l'écran d'accueil ») avec captures/schémas.
6. Enregistrement d'une `PushSubscription` Web Push → notification reçue sur
   événement métier (peut être différé à une sous-story si trop lourd).
7. Safe areas / viewport mobile corrects sur les écrans principaux.

## Scénarios E2E à couvrir

⚠️ L'installation PWA réelle n'est pas automatisable dans la boucle QA
Playwright (pas d'émulateur). La QA de cette story se limite à :

- `npm run build` OK, `manifest.webmanifest` et SW servis correctement.
- Non-régression complète de la suite E2E.
- Vérification du bouton « Installer l'app » : présent, affiche les
  instructions attendues, et capture `beforeinstallprompt` quand il se déclenche.
- **Checklist manuelle** documentée dans la story au moment de l'implémentation
  (installation réelle sur un Android + un iOS).

## Notes techniques

- SvelteKit : `src/service-worker.ts` + `src/service-worker-companion.ts`,
  déclarer `/manifest.webmanifest` dans `app.html`.
- VAPID keys dans l'env ; utiliser `web-push` (npm) côté serveur pour envoyer.
- Icônes PWA : générer 192px et 512px (maskable) depuis le logo du projet.
- HTTPS obligatoire pour SW + Web Push → déjà le cas en prod.
- iOS Safari ne supporte pas `beforeinstallprompt` (instructions manuelles
  obligatoires) ni historiquement le push web (s'ouvre depuis iOS 16.4+ avec
  installation PWA — vérifier au moment de l'implémentation).
