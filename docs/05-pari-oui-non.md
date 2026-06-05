# 05 — Pari oui/non (négocié, 1 contre 1)

## Objectif

Un pari ciblé : le créateur défie un ou plusieurs membres. Le défié peut
accepter, refuser, ou **renégocier la mise ET la cote** — aller-retour possible
à l'infini jusqu'à acceptation ou annulation.

> Exemple : « Je parie que tu n'oses pas sauter dans le lac. » Cote 2:1 (je mets
> 20, tu mets 10). La cible répond : « OK mais 15/15 » → contre-offre...

## Fonctionnement retenu

- Le créateur définit : **description**, les **deux choix**, la **mise** et la
  **cote** (rapport entre sa mise et celle de l'adversaire).
- Il propose à **une ou plusieurs personnes** et fixe un **nombre max
  d'acceptations** : ce sont **les premiers qui acceptent** qui verrouillent,
  dans la limite de ce max.
- La cible peut envoyer une **contre-proposition** sur le montant, la cote
  **et/ou la liste de jurés**.
- Boucle de négociation jusqu'à **accepter** ou **annuler**.
- Résolution par le **jury** défini à la création (voir [06](06-resolution-litiges-argent.md)).

## ⚠️ Le conflit « multi-cibles » × « négociation »

Ces deux features se gênent :

- Si chaque cible peut **négocier sa propre cote**, alors « les N premiers qui
  acceptent » n'ont pas tous les mêmes conditions → ce ne sont pas N parts d'un
  même pari, mais **N paris 1v1 indépendants**, chacun à ses propres termes.
- Reco : trancher entre deux modes explicites à la création :
  - **Mode « duel »** : 1 seule cible, négociation libre (cote + montant).
  - **Mode « défi ouvert »** : plusieurs cibles, **termes fixes non
    négociables**, les N premiers qui acceptent prennent le pari tel quel.
- Mélanger négociation **et** multi-cibles dans un seul objet = ambiguïté au
  moment de payer. À éviter.

## Autres règles

- **Qui prend quel camp ?** Le créateur choisit son camp ; la cible hérite de
  l'autre. À confirmer à l'écran pour lever toute ambiguïté.
- **Expiration de la proposition** : une offre en attente expire (ex. 48 h).
- **Gel après acceptation** : description, choix, mises, cote figés.
- **Historique de négociation** conservé (qui a proposé quelle cote/montant).

## Données minimales

- **Pari** : `id`, `groupe_id`, `créateur_id`, `description`, `choix_a`,
  `choix_b`, `camp_créateur`, `type=yesno`, `mode` (duel/ouvert),
  `nb_max_acceptations`, `jury[]`, `mode_jury`, `statut`.
- **Proposition** : `pari_id`, `cible_id`, `mise_créateur`, `mise_cible`
  (= mise × cote), `dernier_proposant`, `statut` (en_négociation / acceptée /
  refusée / annulée / expirée), `date_expiration`.
- **Contre-offre** (historique) : `proposition_id`, `auteur_id`,
  `mise_proposée`, `cote_proposée`, `date`.

## Points à trancher

- [ ] Deux modes distincts (duel négociable / défi ouvert à termes fixes) ?
- [ ] Le créateur choisit son camp, ou la cible ?
- [ ] Durée d'expiration d'une proposition.
- [ ] Jury accepté par les deux camps (voir [06](06-resolution-litiges-argent.md)).
