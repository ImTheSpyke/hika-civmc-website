# CLAUDE.md

Guidance for contributors (human and AI) working in this repository.

## Project summary

A **companion website** for a long-term Minecraft **civilization-RP** server (~1000 players,
open Fri/Sat/Sun 21:00–01:00). It does **not** replace in-game play — it helps players
**organize, take notes, run newspapers, and coordinate events**. It is intentionally
**generic**: useful to any player/group on the server, not just the author's "Imperial Guard".

Endgame flavor: in a few months a wall opens and ~200 AI enemies are released to hunt
players. On the site this is just a **pinned, admin-made "AI invasion" event with a
countdown** — no special mode.

## Tech stack

- **Backend:** TypeScript + Fastify
- **Frontend:** React + Vite
- **Database:** MariaDB (docker-compose service, or a remote host via env)
- **Tests:** Vitest (backend + frontend)
- **Packaging:** one Docker image, run via `docker-compose.yml`
- **Auth:** Discord OAuth
- **i18n:** JSON locale files, auto-discovered (English now; French later, drop-in)

## How it runs

**One combined container.** Fastify serves the JSON API under `/api/*` and the built React
SPA for everything else (single image, single port). MariaDB is a sibling compose service by
default, or point the app at a remote MariaDB via `DB_HOST`/credentials.

## Repository structure

```
architecture/        # one .md per feature/concern — READ THIS FIRST
CLAUDE.md            # this file
README.md            # setup, dev, testing
docker-compose.yml   # app + mariadb
Dockerfile           # multi-stage: build web + server → run
.env.example         # all config documented
packages/
  server/            # Fastify; modules/<feature>/{routes,service,repo,schema}.ts
  web/               # React + Vite; pages/, components/, api/, i18n/
```

> The architecture docs describe the **target** structure; build it incrementally.
> Keep **one module per feature** so the codebase stays small and contributable.

## Architecture index

Cross-cutting: [00-overview](architecture/00-overview.md) ·
[01-data-model](architecture/01-data-model.md) ·
[02-auth](architecture/02-auth.md) ·
[03-i18n](architecture/03-i18n.md) ·
[04-deployment](architecture/04-deployment.md) ·
[05-moderation](architecture/05-moderation.md) ·
[06-admin-log-stats](architecture/06-admin-log-stats.md) ·
[07-rate-limiting](architecture/07-rate-limiting.md)

Features: [users](architecture/feature-users.md) ·
[avatars](architecture/feature-avatars.md) ·
[global-notes](architecture/feature-global-notes.md) ·
[player-notes](architecture/feature-player-notes.md) ·
[tags](architecture/feature-tags.md) ·
[newspapers](architecture/feature-newspapers.md) ·
[events](architecture/feature-events.md)

## MVP scope

Avatars (MC skin head), Global notes, Player notes, Tags, Newspapers, Events — plus the
supporting concerns (auth/approval, moderation, admin log+stats, i18n, rate limiting).

## Key decisions (and the "why")

1. **One combined container.** Simplest to run/deploy for a small site; the API/SPA split is
   an internal boundary, not separate services.
2. **MariaDB, env-configurable host.** Bundled compose service for ease; remote host
   supported by changing env only — the app is host-agnostic.
3. **Super-admin is a DB column (`users.is_admin`), not env.** The author bootstraps their own
   row from `SUPERADMIN_DISCORD_ID` on first run, then can promote anyone. Only the author
   has DB access.
4. **Discord OAuth + manual account approval.** Identity is free via Discord; a human gate
   (`status='pending'→'approved'`) confirms the person is really in the event, since it can't
   be automated without a bot.
5. **Notes & tags key on a Minecraft username string**, with an *optional* link to a user.
   This makes "note a player before they sign up / after they leave" work naturally;
   a backfill resolves/releases the link on user approve/rename/delete.
   This is the **most important and subtle** part of the data model — see
   [player-notes](architecture/feature-player-notes.md) and
   [data-model](architecture/01-data-model.md).
6. **Privacy split:** player notes and the 200 personal tags are **private** to their author;
   each user may also set **one public faction tag** (an emergent faction directory).
7. **Newspapers:** request → admin approves creation → owner self-publishes; **owner hidden**
   publicly; admin can remove content for HRP/abuse.
8. **Events:** user-requested → admin-approved; the AI invasion is a **pinned, non-reportable
   system event**.
9. **Community moderation:** public content is reportable; when **>10% of registered users**
   report an item it auto-hides (`active=false`) for admin review (reinstate or remove).
   Threshold scales with live user count; one report per user per item.
10. **Light rate limiting** only — stop bots/spam, never normal use.
11. **i18n from day one**, English-only shipped; adding `<lang>.json` enables a language with
    no code change (Vite globs the locales folder).
12. **Admin log + stats** kept concise: log only meaningful lifecycle actions; show counts and
    active-user metrics the author actually needs.

## Conventions

- **Backend module shape:** `modules/<feature>/{routes,service,repo,schema}.ts`.
  `index.ts` registers each `routes.ts` under `/api`. Add a feature = add a folder + one line.
- **Validation at the edge** (`schema.ts`); errors are `{ error: { code, message } }` where
  `code` is an i18n key.
- **No hard-coded UI strings** — add a key to `en.json` and use `t()`.
- **Migrations:** ordered `packages/server/src/migrations/*.sql`, applied on boot, tracked in
  `_migrations`.
- **Tests:** colocate or under `test/`; run with Vitest; cover the username-resolution
  backfill, the 10% moderation math, auth guards, and the 5000-char / 200-tag limits.
- **Keep it small.** Prefer a few clear modules over a clever abstraction; avoid
  over-engineering.

## Working agreements for AI contributors

- Read the relevant `architecture/*.md` before changing a feature; keep these docs in sync
  when behavior changes.
- Don't introduce a second database, a second deployable, or heavy frameworks without a
  documented reason here.
- Preserve the privacy and owner-hiding rules — they are product requirements, not details.
