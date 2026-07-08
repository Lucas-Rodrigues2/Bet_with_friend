-- Migration: table push_subscriptions + RLS (S-073 — Web push)
-- Stocke les abonnements Web Push par utilisateur (un user peut en avoir
-- plusieurs : un par navigateur/appareil). L'endpoint est unique car un push
-- service ne délivre qu'un seul abonnement par endpoint.
-- RLS : un utilisateur ne gère que ses propres abonnements.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint   text        NOT NULL UNIQUE,
  keys       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS : un utilisateur ne voit/gère que ses propres abonnements push.
-- Les écritures applicatives passent par le service_role (côté serveur SvelteKit),
-- mais on autorise aussi l'accès direct par l'utilisateur propriétaire pour
-- le filet de sécurité.
CREATE POLICY "push_subscriptions_select_own"
  ON public.push_subscriptions
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "push_subscriptions_insert_own"
  ON public.push_subscriptions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_subscriptions_delete_own"
  ON public.push_subscriptions
  FOR DELETE
  USING (user_id = auth.uid());
