# 00 — Overview

A **companion website** for a long-term Minecraft civilization-RP server (~1000 players,
3 evenings/week). It does **not** replace in-game play; it helps players organize,
take notes, run newspapers, and coordinate events. It is generic — useful to any group,
not just the author's "Imperial Guard".

## Tech stack

| Layer | Choice |
|-------|--------|
| Backend | TypeScript + **Fastify** |
| Frontend | **React + Vite** |
| DB | **MariaDB** (docker service, or remote host via env) |
| Tests | **Vitest** (backend + frontend) |
| Packaging | Single **Docker image**, run via `docker-compose.yml` |
| Auth | **Discord OAuth** |
| i18n | JSON locale files, auto-discovered |

## Deployment shape — one combined container

The Fastify server serves **both** the JSON API (`/api/*`) and the built React static
assets (everything else → `index.html` for client-side routing). One image, one port.
See [04-deployment.md](./04-deployment.md).

```
[ Browser ] ──HTTP──> [ Fastify container ] ──TCP──> [ MariaDB ]
                         ├─ /api/*  → REST handlers
                         └─ /*      → React SPA (static)
```

## Repository layout (target)

```
/
├─ architecture/            # these docs
├─ CLAUDE.md                # project summary for contributors/AI
├─ README.md                # setup & dev guide
├─ docker-compose.yml
├─ Dockerfile               # multi-stage: build web + server → run
├─ .env.example
├─ packages/
│  ├─ server/               # Fastify app
│  │  ├─ src/
│  │  │  ├─ index.ts        # boot: config, db, plugins, routes, static
│  │  │  ├─ config.ts       # env parsing
│  │  │  ├─ db.ts           # MariaDB pool + migrations runner
│  │  │  ├─ auth/           # discord oauth, sessions, requireAuth/requireAdmin
│  │  │  ├─ modules/        # ONE folder per feature
│  │  │  │  ├─ users/
│  │  │  │  ├─ avatars/
│  │  │  │  ├─ global-notes/
│  │  │  │  ├─ player-notes/
│  │  │  │  ├─ tags/
│  │  │  │  ├─ newspapers/
│  │  │  │  ├─ events/
│  │  │  │  ├─ moderation/
│  │  │  │  └─ admin/        # log + stats
│  │  │  ├─ lib/             # rate-limit, validation, errors
│  │  │  └─ migrations/      # *.sql, applied in order
│  │  └─ test/
│  └─ web/                  # React + Vite app
│     ├─ src/
│     │  ├─ main.tsx, App.tsx, router
│     │  ├─ pages/           # one page per feature
│     │  ├─ components/
│     │  ├─ api/             # typed fetch client
│     │  ├─ i18n/            # loader + locales/*.json
│     │  └─ lib/
│     └─ test/
```

> A single-package layout (one `src/` with `server/` and `web/` subfolders) is also fine.
> The point is **one module per feature**; the exact monorepo tooling is not prescribed.

## Module convention (backend)

Each feature folder exposes a small, predictable surface:

```
modules/<feature>/
├─ routes.ts     # Fastify plugin: defines /api/<feature> endpoints
├─ service.ts    # business logic, no HTTP types
├─ repo.ts       # SQL queries only
└─ schema.ts     # zod/typebox request+response shapes
```

`index.ts` registers each module's `routes.ts` under `/api`. Adding a feature =
add a folder + one `register` line. Removing one = delete a folder + one line.

## API conventions

- JSON only. Prefix `/api`.
- Auth via signed session cookie (`httpOnly`, `sameSite=lax`).
- Validation at the edge (`schema.ts`); never trust client input.
- Errors: `{ error: { code, message } }`, with `code` being i18n-friendly keys.
- List endpoints exclude soft-hidden (`active = false`) content for normal users.

## Key product rules (quick reference)

- Accounts: Discord OAuth → **pending** → author approves (manual roster check).
- Super-admin: **`users.is_admin` DB column** (not env). Author bootstraps own row.
- Searchable players = **approved users only**.
- Player notes/tags are **private** to their author; one optional **public faction tag** per user.
- Notes/tags reference a **Minecraft username string**; link to a user when one exists.
- Newspapers: request → admin approves creation → owner self-publishes freely. Owner is **hidden** publicly.
- Events: user-requested → admin approves. The **AI invasion** is a pinned, non-reportable system event.
- Public content (newspapers, articles, events) is reportable; **>10%** of registered users → auto-hide for admin review.
