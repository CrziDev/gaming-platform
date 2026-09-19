# Universal Game Integration Plan

## 1. Purpose

This plan defines one reusable path for integrating any supplied browser game with the
platform.

Do not implement a game-specific engine until that game's complete source has been
received, run, and reviewed. The source determines the final adapter shape, transaction
strategy, public parameters, and RTP model.

An integration is complete only when the platform server controls the wallet, wager,
outcome, payout, and round record. A game displayed in the catalogue is not necessarily
integrated, and a stored RTP percentage does not create that RTP.

## 2. Non-negotiable boundaries

- The server authenticates the player and owns every balance.
- The server validates and debits every wager.
- The server determines or independently validates every payout.
- A win is credited at most once.
- Every round and wallet movement is recorded.
- Browser code handles input and presentation, not financial authority.
- Game-specific behavior stays behind one engine boundary.
- An engine never writes a wallet balance or opens a database transaction.
- RTP is enabled only when the game's real mathematics can be verified.

```text
game frontend
    -> generic game host and bridge
        -> authenticated round handler
            -> game engine
            -> wallet movement
            -> round record
```

## 3. Source intake and feasibility review

Every game is reviewed before integration, and the result is recorded per game as the
assessment section of its runtime document, `docs/games/<game-slug>-runtime.md`.

Review only what affects feasibility and safety:

1. Confirm the source is complete, readable, licensed for modification, and buildable.
2. Record its entry point, dependencies, asset pipeline, external services, and network
   requests.
3. Trace wager selection, validation, balance deduction, payout calculation, credit,
   cancellation, and retry behavior.
4. Locate outcome generation, randomness, probability data, paytables, bonuses, and any
   debug controls.
5. Locate browser storage, cookies, hard-coded domains, credentials, and internal wallet
   state.
6. Determine whether outcome logic can be separated from animation.
7. Determine whether RTP is real, configurable, and mathematically verifiable.

Use this compact assessment:

```text
Game:
Version / source:
Review date:

Source complete and buildable:       PASS / WARN / FAIL
Financial flow identifiable:         YES / PARTIAL / NO
Outcome and RNG identifiable:        YES / PARTIAL / NO
External backend required:           YES / NO
Server-authoritative outcome viable: YES / PARTIAL / NO
Central wallet integration viable:   YES / PARTIAL / NO
RTP verification viable:             YES / PARTIAL / NO

Risk: LOW / MEDIUM / HIGH / UNSUPPORTED
Required changes:
Unknowns:
Recommendation: adapt / port critical logic / replace component / unsupported
```

Do not begin the port before this assessment is complete.

## 4. Likely repository structure

The final names may change after source review, but an integrated game will normally use
this structure. `<game-slug>` is a placeholder for any title.

```text
gaming-platform/
|-- backend/
|   |-- cmd/
|   |   |-- server/
|   |   |   `-- main.go                         existing
|   |   `-- gameverify/
|   |       `-- main.go                         new; offline RTP verification
|   |
|   `-- internal/
|       |-- app/
|       |   |-- app.go                          modified; engine wiring and play route
|       |   `-- server.go                       modified if recovery worker is needed
|       |
|       |-- round/
|       |   |-- model.go                        modified; play request and result
|       |   |-- repository.go                   modified as required by engine state
|       |   |-- service.go                      existing lifecycle, adapted as needed
|       |   |-- handler.go                      modified; authenticated play endpoint
|       |   |-- engine.go                       new; consumed Engine interface
|       |   |-- play.go                         new; round and wallet orchestration
|       |   |-- play_test.go                    new
|       |   `-- recovery.go                     conditional; unfinished-round recovery
|       |
|       `-- engine/
|           |-- registry.go                     new; game slug to engine mapping
|           |-- random.go                       new; production secure randomness
|           |-- random_test.go                  new; deterministic test source
|           `-- <game-slug>/
|               |-- engine.go                   new; engine implementation
|               |-- config.go                   new; immutable profile configuration
|               |-- rules.go                    new; outcome rules
|               |-- payout.go                   new; integer payout calculation
|               |-- manifest.go                 optional public game parameters
|               |-- engine_test.go              new
|               `-- payout_test.go              new
|
|-- database/
|   `-- migrations/
|       |-- 000008_create_games.*.sql            existing foundation
|       |-- 000009_create_rtp_profiles.*.sql     existing foundation
|       |-- 000010_create_game_rounds.*.sql      existing foundation
|       `-- NNNNNN_<required_change>.*.sql       conditional after source review
|
|-- frontend/
|   `-- src/
|       |-- api/
|       |   `-- types.ts                         modified; play/result wire types
|       |-- features/
|       |   `-- gameplay/
|       |       |-- api.ts                       new; round request
|       |       |-- hooks.ts                     new; query/mutation hooks
|       |       |-- schemas.ts                   new; message and result validation
|       |       |-- bridge.ts                    new; versioned postMessage bridge
|       |       |-- bridge.test.ts               new
|       |       `-- index.ts                     new; feature boundary
|       |-- components/
|       |   `-- game/
|       |       |-- GameHost.tsx                 new; generic iframe host
|       |       `-- GameHost.test.tsx            new
|       `-- pages/
|           |-- GamePage.tsx                     modified; replaces placeholder host
|           `-- GamePage.test.tsx                new or expanded
|
|-- games/
|   `-- <game-slug>/
|       |-- source/                              untouched supplied source
|       |   |-- LICENSE                          retained when supplied
|       |   `-- ...                              complete original project
|       `-- web/                                 integrated browser version
|           |-- index.html
|           |-- bridge.*                         platform bridge adapter
|           |-- assets/
|           `-- ...                              adapted game files
|
|-- docs/
|   `-- games/
|       |-- <game-slug>-runtime.md               build and runtime instructions, with the section 3 assessment
|       `-- <game-slug>-rtp.md                   RTP model, profiles, and verification evidence
|
|-- Makefile                                     modified if game build tasks are needed
`-- frontend/dist/games/<game-slug>/             generated deployment output
```

Generated build output and dependencies remain untracked. Supplied source, licences,
engine code, tests, immutable profile configuration, and verification documentation are
tracked.

The `Engine` interface belongs in the consuming `round` package. Concrete engines live
under `internal/engine/<game-slug>` and remain flat; they do not add service or repository
layers unless the audited game genuinely requires them.

## 5. Engine contract

The exact Go interface is finalized after the first source review. It should expose only
what the round orchestrator needs:

- stable game identity;
- configuration validation;
- supported public parameters;
- supported immutable RTP profiles;
- authoritative outcome and payout generation for a wager.

The engine returns a safe result to the round package. The round package owns database
transactions, wallet movements, idempotency, and lifecycle transitions.

## 6. Round lifecycle

```text
player requests play
    -> authenticate and authorize
    -> resolve the registered game engine
    -> validate game status, currency, wager, and public parameters
    -> snapshot the active verified profile
    -> lock wallet, debit wager, write ledger row, and create round
    -> produce the authoritative engine outcome
    -> settle the round once and credit any win
    -> return the safe result and current balance
    -> frontend animates the returned result
```

Round creation requires an idempotency key. A retry returns the original result and
cannot debit or pay twice.

The source audit decides whether opening and settlement use one transaction or two. A
two-transaction design must either reproduce the outcome deterministically or refund an
unfinished round through a documented recovery path.

## 7. API and browser bridge

The likely player write endpoint is:

```text
POST /api/games/{slug}/rounds
Idempotency-Key: <client-generated-key>
```

Its request contains only the wager and approved public game parameters. Its response
contains the settled round, safe display result, and authoritative wallet balance.

The embedded game does not call platform APIs directly. The generic host:

1. receives a versioned, schema-validated request from the game frame;
2. confirms the exact source origin and expected frame;
3. calls the authenticated platform endpoint;
4. sends the authoritative result back to the frame;
5. refreshes wallet and round history state.

The frame never receives server secrets, private RNG state, unrestricted engine
configuration, database access, or authority to debit or credit money.

## 8. Randomness and payout arithmetic

Production outcome generation uses a secure server-side random source. Deterministic
randomness is constructed only in tests and cannot be selected through runtime
configuration.

Money remains `int64` minor units. Multipliers and rates are integers. Runtime outcome
selection uses integer weights, and payout multiplication checks overflow before a
wallet movement is attempted. Any rounding behavior must be explicit, shared, and
included in RTP verification.

## 9. RTP profiles and verification

An RTP database row is metadata. The immutable engine configuration referenced by that
row produces the actual return.

Each verified profile records:

- game and profile version;
- target and theoretical RTP in basis points;
- immutable engine configuration reference;
- verification method and sample size;
- observed RTP and verification time.

A verified profile is never edited in place. Changes create a new version. Every round
captures the active profile when it opens, so later activation cannot alter that round.

Before a profile can become verified:

1. Calculate theoretical RTP from the production rules.
2. Run a headless simulation through the production outcome path.
3. Record the sample size, observed RTP, tolerance or confidence information, runtime,
   and engine version.
4. Reject verification when the evidence does not match the configured target.

## 10. Failure and recovery rules

The implementation must safely handle:

- duplicate or concurrent play requests;
- insufficient, frozen, or closed wallets;
- a process stopping after debit but before settlement;
- a lost response followed by a retry;
- duplicate settlement;
- invalid or missing engine configuration;
- an RTP profile changing while a round is open;
- an engine or animation failure.

Database uniqueness, wallet row locks, idempotent ledger movements, legal round state
transitions, and compensating refunds are the final safeguards. Animation failure never
changes an already-settled financial result.

## 11. Required tests

- Deterministic engine outcome and payout tests.
- Configuration and public-parameter validation tests.
- Theoretical RTP and simulation verification.
- Authenticated play endpoint tests.
- Atomic wager and win ledger tests.
- Duplicate request and concurrent wallet tests.
- Duplicate settlement and recovery/refund tests.
- Profile snapshot and activation-race tests.
- Bridge origin, source-window, version, and schema tests.
- Game-host loading, error, retry, and settled-result tests.
- Target mobile and desktop browser checks.

## 12. Implementation order

For every game:

1. Commit the untouched supplied source separately.
2. Run it exactly as supplied and document the build process.
3. Complete the source and feasibility assessment.
4. Choose the transaction and recovery strategy.
5. Define the minimal engine contract from the audited behavior.
6. Implement deterministic rules and payout tests.
7. Implement one verified baseline profile.
8. Add the authenticated round endpoint and engine registry entry.
9. Integrate the generic host and browser bridge.
10. Adapt the game animation to the server result.
11. Run financial, concurrency, bridge, browser, and RTP verification tests.
12. Mark the game `integrated` and expose it to players only after all checks pass.

## 13. Definition of done

A game is integrated when:

- it launches through the generic game host;
- the authenticated player and correct currency wallet are used;
- wagers and parameters are validated server-side;
- outcomes and payouts are server-authoritative;
- debit, credit, refund, and round records reconcile;
- retries, concurrency, refreshes, and duplicate settlement are safe;
- the displayed balance and result come from the server;
- unfinished rounds have a tested recovery rule;
- source, runtime assumptions, and external dependencies are documented;
- supported browsers pass integration checks;
- RTP profiles are exposed only after mathematical and simulation verification;
- the catalogue reports the title as integrated only after all requirements pass.

If critical source, outcome logic, vendor dependencies, licensing, or RTP mathematics
cannot be validated, record the reason and mark the game unsupported instead of weakening
the platform boundary.
