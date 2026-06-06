# 10 — Modèle de données (PostgreSQL)

Schéma cible pour Supabase. Noms en **anglais / snake_case** (convention code).
Ce fichier transforme les `Données minimales` des autres docs en tables
cohérentes, et révèle les arbitrages restants.

## 💡 Concept clé : `bet` vs `match`

Tes deux types de paris ne se résolvent pas pareil, et ça crée une incohérence
si on n'y prend pas garde :

- **Au plus proche** : 1 pari = **1 résolution** commune (N participants, le
  jury désigne le/les gagnant(s)).
- **Oui/non** : 1 pari peut générer **plusieurs duels indépendants** (mode
  « défi ouvert » : les N premiers qui acceptent → N paris 1v1 séparés, chacun
  avec ses propres termes négociés et sa propre résolution).

Pour unifier proprement, on sépare :

- **`bet`** = la *définition* du pari (qui, quoi, type, mise, visibilité…).
- **`match`** = une *instance résolvable* (jury, votes, gagnants, ardoise).
  - Au plus proche → **1 match** par pari (créé automatiquement).
  - Oui/non → **1 match par adversaire** qui accepte.

Résultat : tout ce qui touche à la résolution (jury, votes, annulation,
gagnants, ardoise) s'accroche au **match**, jamais au `bet`. Plus aucune
asymétrie entre les deux types.

---

## Types énumérés

```sql
create type bet_type        as enum ('closest', 'yesno');
create type stake_type      as enum ('points', 'forfeit');
create type yesno_mode      as enum ('duel', 'open');
create type jury_mode       as enum ('unanimous', 'majority');
create type member_role     as enum ('admin', 'member');

create type bet_status      as enum ('draft', 'open', 'closed', 'cancelled');
create type match_status    as enum ('open', 'closed', 'judging',
                                     'resolved', 'contested', 'cancelled');
create type proposition_status as enum ('negotiating', 'accepted',
                                        'refused', 'cancelled', 'expired');
create type juror_verdict   as enum ('winners_selected', 'not_resolved');
create type forfeit_status  as enum ('pending', 'done', 'not_done');
```

---

## 1. Identité & groupes

```sql
-- Profil applicatif (auth.users est géré par Supabase Auth).
-- is_anonymous = invité pas encore lié à Google (pattern invité réclamable).
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  pseudo       text not null,
  avatar_url   text,
  is_anonymous boolean not null default false,
  created_at   timestamptz not null default now()
);

create table groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  image_url   text,
  currency    text not null default 'EUR',  -- une seule devise par groupe
  creator_id  uuid not null references profiles(id),
  created_at  timestamptz not null default now()
);

create table group_members (
  group_id   uuid not null references groups(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       member_role not null default 'member',
  joined_at  timestamptz not null default now(),
  -- Suppression DOUCE : un membre retiré garde sa ligne (removed_at non null).
  -- Tout son historique (paris, réponses, ardoise) est conservé. Il continue
  -- de voir l'ardoise du groupe, mais plus le contenu (paris) du groupe.
  removed_at timestamptz,
  primary key (group_id, user_id)
);

-- Lien d'invitation au groupe (révocable, expirable, à usage limité).
create table group_invitations (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  token      text not null unique,
  created_by uuid not null references profiles(id),
  expires_at timestamptz,
  max_uses   int,
  uses_count int not null default 0,
  created_at timestamptz not null default now()
);
```

---

## 2. Paris (définition)

```sql
create table bets (
  id                     uuid primary key default gen_random_uuid(),
  group_id               uuid not null references groups(id) on delete cascade,
  creator_id             uuid not null references profiles(id),
  type                   bet_type not null,
  title                  text not null,
  description            text,

  -- mise : points OU gage (un seul type par pari)
  stake_type             stake_type not null,
  stake_amount           numeric(12,2),   -- si stake_type = 'points'
  forfeit_description    text,            -- si stake_type = 'forfeit'

  -- communs
  hide_answers           boolean not null default false,
  participation_deadline timestamptz,     -- optionnelle
  jury_mode              jury_mode not null,

  status                 bet_status not null default 'open',
  created_at             timestamptz not null default now(),

  constraint stake_points_has_amount
    check (stake_type <> 'points' or stake_amount is not null),
  constraint stake_forfeit_has_desc
    check (stake_type <> 'forfeit' or forfeit_description is not null)
);

-- Extension 1:1 : champs PROPRES au oui/non.
-- (Le "au plus proche" n'a aucun champ en plus → pas de table dédiée.)
-- Avantage : zéro colonne nullable inutile, et `bets.id` reste la seule cible
-- des clés étrangères (matches, visibility, propositions...).
create table yesno_bets (
  bet_id          uuid primary key references bets(id) on delete cascade,
  choice_a        text not null,
  choice_b        text not null,
  creator_side    text not null,   -- 'a' ou 'b' : le camp du créateur
  mode            yesno_mode not null,   -- duel | open
  max_opponents   int,             -- mode 'open' : nb max d'adversaires
  accepted_count  int not null default 0 -- compteur atomique (verrouillage)
);

-- Liste de visibilité : qui peut VOIR/participer au pari (base RLS).
-- Au plus proche surtout ; un oui/non est de toute façon ciblé.
create table bet_visibility (
  bet_id  uuid not null references bets(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (bet_id, user_id)
);
```

> **Pourquoi une table d'extension plutôt que tout dans `bets`, ou deux tables
> totalement séparées ?**
> - *Tout dans `bets`* → plein de colonnes `null` pour le closest, intégrité faible.
> - *Deux tables séparées* (`closest_bets` / `yesno_bets`) → `matches`,
>   `bet_visibility`, `propositions` ne sauraient plus quelle table référencer
>   (clé étrangère **polymorphe**, ingérable).
> - *Extension 1:1* (retenu) → `bets` porte le commun et reste la cible unique
>   des FK ; `yesno_bets` ne contient que le spécifique. Le bon compromis.

---

## 3. Négociation (oui/non uniquement)

```sql
-- Une proposition = le pari proposé à UNE cible. Porte les termes négociés
-- courants. À l'acceptation, un `match` est créé.
create table propositions (
  id                  uuid primary key default gen_random_uuid(),
  bet_id              uuid not null references bets(id) on delete cascade,
  target_id           uuid not null references profiles(id),
  stake_creator       numeric(12,2),   -- mise du créateur
  stake_target        numeric(12,2),   -- mise de la cible (= mise × cote)
  forfeit_description text,             -- si gage négocié
  last_proposer_id    uuid not null references profiles(id),
  status              proposition_status not null default 'negotiating',
  expires_at          timestamptz,
  created_at          timestamptz not null default now(),
  unique (bet_id, target_id)
);

-- Historique immuable des contre-offres (mise + cote + gage proposés).
create table proposition_offers (
  id                  uuid primary key default gen_random_uuid(),
  proposition_id      uuid not null references propositions(id) on delete cascade,
  author_id           uuid not null references profiles(id),
  stake_creator       numeric(12,2),
  stake_target        numeric(12,2),
  forfeit_description text,
  created_at          timestamptz not null default now()
);

-- Jury négocié par proposition (les deux camps doivent l'accepter).
create table proposition_jurors (
  proposition_id uuid not null references propositions(id) on delete cascade,
  user_id        uuid not null references profiles(id),
  primary key (proposition_id, user_id)
);
```

---

## 4. Matchs (résolution) — commun aux deux types

```sql
create table matches (
  id          uuid primary key default gen_random_uuid(),
  bet_id      uuid not null references bets(id) on delete cascade,
  -- renseigné pour un oui/non (le duel issu d'une proposition acceptée)
  proposition_id uuid references propositions(id),
  status      match_status not null default 'open',
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Participants d'un match + leur réponse (closest) ou leur camp (yesno).
create table match_participants (
  match_id   uuid not null references matches(id) on delete cascade,
  user_id    uuid not null references profiles(id),
  answer     text,            -- closest : réponse libre (texte autorisé)
  side       text,            -- yesno : 'a' ou 'b'
  stake      numeric(12,2),   -- mise effective de ce participant
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

-- Jury du match (un juré PEUT être participant : choix assumé).
create table match_jurors (
  match_id uuid not null references matches(id) on delete cascade,
  user_id  uuid not null references profiles(id),
  primary key (match_id, user_id)
);

-- Vote d'un juré : soit il désigne des gagnants, soit "pas encore résolu".
create table jury_votes (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matches(id) on delete cascade,
  juror_id   uuid not null references profiles(id),
  verdict    juror_verdict not null,
  created_at timestamptz not null default now(),
  unique (match_id, juror_id)
);

-- Gagnants choisis par un juré (verdict = winners_selected).
create table jury_vote_winners (
  vote_id        uuid not null references jury_votes(id) on delete cascade,
  winner_user_id uuid not null references profiles(id),
  primary key (vote_id, winner_user_id)
);

-- Annulation : un bouton par joueur. Si TOUS les joueurs annulent → match annulé.
create table match_cancellations (
  match_id   uuid not null references matches(id) on delete cascade,
  user_id    uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

-- Gagnants finaux (après dépouillement selon jury_mode). Closest : partage égal.
create table match_winners (
  match_id uuid not null references matches(id) on delete cascade,
  user_id  uuid not null references profiles(id),
  share    numeric(12,2),   -- part du pot (points) ; null si gage
  primary key (match_id, user_id)
);
```

---

## 5. Ardoise & gages

```sql
-- Ardoise : une dette par résolution monétaire. Réglée hors-appli.
create table ledger_entries (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  match_id   uuid references matches(id) on delete set null,
  debtor_id  uuid not null references profiles(id),  -- doit
  creditor_id uuid not null references profiles(id), -- reçoit
  amount     numeric(12,2) not null,
  settled    boolean not null default false,         -- réglé entre eux
  created_at timestamptz not null default now()
);
-- "Ardoise nette" = vue qui somme/compense par paire (debtor, creditor).
-- (à matérialiser en VIEW : net par paire de membres d'un groupe.)

-- Suivi d'un gage (mise non monétaire) pour un match.
create table forfeits (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references matches(id) on delete cascade,
  debtor_id    uuid not null references profiles(id),  -- doit accomplir
  status       forfeit_status not null default 'pending',
  proof_url    text,                                   -- preuve optionnelle
  confirmed_by uuid references profiles(id),
  created_at   timestamptz not null default now()
);
```

---

## 6. Notifications (optionnel, transversal)

```sql
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       text not null,   -- invite, proposal, counter_offer, jury_request...
  payload    jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
```

---

## 7. Sécurité (RLS) — l'essentiel

Rappel ([09](09-stack-technique.md)) : **jamais confiance au client**. Points
RLS critiques :

- **`bets` / `matches` / `match_participants`** : lisibles **uniquement** par les
  users présents dans `bet_visibility` (+ créateur). C'est le cœur de la
  confidentialité des paris ([03](03-visibilite-des-paris.md)).
- **`match_participants.answer`** : si `bets.hide_answers`, ne pas exposer les
  réponses des autres tant que le match n'est pas `closed`.
- **`jury_votes`** : insertion réservée aux membres de `match_jurors`, et
  seulement une fois le match soumis (`status = 'judging'`).
- **`ledger_entries`** : lisible par `debtor_id` et `creditor_id` (et admin du
  groupe). Écriture **uniquement** par une Edge Function / fonction Postgres
  (jamais par le client).
- **Membre retiré** (`group_members.removed_at` non null) : il peut **encore
  lire `ledger_entries` de ce groupe** (il voit son ardoise), mais **plus**
  `bets` / `matches` / contenu du groupe. Son historique reste intact.
- Transitions de `status`, dépouillement du jury, création de `ledger_entries` →
  **fonctions serveur** atomiques, pas le front.

---

## Décisions (révélées par le schéma)

- [x] **Jury négocié (yesno)** : stocké sur `proposition_jurors`, **recopié dans
      `match_jurors` à l'acceptation** de la proposition.
- [x] **`max_opponents` dépassé** : empêché côté base par un **`UPDATE`
      conditionnel atomique** (`... where accepted_count < max_opponents`), dans
      une fonction serveur — jamais en « lire puis écrire » côté client.
- [x] **Ardoise** : compensée **par groupe** (chaque `ledger_entries.group_id`).
      Pas de compensation globale entre groupes.
- [x] **Devise** : **une seule par groupe** (`groups.currency`, défaut `EUR`).
- [x] **Suppression d'un membre** : **soft-delete** (`group_members.removed_at`).
      Tout l'historique du joueur est **conservé**. Il **voit encore l'ardoise**
      du groupe mais **plus le contenu** (paris, matchs). Cf. règle RLS §7.
- [x] **Réponses libres + `hide_answers`** : si la réponse closest est
      **numérique**, on garde la possibilité d'un **tri auto en option** (le jury
      ne sert alors que d'arbitre en cas de litige).
```
