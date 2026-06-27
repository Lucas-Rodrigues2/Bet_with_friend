-- Add claimed_at column to forfeits table (S-051)
-- Tracks when a debtor claimed they completed the forfeit (pending confirmation)
ALTER TABLE forfeits ADD COLUMN IF NOT EXISTS claimed_at timestamp with time zone;
