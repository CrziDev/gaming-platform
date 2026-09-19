# Plinko RTP

> §1–§9 are the model, derived from the supplied `state.js`, `physics.js`, and
> `logic.js`; their figures are theoretical. The mathematics is written in floating
> point for readability; weights, multipliers, and rates are stored and applied as
> integers (weights, hundredths, basis points). §10 is the checked-in baseline profile
> and §11 its verification evidence.

## 1. The two controls

The game exposes two things that decide its return:

- **Slot weights** — how often the ball is targeted at each slot.
- **Multipliers** — how much each slot pays.

Probability adjustment comes first, because it changes the return without changing the
multiplier board the player sees. Small multiplier changes are added only when
probability alone cannot reach the target.

## 2. Probability model

`getPredeterminedSlot()` weights each slot by its distance from the centre:

```text
weight = d ^ distance_from_center
```

with `d = 0.24` in the supplied source, normalises the weights into probabilities, and
samples them. `d` is the **probability decay**: it controls how quickly the chance of a
slot falls off as it moves away from the centre. A higher decay flattens the curve and
gives the outer, higher-paying slots more chance; a lower decay concentrates the ball
near the centre.

For 8 rows the distances from the centre are:

```text
4, 3, 2, 1, 0, 1, 2, 3, 4
```

and at `d = 0.24` the slot probabilities are approximately:

| Slot | Probability |
|---:|---:|
| 0 | 0.204% |
| 1 | 0.848% |
| 2 | 3.535% |
| 3 | 14.729% |
| 4 | 61.369% |
| 5 | 14.729% |
| 6 | 3.535% |
| 7 | 0.848% |
| 8 | 0.204% |

The decay is not the RTP. It is one parameter of the distribution that, together with
the multipliers, produces the RTP.

## 3. Multiplier model

`Physics.MULTIPLIERS` stores a payout table per configuration:

```text
row count: 8–16
risk level: low / normal / high
```

Example, 8 rows / normal:

```text
Slot:        0    1    2    3    4    5    6    7    8
Multiplier:  6x   3x  1.7x 1.1x 0.5x 1.1x 1.7x  3x   6x
```

## 4. RTP formula

```text
RTP = Σ (slot probability × slot multiplier)
```

For 8 rows / normal at `d = 0.24`:

| Slot | Multiplier | Probability |
|---:|---:|---:|
| 0 | 6.0x | 0.204% |
| 1 | 3.0x | 0.848% |
| 2 | 1.7x | 3.535% |
| 3 | 1.1x | 14.729% |
| 4 | 0.5x | 61.369% |
| 5 | 1.1x | 14.729% |
| 6 | 1.7x | 3.535% |
| 7 | 3.0x | 0.848% |
| 8 | 6.0x | 0.204% |

```text
RTP
= 2 × [(0.002036 × 6.0)
     + (0.008484 × 3.0)
     + (0.035349 × 1.7)
     + (0.147286 × 1.1)]
  + (0.613691 × 0.5)

≈ 0.8264
≈ 82.64% theoretical RTP
```

This is a long-run expectation, not the result of any individual round.

## 5. Expected return of the supplied tables

Applying the formula at `d = 0.24` to every supplied multiplier table:

| Rows | Low | Normal | High |
|---:|---:|---:|---:|
| 8 | 90.40% | 82.64% | 63.32% |
| 9 | 96.47% | 91.96% | 77.61% |
| 10 | 96.43% | 72.04% | 51.35% |
| 11 | 104.02% | 76.20% | 57.14% |
| 12 | 105.50% | 65.87% | 42.78% |
| 13 | 113.45% | 72.03% | 41.77% |
| 14 | 115.28% | 64.47% | 26.59% |
| 15 | 114.03% | 63.08% | 28.00% |
| 16 | 116.43% | 55.79% | 31.07% |

These assume the paid slot is the predetermined target slot. The supplied code pays on
the physical `actualSlot` the ball lands in, which can differ from the target, so the
table is the target-slot expectation and not an observed return. The integrated frame
(`games/plinko/web/`) removes that gap: the ball is guided into the slot the platform
settled, and the frame pays nothing itself. The supplied game contains no normalised
RTP profile.

## 6. Solving the decay for a target

Instead of fixing the decay at `0.24`, treat it as an unknown `d`:

```text
raw weight       = d ^ distance_from_center
slot probability = slot raw weight / total raw weight
```

and solve for the `d` that makes

```text
Σ (slot probability × multiplier) = target RTP
```

With the existing 8-row / normal multipliers:

```text
Target RTP: 105%
Solved decay: approximately 0.359
```

## 7. Strategy

For every supported rows + risk configuration:

```text
Target RTP
    |
    v
Can probability adjustment alone reach the target?
    |
    +-- YES -> adjust slot weights/decay only
    |
    +-- NO  -> adjust slot weights + small multiplier changes
    |
    v
Calculate theoretical RTP
    |
    v
Run large simulation
    |
    v
Save the verified configuration as an RTP profile
```

Probability-only tuning cannot produce every target under every existing multiplier
table: a weighted average of multipliers can never fall below the table's smallest
multiplier. Where the floor is above the target, multipliers must move as well, and the
changes are kept small and concentrated at the centre of the board.

## 8. Worked profiles

### 8 rows / normal — probability only

The visible multipliers stay `[6, 3, 1.7, 1.1, 0.5, 1.1, 1.7, 3, 6]`; only the decay
changes:

| Profile | Probability Decay | Center Slot Probability | Outer Slot Probability (each) | Theoretical RTP |
|---|---:|---:|---:|---:|
| Current | 0.240 | 61.37% | 0.20% | 82.64% |
| RTP 95% | 0.309 | 52.98% | 0.48% | 95.00% |
| RTP 100% | 0.335 | 50.14% | 0.63% | 100.00% |
| RTP 105% | 0.359 | 47.55% | 0.79% | 105.00% |
| RTP 110% | 0.383 | 45.16% | 0.97% | 110.00% |

The 105% profile in full:

```text
Rows: 8
Risk: Normal
Target RTP: 105%

Probability decay: ~0.359

Probabilities (%):
[0.793, 2.207, 6.141, 17.087, 47.545,
 17.087, 6.141, 2.207, 0.793]

Multipliers:
[6, 3, 1.7, 1.1, 0.5, 1.1, 1.7, 3, 6]

Theoretical RTP: ~105.00%
```

### 13 rows / low — probability and multipliers

The supplied table is:

```text
[3.6, 2.6, 1.9, 1.5, 1.3, 1.2, 1.1,
 1.1, 1.2, 1.3, 1.5, 1.9, 2.6, 3.6]
```

Its smallest multiplier is `1.1x`, so no probability curve can bring the return below
110%. The two centre multipliers move `1.1x -> 1.0x`; everything else stays:

```text
Rows: 13
Risk: Low
Target RTP: 105%

Probability decay: ~0.212

Multipliers:
[3.6, 2.6, 1.9, 1.5, 1.3, 1.2, 1.0,
 1.0, 1.2, 1.3, 1.5, 1.9, 2.6, 3.6]

Theoretical RTP: ~105.00%
```

Most of the tuning still comes from the distribution. For lower targets on some
high-row / low-risk tables, larger multiplier changes are unavoidable because the
table's floor is already above the target.

## 9. What a profile records

Each RTP profile is a verified combination of:

```text
Rows
Risk level
Target RTP
Slot probability distribution
Multiplier table
Calculated theoretical RTP
```

The server uses the active profile to select the authoritative slot and payout. Before a
profile is used, its theoretical RTP is calculated and a sufficiently large automated
simulation confirms that observed results converge on the target.

## 10. Baseline profile v1 — `plinko/v1/9600`

The first checked-in configuration, `backend/internal/engine/plinko/profile_v1.go`,
addressed by the `engine_config_ref` `plinko/v1/9600`. Target 9600 basis points on
every board. Weights are integers, the centre slot at 1 000 000 000 and each other
slot at `decay ^ distance` of it, rounded; the decay itself is never evaluated at
runtime. `TheoreticalBasisPoints` returns exactly 9600 for all 27 boards and a test
asserts it.

The weights are derived, not typed:

```text
cd backend && go run ./cmd/gameverify solve -config plinko/v1/9600 -target 9600
```

bisects the decay per board until the integer model lands on the target, and a test
in `cmd/gameverify` asserts the checked-in weights are what it produces.

The multipliers are the supplied paytable, except where a board's floor blocks the
target (§7). From 11 rows, every low-risk board has a centre of 1.0× or 1.1×, so its
centre moves to 0.9× — the value the supplied 9- and 10-row low boards already use —
and its first ring to 1.0×. Moving only the centre would need 73–81% of balls on one
slot to reach 96% on the even boards; the ring change keeps the distribution in the
character of the supplied 0.24 decay, which puts 61% on the centre of an even board.

| Rows | Risk | Decay | Centre share | Multipliers changed | Theoretical |
|---:|---|---:|---:|---|---:|
| 8 | low | 0.3462 | 48.9% | — | 9600 |
| 8 | normal | 0.3145 | 52.4% | — | 9600 |
| 8 | high | 0.3312 | 50.5% | — | 9600 |
| 9 | low | 0.2268 | 38.7% | — | 9600 |
| 9 | normal | 0.2677 | 36.7% | — | 9600 |
| 9 | high | 0.2952 | 35.3% | — | 9600 |
| 10 | low | 0.2280 | 62.9% | — | 9600 |
| 10 | normal | 0.3696 | 46.2% | — | 9600 |
| 10 | high | 0.3612 | 47.1% | — | 9600 |
| 11 | low | 0.2815 | 35.9% | centre 1× → 0.9×, ring 1.1× → 1.0× | 9600 |
| 11 | normal | 0.3528 | 32.4% | — | 9600 |
| 11 | high | 0.3456 | 32.8% | — | 9600 |
| 12 | low | 0.2283 | 62.8% | centre 1× → 0.9×, ring 1.1× → 1.0× | 9600 |
| 12 | normal | 0.3969 | 43.3% | — | 9600 |
| 12 | high | 0.3799 | 45.0% | — | 9600 |
| 13 | low | 0.2808 | 36.0% | centre 1.1× → 0.9×, ring 1.2× → 1.0× | 9600 |
| 13 | normal | 0.3775 | 31.2% | — | 9600 |
| 13 | high | 0.3739 | 31.3% | — | 9600 |
| 14 | low | 0.2112 | 65.1% | centre 1.1× → 0.9×, ring 1.2× → 1.0× | 9600 |
| 14 | normal | 0.4025 | 42.6% | — | 9600 |
| 14 | high | 0.3984 | 43.1% | — | 9600 |
| 15 | low | 0.2615 | 36.9% | centre 1.1× → 0.9×, ring 1.2× → 1.0× | 9600 |
| 15 | normal | 0.4023 | 29.9% | — | 9600 |
| 15 | high | 0.3855 | 30.7% | — | 9600 |
| 16 | low | 0.1913 | 67.9% | centre 1.1× → 0.9×, ring 1.2× → 1.0× | 9600 |
| 16 | normal | 0.4146 | 41.4% | — | 9600 |
| 16 | high | 0.3598 | 47.1% | — | 9600 |

Centre share is the probability of the middle slot (the middle pair on an odd board).

Until the host reads the active table from the server, the frame labels those six
boards' centre buckets with the supplied values (`frontend/src/features/gameplay/
multipliers.ts`); the amount paid and shown on landing always comes from the server.

Every figure above is theoretical; §11 is the simulation evidence for it.

## 11. Verification evidence — `plinko/v1/9600`

Method: `gameverify simulate`, which plays every board through the production `Pick`
and `Payout` path with the secure `crypto/rand` source at a 100 minor-unit stake,
boards in parallel, and reports the observed return as total wins over total stakes.

```text
cd backend && go run ./cmd/gameverify simulate -config plinko/v1/9600
```

Acceptance: the theoretical return of every board equals the target exactly, and every
board's observed return is within ±100 basis points of it. `±3σ` is three standard
errors of that board's observed return at this sample size — the resolution the run
has, reported so the tolerance can be judged against it. The 16-row high board pays
500× on a 0.013% slot, which is why 10⁸ rounds per board is the default: at 10⁶ its
noise band (±286 bp) is wider than the tolerance and a run that size cannot judge it.

Run on 2026-09-19 with Go 1.26.4 on linux/amd64, engine `plinko/v1/9600`,
100 000 000 rounds per board, 2 700 000 000 in all, in 1m15s:

{table}

Observed over all boards: **9600 bp** against a 9600 bp target.

`gameverify verify -profile <id>` repeats this against a draft `rtp_profiles` row whose
`engine_config_ref` is this configuration and, only when every board passes, records
`theoretical_basis_points`, `observed_basis_points`, `verification_method`,
`sample_size`, and `verified_at` on the row and moves it to `verified`, audited as
`rtp_profile.verify` under the system actor. It is the only path to `verified`; no
HTTP route can reach it. Activation is then the ordinary admin action.

`make seed` provisions the same profile for development — `Baseline` v1 for `plinko`,
target 9600, `plinko/v1/9600`, active and the game's default — carrying the evidence
above (`backend/cmd/seed/profiles.go`) so a development database plays exactly the
configuration this section verified. That is a fixture, like the seeded administrator:
a production profile is verified by `gameverify verify` and activated by an operator.
