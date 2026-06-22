-- Add 'deleted' status so deleted accounts leave a tombstone row.
-- The row preserves the original id and discord_id (preventing id reuse and
-- allowing the same Discord account to re-register), but all personal data
-- is wiped. The UNIQUE constraint on discord_id means we UPDATE in-place
-- rather than INSERT a new row on re-registration.
ALTER TABLE users
  MODIFY COLUMN status ENUM('pending','approved','rejected','deleted') NOT NULL DEFAULT 'pending';
