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
   `POST /api/games/{slug}/rounds` with an `Idempotency-Key`, and a 404 is reported as
   the game not being available yet.
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
