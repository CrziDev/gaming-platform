# Frontend Pages — Backend Implementation Checklist

Use each checkbox to track whether the backend support required by that frontend page
has been implemented. A checked item means the page is fully backed by the real API,
not only by frontend mocks.

Source of truth: `frontend/src/routes/AppRoutes.tsx` and
`frontend/src/routes/paths.ts`.

## Current backend coverage

As of 2026-09-30, authentication, password recovery and change, wallets, the wallet summary, manual deposits, the
public catalogue, favorites, Plinko rounds and the manifest, live chat, notifications,
paginated admin users, admin user details and status operations, wallet adjustments,
admin transactions, deposit review, the audit log, the dashboard summary, game
administration, RTP switching and inspection, round history, payment-method
administration, and console search use real APIs in every application build. Features
without a service are visibly marked Future Development rather than showing fixture data
or controls that cannot save. A page stays unchecked while its primary feature has no
server.

Audited against the frontend on 2026-09-20: every route below exists and every data hook
on every page was traced to its adapter in `features/*/api.ts`.

## Public and player pages

- [x] **Lobby** — `/` (catalogue, categories, featured banner, and the signed-in player's recently-played row are real; the banner rotates every 3 seconds between the playable games — Plinko, Plinko Billiards, and Plinko Tropical — each shown by a capture of its game page (board, taglines, and bet panel) with a phone-sized capture of the board beside the copy on phones, pauses on hover, focus, touch, and a hidden tab, and does not rotate under reduced motion; the tile shows the same board; big wins is a placeholder strip marked Future Development and promotions is a Future Development section)
- [x] **Game catalogue** — `/games` (real catalogue with category and search)
- [x] **Hot games** — `/games/hot` (active games with a settled round in the trailing seven days, ranked by settled rounds, distinct players, and latest play)
- [x] **New games** — `/games/new` (real thirty-day `new` flag from the catalogue)
- [x] **Favorites** — `/favorites` (authentication required; the player's real favourites, newest first, active games only)
- [ ] **Promotions** — `/promotions` (explicit Future Development page; no promotion service yet)
- [x] **Sign in** — `/login` (opens the real sign-in flow)
- [x] **Register** — `/register` (opens the real registration flow)
- [x] **Forgot password** — `/forgot` (real indistinguishable reset request, including the explicitly unavailable delivery state)
- [x] **Reset password** — `/reset` (real token confirmation, validation and invalid-link recovery; success installs the returned session and enters the application)
- [x] **Game** — `/game/:slug` (authentication required; real game metadata, the game's own wallet, and under every title's board a history of the player's own recent rounds on that game; the favorite toggle writes `PUT`/`DELETE /api/games/{slug}/favorite` and re-reads the list. Plinko is the v24 design: a three.js glass board over a night-city backdrop fills the game zone, with the title row, the board's stage, and the bet panel laid over it in one centred column that fits the screen at every width and is only as tall as it needs, so round history follows straight after the bet panel; on a short screen such as a laptop the board takes the full height and the title row and bet panel stand in a side panel beside it; on phones the top bar stays while the bottom nav gives way, the title row and bet panel are compact, and the board nearly fills the width, its taglines showing only where a gutter holds them. It launches in the generic game host through the versioned bridge (protocol 3, whose stage `layout` also carries the rects the host's controls cover). The player plays the 10-row board, with no rows choice, through a Low / Normal / High risk menu and a stake stepper that walks a 1-2-5 ladder of stakes the server accepts; Space places a bet and FAIR GAME shows the payouts of the board in play from the manifest, never the return. Place bet calls `POST /api/games/{slug}/rounds`, which the server settles through the Plinko engine at the return the operator set before the ball is dropped; component tests use a deterministic fixture. A server without an engine for the slug answers 404 and the page reports the game as not available. The board is configured from `GET /api/games/{slug}/manifest`, the table of the return in force: until it loads the frame stays hidden behind the loading state, a miniature peg board a ball drops through (static under reduced motion), and fades in once ready; a 404 or 409 is the frame's error state with a retry, and Place bet is disabled in both; a round settled at a different return than the manifest's refetches it and the board is reconfigured once no ball is in flight. Plinko Billiards is the same game in its own frame: the identical host, bet panel, engine, and board, drawn as a slim-railed billiard table with a rack of pool balls for pegs and enamelled payout plates under eleven pockets; its controls wear the table's materials through a declared skin (a mahogany-railed felt panel, a brass balance plate, an ivory risk chip, cue-ball steppers, and leather title-row buttons) while the play button stays the platform's; it keeps its own catalogue entry, rounds, history, and return. Plinko Tropical is the same game again in its own frame: the identical bet panel, engine, and board, drawn as a slate board with a gold and steel rim of warm bulbs, a lit glass chute, mirror pegs, and square backlit payout tiles wall to wall along its foot, in front of a sunlit terrace whose signboard carries the right brand line; its stage tucks under the title row, where a declared title mark sets the name as a brush-script PLINKO logo over a swash with the subtitle arched beneath it, while the heading keeps the full name; it keeps its own catalogue entry, rounds, history, and return. Every other title has no engine on the server, so it keeps the display-slot placeholder and a round would answer `404`)
- [x] **Wallet** — `/wallet` (authentication required; a centred real balance with Deposit and Cash out beneath it and the currency switch sheet at the card's top right; Activity, Withdrawals, and Deposits tabs: the active wallet's recent ledger, then every withdrawal and every deposit request with its status, each opening its status page, with the pending count on each request tab)
- [x] **Deposit** — `/wallet/deposit` (real methods, limits, proof upload, and submission)
- [x] **Deposit status** — `/wallet/deposit/:id` (real player-owned request; no cancellation)
- [x] **Cash out** — `/wallet/cash-out` (authentication required; real payout methods, withdrawal limits, and balance check; submits `POST /api/withdrawals` with one idempotency key per form, which debits the amount at once; a wallet with a pending withdrawal shows that request instead of the form)
- [x] **Withdrawal status** — `/wallet/cash-out/:id` (real player-owned request with its payout reference or rejection reason; a pending request can be cancelled behind a confirmation, which returns the amount)
- [x] **Transaction history** — `/history` (real paginated transactions, including a Withdrawals filter, and rounds with date filters, and a server-reported deposited / staked / returned strip per currency for the chosen range)
- [x] **Account** — `/account` (authentication required; account and wallets are read-only, the real password form rotates every session while preserving this browser, and no player status is fabricated)
- [x] **Not found** — `*` (tested application 404 state)

## Shell and cross-page features

Features that live in the chrome rather than on one route. The same rule applies: checked
means the server is behind it.

- [x] **Header wallet pill** — the top bar's pill: the active wallet's real balance on every authenticated route, linking to the wallet, with a round + that opens a deposit; switching happens on the wallet page
- [x] **Search games** — inline box at the top of the rail and drawer; real catalogue results list beneath it, above the navigation, until the box is cleared; `⌘K` focuses it; Enter and "See all results" hand off to `/games?q=`
- [x] **Auth modal and deep links** — `/login` and `/register` open the modal over the lobby, a guest picking a game or a locked nav item is sent back to where they were after signing in
- [x] **Session expired dialog** — raised when a live session stops being recognised, never on a deliberate sign-out; tested
- [x] **Account menu** — the round profile button opens Wallet, History, Account, Sign out against the real session
- [x] **Console deposit and withdrawal badges** — the pending totals from the real queues
- [x] **Live chat rail** — the real room from `GET /api/chat/messages`, posts through `POST /api/chat/messages` with the server's `429` shown inline, and a WebSocket at `/api/chat/socket` whose `message` event re-reads the room and whose `presence` event drives the online count; reconnects with backoff
- [x] **Notifications bell** — every signed-in player's real notifications from `GET /api/notifications`, re-read every minute and when a round lands; deposit approved, deposit rejected with its reason, withdrawal paid out, withdrawal rejected with its reason, and big wins; "Mark all read" posts to `/api/notifications/read`
- [x] **Lobby announcements** — a public right-to-left ticker beneath the header combines every enabled, unexpired announcement newest first; it disappears when empty and becomes static under reduced-motion preferences
- [ ] **Support** — rail and drawer rows open a brief Future Development notice when tapped; no destination is advertised
- [ ] **Language selector** — rail and drawer rows open a brief Future Development notice when tapped; there is no inert selector
- [x] **Console search box** — debounced, keyboard-accessible typeahead across real player, deposit, and round APIs; selecting a result opens the player detail or a filtered all-status deposit/round page

## Admin pages

- [x] **Admin sign in** — `/admin/login` (real shared session API and admin route guard; a signed-in admin is sent straight to the dashboard)
- [x] **Dashboard** — `/admin` (currency-scoped summary with today's hold against the stake-weighted expected return, a per-game activity table, queue and activity log are real; the fixture-only console alert panel was removed and player notifications are unchanged)
- [x] **Deposits** — `/admin/deposits` (real pending review queue and approve/reject actions with the private proof image)
- [x] **Withdrawals** — `/admin/withdrawals` (real pending queue, oldest first, with the account to pay; mark paid with a payout reference or reject with a reason)
- [x] **Users** — `/admin/users` (real paging, search, and status filters)
- [x] **User details** — `/admin/users/:id` (real account, wallets, deposits, rounds, adjustments, and status operations)
- [x] **Transactions** — `/admin/transactions` (real filtered ledger, including withdrawals, and real round records in the Rounds tab)
- [x] **Rounds** — `/admin/rounds` (real filtering and pagination across round records)
- [x] **Games** — `/admin/games` (real list in every status; create dialog; the contract's `status`, `category`, and `search` filters are not yet exposed in the UI)
- [x] **Game details** — `/admin/games/:id` (real game, edit dialog, the return in force and the engine's options)
- [ ] **Promotions** — `/admin/promotions` (explicit Future Development page; no promotion administration service yet)
- [x] **RTP** — `/admin/rtp` (one row per game with options, a select of the engine's returns, a confirmation that reads in danger at or above 100%, real `PUT /api/admin/games/{id}/rtp`)
- [x] **RTP configuration** — `/admin/rtp/:id` (read-only inspection of each engine option by board, including the configuration reference, target and theoretical RTP, multipliers, and normalized slot chances from `GET /api/admin/games/{id}/rtp-configuration`)
- [x] **Audit log** — `/admin/audit` (real paginated append-only feed)
- [x] **Announcements** — `/admin/announcements` (real paginated create, edit, enable, and disable management for permanent or end-dated lobby announcements)
- [x] **Settings** — `/admin/settings` (payment methods have real list/create/edit/enable/disable APIs and audit entries; Staff lists every administrator with an audited email-alert switch any administrator can turn on or off; Limits and Platform are explicit Future Development panels without inert controls)

## Coverage

- Public and player routes: 19 (18 backed by the server)
- Admin routes: 16 (15 backed by the server)
- Total frontend routes: 35
- Shell features: 12 (10 backed by the server)
