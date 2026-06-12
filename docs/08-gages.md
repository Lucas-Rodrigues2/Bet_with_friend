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

- [x] **DÉCIDÉ : le(s) gagnant(s) confirment** — le perdant marque le gage
      « fait » (preuve photo/vidéo **optionnelle**), un gagnant confirme
      (`confirmed_by`).
- [x] **DÉCIDÉ : un gage différent par camp** — chaque camp négocie son gage
      (⇒ champs `forfeit_creator` / `forfeit_target` sur propositions/offres).
- [x] **DÉCIDÉ : au choix à la création** — le créateur choisit entre « tous
      les perdants » et « seulement le dernier » (⇒ champ `forfeit_scope`,
      enum `all_losers | last_one` ; si `last_one`, le jury désigne aussi le
      dernier).
- [x] **DÉCIDÉ : un seul type de mise par pari** (points OU gage), contrainte
      `stake_type` déjà au schéma.
- [x] **DÉCIDÉ : aucune sanction** — un gage non tenu reste simplement visible
      en statut `not_done` dans l'historique ; pas de mécanique punitive.
