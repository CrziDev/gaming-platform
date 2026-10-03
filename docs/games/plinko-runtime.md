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

The frame is a three.js glass board: ten rows of pegs on a bent acrylic pane over eleven
glowing cups, in front of a night-city backdrop. It replaced the port of the supplied
Canvas 2D and Matter.js board on 2026-09-30. The supplied package is still the reference
for what the platform took over from the vendor; nothing of its drawing code remains.

| File | Role |
| --- | --- |
| `index.html` | The full-viewport `#scene`, the two taglines, the toast layer; an import map points `three` and `three/addons/` at `js/vendor/` |
| `css/plinko.css` | The frame's own art values: ground, taglines (smaller under 768px), and the result toast. It copies no platform tokens |
| `js/main.js` | Boot: loads three.js, the optional bloom pass, and the label and tagline fonts (at most 2.5 s), builds the board, starts the bridge, posts `ready` |
| `js/state.js` | Risk, the configured multipliers, sound flag, configured flag, and the host's stage rect |
| `js/bridge.js` | The frame side of the protocol: guards origin, source, version, type, and fields |
| `js/board.js` | The board: renderer, lighting, bloom, camera framing inside the stage rect, cup labels, the drop, the render-on-demand loop, and peg and landing tones |
| `js/theme.js` | The cup bands (silver, teal, purple, orange, red by distance from the centre) and the label font |
| `js/ui.js` | Tagline placement in the gutters between each frame edge and the nearest glass or host control at the tagline's own height: 40px from the glass or control beside it where the gutter has room, and never nearer the frame's edge than 40px; centred in the gutter otherwise, and hidden when a gutter cannot hold them clear; the left one stands down while the backdrop paints it; the scene's fade into the page ground below the stage rect; the result toast; and `formatMultiplier` |
| `js/board/geometry.js` | Every dimension of the board and the curves the pane, fins, and mouths follow |
| `js/board/kit.js` | Shared builders: canvas textures, glow sprites, highlight tubes, glass, subdivision, ribbons |
| `js/board/background.js` | The city backdrop shader, shared with the tinted back panel so the panel samples the same pixels, and the choice between the wide and tall photos |
| `js/board/pane.js`, `tray.js`, `fins.js`, `cups.js` | The pane and pegs; the base slab, front sheet, back panel, and opening shadow; the raked fins and side plates; the cups and drop mouths |
| `js/board/flight.js` | The drop path to a given slot, the ball's position along it, and `pathAt`, its position at any time since the drop |
| `js/board/trail.js` | The ball's light streak, sampled backwards along the flight path rather than from past frames, and the sparks a struck peg throws |
| `img/city.jpg` | The 1916×821 wide backdrop |
| `img/city-portrait.jpg` | The 940×1672 tall backdrop of the same scene, with `GOOD PLAYERS BET BETTER` painted on its pillar |
| `js/vendor/` | three.js 0.169.0 (`three.module.min.js`, and the postprocessing addons the bloom pass needs) with its MIT licence |

three.js is vendored under `packages.md`'s rule for a supplied game's libraries: it never
enters the React bundle. WebGL has no standard-library alternative, and the board is
a three.js scene; the addons are the four postprocessing passes and three shaders the
bloom pass imports, copied from the same release.

The board's table is the one behind the return the game is set to, read from
`GET /api/games/{slug}/manifest` in integer hundredths. The player plays only the 10-row
board; the server still settles every row count, and the admin RTP inspector still
offers each one. `frontend/src/features/gameplay/multipliers.ts` holds the supplied
paytable as the demo fixture and the inspector's fixture only; every shipped option
differs from it on some low-risk boards (`plinko-rtp.md` §9).

### Landing

The frame never decides an outcome. A `drop` names the slot the server settled; the
frame builds a path of ten half-peg turns with exactly `slot` of them to the right,
shuffles their order, and plays it as a fall onto the top peg, a bounce per row, an arc
into the chute mouth, and a sink into the cup. It posts `landed` for that slot when the
path ends. Under reduced motion the cup lights at once and `landed` is posted without
the flight. A `drop` before the board is configured is reported landed at once.

The streak behind the ball is the path itself, read back over its last 220 ms, so it is
a smooth curve at any frame rate and stretches with the ball's speed. It outlives the
ball by that long, draining into the cup, and the render loop runs until it and the peg
sparks have faded. Under reduced motion there is neither.

### Palette

The board's colours are game art, declared once in `js/theme.js` and nowhere in the
platform. Each cup band colours its cup's liquid from deep to light, paints its label in
its ink, and spills its glow onto the back wall, the front sheet, and the tray. Everything
else in the tray — the base slab, front sheet, fins, cup glass above the liquid
(`CUP_FILL`), and the drop-mouth rings with their halo, spark, and light — is ice-blue
glass, set in `cups.js`, `tray.js`, and `fins.js` rather than in the bands. The landing cup
pulses for about half a second. The streak is a white-hot core in an ice-blue glow,
the only part of it bright enough to bloom; on the arc into the mouth and the sink it
takes on the landing cup's band, never earlier. The frame's toast shows the host's result label in green
at or above 1× and in grey below it.

### Backdrop

The scene comes in two photos, and `js/board/background.js` shows whichever is nearer the
view's shape: the tall one below the geometric mean of the two aspects (about 1.15), the
wide one above it. A view taller than its photo crops it to cover, so a phone sees the
whole width of the tall photo; a wider one shows 15% beyond cover and fades the photo's
edges into the ground. Each photo's anchor height sits on the board's band as far as
cover allows. Until the tall photo arrives, a narrow view shows at least 40% of the wide
one's width. The tall photo paints the left tagline on its pillar, so the frame's own left
tagline stands down while it shows. Mipmaps keep desktop downscaling clean.

The city stays bright: a light shade at the top behind the title row and at the bottom
behind the bet panel, a faint vignette at the far edges, and a slight saturation lift. On
the pane, only the peg field is dimmed: each row from the outer edge of its first peg to
that of its last, with a narrow feather across that edge. The pane itself is untinted
glass that does not refract, so the rest of it shows the city at full brightness.

The pegs and the ball are one polished chrome. It reflects a studio of its own, laid out
around the camera's view: a broad soft cap overhead, a white window on each side, a warm
lamp low on each side, a cool spot below, a shaded waist, and a bright rim. The glass and
the cups keep the board's general studio.

### Art

The lobby banner (`frontend/src/assets/banners/plinko.jpg`, 2640×472, the desktop
banner's own shape at twice its size) is a capture of the game page itself: the frame
with its taglines, the title row, and the bet panel, signed in, in the short-screen side
layout with the stage pinned to 440px and the column pushed to the right edge with room
for the right tagline. The zone is captured 839px tall and cropped to its top 472 rows
so the whole skyline shows. The lobby shows the whole cluster from a 960px banner, the
board alone from 640px. Phones use `frontend/src/assets/banners/phone/plinko.jpg`
(1540×472): a frame capture with the taglines hidden and the board at 77% of the height
on the right, so it stands beside the copy in the 200px phone panel. The catalogue
tile (`frontend/src/assets/games/plinko.jpg`, 720×960) is a capture of the frame alone
with the taglines hidden and the board full width over its lower scrim; to re-render it,
open the frame in a headless Chromium, send `configure` and a `layout` for the board's
rect at that size with no `controls`, and screenshot the page. `frontend/src/lib/gameArt.ts` resolves all three by slug, and the lobby
banner rotates every 3 seconds between the catalogue titles with a module in
`frontend/src/features/gameplay/registry.ts`, Plinko, Plinko Billiards, and Plinko
Tropical today.

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
| `backend/cmd/seed/catalogue.go` | Bootstrap inserts `plinko` integrated at 95% when absent and preserves later operator changes. `seed_test.go` runs bootstrap against the test database in a rolled-back transaction and asserts the initial return is one the engine offers; CI also runs bootstrap and the guarded demo seed after the suite |
| `backend/cmd/gameverify` | Offline tooling: `solve` derives an option's weights from its multipliers and prints the complete table literal, and `simulate` plays every board of every option — or one — through the production `Pick` and `Payout` path (`plinko-rtp.md` §9) |

Deterministic sources exist only in `_test.go` files; nothing at runtime can select one.

### Round — `backend/internal/round/`

`engine.go` declares the `Engine` interface the round package consumes —
`Options() []engine.Option`, `Play(engine.Input) (engine.Outcome, error)`, and
`Manifest(configRef string) (json.RawMessage, error)` — plus the optional
`AdminConfiguration` capability, and `Engines`, the slug-to-engine map the route table
builds and the game console reads through. `internal/app` maps `plinko`,
`plinko-billiards`, and `plinko-tropical` to the same engine: each title keeps its own
game row, return, and rounds, and all three settle through these rules
(`plinko-billiards-runtime.md`, `plinko-tropical-runtime.md`).
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

`frontend/src/components/game/GameHost.tsx` is the game zone: the frame fills it edge to
edge, and the platform lays a single centred column over it — the title row (name,
subtitle, FAIR GAME, sound, favourite), the board's stage, and the bet panel. The stage
keeps the board's 10:11.2 shape and shrinks so the bet panel always fits, and the zone is
only as tall as the column, so round history follows straight after the bet panel. On a
narrow screen the stage keeps the module's `stageGutter` (44px) clear on each side, so
the board narrows and the taglines stand beside it. On a short screen (a viewport under
900px tall, the zone at least 640px wide) the column splits through the `game-side`
variant in `frontend/src/styles/index.css`: the stage takes the full height and the title
row and bet panel stand in a 340px panel beside it. The stage's rect and the rects of the
title row and bet panel, measured against the frame, are sent to the frame as `layout`;
the frame frames its camera inside the stage and keeps the taglines clear of the
controls. `frontend/src/features/gameplay/` owns the protocol (`schemas.ts`,
`bridge.ts`), the manifest query and the round request (`api.ts`), the page session
(`session.ts`), the risk menu (`RiskMenu.tsx`), the stake ladder (`stake.ts`), and
`GameHistory.tsx`, which `GamePage` renders under every title's board, engine or not: the
player's own recent rounds on the game, read through the wallet feature's
`useRecentRounds` from `GET /api/rounds?game_id=`, with a one-line empty state until the
first bet settles and a link to the full history. The manifest is validated before it
configures anything: the 10-row board must be present for every risk with exactly eleven
positive integers; the other boards the server serves are ignored. `GamePage` wires them;
a slug with no module in `registry.ts` keeps the display-slot placeholder.

The stepper walks a 1-2-5 ladder of stakes the server accepts — `min + n × step` inside
the currency's wager limits, the limits themselves always included. Space places a bet
unless focus is in a control or a dialog is open. FAIR GAME shows the payouts of the board
in play; a player never sees the return.

Protocol version 3, same-origin. The host accepts a message only when its origin is the
frame's and its source is the iframe's own window; the frame accepts only its parent on
its own origin. Every message carries `v: 3`; an unknown version, type, or field is
rejected, so a frame cached from an earlier version fails cleanly as
`unsupported_version`.

| Direction | Type | Fields |
| --- | --- | --- |
| frame → host | `ready` | `game` |
| frame → host | `landed` | `round_id`, `slot` (0–10) |
| frame → host | `error` | `code` (`bad_message`, `unsupported_version`, `runtime`), `message` |
| host → frame | `configure` | `rows` (always 10), `risk`, `multipliers_hundredths` (eleven), `sound` |
| host → frame | `layout` | `x`, `y`, `width`, `height` — the stage rect in the frame, in CSS pixels; `controls` — up to four rects of the same shape that the host's controls cover |
| host → frame | `drop` | `round_id`, `slot`, `multiplier_hundredths`, `result_label` |
| host → frame | `set_sound` | `enabled` |

`result_label` is money already formatted by the host; the frame formats no money.

### Lifecycle

1. The iframe mounts and the host waits ten seconds for `ready`; silence is the error
   state with a retry that remounts the frame. The frame sends `ready` only once its
   board is built.
2. `ready` is answered with `configure` once the manifest has loaded, and with `layout`
   as soon as the stage has been measured; the host sends `layout` again whenever the
   stage moves or resizes. Until the manifest has configured the board the host shows
   LOADING BOARD and Place bet is disabled. A manifest 404 or 409 is the error state with
   a retry that refetches it and remounts the frame; no bet is offered against a table
   the player cannot see. A second `ready` is a reloaded frame: the host settles
   everything outstanding and configures again. The host sends only a board the frame
   does not already have.
3. Place bet calls `POST /api/games/{slug}/rounds` with an `Idempotency-Key` and
   `params: { rows: 10, risk }`, served by `round.Handler.Play` through the engine
   registered for the slug, and a 404 is reported as the game not being available on
   this server. Component tests settle against the deterministic fixture in
   `src/mocks/plinko.ts`.
4. The first submitted bet synchronously locks Place bet and the risk menu, so rapid
   clicks cannot start a second round before React renders the disabled controls. The
   lock remains through the request and the ball's flight; Plinko permits one active
   ball per page session. A request error releases it without dropping a ball.
5. The settled result is sent as `drop`. When the frame reports `landed`, the host
   reveals the authoritative wallet returned with that round before unlocking, then
   refetches the wallet, rounds, and transactions. The same settlement runs eight
   seconds later if no landing arrives, so an animation can never hide a settled round;
   that refetch is what puts the round into the history under the board.
6. Every settled round names its `rtp_basis_points`. When it is not the manifest's, the
   host refetches the manifest and reconfigures the board with the new table once no
   ball is in flight; the ball that revealed the change still drops, since its `drop`
   carries its own multiplier and label. The board can therefore show a superseded
   option's table for at most one round after a switch.

Sound is remembered per browser under `game.sound`, and risk under `game.plinko.risk`.
A `game.plinko.rows` value left by an earlier version is ignored.

## Demo-only fixtures

The fixture engine, the fixture manifest (`plinkoManifest` in `src/mocks/plinko.ts`, the
supplied paytable labelled as the demo's 95% return), and the fixture Plinko catalogue
entry never reach a production bundle.

## Checks

`cd frontend && npm run typecheck && npm run lint && npm test && npm run build`. The
frame itself is exercised through the host tests and a headless Chromium run that drives
the bridge: a board configured and laid out, a drop that lands in the requested slot and
reports `landed`, and captures at phone and desktop sizes.
