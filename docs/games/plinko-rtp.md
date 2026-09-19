# Plinko RTP

> §1–§8 are the model, derived from the supplied `state.js`, `physics.js`, and
> `logic.js`; their figures are theoretical. The mathematics is written in floating
> point for readability; weights, multipliers, and rates are stored and applied as
> integers (weights, hundredths, basis points). §9 is the four shipped options with
> their verification evidence.

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

## 9. Shipped options

The engine ships exactly four returns — 90%, 95%, 105%, and 110% — each an immutable
configuration in `backend/internal/engine/plinko/`, addressed by the reference a settled
round records in `engine_reference` and chosen by the basis points an operator sets on
the game. A game's row holds only that number; the tables never leave the binary.

Each option carries a table for every board. Weights are integers, the centre slot at
1 000 000 000 and each other slot at `decay ^ distance` of it, rounded; the decay itself
is never evaluated at runtime. `profiles_test.go` asserts that `TheoreticalBasisPoints`
returns exactly the option's basis points on all 27 boards of every option, and that
the multipliers depart from the supplied paytable only on the boards listed below.

The weights are derived, not typed:

```text
cd backend && go run ./cmd/gameverify solve -config plinko/9500
```

bisects the decay per board until the integer model lands on the option's basis points
and prints the complete table literal, and a test in `cmd/gameverify` asserts every
checked-in option's weights are what it produces. `solve` reads the option through
`ProfileByRef`, which validates every table, so a new option is first checked in with
its multipliers and symmetric placeholder weights — all `1` — then `solve` prints the
literal that replaces them.

The multipliers are the supplied paytable except where a board's floor blocks the
target (§7): a weighted average can never fall below the smallest multiplier, so a
target at or below the floor moves the centre, and the first ring where the centre
alone would leave the distribution far more peaked than the supplied 0.24 decay
(61% on the centre of an even board). Centre share is the probability of the middle
slot, or of the middle pair on an odd board.

Evidence: `make simulate-plinko` plays every board of every option through the
production `Pick` and `Payout` path with the secure `crypto/rand` source at a 100
minor-unit stake, boards in parallel, and reports the observed return as total wins
over total stakes. A board passes when its theoretical return equals the option's basis
points exactly and its observed return is within ±100 basis points of it; `±3σ` is
three standard errors of the observed figure, the width the sample cannot resolve
below. The 16-row high board pays 500× on a slot drawn about once in 5 000 rounds, so
10⁸ rounds per board holds every board's ±3σ under 40 basis points. A shipped option
never changes; a correction is a new reference, and an option whose evidence is
withdrawn leaves the set.

### `plinko/9000` — 90%

`backend/internal/engine/plinko/profile_9000.go`. The target sits below the supplied floor on more boards than any other option. 9- and 10-row low boards have a 0.9× centre, so it moves to 0.8×; from 11 rows the low boards have a 1.0× or 1.1× centre and a 1.1× or 1.2× ring, and moving the centre alone would put 76–78% of balls on one slot of an even board, so the ring comes down a step as well. 8 of 27 boards depart from the supplied paytable.

Simulated on 2026-09-20: 100,000,000 rounds per board at 100 minor units, 27 boards in 1m9.376s; 2,700,000,000 rounds in all, observed 9000 bp against 9000 bp. Every board passed.

| Rows | Risk | Decay | Centre share | Multipliers changed | Observed | Δ target | ±3σ |
|---:|---|---:|---:|---|---:|---:|---:|
| 8 | low | 0.2319 | 62.41% | — | 9000 | +0 | 0 |
| 8 | normal | 0.2824 | 56.11% | — | 9001 | +1 | 2 |
| 8 | high | 0.3165 | 52.17% | — | 8998 | -2 | 5 |
| 9 | low | 0.2642 | 73.68% | centre 0.9× → 0.8× | 9000 | +0 | 1 |
| 9 | normal | 0.2255 | 77.50% | — | 8999 | -1 | 2 |
| 9 | high | 0.2787 | 72.25% | — | 9000 | +0 | 5 |
| 10 | low | 0.2339 | 62.11% | centre 0.9× → 0.8× | 9000 | +0 | 0 |
| 10 | normal | 0.3426 | 49.08% | — | 8997 | -3 | 3 |
| 10 | high | 0.3488 | 48.41% | — | 9003 | +3 | 7 |
| 11 | low | 0.3485 | 65.27% | ring 1.1× → 0.9×, centre 1× → 0.8× | 9000 | +0 | 1 |
| 11 | normal | 0.3250 | 67.58% | — | 9001 | +1 | 3 |
| 11 | high | 0.3333 | 66.76% | — | 9003 | +3 | 8 |
| 12 | low | 0.2957 | 54.38% | ring 1.1× → 0.9×, centre 1× → 0.8× | 8999 | -1 | 1 |
| 12 | normal | 0.3748 | 45.54% | — | 9001 | +1 | 4 |
| 12 | high | 0.3696 | 46.09% | — | 8999 | -1 | 10 |
| 13 | low | 0.3458 | 65.46% | ring 1.2× → 0.9×, centre 1.1× → 0.8× | 9000 | +0 | 1 |
| 13 | normal | 0.3529 | 64.75% | — | 9001 | +1 | 4 |
| 13 | high | 0.3645 | 63.61% | — | 8997 | -3 | 13 |
| 14 | low | 0.2781 | 56.49% | ring 1.2× → 0.9×, centre 1.1× → 0.8× | 9000 | +0 | 1 |
| 14 | normal | 0.3824 | 44.71% | — | 8999 | -1 | 4 |
| 14 | high | 0.3909 | 43.82% | — | 8996 | -4 | 17 |
| 15 | low | 0.3251 | 67.50% | ring 1.2× → 0.9×, centre 1.1× → 0.8× | 9000 | +0 | 1 |
| 15 | normal | 0.3838 | 61.65% | — | 8999 | -1 | 5 |
| 15 | high | 0.3784 | 62.19% | — | 8993 | -7 | 21 |
| 16 | low | 0.2532 | 59.60% | ring 1.2× → 0.9×, centre 1.1× → 0.8× | 9000 | +0 | 1 |
| 16 | normal | 0.3993 | 42.95% | — | 8997 | -3 | 6 |
| 16 | high | 0.3535 | 47.77% | — | 9001 | +1 | 27 |

### `plinko/9500` — 95%

`backend/internal/engine/plinko/profile_9500.go`. The six low-risk boards from 11 rows have a 1.0× or 1.1× floor. Their centre moves to 0.9× and their first ring to 1.0×, the same edit the retired 96% configuration used. 6 of 27 boards depart from the supplied paytable.

Simulated on 2026-09-20: 100,000,000 rounds per board at 100 minor units, 27 boards in 1m9.717s; 2,700,000,000 rounds in all, observed 9499 bp against 9500 bp. Every board passed.

| Rows | Risk | Decay | Centre share | Multipliers changed | Observed | Δ target | ±3σ |
|---:|---|---:|---:|---|---:|---:|---:|
| 8 | low | 0.3282 | 50.87% | — | 9500 | +0 | 1 |
| 8 | normal | 0.3093 | 52.99% | — | 9498 | -2 | 2 |
| 8 | high | 0.3288 | 50.81% | — | 9498 | -2 | 6 |
| 9 | low | 0.1970 | 80.32% | — | 9500 | +0 | 0 |
| 9 | normal | 0.2611 | 73.98% | — | 9500 | +0 | 2 |
| 9 | high | 0.2925 | 70.90% | — | 9502 | +2 | 6 |
| 10 | low | 0.1982 | 66.92% | — | 9500 | +0 | 0 |
| 10 | normal | 0.3652 | 46.66% | — | 9499 | -1 | 3 |
| 10 | high | 0.3592 | 47.30% | — | 9506 | +6 | 8 |
| 11 | low | 0.2524 | 74.78% | ring 1.1× → 1×, centre 1× → 0.9× | 9499 | -1 | 0 |
| 11 | normal | 0.3485 | 65.27% | — | 9502 | +2 | 3 |
| 11 | high | 0.3436 | 65.75% | — | 9500 | +0 | 9 |
| 12 | low | 0.1985 | 66.88% | ring 1.1× → 1×, centre 1× → 0.9× | 9500 | +0 | 0 |
| 12 | normal | 0.3934 | 43.63% | — | 9500 | +0 | 4 |
| 12 | high | 0.3783 | 45.18% | — | 9498 | -2 | 11 |
| 13 | low | 0.2524 | 74.76% | ring 1.2× → 1×, centre 1.1× → 0.9× | 9500 | +0 | 0 |
| 13 | normal | 0.3737 | 62.70% | — | 9500 | +0 | 4 |
| 13 | high | 0.3724 | 62.82% | — | 9500 | +0 | 13 |
| 14 | low | 0.1836 | 68.98% | ring 1.2× → 1×, centre 1.1× → 0.9× | 9500 | +0 | 0 |
| 14 | normal | 0.3994 | 42.96% | — | 9501 | +1 | 5 |
| 14 | high | 0.3972 | 43.18% | — | 9492 | -8 | 18 |
| 15 | low | 0.2349 | 76.51% | ring 1.2× → 1×, centre 1.1× → 0.9× | 9500 | +0 | 0 |
| 15 | normal | 0.3994 | 60.10% | — | 9497 | -3 | 6 |
| 15 | high | 0.3843 | 61.60% | — | 9495 | -5 | 22 |
| 16 | low | 0.1672 | 71.34% | ring 1.2× → 1×, centre 1.1× → 0.9× | 9500 | +0 | 0 |
| 16 | normal | 0.4122 | 41.65% | — | 9501 | +1 | 7 |
| 16 | high | 0.3588 | 47.20% | — | 9481 | -19 | 29 |

### `plinko/10500` — 105%

`backend/internal/engine/plinko/profile_10500.go`. The low-risk boards from 13 rows have a 1.1× floor, above the target. Their centre moves to 1.0×; on the single-centre 14- and 16-row boards the centre alone would put 87% of balls on one slot, so their ring moves to 1.1× as well. 4 of 27 boards depart from the supplied paytable.

Simulated on 2026-09-20: 100,000,000 rounds per board at 100 minor units, 27 boards in 1m8.298s; 2,700,000,000 rounds in all, observed 10500 bp against 10500 bp. Every board passed.

| Rows | Risk | Decay | Centre share | Multipliers changed | Observed | Δ target | ±3σ |
|---:|---|---:|---:|---|---:|---:|---:|
| 8 | low | 0.4966 | 35.05% | — | 10500 | +0 | 1 |
| 8 | normal | 0.3594 | 47.55% | — | 10500 | +0 | 3 |
| 8 | high | 0.3521 | 48.31% | — | 10502 | +2 | 6 |
| 9 | low | 0.4292 | 57.92% | — | 10500 | +0 | 1 |
| 9 | normal | 0.3212 | 68.12% | — | 10500 | +0 | 3 |
| 9 | high | 0.3179 | 68.43% | — | 10501 | +1 | 6 |
| 10 | low | 0.4219 | 40.98% | — | 10500 | +0 | 1 |
| 10 | normal | 0.4058 | 42.54% | — | 10499 | -1 | 4 |
| 10 | high | 0.3785 | 45.28% | — | 10499 | -1 | 9 |
| 11 | low | 0.2744 | 72.59% | — | 10499 | -1 | 0 |
| 11 | normal | 0.3888 | 61.33% | — | 10501 | +1 | 4 |
| 11 | high | 0.3625 | 63.89% | — | 10502 | +2 | 10 |
| 12 | low | 0.2227 | 63.58% | — | 10500 | +0 | 0 |
| 12 | normal | 0.4259 | 40.41% | — | 10500 | +0 | 5 |
| 12 | high | 0.3942 | 43.54% | — | 10499 | -1 | 12 |
| 13 | low | 0.2122 | 78.79% | centre 1.1× → 1× | 10500 | +0 | 0 |
| 13 | normal | 0.4087 | 59.24% | — | 10498 | -2 | 5 |
| 13 | high | 0.3870 | 61.38% | — | 10491 | -9 | 14 |
| 14 | low | 0.2026 | 66.30% | ring 1.2× → 1.1×, centre 1.1× → 1× | 10500 | +0 | 0 |
| 14 | normal | 0.4286 | 40.06% | — | 10500 | +0 | 6 |
| 14 | high | 0.4088 | 42.01% | — | 10504 | +4 | 20 |
| 15 | low | 0.1985 | 80.15% | centre 1.1× → 1× | 10500 | +0 | 0 |
| 15 | normal | 0.4263 | 57.43% | — | 10499 | -1 | 7 |
| 15 | high | 0.3953 | 60.51% | — | 10481 | -19 | 23 |
| 16 | low | 0.1809 | 69.36% | ring 1.2× → 1.1×, centre 1.1× → 1× | 10500 | +0 | 0 |
| 16 | normal | 0.4347 | 39.43% | — | 10502 | +2 | 8 |
| 16 | high | 0.3684 | 46.16% | — | 10515 | +15 | 31 |

### `plinko/11000` — 110%

`backend/internal/engine/plinko/profile_11000.go`. The low-risk boards from 13 rows have a 1.1× floor, equal to the target, which no positive-weight distribution can reach. Their centre moves to 1.0×. 4 of 27 boards depart from the supplied paytable.

Simulated on 2026-09-20: 100,000,000 rounds per board at 100 minor units, 27 boards in 1m9.542s; 2,700,000,000 rounds in all, observed 11000 bp against 11000 bp. Every board passed.

| Rows | Risk | Decay | Centre share | Multipliers changed | Observed | Δ target | ±3σ |
|---:|---|---:|---:|---|---:|---:|---:|
| 8 | low | 0.5750 | 29.33% | — | 11000 | +0 | 1 |
| 8 | normal | 0.3829 | 45.16% | — | 11001 | +1 | 3 |
| 8 | high | 0.3632 | 47.15% | — | 11001 | +1 | 7 |
| 9 | low | 0.5161 | 50.23% | — | 11000 | +0 | 1 |
| 9 | normal | 0.3474 | 65.60% | — | 11000 | +0 | 3 |
| 9 | high | 0.3296 | 67.30% | — | 10996 | -4 | 7 |
| 10 | low | 0.5000 | 34.04% | — | 11000 | +0 | 1 |
| 10 | normal | 0.4242 | 40.77% | — | 11000 | +0 | 4 |
| 10 | high | 0.3876 | 44.35% | — | 10997 | -3 | 9 |
| 11 | low | 0.4023 | 60.02% | — | 11000 | +0 | 1 |
| 11 | normal | 0.4065 | 59.62% | — | 11000 | +0 | 4 |
| 11 | high | 0.3713 | 63.04% | — | 11005 | +5 | 10 |
| 12 | low | 0.3623 | 46.87% | — | 11000 | +0 | 1 |
| 12 | normal | 0.4404 | 39.02% | — | 11001 | +1 | 5 |
| 12 | high | 0.4016 | 42.79% | — | 11002 | +2 | 13 |
| 13 | low | 0.3484 | 65.20% | centre 1.1× → 1× | 11000 | +0 | 1 |
| 13 | normal | 0.4239 | 57.75% | — | 11003 | +3 | 5 |
| 13 | high | 0.3937 | 60.72% | — | 11002 | +2 | 15 |
| 14 | low | 0.2610 | 58.61% | centre 1.1× → 1× | 11000 | +0 | 0 |
| 14 | normal | 0.4415 | 38.82% | — | 10998 | -2 | 6 |
| 14 | high | 0.4142 | 41.47% | — | 10987 | -13 | 20 |
| 15 | low | 0.3235 | 67.66% | centre 1.1× → 1× | 11001 | +1 | 1 |
| 15 | normal | 0.4381 | 56.27% | — | 10999 | -1 | 7 |
| 15 | high | 0.4004 | 60.00% | — | 11000 | +0 | 24 |
| 16 | low | 0.2339 | 62.09% | centre 1.1× → 1× | 11000 | +0 | 0 |
| 16 | normal | 0.4447 | 38.47% | — | 11001 | +1 | 9 |
| 16 | high | 0.3729 | 45.68% | — | 11001 | +1 | 33 |
