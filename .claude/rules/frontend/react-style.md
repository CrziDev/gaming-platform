# Frontend conventions

React 19, TypeScript, Vite, Tailwind v4. Named exports only.

## Layout

`src/features/` is the unit of organisation — `auth`, `wallet`, `catalogue`, `admin` —
each with `api.ts` (the query and mutation functions), `hooks.ts` (the TanStack Query
hooks), `schemas.ts` where it has forms, and an `index.ts` that is its public entry.
Cross-feature imports go through that entry, never deep into another feature's internals.

Around it: `src/app/` providers, query client, session gate · `src/routes/` route table
and guards · `src/pages/` one file per screen, with `src/pages/admin/` for the console ·
`src/components/` shared primitives, grouped `ui` / `shell` / `catalogue` / `admin` ·
`src/api/` the HTTP client, wire types, and the mock switch · `src/lib/` money,
formatting, small helpers · `src/mocks/` in-memory fixtures · `src/styles/index.css` the
token definitions.

A page composes features and primitives. A primitive never imports a page or a feature.

## Mobile first

Write the base styles for small screens and add larger breakpoints upward. Never build
desktop-first and retrofit. Every tap target is 44px minimum, 52px for primary play
actions.

Tables become stacked cards below 1024px. Never horizontal scroll.

A group or row with no populated items does not render. No empty shelves, no filler
cards, no greyed controls implying a feature that does not exist.

## Money

The frontend never determines a financial outcome. Balances, payouts, and results are
read from the server and displayed — never computed, predicted, or optimistically
patched.

Money arrives as integer minor units plus a currency code, within JavaScript's exact
integer range. Validate that invariant in `src/lib/money.ts` and format only at the render
boundary. The frontend never invents a financial outcome; small UI-only sums or
differences may use the guarded money helpers, which refuse mixed currencies and unsafe
results. Never use fractional arithmetic or `parseFloat` for money.

Timestamps arrive as RFC 3339 UTC and convert to local time at the render boundary only.

## Server state

TanStack Query owns server state. Do not mirror fetched data into `useState` or a global
store, and invalidate on mutation instead of hand-patching caches.

Handle all four query states — loading, empty, error, success. An error path that shows a
stale balance is a correctness bug, not a polish issue.

## Forms

React Hook Form plus Zod. The Zod schema is the client-side source of truth, and client
validation is UX only — the server validates independently and its `fields` response is
what gets shown against an input.

## Auth

The session is an HttpOnly cookie the browser cannot read. **Nothing credential-shaped
goes in `localStorage` or `sessionStorage`, ever.** There is no CSRF token to send; the
server's defence is the `Origin` header, which the browser sets on its own.

## Mocks

`src/api/mode.ts` decides per build whether fixtures are in play: `usingMockApi` is the
development demo (`VITE_API_MOCK=true` under `vite dev`), and `usingFixtures` adds the
component-test run. Each query function in `features/*/api.ts` branches on that once —
`auth`, `catalogue`, `wallet`, and `admin` all have live paths against the server and a
fixture path for the demo; `chat`, big wins, promotions, and favourites are fixture-only
until a service exists, and return nothing outside the demo so their sections do not
render. A fixture is shaped like the response it stands in for, so wiring a real endpoint
changes one query function, not a component. A production bundle never reads a fixture.

## Games

When games are integrated they are embedded only through the generic game-host page and
the platform game bridge. Game code never calls the platform API directly, and a result
message from a game frame is a display hint until the server confirms settlement.
