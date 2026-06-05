# 07 — Idées supplémentaires

Au-delà des deux types de paris prévus (« au plus proche » et « oui/non »),
voici des pistes pour enrichir le projet.

## Nouveaux types de paris

- **Choix multiple / pool** : prédire un résultat parmi N options (« qui gagne
  la Ligue 1 ? »). Plusieurs peuvent miser sur la même option → le pot se
  partage entre les gagnants. Généralise le oui/non à plus de 2 choix.
- **Over/Under (plus ou moins)** : variante simple du « au plus proche » — au
  lieu de deviner une valeur, on parie « au-dessus » ou « en dessous » d'un
  seuil fixé par le créateur.
- **Pari ouvert à tout le groupe** : au lieu d'un duel, une cagnotte commune où
  chacun mise sur une issue ; les gagnants se partagent le pot.
- **Défi / gage** : la mise n'est pas un montant mais un **gage** (« le perdant
  paie la tournée »). Plus fun, et ça évite la question de l'argent.

## Fonctionnalités sociales (souvent ce qui fait revenir les gens)

- **Classement / leaderboard** du groupe : qui gagne le plus, plus longue série,
  « roi des paris ».
- **Historique & stats perso** : taux de réussite, gains/pertes cumulés.
- **Fil d'activité** du groupe : « Marc a lancé un pari », « Léa a gagné 20 pts ».
- **Réactions / chambrage** : commentaires et emojis sur les paris (le sel du
  truc entre potes).
- **Badges** : « Nostradamus » (10 bons pronos d'affilée), « Flambeur », etc.

## Idées produit

- **Ardoise nette** : vue « qui doit combien à qui » avec simplification des
  dettes (comme Tricount/Splitwise) si tu vas vers le modèle ardoise.
- **Paris récurrents / templates** : recréer vite un pari hebdo (ex. score du
  match du week-end).
- **Mode spectateur** : suivre un pari sans miser (lien avec [03](03-visibilite-des-paris.md)).

## Pièges à éviter (résumé des challenges)

1. **Sous-estimer la résolution** : « qui déclare le gagnant » est plus dur que
   créer le pari. C'est le cœur du produit. → [06](06-resolution-litiges-argent.md)
2. **Argent réel trop tôt** : risque juridique majeur. Commencer en points. → [00](00-vision.md)
3. **Estimations visibles** dans le « au plus proche » = triche. Les cacher. → [04](04-pari-au-plus-proche.md)
4. **Ajout tardif dans la visibilité** = triche. Figer la liste à la clôture. → [03](03-visibilite-des-paris.md)
5. **« Proposer à plusieurs »** sans règle claire = engagement financier flou. → [05](05-pari-oui-non.md)
6. **Onboarding à friction** : un invité ne doit pas heurter un mur d'inscription. → [01](01-comptes-et-authentification.md)

## Ordre de construction suggéré (MVP → plus tard)

**MVP** : comptes → groupes+invitation → 1 seul type de pari (le oui/non, le
plus simple) en **points virtuels** → résolution par accord mutuel → historique.

**Ensuite** : pari « au plus proche », visibilité par liste, classement,
notifications, négociation des cotes, ardoise.
