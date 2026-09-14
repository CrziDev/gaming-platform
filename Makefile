# Gaming Platform -- one entry point for every routine task.
# Run `make help` for the list.

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Local development reads .env. Real deployments inject the environment directly
# and never ship this file. This block is also how DATABASE_URL reaches psql.
ifneq (,$(wildcard .env))
include .env
export
endif

BACKEND_DIR := backend
FRONTEND_DIR := frontend
MIGRATIONS_DIR := database/migrations

# The migration tool is pinned and installed into the repository so every
# developer and CI run uses the same version, without a global install.
BIN_DIR := $(CURDIR)/$(BACKEND_DIR)/bin
MIGRATE := $(BIN_DIR)/migrate
MIGRATE_VERSION := v4.19.1

DATABASE_URL ?= postgres://gaming:gaming@localhost:5432/gaming_platform?sslmode=disable

# ON_ERROR_STOP is not optional: without it psql reports failures and still
# exits 0, so a broken statement looks like a green build.
PSQL := psql "$(DATABASE_URL)" -v ON_ERROR_STOP=1

.PHONY: help setup dev backend frontend install build build-backend build-frontend \
        test test-backend test-frontend lint lint-backend lint-frontend \
        fmt fmt-backend fmt-frontend tools seed clean \
        migrate-up migrate-test-up migrate-down migrate-down-all migrate-create migrate-version migrate-force \
        db-shell db-reset publish

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

## --- Development -----------------------------------------------------------

setup: ## Create .env from the example and install frontend dependencies
	@test -f .env || cp .env.example .env
	$(MAKE) --no-print-directory install

dev: ## Run the API and the web app together
	@$(MAKE) --no-print-directory -j2 backend frontend

backend: ## Run the API on :8080
	cd $(BACKEND_DIR) && go run ./cmd/server

frontend: ## Run the web app on :5173
	cd $(FRONTEND_DIR) && npm run dev

install: ## Install frontend dependencies from the lock file
	cd $(FRONTEND_DIR) && npm ci

## --- Build -----------------------------------------------------------------

build: build-backend build-frontend ## Build the API binary and the web bundle

build-backend: ## Compile the API into backend/bin/server
	cd $(BACKEND_DIR) && go build -o bin/server ./cmd/server

build-frontend: ## Build the production web bundle
	cd $(FRONTEND_DIR) && npm run build

## --- Test and quality ------------------------------------------------------

test: test-backend test-frontend ## Run every test suite

test-backend: migrate-test-up ## Run the Go tests against the explicit test database
	# Packages share one PostgreSQL test database; serialize packages so one
	# package's fixture cleanup cannot race another package's financial tests.
	cd $(BACKEND_DIR) && REQUIRE_TEST_DATABASE=1 go test -race -count=1 -p 1 ./...

test-frontend: ## Run the web tests
	cd $(FRONTEND_DIR) && npm run test

lint: lint-backend lint-frontend ## Check formatting and static analysis

lint-backend: ## gofmt check and go vet
	@cd $(BACKEND_DIR) && unformatted=$$(gofmt -l .); \
		if [ -n "$$unformatted" ]; then \
			echo "gofmt needed:"; echo "$$unformatted"; exit 1; \
		fi
	cd $(BACKEND_DIR) && go vet ./...

lint-frontend: ## Type-check and lint the web app
	cd $(FRONTEND_DIR) && npm run typecheck && npm run lint

fmt: fmt-backend fmt-frontend ## Format the codebase

fmt-backend: ## Apply gofmt
	cd $(BACKEND_DIR) && gofmt -w .

fmt-frontend: ## Apply lint fixes to the web app
	cd $(FRONTEND_DIR) && npm run lint:fix

## --- Database --------------------------------------------------------------

migrate-up: $(MIGRATE) ## Apply all pending migrations
	$(MIGRATE) -path $(MIGRATIONS_DIR) -database "$(DATABASE_URL)" up

migrate-test-up: $(MIGRATE) ## Apply migrations to TEST_DATABASE_URL after a safety check
	@test -n "$(TEST_DATABASE_URL)" || { echo "TEST_DATABASE_URL is required (use a database whose name ends in _test)"; exit 1; }
	@[[ '$(TEST_DATABASE_URL)' != *dbname=* && '$(TEST_DATABASE_URL)' != *database=* ]] || { echo "refusing test migration: database override query parameters are not allowed"; exit 1; }
	@url='$(TEST_DATABASE_URL)'; url="$${url%%\?*}"; \
		[[ "$$url" == */*_test ]] || { echo "refusing test migration: database name must end in _test"; exit 1; }
	$(MIGRATE) -path $(MIGRATIONS_DIR) -database "$(TEST_DATABASE_URL)" up

migrate-down: $(MIGRATE) ## Roll back the most recent migration
	$(MIGRATE) -path $(MIGRATIONS_DIR) -database "$(DATABASE_URL)" down 1

# Every down migration, in reverse. CI runs it so a migration that cannot be
# undone is found before an incident needs it, not during one.
migrate-down-all: $(MIGRATE) ## Roll back every migration (destroys all data)
	$(MIGRATE) -path $(MIGRATIONS_DIR) -database "$(DATABASE_URL)" down -all

migrate-version: $(MIGRATE) ## Print the applied migration version
	$(MIGRATE) -path $(MIGRATIONS_DIR) -database "$(DATABASE_URL)" version

# Recovery only: it marks a version applied without running it. Never routine.
migrate-force: $(MIGRATE) ## Force the schema version, e.g. make migrate-force version=1
	@test -n "$(version)" || { echo "usage: make migrate-force version=<n>"; exit 1; }
	$(MIGRATE) -path $(MIGRATIONS_DIR) -database "$(DATABASE_URL)" force $(version)

migrate-create: $(MIGRATE) ## Create a migration pair, e.g. make migrate-create name=create_wallets
	@test -n "$(name)" || { echo "usage: make migrate-create name=<verb_object>"; exit 1; }
	$(MIGRATE) create -ext sql -dir $(MIGRATIONS_DIR) -seq $(name)

db-reset: ## Roll every migration back, re-apply, and re-seed
	$(MAKE) --no-print-directory migrate-down-all migrate-up seed

db-shell: ## Open a psql session against the development database
	psql "$(DATABASE_URL)"

seed: ## Create or reset the development admin, demo players, and game catalogue
	cd $(BACKEND_DIR) && go run ./cmd/seed

## --- Publishing ------------------------------------------------------------

# Day-to-day commits land on the work branch, Markdown included. Publishing merges
# work into master minus the local Markdown, pushes, and returns to work. A conflict
# outside those paths stops on master for a manual resolution.
LOCAL_MD := CLAUDE.md .claude docs ':(exclude)docs/frontend-pages.md'

publish: ## Merge work into master without the local Markdown, push, and return to work
	@test "$$(git branch --show-current)" = work || { echo "publish: switch to the work branch first"; exit 1; }
	@git diff --quiet && git diff --cached --quiet || { echo "publish: commit or stash your changes first"; exit 1; }
	@git switch -q master
	@git merge --no-ff --no-commit work >/dev/null 2>&1 || true
	@git rm -r -q -f --ignore-unmatch $(LOCAL_MD)
	@if git diff --name-only --diff-filter=U | grep -q .; then \
		echo "publish: conflicts on master need a manual resolution, then: git commit && git push && git switch work"; \
		git status --short; exit 1; fi
	@git commit -q -m "Merge branch 'work'"
	git push
	@git switch -q work

## --- Tooling ---------------------------------------------------------------

tools: $(MIGRATE) ## Install the pinned Go tools into backend/bin

$(MIGRATE):
	@mkdir -p $(BIN_DIR)
	GOBIN=$(BIN_DIR) go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@$(MIGRATE_VERSION)

clean: ## Remove build output and installed tools
	rm -rf $(BIN_DIR) $(BACKEND_DIR)/tmp $(FRONTEND_DIR)/dist $(FRONTEND_DIR)/coverage
