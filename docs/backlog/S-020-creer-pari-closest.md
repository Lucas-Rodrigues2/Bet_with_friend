---
id: S-020
epic: E03 — Pari au plus proche
status: todo
depends_on: [S-013]
---

# S-020 — Créer un pari « au plus proche »

## Contexte & objectif

Premier type de pari (docs/04) : le créateur pose une question, fixe la mise,
choisit qui peut voir/jouer et qui jugera.

## Décisions applicables

- **Liste de visibilité figée à la création, jamais modifiable** (docs/03).
- Mise : points OU gage (un seul type, contrainte `stake_type` au schéma).
- Gage closest : champ **`forfeit_scope`** (`all_losers` | `last_one`) choisi à
  la création → **migration : ajouter `forfeit_scope` à `bets`** (nullable,
  requis si `stake_type='forfeit'` et `type='closest'`).
- `hide_answers` coché par défaut.
- Deadline de participation **optionnelle**.
- Jury : liste de membres + mode (`unanimous` | `majority`) ; un juré peut
  aussi être joueur (docs/06).
- Le créateur peut participer.

## Critères d'acceptation

1. Formulaire `/app/groups/[id]/bets/new/closest` : titre (obligatoire),
   description, type de mise (points → montant > 0 ; gage → description du
   gage + scope tous/dernier), deadline optionnelle (datetime futur),
   `hide_answers` (coché par défaut), liste de visibilité (multi-select des
   membres actifs, créateur inclus d'office), jury (≥ 1 membre) + mode.
2. Soumission valide → `bets` + `yesno` non concerné + `bet_visibility`
   (figée) + un `match` en statut `open` avec ses `match_jurors` ; redirection
   vers la page du pari ; statut `open`.
3. La page du pari affiche : titre, mise, deadline, jury, qui peut voir,
   bouton « Participer » (S-021).
4. Validation : titre vide, montant ≤ 0, deadline passée, jury vide → erreurs.
5. Un membre **hors liste de visibilité** ne voit le pari ni dans la liste du
   groupe ni par URL directe (404).
6. Aucune UI ne permet de modifier la liste de visibilité après création.

## Scénarios E2E à couvrir

- Alice crée un closest (points, 10) visible par alice+bob+carol, jury=carol →
  le pari apparaît pour Alice et Bob, **pas pour Dave** (ni par URL).
- Création avec gage + scope « tous les perdants ».
- Deadline passée refusée ; jury vide refusé.
- La page du pari montre le jury et la mise.

## Notes techniques

- Migration Drizzle : `forfeit_scope` enum + colonne sur `bets`.
- Modèle (docs/10) : pour un closest, créer le `match` dès la création du bet
  (1 bet = 1 match), les participations vont dans `match_participants`.
- Étendre `src/lib/server/bets.ts` : la liste des paris du groupe filtre par
  `bet_visibility` (et la RLS double ce filtre).
- Réutiliser le guard de groupe posé en S-013.
