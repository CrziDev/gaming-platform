# Design reference pages

Self-contained HTML files that show real screens with fixed data. Open one in a browser —
no build, no API, no database, no session.

| File | Screen |
| --- | --- |
| `plinko-v24.html` | The v24 Plinko design: the source of the v3 design system and of `/game/plinko` |
| `lobby.html` | `/` — `AppShell` wrapping `LobbyPage`, in the v2 tokens that preceded v3 |

They are reference material for design work and nothing imports them. They are not built,
not tested, and not served.

## `plinko-v24.html`

The owner's v24 mockup, kept as delivered. It renders the glass board in three.js over the
city backdrop, the v24 top bar, the title row, and the bet panel; its balance and bets are
local to the page. `.claude/rules/frontend/system-design.md` is the design system drawn
from it, and where the two disagree that file wins. What the platform changed on the way
in is recorded in `docs/games/plinko-runtime.md`: the backdrop is zoomed out so it stays
sharp on phones, the cups carry the server's multipliers, the ball lands where the server
settled, and the controls are the platform's own.

It needs a network connection for three.js from jsDelivr and the Google Fonts link.

## `lobby.html`

The lobby as it stood before v3. Each element uses the class strings its component used
then, verbatim, with the `@theme` block and `@utility` rules copied from that version of
`frontend/src/styles/index.css`. It is kept for the lobby's composition, not its surfaces;
the running lobby now renders in the v3 tokens.

It needs a network connection for the Tailwind CDN and the Google Fonts link.
