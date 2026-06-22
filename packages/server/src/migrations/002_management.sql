-- Newspaper archival: when archived, the owner can no longer publish. Only a
-- super-admin can lift it. The active flag remains the hide/visibility toggle.
ALTER TABLE newspapers
  ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE AFTER active

-- MC username change requests: at most one pending row per user (enforced in app
-- by checking for an existing pending request). Admin approves/rejects.
;
CREATE TABLE IF NOT EXISTS username_change_requests (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  requested_mc_username VARCHAR(16) COLLATE utf8mb4_bin NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  resolved_by BIGINT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4

-- Tracks the last time each user *added* a report, to enforce a 15s cross-item
-- cooldown between reports (un-reporting is exempt and does not update this).
;
ALTER TABLE users
  ADD COLUMN last_report_at DATETIME NULL AFTER last_seen_at
