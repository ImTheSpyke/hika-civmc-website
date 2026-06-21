# Feature — Player Notes (private notes about players)

Module: `modules/player-notes/`. Lets a user attach a **private** note to a specific player.

## Behavior

- Search for a player (by Discord username, display name, or Minecraft username — see
  [feature-users.md](./feature-users.md)) and write a custom note about them.
- A user can **also note a player who is not on the website** by typing a raw
  **Minecraft username (case-sensitive)**.
- Notes are **strictly private** to their author — never visible to the target or anyone else.
- The user sees a **"players I've noted"** list (only annotated players), so we never render
  all ~1000 players.

## The username-keyed model (why it matters)

A note's stable key is `target_mc_username`, with an optional resolved `target_user_id`:

- Note an existing user → both fields set.
- Note a not-yet-registered username → only `target_mc_username` set.
- Later, that username **registers** → backfill sets `target_user_id` (note now shows their
  avatar/verified badge/faction tag).
- Target user **deleted** → `target_user_id` nulled; the note persists by username, ready to
  re-link.

The backfill lives in `users/service.ts` and runs on approve / username-change / delete (see
[feature-users.md](./feature-users.md) and [01-data-model.md](./01-data-model.md)).

`UNIQUE(author_id, target_mc_username)` → one note per player per author (editable).

## Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/player-notes` | auth | list of {username, resolvedUser?, body, updatedAt}; supports `?tag=` filter via tags module |
| GET | `/api/player-notes/:username` | auth | the author's note for that username (if any) |
| PUT | `/api/player-notes/:username` | auth | upsert `{ body }` (resolves user id if approved user exists) |
| DELETE | `/api/player-notes/:username` | auth | remove the note |

`:username` is case-sensitive and treated as the literal Minecraft name.

## Frontend (page)

- Search box → results with avatars; pick one (or confirm a raw username) → note editor.
- "My noted players" list with avatars, resolved badges, and any private tags
  (see [feature-tags.md](./feature-tags.md)). Filterable by tag.

## Testing (Vitest)

- Note a non-existent username, then register that user → note resolves.
- Delete that user → note falls back to username.
- A user cannot read another user's note (authorization).
