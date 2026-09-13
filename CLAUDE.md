# Gaming Platform

## About

A mobile-first, real-money gaming platform.

A player holds one account and a wallet in each currency they use. They browse a
catalogue of games, fund a wallet, play, and see a transparent trail of every round and
every movement of money. Currencies never mix: nothing converts between them and no
total sums across them. Everything is designed for a phone first — the lobby
merchandises, the game page gets out of the way, and a balance is visible on every screen
without hunting for it.

Operators work from a separate console on the same platform: they review accounts, fund
and adjust wallets, work a deposit queue, configure games, and read an audit trail. Every
action that changes money is confirmed before it happens and recorded after.

## Tech

| Side | Stack |
| --- | --- |
| API | Go, `net/http`, `database/sql`, pgx driver, golang-migrate |
| Database | PostgreSQL |
| Web | React, TypeScript, Vite, Tailwind, TanStack Query, React Hook Form, Zod, React Router |

`make dev` · `test` · `lint` · `fmt` · `migrate-up` · `seed` · `db-reset`. `make help`
lists everything. Ports: web 5173, API 8080, PostgreSQL 5432.

Configuration reaches the server through its environment. The Makefile or the developer
shell loads `.env`; no application code reads a `.env` file.

## Rules

`.claude/rules/backend/` — `security.md` (money, sessions, passwords, CSRF; read this
first), `api.md` (the contract), `go-style.md`, `packages.md` (standard library first),
`database.md` (migrations and SQL).

`.claude/rules/frontend/` — `system-design.md` (tokens, type, spacing, motion),
`react-style.md` (structure, server state, forms, money at the render boundary).

## Commits

Commits are made on the `work` branch and include every changed file, `CLAUDE.md`,
`.claude/rules/`, and `docs/` alongside the code; nothing is left out on its own.
`make publish` is the only path to `master`: it merges `work` without those Markdown
files and pushes. `docs/frontend-pages.md` is the one doc that is published.
