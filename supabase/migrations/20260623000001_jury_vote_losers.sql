-- Migration S-040: jury_vote_losers for closest bets with forfeit_scope='last_one'
-- The juror designates who is the furthest from the correct answer.

CREATE TABLE IF NOT EXISTS "jury_vote_losers" (
	"vote_id" uuid NOT NULL REFERENCES "jury_votes"("id") ON DELETE CASCADE,
	"loser_user_id" uuid NOT NULL REFERENCES "profiles"("id"),
	CONSTRAINT "jury_vote_losers_vote_id_loser_user_id_pk" PRIMARY KEY("vote_id","loser_user_id")
);

-- RLS: readable by anyone who can see the related bet
ALTER TABLE "jury_vote_losers" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jury_vote_losers_select"
  ON "jury_vote_losers"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM jury_votes jv
      JOIN matches m ON m.id = jv.match_id
      WHERE jv.id = jury_vote_losers.vote_id
        AND can_see_bet(m.bet_id)
    )
  );
