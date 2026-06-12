---
id: S-003
epic: E01 — Fondations & Auth
status: todo
depends_on: [S-002]
---

# S-003 — Connexion Google OAuth

## Contexte & objectif

Ajouter la connexion Google en 1 clic (méthode privilégiée pour les vrais
utilisateurs, friction minimale — docs/01).

## Décisions applicables

- Google OAuth en plus d'email/password (S-002).
- À la première connexion Google, créer la ligne `profiles` (pseudo proposé
  depuis le nom Google, modifiable ensuite via S-005).

## Critères d'acceptation

1. `/login` et `/signup` affichent un bouton « Continuer avec Google » qui
   lance le flux OAuth Supabase (`signInWithOAuth`, redirect vers
   `/auth/callback`).
2. La route `/auth/callback` échange le code contre une session
   (`exchangeCodeForSession`) puis redirige vers l'app.
3. Première connexion Google → ligne `profiles` créée automatiquement.
4. Un retour OAuth en erreur (accès refusé) affiche un message propre sur
   `/login`, pas une page blanche.

## Scénarios E2E à couvrir

⚠️ Le vrai flux Google n'est **pas automatisable** (compte externe). La QA
couvre les bords automatisables :

- Le bouton « Continuer avec Google » est présent sur `/login` et `/signup` et
  pointe vers le flux OAuth (l'URL de redirection Supabase est appelée).
- `/auth/callback` sans code → redirection vers `/login` avec message d'erreur.
- Non-régression : la connexion email/password (S-002) fonctionne toujours.

Le test du flux complet reste **manuel** (à faire une fois sur le projet cloud).

## Notes techniques

- En local, configurer le provider Google dans `supabase/config.toml`
  (`[auth.external.google]`) — client id/secret factices suffisent pour
  afficher le bouton ; le flux complet n'est validé qu'en manuel.
- La création de profil à la 1re connexion peut vivre dans `/auth/callback`
  (upsert `profiles` si absent).
