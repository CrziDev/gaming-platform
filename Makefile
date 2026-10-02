# Gaming Platform -- one entry point for every routine task.
# Run `make help` for the list.

SHELL := /bin/bash
.DEFAULT_GOAL := help

# The host targets read .env. Real deployments inject the environment directly
# and never ship this file.
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

.PHONY: help docker-up docker-down docker-logs docker-ps docker-migrate-up docker-migrate-down \
        docker-migrate-version docker-bootstrap docker-seed-demo docker-seed docker-test-backend docker-db-shell \
        setup dev backend frontend install build build-backend build-frontend \
        test test-backend test-frontend lint lint-backend lint-frontend \
        fmt fmt-backend fmt-frontend tools bootstrap seed-demo seed simulate-plinko clean \
        migrate-up migrate-test-up migrate-down migrate-down-all migrate-create migrate-version migrate-force \
        db-shell db-reset publish

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'

## --- Docker ----------------------------------------------------------------

# The Compose stack is how the platform runs locally and in production. ENV_FILE
# selects the configuration: .env here, ENV_FILE=.env.prod on the server.
ENV_FILE ?= .env
COMPOSE := docker compose --env-file $(ENV_FILE)
COMPOSE_PROJECT := $(notdir $(CURDIR))

# Read lazily from ENV_FILE so the host targets below keep their own DATABASE_URL.
env_value = $(shell sed -n 's/^$(1)=//p' $(ENV_FILE))
DOCKER_DATABASE_URL = $(call env_value,DATABASE_URL)
DOCKER_TEST_DATABASE_URL = postgres://gaming:$(call env_value,DB_PASSWORD)@db:5432/gaming_platform_test?sslmode=disable

# Migrations come from the working tree, so a new one applies without rebuilding the image.
DOCKER_MIGRATE = $(COMPOSE) run --rm -v $(CURDIR)/$(MIGRATIONS_DIR):/migrations:ro --entrypoint /migrate api -path /migrations

docker-up: ## Build and start the stack (web on :8080)
	$(COMPOSE) up --build

docker-down: ## Stop the stack, keeping its data
	$(COMPOSE) down

docker-logs: ## Follow the stack's logs
	$(COMPOSE) logs -f

docker-ps: ## Show the stack's services
	$(COMPOSE) ps

docker-migrate-up: ## Apply pending migrations to the Compose database
	$(DOCKER_MIGRATE) -database "$(DOCKER_DATABASE_URL)" up

docker-migrate-down: ## Roll back the most recent migration on the Compose database
	$(DOCKER_MIGRATE) -database "$(DOCKER_DATABASE_URL)" down 1

docker-migrate-version: ## Print the Compose database's migration version
	$(DOCKER_MIGRATE) -database "$(DOCKER_DATABASE_URL)" version

docker-bootstrap: ## Ensure the initial admin and game catalogue exist in the Compose database
	$(COMPOSE) run --rm --entrypoint /seed api bootstrap

docker-seed-demo: ## Load guarded synthetic players, balances, and payment methods into the Compose database
	$(COMPOSE) run --rm --entrypoint /seed api demo

docker-seed: docker-bootstrap docker-seed-demo ## Bootstrap and load demo data in the Compose database

docker-test-backend: ## Run the Go tests in a container against gaming_platform_test in the Compose database
	@$(COMPOSE) exec -T db createdb -U gaming gaming_platform_test 2>/dev/null || true
	$(DOCKER_MIGRATE) -database "$(DOCKER_TEST_DATABASE_URL)" up
	docker run --rm --network $(COMPOSE_PROJECT)_default \
		-v $(CURDIR)/$(BACKEND_DIR):/src -w /src \
		-v $(COMPOSE_PROJECT)-gomod:/go/pkg/mod -v $(COMPOSE_PROJECT)-gobuild:/root/.cache/go-build \
		-e TEST_DATABASE_URL="$(DOCKER_TEST_DATABASE_URL)" -e REQUIRE_TEST_DATABASE=1 \
		golang:1.26 go test -race -count=1 -p 1 ./...

docker-db-shell: ## Open psql in the Compose database
	$(COMPOSE) exec db psql -U gaming gaming_platform

## --- Host development ------------------------------------------------------

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

bootstrap: ## Ensure the initial admin and game catalogue exist without resetting operator changes
	cd $(BACKEND_DIR) && go run ./cmd/seed bootstrap

seed-demo: ## Load guarded synthetic players, balances, and placeholder payment methods
	cd $(BACKEND_DIR) && go run ./cmd/seed demo

seed: ## Bootstrap and load local/staging demo data
	$(MAKE) --no-print-directory bootstrap
	$(MAKE) --no-print-directory seed-demo

simulate-plinko: ## Play every board of every Plinko RTP option through the production engine and report the observed return
	cd $(BACKEND_DIR) && go run ./cmd/gameverify simulate

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
