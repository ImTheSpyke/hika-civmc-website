# Feature — Events

Module: `modules/events/`. A community calendar with admin-approved events and a pinned
system event (the AI invasion).

## Behavior

- Any approved user can **request an event**: `name`, `description`, `date/time` (`starts_at`),
  `duration` (minutes), and **optional coordinates** (x, y, z). Status = `pending`,
  logs `event.request`. Rate-limited.
- The **admin approves** (anti-abuse) → it appears on the page. Logs `event.approve` /
  `event.reject`.
- The events page lists **approved & active** events in **chronological order**, each with a
  **"Next event in …"** countdown for upcoming ones.

## The AI invasion (system event)

- A privileged event with `is_system = true`, created by the admin (not user-requested).
- **Always pinned to the top** regardless of date, shows its description and a countdown.
- **Not reportable** (the moderation module rejects reports for `is_system` events — see
  [05-moderation.md](./05-moderation.md)).
- Otherwise behaves like a normal event — it reuses the same table and rendering. No separate
  "invasion mode".

## Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/events` | auth | system event(s) pinned first, then approved & active events by `starts_at` |
| POST | `/api/events` | auth | request `{ name, description, startsAt, durationMinutes, x?, y?, z? }` (rate-limited) |
| GET | `/api/admin/events?status=pending` | admin | review queue |
| POST | `/api/admin/events/:id/approve` | admin | approve |
| POST | `/api/admin/events/:id/reject` | admin | reject |
| POST | `/api/admin/events` | admin | create a **system** event (e.g. the invasion) |
| PATCH/DELETE | `/api/admin/events/:id` | admin | edit/remove |

## Frontend (page)

- Pinned invasion card on top with a live countdown.
- Chronological list; upcoming items show "Next event in {time}" (i18n key `events.nextIn`).
- Coordinates rendered when present. Non-system events are reportable.

## Testing (Vitest)

- Pending events are not publicly listed; approved are, in date order.
- System event is always first and cannot be reported.
- Countdown ordering: soonest upcoming event drives "next event".
