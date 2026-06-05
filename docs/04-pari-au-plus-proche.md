# 04 — Pari « au plus proche »

## Objectif

Un pari multi-joueurs où chacun propose une **estimation**, et celui dont
l'estimation est la plus proche de la valeur réelle gagne.

> Exemple : « Combien de buts dans le match de ce soir ? Mise : 5 points. »
> Chacun donne un nombre. Le résultat tombe → le plus proche rafle la mise.

## Fonctionnement retenu

- Le créateur écrit la **description** et fixe la **mise** pour participer
  (points/ardoise **ou gage**, voir [08](08-gages.md)).
- Chaque participant écrit son estimation (« ce qu'il pense le plus proche »).
- **La réponse libre est autorisée** : pas besoin que ce soit un nombre. À la
  résolution, **le jury choisit le(s) gagnant(s)** (voir [06](06-resolution-litiges-argent.md))
  plutôt qu'un calcul automatique de distance. Le jury peut désigner
  **plusieurs gagnants** qui se **partagent la mise** (ex æquo).
- **Case « cacher les réponses »** à la création (commune à tous les types) :
  si cochée, les estimations restent secrètes jusqu'à la clôture.
- **Deadline de participation optionnelle** (commune à tous les types) : sans
  deadline, le bouton « Soumettre au jury » est le seul déclencheur.

## Challenge / réflexions

- **Qui fixe la vérité ? Et quand ?** ⚠️ Point dur commun à tous les paris :
  qui saisit la valeur réelle ? Le créateur (conflit d'intérêt s'il participe) ?
  Un arbitre ? Voir [06](06-resolution-litiges-argent.md).
- **Estimations cachées jusqu'à la deadline** ⚠️ : si je vois l'estimation des
  autres avant de jouer, je triche (je me colle juste à côté du favori, ou je
  borne). **Les estimations doivent être secrètes** jusqu'à la clôture.
- **Deadline de participation** : il faut un moment où on ne peut plus miser
  (typiquement avant le début de l'événement).
- **Égalité** : deux personnes à la même distance ? Partage du pot ? Premier
  arrivé ? Personne ne gagne (cagnotte reportée) ?
- **Plus proche tout court, ou « sans dépasser »** (façon Juste Prix) ? À choisir.
- **Le créateur participe-t-il ?** S'il participe ET saisit le résultat,
  conflit d'intérêt majeur. Soit il ne participe pas, soit il ne résout pas.
- **Répartition du pot** : le gagnant prend tout ? Les 3 plus proches se
  partagent ? Définir la règle.
- **Valeur non numérique ?** « Le plus proche » suppose une distance donc un
  **nombre** (ou une date). Interdire le texte libre, sinon « le plus proche »
  n'a pas de sens mathématique.
- **Événement qui ne se résout jamais** : annulé/reporté → on rembourse les
  mises.

## Données minimales

- **Pari** : `id`, `groupe_id`, `créateur_id`, `description`, `mise`,
  `type=closest`, `deadline_participation`, `valeur_réelle` (à la résolution),
  `statut` (ouvert / clôturé / résolu / annulé).
- **Estimation** : `pari_id`, `user_id`, `valeur`, `date`.

## Points à trancher

- [ ] Qui saisit la valeur réelle ? (créateur / arbitre / consensus)
- [ ] Estimations secrètes jusqu'à la deadline ? (reco : oui)
- [ ] Règle d'égalité (partage / premier / report).
- [ ] « Plus proche » ou « plus proche sans dépasser » ?
- [ ] Le gagnant prend tout, ou répartition top-N ?
- [ ] Le créateur peut-il participer ?
