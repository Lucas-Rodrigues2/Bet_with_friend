# 03 — Visibilité des paris

## Objectif

À la création d'un pari, le créateur choisit **qui peut le voir** parmi les
membres du groupe. Il peut **modifier cette liste à tout moment** (notamment
pour inclure les nouveaux arrivants).

## Fonctionnement retenu

- Sélection d'un sous-ensemble des membres du groupe = la « liste de visibilité ».
  **Les paris invisibles pour certains membres sont la base du site.**
- Seuls ces membres voient le pari et peuvent y participer.
- La liste est éditable, mais figée à la **deadline de participation**.
- Une **deadline de participation** (paramétrable) ferme les mises.
- **Spectateur** : un membre de la liste qui n'a **pas participé avant la
  deadline** devient spectateur — il voit le pari mais ne peut plus miser. Il le
  reste jusqu'à ce qu'il **retire le pari de sa liste**.

## Challenge / réflexions

C'est une bonne idée mais elle cache plusieurs pièges :

- **Le risque de triche par ajout tardif** ⚠️ : si je peux ajouter quelqu'un
  *après* que les participations sont faites — voire après que le résultat est
  connu — je peux faire « gagner » un pote. **Règle nécessaire** : on ne peut
  ajouter quelqu'un que tant que le pari est **ouvert** (avant la deadline de
  participation). Après, la liste se fige.
- **Voir ≠ participer** : faut-il distinguer « peut voir » et « peut
  miser » ? Des spectateurs qui suivent sans parier, c'est sympa socialement.
- **Le malaise social** : « pourquoi je n'étais pas dans le pari ? » Cacher des
  paris entre membres d'un même groupe peut créer des tensions. Est-ce vraiment
  voulu, ou est-ce que ça duplique le besoin de **sous-groupes**
  (voir [02](02-groupes-et-invitations.md)) ?
- **Retirer quelqu'un qui a déjà misé** : interdit, ou on lui rembourse sa
  mise ? À cadrer.
- **Cohérence avec les types de paris** : le pari oui/non
  (voir [05](05-pari-oui-non.md)) est déjà ciblé sur une personne précise. La
  visibilité « liste » s'applique surtout au pari « au plus proche »
  (voir [04](04-pari-au-plus-proche.md)) qui est multi-joueurs.

## Points à trancher

- [x] Modification de la liste figée à la deadline de participation.
- [x] Spectateur = membre n'ayant pas misé avant la deadline.
- [ ] Que faire de la mise d'un membre retiré de la liste **avant** la deadline ?
- [ ] Sans deadline (paris « libres »), la liste reste-t-elle modifiable
      jusqu'à la soumission au jury ?
