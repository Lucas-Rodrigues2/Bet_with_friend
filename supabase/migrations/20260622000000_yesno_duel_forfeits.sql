-- Add per-camp forfeit fields to propositions and proposition_offers (S-030)
-- "Un gage différent par camp possible" : forfeit_creator / forfeit_target
ALTER TABLE "propositions" ADD COLUMN IF NOT EXISTS "forfeit_creator" text;
ALTER TABLE "propositions" ADD COLUMN IF NOT EXISTS "forfeit_target" text;
ALTER TABLE "proposition_offers" ADD COLUMN IF NOT EXISTS "forfeit_creator" text;
ALTER TABLE "proposition_offers" ADD COLUMN IF NOT EXISTS "forfeit_target" text;
