# Frontend design audit

Reviewed 2026-09-21. This document records the visual and interaction audit that
preceded the frontend polish pass.

## Current direction

The application uses a restrained, mobile-first dark interface. Neutral stepped
surfaces form the chrome, green is the sole interactive accent, and game artwork
provides most of the colour and energy. Compact IBM Plex typography, modest radii,
clear money formatting, and quiet admin screens make the product feel trustworthy.

The direction is appropriate for a real-money gaming platform. The issue is not the
direction itself, but that restraint had become rigidity in several interactions.

## Rules that limited the experience

The v2 design standard limited motion to background swaps, a game-tile opacity fade,
and small transient popovers. It explicitly prohibited pressed states and transforms,
and treated the surface ladder as the only depth mechanism. That prevented the shell,
drawers, dialogs, collapsibles, and direct controls from communicating state smoothly.

The implementation had also accumulated exceptions: deposit controls, the mobile game
footer, RTP screens, and console search used borders or shadows even though the standard
prohibited them categorically. This made depth feel accidental rather than governed.

## Findings

### Shell and navigation

- The desktop rail changed directly between 56px and 192px. Labels and search controls
  switched display modes immediately, and the center column jumped with it.
- Hover expansion had no settling time, making incidental pointer crossings disruptive.
- Mobile drawers and chat appeared abruptly. The player drawer did not contain focus or
  restore it on close.
- Active navigation relied mainly on a quiet wash. The bottom navigation was especially
  difficult to scan.

### Controls and content

- Buttons, icon controls, tabs, cards, and table rows had hover colours but little or no
  pressed feedback.
- Game tiles relied on a pointer-hover Play overlay; touch feedback was weak.
- Collapsible panels, menus, notifications, search results, dialogs, and toasts appeared
  without a common transition language.
- Loading placeholders were static and sometimes did not resemble the content replacing
  them. Deposit loading was one large rectangle rather than a form-shaped skeleton.
- Page composition was consistent but repetitive, with many equally weighted surfaces
  and limited differentiation between primary and supporting content.

### Responsive, accessibility, and performance

- Several mobile screens were stacked desktop compositions rather than deliberate mobile
  layouts, although the game screen itself was thoughtfully adapted.
- The admin RTP details exposed wide chart/table content too early and depended on
  horizontal scrolling.
- The announcement marquee animated `left`, causing avoidable layout work.
- The global reduced-motion rule was already strong and needed to remain authoritative.

## Improvements ordered by impact

1. Establish shared motion tokens and make the rail width, labels, search, icons, and
   adjacent content transition as one system.
2. Strengthen active navigation and shared hover, focus, pressed, disabled, and busy
   states in primitives rather than page-specific styles.
3. Give drawers, dialogs, menus, collapsibles, notifications, and toasts consistent
   state transitions and better focus management.
4. Improve game-card pointer, keyboard, and touch feedback without promotional motion.
5. Add brief, server-confirmed feedback for wallet and transaction changes.
6. Improve shape-matched loading and semantic empty/error states.
7. Resolve mobile overflow and reconcile existing depth exceptions with the standard.

## Implementation scope

The work centers on the design tokens and shared UI primitives, the player shell and
navigation, catalogue cards, wallet feedback, admin shell/search, RTP responsive details,
and their tests. Page-specific styling should only be changed where a shared primitive
cannot express the required state.

### Files and components

- Design rules and tokens: `.claude/rules/frontend/system-design.md` and
  `frontend/src/styles/index.css`.
- Player shell: `Sidebar`, `RailSearch`, `NavList`, `BottomNav`, `MobileDrawer`,
  `ChatRail`, `WalletIndicator`, `AccountMenu`, and `NotificationsPanel`.
- Admin shell: `AdminShell` and `AdminConsoleSearch`.
- Shared interaction primitives: `Button`, `Field`, `Tabs`, `Panel`, `RecordTable`,
  `Modal`, `ConfirmDialog`, `Toast`, and state components.
- Content and responsive screens: `GameCard`, `DepositPage`, `GamePage`, and
  `AdminRtpConfigurationPage`.
- Test infrastructure: `frontend/src/setupTests.ts` and the existing shell/page tests.

## Verification baseline

Before implementation, TypeScript passed and ESLint reported no errors (six existing
Fast Refresh warnings). The test suite had 223 passing tests and two failures in
`ShelvesPage.test.tsx` and `DepositPage.test.tsx`.

## Implementation record

The polish pass kept the existing neutral, artwork-led direction and changed the shared
language rather than restyling individual screens independently.

- Added named `fast`, `standard`, and `layout` timing tokens, one neutral overlay-shadow
  token, and reusable entrance/value-update animations. The global reduced-motion rule
  remains authoritative.
- Coordinated desktop rail width, label, search, icon, and center-content changes. Search
  variants now cross-fade in place instead of replacing one another, and the rail clips
  horizontal transition artifacts.
- Animated the chat rail and player/admin mobile drawers as spatial layout changes.
  Drawers now lock background scroll, contain keyboard focus, close on Escape, and restore
  focus to the invoking control.
- Added restrained pressed feedback to shared buttons, icon buttons, tabs, navigation,
  wallet controls, cards, and clickable records. Disabled controls now communicate their
  state with both pointer behavior and opacity.
- Strengthened active player, bottom, and admin navigation with a small accent marker.
- Added subtle game-tile lift and focus framing without zooming artwork or adding
  automatic movement.
- Applied consistent elevation and entrance motion to menus, search results,
  notifications, dialogs, and toasts. Collapsible panels now preserve spatial continuity.
- Added a brief server-confirmed balance update animation and a polite live-region update.
- Improved empty and error-state hierarchy with semantic icons, and replaced the deposit
  page's single loading block with a shape-matched form skeleton.
- Moved wide RTP charts and tables to the wide layout so mobile and tablet widths use the
  purpose-built outcome list without horizontal scrolling.
- Reworked the announcement ticker to animate only `transform`, avoiding per-frame layout.

## Revised standard

The design standard now permits purposeful 120ms, 180ms, and 220ms state transitions;
pressed feedback without bounce or scale; bounded shell width animation; quiet hairlines
where they communicate structure; and one neutral shadow for genuinely floating UI.
Decorative loops, coloured glows, artwork zooms, promotional motion, and extra gradients
remain prohibited.

## Verification after implementation

- TypeScript type-check passed.
- The production build completed successfully. Vite retains its existing warning about
  the main JavaScript chunk exceeding 500 kB.
- ESLint completed with no errors and the six existing Fast Refresh warnings.
- All 38 frontend test files and all 227 tests passed in the single-worker verification
  run. Parallel execution can expose an existing test-isolation timing race in the shared
  session-expiry fixture, so the deterministic run was used for the final result.

## Follow-up areas

- Promotions and big wins remain intentionally unfinished until real services and content
  exist; visual treatment should be revisited when those features become real.
- A browser-based visual-regression suite would protect responsive layout and motion more
  effectively than class and DOM assertions alone.
- The production bundle still reports a large main chunk and would benefit from route-level
  code splitting as the frontend grows.
- Existing Fast Refresh warnings should be removed by separating helper exports from
  component modules in a later structural cleanup.
