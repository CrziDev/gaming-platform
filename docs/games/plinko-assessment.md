# First Game Technical Assessment — Plinko

> Carried over from the previous codebase, unedited below this note. It is a
> **preliminary** review of three supplied files, not the full source audit, and the
> game source is not in this repository yet. Its mathematics is written in floating
> point for readability; how a multiplier and a payout are actually stored and applied
> is `../game-engine-integration/SPEC.md` §9. The expected-return figures are
> theoretical, not verification under §12 of that document.

## Scope

Preliminary Milestone 1 review based on the supplied `state.js`, `physics.js`, and `logic.js` files.

### Assessment status

This assessment does not complete the per-game source-intake checklist. The complete
game directory is not in this repository, so the untouched-source commit, supplied-game
run, dependency review, and complete network trace have not happened.

For the three supplied files only, the financial flow, outcome and RTP logic, and
browser-storage dependencies have been provisionally traced. The feasibility report is
therefore partial until the complete source is reviewed and run. None of the preliminary
return calculations in this document is a verified RTP result.

## Executive Result

| Requirement | Result | Difficulty |
|---|---|---:|
| Integration feasibility | PASS | Medium |
| Source-code suitability | PASS, provisional until full project review | Low–Medium |
| Backend migration | PASS | Medium |
| RTP configuration feasibility | PASS | Medium–High |

**Recommendation:** proceed with this game as the first integration candidate.

The reviewed code is readable, modular, commented, non-obfuscated, and syntactically valid. The most important financial and outcome logic is easy to identify and can reasonably be moved to the Go backend.

---

## 1. Current Architecture

### `state.js`

Contains browser-side mutable state including:

- balance;
- bet amount;
- risk level;
- row count;
- autoplay state;
- UI state.

The current `balance` is browser-authoritative and must become display-only after integration.

### `logic.js`

Current flow:

```text
handlePlay()
    -> validates min/max bet
    -> checks local balance
    -> deducts bet locally
    -> calls Physics.dropBall()

handleWin()
    -> calculates bet × multiplier
    -> credits local balance
```

These functions are clear integration points. Bet validation, wallet deduction, payout calculation, and winning credit should move to the Go backend.

### `physics.js`

The game does not rely purely on emergent physics for outcome selection.

Current flow:

```text
getPredeterminedSlot()
    -> choose weighted target slot
    -> spawn Matter.js ball
    -> steer ball toward target slot
    -> calculate physical actualSlot at bottom
    -> read multiplier
    -> call Logic.handleWin()
```

This is favorable for backend migration because the concept of a preselected outcome already exists.

---

## 2. Probability Model

`getPredeterminedSlot()` currently uses:

```text
weight(slot) = 0.24 ^ distance_from_center
```

then normalizes the weights and samples them using browser-side `Math.random()`.

For 8 rows, the approximate target-slot probabilities are:

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

This centralized probability curve is a strong fit for configurable RTP profiles.

---

## 3. Multiplier Model

`Physics.MULTIPLIERS` stores payout values by:

```text
row count: 8–16
risk level: low / normal / high
```

Example, 8 rows / normal:

```text
[6, 3, 1.7, 1.1, 0.5, 1.1, 1.7, 3, 6]
```

Because probabilities and multipliers are both centralized, the client's requested approach of combining **small multiplier adjustments + landing-probability adjustments** is technically feasible.

---

## 4. Preliminary RTP Findings

The current game does not contain verified normalized RTP profiles such as 95%, 100%, 105%, or 110%.

If we assume the paid slot always equals the predetermined target slot, the current `0.24` probability curve gives these approximate expected returns:

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

These are **preliminary mathematical values, not final observed RTP**, because the current code ultimately pays according to the physical `actualSlot`, which can differ from the predetermined target.

For the default 8-row / normal configuration, keeping the visible multipliers unchanged and changing only the probability decay gives approximately:

```text
base ~0.309 -> ~95% expected return
base ~0.359 -> ~105% expected return
base ~0.383 -> ~110% expected return
```

This demonstrates that the client's requested range is technically reachable for this configuration without large visible multiplier changes.

For the complete rows/risk matrix, combined multiplier + weight tuning is preferable because probability-only tuning cannot produce every desired RTP under every existing multiplier table.

---

## 5. Recommended Backend Migration

### Current

```text
Browser
  -> local balance
  -> local bet validation
  -> Math.random target
  -> multiplier selection
  -> payout calculation
  -> local win credit
```

### Target

```text
HTML5 Plinko / Matter.js
        |
        | round request
        v
Go Backend
        |
        |-- authenticate player
        |-- validate wallet and wager
        |-- load active RTP profile
        |-- server-side RNG
        |-- choose authoritative target slot
        |-- determine authoritative multiplier
        |-- calculate payout
        |-- atomically record wallet debit/credit
        |-- create and settle game round
        `-- return authoritative result
        |
        v
Matter.js frontend animation
```

The frontend should animate the server-selected result, not determine the financial result itself.

---

## 6. JavaScript Changes

### `state.js`

Keep UI/game preferences such as:

- bet amount;
- risk;
- rows;
- autoplay;
- modal/animation state.

Replace authoritative balance mutation with server-returned balance state.

### `logic.js`

Replace:

```text
handlePlay() -> local debit -> dropBall()
```

with:

```text
handlePlay() -> POST round to Go -> receive result -> dropBall(serverResult)
```

Replace `handleWin()` financial calculations with display-only handling of an already-settled server result.

### `physics.js`

Keep:

- Matter.js physics;
- peg layout;
- renderer;
- animation;
- sound;
- visual slot highlighting.

Move authoritative responsibility for:

- `getPredeterminedSlot()`;
- probability weights;
- payout multipliers;
- payout selection;
- settlement;

to the backend engine/profile configuration.

---

## 7. Important Visual/Settlement Issue

Currently the code selects a `targetSlot` but later pays according to a separately calculated physical `actualSlot`.

That can create a mismatch after backend migration:

```text
Backend target: slot 2
Visual physics lands: slot 3
```

The integration should therefore make the backend result authoritative and adjust the animation/steering so the visible ball reliably terminates in the authoritative slot.

Matter.js becomes presentation of the server result rather than financial authority.

---

## 8. RTP Profiling

The current game already gives us two controls that affect RTP:

- **Landing probability / slot weights** — controls how often the ball is targeted toward each slot.
- **Multipliers** — controls how much each slot pays.

Our strategy is to use **probability adjustment first**, because this can change RTP without making the multiplier board look very different. If probability changes alone cannot reach the required target, we will combine them with **small multiplier adjustments**.

### Current Calculation — 8 Rows / Normal Risk

Current multipliers:

```text
Slot:        0    1    2    3    4    5    6    7    8
Multiplier:  6x   3x  1.7x 1.1x 0.5x 1.1x 1.7x  3x   6x
```

The current source uses:

```text
weight = 0.24 ^ distance_from_center
```

For 8 rows, this produces approximately:

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

### RTP Formula

The theoretical RTP is:

```text
RTP = Σ (slot probability × slot multiplier)
```

Using the current 8-row / normal setup:

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

This is a long-run mathematical expectation, not the result of an individual round.

### How We Get the Probability Decay

The current value `0.24` is the game's **probability decay**. It controls how quickly the chance of landing in a slot decreases as the slot gets farther from the center.

For 8 rows, the distances from the center are:

```text
4, 3, 2, 1, 0, 1, 2, 3, 4
```

Instead of fixing the decay at `0.24`, we treat it as an unknown value `d`:

```text
raw weight = d ^ distance_from_center
```

The weights are then normalized into probabilities:

```text
slot probability = slot raw weight / total raw weight
```

We then solve for the decay that makes:

```text
Σ (slot probability × multiplier) = target RTP
```

For example, with the existing 8-row / normal multipliers:

```text
Target RTP: 105%
Solved decay: approximately 0.359
```

A higher decay makes the probability curve flatter, giving the higher-paying outer slots a greater chance. A lower decay concentrates more probability near the center.

The decay is therefore **not the RTP itself**. It is one parameter used to create the probability distribution that, together with the multipliers, produces the RTP.

### RTP Strategy

For every supported **rows + risk** configuration, we will use this approach:

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

This keeps the visual multiplier changes as small as reasonably possible while making the actual game mathematics match the selected RTP.

### Example RTP Profiles — 8 Rows / Normal Risk

For this configuration, the visible multipliers can remain unchanged:

```text
[6, 3, 1.7, 1.1, 0.5, 1.1, 1.7, 3, 6]
```

Only the probability curve needs to change:

| Profile | Probability Decay | Center Slot Probability | Outer Slot Probability (each) | Theoretical RTP |
|---|---:|---:|---:|---:|
| Current | 0.240 | 61.37% | 0.20% | 82.64% |
| RTP 95% | 0.309 | 52.98% | 0.48% | 95.00% |
| RTP 100% | 0.335 | 50.14% | 0.63% | 100.00% |
| RTP 105% | 0.359 | 47.55% | 0.79% | 105.00% |
| RTP 110% | 0.383 | 45.16% | 0.97% | 110.00% |

Example 105% profile:

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

In this example, changing RTP does **not** require changing what the player sees on the multiplier board.

### Example Where Multipliers Must Also Change — 13 Rows / Low Risk

The current 13-row / low-risk multiplier table is:

```text
[3.6, 2.6, 1.9, 1.5, 1.3, 1.2, 1.1,
 1.1, 1.2, 1.3, 1.5, 1.9, 2.6, 3.6]
```

The lowest available multiplier is already **1.1x**. Therefore, probability adjustment alone cannot produce an RTP below 110%, because a weighted average of values that are all at least 1.1x cannot be lower than 1.1.

For this type of configuration, we use the combined strategy.

A simple mathematically calibrated 105% example is:

```text
Rows: 13
Risk: Low
Target RTP: 105%

Adjusted center multipliers:
1.1x -> 1.0x
1.1x -> 1.0x

Other multipliers remain unchanged.
Probability decay: ~0.212

Adjusted multipliers:
[3.6, 2.6, 1.9, 1.5, 1.3, 1.2, 1.0,
 1.0, 1.2, 1.3, 1.5, 1.9, 2.6, 3.6]

Theoretical RTP: ~105.00%
```

This example demonstrates why both controls are useful: the multiplier change is relatively small and concentrated around the center, while most of the RTP tuning still comes from the probability distribution.

For lower targets such as 95% or 100% on some high-row / low-risk configurations, larger multiplier adjustments may be mathematically unavoidable because the original minimum payouts are already above those target returns.

### What We Will Implement

For each RTP profile we will store/use a verified combination of:

```text
Rows
Risk level
Target RTP
Slot probability distribution
Multiplier table
Calculated theoretical RTP
```

The backend will use the active profile to select the authoritative slot and payout. Matter.js will remain responsible for visually animating the ball toward that server-selected result.

Before a profile is used, we will calculate its theoretical RTP and run a sufficiently large automated simulation to verify that observed results converge toward the intended target.

---

## 14. Security Findings

The current source is suitable as demo/game source but not as authoritative wallet logic because:

- balance is stored in JavaScript;
- wagers are deducted in JavaScript;
- wins are credited in JavaScript;
- `Math.random()` chooses target outcomes in the browser;
- payout tables are browser-visible/editable;
- the browser decides the final paid physical slot.

These are expected backend-migration items, not reasons to reject the game.

No `fetch`, XMLHttpRequest, WebSocket, `eval`, external HTTP URL, `localStorage`, or `sessionStorage` usage was found in the three provided core files during the preliminary scan.

All three reviewed JavaScript files pass Node.js syntax checking.

---

## 15. Final Milestone 1 Preliminary Assessment

### Integration Feasibility — PASS

The game can reasonably be integrated into the shared gaming platform.

### Source-Code Suitability — PASS / PROVISIONAL

The reviewed core source is readable, modular, commented, and non-obfuscated. Full project-directory review is still required before final sign-off.

### Backend Migration — PASS

Bet validation, outcome selection, payout calculation, wallet mutation, and round settlement can reasonably be moved to Go. Matter.js can remain on the frontend for presentation.

### RTP Configuration Feasibility — PASS

The source provides direct control over both landing probabilities and visible multipliers, making the proposed combined RTP strategy feasible.

The game does not yet contain a verified RTP-profile system; that must be engineered and mathematically validated as part of the server-side engine migration.

---

## Recommended Next Steps

1. Review the complete game directory.
2. Run the untouched game locally.
3. Confirm UI/dependency/build structure.
4. Complete the source audit.
5. Build the Go wallet and game-round infrastructure.
6. Create a minimal Plinko backend engine.
7. Move target-slot selection and payout calculation to Go.
8. Make Matter.js animate the backend-selected outcome.
9. Establish one baseline verified RTP profile.
10. Build the exact RTP calculator and high-volume simulator.
11. Build additional 95% / 100% / 105% / 110% profiles.
12. Expose only verified profile versions through the admin dashboard.
