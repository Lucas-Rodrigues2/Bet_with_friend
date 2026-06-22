-- Migration: RLS for bet-related tables (S-020 security fix)
-- Tables: bets, bet_visibility, matches, match_jurors, match_participants,
--         yesno_bets, propositions, proposition_offers, proposition_jurors

-- ─── Helper function ─────────────────────────────────────────────────────────

-- Returns true if the current user can see the given bet (appears in bet_visibility)
CREATE OR REPLACE FUNCTION can_see_bet(p_bet_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bet_visibility bv
    WHERE bv.bet_id = p_bet_id
      AND bv.user_id = auth.uid()
  );
$$;

-- ─── bets ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;

-- SELECT : user must appear in bet_visibility for this bet
CREATE POLICY "bets_select_visible"
  ON public.bets
  FOR SELECT
  USING (can_see_bet(id));

-- No INSERT/UPDATE/DELETE policies for anon/authenticated — all writes go
-- through the SvelteKit server (service_role bypasses RLS).

-- ─── bet_visibility ───────────────────────────────────────────────────────────

ALTER TABLE public.bet_visibility ENABLE ROW LEVEL SECURITY;

-- SELECT : a user can only see their own visibility entries
CREATE POLICY "bet_visibility_select_own"
  ON public.bet_visibility
  FOR SELECT
  USING (user_id = auth.uid());

-- ─── matches ─────────────────────────────────────────────────────────────────

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- SELECT : accessible if the user can see the parent bet
CREATE POLICY "matches_select_visible"
  ON public.matches
  FOR SELECT
  USING (can_see_bet(bet_id));

-- ─── match_participants ───────────────────────────────────────────────────────

ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

-- SELECT : accessible if the user can see the parent bet (via match)
CREATE POLICY "match_participants_select_visible"
  ON public.match_participants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = match_participants.match_id
        AND can_see_bet(m.bet_id)
    )
  );

-- ─── match_jurors ─────────────────────────────────────────────────────────────

ALTER TABLE public.match_jurors ENABLE ROW LEVEL SECURITY;

-- SELECT : accessible if the user can see the parent bet (via match)
CREATE POLICY "match_jurors_select_visible"
  ON public.match_jurors
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = match_jurors.match_id
        AND can_see_bet(m.bet_id)
    )
  );

-- ─── yesno_bets ───────────────────────────────────────────────────────────────

ALTER TABLE public.yesno_bets ENABLE ROW LEVEL SECURITY;

-- SELECT : accessible if the user can see the parent bet
CREATE POLICY "yesno_bets_select_visible"
  ON public.yesno_bets
  FOR SELECT
  USING (can_see_bet(bet_id));

-- ─── propositions ─────────────────────────────────────────────────────────────

ALTER TABLE public.propositions ENABLE ROW LEVEL SECURITY;

-- SELECT : accessible if the user can see the parent bet
CREATE POLICY "propositions_select_visible"
  ON public.propositions
  FOR SELECT
  USING (can_see_bet(bet_id));

-- ─── proposition_offers ───────────────────────────────────────────────────────

ALTER TABLE public.proposition_offers ENABLE ROW LEVEL SECURITY;

-- SELECT : accessible if the user can see the parent bet (via proposition)
CREATE POLICY "proposition_offers_select_visible"
  ON public.proposition_offers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.propositions p
      WHERE p.id = proposition_offers.proposition_id
        AND can_see_bet(p.bet_id)
    )
  );

-- ─── proposition_jurors ───────────────────────────────────────────────────────

ALTER TABLE public.proposition_jurors ENABLE ROW LEVEL SECURITY;

-- SELECT : accessible if the user can see the parent bet (via proposition)
CREATE POLICY "proposition_jurors_select_visible"
  ON public.proposition_jurors
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.propositions p
      WHERE p.id = proposition_jurors.proposition_id
        AND can_see_bet(p.bet_id)
    )
  );

-- ─── Additional tables related to matches ────────────────────────────────────

ALTER TABLE public.jury_votes ENABLE ROW LEVEL SECURITY;

-- SELECT : accessible if the user can see the parent bet (via match)
CREATE POLICY "jury_votes_select_visible"
  ON public.jury_votes
  FOR SELECT
  USING (can_see_bet((SELECT bet_id FROM public.matches WHERE id = match_id)));

ALTER TABLE public.jury_vote_winners ENABLE ROW LEVEL SECURITY;

-- SELECT : accessible if the user can see the parent bet (via jury_vote -> match)
CREATE POLICY "jury_vote_winners_select_visible"
  ON public.jury_vote_winners
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.jury_votes jv
      JOIN public.matches m ON m.id = jv.match_id
      WHERE jv.id = jury_vote_winners.vote_id
        AND can_see_bet(m.bet_id)
    )
  );

ALTER TABLE public.match_cancellations ENABLE ROW LEVEL SECURITY;

-- SELECT : accessible if the user can see the parent bet (via match)
CREATE POLICY "match_cancellations_select_visible"
  ON public.match_cancellations
  FOR SELECT
  USING (can_see_bet((SELECT bet_id FROM public.matches WHERE id = match_id)));

ALTER TABLE public.match_winners ENABLE ROW LEVEL SECURITY;

-- SELECT : accessible if the user can see the parent bet (via match)
CREATE POLICY "match_winners_select_visible"
  ON public.match_winners
  FOR SELECT
  USING (can_see_bet((SELECT bet_id FROM public.matches WHERE id = match_id)));

ALTER TABLE public.forfeits ENABLE ROW LEVEL SECURITY;

-- SELECT : accessible if the user can see the parent bet (via match)
CREATE POLICY "forfeits_select_visible"
  ON public.forfeits
  FOR SELECT
  USING (can_see_bet((SELECT bet_id FROM public.matches WHERE id = match_id)));
