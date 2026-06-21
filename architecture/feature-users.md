# Feature — Users (registry & verification)

Module: `modules/users/`. Depends on [02-auth.md](./02-auth.md).

## What it does

- Holds the player registry (approved users only are searchable).
- Lets a user set/change their **Minecraft username** and request a **verified badge**.
- Powers search used by [feature-player-notes.md](./feature-player-notes.md) and
  [feature-tags.md](./feature-tags.md).

## Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/me` | auth | current user (status, is_admin, mc_username, mc_verified, public_faction_tag) |
| PATCH | `/api/me/username` | auth | set/change mc_username (drops `mc_verified` if it was set) |
| POST | `/api/me/verify-request` | auth | queue a verification request for the admin |
| PATCH | `/api/me/faction-tag` | auth | set/clear the single **public** faction tag |
| GET | `/api/users/search?q=` | auth | search approved users by discord username / display name / mc username |
| GET | `/api/admin/users` | admin | list/filter (e.g. `?status=pending`) |
| POST | `/api/admin/users/:id/approve` | admin | approve account (+ backfill note/tag links) |
| POST | `/api/admin/users/:id/reject` | admin | reject |
| POST | `/api/admin/users/:id/verify` | admin | grant verified badge |
| DELETE | `/api/admin/users/:id` | admin | delete (note/tag links fall back to username) |

## Search result shape

```json
{
  "userId": 12,
  "discordUsername": "spyke",
  "discordDisplayName": "Spyke",
  "mcUsername": "Spyke_MC",
  "mcVerified": true,
  "publicFactionTag": "Imperial Guard",
  "avatarUrl": "/api/avatars/Spyke_MC"   // see feature-avatars.md
}
```

Only `status='approved'` users appear. Search matches are case-insensitive for Discord
fields; `mc_username` comparison respects its case-sensitive collation but search can still
match substrings.

## Username resolution (critical)

When a user is **approved**, **changes username**, or is **deleted**, run the backfill from
[01-data-model.md](./01-data-model.md) so `player_notes` and `player_tags` keyed on that
`mc_username` point at (or release) the right `target_user_id`. This is the single source of
the "note someone before they join / after they leave" behavior. Keep it in
`users/service.ts` and call it from the three lifecycle points.

## Public faction tag

- Exactly **one** optional string per user (`users.public_faction_tag`), visible to everyone
  in search results and on profiles.
- This doubles as an emergent, zero-cost faction directory (browse who declared the same tag).
- Distinct from private tags — see [feature-tags.md](./feature-tags.md).

## Testing (Vitest)

- Search excludes pending/rejected users.
- Username change clears the verified badge and triggers backfill.
- Delete nulls `target_user_id` but keeps notes/tags by username.
