#!/usr/bin/env bash
# Provisionne le conteneur après sa création. Idempotent : relançable sans risque.
set -euo pipefail

echo "==> CLI Claude Code (commande 'claude' dans le terminal)"
npm install -g @anthropic-ai/claude-code

echo "==> CLI opencode (commande 'opencode' dans le terminal)"
curl -fsSL https://opencode.ai/install | bash

echo "==> Dépendances npm"
npm install

echo "==> .env (depuis .env.test si absent)"
[ -f .env ] || cp .env.test .env

echo "==> Navigateurs Playwright + dépendances système"
npx playwright install --with-deps chromium

echo "==> Pré-fetch de la CLI Supabase"
npx --yes supabase --version || true

echo "==> Git : identité locale (pour les commits) + credentials hôte neutralisés"
# Le pipeline committe/merge/branch en local : il faut une identité.
git config --global user.name "Lucas-Rodrigues2"
git config --global user.email "lucas.rodrigues05v@gmail.com"
# Neutralise tout credential helper (une valeur vide réinitialise la liste,
# y compris un helper défini en config system par l'IDE) → aucun push HTTPS
# avec ton identité depuis le conteneur.
git config --global --unset-all credential.helper 2>/dev/null || true
git config --global credential.helper ""
git config --system --unset-all credential.helper 2>/dev/null || true

cat <<'EOF'

✅ Conteneur prêt.

Démarrer l'app manuellement :
  npx supabase start      # première fois : long (téléchargement des images)
  npm run db:reset        # seed (alice/bob/carol/dave @test.local / test-password-123)
  npm run dev             # http://localhost:5173

Lancer l'usine agentique :
  /maestro S-001            # une story
  /maestro wave             # vague parallèle (worktrees + stacks isolées)

L'hôte est protégé : ici tu peux activer le mode auto (bypass permissions)
sans craindre pour ta machine — au pire, tu reconstruis le conteneur.
EOF
