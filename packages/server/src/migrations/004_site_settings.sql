CREATE TABLE IF NOT EXISTS site_settings (
  `key` VARCHAR(64) NOT NULL PRIMARY KEY,
  `value` TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO site_settings (`key`, `value`) VALUES
  ('auto_approve_accounts', 'false'),
  ('auto_approve_username_changes', 'false'),
  ('auto_approve_newspapers', 'false');
