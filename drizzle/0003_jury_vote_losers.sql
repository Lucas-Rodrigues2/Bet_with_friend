-- Migration S-040: jury_vote_losers for closest bets with forfeit_scope='last_one'
CREATE TABLE IF NOT EXISTS "jury_vote_losers" (
	"vote_id" uuid NOT NULL REFERENCES "jury_votes"("id") ON DELETE CASCADE,
	"loser_user_id" uuid NOT NULL REFERENCES "profiles"("id"),
	CONSTRAINT "jury_vote_losers_vote_id_loser_user_id_pk" PRIMARY KEY("vote_id","loser_user_id")
);
