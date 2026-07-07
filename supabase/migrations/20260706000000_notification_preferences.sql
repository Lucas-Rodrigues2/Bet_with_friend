-- Migration: table notification_preferences + RLS
-- Stocke les préférences par utilisateur : (type d'événement × canal) -> enabled.
-- Seules les lignes explicites sont stockées ; l'absence de ligne applique le
-- défaut (tout activé en in-app ; événements « importants » activés en email/push).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notif_channel') THEN
    CREATE TYPE public.notif_channel AS ENUM ('in_app', 'email', 'push');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       text        NOT NULL,
  channel    notif_channel NOT NULL,
  enabled    boolean     NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_pk PRIMARY KEY (user_id, type, channel)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS : un utilisateur ne gère que ses propres préférences.
-- Les écritures applicatives passent par le service_role (côté serveur SvelteKit),
-- mais on autorise aussi l'écriture directe par l'utilisateur propriétaire pour
-- le filet de sécurité.
CREATE POLICY "notification_preferences_select_own"
  ON public.notification_preferences
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notification_preferences_insert_own"
  ON public.notification_preferences
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notification_preferences_update_own"
  ON public.notification_preferences
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notification_preferences_delete_own"
  ON public.notification_preferences
  FOR DELETE
  USING (user_id = auth.uid());
