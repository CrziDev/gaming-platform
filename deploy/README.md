# Deploying with Docker Compose

Four containers on one host: PostgreSQL, the Go API, and Caddy serving the built web
bundle while proxying `/api` to the API and terminating TLS.

```
internet ─▶ web (Caddy :443) ─┬─ /api/* ─▶ api :8080 ─▶ db :5432
                              └─ /*     ─▶ static bundle
```

## First deploy

```bash
git clone <repo> gaming-platform && cd gaming-platform
cp .env.prod.example .env.prod
nano .env.prod                      # DB_PASSWORD, SITE_ADDRESS, DATABASE_URL, SEED_USER_*, origins

docker compose up -d --build
docker compose run --rm api /migrate -path /migrations -database "$DATABASE_URL" up
docker compose run --rm api /seed bootstrap
```

Point the domain's A record at the server before `up`; Caddy needs it to obtain
a certificate. For a plain-HTTP trial set `SITE_ADDRESS=:80`, `SESSION_SECURE=false`,
and `http://` origins.

## Each later deploy

```bash
git pull
docker compose up -d --build
docker compose run --rm api /migrate -path /migrations -database "$DATABASE_URL" up
```

## What persists

| Volume | Contents |
| --- | --- |
| `pgdata` | every account, wallet, and ledger row — back it up |
| `proofs` | uploaded deposit proof images |
| `caddy_data` | TLS certificates |

```bash
docker compose exec db pg_dump -U gaming gaming_platform > backup.sql
docker compose logs -f api
docker compose exec db psql -U gaming gaming_platform
```
