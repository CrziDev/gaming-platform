# Dependencies

The standard library is the default, not the fallback. A third-party package is added
only when the standard library cannot meet the need safely — and "safely" is the whole
test: the dependency must be a correctness or security primitive that is dangerous to
hand-roll. Convenience, terseness, and familiarity are not reasons.

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

pgx is used **through `database/sql`**, not through pgx's own API. The standard interface
is the one worth knowing, and the driver stays swappable.

`golang-migrate` is a pinned binary installed into `backend/bin` by `make tools`, not a
library import. Tools and dependencies are judged separately.

## Adding one

Before adding a package, write down the standard-library approach and why it fails. If
the answer is "more code", the answer is more code. If it is "I would be implementing a
cryptographic primitive, a wire protocol, or a parser for a specification I do not
control", the dependency is justified.

A new dependency is pinned to an exact version, appears in `backend/go.mod` as a direct
require, and arrives in the same change as the code that needs it.

The frontend follows the same bar against `frontend/package.json`. React, the router,
TanStack Query, React Hook Form, Zod and Tailwind are the settled set; anything beyond
them needs the same written justification.
