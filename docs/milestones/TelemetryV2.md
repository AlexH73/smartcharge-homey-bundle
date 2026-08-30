# Telemetry v2 Milestone

Status: Planned
Scope: Future telemetry model improvements after Events/Sessions/Statistics/Dashboard v1
Runtime impact: none until explicitly implemented

Telemetry v2 is the next schema milestone for SmartCharge telemetry. It should
not change the current v1 implementation immediately. Its purpose is to collect
the future fields and migration rules that are valuable, but not yet mature
enough to include in the frozen v1 contract.

## Purpose

Telemetry v2 should make SmartCharge better at explaining session outcomes,
dashboard quality, and future learning behavior.

The v2 milestone should focus on:

- clearer separation between decision-time reasons and completion-time reasons;
- richer session timing and duration analytics;
- real-world charging quality and data quality scoring;
- weather and battery-temperature context;
- actual energy and cost tracking;
- Learning Engine inputs and outcomes.

## Why This Is Postponed

Telemetry v1 is frozen for now. It provides the production baseline:

- Events as the raw append-only log;
- Sessions as the materialized session view;
- Statistics as the dashboard abstraction layer;
- Dashboard as the public presentation layer.

The v2 items are intentionally postponed because they need real production data
collected over time. Adding them too early would create unstable fields,
unclear formulas, and migration churn before the system has enough sessions to
validate the model.

Telemetry v2 should be based on observed production behavior, not only on
expected behavior from simulator scenarios.

## Checklist

- [ ] Split `reason` into `decisionReason` and `completionReason`.
- [ ] Preserve `decisionReasonCode` and `completionReasonCode` in Sessions.
- [ ] Add `completedReason` and `resetReason`.
- [ ] Add `durationMinutes` and `chargeDurationMinutes`.
- [ ] Add session quality score.
- [ ] Add weather fields.
- [ ] Add battery temperature fields.
- [ ] Add actual energy fields.
- [ ] Add actual cost fields.
- [ ] Add learning metrics.
- [ ] Add data quality markers.

## Proposed Fields

### Reasons

`decisionReason` should describe why the engine made a charge/no-charge
decision at a specific point in time.

`completionReason` should describe why a session ended or was reset.

`decisionReasonCode` and `completionReasonCode` should be stable
machine-readable values used by dashboards, analytics, and future translations.

`completedReason` and `resetReason` should describe final session state. They
should not overwrite decision-time reasons.

### Timing

`durationMinutes` should measure the whole session from connection to reset or
disconnect.

`chargeDurationMinutes` should measure only active charging time, ideally based
on plug power or another reliable charging signal.

These fields should be derived from production data after the thresholds for
"active charging" are validated.

### Quality

Session quality score should indicate whether a session is complete and useful
for dashboard and learning calculations.

Data quality markers should explain why a session is incomplete, excluded, or
trusted with lower confidence.

Examples:

- missing start event;
- missing stop event;
- missing price data;
- manual override;
- charger disconnected early;
- stale vehicle battery data;
- incomplete power telemetry.

### Environment

Weather fields should be added only when a reliable source exists and the data
can be stored without exposing private location details.

Battery temperature fields should be added only if the vehicle integration can
provide them consistently.

Environment fields should support learning and explanation, not public tracking
of private movement patterns.

### Actual Energy And Cost

Actual energy and actual cost should be added when SmartCharge can measure or
derive delivered energy with acceptable confidence.

Until then, v1 estimated price and estimated savings fields remain the public
dashboard baseline.

### Learning Metrics

Learning metrics should be added after enough production sessions exist to make
them meaningful.

Candidate metrics:

- prediction error minutes;
- prediction error percent;
- learned charge factor;
- confidence score;
- sample size;
- excluded sample reason;
- model version.

## Acceptance Criteria

Telemetry v2 is ready to implement when:

- v1 telemetry has been stable in production for multiple real charging
  sessions;
- real Events and Sessions data show which fields are actually needed;
- each new field has a clear owner, type, calculation rule, and privacy level;
- v2 fields can be appended without breaking existing v1 consumers;
- simulator fixtures cover the new payload shape;
- existing dashboards can continue reading v1 Statistics during migration;
- private data remains private and public dashboards only expose aggregates.

## Migration Notes

Telemetry v2 must be additive by default.

Migration rules:

- Do not reorder existing v1 columns in production sheets.
- Append v2 columns to existing private sheets, or create a new v2 sheet and
  migrate intentionally.
- Keep v1 Statistics available until the Dashboard is migrated.
- Preserve raw Events so Sessions can be rebuilt.
- Backfill v2 Session fields only when the derivation is deterministic.
- Mark unknown historical values as blank or `null`, not guessed.
- Document every formula change that affects public dashboard values.

If v2 requires incompatible dashboard formulas, create a new dashboard version
or a new public workbook instead of modifying the public view in place.

## Out of Scope

Telemetry v2 intentionally does not include:

- charging algorithm changes;
- planner improvements;
- dashboard redesign;
- simulator refactoring;
- Homey flow changes.

Those topics belong to separate milestones.
