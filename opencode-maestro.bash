#!/usr/bin/env bash
# opencode-maestro : lance le skill /maestro en mode AUTO TOTAL (auto-approve
# de TOUTES les permissions) et relance automatiquement après une coupure/quota,
# en reprenant la session précédente.
#
#   ./opencode-maestro.bash                  # enchaîne tout le backlog (/maestro)
#   ./opencode-maestro.bash "/maestro S-010"  # cible une story précise
#
# ⚠️  --auto : opencode ET tous ses sous-agents (story-dev, story-qa,
#     story-security, story-tracker) exécutent commandes/éditions SANS aucune
#     confirmation. À n'utiliser QUE dans un environnement isolé/jetable
#     (le devcontainer de ce repo).
#
# Note : pas besoin d'envoyer « Entrée » en boucle — le flag --auto valide
# nativement chaque demande des agents en temps réel. C'est plus fiable qu'un
# polling à 2 min (qui raterait les demandes entre deux Entrées).

set -uo pipefail

POLL_INTERVAL="${OPENCODE_POLL_INTERVAL:-120}"  # délai entre tentatives après coupure (s)
PROMPT="${*:-/maestro}"                           # prompt initial (défaut : /maestro)
RESUME_NUDGE="Reprends l'enchaînement des stories du backlog là où tu t'es arrêté, sans t'arrêter."

echo "🚀 Lancement opencode --auto avec : $PROMPT"

# 1ᵉʛ passage : on envoie le prompt initial (lance le skill).
opencode run --auto "$PROMPT"
EXIT_CODE=$?

# Relances automatiques après coupure/quota, en reprenant la même session.
while [[ $EXIT_CODE -ne 0 ]]; do
	echo "⏳ Coupure/quota (code $EXIT_CODE). Reprise dans ${POLL_INTERVAL}s... (Ctrl+C pour quitter)"
	sleep "$POLL_INTERVAL" || break
	echo "🔁 Reprise de la session..."
	opencode run --auto --continue "$RESUME_NUDGE"
	EXIT_CODE=$?
done

echo "✅ Terminé : plus de story jouable dans le backlog (code $EXIT_CODE)."
