---
id: S-030
epic: E04 — Pari Oui/Non
status: todo
depends_on: [S-013]
---

# S-030 — Créer un duel Oui/Non

## Contexte & objectif

Le pari ciblé 1v1 (docs/05) : le créateur défie une personne avec deux choix,
une mise et une cote. Cette story crée le duel et la **proposition initiale** ;
la négociation complète arrive en S-031.

## Décisions applicables

- Mode `duel` : **une seule cible**, négociation libre.
- **Le créateur choisit son camp** (`creator_side`), la cible hérite de
  l'autre — confirmé à l'écran.
- Mise points (cote = rapport `stake_creator` / `stake_target`) OU gage.
- **Gage par camp** : « si je perds je fais X, si tu perds tu fais Y » →
  **migration : remplacer `forfeit_description` par `forfeit_creator` +
  `forfeit_target` sur `propositions` et `proposition_offers`** (et adapter
  `bets.forfeit_description` : pour un yesno, les gages vivent dans la
  proposition).
- Jury proposé à la création (négociable en S-031), mode unanimité/majorité.
- Expiration de la proposition : **48 h par défaut**, personnalisable.

## Critères d'acceptation

1. Formulaire `/app/groups/[id]/bets/new/yesno` (mode duel) : titre,
   description, choix A / choix B, mon camp (A|B), cible (un membre actif ≠
   créateur), mise (points : ma mise + sa mise ; gage : mon gage + son gage),
   jury + mode, expiration (défaut 48h).
2. Soumission → `bets(type=yesno, status=open)` + `yesno_bets(mode=duel)` +
   `propositions(status=negotiating, expires_at)` + `proposition_jurors` +
   `bet_visibility` = {créateur, cible} (figée).
3. La cible voit le duel dans son groupe avec badge « Proposition reçue » ;
   les autres membres ne le voient pas (visibilité = les 2 joueurs).
4. La page du duel montre : les 2 camps (qui est A, qui est B), les mises de
   chacun, les gages éventuels, le jury proposé, l'échéance de la proposition.
5. Validation : cible obligatoire, choix A ≠ choix B non vides, mises > 0 si
   points.

## Scénarios E2E à couvrir

- Alice défie Bob (« il pleuvra demain », A=Oui camp d'Alice, 10 vs 5) → Bob
  voit la proposition, Carol ne voit pas le pari.
- La page duel affiche camps/mises/échéance correctement.
- Validation : pas de cible → erreur.

## Notes techniques

- Migration Drizzle : `forfeit_creator`/`forfeit_target` (propositions +
  proposition_offers), suppression de l'ancien champ unique.
- Pas encore de `match` : il sera créé à l'acceptation (S-031). C'est le cœur
  du modèle bet/match (docs/10).
- Première `proposition_offers` insérée = l'offre initiale du créateur
  (l'historique commence à la création).
