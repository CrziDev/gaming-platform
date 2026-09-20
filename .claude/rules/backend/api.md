# API contract

Base path is `/api`. There is no version segment.

## Shape

A success response is the resource itself, with no envelope.

A failure is:

```json
{ "error": "Enter an email address and a password" }
```

plus `"fields"` when a specific input was rejected, keyed by the name the client sent:

```json
{ "error": "That email address is already registered", "fields": { "email": "Already registered" } }
```

plus `"code"` when the status alone does not tell the client what to do:

```json
{ "error": "Your balance is too low for that bet", "code": "INSUFFICIENT_BALANCE" }
```

`fields` and `code` are omitted when empty. `error` is a message a person can read; it
never carries a driver error, a stack trace, or a SQL fragment.

### Codes

A code exists only where two failures share a status and the client must act differently
on each. Adding one is a contract change: it goes in this table, in `ApiErrorBody`, and
in the handler at the same time. A client never matches on `error` text.

| Code | Status | Client behaviour it selects |
| --- | --- | --- |
| `INSUFFICIENT_BALANCE` | 409 | Prompt to top up |
| `WALLET_FROZEN` | 409 | Direct to support |
| `WALLET_CLOSED` | 409 | Refuse the operation and direct the operator to account support |
| `AMOUNT_OVERFLOW` | 409 | Refuse a credit that cannot be represented safely |
| `ROUND_ALREADY_SETTLED` | 409 | Show the settled result, do not retry |
| `UNSUPPORTED_CURRENCY` | 409 | Refuse the currency, do not retry |
| `GAME_UNAVAILABLE` | 409 | Return to the catalogue |
| `DEPOSIT_ALREADY_REVIEWED` | 409 | Refresh the queue; another review already won |
| `DEPOSIT_APPROVAL_FAILED` | 409 | Keep the request pending and report that its wallet cannot be credited |
| `SELF_STATUS_CHANGE` | 409 | Refuse an administrator changing their own status |
| `ACCOUNT_CLOSED` | 409 | Keep a closed account terminal |

A `400`, `401`, `403`, `404`, `413`, `429`, or `500` carries no code: the status is the
whole answer, and `fields` handles input-specific rejection.

## Lists

A paginated list is the page, and the page is the resource:

```json
{ "rows": [], "total": 0, "page": 1, "size": 20, "pages": 1 }
```

Parameters are `page`, `size`, `search`, `status`, `type`, `currency`, `category`, `sort`,
`flag`, `game_id`, `user_id`, `from`, `to`, `rtp_basis_points`, `rows`, and `risk`, as
each endpoint supports them. Default size 20, maximum 100. A list of rows that players
or operators keep adding to is always a page. A list
bounded by configuration — currencies, categories, payment methods, a player's wallets,
one game's RTP options — is a plain array.

## Endpoints

### Accounts

| Method | Path | Success | Failures |
| --- | --- | --- | --- |
| `POST` | `/api/register` | `201` + the account, signed in | `400` invalid input · `409` email taken |
| `POST` | `/api/login` | `200` + the account | `400` missing input · `401` bad credentials · `403` account not active |
| `POST` | `/api/logout` | `204` | — |
| `GET` | `/api/me` | `200` + the account | `401` no session |

`/api/register` and `/api/login` are rate limited per client by
`LOGIN_ATTEMPTS_PER_MINUTE`, and `POST /api/chat/messages` per account by
`CHAT_MESSAGES_PER_MINUTE`.

### Player

| Method | Path | Success | Failures |
| --- | --- | --- | --- |
| `GET` | `/api/currencies` | `200` + enabled currencies | — |
| `GET` | `/api/wallets` | `200` + the player's wallets | `401` |
| `GET` | `/api/wallets/{currency}` | `200` + the wallet, provisioned if absent | `401` · `404` unknown currency |
| `GET` | `/api/wallets/{currency}/transactions` | `200` + a page of that wallet's movements; accepts `type`, `from`, `to` | `400` invalid filter · `401` · `404` |
| `GET` | `/api/transactions` | `200` + a page of the player's movements; accepts `currency`, `type`, `from`, `to` | `400` invalid filter · `401` · `404` unknown currency |
| `GET` | `/api/transactions/summary` | `200` + one summary per wallet the player holds; accepts `currency`, `from`, `to` | `400` invalid filter · `401` · `404` unknown currency |
| `GET` | `/api/categories` | `200` + every category with its active-game count and availability | — |
| `GET` | `/api/games` | `200` + a page of active games; accepts `category`, `search`, `sort=name\|newest`, `flag=new` | `400` invalid filter |
| `GET` | `/api/games/{slug}` | `200` + the game | `404` not active or unknown |
| `GET` | `/api/favorites` | `200` + a page of the player's favourite games, newest first; active games only | `401` |
| `PUT` | `/api/games/{slug}/favorite` | `204`, and again `204` when it already was one | `401` · `404` not active or unknown |
| `DELETE` | `/api/games/{slug}/favorite` | `204`, and again `204` when it was not one | `401` · `404` not active or unknown |
| `GET` | `/api/games/{slug}/manifest` | `200` + the public parameters of the return the game plays at, and its `rtp_basis_points` | `404` no engine or not active · `409` `GAME_UNAVAILABLE` no RTP set |
| `POST` | `/api/games/{slug}/rounds` | `200` + the settled round, its display result, and the wallet · the same for a retry | `400` · `401` · `404` no engine or not active · `409` `INSUFFICIENT_BALANCE` / `WALLET_FROZEN` / `WALLET_CLOSED` / `AMOUNT_OVERFLOW` / `UNSUPPORTED_CURRENCY` / `GAME_UNAVAILABLE` |
| `GET` | `/api/payment-methods` | `200` + enabled methods | `401` |
| `POST` | `/api/deposits` | `201` + a new request · `200` + the original retry result | `400` · `401` · `413` |
| `GET` | `/api/deposits` | `200` + a page of own requests, optionally filtered by `status=pending|approved|rejected` | `400` invalid filter · `401` |
| `GET` | `/api/deposits/{id}` | `200` + the request | `401` · `404` |
| `GET` | `/api/chat/messages` | `200` + the room: who is online and the latest fifty messages, oldest first | — |
| `POST` | `/api/chat/messages` | `201` + the message | `400` empty, multi-line, or over 280 characters · `401` · `429` over the per-account limit |
| `GET` | `/api/chat/socket` | `101` and a WebSocket the server pushes events on | `403` origin not allowed |
| `GET` | `/api/rounds` | `200` + a page of own rounds; accepts `game_id`, `status`, `currency`, `from`, `to` | `400` invalid filter · `401` |
| `GET` | `/api/notifications` | `200` + a page of the player's notifications, newest first | `400` invalid paging · `401` |
| `POST` | `/api/notifications/read` | `204`; every unread one is now read | `401` |
| `GET` | `/api/rounds/{id}` | `200` + the owned round | `401` · `404` |

A player-scoped read answers `404` for a resource that exists but belongs to someone
else. An id in a path is input, never a fact about who is asking.

A favourite is a mark on a catalogue game, not a copy of it: `GET /api/favorites` pages
the same game bodies the catalogue serves, and a game that leaves `active` leaves the
list with it. `PUT` and `DELETE` are idempotent by method, carry no body, and answer
`204`; the client knows the state from the list it already holds.

The chat room is `{ "online", "messages" }`, where a message is
`{ "id", "display_name", "role", "text", "created_at" }`. It is a fixed window of the
newest fifty, not a page, because the rail never asks for an older one. Reading is
public; posting takes `{ "text" }` from a signed-in player, names the author from the
session, and is limited per account by `CHAT_MESSAGES_PER_MINUTE` with `Retry-After` on
the `429`. The socket at `/api/chat/socket` is read-only for the client and carries two
events: `{"type":"message"}` after every accepted post, which tells the client to
re-read `/api/chat/messages`, and `{"type":"presence","online":n}` whenever the count of
open sockets changes. The handshake `Origin` is checked against the same allowlist as
every write. Presence and fan-out are per server process.

A notification is `{ "id", "kind", "amount_minor", "currency", "detail", "reference_id",
"read", "created_at" }` with `kind` one of `deposit_approved`, `deposit_rejected`, or
`round_win`; the client composes the text from `kind`, and `detail` carries a rejection
reason. `amount_minor` and `currency` are the credited amount for an approval or a win
and the requested amount for a rejection, or both null. A notification is written in
the same transaction as the review or the settlement it reports, once per
`(kind, reference_id)`, and a win notifies only at or above
`BIG_WIN_MULTIPLIER_HUNDREDTHS` (`1000`, ten times the stake, by default; `0` turns it
off). There is no per-item read endpoint; the bell is read as a whole.

A wallet summary is `{ "currency", "deposited_minor", "staked_minor", "returned_minor" }`:
the sum of `deposit` movements, the sum of `wager` debits, and the sum of `win` credits
inside the window. The response is a plain array with one entry per wallet, or one entry
when `currency` narrows it; nothing in it adds two currencies together, and an operator
adjustment or a refund counts in none of the three figures.

A round body carries `id`, `game_id`, `game_slug`, `game_name`, `rtp_basis_points`,
`status`, `stake_minor`, nullable `win_minor`, nullable `multiplier_hundredths`,
`currency`, `started_at`, and nullable `settled_at`.

The catalogue is public and shows only `active` games; a `draft`, `maintenance`, or
`retired` game is `404` by slug and absent from every list. `search` matches the game
name, category name, and provider. `sort` defaults to `name`. A game carries
`flags`: `new` for thirty days after it was added. `hot` is not served until round data
exists to define it; a client asking for `flag=hot` gets `400`. A game body carries
`thumbnail_url`, null until reviewed art is attached; the client renders the placeholder
slot either way.

Enabled currency resources include `deposit_min_minor` and `deposit_max_minor`. A
submitted deposit request cannot be cancelled by the player; it remains pending until an
administrator approves or rejects it.

`POST /api/deposits` is `multipart/form-data` with `method_id`, `currency`,
`amount_minor`, `reference`, and a required `proof` file. It also requires an
`Idempotency-Key` header of at most 200 characters. The entire HTTP body is limited to
6 MiB and the proof itself to 5 MiB. Only PNG and JPEG content identified from its bytes
is accepted; the client filename and declared MIME type are not trusted. A retry returns
the original request and does not retain the redundant uploaded file.

`POST /api/games/{slug}/rounds` plays one round of an integrated game. It requires an
`Idempotency-Key` header of at most 200 characters and a body of `stake_minor`,
`currency`, and `params`, the game's public parameters as an object the engine
validates (Plinko: `rows` 8–16 and `risk` `low|normal|high`). The wager is debited, the
outcome decided, and any win credited in one transaction; the response is
`{ "round": <round>, "result": <object>, "wallet": { "currency", "balance_minor" } }`,
where `result` is a display hint (Plinko: `rows`, `risk`, `slot`) and the round's
`win_minor` and `multiplier_hundredths` are the authoritative outcome. A retry with the
same key returns the original response; the same key with a different stake or
parameters is `400` with `fields.idempotency_key`. A slug with no engine on this server
is `404`, however the catalogue describes it, and `GET /api/games/{slug}/manifest` is
the public shape of what that engine plays — for Plinko, `rows`, `risks`, and
`multipliers_hundredths` by rows and risk — from the configuration behind the return the
game is set to, plus `rtp_basis_points`, the return it describes: a settled round whose
`rtp_basis_points` differs tells the client the table it holds is no longer the one
rounds settle on. A round records the return it was opened at, so a switch never
changes a round already open.

Payment methods are configuration-managed. There is no operator
payment-method mutation endpoint. The migration creates GCash and Maya disabled with a
placeholder destination; deployment configuration must replace the destination and
explicitly enable a method before players can submit deposits through it. `make seed`
enables both for development with destinations that are visibly not real accounts, so
the deposit flow can be exercised locally without a production destination ever being
seeded.

### Operator

Every path below requires the `admin` role and answers `403` without it, `401` without a
session. Those two are omitted from the failure column.

| Method | Path | Success | Failures |
| --- | --- | --- | --- |
| `GET` | `/api/admin/users` | `200` + a page of accounts | — |
| `GET` | `/api/admin/users/{id}` | `200` + the account | `404` |
| `PATCH` | `/api/admin/users/{id}/status` | `200` + the account; accepts `active` or `suspended` | `400` · `404` · `409` `SELF_STATUS_CHANGE` / `ACCOUNT_CLOSED` |
| `GET` | `/api/admin/users/{id}/wallets` | `200` + the account's wallets | `404` |
| `POST` | `/api/admin/users/{id}/wallet-adjustments` | `201` + the movement | `400` · `404` · `409` `INSUFFICIENT_BALANCE` / `WALLET_FROZEN` / `WALLET_CLOSED` / `AMOUNT_OVERFLOW` |
| `GET` | `/api/admin/transactions` | `200` + a page of movements | — |
| `GET` | `/api/admin/rounds` | `200` + a page of rounds; accepts `user_id`, `game_id`, `status`, `currency`, `from`, `to` | `400` invalid filter |
| `GET` | `/api/admin/deposits` | `200` + a page of requests; defaults to pending and accepts `user_id` plus `status=all|pending|approved|rejected` | `400` invalid filter |
| `GET` | `/api/admin/deposits/{id}/proof` | `200` + private image content | `404` |
| `POST` | `/api/admin/deposits/{id}/review` | `200` + the request | `400` invalid action, amount, or reason · `404` · `409` `DEPOSIT_ALREADY_REVIEWED` / `DEPOSIT_APPROVAL_FAILED` / `AMOUNT_OVERFLOW` |
| `GET` | `/api/admin/games` | `200` + a page of games in every status; accepts `status`, `category`, `search` | `400` invalid filter |
| `GET` | `/api/admin/games/{id}` | `200` + the game | `404` |
| `POST` | `/api/admin/games` | `201` + the game | `400` · `409` slug taken |
| `PATCH` | `/api/admin/games/{id}` | `200` + the game | `400` · `404` |
| `PUT` | `/api/admin/games/{id}/rtp` | `200` + the game; takes `rtp_basis_points` | `400` not one of the game's `rtp_options` · `404` |
| `GET` | `/api/admin/games/{id}/rtp-configuration` | `200` + the engine's inspectable configuration; requires `rtp_basis_points`, `rows`, and `risk` | `400` invalid option or board · `404` game or inspectable configuration unavailable |
| `GET` | `/api/admin/audit-logs` | `200` + a page of entries; accepts `user_id` (the actor), `type` (the action), `from`, `to` | `400` invalid filter |
| `GET` | `/api/admin/dashboard?currency=PHP` | `200` + the summary for that currency | `400` missing or unknown currency |

An admin game body is the catalogue body plus `integration`, `rtp_basis_points` (null
until an operator sets one), `rtp_options` (the returns the game's engine ships,
ascending; `[]` when no engine on this server plays it), `rounds_30d`, and `updated_at`.
A game is created with `slug`, `name`, `description`, `category_slug`, `provider`,
`currency`, and the three wager bounds; `status` is optional and defaults to `draft`.
The slug never changes after creation. `integration` is set by the engine review, never
by these routes. Wager bounds are whole units of the game's currency, the maximum is
the minimum plus a whole number of steps, and the currency cannot change once a round
has been played. A create is audited as `game.create`; a patch as `game.update`, or
`game.status_change` when the status moved.

A game's RTP is one of its `rtp_options`, nothing else: the engine compiles each option
in with its tables, proves every board's return exactly, and records its simulation
evidence in the game's RTP document before the option ships. `PUT
/api/admin/games/{id}/rtp` switches the game to an option; it takes effect on the next
round, holds until the next switch, and is audited as `game.rtp_change` with the
before and after values. Setting the value already in force is `200` and writes no
audit row. No route schedules a switch, and nothing in the database marks a return
verified.

`GET /api/admin/games/{id}/rtp-configuration` is read-only and does not change the
option in force. For an engine that exposes an inspectable configuration, it returns
`configuration_ref`, `rtp_basis_points`, the available `rows` and `risks`, and one
`selected_board` containing its rows, risk, theoretical RTP, and slots. Each slot has
`slot`, `multiplier_hundredths`, and `chance_thousandths_percent`; the normalized
chances total exactly `100000` (100.000%). The engine calculates this projection from
its compiled configuration. The endpoint does not expose raw draw weights. A game with
no such RTP option is `400`; an engine without this optional capability is `404`.

An admin round body adds `user_id`, `user_email`, `display_name`, and `wallet_id` to the
player round resource.

The dashboard summary is one currency's day. Its deposit figures come from
`deposit_requests`; its play figures — `staked_today_minor`, `returned_today_minor`,
`hold_today_minor` (staked minus returned), `rounds_today`, `players_today` — come from
rounds settled since midnight UTC, so a wager refunded on a failed round is not stake.
`effective_rtp_basis_points` is returned over staked; `expected_rtp_basis_points` is the
stake-weighted mean of the return each of those rounds recorded when it opened, which is
the only figure the effective one can fairly be compared to across games or after a
mid-day RTP switch. `games` is a plain array, largest stake first, with the same figures
per game (`game_id`, `game_slug`, `game_name`, `rounds`, `staked_minor`, `returned_minor`,
`hold_minor`, `effective_rtp_basis_points`, `expected_rtp_basis_points`) for every game
with a settled round today; a game nobody played is absent.

Any other path returns the not-found response, not a router default.

## Money and time

Money on the wire is a JSON integer count of minor units in a field ending `_minor`,
beside an ISO currency code. Go stores it as `int64`, but persisted and returned values
must remain within JavaScript's exact integer range (`-9007199254740991` through
`9007199254740991`). Never a decimal or floating-point amount. A string representation
may replace JSON numbers in a future version only as an explicit whole-client contract
change.

A player may hold a wallet in each enabled currency. Every amount belongs to exactly one
of them, no response sums across currencies, and **no endpoint converts or transfers
between them** — there is no exchange rate in the platform.

A multiplier is an integer in hundredths — `1.7×` is `170` — in a field ending
`_hundredths`. A rate is an integer in basis points — `96.00%` is `9600` — in a field
ending `_basis_points`.

Timestamps are RFC 3339 UTC.

## Accounts

Public registration always creates a player. Only `make seed` provisions the development
administrator, and re-running it restores the admin role, activates the account, and
resets the password.

The account body carries `id`, `email`, `display_name`, `role`, and `created_at`. The
admin listing adds `status`.
