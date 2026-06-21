# Feature — Tags

Module: `modules/tags/`. A versatile private labeling system, plus one public faction tag.

## Two distinct concepts

### 1. Private tags (the main feature)
- Each user can create **up to 200 tags**. Default a **random color** (`#RRGGBB`), editable.
- Assign any tag (multiple allowed) to any player — same username-keyed targeting as
  [feature-player-notes.md](./feature-player-notes.md) (works for not-yet-registered usernames).
- Use cases are open-ended: group/faction labels, "Dangerous", "Ally", "Spy", "Owes me", etc.
- **Private to the owner.** Used to sort/filter the noted-players list and search results.

### 2. Public faction tag (one per user)
- The single optional `users.public_faction_tag` (see [feature-users.md](./feature-users.md)).
- Visible to everyone; **not** part of this module's private-tag tables. Documented here only
  to avoid confusion between the two.

## Data

- `tags` (owner_id, name UNIQUE per owner, color). App enforces the 200 cap.
- `player_tags` (tag_id, target_mc_username, target_user_id NULL). UNIQUE(tag_id, username).
- Resolution/backfill identical to player notes.

## Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/tags` | auth | the user's tags |
| POST | `/api/tags` | auth | create `{ name, color? }`; 409 `error.tagLimit` if at 200 |
| PATCH | `/api/tags/:id` | auth | rename / recolor |
| DELETE | `/api/tags/:id` | auth | delete tag + its assignments |
| POST | `/api/tags/:id/assign` | auth | `{ username }` attach to a player |
| DELETE | `/api/tags/:id/assign/:username` | auth | detach |
| GET | `/api/players/by-tag/:id` | auth | players carrying that tag (feeds filters) |

## Frontend

- Tag manager (list, create with color picker, edit, delete).
- Tag chips shown on players in the noted-players list and search; click a tag to filter.

## Testing (Vitest)

- 201st tag is rejected.
- Assigning to a not-yet-registered username works and resolves on registration.
- Deleting a tag removes its assignments only (not the players/notes).
- Authorization: tags are invisible to non-owners.
