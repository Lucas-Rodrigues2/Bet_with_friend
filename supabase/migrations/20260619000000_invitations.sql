-- Migration: S-011 — Invitations
-- Ajoute can_invite sur group_members et revoked_at sur group_invitations

ALTER TABLE "group_members" ADD COLUMN IF NOT EXISTS "can_invite" boolean NOT NULL DEFAULT false;
ALTER TABLE "group_invitations" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;

-- ─── RLS on group_invitations ─────────────────────────────────────────────────

ALTER TABLE "group_invitations" ENABLE ROW LEVEL SECURITY;

-- SELECT : membres actifs du groupe peuvent voir les invitations
CREATE POLICY "group_invitations_select_members"
  ON group_invitations
  FOR SELECT
  USING (is_group_member(group_id));

-- INSERT : admin ou membre avec can_invite peut créer une invitation
CREATE POLICY "group_invitations_insert"
  ON group_invitations
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND (
      EXISTS (
        SELECT 1 FROM group_members gm
        WHERE gm.group_id = group_invitations.group_id
          AND gm.user_id = auth.uid()
          AND gm.role = 'admin'
          AND gm.removed_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1 FROM group_members gm
        WHERE gm.group_id = group_invitations.group_id
          AND gm.user_id = auth.uid()
          AND gm.can_invite = true
          AND gm.removed_at IS NULL
      )
    )
  );

-- UPDATE : admin peut révoquer (mettre revoked_at) ; uses_count incrémenté côté serveur
CREATE POLICY "group_invitations_update_admin"
  ON group_invitations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_invitations.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
        AND gm.removed_at IS NULL
    )
  );
