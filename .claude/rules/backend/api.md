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
| `RTP_PROFILE_NOT_VERIFIED` | 409 | Refuse activation, explain why |
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
`flag`, `game_id`, `from`, `to`, as each endpoint supports them. Default size 20, maximum
100. A list of rows that players or operators keep adding to is always a page. A list
bounded by configuration — currencies, categories, payment methods, a player's wallets,
one game's RTP profiles — is a plain array.

## Endpoints

### Accounts

| Method | Path | Success | Failures |
| --- | --- | --- | --- |
| `POST` | `/api/register` | `201` + the account, signed in | `400` invalid input · `409` email taken |
| `POST` | `/api/login` | `200` + the account | `400` missing input · `401` bad credentials · `403` account not active |
| `POST` | `/api/logout` | `204` | — |
| `GET` | `/api/me` | `200` + the account | `401` no session |

`/api/register` and `/api/login` are rate limited per client by
`LOGIN_ATTEMPTS_PER_MINUTE`.

Planned, not yet routed — the contract these will meet when they land; a request today
gets the not-found response:

| Method | Path | Success | Failures |
| --- | --- | --- | --- |
| `POST` | `/api/password-reset` | `204` always | `400` invalid input |
| `POST` | `/api/password-reset/confirm` | `204` | `400` invalid input or expired token |
| `POST` | `/api/password` | `204` | `400` invalid input · `401` no session or wrong current password |

`/api/password-reset` joins the rate-limited set, answers `204` whether or not the
address is registered, and a successful `/api/password-reset/confirm` or `/api/password`
revokes every other session on the account.

### Player

| Method | Path | Success | Failures |
| --- | --- | --- | --- |
| `GET` | `/api/currencies` | `200` + enabled currencies | — |
| `GET` | `/api/wallets` | `200` + the player's wallets | `401` |
| `GET` | `/api/wallets/{currency}` | `200` + the wallet, provisioned if absent | `401` · `404` unknown currency |
| `GET` | `/api/wallets/{currency}/transactions` | `200` + a page of that wallet's movements; accepts `type`, `from`, `to` | `400` invalid filter · `401` · `404` |
| `GET` | `/api/transactions` | `200` + a page of the player's movements; accepts `currency`, `type`, `from`, `to` | `400` invalid filter · `401` · `404` unknown currency |
| `GET` | `/api/categories` | `200` + every category with its active-game count and availability | — |
| `GET` | `/api/games` | `200` + a page of active games; accepts `category`, `search`, `sort=name\|newest`, `flag=new` | `400` invalid filter |
| `GET` | `/api/games/{slug}` | `200` + the game | `404` not active or unknown |
| `GET` | `/api/payment-methods` | `200` + enabled methods | `401` |
| `POST` | `/api/deposits` | `201` + a new request · `200` + the original retry result | `400` · `401` · `413` |
| `GET` | `/api/deposits` | `200` + a page of own requests, optionally filtered by `status=pending|approved|rejected` | `400` invalid filter · `401` |
| `GET` | `/api/deposits/{id}` | `200` + the request | `401` · `404` |

A player-scoped read answers `404` for a resource that exists but belongs to someone
else. An id in a path is input, never a fact about who is asking.

Planned, not yet routed: `GET /api/rounds` (`200` + a page of own rounds · `401`) and
`GET /api/rounds/{id}` (`200` + the round · `401` · `404`). Internal round opening is
implemented together with settle-at-most-once and idempotent cancel/fail refunds; these
read routes remain.

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

Payment methods are migration/configuration-managed in Phase 1. There is no operator
payment-method mutation endpoint. Seeded destination placeholders are disabled;
deployment configuration must replace the destination and explicitly enable a method
before players can submit deposits through it.

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
| `GET` | `/api/admin/deposits` | `200` + a page of requests; defaults to pending and accepts `user_id` plus `status=all|pending|approved|rejected` | `400` invalid filter |
| `GET` | `/api/admin/deposits/{id}/proof` | `200` + private image content | `404` |
| `POST` | `/api/admin/deposits/{id}/review` | `200` + the request | `400` invalid action, amount, or reason · `404` · `409` `DEPOSIT_ALREADY_REVIEWED` / `DEPOSIT_APPROVAL_FAILED` / `AMOUNT_OVERFLOW` |
| `GET` | `/api/admin/games` | `200` + a page of games in every status; accepts `status`, `category`, `search` | `400` invalid filter |
| `GET` | `/api/admin/games/{id}` | `200` + the game | `404` |
| `POST` | `/api/admin/games` | `201` + the game | `400` · `409` slug taken |
| `PATCH` | `/api/admin/games/{id}` | `200` + the game | `400` · `404` |
| `GET` | `/api/admin/games/{id}/rtp-profiles` | `200` + the game's profiles, newest first | `404` |
| `POST` | `/api/admin/games/{id}/rtp-profiles` | `201` + the draft profile | `400` · `404` · `409` name and version taken |
| `GET` | `/api/admin/rtp-profiles` | `200` + a page of profiles across games; accepts `game_id`, `status` | `400` invalid filter |
| `PATCH` | `/api/admin/rtp-profiles/{id}` | `200` + the profile; drafts only | `400` · `404` · `409` name and version taken |
| `POST` | `/api/admin/rtp-profiles/{id}/activate` | `200` + the profile; accepts `effective_from` and `effective_until` | `400` · `404` · `409` `RTP_PROFILE_NOT_VERIFIED` |
| `GET` | `/api/admin/audit-logs` | `200` + a page of entries; accepts `user_id` (the actor), `type` (the action), `from`, `to` | `400` invalid filter |
| `GET` | `/api/admin/dashboard?currency=PHP` | `200` + the summary for that currency | `400` missing or unknown currency |

An admin game body is the catalogue body plus `integration`, `active_rtp_basis_points`
(null when no profile is active), `rounds_30d`, and `updated_at`. A game is created with
`slug`, `name`, `description`, `category_slug`, `provider`, `currency`, and the three
wager bounds; `status` is optional and defaults to `draft`. The slug never changes after
creation. `integration` is set by the engine review, never by these routes. Wager bounds
are whole units of the game's currency, the maximum is the minimum plus a whole number
of steps, and the currency cannot change once a round has been played. A create is
audited as `game.create`; a patch as `game.update`, or `game.status_change` when the
status moved.

A profile body carries `game_id`, `game_slug`, `game_name`, `name`, `version`,
`target_basis_points`, `status`, `engine_config_ref`, the nullable
`theoretical_basis_points`, `observed_basis_points`, `verified_at`, `effective_from`,
and `effective_until`, plus `created_by`, `created_by_display_name`, and timestamps.
A draft takes `name`, `version`, `target_basis_points` from the Phase 1 set (`9200`,
`9400`, `9600`, `10000`, `10200`, `10500`), and an optional `engine_config_ref`. Only a
draft can be patched. Activation moves the profile previously in force back to
`verified`, and a target at or above `10000` refuses to activate without
`effective_until`. Nothing on these routes can mark a profile verified. Audited as
`rtp_profile.create`, `rtp_profile.update`, `rtp_profile.activate`, and
`rtp_profile.schedule` when the active profile's window changes.

Planned, not yet routed: `GET /api/admin/rounds` (`200` + a page of rounds).

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
