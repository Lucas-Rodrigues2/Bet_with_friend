-- Migration: RLS pour les tables restantes sans politique de sécurité
-- Tables : profiles, ledger_entries, notifications, analytics_events_test

-- ─── profiles ─────────────────────────────────────────────────────────────────
-- Les pseudos et avatars sont des données non-sensibles nécessaires partout
-- dans l'UI (membres du groupe, participants d'un pari, etc.).
-- Politique : tout utilisateur authentifié peut lire tous les profils.
-- Les écritures passent par le service_role (trigger Supabase + actions serveur).

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_authenticated"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ─── ledger_entries ───────────────────────────────────────────────────────────
-- L'ardoise est visible par les membres actifs du groupe concerné.
-- Les écritures passent uniquement par le service_role (résolution de match).

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ledger_entries_select_group_members"
  ON public.ledger_entries
  FOR SELECT
  USING (is_group_member(group_id));

-- ─── notifications ────────────────────────────────────────────────────────────
-- Un utilisateur ne voit que ses propres notifications.
-- Les écritures passent uniquement par le service_role.

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
  ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid());

-- ─── analytics_events_test ────────────────────────────────────────────────────
-- Table de sink interne pour les tests E2E. Seul le service_role (côté serveur)
-- y écrit. Aucun accès client autorisé : RLS activé, aucune politique SELECT.

ALTER TABLE public.analytics_events_test ENABLE ROW LEVEL SECURITY;
