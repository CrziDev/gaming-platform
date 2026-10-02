# Gaming Platform

Work in progress.

## Stack

| Side | Stack |
| --- | --- |
| API | Go 1.26 · `net/http` · `database/sql` · pgx driver · golang-migrate |
| Database | PostgreSQL 18 |
| Web | React 19 · TypeScript · Vite · Tailwind v4 · TanStack Query · React Hook Form · Zod · React Router |

## Requirements

Docker with Compose v2, and Make. Node 22+ for the frontend tests and lint; Go 1.26+
only to run the host targets that CI uses.

## Run

The platform runs as a Docker Compose stack: PostgreSQL, the Go API, and Caddy serving
the web bundle and proxying `/api`. Only Caddy publishes a port.

```bash
cp .env.example .env
make docker-up               # build and start; the site is http://localhost:8080
make docker-migrate-up       # apply pending migrations from database/migrations
make docker-seed             # bootstrap the admin and catalogue, then the demo players

make docker-test-backend     # Go tests against gaming_platform_test in the Compose database
make test-frontend lint-frontend
make docker-db-shell         # psql in the Compose database
make docker-down             # stop, keeping the data
```

`make docker-bootstrap` never resets an existing administrator or overwrites operator
changes; `make docker-seed-demo` adds the 18 synthetic players, balances, and placeholder
payment methods and is refused in production. The api image is rebuilt by
`make docker-up`; migrations are read from the working tree, so a new one applies
without a rebuild.

`make help` lists every target. The ones without the `docker-` prefix run on the host
against `DATABASE_URL` and `TEST_DATABASE_URL`; CI uses them with its own PostgreSQL
service.

## Staging and production

Both run the same Compose stack from `.env.prod`; see `deploy/README.md`. Staging differs
in these values:

```dotenv
APP_ENV=staging
CORS_ALLOWED_ORIGINS=https://stage.example.com
PUBLIC_WEB_URL=https://stage.example.com
ALLOW_DEMO_SEED=true
```

Set unique `SEED_USER_PASSWORD` and `SEED_PLAYER_PASSWORD` secrets, apply migrations,
then run `make docker-bootstrap docker-seed-demo ENV_FILE=.env.prod`. The deployment
health check is `GET /api/health`.

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
