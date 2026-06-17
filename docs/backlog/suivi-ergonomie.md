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

<!-- Gabarit d'entrée (copier-coller, garder l'ordre antéchronologique) :

## S-0XX — <titre court> — <AAAA-MM-JJ>

- [majeur] `à faire` — <écran/élément> : <problème> → <changement attendu> (capture : ux-S-0XX-*.png)
- [mineur] `à faire` — <écran/élément> : <problème> → <changement attendu>

-->

## S-004 — Mode invité + réclamation de compte — 2026-06-17

- [majeur] `à faire` — `/claim` (page de succès) : après réclamation email réussie, le `load()` de `/claim` redirige vers `/` car `is_anonymous` est désormais `false`, et la page de succès (`{#if f?.success}`) n'est jamais affichée. L'utilisateur ne voit pas l'instruction de vérifier sa boîte mail (email de confirmation). → Stocker l'état de succès en cookie de session ou ajouter un paramètre de query (`?claimed=1`) pour afficher le message sur `/` après la redirection, ou ne pas rediriger si `f?.success` est vrai (SvelteKit ne re-run le load() que si la page re-rend, donc un `{#if f?.success}` dans le composant suffirait si le redirect est conditionnel).
- [mineur] `à faire` — `/login` et `/signup` : aucun lien vers « Continuer en invité » (`/guest`). Un visiteur ne peut accéder à `/guest` que via URL directe ou lien d'invitation. → Ajouter un lien discret "Continuer en invité" sur `/login` et `/signup` (en bas de page, muted) pour rendre la fonctionnalité discoverable avant S-011 (liens d'invitation).
- [mineur] `à faire` — `/guest` et `/claim` : titres de page browser génériques ("Bet With Friend"). → Ajouter `<svelte:head><title>Continuer en invité — Bet With Friend</title></svelte:head>` dans `/guest/+page.svelte` et `<title>Sécurise ton compte — Bet With Friend</title>` dans `/claim/+page.svelte`.

## S-003 — Connexion Google OAuth — 2026-06-16

- [mineur] `à faire` — `/login` (bandeau erreur OAuth) : quand l'utilisateur annule la connexion Google, le message affiché contient le texte brut anglais de Google ("User denied access") dans "La connexion Google a échoué : User denied access". → Intercepter les valeurs connues (`access_denied`, `User denied access`) dans `+page.server.ts` ou `/auth/callback` et les remplacer par un message FR générique, ex : "Vous avez annulé la connexion Google."
