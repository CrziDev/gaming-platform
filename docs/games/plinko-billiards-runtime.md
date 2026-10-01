# Plinko Billiards runtime

Plinko Billiards is a second catalogue title on the Plinko engine. It has its own game
row, return, rounds, history, favourites, and art, and it settles every round through
`backend/internal/engine/plinko` exactly as Plinko does. Only the frame and the skin over
the host's controls differ. The engine, the RTP model, the bridge protocol, the host, and
the round lifecycle are in `plinko-runtime.md` and `plinko-rtp.md`, and they apply here
unchanged.

## Wiring

| Place | What it holds for this title |
| --- | --- |
| `backend/internal/app/app.go` | `plinko-billiards` in `round.Engines`, mapped to `plinko.New()` |
| `backend/cmd/seed/catalogue.go` | The catalogue row, integrated at 95% when absent |
| `frontend/vite.config.ts` | The frame served at `/games/plinko-billiards/` |
| `frontend/src/features/gameplay/registry.ts` | Its module: the Plinko board, risk menu, and stage, with its own frame URL and `skin: true` |
| `frontend/src/styles/games/plinko-billiards.css` | The skin: `GameHost` marks the zone `data-game-skin="plinko-billiards"`, and the rules restyle only the `data-part` controls inside it |
| `frontend/src/assets/games/plinko-billiards.jpg`, `frontend/src/assets/banners/plinko-billiards.jpg` | Tile and banner, captured from the frame the way Plinko's are |

`make bootstrap` inserts the row in every environment where it is absent and leaves an
existing row's operator changes in place; an operator switches its return with
`PUT /api/admin/games/{id}/rtp`. Settled rounds record the same
`engine_reference` (`plinko/9500` and so on) as Plinko's, because the same rules decided
them; `game_id` says which title was played.

## Frame — `games/plinko-billiards/web/`

A three.js billiard table: the green cloth leans back over an upright mahogany apron,
the ten peg rows are a rack of numbered pool balls, and the cue ball waits on the head
spot, rolls through the rack, and sinks into one of eleven leather pockets along the foot
cushion. Each pocket's payout is an enamelled plate in a brass bezel on the apron. The
hall behind it is drawn in the scene, with no photograph: panelled walls under a warm
lamp cone.

| File | Role |
| --- | --- |
| `index.html` | The full-viewport `#scene`, the two taglines, the toast layer; an import map points `three` and `three/addons/` at `js/vendor/` |
| `css/billiards.css` | The frame's ground, taglines, and result toast in the hall's warm tones |
| `js/main.js`, `js/bridge.js`, `js/state.js`, `js/ui.js` | The same boot, protocol-3 bridge, state, and tagline and toast placement as Plinko's frame, and the same `ready` with `game: 'plinko'`, the engine's protocol |
| `js/theme.js` | The pocket bands (ivory, blue, purple, orange, red by distance from the centre) and the pool-ball colours |
| `js/board.js` | Renderer, hall lighting, bloom, camera framing inside the stage rect, the drop, the render-on-demand loop, and the click and thud tones |
| `js/board/geometry.js` | Every dimension of the table, the rack, the pockets, and the apron |
| `js/board/kit.js` | Canvas textures (cloth, mahogany, leather, pool balls, cue ball, chalk dust), glow sprites, contact shadows |
| `js/board/background.js` | The hall shader |
| `js/board/table.js`, `pockets.js`, `rack.js` | Cloth, cushions, rails, sights, and apron; pockets and their plates; the rack and the cue ball |
| `js/board/flight.js` | The drop path to a given slot, the ball's position along it, and `pathAt`, its position at any time since the drop |
| `js/board/trail.js` | The marks the cue ball leaves, sampled backwards along the flight path: the ivory smear, the nap track, and the chalk puffed off each strike |
| `js/vendor/` | three.js 0.169.0 and the bloom pass's addons with their MIT licence, vendored beside this game as `packages.md` requires |

The frame never decides an outcome. As in Plinko, a `drop` names the settled slot, the
path turns right exactly `slot` times in shuffled order, a struck ball gives a little
and glows, and the landing pocket's ring, lining, and plate pulse for about half a
second before `landed` is posted. Behind the rolling ball an ivory smear blurs over its
last 100 ms and takes on the landing pocket's band only on the roll in; a brushed track
in the nap, lighter down the middle with a darker line each side, fades in place over
about 900 ms and breaks where the ball hops; and each strike puffs blue chalk that
spreads, lifts, and thins out. None of it is light, so none of it blooms, and none of it
is drawn under reduced motion.

## Checks

The host is Plinko's, so its tests cover this title. The skin was measured against Plinko
in a browser at 390, 1366, and 1440px: every control's box is identical, and at 360px
only the balance plate stretches to its row's height where the wallet tile is hidden.
`registry.test.ts` pins the second module to its own frame on the shared board.
`TestPlinkoVariantsShareTheEngineButKeepTheirOwnRoundsAndReturn` plays a round on this
slug through the real route table and checks that its return, manifest, and rounds stay
separate from Plinko's. The frame is driven headless through the bridge: a board
configured and laid out, and a drop that lands in the requested slot and reports
`landed`.