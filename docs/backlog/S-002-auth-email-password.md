---
id: S-002
epic: E01 — Fondations & Auth
status: testing
depends_on: [S-001]
---

# S-002 — Inscription / connexion email+password

## Contexte & objectif

Mettre en place l'authentification Supabase complète en email/password :
inscription, vérification d'email, connexion, déconnexion, réinitialisation de
mot de passe, et la session SSR côté SvelteKit. C'est la fondation de toutes
les stories suivantes (et des users de test E2E).

## Décisions applicables (docs/01)

- Google OAuth **+ email/password public** : les deux méthodes pour tous.
- Vérification d'email obligatoire (en local, Supabase Inbucket/Mailpit capture
  les mails ; en test E2E on peut seeder des users déjà confirmés).
- Réinitialisation de mot de passe via le flux Supabase.
- À l'inscription, une ligne `profiles` est créée (pseudo demandé au signup).

## Critères d'acceptation

1. **Inscription** : sur `/signup`, email + pseudo + mot de passe (min 8) →
   compte créé, message « vérifie tes emails », ligne `profiles` créée avec le
   pseudo.
2. **Connexion** : sur `/login`, email + mot de passe corrects → session
   ouverte, redirection vers `/` (état connecté : le header affiche le pseudo
   et un bouton « Déconnexion »). Identifiants faux → message d'erreur clair,
   pas de session.
3. **Déconnexion** : clic → session fermée, retour à l'accueil public.
4. **Reset** : sur `/forgot-password`, saisir son email → mail envoyé ; le lien
   mène à `/reset-password` où l'on choisit un nouveau mot de passe qui
   fonctionne ensuite au login.
5. **Protection** : les routes app (préfixe `/app` ou équivalent) redirigent
   vers `/login` si non connecté.
6. La session survit au rechargement de page (cookies SSR via `@supabase/ssr`).

## Scénarios E2E à couvrir

- Connexion réussie avec `alice@test.local` / mot de passe seedé → header
  affiche son pseudo.
- Connexion échouée (mauvais mot de passe) → message d'erreur, toujours sur `/login`.
- Inscription d'un nouvel utilisateur (email unique généré) → écran « vérifie
  tes emails ».
- Déconnexion → bouton « Se connecter » de retour.
- Accès à une route protégée sans session → redirection `/login`.

## Notes techniques

- `src/hooks.server.ts` : client Supabase server + `event.locals.session/user`
  (pattern officiel `@supabase/ssr`, le client existe déjà dans
  `src/lib/supabase.ts`).
- Form actions SvelteKit (`/login/+page.server.ts`, etc.), validation Zod.
- Trigger Postgres `on auth.users insert → profiles` OU création explicite du
  profil dans l'action signup (préférer l'action serveur, plus simple à
  maintenir : `db.insert(profiles)` après `signUp`, pseudo dans
  `options.data`).
- `app.d.ts` : typer `Locals` (session, user).
- Les users de test seedés (supabase/seed.sql) sont déjà email-confirmés.
