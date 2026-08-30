# RFC-001: Planner Stability

Status: Draft

---

## Problem

The planner currently selects the charging plan with the lowest total price.

This works correctly from a mathematical perspective, but can produce undesirable behavior.

Example:

Continuous plan

- 1 charging window
- Total price: €0.300

Multi-window plan

- 3 charging windows
- Total price: €0.299

Although the multi-window plan is technically cheaper, the savings are negligible while the charging schedule becomes significantly more fragmented.

In the future this may also lead to unnecessary plan changes after Tibber price updates.

---

## Goals

The planner should optimize not only for price but also for stability and user experience.

Priority should be:

1. Complete charging before departure.
2. Minimize charging cost.
3. Prefer simpler charging schedules whenever the savings are insignificant.
4. Avoid unnecessary replanning.

---

## Candidate Strategies

### Strategy A — Absolute Threshold

Example:

If the price difference is less than €0.01,
prefer the continuous plan.

Pros

- Very simple.

Cons

- Depends on electricity prices.

---

### Strategy B — Percentage Threshold

Example:

If savings are less than 1%,
prefer the continuous plan.

Pros

- Independent of absolute price level.

Cons

- Still arbitrary.

---

### Strategy C — Window Penalty

Every additional charging window adds a virtual cost.

Example:

```
effectivePrice =
totalPrice +
(windowCount - 1) × penalty
```

Pros

- Natural behaviour.
- Easily configurable.
- Planner still optimizes automatically.

Cons

- Penalty must be calibrated.

---

### Strategy D — Learning Based

The planner learns from historical charging sessions and estimates whether splitting the charging session is worthwhile.

Pros

- Smartest long-term solution.

Cons

- Requires historical data.

---

## Initial Decision

No implementation yet.

Planner remains price-only until enough real charging data has been collected.

This RFC defines the direction for future development.

---

## Future Work

- Learning Engine
- Replanning Stability
- Adaptive Planner
- User Preferences
- Configurable aggressiveness