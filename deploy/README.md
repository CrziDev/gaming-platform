# Deploying with Docker Compose

Three containers on one host: PostgreSQL, the Go API, and Caddy serving the built web
bundle while proxying `/api` to the API and terminating TLS.

```
internet ─▶ web (Caddy :443) ─┬─ /api/* ─▶ api :8080 ─▶ db :5432
                              └─ /*     ─▶ static bundle
```

Every command reads the host's env file: Compose through `--env-file`, the make targets
through `ENV_FILE`. Production uses `.env.prod`, as written below. Staging uses `.env.vps`
in its place, and that file sets `APP_ENV_FILE=.env.vps`; without it the api container
falls back to reading `.env.prod`.

## First deploy

```bash
git clone <repo> gaming-platform && cd gaming-platform
cp .env.prod.example .env.prod
nano .env.prod                      # DB_PASSWORD, SITE_ADDRESS, DATABASE_URL, SEED_ADMIN_EMAILS, SEED_USER_PASSWORD, origins

docker compose --env-file .env.prod up -d --build
make docker-migrate-up docker-bootstrap ENV_FILE=.env.prod
```

Point the domain's A record at the server before `up`; Caddy needs it to obtain
a certificate. For a plain-HTTP trial set `SITE_ADDRESS=:80`, `SESSION_SECURE=false`,
and `http://` origins.

## Each later deploy

```bash
git pull
docker compose --env-file .env.prod up -d --build
make docker-migrate-up ENV_FILE=.env.prod
```

## What persists

| Volume | Contents |
| --- | --- |
| `pgdata` | every account, wallet, and ledger row — back it up |
| `proofs` | uploaded deposit proof images |
| `caddy_data` | TLS certificates |

```bash
docker compose --env-file .env.prod exec db pg_dump -U gaming gaming_platform > backup.sql
docker compose --env-file .env.prod logs -f api
docker compose --env-file .env.prod exec db psql -U gaming gaming_platform
```
