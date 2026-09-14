# Dependencies

The standard library is the default, not a hard lock. Add a focused, maintained
third-party package when it materially improves correctness, security, interoperability,
or long-term maintenance after comparing the standard-library implementation. Mere
familiarity is not enough, but avoiding a dependency is not valuable when it leaves a
larger bespoke subsystem to maintain.

## Reach for these first

`net/http` with method-aware route patterns · `encoding/json` · `log/slog` · `os.Getenv`
· `database/sql` · `context` · `errors` · `time` · `crypto/rand` · `crypto/sha256` ·
`crypto/subtle` · `net/http/httptest` · `testing`.

Routing, middleware, configuration loading, request decoding, logging, and test servers
are all covered above. None of them justifies a framework.

## What clears the bar today

| Package | Why it cannot be the standard library |
| --- | --- |
| `github.com/jackc/pgx/v5` | PostgreSQL wire protocol driver. `database/sql` defines the interface but ships no driver. |
| `golang.org/x/crypto` | Argon2id. A password hash written by hand is a security bug waiting to happen. |

Use pgx through `database/sql` by default. A package may use pgx's native API when a
PostgreSQL-specific feature or measurable performance need justifies it; keep one access
style within that package and document the reason.

`golang-migrate` is a pinned binary installed into `backend/bin` by `make tools`, not a
library import. Tools and dependencies are judged separately.

## Adding one

Before adding a package, write down the standard-library approach and the tradeoff. A
dependency is justified when its focused, reviewed implementation carries less risk and
maintenance cost than the code it replaces; security primitives, wire protocols, and
external specifications are especially strong cases.

A new dependency is pinned to an exact version, appears in `backend/go.mod` as a direct
require, and arrives in the same change as the code that needs it.

The frontend follows the same bar against `frontend/package.json`. React, the router,
TanStack Query, React Hook Form, Zod and Tailwind are the current set; additions need the
same concrete justification rather than a permanent ban.
