# Plinko runtime

How the Plinko frame is built, served, and driven by the platform. The RTP model is in
`plinko-rtp.md`; the integration boundary it satisfies is `../game-engine-integration/SPEC.md`.

## Supplied source

The untouched CodeCanyon package lives at `docs/games/source/plinko/` and is gitignored
because its licence forbids redistribution. It runs standalone by opening
`Main/index.html` in a browser; it has no build step. It is vanilla JS with Matter.js
0.19.0 (MIT) and an in-memory wallet, and it picks its own outcome client-side.

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

The paytable is `frontend/src/features/gameplay/multipliers.ts`, in integer hundredths.
It stands in for the game manifest until the server serves the active profile's table.

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
| `engine/errors.go` | `ErrInvalidParams`, `ErrUnknownConfig`, `ErrInvalidConfig`, `ErrInvalidWeights`, shared so the round package maps them without importing a game |
| `plinko/config.go` | `Params` (rows 8–16, risk low/normal/high), `Table` (one board's slot weights and multipliers, symmetric), `Profile` (a table for every board, addressed by `engine_config_ref`) |
| `plinko/supplied.go` | The vendor paytable in hundredths and the vendor `0.24` decay as integer weights — reference data for deriving and checking profiles, never played directly |
| `plinko/rules.go` | `Pick` (a slot from a table) and `Payout` (`stake × multiplier / 100`, overflow-checked, truncating; exact under a wager step that is a multiple of 100) |
| `plinko/rtp.go` | `TheoreticalBasisPoints` — `Σ w·m / Σ w` in integers; its tests reproduce every figure in `plinko-rtp.md` §5 |
| `plinko/profile_v1.go` | The baseline configuration `plinko/v1/9600`: weights and multipliers for all 27 boards, `plinko-rtp.md` §10 |
| `plinko/profiles.go` | `ProfileByRef`, the lookup an RTP profile row's `engine_config_ref` resolves through |
| `plinko/engine.go` | `Engine.Play`: decodes the public parameters (unknown fields refused), resolves the configuration, picks the slot from the secure source, and returns the payout, multiplier, and `{rows, risk, slot}` |
| `backend/cmd/gameverify` | Offline tooling: `solve` derives a profile's weights from its multipliers, `simulate` plays every board through the production `Pick` and `Payout` path, and `verify` does the same for a draft RTP profile row and marks it verified through `rtp.Verify` (`plinko-rtp.md` §11) |

Deterministic sources exist only in `_test.go` files; nothing at runtime can select one.

### Round — `backend/internal/round/`

`engine.go` declares the `Engine` interface the round package consumes — `Play(engine.Input)
(engine.Outcome, error)` and nothing more — and `Engines`, the slug-to-engine map the
route table builds. `play.go` is the orchestration. Plinko has no decision between the
stake and the result, so a round is **one transaction**: `openTx` locks the wallet,
binds the round to the active profile and debits the wager; the engine decides; `settleTx`
credits any win and closes the round; then everything commits or nothing does. There is
no state in which a player has paid for a round with no outcome, so no recovery worker
exists for this game. `Open`, `Settle`, `Cancel`, and `Fail` remain for engines that
need two phases.

`handler.go` mounts it as `POST /api/games/{slug}/rounds` and serves
`GET /api/games/{slug}/manifest`, the active configuration's public parameters; both
answer 404 for a slug with no engine in the registry `internal/app` builds. The
idempotency key is scoped to the player (`play:<user>:<key>`). A retry returns the
committed round and its display result as long as it asks for the same stake and
parameters; a different stake or parameters under the same key is a conflict. The
parameters and the engine's result are stored in `result_data` as
`{"params": …, "result": …}` and the engine and configuration in `engine_reference`.

## Serving

`frontend/vite/gameFrames.ts` serves `games/plinko/web/` at `/games/plinko/` in
development and copies it to `frontend/dist/games/plinko/` on build. The frame URL is
always the explicit `/games/plinko/index.html`, because the SPA owns `/games/*`. Paths
that resolve outside the game folder are refused with 403; missing files fall through to
the SPA.

## Host and bridge

`frontend/src/components/game/GameHost.tsx` embeds the frame and overlays the platform
chrome. `frontend/src/features/gameplay/` owns the protocol (`schemas.ts`, `bridge.ts`),
the round request (`api.ts`), the page session (`session.ts`), and the Plinko controls.
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
2. `ready` is answered with `configure`, which builds the board and hides the splash.
   A second `ready` is a reloaded frame: the host settles everything outstanding and
   configures again.
3. Place bet calls the round request. In the demo `src/mocks/plinko.ts` settles it
   with the supplied game's slot weights; outside the demo it is
   `POST /api/games/{slug}/rounds` with an `Idempotency-Key`, served by
   `round.Handler.Play` through the engine registered for the slug, and a 404 is
   reported as the game not being available on this server.
4. The settled result is sent as `drop`. Rows and risk are locked while any ball is in
   flight. The wallet, rounds, and transactions are refetched when the frame reports
   `landed`, or eight seconds later regardless, so an animation can never hide a
   settled round.

Sound is remembered per browser under `game.sound`; rows and risk under
`game.plinko.rows` and `game.plinko.risk`.

## Demo-only fixtures

The fixture engine and the fixture Plinko catalogue entry never reach a production
bundle.

## Checks

`cd frontend && npm run typecheck && npm run lint && npm test && npm run build`. The
frame itself is exercised through the host tests and a browser run of the demo.
