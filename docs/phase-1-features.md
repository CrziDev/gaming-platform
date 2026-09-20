# Phase 1 Delivery Checklist

This is the master delivery checklist for Phase 1. It replaces the former high-level
feature list and separates platform work that can be completed now from work that must
wait for the actual games and their engines.

Use `[x]` only when the implementation and its required tests are complete. A page that
works only against frontend fixtures is not complete.

Reconciled against `work` on 2026-09-20, after the dashboard performance expansion and
the read-only RTP configuration inspector landed. This status is based on reachable
routes, repository/service code, frontend transport code, and automated tests—not on
the presence of a table or a fixture-backed screen alone.

Unsupported product surfaces are now labelled **Future Development** instead of rendering
fixtures or inert controls. This applies to promotions, big wins, cash-out, staff,
deposit limits, platform settings, support, and language selection. The former console
alert panel was removed; it was an operator-dashboard fixture, not the persisted player
notification system.

## Current state

- [x] PostgreSQL schema and reversible migrations exist for every Phase 1 table.
- [x] Registration, login, logout, session lookup, password recovery and change, and development admin seeding exist.
- [x] The player and admin interfaces exist and can be exercised with deterministic
  component-test fixtures.
- [x] Shared application routing, HTTP helpers, and filter pagination are in place.
- [x] Enabled currencies and paginated admin users have real platform APIs.
- [x] Admin wallet adjustments and filtered admin transaction history have real APIs.
- [x] Player payment-method and deposit-request APIs are backed by PostgreSQL.
- [x] Admin deposit review APIs credit or reject requests atomically with audit entries.
- [x] The currency-scoped admin dashboard summary is backed by PostgreSQL.
- [x] Explicitly mark unsupported product surfaces as Future Development and remove the
  fixture-only console alert panel and inert controls.
- [ ] Financial services and their PostgreSQL concurrency tests are complete (wallets,
  adjustments, deposits, and rounds are; cash-out has no contract yet, §1).
- [x] The platform satisfies the pre-engine readiness gate in this document (§16).
- [x] Complete game source is available for the first title (Plinko, kept untouched at
  `docs/games/source/plinko/`; `docs/games/plinko-runtime.md`).
- [x] The first real-money game integration is complete: Plinko settles on the server
  through the Plinko engine at whichever of its four shipped returns the operator set
  (§16). A browser pass on supported devices is still open in §16.

## Completed slice: round read APIs

Completed on 2026-09-14. The internal money-moving lifecycle and the player and operator
read surfaces are complete without exposing a player-controlled settle operation or
inventing an outcome.

- [x] Implement internal open with the wallet lock and unique round key (§8).
- [x] Implement internal settle, cancel, and fail operations with settle-at-most-once
  and compensating refunds (§8).
- [x] Add `GET /api/rounds`, `GET /api/rounds/{id}`, and `GET /api/admin/rounds`.
- [x] Wire the History rounds tab, `/admin/rounds`, and the game page's recent rounds,
  and add a rounds section to the user detail page.
- [x] Cover the required round lifecycle and read-route tests in §8.

## Completed slice: account security

Completed on 2026-09-20. Password reset uses direct Resend HTTPS delivery when enabled,
stores only 32-byte token hashes for 30 minutes, and keeps account existence private.
Reset confirmation and authenticated password change atomically replace every old
session with one for the initiating browser. The Account page remains read-only apart
from its password form and no longer fabricates player status.

## Completed slice: game administration and the game's return

Completed on 2026-09-12; the return simplified and its read-only inspector added on
2026-09-20. `internal/game` owns the admin list, detail, create, and patch routes, the
one RTP switch, and the guarded configuration projection it requests from the engine.
The former profile subsystem (`internal/rtp`, drafts, offline verification rows,
schedules, the reverter) was replaced by `games.rtp_basis_points`, one of the options
the engine compiles in.

- [x] `GET /api/admin/games`, `GET /api/admin/games/{id}`, `POST /api/admin/games`,
  `PATCH /api/admin/games/{id}` with whole-unit wager validation and audit entries.
- [x] `PUT /api/admin/games/{id}/rtp`, refusing any value outside the engine's options
  and audited as `game.rtp_change`.
- [x] `GET /api/admin/games/{id}/rtp-configuration`, returning the selected board's
  theoretical RTP, multipliers, and normalized chances without exposing raw weights.
- [x] Game create and edit forms, and the RTP page: one row per game, a select of its
  options, a confirmation that reads in danger at or above 100%, and a read-only
  configuration inspector.
- [x] HTTP/PostgreSQL coverage for authorisation, validation, slug conflicts, catalogue
  visibility after a status change, the option check, the no-op repeat, and audit actions.

## Completed slice: public catalogue reads

Completed on 2026-09-12. `internal/game` serves the seeded catalogue from PostgreSQL;
the lobby, catalogue, shelves, search, and game page always read it in application
builds. Real launch stays disabled until the engine gate is satisfied.

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
- [x] Notifications are Phase 1: a deposit review and a big win (at or above
  `BIG_WIN_MULTIPLIER_HUNDREDTHS`) write one in the same transaction, read through
  `GET /api/notifications` and cleared with `POST /api/notifications/read`.
- [ ] Define the cash-out / withdrawal contract (request, admin review, audit); the wallet
  page links to an honest placeholder at `/wallet/cash-out` until it exists.
- [x] Define the wallet-summary response. `GET /api/transactions/summary` reports
  deposited, staked, and returned per wallet for the requested window, and the history
  page renders one row of cards per currency from it; the client sums nothing.
- [x] Remove fixture-only console alerts. These were dashboard action prompts and were
  unrelated to the real player notification feed.
- [x] Defer staff-account management and label its settings tab Future Development.
- [x] Implement database-backed admin payment-method list, create, edit, enable, and
  disable operations with audit entries. GCash and Maya remain the two migration-seeded
  starting records; disabled methods stay visible to operators but cannot accept a new
  player deposit.
- [x] Add the proof-upload HTTP contract, limits, and error behavior if screenshot upload
  remains in Phase 1.
- [ ] Reconcile every frontend response type with the API resource and page shapes
  (`Game`, `Category`, `AdminGame`, and `AdminRtpConfiguration` are reconciled;
  `Transaction`, `AuditEntry`, and `AdminDeposit` are mapped in the adapter, and
  `Transaction` still
  carries a `label`, `reference`, `status`, and `round_id` the server does not send;
  `Round`, `WalletSummary`, `ChatMessage`, and `Notification` are reconciled with their
  endpoints).
- [x] Keep lobby rows derived from platform data unless merchandising configuration is
  explicitly added to scope; recently played comes from the player's distinct latest
  rounds and hot comes from seven days of settled-round activity.
- [x] Defer the v2 lobby's remaining merchandising surfaces — big wins and promotions —
  and label them Future Development. The new and hot shelves remain real.
- [x] Favorites and the live chat rail are Phase 1 and built: `game_favorites` with
  `GET /api/favorites` and idempotent `PUT`/`DELETE /api/games/{slug}/favorite`;
  `chat_messages` with the public room read, the rate-limited post, and the WebSocket
  push at `GET /api/chat/socket`.
- [x] Mark Support and language selection Future Development. Implement the admin console
  search as a 250 ms debounced typeahead (minimum two characters, five results per group)
  across player name/email/ID, payment reference/deposit ID, and round ID. Selecting a
  result opens the player or a filtered all-status deposit/round list.

## 2. Foundations and schema

### Database

- [x] `users` migration with normalized email, role, and account-status constraints.
- [x] `auth_sessions` migration with hashed-token storage.
- [x] `password_reset_tokens` migration.
- [x] `currencies` migration with PHP and USD seed records.
- [x] `wallets` migration with one wallet per user and currency.
- [x] `wallet_transactions` migration with ledger and idempotency constraints.
- [x] `game_categories` and `games` migrations.
- [x] `games.rtp_basis_points` (migration `000017`, replacing `rtp_profiles`).
- [x] `game_rounds` migration with unique round keys and settlement constraints.
- [x] `payment_methods` and `deposit_requests` migrations.
- [x] Append-only `audit_logs` migration.
- [x] `game_favorites` migration keyed by user and game.
- [x] `chat_messages` migration with the one-line length constraint.
- [x] `notifications` migration with one row per kind and reference.
- [x] Every migration has a working down migration.

### Application structure

- [x] Move the route table and middleware assembly to `internal/app`.
- [x] Move response, error, JSON, and pagination helpers to `internal/httpx`.
- [x] Use the API's resource, error, and page shapes consistently on every route.
- [x] Return the standard not-found response for every unknown path.
- [x] Implement common parsing for page, size, search, status, role, type, currency, game,
  and date filters.
- [x] Enforce a default page size of 20 and maximum of 100.
- [x] Add `GET /api/currencies` for enabled currency metadata.
- [x] Move database and HTTP server lifecycle ownership from `cmd/server` to
  `internal/app`, leaving the command as `main` only (`app.ConfigFromEnv`, `app.Run`).
- [x] Move the `auth_sessions` SQL (create, find by token hash, revoke one) from
  `internal/auth/session.go` into `internal/user` beside the revoke-all on suspension,
  so the session rows sit with the account.

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

- [x] Request a password reset without revealing whether the email exists.
- [x] Deliver reset tokens through Resend's HTTPS API.
- [x] Confirm a password reset with a hashed, expiring, single-use token.
- [x] Revoke all old sessions and replace the confirming browser's session after a successful password reset.
- [x] Change password using the current password.
- [x] Revoke all old sessions and replace the submitting browser's session after a password change.
- [x] Return a paginated, searchable, status-filtered admin user list.
- [x] Return an individual admin user detail record.
- [x] Suspend and reinstate accounts.
- [x] Make suspension effective on the account's next request.
- [x] Audit every operator account-status change.
- [ ] Define and implement the player profile fields that can be edited, if profile
  editing remains in Phase 1. The Account page intentionally keeps identity read-only,
  and account status remains an administrator-owned concern.
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
- [x] `make seed` enables GCash and Maya with development placeholder destinations; the
  migration alone leaves them disabled.
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
- [x] Reject a wager when its game is not active.
- [x] Plinko's art is rendered from the game's own geometry and palette: the 3:4 tile at
  `frontend/src/assets/games/plinko.png` and the landscape lobby banner at
  `frontend/src/assets/banners/plinko.png`, from the SVG sources in `games/plinko/art/`.
  The tile renders `assets/games/<slug>.*` or `thumbnail_url` when present; the banner
  renders `assets/banners/<slug>.*`, then the thumbnail, then the placeholder.
- [ ] Art for the remaining catalogue titles when assets arrive; they keep the
  placeholder slot until then.
- [x] A real game launches only through an engine registered for its slug in
  `internal/app`; Plinko passed the engine gate and launches, and every other catalogue
  title answers `404` to a round and keeps the display-slot placeholder.

## 8. Round and betting infrastructure

Round persistence is platform work and can be implemented now. It must not expose a
player-controlled settle operation or invent an outcome while no engine exists.

- [x] Implement internal open.
- [x] Implement internal settle, cancel, and fail operations.
- [x] Lock the wallet before inserting a round that references it.
- [x] Bind a round to its user, game, wallet, currency, and the return in force.
- [x] Validate the wager against game minimum, maximum, and exact step.
- [x] Debit the wager and create the open round in one transaction.
- [x] Use a unique round key to prevent duplicate bets.
- [x] Credit a positive win and settle the round in one transaction.
- [x] Record a zero win without creating a zero-value movement.
- [x] Permit settlement only from the open state.
- [x] Enforce one settlement with a conditional update and database constraints.
- [x] Implement a compensating refund for cancelled or failed rounds.
- [x] Ensure concurrent round starts on one wallet do not deadlock.
- [x] List a player's rounds with pagination.
- [x] Return one player-owned round without leaking another player's record.
- [x] Return filtered, paginated round history to administrators.
- [x] Do not add player-facing open or settle endpoints before the engine boundary is
  defined.

### Required round tests

- [x] Duplicate open requests return one round and deduct one wager.
- [x] Concurrent starts on one wallet do not deadlock or overspend.
- [x] Concurrent settlements credit at most once.
- [x] A second settlement returns `ROUND_ALREADY_SETTLED`.
- [x] Cancellation/refund is idempotent.
- [x] An RTP switch does not alter an already-open round.

## 9. The game's return

An engine ships a fixed set of returns; the platform stores which one a game plays at
and can never make a percentage true on its own.

- [x] Store one return per game, `games.rtp_basis_points`, null until an operator
  picks one; a game with none set opens no round.
- [x] Accept only a value the game's engine offers (`game.SetRTP` checks the engine's
  options; a game no engine plays refuses every value).
- [x] Show the return in force and the options on the game and RTP pages.
- [x] Take effect on the next round and hold until the next switch; no schedule, no
  default, no reverter.
- [x] Record every switch in the audit log as `game.rtp_change` with before and after.
- [x] Provide no platform operation that can add a return the engine does not ship, and
  no database column that claims one is verified.
- [x] Keep RTP claims tied to their source: the guarded configuration inspector reports
  the theoretical figure calculated from the compiled engine table, while the dashboard
  derives effective and expected figures only from settled rounds. Simulation evidence
  remains in the game's RTP document.

## 10. Frontend integration

### Shared behavior

- [ ] Define, implement, or remove the remaining unsupported reads while retaining
  deliberate component-test fixtures. Supported application features always use HTTP.
- [x] Make non-mock mode the production default.
- [ ] Validate runtime responses where an untrusted payload crosses into the app (the
  game frame's messages, the Plinko manifest, and the play response are validated with
  Zod; every other response is typed only).
- [x] Handle standard API errors without matching human-readable error text (the wired
  deposit, review, adjustment, and status mutations act on status and `code`; the
  unsupported surfaces have no server operations to handle yet).
- [ ] Provide consistent loading, empty, retry, validation, and unavailable states.
- [ ] Bring `/admin/rtp/:id` into design-system compliance: use RTP-option terminology,
  remove divider borders and the full-pill status treatment, and replace its
  below-desktop horizontally scrolling table with the required responsive layout.
- [ ] Make frontend checks warning-free: remove the current React `act(...)` test
  warnings and six Fast Refresh lint warnings.
- [ ] Decide whether to split the production JavaScript bundle or explicitly accept and
  document the current Vite chunk-size warning.
- [x] Invalidate wallet, deposit, transaction, round, and dashboard queries after the
  corresponding mutation (a deposit submission invalidates deposits and transactions;
  every console mutation invalidates the whole `admin` tree, and a game change the
  catalogue keys too; round queries follow §8).
- [ ] Confirm desktop and mobile keyboard, focus, and screen-reader behavior.

### Shell

- [x] The header balance chip shows the active wallet's real balance on every
  authenticated route.
- [x] The inline search box at the top of the rail and drawer (`⌘K` focuses it) lists
  real catalogue results and hands off to `/games?q=`.
- [x] `/login` and `/register` open the auth modal over the lobby, and a guest who picks
  a game or a locked nav item returns there after signing in.
- [x] The session-expired dialog is raised when a live session stops being recognised
  and never on a deliberate sign-out.
- [x] The console navigation badge carries the real pending deposit total.
- [x] The live chat rail reads the real room, posts through the session, and re-reads on
  the socket's push; presence comes from the socket.
- [x] The notifications bell reads the real list on a slow refetch, is refreshed when a
  round lands, and marks everything read through the server.
- [ ] The Support link, language selector, and console search box are unwired chrome;
  see contract alignment.

### Public and player routes

- [ ] Lobby `/` is backed by the real catalogue and player history where applicable (the
  catalogue, categories, featured banner, and recently-played row are real; big wins and
  promotions are fixture-only).
- [x] Game catalogue `/games` is backed by the real catalogue API.
- [x] Sign in `/login` uses the real session API.
- [x] Registration `/register` uses the real account API.
- [x] Forgot password `/forgot` uses the real indistinguishable reset-request API and
  reports the explicit disabled-delivery state.
- [x] Reset password `/reset` validates and confirms the real reset token, recovers from
  invalid links, and installs the returned session on success.
- [x] Game host `/game/:slug` loads real metadata, the game's own wallet, and recent rounds,
  and safely reports unavailable games; the favorite toggle writes to the server.
- [x] Wallet `/wallet` uses real wallets and balances.
- [x] Deposit `/wallet/deposit` uses real methods, limits, and submission.
- [x] Deposit status `/wallet/deposit/:id` uses the real player-owned request.
- [x] History `/history` uses real transaction and round history with server-side paging
  and date filters.
- [x] Account `/account` uses real account, wallet, and password-change operations;
  identity stays read-only and the page does not fabricate account status.
- [x] New `/games/new` is backed by the real catalogue's thirty-day `new` flag.
- [x] Favorites `/favorites` lists the player's real favourites from `GET /api/favorites`.
- [x] Hot `/games/hot` ranks active games by settled-round activity in the trailing seven
  days, with distinct players and latest activity as tie-breakers.
- [ ] Promotions `/promotions` has no service and is hidden in application builds; the
  console navigation exposes a table marked Future Development.
- [x] Not found `*` presents the intended application state.

### Admin routes

- [x] Admin sign in `/admin/login` uses the real session API and role check.
- [x] Dashboard `/admin` uses real currency-scoped summary data with an operator-selected
  currency; alerts have no service and are hidden in application builds.
- [x] Deposits `/admin/deposits` uses the real review queue.
- [x] Users `/admin/users` uses real paging, search, and status filters.
- [x] User status mutations use the real API.
- [x] User details `/admin/users/:id` uses real wallets, deposits, rounds, and adjustments;
  it has no sessions section until that read endpoint exists.
- [x] Transactions `/admin/transactions` uses the real filtered ledger and the round-read
  API for its Rounds tab.
- [x] Rounds `/admin/rounds` uses real filtered, paginated round records.
- [x] Games `/admin/games` uses real catalogue administration (the contract's `status`,
  `category`, and `search` filters are not yet exposed in the UI).
- [x] Game details `/admin/games/:id` uses real game metadata and shows the return.
- [x] Promotions `/admin/promotions` is intentionally a Future Development placeholder;
  it does not fabricate campaign data or controls before a service contract exists.
- [x] RTP `/admin/rtp` switches a game's return only among the engine's options.
- [x] RTP configuration `/admin/rtp/:id` reads the chosen option and board from the
  guarded engine configuration endpoint without changing the option in force.
- [x] Audit log `/admin/audit` uses the real append-only audit feed.
- [ ] Settings `/admin/settings` contains only settings backed by an agreed Phase 1
  contract (Payment methods and Staff have no management service and show an explanatory
  empty state in application builds; Limits and Platform are static forms whose Save, Add method,
  and Invite staff buttons have no handler).

## 11. Generic game host and bridge

The transport shell can be built and tested with a non-financial harness before a game
arrives. Its final message set must still be reviewed against the first real title.

Built with Plinko as the first title; `docs/games/plinko-runtime.md` records the protocol.

- [x] Define a versioned `postMessage` protocol and runtime schemas (`v: 1`, Zod
  `strictObject` unions in `frontend/src/features/gameplay/schemas.ts`).
- [x] Restrict messages by exact origin and expected source window (`bridge.ts`).
- [x] Reject unknown versions, message types, and payload fields.
- [x] Let the host provide authenticated player context without exposing session tokens
  (the frame receives no player context at all: identity, wallet, and bet controls stay
  on the host side).
- [x] Let the host provide permitted game and wager configuration (`configure` carries
  the board of the return in force; wager bounds are the host's controls).
- [x] Let the host display server-returned balance and round results.
- [x] Ensure the embedded frame cannot directly mutate a wallet or settle a round (no
  client-facing settle endpoint exists, and the vendored frame makes no network request).
- [x] Implement timeout, retry-safe, unavailable, and session-expired states (ten-second
  `ready` timeout, `Idempotency-Key` retries, manifest and engine `404`/`409` states,
  the shell's session-expired dialog).
- [x] Test the bridge with a deterministic, non-wagering harness (`bridge.test.ts` and
  the fixture-settled game page tests).
- [x] Revalidate the protocol after reviewing the first complete game source (the
  protocol was cut to what the reviewed Plinko frame needs).

## 12. Dashboard, reporting, and history

- [x] Build the currency-scoped admin dashboard endpoint.
- [x] Never sum money across currencies.
- [x] Report pending deposits and held amount.
- [x] Report approved deposits for the dashboard's fixed today period.
- [x] Report staked and returned amounts only from authoritative ledger/round data.
- [x] Report player and round counts.
- [ ] Label every RTP figure by its meaning. The inspector distinguishes target and
  theoretical RTP; the dashboard currently abbreviates returned-over-staked as `RTP`
  beside `expected` instead of naming it observed or effective.
- [x] Provide player transaction and round history with paging and date filters.
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
- [x] Return `404` rather than revealing another player's wallet, deposit, or round.
- [ ] Validate all identifiers, enums, money, timestamps, and pagination input.
- [x] Keep passwords, hashes, raw session/reset tokens, proof contents, and RNG state out
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
- [x] A player cannot read another player's wallet, deposits, rounds, favorites, or
  account data (wallets and the account are read only through the session; deposits,
  rounds, and favorites are covered by HTTP tests; admin routes answer `403`).
- [x] Catalogue and game availability changes appear correctly to players.
- [x] A round can be opened and settled through an internal deterministic test adapter,
  with one wager and at most one win movement (`round/play_test.go` with a stub engine).
- [x] A failed test round follows the compensating refund path
  (`TestCancelAndFailRefundOnceAndBecomeTerminal`).
- [x] Every operator mutation produces its required audit entry (wallet, deposit,
  account status, game, and RTP switches do; a round is a player action with its own
  record and no operator mutation to audit).

## 16. Blocked until complete game source arrives

Do not satisfy these boxes with placeholder mathematics. A stored percentage or a random
stub is not a game engine and is not RTP verification.

### Engine entry gate

All of these platform prerequisites must be complete before real engine integration
starts:

- [x] Wallet movements are row-locked, idempotent, and ledger-backed.
- [x] Round opening and settlement enforce settle-at-most-once (§8).
- [x] A game plays at exactly one return, and only one its engine ships.
- [x] The generic game host and secured `postMessage` bridge are ready (§11).
- [x] Whole-unit wager steps are enforced by game configuration and round validation.

### Source intake and assessment, per game

Plinko: done on 2026-09-19, recorded in `docs/games/plinko-runtime.md` (assessment) and
`docs/games/plinko-rtp.md` (model). The next title starts these boxes again.

- [x] Obtain the complete, licensed game source and all assets and dependencies (which
  CodeCanyon licence tier was purchased is not recorded; the runtime doc flags it).
- [x] Keep the untouched source separately from the port (`docs/games/source/plinko/`,
  gitignored because the licence forbids redistribution, so it is preserved but not
  committed).
- [x] Run the game exactly as supplied.
- [x] Document its build and runtime requirements.
- [x] Trace its network requests and external dependencies.
- [x] Trace wager to outcome, payout, and balance mutation.
- [x] Locate RNG, probabilities, weights, paytables, bonus rules, and RTP logic.
- [x] Locate browser storage and any internal wallet implementation.
- [x] Write the feasibility report.
- [x] Select adapter, targeted modification, port, or rebuild based on evidence (port the
  wallet, wager, outcome, and payout to Go; keep Matter.js as presentation).

### Engine implementation, per game

Plinko: `backend/internal/engine/` and `backend/internal/round/play.go`.

- [x] Generate unpredictable outcomes with the approved server-side RNG design
  (`crypto/rand` through `engine.SecureSource`; deterministic sources exist only in tests).
- [x] Make the server authoritative for outcome and payout.
- [x] Implement exact game rules, probability weights, and paytables from reviewed
  source (the supplied multipliers, with each option's low-risk board changes recorded
  in `plinko-rtp.md` §9).
- [x] Use integer arithmetic on the path that moves money.
- [x] Map the authoritative result to the game's animation without a visual/financial
  mismatch (the landing guard holds the ball to the settled slot; the frame never pays
  on a physical position).
- [x] Remove or neutralize the game's browser-authoritative wallet and payout logic.
- [x] Connect the engine to the internal round and wallet services.
- [x] Define crash recovery for every wager/outcome/settlement boundary (a Plinko round
  is one transaction, so no paid-but-unsettled state exists and no recovery worker is
  needed; `Open`, `Settle`, `Cancel`, and `Fail` remain for two-phase engines).
- [x] Confirm refreshes, retries, duplicate input, and concurrent input cannot duplicate
  a wager or payout (player-scoped idempotency keys; retry and concurrent-duplicate
  tests in `round/play_test.go`).

### RTP implementation and verification, per game/option

Plinko `plinko/9000`, `plinko/9500`, `plinko/10500`, `plinko/11000`: simulated on
2026-09-20, evidence in `plinko-rtp.md` §9.

- [x] Bind each option to an immutable engine configuration (`plinko/<basis points>`,
  resolved through `plinko.ProfileByBasisPoints` at open and recorded on the round as
  `engine_reference`).
- [x] Prove theoretical RTP from the exact probability and payout model
  (`plinko.TheoreticalBasisPoints`; `profiles_test.go` pins every board of every option
  to its basis points exactly).
- [x] Run a headless simulation through the production outcome path (`make
  simulate-plinko` plays every board of every option through the production `Pick`
  and `Payout`).
- [x] Choose sample size and tolerance appropriate to the game's volatility (10⁸ rounds
  per board, ±100 basis points, justified against the 16-row high board's 500× slot).
- [x] Record total rounds, observed RTP, ±3σ, runtime, engine reference, and the date
  (the per-option tables in `plinko-rtp.md` §9).
- [x] Ship an option only after its evidence passes review; nothing in the database
  marks one verified, and the console can only choose among what shipped.
- [x] Confirm changing the return changes real mathematical behavior, not just a label
  (the engine plays the option's own table; the manifest names the return a round
  settles on).

### Game delivery, per title

- [x] Launch the game from the authenticated platform host.
- [x] Associate every round with the correct player, wallet, currency, game, and return.
- [x] Validate wagers server-side.
- [x] Record one authoritative round for every accepted wager.
- [x] Deduct the wager atomically and credit the win at most once.
- [x] Keep displayed balance synchronized with the server (refetched when the frame
  reports `landed`, or eight seconds later regardless).
- [x] Make round and movements visible in player and admin history.
- [ ] Pass supported mobile and desktop browser testing (the frame is exercised through
  the host tests and the demo; a recorded pass on supported devices is outstanding).
- [x] Document source assumptions, modifications, and operational requirements
  (`docs/games/plinko-runtime.md`).
- [x] Integrate game 1 (Plinko).
- [ ] Integrate game 2.
- [ ] Integrate game 3.

## 17. Phase 1 release gate

- [ ] Every non-engine checklist item required for launch is complete or explicitly
  removed from scope.
- [ ] The API contract, frontend types, and implementation agree.
- [x] No production player or admin workflow depends on mutable fixture data; fixture
  branches are test-only and the production bundle contains no fixture content.
- [ ] Required unit, HTTP, PostgreSQL concurrency, and end-to-end tests pass in CI.
- [ ] PHP and USD remain isolated and no response aggregates them as one balance.
- [ ] Every committed balance change has exactly one immutable ledger movement.
- [ ] Retried financial operations cannot move money twice.
- [ ] Authorization and ownership boundaries have been tested.
- [ ] At least one complete game passes its per-game delivery and RTP verification gates.
- [ ] Production deployment, monitoring, backup, rollback, and reconciliation procedures
  are documented and exercised.
- [ ] Final product, security, financial, and operational acceptance is recorded.
