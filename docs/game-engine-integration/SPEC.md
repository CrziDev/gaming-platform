# Game Engine Integration and RTP

## 1. Status

**Do not implement the game-specific parts of this document until the complete source of
a purchased game is in hand and has been reviewed.**

What follows is the inspection process, the architectural boundary, the safety rules,
and the questions that must be answered before an engine is integrated. It assumes
nothing about whether a game is a slot, a card game, a crash curve, or a physics toy,
and nothing about which JavaScript framework it uses.

A stored or displayed RTP percentage is not RTP.

## 2. Goal

For each supplied game, establish whether it can be adapted so that:

- the platform authenticates the player;
- the server-side wallet is the only authority on balance;
- the wager is validated and debited server-side;
- winnings are credited exactly once;
- every round is recorded;
- outcome selection does not rest on modifiable browser JavaScript where that is
  technically reachable;
- RTP is configurable only where the source and the mathematics actually support it;
- game-specific code sits behind one platform-side boundary.

## 3. Source audit

The first game gets the deepest review; every game passes a feasibility review before
integration. Findings go in `docs/games/<slug>-assessment.md`.

### 3.1 Ownership and completeness

Original source or compiled build · readable files · minification or obfuscation · build
instructions · dependency manifests · assets · licence · external vendor services ·
hard-coded domains or API keys · source maps · WebAssembly or native modules ·
server-side components present or missing.

### 3.2 Runtime architecture

Framework · entry point · state management · asset loading · game loop · round start
event · outcome event · payout event · storage and cookie use · internal balance
representation · network calls · third-party SDKs.

### 3.3 Financial flow

The exact functions responsible for wager selection, minimum and maximum validation,
starting the wager, deducting the balance, calculating a win, crediting it, refund and
cancel behaviour, displaying the balance, and generating a round identifier.

### 3.4 Outcome and RNG flow

Where randomness comes from · which source · whether the outcome is chosen in the
browser or fetched · weights and probabilities · symbol, reel, card, or slot tables ·
bonus and jackpot logic · deterministic seeds · debug or cheat controls · whether the
outcome can be separated from the animation.

### 3.5 RTP flow

Any RTP variable · probability and weight tables · paytables · bonus and free-round
contribution · multiplier contribution · house-edge logic · whether an advertised RTP is
cosmetic or functional · whether multiple mathematical configurations already exist ·
whether RTP can change without breaking the game's rules.

## 4. Feasibility report

```text
Game:
Version / source:
Review date:

Source readability:              PASS / WARN / FAIL
External backend dependency:     YES / NO
Internal wallet identifiable:    YES / NO
Bet flow identifiable:           YES / NO
Payout flow identifiable:        YES / NO
RNG identifiable:                YES / NO
Outcome logic identifiable:      YES / NO
RTP mathematics identifiable:    YES / NO
Outcome can be server-authoritative:  YES / PARTIAL / NO
Central wallet can be integrated:     YES / PARTIAL / NO
RTP profiles can be implemented:      YES / PARTIAL / NO

Risk: LOW / MEDIUM / HIGH / UNSUPPORTED

Required modifications:
Unknowns:
Recommendation:  adapter as-is · port critical logic server-side · replace modules ·
                 request alternate source · unsupported
```

No large rewrite begins before this report exists.

## 5. The boundary

Platform services do not depend on the internals of any title.

```text
game frontend  →  game host page  →  round handler  →  engine
                                          │
                                          ├→ wallet movement
                                          └→ round record
```

The engine decides the outcome and the payout. The round handler owns the transaction
boundary and calls the wallet. **An engine never writes `wallets.balance_minor`, and
never opens its own transaction.**

An `Engine` interface is one of the few interfaces this codebase should have, because
there will genuinely be several implementations. It is declared where it is consumed —
the round package — not by the engines. Its shape is decided after the first source
review rather than guessed now; it needs at least to identify the game, validate its
configuration, report the profiles it can honour, and produce an outcome for a wager
under a named profile.

Suggested layout, adapted if the first game reveals a better split:

```text
backend/internal/engine/          the interface, the registry, the random source
backend/internal/engine/<slug>/   one package per title: rules, weights, payout, tests
games/<slug>/source/              the untouched supplied source, committed separately
games/<slug>/web/                 the integrated build
```

Each engine package stays flat — the rules, the tables, and the payout evaluation, with
no service or repository layering.

## 6. The round

```text
player presses play
    → game frontend asks the platform for a round
    → server authenticates and authorizes
    → validate game availability, wallet, currency, and wager against the game's limits
    → begin transaction
        → lock the wallet
        → debit the wager and write the ledger row
        → insert the round, snapshotting the active profile
      commit
    → engine determines the outcome under the snapshotted profile
    → begin transaction
        → settle the round, once
        → credit the payout and write the ledger row
      commit
    → return the safe result
    → the frontend animates it
```

Whether the debit and the settlement are one transaction or two is decided after the
first engine review: it depends on whether the engine can reproduce an outcome
deterministically from stored state. Two transactions need a recovery path for a round
left open by a crash; one transaction holds the wallet lock for the duration of outcome
generation. Neither is free, and the answer is a property of the engine.

## 7. The browser is not the authority

This is not acceptable as a financial path:

```text
browser: "I won 10,000"  →  server credits 10,000
```

The server determines or independently validates the payout from round state it owns. A
message from a game frame is a display hint until the server confirms settlement, which
is already the rule in `.claude/rules/frontend/react-style.md`.

## 8. Randomness

`Math.random()` does not survive the move to the server. Outcome generation in Go uses
`crypto/rand`, or whatever a certifying jurisdiction later requires.

Tests need determinism, so the engine reads randomness through a small interface with a
production implementation over `crypto/rand` and a deterministic test implementation.
Two implementations are what justify the interface. The test one must be impossible to
select at runtime — it is constructed by tests, never by configuration.

## 9. RTP

```text
RTP = Σ ( probability(outcome) × payout multiplier(outcome) )
```

`target_rtp_bps = 9600` is a label on a row. The engine configuration is what makes a
game return 96%.

Depending on the title, RTP comes from outcome weights, reel strips, symbol frequencies,
paytable values, winning probability ranges, multipliers, free rounds, bonus triggers,
or jackpot contributions. None of these change before the game's mathematics is
understood.

### Integer arithmetic

Money is `int64` minor units, and that rule does not relax inside an engine.

- A multiplier is stored and applied as an integer in hundredths. The web app already
  carries `multiplier_hundredths` in `frontend/src/api/types.ts`, so `1.7×` is `170`.
- A payout is `bet_amount_minor × multiplier_hundredths / 100` in `int64`, with the
  multiplication done first and the division once, at the end.
- Weights are integers, and an outcome is selected by comparing a random draw against a
  running total of them — no floating-point normalization at runtime.
- Floating point is allowed in the profile *calculator* and the *simulator*, which are
  offline tools that emit integer tables. It is not allowed on the path that moves money.

### The rounding rule

`bet × multiplier / 100` does not always divide evenly. A ₱10.01 wager at `170` is
1701.7 minor units, and there is no such coin — someone has to be given or denied that
fraction, on every winning round, forever.

**The platform makes it impossible instead of choosing a winner.** A wager must be a
whole currency unit — a multiple of 100 minor units for PHP and USD, or of
`10 ^ currencies.minor_digits` in general. Then `bet × multiplier` is always a multiple
of 100, the division is always exact, and no fraction is ever created:

```text
bet 1000 (₱10.00) × 170  =  170000  /100  =  1700   ₱17.00   exact
bet  500  (₱5.00) × 235  =  117500  /100  =  1175   ₱11.75   exact
```

This is enforced in two places, because a game's bet selector is a UI and a UI is input:

- `games.min_wager_minor` and `max_wager_minor` are whole units, and a third column
  `wager_step_minor` — also a whole unit — defines the increments between them;
- the round handler rejects a wager that is not `min + n × step`, before the engine is
  reached and before the wallet is touched.

**The backstop, for a future game that genuinely needs sub-unit wagers:** round the
payout to nearest, halves up, in one place shared by every engine. It is written down
here so nobody has to decide it under pressure, and it is dead code until a game with a
sub-unit step is approved — which is a product decision, not an engine one. Adding one
means the simulator in §12 must measure the realized RTP *with* the rounding applied,
because that rounding is then part of the game's mathematics.

## 10. Profiles

Prefer versioned, verified profiles over a number typed into a form:

```text
STANDARD_94_V1   9400
STANDARD_96_V1   9600
HIGH_98_V1       9800
PROMO_102_V1    10200
```

Each verified profile binds to an immutable engine configuration version and records:
game, name, version, target RTP, engine config reference, theoretical RTP, verification
method, sample size, observed RTP, verified timestamp, and status.

A verified profile is never edited in place. A change is a new version.

## 11. Activation and scheduling

A default profile, activation of a verified profile, an optional start and end,
automatic reversion to the default when a schedule ends, and an audit row for each
change. `rtp_profiles` and its single-active partial index already carry this; §11 of
the backend spec is the metadata half.

A round captures its profile at creation. Activating a different profile five seconds
later does not touch a round already open. RTP does not change mid-round.

## 12. Verification

Two levels, both required before a profile may be marked verified.

**Theoretical.** Where the outcome space can be enumerated, calculate the expected
return from the exact probability and payout model. Record target RTP, theoretical RTP,
and the model version.

**Simulation.** A headless simulator runs the production outcome path without rendering.
Record profile, sample size, total wagered, total returned, observed RTP, a confidence
interval, runtime, and engine version.

Sample size and tolerance follow from the title's volatility. There is no single
tolerance that is right for every game, and a short play session is not a verification.

## 13. Testability

The engine separates randomness, rules, payout evaluation, and state transitions from
rendering, so a test can pin the random input and assert the exact result:

```text
given random sequence X, profile P, and wager B
then the outcome is R and the payout is Y
```

## 14. Crash safety

The implementation defines behaviour for each of these before it ships:

1. wager debited, process dies before the outcome;
2. outcome generated, process dies before settlement;
3. response lost after a successful settlement, client retries;
4. two round requests arrive at once;
5. a second settlement is attempted;
6. a profile is activated while a round is open.

The guards are a unique round key, an idempotency key on every movement, legal state
transitions, single settlement, a compensating refund path for a cancelled or failed
round, and database constraints as the final protection. The backend spec §4.6 already
holds the last of these.

## 15. What reaches the browser

The game frame receives an authenticated session reference, the permitted wager
configuration, the server-returned result, and the balance to display.

It never receives database credentials, server secrets, private RNG state, engine
configuration beyond what is intentionally public, or any authority to move money.

Embedding is through the generic game host page and a versioned `postMessage` bridge
with strict origin and schema validation on both ends, per
`.claude/rules/frontend/react-style.md`.

## 16. Declaring a game unsupported

Missing critical source · results available only from an unreachable vendor backend ·
obfuscation with no maintainable source · a licence or build dependency that prevents
modification · game state that cannot be separated from the UI within scope · an RTP
claim that cannot be tied to actual probability and payout logic · a mandatory external
service that is inaccessible · modification amounting to a rebuild.

Document the reason and ask for a replacement game. Do not hide the limitation.

## 17. Per-game definition of done

- the game launches from the platform;
- the authenticated player is correctly associated with the round;
- the game uses the central wallet;
- the wager is validated server-side against the game's limits;
- the debit is atomic and recorded;
- the credit is authoritative and recorded;
- every round has a unique record;
- a duplicate request cannot pay twice;
- a refresh or a retry does not corrupt the balance;
- the displayed balance reflects server state;
- the game works on the target mobile and desktop browsers;
- source assumptions are documented;
- tests cover the round and money paths;
- a profile is marked verified only where §12 supports it.

## 18. When source arrives

In this order, and no porting before step 8:

1. commit the untouched source separately;
2. run the game exactly as supplied;
3. document the build and runtime requirements;
4. trace network requests;
5. trace wager → outcome → payout → balance;
6. locate the RNG, probability, paytable, and RTP logic;
7. locate storage and internal-wallet code;
8. write the feasibility report;
9. choose the integration approach;
10. build the proof of concept in §19;
11. only then port or recreate critical logic server-side.

## 19. Proof of concept

One end-to-end loop, on test credits:

```text
authenticated player → open the game → request a round → server validates the wallet
→ debit the wager → authoritative outcome → settle once → credit any win
→ the round and both ledger rows are visible in player and operator history
```

Once that is reliable, formalize the boundary and repeat it for the remaining titles.

## 20. First candidate

`docs/games/plinko-assessment.md` is the preliminary review of the first supplied game.
It reaches PASS on integration feasibility, source suitability, backend migration, and
RTP configurability, and it identifies the two controls that set this title's RTP: the
landing-probability decay and the multiplier table.

Three things in it need resolving as part of the work above, not before it:

- the assessment's mathematics is written in floating point; §9 is how it is stored and
  applied;
- the current source selects a target slot but pays the physically simulated slot, so
  the animation must be made to land on the authoritative result;
- the quoted expected returns are preliminary, calculated from the source's own weights,
  and are not verification under §12.
