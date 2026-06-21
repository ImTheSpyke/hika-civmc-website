# CivMC Companion Website

A companion website for a long-term Minecraft **civilization-RP** server. It helps players
organize and coordinate **without replacing in-game roleplay**: personal notes, private notes
and tags about other players, player-run newspapers, and a community events calendar with a
pinned countdown to the "AI invasion".

It is **generic** — useful to any player or group on the server.

- **Stack:** TypeScript + Fastify (API) · React + Vite (web) · MariaDB · Vitest · Docker
- **Auth:** Discord OAuth, with manual account approval by the admin
- **Architecture docs:** see [`architecture/`](architecture/) and [`CLAUDE.md`](CLAUDE.md)

> New here? Read [`CLAUDE.md`](CLAUDE.md) and [`architecture/00-overview.md`](architecture/00-overview.md) first.

## Features (MVP)

- **Avatars** — profile picture rendered from a player's Minecraft skin head
- **Global notes** — a private personal notepad, autosaved every 2s (max 5000 chars)
- **Player notes** — private notes about any player (even one not yet registered)
- **Tags** — up to 200 private, colored tags to label/sort players; one optional **public**
  faction tag
- **Newspapers** — request a newspaper (admin-approved), then publish freely; author hidden
- **Events** — request events (admin-approved); pinned AI-invasion countdown
- Supporting: moderation (community reports + 10% auto-hide), admin log & stats, i18n, light
  rate limiting

## Requirements

- Node.js 22+
- Docker & Docker Compose (for the containerized run)
- A **Discord OAuth application** (client id/secret + redirect URI)

## Configuration

Copy the template and fill it in:

```bash
cp .env.example .env
```

| Var | Purpose |
|-----|---------|
| `PORT` | HTTP port (default 3000) |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | MariaDB connection (local service **or** remote host) |
| `DB_ROOT_PASSWORD` | only for the bundled `db` compose service |
| `SESSION_SECRET` | signs session cookies |
| `DISCORD_CLIENT_ID` `DISCORD_CLIENT_SECRET` `DISCORD_REDIRECT_URI` | Discord OAuth app |
| `SUPERADMIN_DISCORD_ID` | bootstraps the admin flag for your account on first run |
| `PUBLIC_BASE_URL` | absolute base URL (OAuth redirects, links) |

Set your Discord OAuth redirect to `${PUBLIC_BASE_URL}/api/auth/discord/callback`.

`.env` is gitignored; never commit secrets.

## Run with Docker (recommended)

```bash
docker compose up --build
```

This starts the **app** (combined API + web on one port) and a **MariaDB** service.
Migrations run automatically on boot. Open `http://localhost:3000`.

> **Remote database:** set `DB_HOST`/`DB_PORT` and credentials to your external MariaDB.
> You may then remove the `db` service (and its `depends_on`) from `docker-compose.yml`.

### First-run admin

On first boot, if `SUPERADMIN_DISCORD_ID` matches your account once you've logged in via
Discord, your `users.is_admin` flag is set. From the admin area you can approve accounts,
review newspaper/event requests, verify usernames, and moderate content. You can promote
other admins by setting their `is_admin` column directly in the database.

## Local development (without Docker, fast iteration)

You still need a MariaDB to point at — either run just the DB via compose:

```bash
docker compose up db
```

or use any local/remote MariaDB and set the `DB_*` vars in `.env`.

Then run the two dev servers:

```bash
# API (Fastify, watch mode)
cd packages/server
npm install
npm run dev          # serves http://localhost:3000/api

# Web (Vite dev server, in another terminal)
cd packages/web
npm install
npm run dev          # serves http://localhost:5173, proxies /api → :3000
```

The Vite dev server proxies `/api` to the Fastify server, so OAuth and all endpoints work in
development. In production these are the **same** server (Fastify serves the built SPA).

## Testing

```bash
# from a package directory
npm test             # run Vitest once
npm run test:watch   # watch mode
```

Conventions:

- **Vitest** for both packages.
- Server unit tests mock the repo layer; integration tests run against a disposable MariaDB.
- Frontend tests use Vitest (+ Testing Library) for components and hooks.
- Please cover the tricky invariants when you touch them:
  - username-resolution backfill (note/tag links on user approve/rename/delete),
  - the **10%** moderation auto-hide math,
  - auth guards (pending/rejected/approved/admin),
  - limits: 5000-char global note, 200 tags.

## Project structure

```
architecture/   # one .md per feature/concern (start here)
CLAUDE.md       # project summary, decisions, conventions
packages/
  server/       # Fastify API + serves built web; modules/<feature>/...
  web/          # React + Vite app; pages/, components/, api/, i18n/
docker-compose.yml
Dockerfile
.env.example
```

## Contributing

1. Read [`CLAUDE.md`](CLAUDE.md) and the relevant [`architecture/`](architecture/) file.
2. Keep it small: **one feature = one backend module + one frontend page**.
3. No hard-coded UI text — add a key to `i18n/locales/en.json` and use `t()`.
4. Add/adjust tests; keep the architecture docs in sync with behavior changes.

## Internationalization

English ships today. To add a language, copy `en.json` to `<lang>.json` under
`packages/web/src/i18n/locales/`, translate the values, and save — it appears in the language
switcher automatically (no code change). See [`architecture/03-i18n.md`](architecture/03-i18n.md).
