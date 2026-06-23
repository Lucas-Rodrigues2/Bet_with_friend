-- Migration: extend can_see_bet() to include jurors of judging/resolved matches (S-022)
--
-- A juror who is NOT in the bet_visibility list still needs to see the bet
-- once the match reaches 'judging' or 'resolved' status.

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
  )
  OR EXISTS (
    SELECT 1
    FROM public.match_jurors mj
    JOIN public.matches m ON m.id = mj.match_id
    WHERE mj.user_id = auth.uid()
      AND m.bet_id = p_bet_id
      AND m.status IN ('judging', 'resolved')
  );
$$;
