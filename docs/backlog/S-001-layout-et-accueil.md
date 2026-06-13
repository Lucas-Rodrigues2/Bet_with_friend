---
id: S-001
epic: E01 — Fondations & Auth
status: done
depends_on: []
---

# S-001 — Layout, shadcn-svelte, page d'accueil

## Contexte & objectif

Première story : poser le socle UI sur lequel toutes les autres construisent.
Installer shadcn-svelte, créer le layout global (header, navigation, zone de
contenu, toasts) et une page d'accueil publique.

## Décisions applicables

- UI : Tailwind v4 + shadcn-svelte (docs/09).
- Textes UI en français.
- Mobile-first : l'app sera emballée par Capacitor plus tard — viser des
  layouts qui marchent en 375px de large.

## Critères d'acceptation

1. **Étant donné** un visiteur non connecté, **quand** il ouvre `/`,
   **alors** il voit une page d'accueil avec le nom de l'app, une accroche, et
   des boutons « Se connecter » / « Créer un compte » (liens vers `/login` et
   `/signup`, pages pour l'instant placeholder).
2. Le layout global affiche un header présent sur toutes les pages avec le
   logo/nom cliquable (retour à `/`).
3. shadcn-svelte est installé et au moins Button, Card, Input, Label, Sonner
   (toasts) sont disponibles dans `src/lib/components/ui/`.
4. `npm run check` et `npm run lint` passent.

## Scénarios E2E à couvrir

- `/` répond 200 et affiche le nom de l'app.
- Les boutons « Se connecter » et « Créer un compte » naviguent vers `/login`
  et `/signup`.
- Le header est visible et le logo ramène à `/`.

## Notes techniques

- `npx shadcn-svelte@latest init` puis `add button card input label sonner`.
- Layout dans `src/routes/+layout.svelte` (déjà existant, à enrichir),
  `<Toaster />` global.
- Pas d'auth réelle ici : `/login` et `/signup` sont des pages vides avec titre
  (S-002 les remplit).
