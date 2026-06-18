---
id: S-004
epic: E01 — Fondations & Auth
status: done
depends_on: [S-002, S-003]
---

# S-004 — Mode invité + réclamation de compte

## Contexte & objectif

Pattern « invité réclamable » (docs/01, option A retenue) : un ami qui clique
un lien d'invitation peut jouer immédiatement **sans créer de compte** (session
anonyme Supabase), puis rattacher plus tard un compte Google ou email/password
— son historique et son ardoise sont préservés.

## Décisions applicables

- Profil invité réclamable (docs/01, DÉCIDÉ).
- `profiles.is_anonymous` existe déjà au schéma.
- L'ardoise exige une identité persistante : l'app pousse régulièrement (mais
  sans bloquer) l'invité à réclamer son compte.

## Critères d'acceptation

1. Depuis un écran d'invitation (groupe ou pari), un visiteur peut choisir
   « Continuer en invité » : `signInAnonymously()` + choix d'un pseudo →
   `profiles` créé avec `is_anonymous = true`.
2. L'invité utilise l'app normalement (rejoindre un groupe, parier).
3. Un bandeau persistant « Compte invité — sécurise ton historique » est
   visible pour tout invité, menant à `/claim`.
4. Sur `/claim`, l'invité peut lier email/password (`updateUser`) ou Google
   (`linkIdentity`) : même `user.id`, donc historique/ardoise intacts ;
   `is_anonymous` passe à `false`.
5. Après réclamation, il se reconnecte avec sa nouvelle méthode et retrouve
   son pseudo et ses groupes.

## Scénarios E2E à couvrir

- « Continuer en invité » + pseudo → connecté, bandeau invité visible.
- L'invité rejoint un groupe via lien (réutilise les helpers de S-011 si
  disponible, sinon scénario réduit au login anonyme).
- Réclamation par email/password → reconnexion avec ces identifiants →
  même pseudo, bandeau disparu, `is_anonymous=false`.
- Non-régression : login classique inchangé.

## Notes techniques

- Activer `enable_anonymous_sign_ins` dans `supabase/config.toml`.
- `linkIdentity` (Google) non automatisable en E2E → couvert par le chemin
  email/password (`updateUser({ email, password })` + confirmation).
- Attention RLS : les policies doivent traiter un user anonyme comme un user
  normal (c'est le même `auth.uid()`).
