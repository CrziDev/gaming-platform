# Gaming Platform

Work in progress.

## Stack

| Side | Stack |
| --- | --- |
| API | Go 1.26 · `net/http` · `database/sql` · pgx driver · golang-migrate |
| Database | PostgreSQL 18 |
| Web | React 19 · TypeScript · Vite · Tailwind v4 · TanStack Query · React Hook Form · Zod · React Router |

## Requirements

Go 1.26+, Node 22+, PostgreSQL 18, and Make.

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
sudo -iu postgres createdb --owner=gaming gaming_platform_test
sudo -iu postgres psql -c "ALTER DATABASE gaming_platform SET timezone TO 'UTC'"
sudo -iu postgres psql -c "ALTER DATABASE gaming_platform_test SET timezone TO 'UTC'"
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

make seed         # create or reset the local admin (SEED_USER_*), 18 demo players, and 27 games
make test         # migrates and uses only TEST_DATABASE_URL (a *_test database)
```

`make help` lists every target. Ports: web 5173, API 8080, PostgreSQL 5432.
