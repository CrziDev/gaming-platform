# Plinko Billiards

The design of `/game/plinko-billiards`. It builds on the platform design in
`.claude/rules/frontend/system-design.md` and binds no other game. How the frame is built
and driven is in `docs/games/plinko-billiards-runtime.md`.

The page is assembled by `GameHost` and the bet panel in `GamePage.tsx`, configured by
Plinko Billiards' entry in `frontend/src/features/gameplay/registry.ts`.

## Page

A single centred column, 600px at most with 18px side padding, as tall as its content up
to the available height: the title row, the stage, and the bet panel. The stage keeps the
table's aspect (`stageAspect` 10 / 11.2) and shrinks so the play button is always visible
without scrolling. Round history follows below on the page ground, 1120px at most.

On a short screen — a viewport under 900px tall where the game zone is at least 640px
wide — the column splits so the table keeps its size: the stage fills the available
height, up to its full 600px width, and a 340px side panel stands beside it with the title
row at the top (the actions on a second line) and the bet panel level with the foot of the
table. There the bet panel stacks balance, risk, stake, and play.

## Title row

The game title (28 · 700, `-.03em`, 24 under 640 and in the side panel) over the subtitle
`RISK · PLAY · WIN` in mono micro-label style. Beside them, on `glass-float` at 38px: FAIR
GAME (label and shield, icon only under 430px), sound, and favourite.

## Bet panel

A card with the deep panel shadow, 12px padding and 10px internals (10px and 8px under
640), dressed by the skin below.

- **Balance row:** a 42px wallet tile (40px under 640, hidden under 380px), the `BALANCE`
  micro-label, and the balance in 18 · 500 `tnum` (16 under 640); the risk menu to its right.
- **Risk menu:** a 42px secondary glass control (40 under 640) reading `10 rows · Normal`,
  with a sliders icon from 430px; its menu lists the three risks with each one's payout
  range.
- **Stake and play:** the stepper (`field`, ± cells, stake in 18 · 500 `tnum`, 15 under
  640) and the play button share their row evenly, both 48px (40 under 640). The play
  label is `PLACE BET` with its ▶ triangle at every width. Space drops a ball unless focus
  is in a control or a dialog.

## Skin

Declared in `frontend/src/styles/games/plinko-billiards.css` under the platform's skin rule
(`system-design.md`, Games), so the controls over the table wear its materials:

- **Bet panel:** a 7px mahogany rail with brass rivets at its corners and pearl sights on
  its long sides, around a felt bed. The rail sits inside the panel's own padding, so
  every control keeps its place.
- **Balance:** a brushed brass plate with the wallet tile sunk into its left end, the
  label and figure in dark brass ink.
- **Risk control:** an ivory chip with dark ink; its menu is dark leather with a brass
  edge and stitched inner line, and the chosen risk sits on a green felt tint.
- **Stepper:** a felt well; each step is a cue ball sunk in its cell, and the stake reads
  in ivory between brass rules.
- **Title-row buttons:** leather with a brass edge; a favourite stays in `accent-ink`.

The play button, focus ring, type, money figures, dialogs, and round history stay the
platform's.

## Scene

A pool hall fills the whole game area behind the column and belongs to this page only:
dark panelled mahogany walls with a chair rail, wainscot, and baseboard over a dark plank
floor, under a row of warm hanging lamps, the brightest over the table. The hall keeps
its scale beside the table, so a wider screen shows more of it. In front of it a billiard
table leans back over an upright mahogany apron: green cloth, cushions, varnished rails
with pearl sights, a rack of numbered pool balls in ten rows, the cue ball on the head
spot, and eleven leather pockets with brass lips along the foot cushion. Each pocket's
payout is an enamelled plate in a brass bezel on the apron.

Below the stage the scene fades into the page ground (`#04070d`) by the frame's foot, so
the round history beneath starts on the same black; where the stage reaches the foot, as
in the side panel layout, nothing fades.

## Brand lines

`GOOD PLAYERS BET BETTER` in the left gutter and `SAME GAME BIGGER VIEWS` in the right,
placed by `js/ui.js`, with a 44px `stageGutter` kept for them on narrow screens, and hidden
when a gutter cannot hold them clear of the table and the host's controls. They and the
subtitle are brand art, never extended into explanatory text.

## Typefaces

Inside the frame only: Inter 700 for the plate labels and ball numbers, IBM Plex Sans
Condensed 500 for the taglines, beside the platform's IBM Plex Sans.

## Palette and light

Declared once in `js/theme.js` and `css/billiards.css`, never copied from or into
platform tokens. Pocket bands run ivory, blue, purple, orange, red by distance from the
centre; each band enamels its plate, inks its label, and lights a ring on the cloth
around its pocket. The balls wear the standard solids and stripes. The landing pocket's
ring, lining, and plate pulse for about half a second, and a struck ball gives a little
and glows. The rolling cue ball leaves no light: a faint ivory smear blurs behind it,
taking on the landing pocket's band only on the last roll in; it brushes a soft track in
the nap that fades where it lies over about a second and breaks where the ball hops; and
each strike knocks off a small puff of blue cue chalk. The frame's result toast is green
at or above 1× and grey below.

## Art

The catalogue tile and the lobby banner are captures of this frame, not illustrations
(`docs/games/plinko-runtime.md`, Art).
