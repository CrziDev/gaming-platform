# Plinko RTP

> Preliminary, from the supplied `state.js`, `physics.js`, and `logic.js` only. The
> mathematics below is written in floating point for readability; weights, multipliers,
> and rates are stored and applied as integers (weights, hundredths, basis points).
> Every figure is theoretical. None is a verified RTP.

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
table is the target-slot expectation and not an observed return. The supplied game
contains no normalised RTP profile.

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
