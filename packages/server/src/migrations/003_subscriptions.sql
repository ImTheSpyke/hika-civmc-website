-- Newspaper subscriptions: one row per (user, newspaper) pair.
CREATE TABLE IF NOT EXISTS newspaper_subscriptions (
  user_id BIGINT NOT NULL,
  newspaper_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, newspaper_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (newspaper_id) REFERENCES newspapers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
