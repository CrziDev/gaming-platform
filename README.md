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

make bootstrap    # create the initial admin/catalogue when absent; preserve later operator changes
make seed-demo    # add the 18 synthetic players, balances, and placeholder payment methods
make seed         # run both commands for a complete local fixture
make test         # migrates and uses only TEST_DATABASE_URL (a *_test database)
```

`make help` lists every target. Ports: web 5173, API 8080, PostgreSQL 5432.

## Manual staging setup

Build the frontend with `VITE_API_BASE_URL=/api` when the web server proxies `/api`
to the Go service. Inject environment variables directly rather than copying the local
`.env`. At minimum, staging uses:

```dotenv
APP_ENV=staging
SESSION_SECURE=true
CORS_ALLOWED_ORIGINS=https://stage.example.com
PUBLIC_WEB_URL=https://stage.example.com
TRUST_PROXY_HEADERS=true
ALLOW_DEMO_SEED=true
```

Set unique `SEED_USER_PASSWORD` and `SEED_PLAYER_PASSWORD` secrets, apply migrations,
then run `make bootstrap seed-demo`. `bootstrap` never resets an existing administrator
or overwrites game settings. `seed-demo` is refused in production. Keep the API private
behind the trusted proxy when proxy-header trust is enabled. The deployment health check
is `GET /api/health`.

## Password-reset email

Email delivery is disabled by default, so local reset requests return `503`. For a
deployment using Resend, configure:

```dotenv
EMAIL_DELIVERY_PROVIDER=resend
PUBLIC_WEB_URL=https://play.example.com
RESEND_API_KEY=re_...
RESEND_FROM=HeziBet <security@example.com>
```

`PUBLIC_WEB_URL` must be HTTPS and `RESEND_FROM` must be a valid, verified sender. The
server fails startup when enabled delivery is incomplete or invalid. Reset links expire
after 30 minutes; the API stores only their SHA-256 hashes.
