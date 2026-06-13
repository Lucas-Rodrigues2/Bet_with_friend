#!/usr/bin/env bash
# Provisionne le conteneur après sa création. Idempotent : relançable sans risque.
set -euo pipefail

echo "==> Dépendances npm"
npm install

echo "==> .env (depuis .env.test si absent)"
[ -f .env ] || cp .env.test .env

echo "==> Navigateurs Playwright + dépendances système"
npx playwright install --with-deps chromium

echo "==> Pré-fetch de la CLI Supabase"
npx --yes supabase --version || true

cat <<'EOF'

✅ Conteneur prêt.

Démarrer l'app manuellement :
  npx supabase start      # première fois : long (téléchargement des images)
  npm run db:reset        # seed (alice/bob/carol/dave @test.local / test-password-123)
  npm run dev             # http://localhost:5173

Lancer l'usine agentique :
  /story S-001            # une story
  /story wave             # vague parallèle (worktrees + stacks isolées)

L'hôte est protégé : ici tu peux activer le mode auto (bypass permissions)
sans craindre pour ta machine — au pire, tu reconstruis le conteneur.
EOF
