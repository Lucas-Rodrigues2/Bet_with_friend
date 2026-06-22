-- Migration: S-020 — Pari au plus proche
-- Ajoute l'enum forfeit_scope et la colonne correspondante sur bets

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'forfeit_scope' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE "public"."forfeit_scope" AS ENUM('all_losers', 'last_one');
  END IF;
END$$;

ALTER TABLE "bets" ADD COLUMN IF NOT EXISTS "forfeit_scope" "forfeit_scope";
