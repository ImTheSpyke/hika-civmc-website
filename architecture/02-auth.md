# 02 — Auth (Discord OAuth, approval, roles)

## Login flow

1. User clicks **"Login with Discord"** → `GET /api/auth/discord` redirects to Discord.
2. Discord redirects back to `GET /api/auth/discord/callback?code=...`.
3. Server exchanges `code` for a token, fetches the Discord profile
   (`id`, `username`, `global_name`).
4. **Upsert** a `users` row by `discord_id`:
   - New user → `status='pending'`, log `user.create`.
   - Existing → update `discord_username`/`discord_display_name`, `last_seen_at`.
5. Create a session, set an `httpOnly`, `sameSite=lax` cookie.
6. Redirect to the app.

No passwords are stored. Discord client id/secret come from env (see [04-deployment.md](./04-deployment.md)).

## Account approval (manual gate)

A new account is **`pending`** and can do almost nothing until the author approves it.
The author cross-checks the official server Discord (cannot be automated without a bot).

- `pending` users: may view a "waiting for approval" screen and log out; no feature access.
- `approved` users: full access; become searchable in the player registry.
- `rejected` users: blocked.

Admin endpoints: `GET /api/admin/users?status=pending`, `POST /api/admin/users/:id/approve`,
`POST /api/admin/users/:id/reject`. Each logs to `admin_log`.

## Roles

- **Super-admin** = `users.is_admin = true`. There is no env-based admin list.
  - On first boot, if `SUPERADMIN_DISCORD_ID` is set and that user exists, the boot
    routine sets `is_admin=true` (idempotent bootstrap). The author can later promote
    anyone by flipping the column (author is the only one with DB access).
- Everyone else is a normal approved user.

## Guards (Fastify decorators / preHandlers)

| Guard | Allows |
|-------|--------|
| `requireAuth` | session valid **and** `status='approved'` |
| `requireAdmin` | `requireAuth` **and** `is_admin=true` |

`pending`/`rejected` sessions are recognized but rejected by `requireAuth` with a
specific code so the frontend can show the right screen.

## Username & verification

- On approval (or later), a user sets a free-text **Minecraft username**.
- To get the **verified badge** (or to change an already-verified username), the user
  clicks **"Request verification"**. The author gives them a code; the user DMs it
  in-game; the author confirms → `mc_verified=true`. This is a manual admin action,
  surfaced as a small queue. Logged as `user.verify` / `user.username_change`.

See [feature-users.md](./feature-users.md) for endpoints and the resolution backfill.

## Sessions

- Stored in `sessions` table for revocation; cookie holds the opaque token.
- `last_seen_at` on `users` is updated (throttled) on authenticated requests to power
  active-user stats — see [06-admin-log-stats.md](./06-admin-log-stats.md).
- Logout deletes the session row and clears the cookie.

## Testing (Vitest)

- Unit-test the callback's upsert logic and the resolution backfill with a Discord client
  test-double.
- Guard tests: pending/rejected/approved/admin matrix against a protected route.
