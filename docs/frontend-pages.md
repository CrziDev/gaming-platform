# Frontend Pages — Backend Implementation Checklist

Use each checkbox to track whether the backend support required by that frontend page
has been implemented. A checked item means the page is fully backed by the real API,
not only by frontend mocks.

Source of truth: `frontend/src/routes/AppRoutes.tsx` and
`frontend/src/routes/paths.ts`.

## Current backend coverage

As of 2026-09-11, the registration, login, logout, session, enabled-currency, and
paginated admin-user APIs exist. No checkbox below is complete yet because non-test web
builds still default to fixture mode, and the admin users feature still calls its fixture
API directly. The currency endpoint has no standalone page to mark here.

## Public and player pages

- [ ] **Lobby** — `/`
- [ ] **Game catalogue** — `/games`
- [ ] **Sign in** — `/login` (opens the sign-in flow)
- [ ] **Register** — `/register` (opens the registration flow)
- [ ] **Forgot password** — `/forgot`
- [ ] **Reset password** — `/reset`
- [ ] **Game** — `/game/:slug` (authentication required)
- [ ] **Wallet** — `/wallet` (authentication required)
- [ ] **Deposit** — `/wallet/deposit` (authentication required)
- [ ] **Deposit status** — `/wallet/deposit/:id` (authentication required)
- [x] **Transaction history** — `/history` (authentication required; real wallet API in non-mock mode)
- [ ] **Account** — `/account` (authentication required)
- [ ] **Not found** — `*`

## Admin pages

- [ ] **Admin sign in** — `/admin/login`
- [ ] **Dashboard** — `/admin`
- [ ] **Deposits** — `/admin/deposits`
- [ ] **Users** — `/admin/users`
- [ ] **User details** — `/admin/users/:id`
- [ ] **Transactions** — `/admin/transactions`
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
