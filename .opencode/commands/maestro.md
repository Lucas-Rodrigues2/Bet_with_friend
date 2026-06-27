---
description: Orchestre l'implémentation des stories du backlog, UNE par UNE, en enchaînant automatiquement la suivante. Usage : /maestro (tout le backlog) ou /maestro S-0XX (une seule).
---

Exécute le pipeline complet pour la/les stories du backlog.

Contexte :
- CLAUDE.md pour les conventions du projet
- La skill « story » chargée automatiquement pour les instructions de pipeline
- Les agents story-dev, story-qa, story-security, story-tracker disponibles en subagents GLM 5.2

Si $ARGUMENTS est vide : enchaîne toutes les stories jouables du backlog.
Si $ARGUMENTS est un ID (ex: S-012) : traite uniquement cette story.
