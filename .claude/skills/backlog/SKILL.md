---
name: backlog
description: Affiche l'état du backlog des stories et propose la prochaine story jouable. Usage - /backlog
---

# /backlog — état du tableau de bord

1. Lis `docs/backlog/README.md` et le frontmatter (`status`, `depends_on`) de
   chaque fichier `docs/backlog/S-0XX-*.md`. Le frontmatter des stories fait
   foi ; si le README est désynchronisé, corrige-le.

2. Affiche un tableau compact par épic :

   | Story | Titre | Statut | Bloquée par |
   | ----- | ----- | ------ | ----------- |

   Statuts : `todo` · `in-progress` · `testing` · `done` (✅).
   « Bloquée par » = dépendances pas encore `done`.

3. Termine par :
   - **Prochaine story jouable** : la première `todo` dont toutes les
     dépendances sont `done` (en cas d'égalité, le plus petit ID).
   - Le décompte global : X done / Y total.
   - La commande à lancer : `/story S-0XX`.

Ne modifie rien d'autre que la resynchronisation éventuelle du README.
