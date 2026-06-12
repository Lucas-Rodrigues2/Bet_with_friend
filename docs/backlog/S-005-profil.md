---
id: S-005
epic: E01 — Fondations & Auth
status: todo
depends_on: [S-002]
---

# S-005 — Profil : pseudo & avatar

## Contexte & objectif

Page de profil où l'utilisateur gère son pseudo (affiché partout dans l'app)
et son avatar (optionnel — docs/01).

## Décisions applicables

- `profiles.pseudo`, `profiles.avatar_url` (schéma existant).
- Avatar stocké dans Supabase Storage (bucket `avatars`, public en lecture).

## Critères d'acceptation

1. `/app/profile` affiche le pseudo actuel et l'avatar (ou initiales par défaut).
2. Modifier le pseudo (2–30 caractères, non vide) → sauvegardé, visible dans
   le header immédiatement.
3. Pseudo invalide (vide, trop long) → erreur de validation, pas de sauvegarde.
4. Upload d'une image (jpg/png/webp, < 2 Mo) → avatar remplacé partout.
5. Bouton « Supprimer l'avatar » → retour aux initiales.

## Scénarios E2E à couvrir

- Changer le pseudo d'alice → le header affiche le nouveau pseudo, et après
  rechargement aussi.
- Pseudo vide refusé avec message d'erreur.
- Upload d'un petit PNG de test (fixture dans `e2e/fixtures/`) → l'avatar
  s'affiche (l'`<img>` pointe vers le storage et charge).
- Non-régression : login + accueil.

## Notes techniques

- Form action `/app/profile/+page.server.ts` ; upload via le client Supabase
  **serveur** (service role en local) ou signed upload URL — rester cohérent
  avec « toute écriture passe par le serveur ».
- Créer le bucket `avatars` dans la config locale (seed ou
  `supabase/config.toml` storage) — penser à la policy de lecture publique.
