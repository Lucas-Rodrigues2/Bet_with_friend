---
id: S-050
epic: E06 — Ardoise & gages
status: tracking
depends_on: [S-041]
---

# S-050 — Ardoise (soldes, règlements)

## Contexte & objectif

L'ardoise (docs/06 §C) : l'app tient les comptes (qui doit combien à qui, dans
la devise du groupe), le règlement se fait hors-app. Les écritures existent
déjà (créées par S-041) — cette story les rend visibles et réglables.

## Décisions applicables

- **Ardoise nette par groupe** (docs/07) : compensation des dettes croisées
  entre deux personnes (A doit 10 à B, B doit 4 à A → A doit 6 à B).
- Marquer une dette « réglée » (`ledger_entries.settled`) — par le
  **créancier** (c'est lui qu'on protège).
- Devise affichée = celle du groupe.

## Critères d'acceptation

1. Onglet « Ardoise » du groupe : pour le membre courant, son **solde net**
   global dans le groupe et le détail par personne (« Bob te doit 6 € », « Tu
   dois 3 € à Carol ») — calculé en nettant les `ledger_entries` non réglées.
2. Une vue « toutes les dettes du groupe » (paires nettes) visible par tous
   les membres.
3. Le créancier d'une paire peut « Marquer comme réglé » → les écritures de la
   paire sont `settled=true`, le solde repasse à 0 ; historique conservé
   (section « Réglées »).
4. Le débiteur ne peut pas marquer réglé (action refusée).
5. Chaque écriture référence son match (lien vers le pari d'origine).
6. Le solde affiché sur le dashboard groupe (placeholder S-013) devient réel.

## Scénarios E2E à couvrir

- Après le duel résolu de S-041 (Bob doit 5 à Alice) : l'ardoise des deux
  affiche la dette, avec lien vers le pari.
- Dettes croisées (2 paris en sens inverse, via helpers DB) → affichage net.
- Alice (créancière) marque réglé → solde 0, section réglées alimentée ; Bob
  ne pouvait pas le faire.

## Notes techniques

- Calcul de netting en SQL (GROUP BY paire ordonnée
  `least(debtor,creditor) || greatest(...)`) dans
  `src/lib/server/ledger.ts` — pas en JS sur toutes les lignes.
- « Marquer réglé » règle **la paire entière** (toutes les écritures non
  réglées entre les deux) — transaction + vérif créancier net.
