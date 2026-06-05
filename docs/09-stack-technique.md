# 09 — Stack technique

## Décisions

- **Plateformes** : web **+** mobile installable sur les stores. Le mobile peut
  être une **webview** (UI web emballée) — pas besoin de widgets 100 % natifs.
- **Backend / base** : **Supabase** (PostgreSQL managé) — pas de backend Rust
  maison pour l'instant.
- **Front** : **Svelte** (préférence assumée ; pas de React).

## La stack

| Couche | Techno | Rôle |
|--------|--------|------|
| Langage | **TypeScript** | Un seul langage front web + mobile. |
| Web | **SvelteKit** (`adapter-static`, mode SPA) | App web. Le build SPA est réutilisé pour le mobile. |
| Mobile | **Capacitor** | Emballe le build SvelteKit → apps iOS/Android sur les stores. Accès caméra, push, etc. *(Alternative : Tauri 2.)* |
| UI | **Tailwind CSS** + **shadcn-svelte** (ou **Skeleton**) | Composants pros que l'on possède et personnalise. |
| DB / Auth / Realtime / Storage | **Supabase (PostgreSQL)** | Données relationnelles, Google OAuth, anonyme→Google, realtime, stockage des preuves de gage. |
| Accès données | **supabase-js** (types générés depuis le schéma) | Requêtes typées. *(Drizzle en option pour le complexe.)* |
| Validation | **Zod** | Schémas partagés (paris, négociation). |
| Push | **Capacitor Push** + FCM/APNs | Notifications natives (Supabase ne fait pas le push). |
| Hébergement | **Vercel / Cloudflare Pages** (web) + **Supabase** managé | Tiers gratuits pour démarrer. |

## Pourquoi ces choix collent au projet

- **PostgreSQL (relationnel)** : les données sont très liées
  (groupes↔membres↔paris↔jurys↔ardoise) et l'ardoise exige des **transactions**.
  Le relationnel est le bon outil, pas du NoSQL.
- **Supabase Auth** gère nativement le **pattern invité réclamable**
  (connexion anonyme → liaison Google) conçu en [01](01-comptes-et-authentification.md).
- **Supabase Realtime** couvre les moments interactifs : aller-retours de
  **négociation** (mise/cote/gage), **votes du jury** en direct, notifications.
- **SvelteKit + Capacitor** : un **seul code** Svelte sert le web et le mobile.

## ⚠️ Architecture : ne jamais faire confiance au client

Le client Svelte parle directement à Supabase. Toute la **logique sensible**
doit donc vivre **côté serveur**, jamais dans le front :

- **Row-Level Security (RLS)** Postgres → qui voit / modifie quoi. Idéal pour la
  **visibilité des paris** ([03](03-visibilite-des-paris.md)) : un membre hors
  liste ne doit même pas pouvoir lire le pari.
- **Edge Functions** (Deno/TS) ou **fonctions Postgres** → règles métier
  critiques : machine à états de **négociation** ([05](05-pari-oui-non.md)),
  dépouillement du **jury**, mise à jour de l'**ardoise**
  ([06](06-resolution-litiges-argent.md)), accomplissement des **gages**
  ([08](08-gages.md)).

Sinon un joueur pourrait trafiquer l'ardoise ou se déclarer gagnant côté client.

## Compromis assumés

- **Webview ≠ widgets natifs** : perfs/ressenti légèrement en deçà de Flutter,
  mais largement suffisants pour une app de formulaires, listes et realtime.
- **SPA** : pas de SSR/SEO. Acceptable car c'est une **app**, pas un site de
  contenu. Une page vitrine SEO pourra être ajoutée à part si besoin.

## Points à trancher (plus tard)

- [ ] Capacitor (sûr, mature) vs **Tauri 2** (plus léger, plus tendance) ?
- [ ] shadcn-svelte vs Skeleton pour l'UI.
- [ ] Logique métier en Edge Functions (TS) vs fonctions Postgres (SQL).
- [ ] supabase-js seul vs ajout de Drizzle.
