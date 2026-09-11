# Frontend Pages — Backend Implementation Checklist

Use each checkbox to track whether the backend support required by that frontend page
has been implemented. A checked item means the page is fully backed by the real API,
not only by frontend mocks.

Source of truth: `frontend/src/routes/AppRoutes.tsx` and
`frontend/src/routes/paths.ts`.

## Current backend coverage

As of 2026-09-12, authentication, wallets, manual deposits, paginated admin users,
admin user details and status operations, wallet adjustments, admin transactions,
deposit review, the audit log, and the dashboard summary use real APIs when
`VITE_API_MOCK=false`. Remaining unchecked pages still depend partly or entirely on
fixtures; a page stays unchecked when even one of its visible data sources is fixture-backed.

## Public and player pages

- [ ] **Lobby** — `/` (catalogue, big wins, promotions and the shell's live chat are all fixture-backed)
- [ ] **Game catalogue** — `/games`
- [x] **Sign in** — `/login` (opens the real sign-in flow)
- [x] **Register** — `/register` (opens the real registration flow)
- [ ] **Forgot password** — `/forgot`
- [ ] **Reset password** — `/reset`
- [ ] **Game** — `/game/:slug` (authentication required)
- [x] **Wallet** — `/wallet` (authentication required)
- [x] **Deposit** — `/wallet/deposit` (real methods, limits, proof upload, and submission)
- [x] **Deposit status** — `/wallet/deposit/:id` (real player-owned request; no cancellation)
- [ ] **Transaction history** — `/history` (transactions are real; round history remains fixture-backed)
- [ ] **Account** — `/account` (authentication required)
- [x] **Not found** — `*` (tested application 404 state)

## Admin pages

- [x] **Admin sign in** — `/admin/login` (real shared session API and admin route guard)
- [ ] **Dashboard** — `/admin` (summary and activity log are real; alerts remain fixture-backed)
- [x] **Deposits** — `/admin/deposits` (real pending review queue and approve/reject actions)
- [x] **Users** — `/admin/users` (real paging, search, and status filters)
- [x] **User details** — `/admin/users/:id` (real account, wallets, deposits, adjustments, and status operations)
- [x] **Transactions** — `/admin/transactions`
- [ ] **Rounds** — `/admin/rounds`
- [ ] **Games** — `/admin/games`
- [ ] **Game details** — `/admin/games/:id`
- [ ] **RTP profiles** — `/admin/rtp`
- [x] **Audit log** — `/admin/audit` (real paginated append-only feed)
- [ ] **Settings** — `/admin/settings`

## Coverage

- Public and player routes: 13
- Admin routes: 12
- Total frontend routes: 25
