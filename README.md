# Bet With Friend

Application web de paris entre amis, basée sur des points virtuels et des gages — jamais d'argent réel.

**En ligne : [bet-with-friends.fly.dev](https://bet-with-friends.fly.dev/)**

## Stack

- SvelteKit 2 et Svelte 5
- Supabase (PostgreSQL, authentification, Realtime et Storage)
- Drizzle ORM
- Tailwind CSS 4 et shadcn-svelte
- Playwright pour les tests E2E
- Déploiement Docker sur Fly.io

## Installation

```bash
npm install
cp .env.example .env
```

Renseigner ensuite les variables requises dans `.env`.

## Développement

```bash
npm run dev
```

Le serveur de développement est disponible par défaut sur `http://localhost:5173`.

## Vérifications

```bash
npm run check
npm run lint
npm run test:e2e
npm run build
```

## Base de données

```bash
npm run db:push       # synchroniser le schéma en développement
npm run db:generate   # générer une migration Drizzle
npm run db:migrate    # appliquer les migrations
npm run db:reset      # réinitialiser la base Supabase locale
```

Le schéma applicatif se trouve dans `src/lib/server/db/schema.ts`. Les migrations Supabase sont conservées dans `supabase/migrations/`.

## Déploiement

L'image de production est construite avec le `Dockerfile`. Le workflow `.github/workflows/deploy.yml` déploie la branche `master` sur Fly.io.
