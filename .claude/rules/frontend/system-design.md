# Design system

The look and feel of the platform, v2. Tokens are defined once in
`frontend/src/styles/index.css` under `@theme`; nothing reintroduces a raw hex that a
token already names. Where this file and a reference mockup disagree, this file wins.

## Direction

Restrained, dense, product-like. The energy comes from content — game art, win amounts,
live chat — never from chrome. If a surface competes with a game tile for attention, it
is wrong. The lobby merchandises, the game page gets out of the way, the wallet is
visible in every header, and the admin console is the same tokens with the decoration
removed.

- **Artwork is the colour.** Chrome is a ladder of neutral greys plus one accent. Every
  other hue on screen comes from game art, the gold currency mark, and win amounts.
- **Wallet is ambient.** One balance renders in the header on every route, at every
  width, in tabular figures that never reflow. A player may hold a wallet per currency,
  but the header shows exactly one — the active wallet. Switching is a deliberate act on
  the wallet page, never a second figure in the chrome.
- **The host is agnostic.** Bet controls and side panels are slots the platform may fill,
  or leave empty when the game supplies its own.
- **Mobile is the source layout.** Each screen is authored at 390px and expanded. Desktop
  adds columns; it never adds features. Every page works down to 720px without a
  horizontal scrollbar, and the touch shell keeps its 44px targets.

## Hard rules

1. **No gradients** on backgrounds, buttons, text, or badges. Flat fills only. The single
   exception is the bottom scrim on a game tile, the `tile-scrim` utility.
2. **No borders as dividers.** Regions are separated by background step
   (`base` → `panel` → `surface-1` → `surface-2` → `surface-3`), never by a 1px line.
   There are no `line` tokens.
3. **No glows, coloured shadows, or `box-shadow` for depth.** Elevation is background
   lightness only. Floating panels sit one step lighter than what they cover; modals add
   the `base` scrim.
4. **No decorative texture** — no stripe overlays, radial blooms, noise, glass, or blur.
5. **One accent.** Green `accent` fills primary actions; `accent-ink` is the same accent as
   text, link, or live dot. Gold is reserved for the currency mark and win amounts.
   Status tints (`success`, `warning`, `danger`) exist only for state a person must act
   on — pending, rejected, credit — and never as decoration.
6. Keep chrome visually quiet, but preserve a visible scrollbar when content can overflow
   and dragging is not obvious or accessible. Hide a track only on deliberate touch-first
   carousels that remain keyboard-scrollable and expose another overflow cue.
7. **Two typefaces, no display font.** IBM Plex Sans for everything; IBM Plex Mono for
   numbers, timestamps, and uppercase micro-labels only.
8. **Max weight 600.** No 700 anywhere.
9. **Nothing fully round** except avatars and status dots.

## Surfaces and ink

| Token | Value | Use |
| --- | --- | --- |
| `base` | `#0b0f14` | The page ground and the modal scrim (`base/70`) |
| `panel` | `#11161d` | Persistent chrome — top bar, sidebar, bottom nav, chat rail |
| `surface-1` | `#151b23` | Cards, list rows, table rows |
| `surface-2` | `#1b232c` | Card hover; popovers and menus; raised objects inside a card |
| `surface-3` | `#252c36` | Media placeholders, active chips, avatars |
| `banner` | `#16202a` | The lobby banner panel |
| `wash` | `rgb(255 255 255 / .06)` | Hover wash on chrome, active nav row |
| `inset` | `rgb(255 255 255 / .045)` | Inset fields and quiet buttons at rest |
| `ink` | `#f2f6fb` | Headings and strong values |
| `ink-soft` | `#e6ebf2` | Body and UI text — the `body` default |
| `ink-mute` | `#8a99ad` | Secondary text. **The floor: nothing renders dimmer.** |

`ink-mute` is the only muted ink. Anything that used to be fainter renders as `ink-mute`
or does not render.

## Accent and status

| Token | Value | Use |
| --- | --- | --- |
| `accent` | `#2fa96c` | Primary button fill |
| `accent-hi` | `#37bd79` | Primary button hover |
| `accent-ink` | `#3ec07d` | Accent as text, link, or live dot |
| `on-accent` | `#07160e` | Ink on an accent fill |
| `gold` / `on-gold` | `#caa04a` / `#17120a` | The ₱ disc beside a balance or a win |
| `win` | `#e8c883` | Win amounts in the big-wins strip |
| `success` | `#3ec07d` | Credit figures, approved, active |
| `warning` | `#f5b23b` | Pending, in review — the one status hue v2 did not name |
| `danger` | `#e05a5a` | Rejected, suspended, destructive, the alert dot |

Status colours never fill behind body text. A badge is a 12% tint carrying full-strength
ink, with no border.

## Typography

IBM Plex Sans for everything read; IBM Plex Mono for every number that can change —
balances, bets, IDs, timestamps, RTP values — so digits never jump width. Money always
renders with tabular figures (`tnum`). Numerals are Mono 500.

| Role | Size · weight | Notes |
| --- | --- | --- |
| banner headline | 28 · 600 (22 under 760) | `1.1`, `-.02em`, `ink`, `text-balance` |
| page title | 20 · 600 | `-.01em`, `ink` — the one size the v2 source did not specify |
| section / panel heading | 14 · 600 | `-.01em`, `ink-soft` |
| body | 13.5 · 400 | `1.5`, `ink-mute` for copy, `ink-soft` for UI text, `text-pretty` |
| UI label / button | 12.5–13.5 · 500–600 | |
| card title | 12 · 500 | |
| studio / meta | 11 · 400 | `ink-mute` |
| micro-label (`label-mono`) | Mono 10 · 500 | `.12em`, uppercase |

## Spacing

Gaps: 1–2px within a nav list · 6–8px within a control cluster · 10px grid gutters ·
12px section internals · 20px between sections. Main padding 14px, content max-width
1320px. Card padding 12–16px.

## Radius and elevation

`chip 8` (chips, buttons) · `input 9` (controls, inset fields) · `tile 10` (tiles, rows) ·
`card 12` (cards, panels, modals). Avatars and status dots are the only full circles.

There are no shadow tokens. Depth is the surface ladder: a card is `surface-1` on
`base`; a menu is `surface-2`; a modal is `surface-1` over the `base/70` scrim.

## Controls

Heights on the desktop shell (1024px and up): 26 segmented · 32 icon button and chip ·
34 input, balance chip, Deposit · 36 nav row · 38 banner CTA. Below 1024px every tap
target is 44px; the in-game play action is 52px everywhere.

Variants: primary (accent fill), secondary (`inset` fill, `wash` on hover), ghost,
destructive (`danger` tint), play (primary at 52px, `tile` radius). Hover is a background
swap; there is no pressed state and no transform.

## Shell

- Top bar 56px on `panel`: menu glyph (asymmetric 4-bar in an `inset` container) ·
  `HeziBet` wordmark, no mark · balance chip (₱ disc on `gold`, mono figure, chevron;
  links to the wallet) **visually separate from** the green Deposit button · chat toggle ·
  bell with a `danger` dot · avatar → surname → chevron.
- Left rail on `panel`: 192px expanded / 56px collapsed. Search above; Home, Games,
  Wallet, History; the category browse group; Support and Language pinned to the
  bottom. No separators, no badges, no counts. Active row is `wash` + `ink-soft`.
- Chat rail on the right, 272px on `panel`, closable, with a toggle in the top bar.
- Below the rail breakpoint the rail becomes a drawer and a bottom nav on `panel`.

## Game tile

`3 / 4` portrait, `tile` radius, `surface-3` placeholder with a centred uppercase mono
caption until real art lands. The name sits inside the tile over the `tile-scrim`; the
studio sits beneath in `ink-mute` at 11px. The grid is
`repeat(auto-fill, minmax(126px, 1fr))` at a 10px gutter, 116px under 560px. Hover
reveals a Play chip by a 120ms opacity fade — no scale.

## Placeholders

Real art is not in yet. Every image slot is a flat `surface-3` block with a centred
uppercase mono caption (`game art`, `banner artwork`). Keep the slot and the aspect
ratio; swap the fill when assets land. Never a gradient, an SVG illustration, or an
emoji.

## Lobby composition (top to bottom)

1. Banner on `banner` — text left, artwork slot right (`1.2fr / .8fr`), one column under
   760px
2. Big wins — horizontal snap row of 172px rows: avatar slot · username · ₱ disc · amount
3. Category tabs — quiet chips, active = `surface-3`; `See all` pushed right
4. Game grid
5. Promotions — rows of 56px art slot + kicker / title / sub; 3 up / 2 up / 1 up
6. Game grid (second set)

A section with nothing to show does not render.

## Money and status

Money is minor units plus an ISO currency code, formatted at the render boundary only.
Currencies never mix in one figure; nothing converts and no total sums across them. A
currency symbol is always present where more than one is possible.

Sign, colour, and a leading icon are redundant with each other, so direction survives
colour-blindness. A credit reads `+₱1,200.00` in `success`; a debit reads `−₱100.00` in
`ink-soft`. Big wins on the lobby read in `win` beside a gold ₱ disc.

Badges: active and approved in `success`, pending in `warning`, rejected in `danger`,
everything else in `ink-mute` on `wash`.

## Icons

A single outline set — 1.5px stroke, 24px grid, rounded caps. Lucide is the library; the
only custom glyph is the top bar menu. Icons are always paired with a label in
navigation; icon-only is permitted for header utilities at 44px targets on touch.

## Motion

Hover states only: a background swap, or a 120ms opacity fade for the tile Play overlay.
No transforms, no scale-on-hover, no entrance animation, no loops — a loading skeleton
is a static block. `prefers-reduced-motion` is honoured.

## Breakpoints

The shell measures its content frame with container queries, not the viewport; fixed
overlays (bottom nav, drawer) use the matching viewport breakpoints.

| Width | Shell |
| --- | --- |
| < 720 | Chat rail hidden and its toggle with it |
| < 760 | Rail hidden; drawer and bottom nav instead |
| 760–899 | Rail collapsed to icons unless the menu button expands it |
| ≥ 900 | Rail expanded unless collapsed |
| ≥ 1024 | Desktop control heights |
| ≥ 1440 | Game page opens its third zone |

Nothing ever emits a horizontal page scrollbar.

## Retired in v2 and why

- **Gradients** (game art, banner fades) — chrome must not compete with art; flat
  placeholders until real assets land.
- **`shadow-e1` / `shadow-e2` / `shadow-glow`** — elevation is background lightness.
- **`line`, `line-strong`, `line-hover`** — dividers were the main source of visual
  noise; every region is now a background step.
- **Sora / `font-display` and weight 700** — one text face, max 600, reads calmer at
  density.
- **`ink-faint` (`#6b7a93`) and `highlight` (`#ff4e7a`)** — the grey failed contrast; the
  pink was a second accent.
- **`accent-press`** — hover is the only interactive state.
- **`radius-sheet` (20px)** and full-pill controls — nothing is rounder than 12px except
  an avatar or a dot.
- **Pulsing skeletons, scale-on-hover, the header blur** — no loops, no transforms, no
  glass.
