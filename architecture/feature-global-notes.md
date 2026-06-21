# Feature — Global Notes (personal notepad)

Module: `modules/global-notes/`. A single private freeform notepad per user.

## Behavior

- One large textarea. Content **autosaves to the server every 2s** (debounced; only when
  changed).
- Max **5000 characters**, enforced both client-side (with a counter) and server-side.
- Strictly private to the owner.

## Data

`global_notes`: one row per user (`user_id` UNIQUE), `body TEXT`, `updated_at`.
Upsert on save.

## Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/global-notes` | auth | returns the user's note (or empty) |
| PUT | `/api/global-notes` | auth | upsert `{ body }`; rejects >5000 chars with `error.tooLong` |

## Frontend

- Debounce: save 2s after the last keystroke; also save on blur and on unmount.
- Show a subtle "Saved" / "Saving…" indicator and the character count.
- Covered by the global per-user rate cap only (no per-action limit) — see
  [07-rate-limiting.md](./07-rate-limiting.md).

## Testing (Vitest)

- Server rejects >5000 chars.
- Upsert replaces existing content for the same user.
- (Frontend) debounce fires one save per quiet period.
