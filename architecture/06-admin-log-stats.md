# 06 — Admin Log & Stats

A concise admin dashboard so the author can see "what is happening" without noise.

## Activity log (`admin_log`)

Append a row for meaningful actions only. Keep `meta` small.

| action | when |
|--------|------|
| `user.create` | first Discord login (pending account created) |
| `user.connect` | a session is created (login) |
| `user.approve` / `user.reject` | account moderation |
| `user.delete` | account removed |
| `user.username_change` | Minecraft username changed |
| `user.verify` | verified badge granted |
| `newspaper.request` / `newspaper.approve` / `newspaper.reject` | newspaper lifecycle |
| `article.publish` | new article |
| `event.request` / `event.approve` / `event.reject` | event lifecycle |
| `moderation.autohide` / `moderation.reinstate` / `moderation.remove` | content moderation |

Endpoint: `GET /api/admin/log?action=&actor=&before=&limit=` (admin only), newest first.

> Deliberately **not** logged: note edits, tag changes, global-note autosaves, searches,
> page views — they are private/high-volume and not useful to the author.

## Stats dashboard

`GET /api/admin/stats` returns:

| metric | source |
|--------|--------|
| `registeredUsers` | count of `users.status='approved'` |
| `currentlyActive` | distinct users with `last_seen_at` within ~5 min |
| `avgActive1h` / `avgActive4h` | average distinct active users over the window (bucketed) |
| `newspapers` | count of approved newspapers |
| `articlesPublished` | total + last 7 days |
| `eventsUpcoming` | approved events with `starts_at` in the future |
| `pending` | counts awaiting the author: account approvals, newspaper requests, event requests, verification requests, moderation reviews |

**Active-user tracking:** authenticated requests update `users.last_seen_at` (throttled to
~once/min/user). "Currently active" = seen within 5 minutes. For 1h/4h averages, sample
the active count periodically (lightweight in-memory ring buffer, or derive from
`last_seen_at` buckets) — keep it cheap; this is a ~1000-user site running 3 nights/week.

## Testing (Vitest)

- Log writer is called by each lifecycle action (spy on the logger).
- Stats counts against a seeded DB.
