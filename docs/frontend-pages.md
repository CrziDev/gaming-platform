# Frontend Pages — Backend Implementation Checklist

Use each checkbox to track whether the backend support required by that frontend page
has been implemented. A checked item means the page is fully backed by the real API,
not only by frontend mocks.

Source of truth: `frontend/src/routes/AppRoutes.tsx` and
`frontend/src/routes/paths.ts`.

## Current backend coverage

As of 2026-09-11, authentication, wallet and transaction history, manual deposits,
paginated admin users, wallet adjustments, admin transactions, and deposit review use
real APIs when `VITE_API_MOCK=false`. Remaining unchecked pages still depend partly or
entirely on fixtures.

## Public and player pages

- [ ] **Lobby** — `/`
- [ ] **Game catalogue** — `/games`
- [x] **Sign in** — `/login` (opens the real sign-in flow)
- [x] **Register** — `/register` (opens the real registration flow)
- [ ] **Forgot password** — `/forgot`
- [ ] **Reset password** — `/reset`
- [ ] **Game** — `/game/:slug` (authentication required)
- [x] **Wallet** — `/wallet` (authentication required)
- [x] **Deposit** — `/wallet/deposit` (real methods, limits, proof upload, and submission)
- [x] **Deposit status** — `/wallet/deposit/:id` (real player-owned request; no cancellation)
- [x] **Transaction history** — `/history` (authentication required; real wallet API in non-mock mode)
- [ ] **Account** — `/account` (authentication required)
- [x] **Not found** — `*` (tested application 404 state)

## Admin pages

- [x] **Admin sign in** — `/admin/login` (real shared session API and admin route guard)
- [ ] **Dashboard** — `/admin`
- [x] **Deposits** — `/admin/deposits` (real pending review queue and approve/reject actions)
- [x] **Users** — `/admin/users` (real paging, search, and status filters)
- [ ] **User details** — `/admin/users/:id`
- [x] **Transactions** — `/admin/transactions`
- [ ] **Rounds** — `/admin/rounds`
- [ ] **Games** — `/admin/games`
- [ ] **Game details** — `/admin/games/:id`
- [ ] **RTP profiles** — `/admin/rtp`
- [ ] **Audit log** — `/admin/audit`
- [ ] **Settings** — `/admin/settings`

## Coverage

- Public and player routes: 13
- Admin routes: 12
- Total frontend routes: 25
