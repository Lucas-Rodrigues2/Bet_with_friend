# 01 — Comptes & authentification

## Objectif

Permettre à un utilisateur de créer un compte et de se connecter pour
retrouver ses groupes, ses paris et son historique.

## Fonctionnement retenu

- **Connexion Google** en 1 clic (priorité, friction minimale).
- Lien d'invitation **au niveau du pari** (pas seulement du groupe) : on peut
  **voir le pari avant de s'inscrire**.
- Profil : pseudo (affiché aux amis), avatar optionnel.

## ⚠️ « Pas besoin de se connecter » vs ardoise persistante

Tu veux idéalement zéro connexion. Mais l'**ardoise accumule des dettes dans le
temps et entre paris** → il faut une **identité persistante** pour savoir « qui
doit quoi ». Cookie effacé / autre appareil = identité perdue. Donc _zéro
connexion pour toujours_ et _ardoise fiable_ sont en tension. Solutions
possibles (détaillées dans la réponse de conception) :

- **A. Profil invité réclamable** _(recommandé)_ : on joue tout de suite via le
  lien (identité = cookie + pseudo), et on **rattache** son compte à Google plus
  tard pour consolider l'ardoise — l'historique est préservé.
- **B. Google one-tap au 1er pari** : voir = libre, **miser** (= argent en jeu) =
  1 tap Google. On ne demande l'identité qu'au moment où il y a de l'argent.
- **C. Le créateur tient l'ardoise** _(déconseillé)_ : les invités ne sont que
  des noms → pas d'auto-confirmation des dettes, litiges difficiles.

## Données minimales par utilisateur

- `id`, `email`, `pseudo`, `mot_de_passe_hashé`, `date_inscription`.

## Challenge / réflexions

- **Friction d'onboarding** : pour un truc « entre potes », chaque étape perd
  des gens. Un pote invité qui doit créer un compte email+mdp avant même de
  voir le pari va abandonner. Penser à :
  - connexion **Google / Apple** en 1 clic,
  - ou **lien magique** (magic link) par email, sans mot de passe.
- **Inviter d'abord, inscrire ensuite** : idéalement on clique sur le lien
  d'invitation, on voit le groupe, et on ne crée son compte qu'au moment de
  participer. L'inscription doit être _au milieu_ du parcours, pas un mur à
  l'entrée.
- **Pseudo unique ou pas ?** Dans un groupe, deux « Alex » prêtent à confusion.
  Unicité du pseudo _par groupe_ plutôt que global ?
- **Mineurs** : si un jour il y a de l'argent réel, l'âge devient une
  obligation légale (voir [00](00-vision.md)).

## Points à trancher

- [x] **DÉCIDÉ : Google OAuth + email/password public** — les deux méthodes
      sont proposées à tous les utilisateurs.
- [x] **DÉCIDÉ : oui, vérification d'email obligatoire** pour les comptes
      email/password (gérée par Supabase Auth).
- [x] **DÉCIDÉ : oui, réinitialisation de mot de passe** (flux Supabase Auth).
- [x] **DÉCIDÉ : profil invité réclamable (option A)** — on joue tout de suite
      via le lien (compte anonyme Supabase), et on rattache plus tard son
      compte Google ou email/password pour consolider l'ardoise.
