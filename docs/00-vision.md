# 00 — Vision globale

## Le concept

Une application web où des amis parient entre eux sur des événements
(résultats sportifs, vie perso, défis, prédictions...). Le but n'est pas le
gambling sérieux mais l'amusement entre potes : se vanner, garder un historique
de qui avait raison, et régler des mises symboliques.

## Parcours type

1. Je crée un compte et je me connecte.
2. Je crée un groupe « Les potes du foot » et j'invite mes amis par lien.
3. Je crée un pari, je choisis qui peut le voir dans le groupe.
4. Les amis participent (devinette ou accept/refus selon le type).
5. L'événement a lieu → le pari est **résolu** → les gains sont attribués.
6. On suit un classement / un historique de qui doit quoi à qui.

## ⚠️ LA question à trancher en premier : argent réel ou monnaie virtuelle ?

C'est la décision la plus structurante du projet. Elle change tout : le droit,
la technique, le risque.

- **Monnaie virtuelle / points** : pas de paiement, pas de régulation, on garde
  juste un score. Simple, légal partout, lançable vite. L'appli ne fait que
  *tenir les comptes*.
- **Argent réel** : dès qu'il y a une mise en argent réel sur un événement
  aléatoire, **c'est juridiquement du jeu d'argent** dans beaucoup de pays
  (licence ANJ en France, KYC, lutte anti-blanchiment, limite d'âge...).
  Encaisser l'argent des joueurs = activité ultra-régulée.

**Recommandation** : commencer en **points virtuels** (ou en « ardoise » : on
note qui doit combien, mais l'appli ne touche jamais à l'argent). On garde
l'expérience sociale sans le cauchemar légal. Voir [06](06-resolution-litiges-argent.md).

## Points à trancher

- [x] **DÉCIDÉ : points virtuels + ardoise de dettes** — l'appli tient les
      comptes (`ledger_entries` par groupe), elle ne touche **jamais** à
      l'argent réel.
- [x] **DÉCIDÉ : web d'abord, mobile ensuite** — SvelteKit web en MVP, puis
      app mobile via Capacitor (déjà configuré) en fin de backlog.
- [x] **DÉCIDÉ : in-app + email + web push** — chaque canal et chaque type de
      notification est **paramétrable dans les settings utilisateur**.
