# Backend Platform Services

## 1. Status

Implementation status is tracked in one place, [`../phase-1-features.md`](../phase-1-features.md);
this document does not restate it.

These services were implemented once in the previous platform, but that implementation
is not portable to this repository: it used `/api/v1`, a generated query layer, and a
different error body. The design conclusions and required tests in this specification
carry forward; the old code does not.

This document covers the platform services that are independent of any game's internal
mechanics. It defines no reels, card odds, crash curve, RNG mapping, or payout
mathematics — those belong to `../game-engine-integration/SPEC.md`, and none of them may
be invented before a purchased game's source has been reviewed.

The external contract is `.claude/rules/backend/api.md`: paths, status codes, the failure
shape, the error-code table, and the page shape all live there and are not restated here.
How the code is written is constrained by `.claude/rules/backend/security.md` (money,
sessions, passwords, authority, CSRF), `go-style.md` (which also owns the package list),
`packages.md`, and `database.md`. Where this document appears to disagree with one of
those, the rule wins and this document is wrong.

## 2. Packages

The package list and the rules for what each one owns live in
`.claude/rules/backend/go-style.md` ("Package layout"). Two decisions worth restating
because they shape everything below:

There is no `internal/admin`. An operator crediting a wallet is wallet code behind a role
guard, and an operator listing rounds is round code behind the same guard; splitting by
audience would put the same table in two packages.

`internal/round` owns the internal round lifecycle. Opening, settlement, cancellation, and
failure are implemented with wallet-first locking, exact wager validation, an active-profile
snapshot, retry-safe movements, settle-at-most-once, and compensating refunds; the read
handlers remain to be built.

## 3. Invariants

A violation of anything in this section is a financial bug.

### 3.1 Money

1. A balance is `int64` minor units and a currency code. Never a float, in Go, in
   JavaScript, or in SQL.
2. A wallet belongs to one account and one currency, and a movement is always in the
   wallet's own currency.
3. A balance never goes negative. There is no overdraft and no credit line.
4. Every balance change writes exactly one ledger row, in the same database transaction
   as the balance update.
5. A ledger row is never updated and never deleted. A mistake is corrected by a
   compensating movement that leaves both rows on the record.
6. An operator adjustment carries the acting account and a reason.
7. A movement that a client may retry is idempotent, and the final guard is a unique
   index, not a prior read.
8. A round settles at most once, enforced by the database and not only by a branch in Go.
9. Nothing converts or transfers between currencies, and no response sums across them.
10. The browser is never the authority on balance, ownership, role, payout, or round
    state.

### 3.2 Data

1. An email address is unique after normalisation to lower case and trimmed whitespace.
2. A currency code is an uppercase three-letter ISO code.
3. Every stored timestamp is `TIMESTAMPTZ` in UTC, and RFC 3339 on the wire.
4. Every externally visible identifier is a database-generated UUID.
5. A financially relevant record is retired by status, never deleted.

## 4. Schema

The logical schema below is the starting contract. Before the first production deployment
the disposable baseline may be rebuilt; after deployment, an applied migration is the
authority and is amended by a new migration rather than an edit (`database.md`).
Status vocabularies match the wire types the web app is already coded against in
`frontend/src/api/types.ts` — changing one of them is a change to both.

Every table below has its own migration, one table per numbered pair, applied in
dependency order: `000001` `users` · `000002` `auth_sessions` · `000003`
`password_reset_tokens` · `000004` `currencies` · `000005` `wallets` · `000006`
`wallet_transactions` · `000007` `game_categories` · `000008` `games` · `000009`
`rtp_profiles` · `000010` `game_rounds` · `000011` `payment_methods` · `000012`
`deposit_requests` · `000013` `audit_logs`.

### 4.1 Accounts and sessions

`users` holds `id`, `email`, `password_hash`, `display_name`, `role`
(`player` / `admin`), `status` (`active` / `suspended` / `closed`), and timestamps, with
the email normalisation and vocabulary checks in the table itself.

`auth_sessions` holds `token_hash` (32 bytes, unique), `issued_at`, `expires_at`,
`revoked_at`, `last_seen_at`, `user_agent`, and `ip_address`. It carries no `csrf_token`
column: the CSRF defence is the `Origin` allowlist, and nothing reads or writes a token.

Password reset takes a third table:

```sql
CREATE TABLE password_reset_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users (id),
    token_hash BYTEA NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT password_reset_tokens_hash_length CHECK (octet_length(token_hash) = 32)
);

CREATE UNIQUE INDEX password_reset_tokens_hash_key ON password_reset_tokens (token_hash);
```

The token is 32 bytes from `crypto/rand`, stored only as its SHA-256 hash, single-use,
and short-lived — the same handling as a session token.

### 4.2 `currencies`

```sql
CREATE TABLE currencies (
    code              TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    symbol            TEXT NOT NULL,
    minor_units       SMALLINT NOT NULL,
    deposit_min_minor BIGINT NOT NULL DEFAULT 10000,
    deposit_max_minor BIGINT NOT NULL DEFAULT 5000000,
    enabled           BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT currencies_code_iso CHECK (code ~ '^[A-Z]{3}$'),
    CONSTRAINT currencies_minor_units_sane CHECK (minor_units BETWEEN 0 AND 4),
    CONSTRAINT currencies_deposit_limits_valid CHECK (
        deposit_min_minor > 0 AND deposit_max_minor >= deposit_min_minor),
    CONSTRAINT currencies_deposit_limits_json_safe CHECK (
        deposit_min_minor <= 9007199254740991
        AND deposit_max_minor <= 9007199254740991)
);
```

`000004` seeds `PHP · Philippine Peso · ₱ · 2` and `USD · US Dollar · $ · 2` with the
table, because a wallet cannot exist without a currency row to reference. Deposit limits
are currency configuration and default to `10000`–`5000000` minor units. There is no
exchange rate column, because there is no conversion anywhere in the platform.

### 4.3 `wallets` and the ledger

```sql
CREATE TABLE wallets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users (id),
    currency      TEXT NOT NULL REFERENCES currencies (code),
    balance_minor BIGINT NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT wallets_status_valid CHECK (status IN ('active', 'frozen', 'closed')),
    CONSTRAINT wallets_balance_non_negative CHECK (balance_minor >= 0),
    CONSTRAINT wallets_balance_json_safe CHECK (balance_minor <= 9007199254740991)
);

CREATE UNIQUE INDEX wallets_user_currency_key ON wallets (user_id, currency);
```

`balance_minor` is the current balance and the ledger is how it got there. The `CHECK` is
the last line of defence under a concurrency bug, not the primary one.

```sql
CREATE TABLE wallet_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id       UUID NOT NULL REFERENCES wallets (id),
    user_id         UUID NOT NULL REFERENCES users (id),
    currency        TEXT NOT NULL REFERENCES currencies (code),
    kind            TEXT NOT NULL,
    amount_minor    BIGINT NOT NULL,
    balance_before  BIGINT NOT NULL,
    balance_after   BIGINT NOT NULL,
    reference_type  TEXT,
    reference_id    UUID,
    idempotency_key TEXT,
    actor_user_id   UUID REFERENCES users (id),
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT wallet_transactions_kind_valid CHECK (
        kind IN ('deposit', 'withdrawal', 'wager', 'win', 'refund', 'adjustment')),
    CONSTRAINT wallet_transactions_amount_non_zero CHECK (amount_minor <> 0),
    CONSTRAINT wallet_transactions_arithmetic CHECK (balance_after = balance_before + amount_minor),
    CONSTRAINT wallet_transactions_money_json_safe CHECK (
        amount_minor BETWEEN -9007199254740991 AND 9007199254740991
        AND balance_before BETWEEN -9007199254740991 AND 9007199254740991
        AND balance_after BETWEEN -9007199254740991 AND 9007199254740991)
);

CREATE UNIQUE INDEX wallet_transactions_idempotency_key
    ON wallet_transactions (wallet_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX wallet_transactions_one_win_per_round
    ON wallet_transactions (reference_id) WHERE reference_type = 'round' AND kind = 'win';

CREATE INDEX wallet_transactions_wallet_created
    ON wallet_transactions (wallet_id, created_at DESC);
```

A credit is a positive `amount_minor`, a debit a negative one, and the direction of a
movement is never a separate column that could disagree with the sign. `kind` says what
happened, `actor_user_id` and `reference_type` say who caused it and on behalf of what.

The ledger carries no display string and no status column. The `label`, `reference`, and
`status` the web app renders are derived from `kind`, the referenced row, and the sign of
the amount — a deposit movement's status is its deposit request's status, a wager's is
its round's. A ledger row means money moved, and money that moved has no pending state.

There is no `metadata JSONB` column. A fact worth keeping on a movement is worth a
column that a query can filter.

### 4.4 `games`

```sql
CREATE TABLE game_categories (
    slug       TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE games (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug             TEXT NOT NULL,
    name             TEXT NOT NULL,
    description      TEXT,
    category_slug    TEXT NOT NULL REFERENCES game_categories (slug),
    provider         TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'draft',
    integration      TEXT NOT NULL DEFAULT 'unreviewed',
    currency         TEXT NOT NULL REFERENCES currencies (code),
    min_wager_minor  BIGINT NOT NULL,
    max_wager_minor  BIGINT NOT NULL,
    wager_step_minor BIGINT NOT NULL,
    frontend_path    TEXT,
    thumbnail_path   TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT games_status_valid CHECK (status IN ('draft', 'active', 'maintenance', 'retired')),
    CONSTRAINT games_integration_valid CHECK (integration IN (
        'unreviewed', 'under_review', 'supported', 'integrated', 'unsupported')),
    CONSTRAINT games_wager_bounds CHECK (
        min_wager_minor > 0
        AND max_wager_minor >= min_wager_minor
        AND wager_step_minor > 0),
    CONSTRAINT games_wagers_json_safe CHECK (
        min_wager_minor <= 9007199254740991
        AND max_wager_minor <= 9007199254740991
        AND wager_step_minor <= 9007199254740991)
);

CREATE UNIQUE INDEX games_slug_key ON games (slug);
CREATE INDEX games_status_category ON games (status, category_slug);
```

No game-specific mathematics is stored here. `integration` is the engine-review state and
is set by the work in `../game-engine-integration/`, never by a catalogue edit.

One game carries one currency, because that is the contract the web app is coded against.
A title offered in two currencies needs per-currency bounds in a `game_wager_limits`
table and a change to the game body in `api.md` — not a second catalogue row.

The game body carries `thumbnail_path` as `thumbnail_url`, null until reviewed art is
attached. The web app renders the flat placeholder slot regardless; switching it to the
URL is the change that lands with the reviewed assets, not before.

A game is `new` for thirty days after its row was created; the flag is computed from
`created_at` on read and is never stored. `hot` has no definition until rounds exist.

Categories are a table because the catalogue response names them. Lobby rows are not:
they are assembled on the web side from the catalogue and the player's recent rounds, and
merchandising configuration is not a Phase 1 surface. The v2 lobby's big-wins and
promotions sections are fixture-only and render nowhere but the demo until that decision
is revisited in `../phase-1-features.md` §1.

### 4.5 `rtp_profiles`

Metadata only until an engine exists. A row here describes an intent; it does not make a
percentage true.

```sql
CREATE TABLE rtp_profiles (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id                  UUID NOT NULL REFERENCES games (id),
    name                     TEXT NOT NULL,
    version                  INTEGER NOT NULL,
    target_basis_points      INTEGER NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'draft',
    engine_config_ref        TEXT,
    theoretical_basis_points INTEGER,
    observed_basis_points    INTEGER,
    verification_method      TEXT,
    sample_size              BIGINT,
    verified_at              TIMESTAMPTZ,
    effective_from           TIMESTAMPTZ,
    effective_until          TIMESTAMPTZ,
    created_by               UUID REFERENCES users (id),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT rtp_profiles_status_valid CHECK (status IN ('draft', 'verified', 'active', 'retired')),
    CONSTRAINT rtp_profiles_target_sane CHECK (target_basis_points BETWEEN 5000 AND 20000),
    CONSTRAINT rtp_profiles_version_positive CHECK (version > 0),
    CONSTRAINT rtp_profiles_schedule_ordered CHECK (
        effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from),
    CONSTRAINT rtp_profiles_verified_has_evidence CHECK (
        status IN ('draft', 'retired')
        OR (verified_at IS NOT NULL AND observed_basis_points IS NOT NULL))
);

CREATE UNIQUE INDEX rtp_profiles_game_name_version_key ON rtp_profiles (game_id, name, version);
CREATE UNIQUE INDEX rtp_profiles_one_active_per_game ON rtp_profiles (game_id) WHERE status = 'active';

ALTER TABLE games
    ADD COLUMN default_rtp_profile_id UUID,
    ADD CONSTRAINT games_default_rtp_profile_fk
        FOREIGN KEY (default_rtp_profile_id) REFERENCES rtp_profiles (id) ON DELETE SET NULL;
```

A rate is basis points: `96.00%` is `9600`. The partial unique index is what makes "one
active profile per game" a fact rather than an intention, and
`rtp_profiles_verified_has_evidence` is what stops a form from promoting a number.

A verified profile is never edited. A change is a new `version`.
`games.default_rtp_profile_id` preserves the verified profile to restore after a timed
profile expires. It is added after `rtp_profiles` to resolve the two tables' dependency.

### 4.6 `game_rounds`

```sql
CREATE TABLE game_rounds (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_key             TEXT NOT NULL,
    user_id               UUID NOT NULL REFERENCES users (id),
    game_id               UUID NOT NULL REFERENCES games (id),
    wallet_id             UUID NOT NULL REFERENCES wallets (id),
    currency              TEXT NOT NULL REFERENCES currencies (code),
    rtp_profile_id        UUID REFERENCES rtp_profiles (id),
    status                TEXT NOT NULL DEFAULT 'open',
    stake_minor           BIGINT NOT NULL,
    win_minor             BIGINT,
    multiplier_hundredths INTEGER,
    engine_reference      TEXT,
    result_data           JSONB,
    started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT game_rounds_status_valid CHECK (status IN ('open', 'settled', 'cancelled', 'failed')),
    CONSTRAINT game_rounds_stake_positive CHECK (stake_minor > 0),
    CONSTRAINT game_rounds_win_non_negative CHECK (win_minor IS NULL OR win_minor >= 0),
    CONSTRAINT game_rounds_settled_has_outcome CHECK (
        (status = 'settled') = (settled_at IS NOT NULL AND win_minor IS NOT NULL)),
    CONSTRAINT game_rounds_money_json_safe CHECK (
        stake_minor <= 9007199254740991
        AND (win_minor IS NULL OR win_minor <= 9007199254740991))
);

CREATE UNIQUE INDEX game_rounds_round_key_key ON game_rounds (round_key);
CREATE INDEX game_rounds_user_started ON game_rounds (user_id, started_at DESC);
CREATE INDEX game_rounds_game_started ON game_rounds (game_id, started_at DESC);
```

`round_key` is the idempotency key of opening a round: a double-tapped spin presents the
same key and gets the same round back. `result_data` is for non-secret display and audit
data an engine produces — never RNG state, never a seed, never anything the browser could
use to predict an outcome.

Settle-at-most-once has three guards: the conditional update in §10, the
`game_rounds_settled_has_outcome` check above, and
`wallet_transactions_one_win_per_round` in §4.3. The third is the one that holds when the
first two are bypassed by a bug.

### 4.7 `payment_methods` and `deposit_requests`

```sql
CREATE TABLE payment_methods (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               TEXT NOT NULL,
    description        TEXT NOT NULL DEFAULT '',
    pay_to             TEXT NOT NULL,
    reference_required BOOLEAN NOT NULL DEFAULT true,
    enabled            BOOLEAN NOT NULL DEFAULT false,
    sort_order         INTEGER NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO payment_methods (
    name, description, pay_to, reference_required, enabled, sort_order
) VALUES
    ('GCash', 'Send your payment to the GCash account shown below.', 'To be supplied', true, false, 10),
    ('Maya', 'Send your payment to the Maya account shown below.', 'To be supplied', true, false, 20);

CREATE TABLE deposit_requests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users (id),
    wallet_id        UUID NOT NULL REFERENCES wallets (id),
    currency         TEXT NOT NULL REFERENCES currencies (code),
    method_id        UUID NOT NULL REFERENCES payment_methods (id),
    amount_minor     BIGINT NOT NULL,
    reference        TEXT,
    proof_path       TEXT,
    status           TEXT NOT NULL DEFAULT 'pending',
    idempotency_key  TEXT,
    reviewed_by      UUID REFERENCES users (id),
    reviewed_at      TIMESTAMPTZ,
    reason           TEXT,
    transaction_id   UUID REFERENCES wallet_transactions (id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT deposit_requests_status_valid CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT deposit_requests_amount_positive CHECK (amount_minor > 0),
    CONSTRAINT deposit_requests_reviewed_pair CHECK (
        (status = 'pending') = (reviewed_at IS NULL AND reviewed_by IS NULL)),
    CONSTRAINT deposit_requests_rejection_has_reason CHECK (
        status <> 'rejected' OR length(btrim(coalesce(reason, ''))) > 0),
    CONSTRAINT deposit_requests_approval_has_movement CHECK (
        (status = 'approved') = (transaction_id IS NOT NULL)),
    CONSTRAINT deposit_requests_amount_json_safe CHECK (amount_minor <= 9007199254740991)
);

CREATE UNIQUE INDEX deposit_requests_idempotency_key
    ON deposit_requests (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX deposit_requests_status_created ON deposit_requests (status, created_at DESC);
CREATE INDEX deposit_requests_user_created ON deposit_requests (user_id, created_at DESC);
```

`deposit_requests_approval_has_movement` is the schema saying what §12 says in prose: an
approved request and the credit that paid it are one transaction or neither happened.

### 4.8 `audit_logs`

```sql
CREATE TABLE audit_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users (id),
    action        TEXT NOT NULL,
    entity_type   TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    detail        TEXT NOT NULL DEFAULT '',
    before_data   JSONB,
    after_data    JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_actor_created ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX audit_logs_entity ON audit_logs (entity_type, entity_id);
```

The actions that must appear here: wallet credit and debit, deposit approval and
rejection, account status change, game creation and status change, RTP profile creation,
edit, and activation, and a password reset carried out on someone's behalf.

## 5. Accounts and sessions

Built: registration, login, logout, `/api/me`, the paginated/searchable/status-filtered
admin account list, individual admin detail, audited suspend/reinstate operations with
immediate session revocation, and the paginated operator audit feed. Authentication uses
Argon2id hashing with a per-hash salt and constant-time comparison, opaque 32-byte session
tokens stored as a SHA-256 hash in an HttpOnly cookie, the `Origin` allowlist,
indistinguishable login failures with matched timing, and a per-client rate limit on the
credential endpoints.

Still to build, all of it named in `api.md`:

- `POST /api/password-reset` — always `204`, whether or not the address is registered, and
  in the same time either way.
- `POST /api/password-reset/confirm` — single-use token, `400` on an expired, used, or
  unknown one, and every other session on the account revoked on success.
- `POST /api/password` — requires the current password, and revokes every other session.

A session is revoked, never deleted, so when it ended stays on the record. One query
resolves a session and joins the account's role and status, so a suspended account loses
access on its next request rather than at its next login.

Role and status are read from the database on every request. A role in a request body,
a cookie, or a header is input and is rejected with every other unknown field.

## 6. Currencies

`GET /api/currencies` lists the enabled currencies with code, name, symbol, and minor
units. Internal callers validate a code against the same table.

`enabled` is checked when a wallet is provisioned, not on every movement. A currency
retired while balances exist must not strand those funds or fail the payout of a round
already open; what it blocks is new wallets in that currency.

## 7. Wallets and movements

The highest-risk package in the backend. Everything here runs in one database
transaction with the wallet row locked.

A wallet is provisioned on first access — `GET /api/wallets`,
`GET /api/wallets/{currency}`, and `GET /api/admin/users/{id}/wallets` all create the
missing wallet for an enabled currency — so an operator can credit a player who has never
opened the wallet page. Provisioning writes no ledger row, because no money moved.

A movement takes an amount in minor units that is always positive at the boundary, a
kind, a reference, an optional idempotency key, and the acting account when an operator
caused it. The service, not the caller, decides the sign of the ledger row.

```text
BEGIN
  SELECT … FROM wallets WHERE id = $1 FOR UPDATE
  idempotency key already present for this wallet?  -> return the existing movement
  wallet status is 'active'?                        -> else WALLET_FROZEN
  currency matches the movement?                    -> else UNSUPPORTED_CURRENCY
  debit and balance_minor >= amount?                -> else INSUFFICIENT_BALANCE
  UPDATE wallets SET balance_minor = …, updated_at = now()
  INSERT INTO wallet_transactions (…)
COMMIT
```

Any failure rolls the whole transaction back. A package that needs a row written inside
this transaction takes the `*sql.Tx` as an argument (`go-style.md`); nothing outside
`internal/wallet` writes `wallets` or `wallet_transactions`.

An operator adjustment additionally requires the `admin` role, a positive amount, a
reason, and an audit row written in the same transaction. No code path anywhere updates
`balance_minor` without inserting the matching ledger row beside it.

Arithmetic on money checks for overflow. Signed overflow wraps in Go rather than
trapping, and a wrapped amount is silently wrong money — a negation that wraps records a
debit as a credit of the same size.

## 8. Ledger reads

A player reads their own wallet's movements through
`GET /api/wallets/{currency}/transactions`. An operator reads every movement through
`GET /api/admin/transactions`, filtered by account, currency, kind, and date range.

There is no endpoint that updates or deletes a ledger row, and no administrative override
that does it quietly. A player response carries the movement, its kind, the amount, the
currency, the balance before and after, the reference, and the timestamp — not the
operator who made an adjustment or the internal reason text.

## 9. Games

`GET /api/games` is a page of the games whose status is `active`, with their category
and wager configuration, filtered by `category`, `search`, `sort`, and `flag`.
`GET /api/games/{slug}` is one active game; any other status is `404`, the same answer as
an unknown slug. `GET /api/categories` lists every category with its active-game count so
the web app can hide an empty one. An operator sees every
game, including `draft`, `maintenance`, and `retired`, through `GET /api/admin/games`, and
creates and edits them through the two admin routes.

Wager bounds are enforced server-side wherever a wager is accepted: at least
`min_wager_minor`, at most `max_wager_minor`, and an exact multiple of
`wager_step_minor`. A value from the browser is checked against the row, never trusted
against the form that produced it.

A game whose status is not `active` refuses a round with `GAME_UNAVAILABLE`.

There is no game-session endpoint in the contract. The host page gets what it needs from
`GET /api/games/{slug}` and the wallet; whether an engine needs more than that is decided
in `../game-engine-integration/`, and adding a route is a change to `api.md`.

## 10. Rounds

Round persistence and its lifecycle rules are platform work and can be built now.
Outcome generation is not, and cannot be invented here.

Opening a round binds it to an account, a game, a wallet, and a currency, records the
active `rtp_profile_id` at that moment, and debits the wager as a `wager` movement in the
same transaction. A round captures its profile at creation: activating a different
profile five seconds later does not touch a round already open.

Settlement credits a `win` movement when the payout is positive and closes the round:

```sql
UPDATE game_rounds
   SET status = 'settled', win_minor = $2, multiplier_hundredths = $3,
       settled_at = now(), result_data = $4, updated_at = now()
 WHERE id = $1 AND status = 'open'
```

Zero rows affected means the round was already settled — `ROUND_ALREADY_SETTLED`, and the
client shows the settled result rather than retrying.

Cancellation and failure are terminal alternatives for an open round. Each credits one
`refund` movement equal to the original stake and changes the status in the same
transaction. Repeating the same cancel or fail operation returns the stored round without
another refund; attempting a different terminal transition is rejected.

The wallet row is locked before any row that references it. `game_rounds` has a foreign
key to `wallets`, so inserting a round makes PostgreSQL hold a `KEY SHARE` lock on the
wallet row for the rest of the transaction; two concurrent round starts that each held
that and then asked for `FOR UPDATE` would deadlock, and a player double-tapping spin is
exactly that case. Opening a round therefore takes the wallet lock first, then inserts.

Neither opening nor settling a round is a player-facing HTTP operation, which is why
`api.md` lists no `POST /api/rounds` and no settle route. A payout decides how much money
moves, and a value the browser supplies is not something the server may act on; a round
exists to be settled, so opening one before an engine can settle it would take a wager
the platform cannot resolve. The engine stage calls this package directly, in process.

Players read their own rounds through `GET /api/rounds` and `GET /api/rounds/{id}`;
operators read all of them through `GET /api/admin/rounds`.

## 11. RTP profiles

Before an engine exists, this package owns profile metadata, the activation rule, and
scheduling. It owns no probability, no weight table, and no paytable.

Permitted now: creating a `draft` profile with a name, a version, and a target in basis
points · editing a draft · listing profiles for a game · recording every change in the
audit log · scheduling a profile that is already `verified`.

Not permitted now: marking a profile verified, claiming an observed or theoretical RTP,
inventing a probability table, or activating a profile against a game that does not
implement it.

`POST /api/admin/rtp-profiles/{id}/activate` therefore answers
`RTP_PROFILE_NOT_VERIFIED` for every profile today, and that refusal is the feature, not
a gap. The activation path itself is real and tested against rows inserted as if verified:
it takes the game row lock first so two operators queue instead of deadlocking, moves the
profile previously in force back to `verified` so it stays a version to revert to, and
refuses a target at or above 100% without an end time. An open-ended activation becomes
the game's default. A timed activation requires a different verified default; a
database-backed reconciler restores it at expiry, and round opening performs the same
reconciliation inside its transaction before binding a profile. Nothing in this package can set `verified`: verification means an engine
implements the profile and a simulation measured the result, which is §12 of
`../game-engine-integration/SPEC.md`.

A schedule has an optional start and end and reverts to the game's default profile when
it ends. Activation, scheduling, and reversion each write an audit row.

## 12. Manual deposits

A player picks a wallet, enters an amount within the per-currency bounds, picks an
enabled payment method, supplies the method's reference when it requires one, and gets a
`pending` request. An out-of-range amount is a `400` with a `fields` entry; the bounds are
server-side configuration returned with each enabled currency, and the web app validates
against those values before the server enforces them again.

A request carries an idempotency key, so a retried submission returns the original
request with `200 OK` instead of queueing a second one or retaining another proof file.

An operator works the queue and either approves or rejects. A rejection requires a
reason. Approval is one transaction:

```text
BEGIN
  SELECT … FROM deposit_requests WHERE id = $1 FOR UPDATE
  status is 'pending'?                -> else 409 already reviewed
  lock the wallet, credit it, insert the 'deposit' movement   (§7)
  UPDATE deposit_requests SET status = 'approved', reviewed_by, reviewed_at, transaction_id
  INSERT INTO audit_logs (…)
COMMIT
```

A second approval cannot credit a second time: the request row is locked and its status
is checked inside the transaction, and `deposit_requests_approval_has_movement` ties the
approval to exactly one movement.

Proof upload is part of `POST /api/deposits` and is required for Phase 1. It uses an image
MIME allowlist checked by content rather than extension, a 5 MiB file cap within the
6 MiB request cap, a server-generated filename, and storage outside every served
directory. Only an administrator can retrieve it through
`GET /api/admin/deposits/{id}/proof`. The `proof_path` column stores only that private,
server-generated filename.

## 13. Audit trail

One append-only insert, taking the acting account, an action, the entity, and the before
and after state. It is written inside the same database transaction as the change it
records wherever that is possible, so an approved deposit with no audit row cannot exist.

`GET /api/admin/audit-logs` is a paged, filterable read. There is no update and no
delete.

## 14. Authorization

Session resolution is global middleware: it records who the caller is and refuses
nothing. The CSRF check is global too, and applies to every state-changing request.
Authorization is per route — a guard that requires a session, and a guard that requires
the `admin` role — and the service re-checks ownership for anything that touches money.

A player-scoped read answers `404` for a resource that exists but belongs to someone
else. An identifier in a path is input, never a fact about who is asking, and `403` on
someone else's wallet would confirm that the wallet exists.

Phase 1 has two roles, `player` and `admin`. Finer roles are not built before they are
needed, and no API is designed as though every authenticated caller may call an operator
route.

## 15. Errors

Each package declares its sentinel errors in `model.go` and wraps with `%w`. The handler
is the only place that turns one into a status code, and the mapping is the table in
`api.md`:

```text
ErrInsufficientBalance  409 INSUFFICIENT_BALANCE
ErrWalletFrozen         409 WALLET_FROZEN
ErrRoundSettled         409 ROUND_ALREADY_SETTLED
ErrDuplicateRequest     409 DUPLICATE_REQUEST
ErrUnsupportedCurrency  409 UNSUPPORTED_CURRENCY
ErrGameUnavailable      409 GAME_UNAVAILABLE
ErrProfileNotVerified   409 RTP_PROFILE_NOT_VERIFIED
ErrDefaultRequired      409 RTP_DEFAULT_REQUIRED
```

A `400`, `401`, `403`, `404`, `413`, `429`, or `500` carries no code. Adding a code is a
contract change in `api.md`, in `ApiErrorBody`, and in the handler together.

No driver error, constraint name, SQL fragment, or stack trace reaches a response. The
cause is logged; the response is the failure shape.

## 16. Pagination and filtering

`internal/httpx` owns the page shape in `api.md` and the parsing of `page`, `size`,
`search`, `status`, `type`, `currency`, `game_id`, `from`, and `to`. Default size 20,
maximum 100, and no unbounded list endpoint anywhere.

Every column a list filters or orders on is indexed, and the total comes from a counting
query against the same predicate rather than from the length of the page.

## 17. Concurrency and idempotency

Correctness on money comes from the database, not from Go. The serialisation primitive is
`SELECT … FOR UPDATE` on the wallet row inside a transaction. An in-process mutex is not
the lock: the platform will run as more than one process, and a mutex promises nothing
across them.

Locks are always taken in the same order — wallet first, then any row that references it
(§10).

Idempotency is a key supplied by the caller, stored with the resulting row, and protected
by a unique index. A duplicate request returns the original result without applying the
change twice, and the index is what makes that true under a race rather than relying on a
prior `SELECT`.

These tests are required, against real PostgreSQL:

1. a wallet holding 1,000 receives two concurrent debits of 800 — exactly one succeeds,
   the balance is 200, and exactly one ledger row exists;
2. two concurrent movements with the same idempotency key produce one ledger row, and
   both callers see the same movement;
3. two concurrent settlements of one round settle it once and the loser gets
   `ROUND_ALREADY_SETTLED`;
4. two concurrent approvals of one deposit credit the wallet once;
5. two concurrent round starts on one wallet do not deadlock.

## 18. Observability

`log/slog`, structured, with the identifiers that make an incident traceable:
`request_id`, `user_id`, `wallet_id`, `transaction_id`, `game_id`, `round_id`, and a
reference form of an idempotency key.

Never logged: a password, a password hash, a raw session or reset token, the contents of a
payment proof, or RNG state.

Every state transition that moves money is logged at the point it commits, with the
amount in minor units and the currency.

## 19. Tests

Per `security.md`, tests accompany every change touching money, auth, or permissions.

Unit tests cover validation, state-machine rules, authorization decisions, and money
arithmetic including its overflow paths. Database-backed tests are mandatory for wallet
credit and debit, rollback, row locking, idempotency, deposit approval, and single
settlement — against real PostgreSQL, because locking semantics are the thing under test.
HTTP tests drive an `httptest` server with a cookie-keeping client for the session guard,
the role guard, validation, and status mapping.

Database-backed tests read `TEST_DATABASE_URL`, fall back to `DATABASE_URL`, and skip
when PostgreSQL is unreachable. CI sets `REQUIRE_TEST_DATABASE=1` so a skip there fails
the build, and CI runs the migrations before the tests.

The end-to-end scenarios that must pass before the engine stage opens:

1. register, log in, read `/api/me`;
2. an operator credits a wallet, and the player sees the balance and the movement;
3. an operator debits a wallet;
4. a debit larger than the balance fails and changes nothing;
5. a deposit request is submitted, approved, and lands as one credit;
6. a suspended account loses access on its next request;
7. a player cannot read another player's wallet, rounds, or deposits.

## 20. Build order

Each step ends with its tests passing and its migrations reversible. The master Phase 1
checklist tracks their completion.

```text
A  schema, currencies, internal/app, internal/httpx
B  wallets and the ledger
C  operator money operations and the audit trail
D  manual deposits and the review queue
E  the game catalogue
F  round records and RTP profile metadata
G  hardening: paging, filtering, the dashboard, observability, integration tests
```

The remaining account endpoints in §5 do not block any of these and can land beside any
step.

## 21. Definition of done

The backend is ready for the engine stage when an account can register, log in, and log
out; a session authenticates and a role authorises; PHP and USD exist with their metadata;
wallets provision and read correctly; a credit or debit is atomic, ledger-backed, and
cannot drive a balance negative; idempotency and concurrency are tested against real
PostgreSQL; an operator can adjust a balance with a reason and an audit row; the catalogue
exists with server-enforced wager bounds; a round record exists with settlement that the
database permits exactly once; an RTP profile cannot claim verification; manual deposits
credit exactly once on approval; every response and failure matches `api.md`; and no
game-specific probability or outcome logic has been invented anywhere in it.
