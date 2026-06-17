-- Migration: RLS for groups and group_members tables
-- S-010: Créer un groupe

-- ─── Helper function ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_group_member(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM group_members
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
      AND removed_at IS NULL
  );
$$;

-- ─── RLS on groups ──────────────────────────────────────────────────────────────

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- SELECT : user must be an active member
CREATE POLICY "groups_select_members"
  ON groups
  FOR SELECT
  USING (is_group_member(id));

-- INSERT : any authenticated user can create a group (they become admin right after)
CREATE POLICY "groups_insert_authenticated"
  ON groups
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = creator_id);

-- UPDATE : only admins can update their group
CREATE POLICY "groups_update_admin"
  ON groups
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM group_members
      WHERE group_id = groups.id
        AND user_id = auth.uid()
        AND role = 'admin'
        AND removed_at IS NULL
    )
  );

-- ─── RLS on group_members ────────────────────────────────────────────────────────

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- SELECT : user must be an active member of the group
CREATE POLICY "group_members_select_members"
  ON group_members
  FOR SELECT
  USING (is_group_member(group_id));

-- INSERT : admins can add members; creator can add themselves (bootstrap)
CREATE POLICY "group_members_insert"
  ON group_members
  FOR INSERT
  WITH CHECK (
    -- Allow inserting self as admin when creating a group (bootstrap)
    auth.uid() = user_id
    OR
    -- Allow admins to add other members
    EXISTS (
      SELECT 1
      FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
        AND gm.removed_at IS NULL
    )
  );

-- UPDATE : admins can update membership (e.g., remove members, change roles)
CREATE POLICY "group_members_update_admin"
  ON group_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
        AND gm.removed_at IS NULL
    )
  );
