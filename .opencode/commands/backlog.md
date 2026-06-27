---
description: Affiche l'état du backlog des stories et propose la prochaine story jouable.
---

Affiche l'état du backlog. Lis `docs/backlog/README.md` et le frontmatter
(`status`, `depends_on`) de chaque fichier `docs/backlog/S-0XX-*.md`.

Affiche un tableau compact par épic :

| Story | Titre | Statut | Bloquée par |
| ----- | ----- | ------ | ----------- |

Statuts : `todo` · `in-progress` · `testing` · `done` (✅).
« Bloquée par » = dépendances pas encore `done`.

Termine par :
- **Prochaine story jouable** : la première `todo` dont toutes les
  dépendances sont `done`.
- Le décompte global : X done / Y total.
