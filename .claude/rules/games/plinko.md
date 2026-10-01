# Plinko

The design of `/game/plinko`. It builds on the platform design in
`.claude/rules/frontend/system-design.md` and binds no other game. How the frame is built
and driven is in `docs/games/plinko-runtime.md`.

The page is assembled by `GameHost` and the bet panel in `GamePage.tsx`, configured by
Plinko's entry in `frontend/src/features/gameplay/registry.ts`.

## Page

A single centred column, 600px at most with 18px side padding, as tall as its content up
to the available height: the title row, the stage, and the bet panel. The stage keeps the
board's aspect (`stageAspect` 10 / 11.2) and shrinks so the play button is always visible
without scrolling. Round history follows below on the page ground, 1120px at most.

On a short screen — a viewport under 900px tall where the game zone is at least 640px
wide — the column splits so the board keeps its size: the stage fills the available
height, up to its full 600px width, and a 340px side panel stands beside it with the title
row at the top (the actions on a second line) and the bet panel level with the foot of the
board. There the bet panel stacks balance, risk, stake, and play.

## Title row

The game title (28 · 700, `-.03em`, 24 under 640 and in the side panel) over the subtitle
`RISK · PLAY · WIN` in mono micro-label style. Beside them, on `glass-float` at 38px: FAIR
GAME (label and shield, icon only under 430px), sound, and favourite.

## Bet panel

A `glass-panel` card with the deep panel shadow, 12px padding and 10px internals (10px and
8px under 640).

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

The night-city backdrop fills the whole game area behind the column and belongs to the
Plinko page only. In front of it: ten rows of pegs on a bent acrylic pane over eleven
glowing cups.

## Brand lines

`GOOD PLAYERS BET BETTER` in the left gutter and `SAME GAME BIGGER VIEWS` in the right,
placed by `js/ui.js`, with a 44px `stageGutter` kept for them on narrow screens, and hidden
when a gutter cannot hold them clear of the glass and the host's controls. Where the tall
backdrop shows, `GOOD PLAYERS BET BETTER` is the line painted on its pillar, and the
frame's own left tagline is not drawn. They and the
subtitle are brand art, never extended into explanatory text.

## Typefaces

Inside the frame only: Inter 700 for the cup labels, IBM Plex Sans Condensed 500 for the
taglines, beside the platform's IBM Plex Sans.

## Palette and light

Declared once in `js/theme.js` and `css/plinko.css`, never copied from or into platform
tokens. Cup bands run silver, teal, purple, orange, red by distance from the centre; each
band shades its glass, inks its label, and spills its glow onto the wall, sheet, and tray.
The landing cup pulses for about half a second. The frame's result toast is green at or
above 1× and grey below.

## Art

The catalogue tile and the lobby banner are captures of this frame, not illustrations
(`docs/games/plinko-runtime.md`, Art).
