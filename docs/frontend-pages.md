# Frontend Pages — Backend Implementation Checklist

Use each checkbox to track whether the backend support required by that frontend page
has been implemented. A checked item means the page is fully backed by the real API,
not only by frontend mocks.

Source of truth: `frontend/src/routes/AppRoutes.tsx` and
`frontend/src/routes/paths.ts`.

## Current backend coverage

As of 2026-09-12, authentication, wallets, manual deposits, the public catalogue,
paginated admin users, admin user details and status operations, wallet adjustments,
admin transactions, deposit review, the audit log, the dashboard summary, game
administration, and RTP profiles use real APIs when `VITE_API_MOCK=false`. Fixture-backed reads return nothing outside the demo and tests,
so a real deployment renders the empty state for those surfaces rather than fixture
content. A page stays unchecked while any of its visible data sources has no server.

Audited against the frontend on 2026-09-12: every route below exists, every data hook
on every page was traced to its adapter in `features/*/api.ts`, and the 99 frontend
tests pass.

## Public and player pages

- [ ] **Lobby** — `/` (catalogue, categories, and the featured banner are real; big wins, promotions, recently-played rows, and the shell's live chat are fixture-only and hidden outside the demo)
- [x] **Game catalogue** — `/games` (real catalogue with category, search, and sort)
- [ ] **Hot games** — `/games/hot` (no round data to define "hot"; empty outside the demo)
- [x] **New games** — `/games/new` (real thirty-day `new` flag from the catalogue)
- [ ] **Favorites** — `/favorites` (authentication required; fixture-only toggle, empty outside the demo)
- [ ] **Promotions** — `/promotions` (fixture-only; empty outside the demo)
- [x] **Sign in** — `/login` (opens the real sign-in flow)
- [x] **Register** — `/register` (opens the real registration flow)
- [ ] **Forgot password** — `/forgot` (calls the contracted endpoint; reports reset as unavailable while the server answers 404)
- [ ] **Reset password** — `/reset` (same; refuses to submit without a token in the link)
- [ ] **Game** — `/game/:slug` (authentication required; real game metadata and the game's own wallet; recent rounds and the favorite toggle are fixture-only; the bet panel is a display slot whose Place bet only raises a toast, and there is no engine to launch)
- [x] **Wallet** — `/wallet` (authentication required; real balance, wallet switch, recent ledger, and open request)
- [x] **Deposit** — `/wallet/deposit` (real methods, limits, proof upload, and submission)
- [x] **Deposit status** — `/wallet/deposit/:id` (real player-owned request; no cancellation)
- [ ] **Transaction history** — `/history` (transactions with type and date filters are real; the Rounds tab is empty until round APIs exist)
- [ ] **Account** — `/account` (authentication required; account and wallets are real; password change waits for its endpoint, and the Status badge is a hardcoded "Active" because the player account body carries no status)
- [x] **Not found** — `*` (tested application 404 state)

## Shell and cross-page features

Features that live in the chrome rather than on one route. The same rule applies: checked
means the server is behind it.

- [x] **Header balance chip** — the active wallet's real balance on every authenticated route; switching happens on the wallet page
- [x] **Search games** — `⌘K` / rail / drawer sheet, real catalogue search, hands off to `/games?q=`
- [x] **Auth modal and deep links** — `/login` and `/register` open the modal over the lobby, a guest picking a game or a locked nav item is sent back to where they were after signing in
- [x] **Session expired dialog** — raised when a live session stops being recognised, never on a deliberate sign-out; tested
- [x] **Account menu** — Wallet, History, Account, Sign out against the real session
- [x] **Console deposit badge** — the pending total from the real queue
- [ ] **Live chat rail** — fixture-only; the rail and its header toggle are hidden outside the demo, no contract
- [ ] **Notifications bell** — fixture-only; the bell is hidden outside the demo, no contract for notifications or marking them read
- [ ] **Support link** — rail and drawer point at `https://support.example.com`; the destination is a placeholder
- [ ] **Language selector** — rail and drawer show an "English" button with no handler; there is one language
- [ ] **Console search box** — the admin top bar's "Search player, ref or round id" input has no handler and no endpoint

## Admin pages

- [x] **Admin sign in** — `/admin/login` (real shared session API and admin route guard; a signed-in admin is sent straight to the dashboard)
- [x] **Dashboard** — `/admin` (currency-scoped summary, queue and activity log are real; fixture alerts render only in the demo)
- [x] **Deposits** — `/admin/deposits` (real pending review queue and approve/reject actions with the private proof image)
- [x] **Users** — `/admin/users` (real paging, search, and status filters)
- [x] **User details** — `/admin/users/:id` (real account, wallets, deposits, adjustments, and status operations; no rounds section until round APIs exist)
- [x] **Transactions** — `/admin/transactions` (real filtered ledger; the Rounds tab is empty until round APIs exist)
- [ ] **Rounds** — `/admin/rounds` (fixture-only; empty outside the demo)
- [x] **Games** — `/admin/games` (real list in every status; create dialog; the contract's `status`, `category`, and `search` filters are not yet exposed in the UI)
- [x] **Game details** — `/admin/games/:id` (real game, edit dialog, real profiles, draft dialog)
- [x] **RTP profiles** — `/admin/rtp` (real cross-game list, draft edit, real activation with the unverified refusal)
- [x] **Audit log** — `/admin/audit` (real paginated append-only feed)
- [ ] **Settings** — `/admin/settings` (Payment methods and Staff read fixture-only and show an explanatory empty state outside the demo; Limits and Platform are static forms whose Save, Add method, and Invite staff buttons have no handler and no contract)

## Coverage

- Public and player routes: 17
- Admin routes: 12
- Total frontend routes: 29
- Shell features: 11 (6 backed by the server)
