# Plan Stability Policy

The Plan Stability Policy is a pure recommendation layer. It compares a fresh
candidate with the projected remainder of an accepted strategy and returns
`INITIAL_ACCEPT`, `CONTINUE`, `REPLACE`, `BYPASS`, or `NO_DECISION` with
structured diagnostics. It does not persist state, mutate a Session, select a
planner candidate, emit telemetry, or control an actuator.

## Ownership and priority

Runtime and canonical decision code remain responsible for deriving lifecycle,
disconnect, Manual Override, and latest-safe-start state. The policy consumes
only derived flags (`stabilityAllowed`, `manualOverrideActive`,
`safetyRequiresCandidate`, `lifecycleBypassActive`, and
`disconnectSafetyActive`). A higher-priority flag returns `BYPASS`; the caller
must apply that higher-priority behavior. The policy does not reproduce its
business logic.

An absent accepted strategy plus a feasible candidate returns `INITIAL_ACCEPT`.
Equivalent fresh projections return `CONTINUE` without economics or thresholds.
An unavailable or infeasible continuation may be replaced by a feasible
candidate. An infeasible candidate never replaces a feasible continuation.
Cases where neither plan is usable return `NO_DECISION` rather than pretending
that either strategy is valid.

## Thresholds and physical transitions

Threshold configuration is injected by the caller and has no production
defaults. Separate `waiting` and `charging` profiles contain optional EUR and
percentage thresholds. At least one threshold per profile is required. `ANY`
accepts a replacement when either configured criterion is met; `ALL` requires
every configured criterion. Savings must first be strictly positive, so zero or
negative savings never trigger replacement. An unavailable configured metric,
including an undefined percentage for a zero-cost continuation, makes the
comparison unavailable instead of treating it as zero.

The `charging` profile is selected from the already-derived
`activelyCharging` context, allowing a caller to inject stronger synthetic
thresholds without embedding policy values here. Diagnostics independently
expose `currentShouldCharge`, `candidateShouldCharge`, the four possible
ON/OFF transitions, and `disruptiveTransition` for ON-to-OFF. These fields are
observability and policy inputs only; they are not actuator instructions.

When economics are unavailable and both strategies remain feasible, the policy
conservatively returns `CONTINUE` for both waiting and charging. In particular,
an inability to prove a benefit cannot cause a disruptive OFF transition.

## Economics terminology

Replacement economics compare the same fresh remaining charging requirement
between the accepted continuation and candidate. They are distinct from the
planner's existing dynamic `estimatedSavingsEur` and `estimatedSavingsPct`,
whose semantics are unchanged.

`evaluatePlanStability()` is the pure composition entry point for current shadow
evaluation. It invokes Phase 1 projection, equivalence, and replacement-cost
primitives, then applies `decidePlanStability()` without external side effects.
