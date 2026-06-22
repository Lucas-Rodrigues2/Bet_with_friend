-- Add per-camp forfeit fields to propositions and proposition_offers
-- Replaces the single forfeit_description field for yesno duels
-- (forfeit_description kept for backward compat but unused in yesno; new fields used instead)

ALTER TABLE "propositions" ADD COLUMN "forfeit_creator" text;--> statement-breakpoint
ALTER TABLE "propositions" ADD COLUMN "forfeit_target" text;--> statement-breakpoint
ALTER TABLE "proposition_offers" ADD COLUMN "forfeit_creator" text;--> statement-breakpoint
ALTER TABLE "proposition_offers" ADD COLUMN "forfeit_target" text;
