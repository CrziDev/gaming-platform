# Frontend Pages — Backend Implementation Checklist

Use each checkbox to track whether the backend support required by that frontend page
has been implemented. A checked item means the page is fully backed by the real API,
not only by frontend mocks.

Source of truth: `frontend/src/routes/AppRoutes.tsx` and
`frontend/src/routes/paths.ts`.

## Current backend coverage

As of 2026-09-19, authentication, wallets, the wallet summary, manual deposits, the
public catalogue, favorites, Plinko rounds and the manifest, live chat, notifications,
paginated admin users, admin user details and status operations, wallet adjustments,
admin transactions, deposit review, the audit log, the dashboard summary, game
administration, RTP profiles, and round history use real APIs when
`VITE_API_MOCK=false`. Fixture-backed reads return nothing outside the demo and tests,
so a real deployment renders the empty state for those surfaces rather than fixture
content. A page stays unchecked while any of its visible data sources has no server.

Audited against the frontend on 2026-09-19: every route below exists, every data hook
on every page was traced to its adapter in `features/*/api.ts`, and the 184 frontend
tests pass.

## Public and player pages

- [ ] **Lobby** — `/` (catalogue, categories, and the featured banner are real; big wins, promotions, and recently-played rows are fixture-only and hidden outside the demo)
- [x] **Game catalogue** — `/games` (real catalogue with category, search, and sort)
- [ ] **Hot games** — `/games/hot` (round data exists now but "hot" has no agreed definition; `flag=hot` answers `400` and the shelf is empty outside the demo)
- [x] **New games** — `/games/new` (real thirty-day `new` flag from the catalogue)
- [x] **Favorites** — `/favorites` (authentication required; the player's real favourites, newest first, active games only)
- [ ] **Promotions** — `/promotions` (fixture-only; empty outside the demo)
- [x] **Sign in** — `/login` (opens the real sign-in flow)
- [x] **Register** — `/register` (opens the real registration flow)
- [ ] **Forgot password** — `/forgot` (calls the contracted endpoint; reports reset as unavailable while the server answers 404)
- [ ] **Reset password** — `/reset` (same; refuses to submit without a token in the link)
- [x] **Game** — `/game/:slug` (authentication required; real game metadata, the game's own wallet, and under every title's board a history of the player's own recent rounds on that game; the favorite toggle writes `PUT`/`DELETE /api/games/{slug}/favorite` and re-reads the list. Plinko launches in the generic game host through the versioned bridge: in the demo a fixture settles each round and the board animates it, while outside the demo Place bet calls `POST /api/games/{slug}/rounds`, which the server settles through the Plinko engine at the return the operator set before the ball is dropped; a server without an engine for the slug answers 404 and the page reports the game as not available. The board is configured from `GET /api/games/{slug}/manifest`, the table of the return in force: until it loads the frame shows the loading state, a 404 or 409 is the frame's error state with a retry, and Place bet is disabled in both; a round settled at a different return than the manifest's refetches it and the board is reconfigured once no ball is in flight. Every other title has no engine on the server, so it keeps the display-slot placeholder and a round would answer `404`)
- [x] **Wallet** — `/wallet` (authentication required; real balance, currency switch sheet, open request list, and recent ledger)
- [x] **Deposit** — `/wallet/deposit` (real methods, limits, proof upload, and submission)
- [x] **Deposit status** — `/wallet/deposit/:id` (real player-owned request; no cancellation)
- [ ] **Cash out** — `/wallet/cash-out` (authentication required; honest unavailable state until the withdrawal API exists)
- [x] **Transaction history** — `/history` (real paginated transactions and rounds with date filters, and a server-reported deposited / staked / returned strip per currency for the chosen range)
- [ ] **Account** — `/account` (authentication required; account and wallets are real; password change waits for its endpoint, and the Status badge is a hardcoded "Active" because the player account body carries no status)
- [x] **Not found** — `*` (tested application 404 state)

## Shell and cross-page features

Features that live in the chrome rather than on one route. The same rule applies: checked
means the server is behind it.

- [x] **Header balance chip** — the active wallet's real balance on every authenticated route; switching happens on the wallet page
- [x] **Search games** — inline box at the top of the rail and drawer; real catalogue results list beneath it, above the navigation, until the box is cleared; `⌘K` focuses it; Enter and "See all results" hand off to `/games?q=`
- [x] **Auth modal and deep links** — `/login` and `/register` open the modal over the lobby, a guest picking a game or a locked nav item is sent back to where they were after signing in
- [x] **Session expired dialog** — raised when a live session stops being recognised, never on a deliberate sign-out; tested
- [x] **Account menu** — Wallet, History, Account, Sign out against the real session
- [x] **Console deposit badge** — the pending total from the real queue
- [x] **Live chat rail** — the real room from `GET /api/chat/messages`, posts through `POST /api/chat/messages` with the server's `429` shown inline, and a WebSocket at `/api/chat/socket` whose `message` event re-reads the room and whose `presence` event drives the online count; reconnects with backoff
- [x] **Notifications bell** — every signed-in player's real notifications from `GET /api/notifications`, re-read every minute and when a round lands; deposit approved, deposit rejected with its reason, and big wins; "Mark all read" posts to `/api/notifications/read`
- [ ] **Support link** — rail and drawer point at `https://support.example.com`; the destination is a placeholder
- [ ] **Language selector** — rail and drawer show an "English" button with no handler; there is one language
- [ ] **Console search box** — the admin top bar's "Search player, ref or round id" input has no handler and no endpoint

## Admin pages

- [x] **Admin sign in** — `/admin/login` (real shared session API and admin route guard; a signed-in admin is sent straight to the dashboard)
- [x] **Dashboard** — `/admin` (currency-scoped summary, queue and activity log are real; fixture alerts render only in the demo)
- [x] **Deposits** — `/admin/deposits` (real pending review queue and approve/reject actions with the private proof image)
- [x] **Users** — `/admin/users` (real paging, search, and status filters)
- [x] **User details** — `/admin/users/:id` (real account, wallets, deposits, rounds, adjustments, and status operations)
- [x] **Transactions** — `/admin/transactions` (real filtered ledger and real round records in the Rounds tab)
- [x] **Rounds** — `/admin/rounds` (real filtering and pagination across round records)
- [x] **Games** — `/admin/games` (real list in every status; create dialog; the contract's `status`, `category`, and `search` filters are not yet exposed in the UI)
- [x] **Game details** — `/admin/games/:id` (real game, edit dialog, the return in force and the engine's options)
- [x] **RTP** — `/admin/rtp` (one row per game with options, a select of the engine's returns, a confirmation that reads in danger at or above 100%, real `PUT /api/admin/games/{id}/rtp`)
- [x] **Audit log** — `/admin/audit` (real paginated append-only feed)
- [ ] **Settings** — `/admin/settings` (Payment methods and Staff read fixture-only and show an explanatory empty state outside the demo; Limits and Platform are static forms whose Save, Add method, and Invite staff buttons have no handler and no contract)

## Coverage

- Public and player routes: 18 (11 backed by the server)
- Admin routes: 12 (11 backed by the server)
- Total frontend routes: 30
- Shell features: 11 (8 backed by the server)
