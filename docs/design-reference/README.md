# Design reference pages

Two self-contained HTML files that render real screens with fixed data. Open either one
in a browser — no build, no API, no database, no session.

| File | Screen |
| --- | --- |
| `lobby.html` | `/` — `AppShell` wrapping `LobbyPage` |
| `plinko.html` | `/game/plinko` — `AppShell` wrapping `GamePage` with the Plinko module |

They are reference material for design work and nothing imports them. They are not built,
not tested, and not served.

## How they stay honest

Each file loads the Tailwind browser build and carries the `@theme` block and the
`@utility` rules copied from `frontend/src/styles/index.css`. Every element then uses
**the class strings its component uses, verbatim**, and an HTML comment names the
component each block came from. A class string that differs from its component is a bug
in the reference file, not a variation.

The data is the existing fixtures, so these pages agree with what the running app shows
against them:

- Games and categories — `frontend/src/mocks/games.ts`. `slots` and `live` are
  `available: false`, so the category tabs are All games / Originals / Crash.
- Chat — `frontend/src/mocks/chat.ts`, 223 online and the same eight messages.
- Announcements — `frontend/src/mocks/announcements.ts`.
- Wallet — PHP `1248000` minor, formatted by the rules in `frontend/src/lib/money.ts`.
- Plinko — stake at the game's `min_wager_minor` (`₱1.00`), and the 8-row normal board
  from `frontend/src/features/gameplay/multipliers.ts`.

Both pages render signed in, with the rail collapsed and the chat rail open — the shell's
default state.

## Where they are deliberately not the app

- **The Plinko board is a still.** The real board is a Matter.js canvas inside an iframe
  that recomputes its peg spacing from the frame's own size. Here it is inline SVG drawn
  from `games/plinko/art`, so the peg spread is illustrative rather than a pixel match.
  The colours, the bucket bands and the multiplier labels are real.
- **`plinko.html` holds two trees.** On a phone the real `GamePage` drops the header,
  rail, chat rail and bottom nav because `AppShell` matches a media query in JavaScript.
  The reference marks up both layouts and gates them with the `rail:` variant instead.
  The bottom nav is absent because it never renders on this route at either width.
- **`plinko.html` ends with a phone preview**, so both views read at once on a desktop.
  It is a 390 × 844 iframe of `plinko.html` itself, which gives the phone layout a real
  viewport — its media queries, `100dvh` and the fixed bet bar all resolve against the
  frame rather than the window, and there is no second copy of the markup to keep in
  step. The preview is not part of the page; it disappears below 760px, where the phone
  layout is simply what the file renders.
- **Icons are inlined Lucide paths**, not `lucide-react`, so a Lucide release could drift
  a glyph. Sizes and stroke widths are the ones each component passes.
- **Nothing is interactive.** Menus, dialogs, the drawer and the search results panel are
  not in the markup; hover and focus styling still works because it is pure CSS.
- **There is one script, in `plinko.html`**, and it only hands the phone preview its
  `src`, and only when the file is the top-level page. Hiding the frame with CSS is not
  enough — a `display: none` iframe still fetches, so an embedded copy would load a
  third. With scripting off, everything renders except that preview.
- The banner and Plinko artwork are inlined from `games/plinko/art/*.svg` rather than the
  `frontend/src/assets` PNGs, so a file can be moved without breaking.

## Checking them

Resize from about 1440px down to 360px. The shell should step exactly as
`.claude/rules/frontend/system-design.md` describes: the chat rail goes under 720px, the
rail gives way to the bottom nav under 760px, the rail expands at 900px, desktop control
heights arrive at 1024px, and `plinko.html` sheds its whole shell under 760px. No width
should produce a horizontal page scrollbar.

The pages need a network connection for the Tailwind CDN and the Google Fonts link.
