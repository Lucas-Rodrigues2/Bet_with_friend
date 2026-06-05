# 06 — Résolution, litiges & argent (le problème dur)

> Sujets **transversaux** à tous les types de paris. Ce sont eux qui font ou
> défont une appli de paris entre potes.

## A. Le jury (mécanisme de résolution retenu)

À la création d'un pari, le créateur définit un **jury** : une liste de
personnes chargées de déclarer le résultat.

- Le créateur choisit aussi le **mode de décision** : **unanimité** ou **majorité**.
- Tant que le pari n'est pas soumis, **le jury ne voit pas le pari**.
- Un bouton **« Soumettre au jury »** révèle le pari au jury et ouvre la phase
  de jugement.
- **N'importe quel joueur du pari peut cliquer « Soumettre » à tout moment.**
- S'il y a une **deadline** (optionnelle, voir §D), elle déclenche aussi
  automatiquement la soumission. Sans deadline, le bouton est le **seul**
  déclencheur.
- Pour les paris à **réponse libre**, c'est le jury qui choisit le gagnant
  (pas de calcul automatique).

### Règles du jury (retenues)

- **Un juré peut aussi être joueur** du pari. (Conflit d'intérêt assumé : c'est
  un jeu entre potes ; la composition du jury et la pression sociale régulent.)
- **Jury négociable pour le oui/non** : la cible négocie la **liste de jurés**
  en même temps que la mise et la cote (voir [05](05-pari-oui-non.md)). Les deux
  camps sont donc d'accord sur les juges.
- **Plusieurs gagnants possibles** : le jury peut désigner **plusieurs
  gagnants**, qui se **partagent la mise** (voir répartition ci-dessous).
- **« Pas encore résolu »** : si on soumet trop tôt, le jury peut renvoyer le
  pari en attente plutôt que d'être forcé de trancher.

### Annulation (filet retenu)

Chaque joueur a un bouton **« Annuler »**. **Si tous les joueurs cliquent
annuler, le pari disparaît** (mises remboursées sur l'ardoise). Sinon le pari
**reste indéfiniment** jusqu'à résolution par le jury.

> ⚠️ Conséquence à garder en tête : un pari dont le jury ne tranche pas **et**
> qu'un joueur refuse d'annuler reste en suspens **pour toujours** sur l'ardoise.
> Pas de bascule admin automatique. Voir « Points à trancher ».

### Répartition de la mise (plusieurs gagnants)

- Le **pot** = somme des mises de tous les participants.
- Plusieurs gagnants ne concernent que le **« au plus proche »** : ils se
  partagent le pot **à parts égales** (tout le monde paie la même mise).
- Le **oui/non** est un duel : **un seul gagnant possible**, jamais de partage.

### Jugement (retenu)

- **Non anonyme** : au moment de voter, le jury voit qui a répondu quoi.
- Dans l'**historique** du pari, les noms des participants restent affichés.

### Risque de pari « zombie » — **accepté**

Un pari jamais tranché par le jury et non annulé à l'unanimité reste affiché
indéfiniment. **Décision : on l'accepte** (pas de garde-fou admin, pas de
nombre impair imposé). L'utilisateur peut vivre avec des paris ouverts à l'infini.

## B. Litiges

- Statut **« contesté »** → bascule vers l'admin du groupe en dernier recours.
- **Historique immuable** (mises, cotes, négociations, votes du jury) pour arbitrer.
- **Délai de contestation** après le verdict avant que les gains soient définitifs.

## C. Argent — modèle « ardoise » (retenu)

L'appli **ne touche jamais l'argent**. Elle tient une **ardoise** : qui doit
combien à qui, en €. Le règlement se fait entre eux hors-appli (Lydia, PayPal,
espèces). Avantages : pas de licence jeu d'argent, pas de KYC, lançable vite.

Voir [01](01-comptes-et-authentification.md) pour la question d'**identité**
(une ardoise persistante exige une identité persistante) et
[07](07-idees-supplementaires.md) pour l'**ardoise nette** (simplification des
dettes façon Tricount).

## D. Cycle de vie d'un pari

```
brouillon → ouvert (participations possibles)
  │            │
  │            ├─ deadline de participation atteinte → clôturé
  │            └─ "Soumettre au jury" cliqué (par un joueur) ─┐
  │                                                            ▼
  └──────────────────────────────────► en jugement (jury décide)
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  ▼                        ▼                       ▼
            "pas encore résolu"        résolu                  contesté
            (retour en attente)   (gains → ardoise)        (→ admin)
                                                                  │
                                                            annulé (remboursé)
```

> Note : « deadline de participation » et « soumission au jury » sont deux
> choses distinctes. La première ferme les mises ; la seconde ouvre le jugement.
> Une soumission anticipée ferme aussi les mises en cours.

## E. Notifications

Invitation groupe/pari, nouvelle proposition, contre-offre (montant **et cote**),
pari proche de la clôture, pari soumis au jury, demande de vote au jury, verdict,
gains sur l'ardoise, litige ouvert.

## Points à trancher

- [x] Un juré peut jouer le pari : **oui**.
- [x] Jury d'un oui/non : **négocié** entre les deux camps.
- [x] Filet anti-blocage : **annulation unanime** (sinon pari persistant).
- [ ] Jugement anonymisé ou non.
- [ ] Répartition entre plusieurs gagnants (égale / prorata).
- [ ] Délai de contestation après verdict.
