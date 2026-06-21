# Feature — Newspapers

Module: `modules/newspapers/`. Player-run publications with a request→approve→self-publish
lifecycle. **Owner identity is hidden** from the public.

## Lifecycle

1. A user clicks **"Create my newspaper"** and submits `name`, `description`, and a
   **reason / plans** (`request_reason`). Status = `pending`. Logs `newspaper.request`.
2. The **admin reviews** the request (anti-abuse: no spam/insults with no RP behind it) and
   **approves** or **rejects**. Logs `newspaper.approve` / `newspaper.reject`.
3. Once approved, the owner **publishes articles freely** — no further per-post approval.
4. The admin retains global power to **remove** an article or newspaper for HRP/abuse
   (also reachable via the report flow, see [05-moderation.md](./05-moderation.md)).

## Privacy

- The public **newspapers list** and **article views never expose `owner_id`** or any author
  identity. The newspaper presents as the byline.
- Only the admin (and the owner, for their own management view) can see ownership.

## Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/newspapers` | auth | public list of **approved & active** newspapers (no owner) |
| GET | `/api/newspapers/:id` | auth | newspaper + its **active** articles (no owner) |
| POST | `/api/newspapers` | auth | request creation `{ name, description, requestReason }` (rate-limited) |
| GET | `/api/me/newspapers` | auth | the caller's own newspapers (any status) |
| POST | `/api/newspapers/:id/articles` | auth (owner) | publish `{ title, body }` → logs `article.publish` |
| DELETE | `/api/newspapers/:id/articles/:articleId` | auth (owner or admin) | remove article |
| GET | `/api/admin/newspapers?status=pending` | admin | review queue |
| POST | `/api/admin/newspapers/:id/approve` | admin | approve |
| POST | `/api/admin/newspapers/:id/reject` | admin | reject |
| DELETE | `/api/admin/newspapers/:id` | admin | remove newspaper (HRP/abuse) |

Publishing requires the caller to own an **approved** newspaper, else `error.newspaper.notApproved`.

## Frontend (page)

- List of newspapers + prominent **"Create my newspaper"** (opens the request form).
- Newspaper detail = its published articles, newest first, no author shown.
- "My newspapers" management area: status badge, and (when approved) the article editor.
- Reportable from the public views (see moderation).

## Testing (Vitest)

- Cannot publish before approval.
- Public responses never include owner fields.
- Reject keeps it out of the public list.
