# 01 — Data Model (MariaDB)

Schema is created by ordered `.sql` files in `packages/server/src/migrations/`,
applied at boot. Charset `utf8mb4`. Times stored UTC (`DATETIME` or `TIMESTAMP`).

## Design notes that drive the schema

- **`mc_username` is the stable identity for notes/tags.** A note may target a username
  that has no account yet; if a user later registers (or is deleted), the note still
  resolves by username. See [feature-player-notes.md](./feature-player-notes.md).
- Minecraft usernames are **case-sensitive** here by product decision: store as-is and
  compare with a binary/`utf8mb4_bin` collation on that column.
- Public content uses a soft-hide flag `active` for the moderation flow
  (see [05-moderation.md](./05-moderation.md)).

## Tables

### `users`
| column | type | notes |
|--------|------|-------|
| id | BIGINT PK AI | |
| discord_id | VARCHAR(32) UNIQUE | from OAuth |
| discord_username | VARCHAR(64) | searchable |
| discord_display_name | VARCHAR(64) | searchable |
| mc_username | VARCHAR(16) `utf8mb4_bin` NULL | searchable, case-sensitive |
| mc_verified | BOOLEAN default false | verified badge |
| status | ENUM('pending','approved','rejected') default 'pending' | gates access |
| is_admin | BOOLEAN default false | **super-admin flag** |
| public_faction_tag | VARCHAR(40) NULL | the one public self-tag |
| created_at / last_seen_at | DATETIME | last_seen_at powers active-user stats |

> Searching for players queries `discord_username`, `discord_display_name`, `mc_username`
> among `status='approved'` rows only.

### `sessions`
Server-side session store (or signed cookie + this table for revocation).
`id` (token), `user_id`, `created_at`, `expires_at`.

### `global_notes`
One row per user. `user_id` UNIQUE FK, `body` TEXT (<=5000 chars enforced in app),
`updated_at`. See [feature-global-notes.md](./feature-global-notes.md).

### `player_notes`
| column | type | notes |
|--------|------|-------|
| id | BIGINT PK AI | |
| author_id | BIGINT FK users | the note owner (private) |
| target_mc_username | VARCHAR(16) `utf8mb4_bin` | **stable key** |
| target_user_id | BIGINT FK users NULL | resolved link, nullable |
| body | TEXT | |
| updated_at | DATETIME | |
| | | UNIQUE(author_id, target_mc_username) |

### `tags`
| column | type | notes |
|--------|------|-------|
| id | BIGINT PK AI | |
| owner_id | BIGINT FK users | private to owner |
| name | VARCHAR(40) | |
| color | CHAR(7) | `#RRGGBB`, random default |
| | | UNIQUE(owner_id, name); app caps 200 per owner |

### `player_tags`
Join of a tag to a target player (by username, same pattern as notes).
`tag_id` FK, `target_mc_username`, `target_user_id` NULL.
UNIQUE(tag_id, target_mc_username).

### `newspapers`
| column | type | notes |
|--------|------|-------|
| id | BIGINT PK AI | |
| owner_id | BIGINT FK users | **never exposed publicly** |
| name | VARCHAR(80) | |
| description | TEXT | |
| status | ENUM('pending','approved','rejected') | creation approval |
| request_reason | TEXT | why they want it / plans |
| active | BOOLEAN default true | moderation soft-hide |
| created_at | DATETIME | |

### `articles`
`id`, `newspaper_id` FK, `title`, `body` TEXT, `active` BOOLEAN default true,
`published_at`. Author = newspaper owner (still hidden publicly).

### `events`
| column | type | notes |
|--------|------|-------|
| id | BIGINT PK AI | |
| requested_by | BIGINT FK users NULL | NULL for system events |
| name | VARCHAR(120) | |
| description | TEXT | |
| starts_at | DATETIME | |
| duration_minutes | INT | |
| x / y / z | INT NULL | optional coordinates |
| is_system | BOOLEAN default false | pinned, not reportable (AI invasion) |
| status | ENUM('pending','approved','rejected') | |
| active | BOOLEAN default true | moderation soft-hide |
| created_at | DATETIME | |

### `reports`
| column | type | notes |
|--------|------|-------|
| id | BIGINT PK AI | |
| reporter_id | BIGINT FK users | |
| target_type | ENUM('newspaper','article','event') | |
| target_id | BIGINT | |
| reason | TEXT NULL | |
| created_at | DATETIME | |
| | | UNIQUE(reporter_id, target_type, target_id) — one report per user per item |

Auto-hide trigger is computed in the app: `distinct reporters / approved_user_count > 0.10`.
See [05-moderation.md](./05-moderation.md).

### `moderation_reviews`
Records admin decisions so re-triggering on the same reports is suppressed.
`target_type`, `target_id`, `decision` ENUM('reinstated','removed'), `reviewed_by`, `reviewed_at`.

### `avatar_cache`
Caches Minecraft skin **head** images so most avatar views need no external calls.
See [feature-avatars.md](./feature-avatars.md).

| column | type | notes |
|--------|------|-------|
| mc_username | VARCHAR(16) `utf8mb4_bin` PK | case-sensitive key |
| uuid | CHAR(32) | undashed Mojang id |
| image_base64 | MEDIUMTEXT | head PNG, base64-encoded |
| fetched_at | DATETIME | staleness / refresh (long TTL; skins rarely change) |

Populated lazily: Mojang resolves username→UUID, Crafatar (with mirror fallback) renders the
head, bytes are stored as base64. Unknown username / all mirrors down → Steve placeholder
(not cached as a row).

### `admin_log`
| column | type | notes |
|--------|------|-------|
| id | BIGINT PK AI | |
| at | DATETIME | |
| actor_id | BIGINT NULL | who (NULL = system) |
| action | VARCHAR(48) | e.g. `user.create`, `article.publish` |
| target_type | VARCHAR(32) NULL | |
| target_id | BIGINT NULL | |
| meta | JSON NULL | small extra context |

See [06-admin-log-stats.md](./06-admin-log-stats.md) for the action list.

## Relationship summary

```
users 1──1 global_notes
users 1──* player_notes (author)   ── resolves to ─> users (target, by mc_username)
users 1──* tags 1──* player_tags   ── resolves to ─> users (target, by mc_username)
users 1──* newspapers 1──* articles
users 1──* events (requester)      events: is_system = pinned invasion
users 1──* reports ─> {newspaper|article|event}
```

## Username resolution lifecycle

- **Insert note/tag:** always set `target_mc_username`; set `target_user_id` if an approved
  user currently has that username, else NULL.
- **On user approval / username change:** backfill `target_user_id` on rows whose
  `target_mc_username` matches the new value.
- **On user delete:** set `target_user_id = NULL` on rows that referenced them
  (the username key remains, ready to re-link).
