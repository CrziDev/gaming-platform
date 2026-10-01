# Design system

The look and feel of the platform, v3. Tokens are defined once in
`frontend/src/styles/index.css` under `@theme`, with the surface recipes as utilities
beside them; nothing reintroduces a raw value that a token or utility already names.

This file is the platform-wide design: the tokens, surfaces, primitives, shell, lobby, and
account and admin screens every game sits among. It describes no game. Each integrated
game's page is designed in its own file under `.claude/rules/games/` (see Games below).

## Direction

Cool navy glass over a near-black ground, one saturated green, and game art that glows. The
energy comes from content — the game scene, game art, win amounts, live chat — and from
the one primary action on a screen. Everything else is quiet glass that lets the content
through.

- **Glass is the surface language.** Chrome, panels, menus, and dialogs are translucent
  navy glass with a backdrop blur, a cool hairline, a top-lit rim, and a 1px inset top
  highlight. The blue lives in the glass; the ground stays near-black.
- **One call to action glows.** The primary or play action is the only filled, gradient,
  glowing control in a region. Everything else is a glass or ghost control.
- **Wallet is ambient.** One balance renders in the top bar on every route, at every
  width, in tabular figures that never reflow. A player may hold a wallet per currency,
  but the top bar shows exactly one — the active wallet. Switching is a deliberate act on
  the wallet page, never a second figure in the chrome.
- **Every game is designed on its own.** A game's page — its layout, controls, and scene —
  is defined by that game's file, built from these tokens and primitives and, where it
  declares one, its skin. Nothing about one game's page is a rule for another.
- **Mobile is the source layout.** Each screen is authored at 390px and expanded. Desktop
  adds room; it never adds features. Every page works down to 360px without a horizontal
  scrollbar, and the touch shell keeps its 44px hit areas.

## Hard rules

1. **Gradients only where named.** The primary and play fill (`cta-gradient`), the two
   scrims that fade artwork into chrome (`tile-scrim`, `banner-scrim`), and the two light
   edges: `chrome-edge` under the top bar and `rim-light` on `glass-panel`,
   `glass-float`, and `edge-lit`. Never on text, badges, cards, or backgrounds.
2. **Glow only on the call to action.** `cta-glow` sits on primary and play buttons and
   the round + deposit; the only other light is the `chrome-edge` bevel. Status,
   links, and cards never glow. Glow inside a game frame is game art and is not governed
   here.
3. **Glass recipes, not ad-hoc blur.** A surface is one of `glass-chrome`, `glass-panel`,
   `glass-float`, or `glass-menu`. No other blur values, no noise, no stripes, no radial
   blooms.
4. **Hairlines are cool white at 7–20%** (`hairline-soft`, `hairline`, `hairline-strong`,
   all `rgb(170 205 255 / …)`). They edge glass surfaces, the lobby banner and big-wins
   rows (`edge-lit`), and separate dense tabular data.
   There are no hue-coloured borders except a status badge's own tint.
5. **One green.** `brand` is the wordmark and the wallet icon; `accent-ink` is links and
   live dots; the CTA gradient is the only green fill; `selected` is the green tint behind
   a chosen option. Gold is reserved for the crown and win amounts. Status tints
   (`success`, `warning`, `danger`) exist only for state a person must act on.
6. Keep chrome visually quiet, but preserve a visible scrollbar when content can overflow
   and dragging is not obvious or accessible. Hide a track only on deliberate touch-first
   carousels that remain keyboard-scrollable and expose another overflow cue.
7. **Two platform typefaces.** IBM Plex Sans for everything read, including money; IBM
   Plex Mono for micro-labels, IDs, and timestamps. A game frame may use its own
   typefaces, named in its game file; nothing outside a frame uses them.
8. **Weight 700 for display only.** Page and game titles, the wordmark, and CTA labels.
   Everything else is 400–600.
9. **Round only where named.** Avatars, status dots, round utility buttons (profile, bell,
   chat, + deposit), and the wallet pill. Every other control uses the radius scale.

Rules 1, 3, 4, and 5 do not govern a game's skin (see Games); rules 2, 6, 7, 8, and 9 do.

## Brand lines

`PLAY SMART` under the wordmark is brand art, not interface copy. It is not governed by
the copy standard and is never extended into explanatory text. A game's own brand lines
are named in its game file and follow the same rule.

## Surfaces and ink

| Token / utility | Value | Use |
| --- | --- | --- |
| `base` | `#04070d` | The page ground and the modal scrim (`base/70`) |
| `glass-chrome` | `panel`, `rgb(4 13 27 / .86)` + `blur(14px) saturate(1.2)` | Top bar, sidebar, bottom nav, drawer, chat rail |
| `glass-panel` | `rgb(6 15 29 / .82)` + `blur(16px) saturate(1.2)`, `hairline`, `rim-light`, inset highlight | Cards and panels |
| `glass-float` | `rgb(4 16 32 / .6)` + `blur(10px)`, `hairline-strong`, `rim-light`; `float-hover` on hover | Glass controls over game art |
| `glass-menu` | `rgb(12 20 32 / .96)`, cool hairline 14%, overlay shadow | Menus, popovers, dialogs |
| `surface-1` | `#0a111c` | Solid card ground where blur would be wasted (tables, long lists) |
| `surface-2` | `#111a27` | Raised object inside a card; row hover |
| `surface-3` | `#182333` | Media placeholders, active chips, avatars |
| `banner` | `#0b1420` | The lobby banner panel, edged with `edge-lit` over its art |
| `wash` | `rgb(150 190 255 / .08)` | Hover wash on chrome and glass controls |
| `inset` | `rgb(140 180 240 / .06)` | Glass controls at rest |
| `field` | `rgb(125 165 225 / .05)` | Inputs and steppers, raised slightly above the panel |
| `chrome-edge` | A 6px bevel: dark lip, faint halo, 1px ice-blue core with cyan and white glints, a halo below, dark shadow; ends fade | The top bar's bottom edge |
| `rim-light` | 1px ring, `rgb(185 218 255 / .22)` at the top fading out by mid-height | Top-lit edge of `glass-panel`, `glass-float`, and `edge-lit` |
| `edge-lit` | `hairline` border + `rim-light` | Solid objects that must separate from the ground: the lobby banner, big-wins rows |
| `ink` | `#f2f6fb` | Headings and strong values |
| `ink-soft` | `#e6ebf2` | Body and UI text — the `body` default |
| `ink-control` | `#d4e1f7` | Labels on glass controls |
| `ink-cool` | `#9db9e8` | Micro-labels and subtitles |
| `ink-mute` | `#8fa4c2` | Secondary text. **The floor: nothing renders dimmer.** |

## Accent and status

| Token | Value | Use |
| --- | --- | --- |
| `brand` | `#2fe38a` | "Bet" in the wordmark, the wallet icon |
| `accent-ink` | `#3ee08e` | Links, live dots, focus ring |
| `accent-hi` | `#7cf0b5` | Link hover |
| `cta-gradient` | `#4af2a4 → #1dcf7b → #11a860` (180deg) | Primary and play fill |
| `cta-glow` | `0 0 26px rgb(40 230 130 / .42)` + inset highlights | Primary and play |
| `on-accent` | `#04150b` | Ink on the CTA fill |
| `selected` | `rgb(47 227 138 / .14)` | Chosen option, active nav row |
| `gold` | `#f2c14e` | The crown; the ₱ disc beside a win |
| `win` | `#e8c883` | Win amounts in the big-wins strip |
| `success` | `#3ec07d` | Credit figures, approved, active |
| `warning` | `#f5b23b` | Pending, in review |
| `danger` | `#e05a5a` | Rejected, suspended, destructive, the alert dot |

Status colours never fill behind body text. A badge is a 12% tint carrying full-strength
ink, with no border.

## Typography

IBM Plex Sans with tabular figures (`tnum`) for every amount that can change, so digits
never jump width. IBM Plex Mono for micro-labels with wide tracking.

| Role | Size · weight | Notes |
| --- | --- | --- |
| banner headline | 24 · 700 (20 under 760) | `1.1`, `-.02em`, `ink`, `text-balance` |
| page title | 20 · 700 | `-.02em`, `ink` |
| section / panel heading | 15 · 600 | `-.01em`, `ink-soft` |
| body | 13.5 · 400 | `1.5`, `ink-mute` for copy, `ink-soft` for UI text, `text-pretty` |
| money, prominent | 18 · 500 | `tnum`, `ink` |
| UI label / button | 13.5–14 · 500–600 | CTA labels 700 |
| card title | 12.5 · 500 | |
| meta | 11 · 400 | `ink-mute` |
| micro-label (`label-mono`) | Mono 10–11 · 500 | `.14em`, uppercase, `ink-cool` |
| wordmark sub-line | Mono 8.5 · 400 | `.34em`, `ink-mute` |

## Spacing

Gaps: 2px within a menu list · 8–12px within a control cluster · 10px grid gutters ·
14px section internals · 20px between sections. Main padding 14px, content max-width
1320px. Panel padding 16px.

## Radius and elevation

`chip 10` (chips, icon buttons, menu items) · `input 14` (controls, inputs, steppers,
buttons) · `tile 14` (tiles, rows) · `card 20` (panels, dialogs) · `pill` (the wallet
pill). Round utility buttons and avatars are full circles.

Depth is glass over ground: a panel is `glass-panel` on `base`; a menu or dialog is
`glass-menu` over the `base/70` scrim with the overlay shadow. A panel may carry the deep
panel shadow (`0 20px 50px rgb(0 0 0 / .5)`) when it floats over art.

## Controls

Heights: 36 menu item · 40 top-bar utilities and wallet pill · 42 menu button · 48 play
button (40 under 640). Controls drawn under 44px carry `tap-target`, so below 1024px
every hit area is still at least 44px. A game file sets the heights of its own page's
controls within this rule.

Variants: primary (CTA gradient + glow, 700), secondary (`inset` fill + hairline, `wash`
on hover), ghost, destructive (`danger` tint), play (primary at the play height, `input` radius).
Hover is a background swap or a 1.08–1.1 brightness on the CTA. Pressed feedback may use
colour, opacity, or at most 1px of translation; controls never bounce or scale.

## Shell

- Top bar 60px on `glass-chrome` with a `chrome-edge` bottom edge: plain three-bar menu button
  (42px) · a 1px divider · the wordmark (`Hezi` in white, `Bet` in `brand`, the gold crown
  above the `B`, `PLAY SMART` beneath) · the wallet pill (40px: `brand` wallet icon,
  balance in Sans 14 · 500 `tnum`, round 32px CTA + that opens a deposit; the balance links
  to the wallet) · chat toggle · bell with a `danger` dot · round 40px profile button.
- Left rail on `glass-chrome`: 192px expanded / 56px collapsed. Search above; Home, Games,
  Wallet, History; the category browse group; Support and Language pinned to the bottom.
  No separators, no badges, no counts. Active row is `selected` + `ink`.
- Chat rail on the right, 272px on `glass-chrome`, closable, with a toggle in the top bar.
- Below the rail breakpoint the rail becomes a drawer and a bottom nav on `glass-chrome`.
- The game route drops the bottom nav, rail, and chat on phones and keeps the top bar.

## Games

Each integrated game has one file, `.claude/rules/games/<slug>.md`, that designs its page:
layout, stage, controls and their sizes, type on the page, and the art inside its frame. A
game page sits inside the shell above and follows this file's hard rules, tokens, glass
recipes, and primitives for everything it draws outside its frame, except where its game
file declares a **skin**. What a game draws inside its frame — scene, palette, glow,
typefaces, brand lines, sound, and motion — is its own and never becomes a platform token
or component. A game file never changes the shell or redefines a token, and one game's
file never binds another.

A skin dresses the game's own controls in the materials of its scene. It may change only
the fill, border, shadow, and ink of the bet panel, the balance tile, the risk control and
its menu, the stepper, and the title-row buttons. It never changes:

- control heights, hit areas, spacing, or layout;
- type, weights, or money figures;
- the focus ring;
- the play button, which remains the one filled, glowing call to action;
- status colours, dialogs, toasts, round history, or anything in the shell.

A skin adds no glow and no motion beyond this file's. Its ink meets 4.5:1 contrast on its
own surface. It is declared once in `frontend/src/styles/games/<slug>.css`, scoped to that
game's zone, and named in the game's file. It never becomes a token and is never applied
to another game.

## Game tile

`3 / 4` portrait, `tile` radius, `surface-3` placeholder with a centred uppercase mono
caption until real art lands. The name sits inside the tile over the `tile-scrim`; the
studio sits beneath in `ink-mute` at 11px. The grid is
`repeat(auto-fill, minmax(126px, 1fr))` at a 10px gutter, 116px under 560px. Hover
reveals a Play chip by a 120ms opacity fade — no scale.

## Placeholders

Until a title has art, its tile is a flat `surface-3` block with a centred uppercase mono
caption (`game art`), and the lobby banner is the bare `banner` panel. Keep the slot and
the aspect ratio; swap the fill when assets land. Never a gradient, an SVG illustration,
or an emoji.

## Lobby composition (top to bottom)

1. Banner on `banner` — the featured game's artwork is the panel's background, anchored
   right and bottom under `banner-scrim`. At 760px and up the panel is 236px tall and the
   text sits on the left half over a horizontal scrim; below that it is 300px tall and the
   text sits above the art over a vertical one
2. Big wins — horizontal snap row of 172px rows: avatar slot · username · ₱ disc · amount
3. Category tabs — glass chips, active = `selected`; `See all` pushed right
4. Game grid
5. Promotions — rows of 56px art slot + kicker / title / sub; 3 up / 2 up / 1 up
6. Game grid (second set)

A section with nothing to show does not render.

## Admin console

The same tokens and primitives as the player side, without background art or brand
lines beyond the wordmark. Dense tables use `surface-1` rows with hairline separators.

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

A single outline set — 1.5–1.9px stroke, 24px grid, rounded caps. Lucide is the library;
the custom glyphs are the crown in the wordmark and the filled wallet icon in the pill.
Icons are always paired with a label in navigation; icon-only is permitted for top-bar
utilities and controls over game art at 44px targets on touch.

## Motion

Motion communicates interaction, state, hierarchy, or spatial continuity. It is never
added merely to decorate, increase urgency, or keep a player engaged.

- Direct hover, focus, and pressed feedback uses `fast` (120ms).
- Menus, tooltips, dialogs, toasts, and other overlays use `standard` (180ms) with an
  opacity fade and a translate of at most 6px.
- Bounded shell layout changes, including rail and chat width, may use `layout` (220ms).
  Width animation is limited to these small persistent regions; their contents animate
  with `transform` and `opacity`.
- Directly interactive cards may translate by at most 2px. Media never zooms, bounces,
  pulses, or animates automatically.
- A game frame animates its own play; a result is still only a display hint until the
  server confirms settlement.
- Loading indicators do not loop unless progress cannot otherwise be understood. Static,
  shape-matched skeletons are preferred.
- `prefers-reduced-motion` is honoured. Under reduced motion, state remains legible and
  no information depends on an animation completing.

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

Nothing ever emits a horizontal page scrollbar.

## Retired in v3 and why

- **The flat v2 ladder** (`panel`, `#0b0f14` base, `#151b23` cards) — replaced by glass
  over a darker ground so game scenes read through the chrome.
- **"No gradients / no glows / no glass"** — v3 makes the call to action and the surfaces
  the design; they are now named recipes instead of bans.
- **The `#2fa96c` accent and the ₱ disc in the top bar** — one brighter green, and a wallet
  icon in the pill.
- **Plex Mono for money** — v3 sets money in Plex Sans with tabular figures, which keeps
  the no-reflow guarantee at a friendlier size.
- **The 56px top bar and the asymmetric menu glyph** — the top bar is 60px with a
  plain three-bar menu and the crown wordmark.
- **The 72px top bar and 46px utilities** — they read oversized on real screens; v3 runs
  one step denser (60 · 40) with 44px hit areas held by `tap-target`.
- **The 600 weight cap** — display titles and CTA labels are 700.
- **Neutral grey glass and white hairlines** — v3 glass carries navy chroma at the
  same darkness and its edges catch light; surfaces, hairlines, and secondary ink are now
  cool, with the top bar's `chrome-edge` and the panels' `rim-light`.
