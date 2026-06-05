# 08 — Gages (mise non monétaire)

## Objectif

À la création d'un pari, la **mise** peut être un **gage** plutôt que des
points / une ligne d'ardoise. Le perdant doit accomplir une action convenue
(« la tournée », « venir déguisé », « 20 pompes »...).

> Avantage majeur : un gage **n'est pas de l'argent** → ça contourne toute la
> question légale et l'ardoise (voir [00](00-vision.md) et [06](06-resolution-litiges-argent.md)).

## Fonctionnement retenu

- À la création, le créateur choisit le **type de mise** : **points/ardoise**
  ou **gage** (texte libre décrivant l'action).
- S'applique aux deux types de paris :
  - **Au plus proche** ([04](04-pari-au-plus-proche.md)) : le ou les perdants
    accomplissent le gage.
  - **Oui/non** ([05](05-pari-oui-non.md)) : le perdant du duel accomplit le gage.
- Le gage **se négocie** dans le oui/non, au même titre que la mise et la cote.
- Le pari n'est **clôturé** que quand le gage est marqué **accompli**
  (confirmation, voir ci-dessous) — pas seulement quand le gagnant est désigné.

## ⚠️ Challenges / points durs propres au gage

1. **Un gage n'est pas quantifiable** → impossible à mettre sur l'ardoise comme
   un nombre. Il faut un **statut séparé** : `gage_en_attente` → `gage_accompli`
   (ou `gage_non_tenu`). Ce n'est pas une dette en €, c'est une obligation à
   cocher.
2. **Qui confirme que le gage est fait ?** Le même **jury** ? Le gagnant ? Une
   **preuve** (photo / vidéo) uploadée ? → à trancher. Reco : le jury (ou le
   gagnant) valide, avec preuve optionnelle.
3. **Symétrie du duel** : en argent, chacun mise → c'est symétrique. Avec un
   gage, en général **seul le perdant agit**. Donc :
   - même gage quel que soit le perdant, **ou**
   - chaque camp propose **son propre gage** (« si je perds je fais X, si tu
     perds tu fais Y »). → à choisir.
4. **« Au plus proche » à plusieurs** : tous les perdants font le gage ? Seul le
   **dernier** (le plus loin) ? À définir, sinon 8 personnes font des pompes.
5. **Rien ne force un gage** : c'est de l'honneur pur. Prévoir au moins de
   **tracer** un gage non tenu (réputation, badge négatif, historique visible).
6. **Mélange argent + gage ?** Autoriser un pari moitié points moitié gage, ou
   **un seul type par pari** ? Reco : un seul type par pari (plus simple).

## Données minimales (impact)

- **Pari** : ajouter `type_mise` (points | gage) et, si gage,
  `gage_description` (+ `gage_perdant` / `gage_créateur` si gages asymétriques).
- **Suivi du gage** : `pari_id`, `débiteur_id`, `statut`
  (en_attente | accompli | non_tenu), `preuve_url` (optionnel),
  `confirmé_par`, `date`.

## Points à trancher

- [ ] Qui confirme l'accomplissement : jury, gagnant, ou preuve obligatoire ?
- [ ] Duel : gage unique, ou un gage différent par camp ?
- [ ] « Au plus proche » : tous les perdants, ou seulement le dernier ?
- [ ] Un seul type de mise par pari, ou mélange points + gage autorisé ?
- [ ] Comment tracer / sanctionner un gage non tenu ?
