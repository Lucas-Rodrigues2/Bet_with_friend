#!/usr/bin/env bash
# claude-resume : lance la skill /maestro en mode AUTO TOTAL (bypass permissions)
# et relance automatiquement après un quota, en reprenant la conversation.
#
#   ./claude_resume.bash                 # enchaîne tout le backlog jouable (/maestro)
#   ./claude_resume.bash "/maestro S-010"  # cible une story précise
#
# ⚠️  --dangerously-skip-permissions : claude ET tous ses sous-agents (story-dev,
#     story-qa, story-security, story-tracker) exécutent commandes/éditions SANS
#     aucune confirmation. À n'utiliser QUE dans un environnement isolé/jetable
#     (le devcontainer de ce repo). Claude refuse ce flag s'il tourne en root —
#     le devcontainer tourne en utilisateur `node`, donc c'est OK.

POLL_INTERVAL="${CLAUDE_POLL_INTERVAL:-300}"   # délai entre tentatives (secondes)
PROMPT="${*:-/maestro}"                          # prompt initial (défaut : /maestro)
RESUME_NUDGE="Reprends l'enchaînement des stories du backlog là où tu t'es arrêté, sans t'arrêter."
started=0

while true; do

	if [[ $started -eq 0 ]]; then
		# Première tentative : on lance le skill.
		claude --dangerously-skip-permissions --verbose -p --continue "$RESUME_NUDGE"
		started=1
	else
		# Reprise après coupure/quota : on continue la conversation précédente.
		claude --dangerously-skip-permissions --verbose -p --continue "$RESUME_NUDGE"
	fi

	EXIT_CODE=$?

	if [[ $EXIT_CODE -eq 0 ]]; then
		echo "✅ Terminé : plus de story jouable dans le backlog."
		break
	fi

	echo "⏳ Coupure/quota (code $EXIT_CODE). Nouvelle tentative dans ${POLL_INTERVAL}s... (Ctrl+C pour quitter)"
	sleep "$POLL_INTERVAL" || break
done
