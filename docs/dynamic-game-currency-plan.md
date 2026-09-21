# Dynamic Game Currency Implementation

## Summary

Make every game use the player’s active PHP or USD wallet, with wager limits configured independently for each currency.

## Implementation changes

- Add `game_wager_limits`, keyed by `(game_id, currency)`, containing minimum, maximum, and step values with the existing positive-value and exact-JSON-integer safety constraints.
- Migrate every game to PHP and USD limits by copying its current numeric values, then remove the single-currency wager fields from `games`.
- Replace singular game currency fields in public and admin APIs with a required `wager_limits` map containing PHP and USD.
- Update game creation, editing, detail displays, audit snapshots, seeds, fixtures, and validation for both currency configurations.
- Make the game page, promotional minimum-bet displays, wallet query, bet controls, round request, result label, and insufficient-balance dialog use `useActiveCurrency()`.
- Reset the selected stake to the applicable minimum when the game or active currency changes.
- Filter embedded game history by game ID and active currency; leave account-wide history unchanged.
- Resolve and lock the requested currency’s wager configuration server-side, provision and debit that currency’s wallet, and include currency in idempotency comparisons.
- Keep currency switching exclusively on the Wallet page.

## Public interfaces

```ts
type WagerLimit = {
  min_wager_minor: number
  max_wager_minor: number
  wager_step_minor: number
}

type Game = {
  // existing identity and catalogue fields
  wager_limits: Record<'PHP' | 'USD', WagerLimit>
}
```

Game create/update requests and all player/admin game responses use `wager_limits`; the old singular currency and wager fields are removed.

## Documentation

- Update the backend service specification, engine integration specification, and phase feature checklist to describe multi-currency games and per-currency wager validation.

## Test plan

- Verify migration up/down and copied PHP/USD limits.
- Test complete game-limit CRUD and rejection of missing, duplicate, disabled, unsafe, fractional, or invalid configurations.
- Test isolated PHP/USD wallet debits, payouts, limits, responses, and cross-currency idempotency conflicts.
- Test active-currency game rendering, requests, wallet updates, promotional displays, and currency-filtered history.
- Test both-currency admin forms and field-specific validation.
- Run backend race tests, frontend tests, type checking, linting, and production builds.

## Assumptions

- PHP and USD remain the only supported currencies.
- Both limits are mandatory for every game.
- No exchange-rate or balance conversion is introduced.
- Initial PHP and USD ranges use the same numeric values and can later be tuned independently.
