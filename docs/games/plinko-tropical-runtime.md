# Plinko Tropical runtime

Plinko Tropical is a third catalogue title on the Plinko engine. It has its own game row,
return, rounds, history, favourites, and art, and it settles every round through
`backend/internal/engine/plinko` exactly as Plinko does. Only the frame, its stage, and the
title mark over the host's title row differ. The engine, the RTP model, the bridge
protocol, the host, and the round lifecycle are in `plinko-runtime.md` and
`plinko-rtp.md`, and they apply here unchanged.

## Wiring

| Place | What it holds for this title |
| --- | --- |
| `backend/internal/app/app.go` | `plinko-tropical` in `round.Engines`, mapped to `plinko.New()` |
| `backend/cmd/seed/catalogue.go` | The catalogue row, integrated at 95% when absent |
| `frontend/vite.config.ts` | The frame served at `/games/plinko-tropical/` |
| `frontend/src/features/gameplay/registry.ts` | Its module: the Plinko board and risk menu, its own frame URL, `stageAspect` 0.98, `titleOverlap` 30, and `TitleMark` |
| `frontend/src/features/gameplay/TropicalTitleMark.tsx` | The title mark: the heading named in full, the logo lettering and swash, and the arched subtitle |
| `frontend/src/styles/games/plinko-tropical.css` | The mark's styles, scoped to `[data-title-mark='plinko-tropical']`, and its Kaushan Script face, subset to the letters of `PLINKO` and fetched only when the mark draws them |
| `frontend/src/assets/fonts/kaushan-script-plinko.woff2` | That subset, under 3 KB, beside its OFL licence |
| `frontend/src/assets/games/plinko-tropical.jpg`, `frontend/src/assets/banners/plinko-tropical.jpg`, `frontend/src/assets/banners/phone/plinko-tropical.jpg` | Tile, banner, and phone banner |

`GameHost` takes the two page-level options every title may set: `titleOverlap`, the
pixels the stage tucks under the title row (0 for the other titles, which keep their 6px
gap), and `titleMark`, which replaces the platform's heading and subtitle. The side
layout ignores the overlap.

`make bootstrap` inserts the row in every environment where it is absent and leaves an
existing row's operator changes in place; an operator switches its return with
`PUT /api/admin/games/{id}/rtp`. Settled rounds record the same `engine_reference`
(`plinko/9500` and so on) as Plinko's, because the same rules decided them; `game_id`
says which title was played.

## Frame — `games/plinko-tropical/web/`

A three.js slate board on a sunlit terrace. A drop leaves the chrome ball waiting in the
neck's cradle under a lit glass chute, bounces it through ten rows of mirror pegs, and
drops it out of sight behind one of eleven backlit acrylic tiles along the foot. The
terrace is a photograph drawn in the scene behind the board.

| File | Role |
| --- | --- |
| `index.html` | The full-viewport `#scene`, the left brand line, the big-win burst canvas, the toast layer; an import map points `three` and `three/addons/` at `js/vendor/` |
| `css/tropical.css` | The frame's font faces, ground, the brand line (21px, 28 from 640), the result toast, and the big-win multiplier |
| `js/main.js`, `js/bridge.js`, `js/state.js` | The same boot, protocol-3 bridge, and state as Plinko's frame, and the same `ready` with `game: 'plinko'`, the engine's protocol; boot waits up to 2.5 s for Inter, IBM Plex Sans, and Caveat Brush |
| `js/celebration.js` | Plinko's win tiers and shake, with a burst of confetti in the tile bands' colours and the rim's gold |
| `js/music.js` | Plinko's music player, playing this frame's own track |
| `js/ui.js` | The left brand line's placement: high on the board, below any host control over that side, a short reach from the board or control beside it and never nearer the frame's edge than 40px, centred in the gutter otherwise, and hidden when the gutter cannot hold it clear; the scene's fade into the page ground below the stage rect; the result toast; a big win's multiplier and label centred on the stage; and `formatMultiplier` |
| `js/theme.js` | The tile bands (pearl, blue, green, yellow, orange, red by distance from the centre), the slate and rim colours, the chute's blue, the streak and glint colours, and the confetti colours |
| `js/board.js` | Renderer, its pixel budget (full device density up to 3x and 4.5 million device pixels), bloom, camera framing inside the stage rect, tile labels, the drop, the landing pulse and a winning tile's second flash, the big-win shake, the render-on-demand loop, and the peg and landing tones |
| `js/board/geometry.js` | Every dimension of the slate, rim, cradle, chute, pegs, and tray, and the outline every rim layer is offset from |
| `js/board/kit.js` | Canvas textures, glow sprites, and highlight lines |
| `js/board/studios.js` | The three environment maps — daylight for the steel and the face, a warm cabana for the gold, a crisp studio of its own for the mirror pegs and ball — and the daylight on the board |
| `js/board/background.js` | The terrace shader, the choice between the wide and tall photos, and the brand line painted onto each photo's signboard |
| `js/board/slate.js` | The face, the rim and its bulbs, the chute, the pegs, and the waiting ball |
| `js/board/tiles.js` | The tray: recess, dividers, floor, the tiles and their painted faces |
| `js/board/flight.js` | The drop path to a given slot, the ball's position along it, and `pathAt`, its position at any time since the drop |
| `js/board/trail.js` | The ball's light streak, sampled backwards along the flight path, the halo that rides on the ball, and the glints a struck peg throws |
| `audio/` | `viajes.mp3`, about 1.8 MB: tubebackr's "Viajes" from Free To Use Music, 4 minutes 13 to its closing silence; `SOURCES.txt` names the recording, its credit, and the cut |
| `img/terrace.jpg` | The 1916×821 wide backdrop |
| `img/terrace-portrait.jpg` | The 941×1672 tall backdrop of the same terrace |
| `js/vendor/` | three.js 0.169.0 and the bloom pass's addons with their MIT licence, vendored beside this game as `packages.md` requires |
| `fonts/` | IBM Plex Sans (one variable file for every weight, with its Latin Extended file for the ₱ in the toast), Inter 700, and Caveat Brush, Google Fonts' Latin subsets with their OFL licences; `index.html` preloads the three the boot waits for |

The frame never decides an outcome. As in Plinko, a `drop` names the settled slot and the
path turns right exactly `slot` times in shuffled order: a fall from the cradle onto the
top peg, a bounce per row, a last hop off the bottom row, and a drop behind the tile that
keeps its sideways speed so a ball bound for an outer tile is over it before it passes the
divider tops. The landing tile pulses for about half a second before `landed` is posted.
Under reduced motion the tile lights at once and `landed` is posted without the flight. A
`drop` before the board is configured is reported landed at once.

A landing that pays 5× or more is a big win: confetti in the tiles' colours bursts out of
the tile, the multiplier stands across the middle of the stage over the host's result
label in place of the toast, and the board shakes a few pixels for 350 ms by shifting its
view offset, so the backdrop stays still. A landing from 2.5× up flashes its tile twice.
The tiers are read from the settled `multiplier_hundredths`, and `js/celebration.js`
holds them. Under reduced motion a big win shows only the multiplier and label, without
the burst, the shake, or the flash.

### Backdrop

The tall photo shows below the geometric mean of the two aspects (about 1.15), the wide one
above it. The photo covers the zone 3% beyond cover, centred unless that would crop the
signboard, whose right edge stays on screen; vertically each photo's anchor height sits on
the board's band as far as cover allows. Each photo's signboard is lettered on a canvas
when it loads, `SAME GAME BIGGER VIEWS` a word a plank in Caveat Brush at one size, the
largest that fits every plank, following each plank's tilt; on the tall photo the lettering
sits on the planks' right ends, the part a phone's board leaves in view. The photo is
blurred over a disc of twelve samples with a radius of 0.3% of the frame's height, enough
to soften it behind the ball while the signboard still reads. The top darkens 30% under
the title row and the foot 25% under the bet panel, with a slight saturation lift.
Mipmaps keep desktop downscaling clean.

### Art

The lobby banner (`frontend/src/assets/banners/plinko-tropical.jpg`, 2640×472) is a capture
of the game page itself, as Plinko's is: signed in, the side layout with the stage pinned
to 440px, and the column pushed right with 230px to spare, so the lobby's 640px crop shows
the board alone; the bet panel then stands over the left of the signboard, as it does on a
laptop. The zone is captured 472px tall. The phone banner
(`frontend/src/assets/banners/phone/plinko-tropical.jpg`, 1540×472) is a frame capture with
the brand line hidden: a 2640×472 frame with a 350px-wide board at x 1850, y 54, cropped
to x 700–2240, so the board stands at the phone panel's right edge clear of the signboard.
The catalogue tile (`frontend/src/assets/games/plinko-tropical.jpg`, 720×960) is a capture
of a 720×960 frame alone with the brand line hidden and the board's stage at x 0, y 96,
720 wide and 720 / 0.98 tall.

## Checks

The host is Plinko's, so its tests cover this title. `registry.test.ts` pins the module to
its own frame, stage, and title mark on the shared board; `GameHost.test.tsx` covers the
title mark replacing the platform's heading and the overlap; `TropicalTitleMark.test.tsx`
covers the heading's full name and the arched subtitle.
`TestPlinkoVariantsShareTheEngineButKeepTheirOwnRoundsAndReturn` plays a round on this slug
at its own return through the real route table and checks that its return, manifest, and
rounds stay separate. The frame was driven headless through the bridge — configured, laid
out, and dropped into slots 0, 3, 5, and 10, each reporting `landed` for that slot — and the
page was played against the test database at 360, 390, 1366, and 1920px. The stage, title
row, and bet panel keep the mockup's sizes and spacing; the whole column sits 12px lower
than in the mockup because the mark keeps headroom for its tilt, and every part of the
mark measures inside the title row.
