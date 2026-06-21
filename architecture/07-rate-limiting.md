# 07 — Rate Limiting

Goal: stop bots/flooding without ever bothering a normal user. Limits are **generous**.

## Approach

Use `@fastify/rate-limit` (or a tiny in-memory token bucket — single container, so in-memory
is fine). Key by `user_id` for authed routes, by IP for the OAuth entry points.

## Suggested limits (tune later; one place to change them)

| Route group | Limit |
|-------------|-------|
| Global per user | 300 req / min (catch-all sanity cap) |
| `POST /api/events` (request event) | 10 / hour, 30 / day |
| `POST /api/newspapers` (request newspaper) | 5 / day |
| `POST /api/newspapers/:id/articles` (publish) | 30 / hour |
| `POST /api/reports` | 30 / day |
| `POST /api/auth/discord` (login start) | 20 / 10 min per IP |
| Verification / username-change requests | 5 / day |

The autosave endpoint for global notes is exempt from per-action limits but covered by the
global per-user cap (it self-throttles client-side to every 2s).

## Behavior

- On limit: `429` with `{ error: { code: "error.rateLimited", message } }`; the frontend
  shows a friendly i18n message. No silent drops.

## Testing (Vitest)

- A burst over a small test limit returns 429; under-limit passes.
