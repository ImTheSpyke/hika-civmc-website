# Feature — Avatars (Minecraft skin head)

Module: `modules/avatars/`. Displays the **head of a player's Minecraft skin** as their
profile picture, derived from the entered username, and **caches it in the database**.

## Pipeline

The frontend never calls a third-party service directly. It always requests:

```
GET /api/avatars/:username        → PNG bytes (the cached head image)
```

Server-side resolution, given a username:

1. **Cache hit?** Look up `avatar_cache` by `mc_username` (case-sensitive). If present and not
   stale, decode the stored **base64** and return the PNG. Done — no external calls.
2. **Resolve UUID (Mojang).** `GET https://api.mojang.com/users/profiles/minecraft/<username>`
   → `{ id }`. Unknown username → serve the **Steve placeholder** (never an error).
3. **Fetch the head (Crafatar, with mirror fallback).** Try each mirror in order until one
   responds OK:
   - `https://crafatar.imthespyke.fr`
   - `https://crafatar-pub.neodium.fr`
   - `http://crafatar.com`

   Render URL: `<mirror>/renders/head/<uuid>?overlay=true` (overlay = the hat/outer layer).
   No mirror available → serve the placeholder.
4. **Cache & return.** Store the image bytes as **base64** in `avatar_cache`
   (with the resolved `uuid` and a `fetched_at` timestamp), then return the PNG.

### Reference implementation (proof of concept)

```ts
const MIRRORS = [
  "https://crafatar.imthespyke.fr",
  "https://crafatar-pub.neodium.fr",
  "http://crafatar.com",
] as const;

async function uuidFromUsername(username: string): Promise<string> {
  const r = await fetch(
    `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`,
  );
  if (!r.ok) throw new Error(`Unknown username: ${username}`);
  return (await r.json()).id as string; // undashed UUID
}

async function headUrlFromUsername(username: string): Promise<string> {
  const uuid = await uuidFromUsername(username);
  for (const base of MIRRORS) {
    const url = `${base}/renders/head/${uuid}?overlay=true`;
    const ok = await fetch(url, { method: "HEAD" }).then(r => r.ok).catch(() => false);
    if (ok) return url;
  }
  throw new Error("No Crafatar mirror available");
}

// The avatars service then GETs that URL, stores the bytes as base64 in `avatar_cache`,
// and serves them. On any failure it falls back to the Steve placeholder.
```

> The mirror list is a config constant (one place to edit). Mojang/Crafatar endpoints are not
> secrets but live in config alongside it.

## Caching in the database

Table `avatar_cache` (see [01-data-model.md](./01-data-model.md)):

| column | notes |
|--------|-------|
| `mc_username` PK | case-sensitive (`utf8mb4_bin`) |
| `uuid` | undashed Mojang id |
| `image_base64` | the head PNG, base64-encoded (`LONGTEXT`/`MEDIUMTEXT`) |
| `fetched_at` | for staleness / refresh |

- **Staleness:** treat entries older than a TTL (e.g. a few days) as refreshable — on the next
  request, re-fetch in the background or lazily and update the row. Skins rarely change, so a
  long TTL is fine.
- **Refresh on username change/verify:** when a user changes their `mc_username`, the new name
  resolves on next view; old rows simply age out.
- Storing base64 keeps it portable (works on any MariaDB, in backups) and avoids a binary
  volume. At ~1000 users a head PNG is small; total footprint is negligible.

## Behavior notes

- **Unknown/invalid username or all mirrors down → Steve placeholder.** The UI never shows a
  broken image or an error for avatars.
- Set a sensible `Cache-Control` on the response so browsers also cache the head.
- External calls (Mojang + Crafatar) only happen on a cache miss/refresh — most views are
  served straight from the DB.

## Frontend usage

`<Avatar username="Spyke_MC" />` renders `<img src="/api/avatars/Spyke_MC">`.
Used in search results, the player-notes list, and profiles.

## Testing (Vitest)

- Cache hit returns the stored base64 **without** calling Mojang/Crafatar (spy asserts no fetch).
- Cache miss: mocks Mojang (UUID) + Crafatar (bytes), then asserts a row is written and PNG returned.
- Mirror fallback: first mirror fails → second is used.
- Unknown username and all-mirrors-down both yield the placeholder, not an error.
