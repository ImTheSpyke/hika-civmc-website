# 04 — Deployment & Configuration

## One combined container

A multi-stage `Dockerfile` builds the React app, builds the server, then runs the server,
which serves both the API and the static frontend.

```dockerfile
# 1) build web
FROM node:22-alpine AS web
WORKDIR /app
COPY packages/web ./packages/web
# (install + build) → packages/web/dist

# 2) build server
FROM node:22-alpine AS server
WORKDIR /app
COPY packages/server ./packages/server
# (install + tsc) → packages/server/dist

# 3) runtime
FROM node:22-alpine
WORKDIR /app
COPY --from=server /app/packages/server/dist ./dist
COPY --from=server /app/packages/server/node_modules ./node_modules
COPY --from=web    /app/packages/web/dist ./public      # served as static
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Fastify serves `/public` for non-`/api` routes and falls back to `index.html` for SPA
routing (`@fastify/static`).

## docker-compose.yml

```yaml
services:
  app:
    build: .
    ports:
      - "${PORT:-3000}:3000"
    environment:
      - PORT=3000
      - DB_HOST=${DB_HOST:-db}        # set to a remote host to use external MariaDB
      - DB_PORT=${DB_PORT:-3306}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=${DB_NAME}
      - SESSION_SECRET=${SESSION_SECRET}
      - DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID}
      - DISCORD_CLIENT_SECRET=${DISCORD_CLIENT_SECRET}
      - DISCORD_REDIRECT_URI=${DISCORD_REDIRECT_URI}
      - SUPERADMIN_DISCORD_ID=${SUPERADMIN_DISCORD_ID}
      - PUBLIC_BASE_URL=${PUBLIC_BASE_URL}
    depends_on:
      db:
        condition: service_healthy

  db:
    image: mariadb:11
    environment:
      - MARIADB_DATABASE=${DB_NAME}
      - MARIADB_USER=${DB_USER}
      - MARIADB_PASSWORD=${DB_PASSWORD}
      - MARIADB_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
    volumes:
      - dbdata:/var/lib/mysql
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  dbdata:
```

> **Remote DB:** point `DB_HOST`/`DB_PORT`/credentials at an external MariaDB and you may
> omit the `db` service and its `depends_on`. The app does not care where MariaDB lives.

## Environment variables (`.env` / compose)

| Var | Purpose |
|-----|---------|
| `PORT` | HTTP port (default 3000) |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | MariaDB connection (local service or remote) |
| `DB_ROOT_PASSWORD` | only for the bundled `db` service |
| `SESSION_SECRET` | signs session cookies |
| `DISCORD_CLIENT_ID` `DISCORD_CLIENT_SECRET` `DISCORD_REDIRECT_URI` | Discord OAuth app |
| `SUPERADMIN_DISCORD_ID` | bootstraps `is_admin` for the author on first run |
| `PUBLIC_BASE_URL` | absolute URL (OAuth redirects, links) |

A committed **`.env.example`** documents all of these with placeholder values. `.env` is
gitignored.

## Migrations on boot

`db.ts` runs each unapplied `migrations/*.sql` in filename order inside a transaction and
records applied files in a `_migrations` table. Idempotent and safe to restart.

## Testing (Vitest)

- Integration tests spin up against a disposable MariaDB (CI service or
  `docker compose` test profile); unit tests mock the repo layer.
