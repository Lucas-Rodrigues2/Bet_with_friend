# Devcontainer — usine agentique jetable

Faire tourner **toute** l'usine (agents, app, Supabase) dans un conteneur isolé,
pour pouvoir lancer le mode auto/bypass **sans risque pour l'hôte**. Au pire,
tu reconstruis le conteneur et tout repart propre.

## Pourquoi

Sans conteneur, seul Supabase est isolé ; les agents (éditions, `git`,
`npm install`, `rm`/`git clean`) s'exécutent sur ton Windows. Ici, tout
s'exécute **dans** le conteneur : ton système de fichiers hôte, ton dépôt git
local et tes secrets ne sont pas exposés aux commandes des agents.

Docker tourne en **Docker-in-Docker** : un démon Docker dédié vit dans le
conteneur, et la CLI Supabase y lance ses stacks. Rien n'atterrit sur le Docker
de l'hôte.

## Portée d'accès aux fichiers (ce qui est monté)

Le conteneur ne voit **que ce dossier projet**, monté à
`/workspaces/Project_bet_with_friend`. C'est rendu explicite dans
`devcontainer.json` via `workspaceMount` + `workspaceFolder`. Il n'y a
**aucune** autre entrée `mounts` → aucun autre dossier de l'hôte (`C:\Users\…`,
tes autres repos) n'est accessible aux agents.

Vérifier depuis le conteneur :

```bash
pwd                 # /workspaces/Project_bet_with_friend
ls /workspaces      # uniquement ce projet
cat /proc/mounts | grep workspaces   # le seul bind-mount hôte
```

Si un jour tu veux partager un autre dossier, il faudrait l'ajouter
**volontairement** dans `mounts` — tant que ce n'est pas fait, c'est cloisonné.

## Prérequis (hôte)

- Docker Desktop (WSL2) en marche.
- Extension VS Code **Dev Containers**.
- Ressources Docker Desktop généreuses (Settings → Resources) : la vague
  parallèle peut lancer jusqu'à 3 stacks Supabase. Vise ≥ 8 Go de RAM ;
  garde **MAX_PARALLEL=2** tant qu'une vague n'a pas tourné proprement.

## Démarrer

1. VS Code → palette → **Dev Containers: Reopen in Container**.
2. Attendre la fin de `postCreate.sh` (npm install + navigateurs Playwright +
   pré-fetch CLI Supabase). La première fois est longue.
3. Dans le terminal du conteneur :
   ```bash
   npx supabase start && npm run db:reset && npm run dev
   ```

## Mode auto sans crainte

Une fois dans le conteneur, tu peux lancer Claude Code en bypass permissions :
les commandes destructives de l'usine (`git clean`, `git worktree remove`,
`git branch -D`, `npm install`…) restent confinées au conteneur.

> Ce qui n'est **pas** protégé par le conteneur : les pushes git vers le remote
> et les appels réseau sortants (un agent peut toujours pousser/exfiltrer s'il
> a les identifiants). Ne monte des credentials git/registry dans le conteneur
> que si tu en as besoin.

## Reconstruire à neuf

Palette → **Dev Containers: Rebuild Container**. Les stacks Supabase (DinD) et
`node_modules` du conteneur sont jetés et reprovisionnés.
