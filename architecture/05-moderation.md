# 05 — Moderation (reporting & auto-hide)

Applies to **public content**: a newspaper, an article, or an event.
The AI-invasion **system event is not reportable**.

## Reporting

- `POST /api/reports` `{ targetType, targetId, reason? }` (auth required, rate-limited).
- One report per user per item — enforced by `UNIQUE(reporter_id, target_type, target_id)`.
  A duplicate is a no-op (idempotent), not an error.

## Auto-hide threshold

After each new report, the service recomputes:

```
distinctReporters(target) / approvedUserCount  >  0.10
```

- `approvedUserCount` = current count of `users.status='approved'` (the threshold scales
  with the live community size).
- If exceeded **and** the item has not already been reviewed for the current report set,
  set `active = false`. Hidden items disappear from public list/detail endpoints
  (normal `requireAuth` users) but remain visible to admins.
- Log `moderation.autohide`.

## Admin review

`GET /api/admin/moderation` lists hidden items with report counts and reasons.
The admin decides:

- **Reinstate** → `active = true`, write a `moderation_reviews` row
  (`decision='reinstated'`). The item will **not** re-hide on the same accumulated reports;
  it would only re-trigger if *new* reports push it over again after the review mark.
- **Remove** → delete the item (and its children, e.g. a newspaper's articles);
  `decision='removed'`. Logged.

Both actions write to `admin_log` (`moderation.reinstate` / `moderation.remove`).

## Why app-side (not a DB trigger)

Keeping the threshold logic in `modules/moderation/service.ts` keeps it readable,
testable with Vitest, and easy to tune (the `0.10` constant lives in one place).

## Testing (Vitest)

- Threshold math at boundaries (just under / just over 10%, with changing user counts).
- Duplicate report is idempotent.
- Reinstated item does not auto-hide again on the same reports; does on new ones.
- System events cannot be reported.
