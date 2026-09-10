# Gaming Platform

A mobile-first, real-money gaming platform. Go API and React web app over a shared
PostgreSQL database.

## Stack

| Side | Stack |
| --- | --- |
| API | Go 1.26 · `net/http` · `database/sql` · pgx driver · golang-migrate |
| Database | PostgreSQL 18 |
| Web | React 19 · TypeScript · Vite · Tailwind v4 · TanStack Query · React Hook Form · Zod · React Router |

No web framework, and two direct Go dependencies: a PostgreSQL driver and Argon2id.

## Requirements

Go 1.26+, Node 22+, PostgreSQL 18, and Make. There is no Docker dependency — the database
runs natively.

## One-time database setup

PostgreSQL runs as a system service. On Arch the data directory is
`/var/lib/postgres/data` (no "ql"), and `initdb` must run as the `postgres` user or the
unit will refuse to start.

```bash
sudo pacman -S --needed postgresql
sudo -iu postgres initdb --locale=C.UTF-8 --encoding=UTF8 -D /var/lib/postgres/data
sudo systemctl enable --now postgresql

# --owner matters: since PostgreSQL 15 a non-owner cannot CREATE in schema public.
sudo -iu postgres createuser --pwprompt gaming            # password: gaming
sudo -iu postgres createdb --owner=gaming gaming_platform
sudo -iu postgres psql -c "ALTER DATABASE gaming_platform SET timezone TO 'UTC'"
```

Verify over TCP, exactly as the application connects:

```bash
psql "postgres://gaming:gaming@localhost:5432/gaming_platform?sslmode=disable" \
  -c "select current_database(), current_user, current_setting('TimeZone')"
```

## Run

```bash
make setup        # .env from .env.example, then npm ci
make tools        # pin golang-migrate into backend/bin
make migrate-up
make dev          # API on :8080, web on :5173

make seed         # create or reset the local admin named by SEED_USER_* in .env
```

`make help` lists every target. Ports: web 5173, API 8080, PostgreSQL 5432.

Use `localhost` everywhere, never `127.0.0.1`. They are different cookie hosts, and
mixing them presents as a session bug that is very hard to read.

## Scope

| Document | What it holds |
| --- | --- |
| `docs/phase-1-features.md` | the Phase 1 feature list |
| `docs/backend-services/` | the platform services spec, and where they stand |
| `docs/game-engine-integration/` | the engine and RTP spec — blocked on game source |
| `docs/games/` | per-game source assessments |
