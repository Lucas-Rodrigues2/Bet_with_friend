---
id: S-060
epic: E07 — Notifications
status: todo
depends_on: [S-041]
---

# S-060 — Notifications in-app (cloche)

## Contexte & objectif

Première brique de notification (docs/06 §E) : une cloche dans le header, un
panneau listant les événements qui concernent l'utilisateur, badge non-lu.

## Décisions applicables

- Table `notifications` existante (type texte + payload JSON + `read_at`).
- Événements MVP : invitation acceptée dans mon groupe, proposition reçue,
  contre-offre reçue, pari soumis au jury (pour les jurés), demande de vote,
  verdict rendu (participants), dette créée sur mon ardoise, gage à
  faire/à confirmer, litige ouvert (admin).
- Les canaux email/push viennent après (S-062/S-063) ; cette story pose
  l'**émission centralisée** des événements.

## Critères d'acceptation

1. Module serveur `src/lib/server/notifications.ts` : `notify(userIds, type,
payload)` appelé par les actions concernées (négociation, soumission,
   verdict, ledger, gages) — un point d'entrée unique pour les futurs canaux.
2. Header : cloche avec badge du nombre de non-lues.
3. Panneau : liste antéchronologique, libellé en français par type + lien
   profond vers la page concernée (pari, groupe, ardoise).
4. Cliquer une notification la marque lue et navigue ; « Tout marquer lu »
   disponible.
5. Realtime ou polling léger (30 s) : une nouvelle notification apparaît sans
   rechargement complet (au choix du dev, realtime Supabase préféré).

## Scénarios E2E à couvrir

- Alice défie Bob → Bob a une notification « Alice te défie » qui mène au
  duel.
- Verdict rendu → les deux joueurs ont la notification.
- Marquer lu : le badge décroît, l'état persiste après rechargement.
- Les notifications d'Alice ne fuient pas chez Carol.

## Notes techniques

- Brancher `notify()` dans les actions existantes (propositions, jury,
  resolution, ledger, forfeits) — petites retouches dans chaque module
  serveur, sans toucher leur logique.
- RLS sur `notifications` : `user_id = auth.uid()`.
- Types de notification : union TypeScript + mapping libellé/route dans
  `src/lib/notifications.ts` (partagé client).
