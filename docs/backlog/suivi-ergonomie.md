# Suivi ergonomie / UX

Journal des constats d'ergonomie remontés par l'agent **story-qa** lors de la
validation des stories. Les constats **bloquants** sont corrigés immédiatement
(ils font FAIL → renvoi au dev), donc ils n'arrivent pas ici. Ce fichier
accumule les constats **majeur** / **mineur** d'une story qui a passé le
fonctionnel : ils ne bloquent pas la livraison mais restent à traiter.

L'orchestrateur `/story` ajoute une entrée ici à la clôture de chaque story
(à partir de la section « ERGONOMIE — à changer pour le dev » du QA RAPPORT).

Statuts : `à faire` · `fait` · `ignoré` (avec raison).

---

## S-050 — Ardoise (soldes, règlements) — 2026-06-27

- [mineur] `à faire` — Page ardoise, section détail d'une paire sans match : la ligne d'écriture répète le texte de l'en-tête ("Bob te doit 5.00 EUR" affiché deux fois). → N'afficher le détail que lorsque l'écriture a un lien vers un pari (`bet_link`), ou ajouter une date/libellé pour la différencier.
- [mineur] `à faire` — Page ardoise, format du solde nul : `+0.00 EUR` affiche un `+` trompeur quand le solde est exactement 0. → Afficher `0.00 EUR` sans signe lorsque `myNetBalance === 0`.
- [mineur] `à faire` — Page ardoise, mobile 390px : pas de séparateur visuel fort entre l'en-tête d'une paire et la liste des écritures individuelles. → Ajouter une légère marge ou un séparateur pour clarifier la hiérarchie.

---

## S-014 — Renommer / supprimer un groupe — 2026-06-26

- [mineur] `à faire` — Page /settings (lien "Paramètres" dans l'en-tête du groupe) : texte brut discret, peu discoverable pour l'admin. → Ajouter un bouton/icône engrenage avec `aria-label` ou style outline pour plus de visibilité.
- [mineur] `à faire` — Page /settings (section suppression) : le message "La suppression est irréversible" pourrait mentionner plus explicitement ce qui est conservé (paris, ardoise) avant le formulaire de confirmation. → Ajouter une phrase rassurante ex : "Les paris et l'ardoise sont conservés."
- [mineur] `à faire` — Champ nom (validation) : tooltip natif du navigateur pour < 2 caractères affiché en anglais (`Please lengthen this text…`). Partagé avec S-010 (textarea description). → Supprimer `minlength` HTML natif et laisser uniquement la validation Zod serveur, ou utiliser `setCustomValidity` pour un message FR.

---

## S-041 — Résolution & attribution des gains — 2026-06-24

- [majeur] `fait` — Page pari yesno résolu (badge de statut) : quand `matchStatus === 'resolved'` et `proposition.status === 'accepted'`, le badge affiche "Acceptée" (vert) au lieu de "Résolu" (bleu). La condition dans `+page.svelte` est `propIsAccepted && data.bet.matchStatus === 'judging'` — ne couvre pas le cas `resolved`. Aussi : la card "Duel accepté !" affiche "Le match est en cours (statut : Résolu)" — message contradictoire. → Étendre la condition à `judging || resolved` pour afficher `bet-status-badge` avec `matchStatusLabel`, et changer le texte de la card accepted en cas résolu (ex : "Duel terminé — résolu par le jury.").
- [mineur] `à faire` — Pseudo utilisateur absent dans le header mobile : seule l'initiale est visible, sans le nom complet. Comportement existant, hors périmètre S-041. → À traiter dans un ticket UI global.

---

## S-022 — Cycle de vie closest — 2026-06-23

- [mineur] `à faire` — Page pari en judging (placeholder vote jury) : le texte "Le vote du jury sera disponible prochainement (S-040)" contient la référence technique "S-040" qui ne doit pas apparaître aux utilisateurs finaux. → Reformuler en "Le vote du jury sera disponible prochainement." sans la référence à la story.
- [mineur] `à faire` — Section « À juger » (page groupe, vue juré) : la section n'a pas de titre `<h2>` ou label visible distinct ; seule la couleur amber/orange la distingue visuellement. → Ajouter un titre explicite "Paris à juger" ou un heading pour l'accessibilité (screen readers).

---

## S-030 — Créer un duel Oui/Non — 2026-06-22

- [mineur] `à faire` — Page duel `/bets/[betId]` (labels de camps) : le créateur voit "Alice (moi)" dans les champs `camp-a-player`/`camp-b-player`, mais il faut vérifier que la cible (Bob) voit "Alice" (sans "(moi)") — non testé dans cette story (S-031 implémente la vue cible). → Vérifier à S-031 que la logique `currentUserId` distingue bien le point de vue créateur vs cible dans l'affichage des camps.
- [mineur] `à faire` — Formulaire `/bets/new/yesno` (bouton "Proposer le duel") : aucun état de chargement visible pendant la soumission (`loading` en `$state` mais non utilisé pour désactiver le bouton ou afficher un spinner). → Ajouter `disabled={loading}` et un texte "Envoi en cours…" pour prévenir les double-soumissions.

---

## S-012 — Gestion des membres — 2026-06-19

- [mineur] `à faire` — Page membres (bouton "Quitter le groupe") : le bouton est `disabled` quand l'utilisateur est le dernier admin, mais sans `title` ou `aria-describedby` reliant le bouton au message explicatif (`last-admin-warning`). → Ajouter `title="Vous êtes le dernier admin — promouvez un autre membre d'abord"` ou `aria-describedby="last-admin-warning"` pour l'accessibilité clavier.
- [mineur] `à faire` — Page membres (mobile 390px) : les boutons "Promouvoir admin" et "Exclure" sont sur la même ligne que les infos du membre. Le `flex-wrap` évite le débordement, mais les cibles tactiles deviennent compactes (< 44px). → Placer les boutons d'action sur une ligne séparée en mobile (`sm:flex-row`, `flex-col` par défaut).
- [mineur] `à faire` — Confirmation d'exclusion inline : compact mais peu visible sur mobile. → Envisager une dialog modale pour cette action irréversible (meilleure visibilité et focus management).

---

## S-011 — Liens d'invitation — 2026-06-19

- [majeur] `fait` — Page groupe / section Membres : le toggle `can_invite` (« Ne peut pas inviter » / « Peut inviter ») agit immédiatement sans confirmation ni feedback visuel (toast) après le changement. → Ajouter un toast de confirmation après toggle réussi.
- [majeur] `fait` — Page groupe / section Invitations : après création d'un lien, la zone « Lien créé : » (portée par les form action data) disparaît après rechargement de page ; le lien reste visible dans la liste mais le feedback initial est fugace. → Envisager de stocker le token fraîchement créé dans un `$state` client pour persistance post-action.

---

## S-013 — Page groupe (dashboard) — 2026-06-19

- [mineur] `à faire` — Page groupe (bouton « Nouveau pari ») : menu déroulant custom sans attributs ARIA. Le bouton n'a pas `aria-expanded`/`aria-haspopup`, le conteneur n'a pas `role="menu"`, les liens n'ont pas `role="menuitem"`. → Ajouter ces attributs ou migrer vers le composant `DropdownMenu` de shadcn-svelte (bits-ui) qui gère nativement l'accessibilité.
- [mineur] `à faire` — Page groupe (fermeture du menu) : `svelte:window onclick` pour fermer le menu déroulant crée des timing issues en contexte headless Playwright (`stopPropagation` insuffisant). → Envisager `DropdownMenu` shadcn-svelte ou une directive `clickOutside` fiable.

---

## S-010 — Créer un groupe — 2026-06-18

- [mineur] `à faire` — `/app/groups/new` (Textarea description) : le composant utilise `<textarea>{value}</textarea>` sans `bind:value`. Playwright `fill()` ne soumet pas la valeur correctement (Svelte 5 SSR-hydrate la textarea différemment). → Remplacer par `<textarea bind:value={descriptionValue}>` avec un `$state` local.
- [mineur] `à faire` — `/app/groups/new` (Devise) : le `<select>` de devise est un élément HTML natif non stylisé par shadcn, incohérent avec les autres champs Input/Label. → Utiliser le composant shadcn `Select`.
- [mineur] `à faire` — `/app/groups/new` (Navigation) : la flèche "← Retour" est un caractère Unicode codé en dur, pas un composant icône (incohérence avec les conventions arrow/icon potentielles à venir).

---

<!-- Gabarit d'entrée (copier-coller, garder l'ordre antéchronologique) :

## S-0XX — <titre court> — <AAAA-MM-JJ>

- [majeur] `à faire` — <écran/élément> : <problème> → <changement attendu> (capture : ux-S-0XX-*.png)
- [mineur] `à faire` — <écran/élément> : <problème> → <changement attendu>

-->

## S-005 — Profil : pseudo & avatar — 2026-06-17

- [mineur] `à faire` — `/app/profile` (section Avatar) : l'input file natif affiche "Choose File / No file chosen" en anglais (texte navigateur non stylable en CSS pur). → Remplacer par un composant custom avec bouton "Choisir un fichier" stylé et affichage du nom du fichier sélectionné en-dessous, pour cohérence FR et meilleure UX mobile.
- [mineur] `à faire` — `/app/profile` (section Pseudo) : le label "Pseudo (2–30 caractères)" remplit un double rôle (label + hint). → Séparer en un label court "Pseudo" + un texte d'aide discret (`text-muted-foreground text-xs`) sous le champ pour plus de clarté.
- [mineur] `à faire` — Header mobile (< sm) : le pseudo est caché (`hidden sm:inline`), seul l'avatar/initiale est visible. Un utilisateur mobile ne voit pas son pseudo dans le header. → Afficher le pseudo même en mobile, tronqué si nécessaire (`truncate max-w-[80px]`).

## S-004 — Mode invité + réclamation de compte — 2026-06-17

- [majeur] `fait` — `/claim` (page de succès) : après réclamation email réussie, le `load()` de `/claim` redirige vers `/` car `is_anonymous` est désormais `false`, et la page de succès (`{#if f?.success}`) n'est jamais affichée. L'utilisateur ne voit pas l'instruction de vérifier sa boîte mail (email de confirmation). → Stocker l'état de succès en cookie de session ou ajouter un paramètre de query (`?claimed=1`) pour afficher le message sur `/` après la redirection, ou ne pas rediriger si `f?.success` est vrai (SvelteKit ne re-run le load() que si la page re-rend, donc un `{#if f?.success}` dans le composant suffirait si le redirect est conditionnel).
- [mineur] `à faire` — `/login` et `/signup` : aucun lien vers « Continuer en invité » (`/guest`). Un visiteur ne peut accéder à `/guest` que via URL directe ou lien d'invitation. → Ajouter un lien discret "Continuer en invité" sur `/login` et `/signup` (en bas de page, muted) pour rendre la fonctionnalité discoverable avant S-011 (liens d'invitation).
- [mineur] `à faire` — `/guest` et `/claim` : titres de page browser génériques ("Bet With Friend"). → Ajouter `<svelte:head><title>Continuer en invité — Bet With Friend</title></svelte:head>` dans `/guest/+page.svelte` et `<title>Sécurise ton compte — Bet With Friend</title>` dans `/claim/+page.svelte`.

## S-003 — Connexion Google OAuth — 2026-06-16

- [mineur] `à faire` — `/login` (bandeau erreur OAuth) : quand l'utilisateur annule la connexion Google, le message affiché contient le texte brut anglais de Google ("User denied access") dans "La connexion Google a échoué : User denied access". → Intercepter les valeurs connues (`access_denied`, `User denied access`) dans `+page.server.ts` ou `/auth/callback` et les remplacer par un message FR générique, ex : "Vous avez annulé la connexion Google."
