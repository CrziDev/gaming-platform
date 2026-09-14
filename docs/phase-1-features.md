# Phase 1 Delivery Checklist

This is the master delivery checklist for Phase 1. It replaces the former high-level
feature list and separates platform work that can be completed now from work that must
wait for the actual games and their engines.

Detailed behavior remains authoritative in:

- [`backend-services/SPEC.md`](backend-services/SPEC.md) for platform services;
- [`game-engine-integration/SPEC.md`](game-engine-integration/SPEC.md) for engine and
  per-game integration;
- [`.claude/rules/backend/api.md`](../.claude/rules/backend/api.md) for the HTTP contract;
- [`.claude/rules/backend/security.md`](../.claude/rules/backend/security.md) for
  financial and security invariants;
- [`frontend-pages.md`](frontend-pages.md) for every frontend page and its backend coverage.

Use `[x]` only when the implementation and its required tests are complete. A page that
works only against frontend fixtures is not complete.

Reconciled against `master` on 2026-09-12, after the v2 interface rebuild. This status is
based on reachable routes, repository/service code, frontend transport code, and automated
tests—not on the presence of a table or a fixture-backed screen alone.

Fixture-only surfaces (catalogue, big wins, promotions, favorites, live chat,
notifications, console alerts, games, rounds, RTP, staff) render only in the development
demo (`VITE_API_MOCK=true`) and in component tests. Outside those two modes every
fixture-backed read returns nothing and its section does not render, so a real deployment
never shows a fabricated win, promotion, or alert.

## Current state

- [x] PostgreSQL schema and reversible migrations exist for every Phase 1 table.
- [x] Registration, login, logout, session lookup, and development admin seeding exist.
- [x] The player and admin interfaces exist and can be exercised with mock data.
- [x] Shared application routing, HTTP helpers, and filter pagination are in place.
- [x] Enabled currencies and paginated admin users have real platform APIs.
- [x] Admin wallet adjustments and filtered admin transaction history have real APIs.
- [x] Player payment-method and deposit-request APIs are backed by PostgreSQL.
- [x] Admin deposit review APIs credit or reject requests atomically with audit entries.
- [x] The currency-scoped admin dashboard summary is backed by PostgreSQL.
- [ ] Platform APIs replace the remaining frontend mocks (supported auth, wallet, deposit,
  dashboard, admin-user listing/detail/status, admin transactions, wallet adjustments,
  audit reads, the public catalogue, game administration, and RTP profiles now default
  to HTTP; rounds, favorites, promotions, big wins, live chat, notifications, alerts,
  staff, and settings remain fixture-backed or undefined).
- [ ] Financial services and their PostgreSQL concurrency tests are complete.
- [ ] The platform satisfies the pre-engine readiness gate in this document.
- [ ] Complete game source is available for the first title.
- [ ] Any game engine or real-money game integration is complete.

## Start here next: round records

Round persistence is platform work and the last engine-gate prerequisite the platform
itself owns. It must not expose a player-controlled settle operation or invent an
outcome while no engine exists; an internal deterministic test adapter exercises it.

- [ ] Implement internal open, settle, cancel, and fail operations with the wallet lock,
  the unique round key, and settle-at-most-once (§8).
- [ ] Add `GET /api/rounds`, `GET /api/rounds/{id}`, and `GET /api/admin/rounds`.
- [ ] Wire the History rounds tab, `/admin/rounds`, and the game page's recent rounds,
  and add a rounds section to the user detail page (the admin adapter carries an
  unused `fetchUserRounds`; no page reads it).
- [ ] Cover the required round tests in §8.

Deferred by decision on 2026-09-12: password reset and change (`POST /api/password-reset`,
`/password-reset/confirm`, `/password`). The `password_reset_tokens` table exists and
`/forgot` and `/reset` already call the contracted endpoints; the open question is how a
reset token reaches the player.

## Completed slice: game and RTP-profile administration

Completed on 2026-09-12. `internal/game` gained the admin list, detail, create, and
patch routes; `internal/rtp` owns profile drafts, edits, listing, and the activation
rule. The console creates and edits games and drafts profiles against PostgreSQL.

- [x] `GET /api/admin/games`, `GET /api/admin/games/{id}`, `POST /api/admin/games`,
  `PATCH /api/admin/games/{id}` with whole-unit wager validation and audit entries.
- [x] `GET`/`POST /api/admin/games/{id}/rtp-profiles`, `GET /api/admin/rtp-profiles`,
  `PATCH /api/admin/rtp-profiles/{id}`, `POST /api/admin/rtp-profiles/{id}/activate`.
- [x] Game create and edit forms, draft-profile forms, and the real activation dialog.
- [x] HTTP/PostgreSQL coverage for authorisation, validation, slug and name/version
  conflicts, catalogue visibility after a status change, the unverified-activation
  refusal, the activation swap, the negative-margin end-time rule, and audit actions.

## Completed slice: public catalogue reads

Completed on 2026-09-12. `internal/game` serves the seeded catalogue from PostgreSQL;
the lobby, catalogue, shelves, search, and game page read it with `VITE_API_MOCK=false`.
Real launch stays disabled until the engine gate is satisfied.

- [x] Add paginated `GET /api/games` with category, search, and sort behavior.
- [x] Add `GET /api/games/{slug}` with active-game and `404` behavior.
- [x] Return category availability and game counts from PostgreSQL.
- [x] Wire the lobby and game-catalogue screens to the real read APIs without enabling
  real-money launch.
- [x] Cover public visibility, filtering, disabled games, invalid input, and missing slugs
  with HTTP/PostgreSQL tests.
- [x] Honor `type`, `from`, and `to` on the player transaction list, which parsed and
  then ignored them, so the history tabs and date range filter on the server.

## Completed slice: admin account operations and audit reads

Completed on 2026-09-12 after reconciliation against the API contract, frontend types,
route wiring, and automated HTTP/PostgreSQL coverage.

- [x] Replace the fixture-only `AdminUserRecord` shape with the contracted account body
  plus a separate wallet list; do not synthesize one account currency or unavailable
  30-day round statistics.
- [x] Hide or explicitly mark the round, session, verification, and operator password-reset
  controls unavailable until their contracts and services exist.
- [x] Add `GET /api/admin/users/{id}` with administrator-only access and `404` behavior.
- [x] Add `PATCH /api/admin/users/{id}/status` with self-change and closed-account guards.
- [x] Add `GET /api/admin/users/{id}/wallets` using the existing wallet provisioning code.
- [x] Extend `GET /api/admin/deposits` to honor `user_id` and
  `status=all|pending|approved|rejected` as the contract requires.
- [x] Add paginated `GET /api/admin/audit-logs` reads without adding mutation routes.
- [x] Wire the user-detail and audit screens to those APIs, reusing admin transaction
  filtering for adjustment history.
- [x] Cover anonymous, player, administrator, invalid-ID, missing-user, self-status-change,
  closed-account, suspension-next-request, and audit-record behavior with HTTP/PostgreSQL
  tests.

## 1. Contract alignment

Resolve these differences before wiring the affected frontend screens to the API. Each
decision must update the API contract, frontend types, and implementation together.

- [x] A player may not cancel a pending deposit; it remains pending for administrator
  approval or rejection, and there is no cancellation endpoint.
- [x] Enabled currency resources expose the server-owned minimum and maximum deposit
  amounts used by the frontend.
- [ ] Decide whether Phase 1 includes notifications and marking them read; both are
  currently fixture-only.
- [ ] Define the cash-out / withdrawal contract (request, admin review, audit); the wallet
  page links to an honest placeholder at `/wallet/cash-out` until it exists.
- [ ] Define the wallet-summary response. The history page no longer derives totals on
  the client (that summed across currencies with JavaScript arithmetic); it shows none
  until the server reports them.
- [ ] Define or remove fixture-only console alerts (hidden outside the demo meanwhile).
- [ ] Decide whether staff-account management is Phase 1; the admin UI currently reads
  fixture staff accounts.
- [x] Define admin payment-method management endpoints, or make payment methods
  seed/configuration-only for Phase 1.
- [x] Add the proof-upload HTTP contract, limits, and error behavior if screenshot upload
  remains in Phase 1.
- [ ] Reconcile every frontend response type with the API resource and page shapes
  (`Game`, `Category`, `AdminGame`, and `RtpProfile` are reconciled; `Transaction`,
  `AuditEntry`, and `AdminDeposit` are mapped in the adapter, and `Transaction` still
  carries a `label`, `reference`, `status`, and `round_id` the server does not send;
  `Round` waits for its endpoints).
- [x] Keep lobby rows client-derived unless merchandising configuration is explicitly
  added to scope.
- [ ] Decide whether the v2 lobby's merchandising surfaces — big wins, promotions, and the
  hot shelf — are Phase 1. They are fixture-only today, hidden outside the demo, and
  `backend-services/SPEC.md` still states merchandising is not a Phase 1 surface. The
  new shelf is real: a game is `new` for thirty days after it is added.
- [ ] Decide whether favorites and the live chat rail are Phase 1; both are fixture-only
  and hidden outside the demo, and neither has a contract.
- [ ] Decide what the Support link, the language selector, and the console search box
  do in Phase 1. The link points at a placeholder host, the "English" button and the
  "Search player, ref or round id" input have no handler, and none has a contract.

## 2. Foundations and schema

### Database

- [x] `users` migration with normalized email, role, and account-status constraints.
- [x] `auth_sessions` migration with hashed-token storage.
- [x] `password_reset_tokens` migration.
- [x] `currencies` migration with PHP and USD seed records.
- [x] `wallets` migration with one wallet per user and currency.
- [x] `wallet_transactions` migration with ledger and idempotency constraints.
- [x] `game_categories` and `games` migrations.
- [x] `rtp_profiles` migration with one-active-profile constraint.
- [x] `game_rounds` migration with unique round keys and settlement constraints.
- [x] `payment_methods` and `deposit_requests` migrations.
- [x] Append-only `audit_logs` migration.
- [x] Every migration has a working down migration.

### Application structure

- [x] Move the route table and middleware assembly to `internal/app`.
- [x] Move response, error, JSON, and pagination helpers to `internal/httpx`.
- [x] Use the API's resource, error, and page shapes consistently on every route.
- [x] Return the standard not-found response for every unknown path.
- [x] Implement common parsing for page, size, search, status, type, currency, game,
  and date filters.
- [x] Enforce a default page size of 20 and maximum of 100.
- [x] Add `GET /api/currencies` for enabled currency metadata.
- [ ] Move database and HTTP server lifecycle ownership from `cmd/server` to
  `internal/app`, leaving the command as `main` only.
- [ ] Move the `auth_sessions` SQL (create, find by token hash, revoke one) from
  `internal/auth/session.go` into `internal/user` beside the revoke-all on suspension,
  so the session rows sit with the account as `go-style.md` describes.

## 3. Accounts and access

### Already implemented

- [x] Player registration.
- [x] Player and admin login through the shared login endpoint.
- [x] Logout and session revocation.
- [x] `GET /api/me`.
- [x] Argon2id password hashing with a per-password salt.
- [x] Constant-time password verification.
- [x] Opaque 32-byte session tokens, hashed at rest.
- [x] HttpOnly session cookie.
- [x] Indistinguishable login failures and matched work for an unknown email.
- [x] Per-process rate limiting on registration and login.
- [x] `make seed` creates or restores the development administrator.

### Remaining accounts work

- [ ] Request a password reset without revealing whether the email exists.
- [ ] Deliver reset tokens through a production-ready email mechanism.
- [ ] Confirm a password reset with a hashed, expiring, single-use token.
- [ ] Revoke all other sessions after a successful password reset.
- [ ] Change password using the current password.
- [ ] Revoke all other sessions after a password change.
- [x] Return a paginated, searchable, status-filtered admin user list.
- [x] Return an individual admin user detail record.
- [x] Suspend and reinstate accounts.
- [x] Make suspension effective on the account's next request.
- [x] Audit every operator account-status change.
- [ ] Define and implement the player profile fields that can be edited, if profile
  editing remains in Phase 1 (the Account page has no edit control today, and its
  Status badge is a hardcoded "Active" because the player account body carries no
  status).
- [x] Test anonymous, player, admin, suspended, and closed-account boundaries.

## 4. Wallets and immutable ledger

The core player wallet and immutable-ledger slice, including the administrator-scoped
wallet list needed by account details, is complete.

- [x] Provision one wallet per enabled currency on first access.
- [x] Permit a player to hold PHP and USD wallets at the same time.
- [x] Write no ledger movement when an empty wallet is provisioned.
- [x] Prevent transfers and conversions between currencies.
- [x] List a player's wallets.
- [x] Return or provision one wallet by currency.
- [x] Let an administrator list/provision a user's wallets.
- [x] Represent every amount as signed `int64` minor units with a currency.
- [x] Reject money arithmetic that would overflow.
- [x] Lock the wallet row with `SELECT ... FOR UPDATE` before changing its balance.
- [x] Write exactly one immutable ledger row in the same transaction as every balance
  change.
- [x] Prevent a balance from becoming negative.
- [x] Reject movements against frozen or closed wallets.
- [x] Reject currency mismatches.
- [x] Make retryable movements idempotent, backed by the unique database index.
- [x] Never update or delete a ledger row; correct mistakes with compensating movements.
- [x] Return player transaction history for a wallet.
- [x] Return filtered, paginated transaction history to administrators.
- [x] Show the active wallet balance throughout the authenticated player interface, with
  the switch between held wallets on the wallet page.

### Required wallet tests

- [x] Credit updates the balance and writes one ledger row atomically.
- [x] Debit updates the balance and writes one ledger row atomically.
- [x] An insufficient debit changes neither balance nor ledger.
- [x] A failed ledger insert rolls back its balance update.
- [x] Two concurrent debits cannot overspend one wallet.
- [x] Two concurrent requests with one idempotency key create one movement.
- [x] Frozen-wallet, currency-mismatch, and overflow paths are covered.
- [x] Database-backed money tests run against PostgreSQL and are required in CI.

## 5. Operator money operations and audit

- [x] Administrator can manually credit a wallet.
- [x] Administrator can manually debit a wallet.
- [x] A confirmation prompt appears before either adjustment.
- [x] Every adjustment requires a non-empty reason.
- [x] The acting administrator is stored with the movement.
- [x] The adjustment and audit entry commit in the same transaction.
- [x] The admin transaction list supports user, currency, kind, and date filters.
- [x] Expose the append-only audit log through a paginated read endpoint.
- [x] Audit entries capture actor, action, entity, and before/after state.
- [x] No endpoint updates or deletes an audit record.

## 6. Manual deposits

- [x] List enabled payment methods such as GCash and Maya.
- [x] Show payment instructions and destination details.
- [x] Validate the selected method, wallet, currency, amount, and required reference on
  the server.
- [x] Enforce server-owned minimum and maximum deposit amounts per currency.
- [x] Submit a deposit request with an idempotency key.
- [x] Return the original request when a submission is retried.
- [x] List a player's deposit requests.
- [x] Return one player-owned deposit request without leaking another player's record.
- [x] Show pending, approved, and rejected status.
- [x] Return a paginated oldest-first pending queue to administrators.
- [x] Allow an administrator to approve a pending request once.
- [x] Credit the wallet, create the deposit movement, update the request, and write the
  audit entry in one database transaction.
- [x] Allow an administrator to reject a pending request once.
- [x] Require and preserve a rejection reason.
- [x] Prevent two concurrent approvals from crediting twice.

### Deposit proof upload, if retained

- [x] Accept only an explicit image MIME allowlist verified from file content.
- [x] Enforce a small request and file-size limit.
- [x] Generate the stored filename on the server.
- [x] Store proof outside any publicly served directory.
- [x] Authorize private proof retrieval for administrators only.
- [x] Never log proof contents or untrusted filenames.

## 7. Game catalogue and management

These features do not require an engine.

- [x] List active games in the public catalogue.
- [x] Return one public game by slug.
- [x] List categories with availability and game counts.
- [x] Support catalogue category, search, and sort behavior.
- [x] Show draft, active, maintenance, and retired games to administrators.
- [x] Create a game record through the admin interface.
- [x] Edit game metadata and availability through the admin interface.
- [x] Configure one currency per game.
- [x] Configure minimum, maximum, and exact wager step in minor units.
- [x] Require whole-unit wager bounds for Phase 1 games (enforced on create and edit;
  the seed now uses whole units too).
- [x] Audit game creation and status changes.
- [ ] Reject a wager when its game is not active.
- [ ] Replace fixture art with reviewed game thumbnails when assets arrive (the tile
  renders `frontend/src/assets/games/<slug>.png` or `thumbnail_url` when present).
- [ ] Keep the real game launch disabled until its integration passes the engine gate
  (nothing launches today; the game page's bet panel is a display slot and Place bet
  only raises a toast).

## 8. Round and betting infrastructure

Round persistence is platform work and can be implemented now. It must not expose a
player-controlled settle operation or invent an outcome while no engine exists.

- [ ] Implement internal open, settle, cancel, and fail operations.
- [ ] Lock the wallet before inserting a round that references it.
- [ ] Bind a round to its user, game, wallet, currency, and active RTP profile.
- [ ] Validate the wager against game minimum, maximum, and exact step.
- [ ] Debit the wager and create the open round in one transaction.
- [ ] Use a unique round key to prevent duplicate bets.
- [ ] Credit a positive win and settle the round in one transaction.
- [ ] Record a zero win without creating a zero-value movement.
- [ ] Permit settlement only from the open state.
- [ ] Enforce one settlement with a conditional update and database constraints.
- [ ] Implement a compensating refund for cancelled or failed rounds.
- [ ] Ensure concurrent round starts on one wallet do not deadlock.
- [ ] List a player's rounds with pagination.
- [ ] Return one player-owned round without leaking another player's record.
- [ ] Return filtered, paginated round history to administrators.
- [x] Do not add player-facing open or settle endpoints before the engine boundary is
  defined.

### Required round tests

- [ ] Duplicate open requests return one round and deduct one wager.
- [ ] Concurrent starts on one wallet do not deadlock or overspend.
- [ ] Concurrent settlements credit at most once.
- [ ] A second settlement returns `ROUND_ALREADY_SETTLED`.
- [ ] Cancellation/refund is idempotent.
- [ ] A profile change does not alter an already-open round.

## 9. RTP metadata and administration

Metadata can be built now; verified mathematical behavior cannot.

- [x] Create a draft RTP profile with game, name, version, and target basis points.
- [x] Support the Phase 1 target set: 92%, 94%, 96%, 100%, 102%, and 105%, where the
  eventual game mathematics can actually implement and verify each target.
- [x] Edit draft profiles only.
- [x] List all profiles for an admin-selected game.
- [x] Preserve verified profiles as immutable versions.
- [x] Show the currently active profile.
- [x] Model an optional activation start and end time.
- [ ] Implement automatic reversion to the verified default profile (the window is
  stored and a replaced profile returns to `verified`; nothing yet acts when
  `effective_until` passes).
- [ ] Record profile creation, editing, scheduling, activation, and reversion in the
  audit log (all but reversion are recorded).
- [x] Refuse activation of every unverified profile with
  `RTP_PROFILE_NOT_VERIFIED`.
- [x] Provide no platform operation that can mark a profile verified without engine
  evidence.
- [ ] Do not claim theoretical or observed RTP before verification.

## 10. Frontend integration

### Shared behavior

- [ ] Replace remaining fixture APIs with real HTTP calls while retaining deliberate test mocks.
- [x] Make non-mock mode the production default.
- [ ] Validate runtime responses where an untrusted payload crosses into the app.
- [x] Handle standard API errors without matching human-readable error text (the wired
  deposit, review, adjustment, and status mutations act on status and `code`; the
  remaining fixture-backed surfaces have no server errors to handle yet).
- [ ] Provide consistent loading, empty, retry, validation, and unavailable states.
- [x] Invalidate wallet, deposit, transaction, round, and dashboard queries after the
  corresponding mutation (a deposit submission invalidates deposits and transactions;
  every console mutation invalidates the whole `admin` tree, and a game change the
  catalogue keys too; round queries follow §8).
- [ ] Confirm desktop and mobile keyboard, focus, and screen-reader behavior.

### Shell

- [x] The header balance chip shows the active wallet's real balance on every
  authenticated route.
- [x] The search sheet (`⌘K`, rail, drawer) searches the real catalogue and hands off to
  `/games?q=`.
- [x] `/login` and `/register` open the auth modal over the lobby, and a guest who picks
  a game or a locked nav item returns there after signing in.
- [x] The session-expired dialog is raised when a live session stops being recognised
  and never on a deliberate sign-out.
- [x] The console navigation badge carries the real pending deposit total.
- [ ] Live chat and notifications are fixture-only and hidden outside the demo; see
  contract alignment.
- [ ] The Support link, language selector, and console search box are unwired chrome;
  see contract alignment.

### Public and player routes

- [ ] Lobby `/` is backed by the real catalogue and player history where applicable (the
  catalogue, categories, and featured banner are real; recently-played rows wait for
  round history, and big wins and promotions are fixture-only).
- [x] Game catalogue `/games` is backed by the real catalogue API.
- [x] Sign in `/login` uses the real session API.
- [x] Registration `/register` uses the real account API.
- [ ] Forgot password `/forgot` uses the real reset-request API (the page calls the
  contracted endpoint and reports that reset is unavailable while the server answers
  `404`).
- [ ] Reset password `/reset` uses the real reset-confirmation API (same: wired to the
  contract, honest until the server implements it).
- [x] Game host `/game/:slug` loads real metadata and the game's own wallet and safely
  reports unavailable games (recent rounds and the favorite toggle are fixture-only).
- [x] Wallet `/wallet` uses real wallets and balances.
- [x] Deposit `/wallet/deposit` uses real methods, limits, and submission.
- [x] Deposit status `/wallet/deposit/:id` uses the real player-owned request.
- [ ] History `/history` uses real transaction and round history (transactions are real;
  round history remains fixture-backed until round APIs exist).
- [ ] Account `/account` uses real account and password operations (account and wallets
  are real; the password change control is absent until `POST /api/password` exists,
  and the Status badge is hardcoded).
- [x] New `/games/new` is backed by the real catalogue's thirty-day `new` flag.
- [ ] Hot `/games/hot`, Favorites `/favorites`, and Promotions `/promotions` are
  fixture-only and hidden outside the demo; see contract alignment.
- [x] Not found `*` presents the intended application state.

### Admin routes

- [x] Admin sign in `/admin/login` uses the real session API and role check.
- [x] Dashboard `/admin` uses real currency-scoped summary data with an operator-selected
  currency; fixture alerts render only in the demo.
- [x] Deposits `/admin/deposits` uses the real review queue.
- [x] Users `/admin/users` uses real paging, search, and status filters.
- [x] User status mutations use the real API.
- [x] User details `/admin/users/:id` uses real wallets, deposits, and adjustments;
  it has no rounds or sessions section until those read endpoints exist.
- [x] Transactions `/admin/transactions` uses the real filtered ledger (the Rounds tab
  is empty until round APIs exist).
- [ ] Rounds `/admin/rounds` uses real filtered round records (fixture-only; empty
  outside the demo).
- [x] Games `/admin/games` uses real catalogue administration (the contract's `status`,
  `category`, and `search` filters are not yet exposed in the UI).
- [x] Game details `/admin/games/:id` uses real game and profile metadata.
- [x] RTP profiles `/admin/rtp` enforces the unverified-profile boundary.
- [x] Audit log `/admin/audit` uses the real append-only audit feed.
- [ ] Settings `/admin/settings` contains only settings backed by an agreed Phase 1
  contract (Payment methods and Staff read fixture-only and show an explanatory empty
  state outside the demo; Limits and Platform are static forms whose Save, Add method,
  and Invite staff buttons have no handler).

## 11. Generic game host and bridge

The transport shell can be built and tested with a non-financial harness before a game
arrives. Its final message set must still be reviewed against the first real title.

- [ ] Define a versioned `postMessage` protocol and runtime schemas.
- [ ] Restrict messages by exact origin and expected source window.
- [ ] Reject unknown versions, message types, and payload fields.
- [ ] Let the host provide authenticated player context without exposing session tokens.
- [ ] Let the host provide permitted game and wager configuration.
- [ ] Let the host display server-returned balance and round results.
- [ ] Ensure the embedded frame cannot directly mutate a wallet or settle a round.
- [ ] Implement timeout, retry-safe, unavailable, and session-expired states.
- [ ] Test the bridge with a deterministic, non-wagering harness.
- [ ] Revalidate the protocol after reviewing the first complete game source.

## 12. Dashboard, reporting, and history

- [x] Build the currency-scoped admin dashboard endpoint.
- [x] Never sum money across currencies.
- [x] Report pending deposits and held amount.
- [x] Report approved deposits for the dashboard's fixed today period.
- [x] Report staked and returned amounts only from authoritative ledger/round data.
- [x] Report player and round counts.
- [ ] Label RTP as target, theoretical, or observed; the dashboard currently labels the
  ledger-derived observed value as “Effective”.
- [ ] Provide player transaction and round history (transactions with type and date
  filters are real; rounds wait for §8).
- [ ] Provide administrator search and filters across users, transactions, deposits,
  rounds, games, and audit entries.

## 13. Security and privacy

- [x] Limit request-body size globally.
- [x] Recover from panics without exposing internals.
- [x] Apply structured request logging.
- [x] Check the Origin allowlist on state-changing requests, refusing a write that carries
  no `Origin` at all.
- [x] Centralize authentication and per-route player/admin authorization guards as
  `auth.Handler.Player` and `auth.Handler.Admin`, applied in the `internal/app` route
  table; a route sweep test proves every guarded route answers `401` anonymously and
  every admin route `403` to a player.
- [ ] Re-check resource ownership in services that access money or private records.
- [x] Return `404` rather than revealing another player's resource (wallets and deposits;
  rounds follow when they exist).
- [ ] Validate all identifiers, enums, money, timestamps, and pagination input.
- [ ] Keep passwords, hashes, raw session/reset tokens, proof contents, and RNG state out
  of logs.
- [ ] Configure secure cookies and trusted origins for production.
- [ ] Review rate limiting for a multi-instance deployment.
- [ ] Add dependency, static-analysis, and secret-scanning checks to CI.
- [ ] Complete a pre-release authorization and financial-invariant review.

## 14. Observability and operations

- [ ] Attach a request ID to requests, responses, and log records.
- [ ] Log user, wallet, transaction, game, round, and safe idempotency references where
  relevant.
- [ ] Log committed financial transitions with amount and currency.
- [ ] Add health and readiness checks.
- [ ] Add database migration checks to deployment.
- [ ] Define production environment configuration and secret handling.
- [ ] Define database backup, restore, and retention procedures.
- [ ] Add error-rate, latency, deposit-queue, and failed-round monitoring.
- [ ] Document incident handling and financial reconciliation.
- [ ] Document deployment and rollback procedures.

## 15. End-to-end pre-engine scenarios

- [x] Register, log in, read the session, and log out.
- [x] An administrator credits a wallet and the player sees one matching movement.
- [x] An administrator debits a wallet and the player sees one matching movement.
- [x] An excessive debit fails without changing the balance or ledger.
- [x] A deposit is submitted, approved once, and appears as one wallet credit.
- [x] A rejected deposit preserves its reason and never moves money.
- [x] A suspended account loses access on its next request.
- [ ] A player cannot read another player's wallet, deposits, rounds, or account data.
- [x] Catalogue and game availability changes appear correctly to players.
- [ ] A round can be opened and settled through an internal deterministic test adapter,
  with one wager and at most one win movement.
- [ ] A failed test round follows the compensating refund path.
- [ ] Every operator mutation produces its required audit entry (wallet, deposit,
  account status, game, and RTP profile mutations do; rounds and reversion remain).

## 16. Blocked until complete game source arrives

Do not satisfy these boxes with placeholder mathematics. A stored percentage or a random
stub is not a game engine and is not RTP verification.

### Engine entry gate

All of these platform prerequisites must be complete before real engine integration
starts:

- [x] Wallet movements are row-locked, idempotent, and ledger-backed.
- [ ] Round opening and settlement enforce settle-at-most-once.
- [x] RTP profile metadata enforces at most one active profile per game.
- [ ] The generic game host and secured `postMessage` bridge are ready.
- [ ] Whole-unit wager steps are enforced by game configuration and round validation
  (game configuration enforces them; round validation follows with §8).

### Source intake and assessment, per game

- [ ] Obtain the complete, licensed game source and all assets and dependencies.
- [ ] Commit the untouched source separately.
- [ ] Run the game exactly as supplied.
- [ ] Document its build and runtime requirements.
- [ ] Trace its network requests and external dependencies.
- [ ] Trace wager to outcome, payout, and balance mutation.
- [ ] Locate RNG, probabilities, weights, paytables, bonus rules, and RTP logic.
- [ ] Locate browser storage and any internal wallet implementation.
- [ ] Write the feasibility report.
- [ ] Select adapter, targeted modification, port, or rebuild based on evidence.

### Engine implementation, per game

- [ ] Generate unpredictable outcomes with the approved server-side RNG design.
- [ ] Make the server authoritative for outcome and payout.
- [ ] Implement exact game rules, probability weights, and paytables from reviewed
  source.
- [ ] Use integer arithmetic on the path that moves money.
- [ ] Map the authoritative result to the game's animation without a visual/financial
  mismatch.
- [ ] Remove or neutralize the game's browser-authoritative wallet and payout logic.
- [ ] Connect the engine to the internal round and wallet services.
- [ ] Define crash recovery for every wager/outcome/settlement boundary.
- [ ] Confirm refreshes, retries, duplicate input, and concurrent input cannot duplicate
  a wager or payout.

### RTP implementation and verification, per game/profile

- [ ] Bind each profile to an immutable engine configuration version.
- [ ] Prove theoretical RTP from the exact probability and payout model where possible.
- [ ] Run a headless simulation through the production outcome path.
- [ ] Choose sample size and tolerance appropriate to the game's volatility.
- [ ] Record total wagered, total returned, observed RTP, confidence interval, runtime,
  engine version, and verification timestamp.
- [ ] Mark a profile verified only after its evidence passes review.
- [ ] Confirm changing a profile changes real mathematical behavior, not just a label.
- [ ] Activate and schedule only implemented, verified profiles.

### Game delivery, per title

- [ ] Launch the game from the authenticated platform host.
- [ ] Associate every round with the correct player, wallet, currency, game, and profile.
- [ ] Validate wagers server-side.
- [ ] Record one authoritative round for every accepted wager.
- [ ] Deduct the wager atomically and credit the win at most once.
- [ ] Keep displayed balance synchronized with the server.
- [ ] Make round and movements visible in player and admin history.
- [ ] Pass supported mobile and desktop browser testing.
- [ ] Document source assumptions, modifications, and operational requirements.
- [ ] Integrate game 1.
- [ ] Integrate game 2.
- [ ] Integrate game 3.

## 17. Phase 1 release gate

- [ ] Every non-engine checklist item required for launch is complete or explicitly
  removed from scope.
- [ ] The API contract, frontend types, and implementation agree.
- [ ] No production player or admin workflow depends on mutable fixture data.
- [ ] Required unit, HTTP, PostgreSQL concurrency, and end-to-end tests pass in CI.
- [ ] PHP and USD remain isolated and no response aggregates them as one balance.
- [ ] Every committed balance change has exactly one immutable ledger movement.
- [ ] Retried financial operations cannot move money twice.
- [ ] Authorization and ownership boundaries have been tested.
- [ ] At least one complete game passes its per-game delivery and RTP verification gates.
- [ ] Production deployment, monitoring, backup, rollback, and reconciliation procedures
  are documented and exercised.
- [ ] Final product, security, financial, and operational acceptance is recorded.
