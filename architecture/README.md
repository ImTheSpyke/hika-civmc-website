# Architecture

This folder documents the system feature-by-feature. Each file is small and focused
on a single concern so future contributors can read just the part they need.

## Reading order

Start with the cross-cutting docs, then read individual features as needed.

### Cross-cutting (read first)

| File | Concern |
|------|---------|
| [00-overview.md](./00-overview.md) | High-level shape, request flow, conventions |
| [01-data-model.md](./01-data-model.md) | Database tables & relationships (MariaDB) |
| [02-auth.md](./02-auth.md) | Discord OAuth, account approval, sessions, roles |
| [03-i18n.md](./03-i18n.md) | Locale files, auto-discovery, language switching |
| [04-deployment.md](./04-deployment.md) | Docker, docker-compose, env config |
| [05-moderation.md](./05-moderation.md) | Reporting, 10% auto-hide, admin review |
| [06-admin-log-stats.md](./06-admin-log-stats.md) | Activity log & stats dashboard |
| [07-rate-limiting.md](./07-rate-limiting.md) | Anti-spam guardrails |

### Features

| File | Feature |
|------|---------|
| [feature-users.md](./feature-users.md) | Player registry & username verification |
| [feature-avatars.md](./feature-avatars.md) | Minecraft skin-head avatars |
| [feature-global-notes.md](./feature-global-notes.md) | Personal autosaving notepad |
| [feature-player-notes.md](./feature-player-notes.md) | Private notes attached to players |
| [feature-tags.md](./feature-tags.md) | Private tags + one public faction tag |
| [feature-newspapers.md](./feature-newspapers.md) | Player-run newspapers & articles |
| [feature-events.md](./feature-events.md) | Community events & pinned invasion countdown |

## Golden rules

1. **Keep it small.** Prefer a few clear modules over a clever framework.
2. **One feature = one backend module + one frontend page**, where possible.
3. **Notes/tags key on a Minecraft username string**, not a user id — see
   [feature-player-notes.md](./feature-player-notes.md).
4. **Validated users only** can sign in and be searched; the super-admin is a DB flag.
5. **Every user-facing string lives in a locale file** — see [03-i18n.md](./03-i18n.md).
