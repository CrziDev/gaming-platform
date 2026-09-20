# Plinko runtime

How the Plinko frame is built, served, and driven by the platform. The RTP model is in
`plinko-rtp.md`; the integration boundary it satisfies is `../game-engine-integration/SPEC.md`.

## Supplied source

The untouched CodeCanyon package lives at `docs/games/source/plinko/` and is gitignored
because its licence forbids redistribution. It runs standalone by opening
`Main/index.html` in a browser; it has no build step. It is vanilla JS with Matter.js
0.19.0 (MIT) and an in-memory wallet, and it picks its own outcome client-side.

### Assessment

The intake review `../game-engine-integration/SPEC.md` §3 asks for. A preliminary
review of `state.js`, `logic.js`, and `physics.js` was carried over from the previous
codebase on 2026-09-13; the complete package was run and reviewed for the port on
2026-09-19, and this is the result.

```text
Game:                                Plinko
Version / source:                    "Plinko — Claymorphism" 1.0, ImpressDev, CodeCanyon; docs/games/source/plinko/
Review date:                         2026-09-19

Source complete and buildable:       PASS — complete package, no build step, runs from Main/index.html
Financial flow identifiable:         YES — in-memory balance in state.js, debited and credited in logic.js
Outcome and RNG identifiable:        YES — physics.js picks a slot with Math.random() over a 0.24 decay; paytable in state.js
External backend required:           NO — no fetch, XMLHttpRequest, WebSocket, or storage; the only request is Google Fonts
Server-authoritative outcome viable: YES — the picker is separable from the animation, which steers to a chosen slot
Central wallet integration viable:   YES — one balance field in state.js, debited and credited in two places in logic.js
RTP verification viable:             YES — weights and multipliers are plain data (plinko-rtp.md §9)

Risk: MEDIUM
Required changes: remove the wallet, bet arithmetic, outcome picker, and paytable from the
  frame; make the server's slot authoritative and hold the ball to it, because the supplied
  game pays on the physical landing slot rather than the slot it picked; restyle to the
  platform tokens; change the blocked low-risk boards' centre and ring multipliers
  (plinko-rtp.md §10).
Unknowns: which CodeCanyon licence tier was purchased is not recorded in this repository.
  The Regular terms restrict use to an end product that is free for end users; the
  Extended terms cover a commercial platform.
Recommendation: port critical logic — wallet, wager, outcome, and payout to Go; Matter.js
  stays in the frame as presentation of the server's result.
```

## Integrated frame — `games/plinko/web/`

| File | Role |
| --- | --- |
| `index.html` | Canvas, the `?` how-to trigger, the static splash, the how-to `<dialog>`; loads Matter as a classic script and `js/main.js` as a module |
| `css/plinko.css` | The design tokens copied from `frontend/src/styles/index.css` as custom properties, plus the splash, button, and dialog |
| `js/main.js` | Boot order: `ui.mount` → `physics.init` → `bridge.start`; posts `ready` |
| `js/state.js` | Rows, risk, multiplier table, sound flag, active bucket, result labels |
| `js/bridge.js` | The frame side of the protocol: guards origin, source, version, type, and fields |
| `js/physics.js` | Board geometry, peg grid, ball drop, steering, the landing guard, peg-tick audio |
| `js/theme.js` | Reads the tokens once and maps a bucket to a flat fill |
| `js/ui.js` | Canvas sizing with device pixel ratio, splash, how-to dialog, multiplier text |
| `js/vendor/` | `matter.min.js` 0.19.0 with its MIT licence |

What was removed from the supplied game: the paytable, the outcome picker, the wallet
and bet arithmetic, the bet and refill modals, the risk and rows pills, the play and
auto controls, and the toasts. The platform supplies the rest; auto play and the
refill modal are not carried over.

The board's table is the one behind the return the game is set to, read from
`GET /api/games/{slug}/manifest` in integer hundredths.
`frontend/src/features/gameplay/multipliers.ts` holds the supplied paytable as the demo
fixture only; every shipped option differs from it on some low-risk boards
(`plinko-rtp.md` §9).

### Landing guard

The ball is steered toward the settled slot as in the supplied game. Below the last peg
row it is held inside that bucket's lane, at the ribbon it is reported `landed` for that
slot, a ball older than twelve seconds is removed and reported the same way, and a board
reset reports every live ball first. The frame never pays on a physical position.

### Palette

Pegs `ink-mute`, `accent-ink` on contact. Ball `ink`. Dropper `surface-2` over `panel`.
Buckets are flat bands by distance from the centre: edge `gold`/`on-gold`, next ring
`accent`/`on-accent`, inner `surface-3`/`ink-soft`, and any bucket below 1× muted on
`surface-3`. The landing bucket lifts a few pixels for 260 ms with an `ink` outline and
the host's result label is drawn above it in `win`. No gradients, shadows, or glows.

## Server engine — `backend/internal/engine/`

The outcome is decided on the server, in integer arithmetic, before the ball is
dropped. `engine` is the part every game shares; `engine/plinko` is this game's rules.

| File | Role |
| --- | --- |
| `engine/random.go` | `SecureSource` on `crypto/rand`, the only source a production round may draw from, and `WeightedIndex`, an unbiased draw over integer weights via `math/rand/v2` |
| `engine/errors.go` | `ErrInvalidParams`, `ErrUnknownConfig`, `ErrInvalidConfig`, `ErrInvalidWeights`, `ErrPayoutOverflow`, shared so the round package maps them without importing a game |
| `plinko/config.go` | `Params` (rows 8–16, risk low/normal/high), `Table` (one board's slot weights and multipliers, symmetric), `Profile` (one option: its basis points, its reference, and a table for every board) |
| `plinko/supplied.go` | The vendor paytable in hundredths and the vendor `0.24` decay as integer weights — reference data for deriving and checking options, never played directly |
| `plinko/rules.go` | `Pick` (a slot from a table) and `Payout` (`stake × multiplier / 100`, overflow-checked, truncating; exact under a wager step that is a multiple of 100) |
| `plinko/rtp.go` | `TheoreticalBasisPoints` — `Σ w·m / Σ w` in integers — and the largest-remainder projection that turns raw weights into normalized chances totaling 100.000%; its tests reproduce every figure in `plinko-rtp.md` §5 and pin the projection |
| `plinko/profile_9000.go` … `profile_11000.go` | The four shipped options, `plinko/9000` to `plinko/11000`: weights and multipliers for all 27 boards each, `plinko-rtp.md` §9 |
| `plinko/profiles.go` | The ordered option set: `Options`, `ProfileByBasisPoints` (what a game row's `rtp_basis_points` resolves through), and `ProfileByRef` (what a round's `engine_reference` resolves through). `profiles_test.go` pins every board of every option to its basis points exactly |
| `plinko/engine.go` | `Engine.Options`: the shipped returns. `Engine.Play`: decodes the public parameters (unknown fields refused), resolves the configuration, picks the slot from the secure source, and returns the payout, multiplier, and `{rows, risk, slot}`. `Engine.Manifest`: every board's player-visible multipliers, never its weights. `Engine.AdminConfiguration`: one guarded board's reference, target and theoretical RTP, multipliers, and normalized chances, never its raw weights |
| `backend/cmd/seed/catalogue.go` | The development fixture: `plinko` integrated in the catalogue at 95%, reset on every seed. `seed_test.go` runs the catalogue seed against the test database in a rolled-back transaction and asserts the seeded return is one the engine offers; CI also runs `make seed` after the suite |
| `backend/cmd/gameverify` | Offline tooling: `solve` derives an option's weights from its multipliers and prints the complete table literal, and `simulate` plays every board of every option — or one — through the production `Pick` and `Payout` path (`plinko-rtp.md` §9) |

Deterministic sources exist only in `_test.go` files; nothing at runtime can select one.

### Round — `backend/internal/round/`

`engine.go` declares the `Engine` interface the round package consumes —
`Options() []engine.Option`, `Play(engine.Input) (engine.Outcome, error)`, and
`Manifest(configRef string) (json.RawMessage, error)` — plus the optional
`AdminConfiguration` capability, and `Engines`, the slug-to-engine map the route table
builds and the game console reads through.
`play.go` is the orchestration. Plinko has no decision between the stake and the
result, so a round is **one transaction**: `openTx` locks the wallet, locks the game row,
resolves its `rtp_basis_points` to the option that plays it, binds the round to that
return and debits the wager; the engine decides; `settleTx`
credits any win and closes the round; then everything commits or nothing does. There is
no state in which a player has paid for a round with no outcome, so no recovery worker
exists for this game. `Open`, `Settle`, `Cancel`, and `Fail` remain for engines that
need two phases.

`handler.go` mounts it as `POST /api/games/{slug}/rounds` and serves
`GET /api/games/{slug}/manifest`, the public parameters of the return the game is set
to plus `rtp_basis_points`; both answer 404 for a slug with no engine in the registry
`internal/app` builds, and the manifest answers 409 `GAME_UNAVAILABLE` when the game has
no return set or one its engine no longer ships. An operator's switch lands between
one manifest read and the next round; the host closes that gap below. The idempotency
key is scoped to the player (`play:<user>:<key>`). A retry returns the
committed round and its display result as long as it asks for the same stake and
parameters; a different stake or parameters under the same key is a conflict. The
parameters and the engine's result are stored in `result_data` as
`{"params": …, "result": …}` and the engine and configuration in `engine_reference`.

`internal/game` separately serves the guarded
`GET /api/admin/games/{id}/rtp-configuration`, which resolves an operator-selected
option and board through the same engine registry without changing the return in force.

## Serving

`frontend/vite/gameFrames.ts` serves `games/plinko/web/` at `/games/plinko/` in
development and copies it to `frontend/dist/games/plinko/` on build. The frame URL is
always the explicit `/games/plinko/index.html`, because the SPA owns `/games/*`. Paths
that resolve outside the game folder are refused with 403; missing files fall through to
the SPA.

## Host and bridge

`frontend/src/components/game/GameHost.tsx` embeds the frame and overlays the platform
chrome. `frontend/src/features/gameplay/` owns the protocol (`schemas.ts`, `bridge.ts`),
the manifest query and the round request (`api.ts`), the page session (`session.ts`),
the Plinko controls, and `GameHistory.tsx`, which `GamePage` renders under every title's
board, engine or not: the player's own recent rounds on the game, read through the wallet
feature's `useRecentRounds` from `GET /api/rounds?game_id=`, with a one-line empty state
until the first bet settles and a link to the full history. The manifest is validated before it
configures anything: every board the controls offer must be present with exactly
rows + 1 positive integers.
`GamePage` wires them; a slug with no module in `registry.ts`
keeps the display-slot placeholder.

Protocol version 1, same-origin. The host accepts a message only when its origin is the
frame's and its source is the iframe's own window; the frame accepts only its parent on
its own origin. Every message carries `v: 1`; an unknown version, type, or field is
rejected.

| Direction | Type | Fields |
| --- | --- | --- |
| frame → host | `ready` | `game` |
| frame → host | `landed` | `round_id`, `slot` |
| frame → host | `error` | `code` (`bad_message`, `unsupported_version`, `runtime`), `message` |
| host → frame | `configure` | `rows`, `risk`, `multipliers_hundredths`, `sound` |
| host → frame | `drop` | `round_id`, `slot`, `multiplier_hundredths`, `result_label` |
| host → frame | `set_sound` | `enabled` |

`result_label` is money already formatted by the host; the frame formats no money.

### Lifecycle

1. The iframe mounts and the host waits ten seconds for `ready`; silence is the error
   state with a retry that remounts the frame.
2. `ready` is answered with `configure` once the manifest has loaded, which builds the
   board and hides the splash; until then the host shows the loading state and Place
   bet is disabled. A manifest 404 or 409 is the error state with a retry that refetches
   it and remounts the frame; no bet is offered against a table the player cannot see.
   A second `ready` is a reloaded frame: the host settles everything outstanding and
   configures again. The host sends only a board the frame does not already have.
3. Place bet calls `POST /api/games/{slug}/rounds` with an `Idempotency-Key`, served by
   `round.Handler.Play` through the engine registered for the slug, and a 404 is
   reported as the game not being available on this server. Component tests settle
   against the deterministic fixture in `src/mocks/plinko.ts`.
4. The settled result is sent as `drop`. Rows and risk are locked while any ball is in
   flight. The wallet, rounds, and transactions are refetched when the frame reports
   `landed`, or eight seconds later regardless, so an animation can never hide a
   settled round; that refetch is what puts the round into the history under the board.
5. Every settled round names its `rtp_basis_points`. When it is not the manifest's, the
   host refetches the manifest and reconfigures the board with the new table once no
   ball is in flight; the ball that revealed the change still drops, since its `drop`
   carries its own multiplier and label. The board can therefore show a superseded
   option's table for at most one round after a switch.

Sound is remembered per browser under `game.sound`; rows and risk under
`game.plinko.rows` and `game.plinko.risk`.

## Demo-only fixtures

The fixture engine, the fixture manifest (`plinkoManifest` in `src/mocks/plinko.ts`, the
supplied paytable labelled as the demo's 95% return), and the fixture Plinko catalogue
entry never reach a production bundle.

## Checks

`cd frontend && npm run typecheck && npm run lint && npm test && npm run build`. The
frame itself is exercised through the host tests and a browser run of the demo.
