# Plinko Tropical

The design of `/game/plinko-tropical`. It builds on the platform design in
`.claude/rules/frontend/system-design.md` and binds no other game. How the frame is built
and driven is in `docs/games/plinko-tropical-runtime.md`.

The page is assembled by `GameHost` and the bet panel in `GamePage.tsx`, configured by
Plinko Tropical's entry in `frontend/src/features/gameplay/registry.ts`.

## Page

A single centred column, 600px at most with 18px side padding, as tall as its content up
to the available height: the title row, the stage, and the bet panel. The stage keeps the
board's aspect (`stageAspect` 0.98) and shrinks so the play button is always visible
without scrolling; on a narrow screen it keeps a 12px `stageGutter` either side, so the
board nearly fills the width. The title row stands 30px (`titleOverlap`) over the stage's
empty top corners, either side of the chute. Round history follows below on the page
ground, 1120px at most.

On a short screen — a viewport under 900px tall where the game zone is at least 640px
wide — the column splits so the board keeps its size: the stage fills the available
height, up to its full 600px width, and a 340px side panel stands beside it with the title
row at the top (the actions on a second line) and the bet panel level with the foot of the
board. There the bet panel stacks balance, risk, stake, and play.

## Title row

A **title mark** (`system-design.md`, Games): `PLINKO` in Kaushan Script 400 at 34px (46
from 640, 40 in the side panel), white with a soft dark shadow, tilted 6° up to the right
over a teal (`#2fe0cf`) brush swash. Beneath it the subtitle `RISK · PLAY · WIN` arcs up
to the right in IBM Plex Mono 500 at 10px (11 from 640), `.3em` tracking, near-white with
a dark outline. The heading's accessible name is the game's full name, and the subtitle
is repeated for assistive technology. The mark keeps 14px of headroom above the logo for
its tilt (20 from 640, 18 in the side panel) and 12px to its left for the swash, so it
stays inside the title row. Beside it, on
`glass-float` at 38px: FAIR GAME (label and shield, icon only under 430px), sound, and
favourite; in the side panel they stand 14px further below the mark.

The mark is declared in `frontend/src/styles/games/plinko-tropical.css` and drawn by
`TropicalTitleMark.tsx`, which loads the face subset to the logo's letters.

## Bet panel

A `glass-panel` card with the deep panel shadow, 12px padding and 10px internals (10px and
8px under 640). There is no skin.

- **Balance row:** a 42px wallet tile (40px under 640, hidden under 380px), the `BALANCE`
  micro-label, and the balance in 18 · 500 `tnum` (16 under 640); the risk menu to its right.
- **Risk menu:** a 42px secondary glass control (40 under 640) reading `10 rows · Normal`,
  with a sliders icon from 430px; its menu lists the three risks with each one's payout
  range.
- **Stake and play:** the stepper (`field`, ± cells, stake in 18 · 500 `tnum`, 15 under
  640) and the play button share their row evenly, both 48px (40 under 640). The play
  label is `PLACE BET` with its ▶ triangle at every width. Space drops a ball unless focus
  is in a control or a dialog.

## Scene

A sunlit terrace fills the whole game area behind the column and belongs to this page
only: an infinity pool, a lounge under a thatched pergola with hanging lanterns, palms,
and a bay of limestone islands with moored boats, from a wide photo or a tall one,
whichever is nearer the zone's shape. A wooden signboard stands on the right of the photo
and is never cropped off. The top darkens a little under the title row and the foot under
the bet panel, and below the stage the scene fades into the page ground (`#04070d`) by the
frame's foot, so the round history beneath starts on the same black; where the stage
reaches the foot, as in the side panel layout, nothing fades.

In front of it stands a slate board: a matte dark face with a fine grain, lifted toward
the upper middle, shaped as a tall trapezoid from a narrow neck to upright walls around
the tray. Its rim, from the outside in, is a pale gold lip, a channel of brushed blue
steel set with warm bulbs, a thin gold bead, a dark groove, and a bronze ledge. A glass
chute lit blue down its middle stands on a U-shaped cradle in the neck, where a chrome ball
waits. Ten rows of mirror-chrome pegs, three to twelve a row, fall to eleven square tiles
of backlit acrylic that run wall to wall along the foot between dividers built like the
rim — blue steel inside a gold lip — on a dark glossy floor with a gold bead along its
front.

## Brand lines

`Good Games Brighter Days` stands in the left gutter high on the board in white Caveat
Brush, tilted like the title, with a short rule beneath, placed by `js/ui.js` below any
host control over that side and hidden when the gutter cannot hold it clear.
`SAME GAME BIGGER VIEWS` is painted down the signboard in the photo, a word a plank, in
cream brush lettering that follows each plank's tilt. They and the subtitle are brand art,
never extended into explanatory text.

## Typefaces

Inside the frame only: Inter 700 for the tile labels, Caveat Brush for the left brand line
and the signboard, beside the platform's IBM Plex Sans. Outside it, Kaushan Script for the
title mark alone.

## Palette and light

Declared once in `js/theme.js` and `css/tropical.css`, never copied from or into platform
tokens. Tile bands run pearl, blue, green, yellow, orange, red by distance from the centre;
each band paints its tile's face, inks its label (the figure with a smaller ×), tints its
edge, and spills a little light on the floor before it. The slate above the tiles stays
dark until a tile is landed in: the landing tile brightens, washes its colour up the slate
and over the floor, and gives a hair under the ball for about half a second. A falling
ball draws a light streak behind it, a warm white core in a soft aqua glow, stretching
with its speed, that takes on the landing tile's band only on the last hop and drains into
the tile after it. A struck peg glows warm and throws a few gold glints. The bulbs, the
chute, the lit tiles, and the streak are the only light bright enough to bloom. The
frame's result toast is green at or above 1× and grey below.

## Art

The catalogue tile and the lobby banner are captures of this frame, not illustrations
(`docs/games/plinko-tropical-runtime.md`, Art).
