-- Migration: open challenge mode (S-032)
-- Adds open-mode fixed terms to yesno_bets and a bet-level jurors table

-- Add open mode fixed terms to yesno_bets
ALTER TABLE "yesno_bets" ADD COLUMN IF NOT EXISTS "open_stake_creator" numeric(12,2);
ALTER TABLE "yesno_bets" ADD COLUMN IF NOT EXISTS "open_stake_opponent" numeric(12,2);
ALTER TABLE "yesno_bets" ADD COLUMN IF NOT EXISTS "open_forfeit_creator" text;
ALTER TABLE "yesno_bets" ADD COLUMN IF NOT EXISTS "open_forfeit_opponent" text;

-- Bet-level jurors table (for open mode yesno bets — jury fixed at creation)
CREATE TABLE IF NOT EXISTS "bet_jurors" (
  "bet_id" uuid NOT NULL REFERENCES "bets"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  PRIMARY KEY ("bet_id", "user_id")
);

-- RLS for bet_jurors: user can see jury rows for bets they can see
ALTER TABLE "bet_jurors" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bet_jurors_select_visible"
  ON "bet_jurors"
  FOR SELECT
  USING (can_see_bet(bet_id));
