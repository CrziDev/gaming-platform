# Go conventions

Derived from <https://go.dev/doc/effective_go>. The guiding constraint is that someone
still learning Go can read this codebase end to end: prefer the standard library and
explicit code, while using a small abstraction when it removes a real source of drift or
makes an invariant easier to verify.

## Package layout

- A package owns one subject end to end, and its files are named for the role they play:
  `model.go` the types and sentinel errors, `repository.go` the SQL, `service.go` the
  use cases and rules that decide, `handler.go` the HTTP. These are reading aids, not
  layers every package must contain. A package without HTTP has no `handler.go`; a simple
  read with no decisions to make may go from its handler straight to a repository
  function and needs no `service.go`. A file named for its subject rather than its role —
  `session.go`, `password.go`, `guard.go` — is right where the subject is the point.
- `internal/app` owns the route table and the server lifecycle. `cmd/server` is `main`
  and nothing else. `internal/httpx` owns the response envelope and paging, because the
  shape in `api.md` is one contract and belongs in one place.
- SQL stays with the package that owns the operation. Wallet balance changes, their
  matching ledger inserts, and the ledger reads behind the transaction-list endpoints all
  belong to `internal/wallet`, because the balance and its ledger are one invariant.
  A package that needs a wallet movement inside its transaction calls a wallet function
  with the `*sql.Tx` rather than writing wallet or ledger tables itself.
- Use a service function when it makes a multi-write transaction, money invariant,
  idempotency rule, state transition, or audit operation easier to follow and test. The
  use case owns its transaction boundary, but file names and layer count follow the
  simplest clear implementation rather than a mandatory template.
- Keep each path from route to response short enough to follow in one sitting. A simple
  read is `route → handler → repository function → response`; a use case with
  decisions is `route → handler → service function → repository functions →
  response`.
- Identity reaches a handler as an argument, not through its constructor. `internal/auth`
  owns the guards: `auth.Handler.Player` and `auth.Handler.Admin` wrap a function of the
  guarded shape `func(w, r, account user.User)` into an `http.HandlerFunc`, writing the
  `401` or `403` themselves. The route table in `internal/app` is where a route is
  guarded, and a handler that needs the account has the guarded signature, so it cannot
  be mounted bare by mistake. A public route is a plain `http.HandlerFunc`.
- Session rows belong to the account: `internal/user` holds the `auth_sessions` SQL
  (create, find by token hash, revoke one, revoke all on suspension). `internal/auth`
  owns what is actually authentication — token generation and hashing, the cookie,
  passwords, the guards — and calls `user` for the rows.
- Repository and service are file roles, not object hierarchies. Functions normally take
  `*sql.DB` or `*sql.Tx` directly. Avoid layers that only forward, generic repositories,
  and factories that only call constructors; a narrow interface is appropriate when the
  consuming code truly supports multiple implementations or needs a controlled test seam.
- No package named for a grab-bag — `util`, `helpers`, `common`. Extract a small package
  named for one subject when doing so makes an invariant single-sourced or prevents
  duplicated behavior from drifting. Package count is evidence, not a fixed threshold;
  tiny local helpers may still be clearer when their behavior is intentionally local.
- Declare an interface in the package that consumes it and only when something is
  actually substituted. Small local interfaces for the shared `*sql.DB`/`*sql.Tx`
  method set are acceptable; centralize them only when several packages need the same
  contract.

## Formatting

- `gofmt` decides formatting. Tabs for indentation — spaces only if you must.
- No line-length limit. If a line feels too long, wrap it and indent with an extra tab.
- Opening brace on the same line as the control structure. No parentheses around `if`,
  `for`, or `switch` conditions.

## Naming

- Package names are lower case, single word — no underscores, no `mixedCaps`. The package
  name is the base name of its source directory. Err toward brevity; callers type it.
- `MixedCaps` / `mixedCaps` for multiword names, never underscores.
- Getter for an unexported field `owner` is `Owner()`, **not** `GetOwner()`. The setter,
  if one is needed, is `SetOwner()`.
- One-method interfaces take the method name plus `-er`: `Reader`, `Writer`, `Settler`.
  Don't reuse a standard name unless the signature and meaning match.

## Comments

The code carries its own meaning. Names, types, error strings, and test names do the
explaining, and a comment is not written by default — not on a package, not to narrate
a function, not to restate a signature.

- When a fact will not fit in a name, change the name. When it is a rule, make it a test
  or a lint rule so it is enforced rather than described.
- A doc comment on an exported name is written when it states something the signature
  cannot carry — an invariant it upholds, a lock it takes, an ordering a caller must
  respect. `MoveTx` saying it is the only path that changes a balance earns its line;
  `List lists` does not.
- What stays is the small set of comments the toolchain reads as instructions: a compiler
  directive, a build tag, a lint suppression, a blank import's reason for existing.
- Delete any comment that restates the code. A comment that repeats the line below it is
  one more thing to keep true.

## Control flow

- Omit the `else` when the `if` body ends in `return`, `break`, `continue`, or `goto`.
- Use the scoped form for setup plus test: `if err := file.Chmod(0664); err != nil { … }`.
- `:=` may redeclare a variable in the same scope as long as at least one variable on the
  left is new and the value is assignable.
- `switch` with no expression switches on `true` — prefer it over an `if`/`else` ladder.
  There is no automatic fallthrough; comma-separate cases instead.
- To break out of a loop from inside a `switch`, label the loop and break to the label.
- Use `range` for arrays, slices, strings, maps, and channels. `range` over a string
  yields Unicode code points; use `_` to discard the index.

## Functions and errors

- Prefer multiple return values over in-band error codes: `(n int, err error)`.
- Named result parameters are initialized to zero values; use them when they document the
  return, not to enable bare `return`s in long functions.
- `defer` runs immediately before the function returns, LIFO, with arguments evaluated at
  the `defer` statement, not at the call. Put `defer rows.Close()` and
  `defer tx.Rollback()` next to the acquire, never further down the function.
- Error strings identify their origin, prefixed by the operation or package that produced
  them. Wrap with `%w` so callers can `errors.Is` / `errors.As`.
- Library code avoids `panic`. If a problem can be masked or worked around, let things
  run. Panicking during `init` when the package truly cannot set itself up is the
  exception.
- `recover` only works when called directly from a deferred function. It belongs in the
  HTTP recovery middleware, not scattered through packages.
- Never let a raw database error, stack trace, or driver message escape past the handler.
  Log the cause and return the failure shape in `api.md`.

## Data

- `make` allocates and initializes slices, maps, and channels only, returning `T`.
  `new(T)` returns zeroed storage as `*T`.
- Prefer a useful zero value when it is natural. Types that require resources, validated
  configuration, or mandatory invariants should use a constructor and may deliberately
  reject an uninitialized zero value.
- Label composite literal fields: `Config{Port: port, Name: name}`. Missing fields take
  their zero values, and order stops mattering.
- Returning the address of a local is fine and idiomatic.
- Comma-ok for map lookups (`v, ok := m[k]`) and type assertions (`s, ok := v.(string)`).
  `delete(m, k)` is safe when the key is absent.
- Slices share their underlying array on assignment; arrays are values and copy whole.
  Prefer slices. `append` must have its result reassigned: `x = append(x, y...)`.
- Money values are `int64` minor units. Never format them with `%f`, never round-trip them
  through `float64`, and never let `encoding/json` decode them into a float. A derived
  rate or ratio — an RTP, a share of a total — is not money: compute it in integer basis
  points, in SQL where the inputs already are, and reach for `math/big` only when the
  product can actually exceed `int64`.

## Methods and interfaces

- Pointer receivers can modify the receiver; value receivers get a copy and discard
  changes. Value methods are callable on both values and pointers; pointer methods only on
  pointers (Go inserts `&` automatically when the value is addressable).
- Keep the receiver type consistent across a type's method set.
- Only interfaces embed in interfaces. Embedding a type promotes its methods, but the
  receiver stays the inner type.
- Define interfaces where they are **consumed**, not where they are implemented.

## Concurrency

- "Do not communicate by sharing memory; instead, share memory by communicating."
- Channels are allocated with `make`; unbuffered channels synchronize as well as
  communicate. Receivers block until data arrives.
- `select` with a `default` never blocks.
- Concurrency is not the tool for correctness on money or on account state. Serialization
  comes from the database — transaction boundaries and row locks — not from mutexes or
  channels in Go.

## Blank identifier

- `import _ "net/http/pprof"` for side-effect-only imports, with a comment saying why. A
  blank import's reason is one of the few comments that earns its place.
- `var _ http.Handler = (*Handler)(nil)` to assert at compile time that a type satisfies
  an interface.
