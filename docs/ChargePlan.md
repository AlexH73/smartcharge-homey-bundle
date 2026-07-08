# ChargePlan RFC

Status: Living RFC
Scope: Architecture and data contract only
Target feature: multi-window charging

This document defines the `PlanningResult`, `ChargePlan`, and `ChargeWindow`
models for SmartCharge. It is intended to remain the shared contract between
the planner, decision engine, logger, simulator, dashboard, and future
analytics.

The intended architecture is:

```text
Decision Engine
  -> PlanningResult
       -> Inputs
       -> Environment
       -> ChargePlan
            -> ChargeWindow[]
```

`ChargePlan` is the result of an optimization strategy. It is not only a list of
charging windows. Today the strategy may be continuous or multi-window price
optimization; later it may include battery preservation, CO2 optimization,
solar-aware charging, or another explainable strategy.

Implementation note: the first production implementation of `ChargePlan`,
`ChargeWindow`, and the multi-window planner now exists. Parts of this RFC that
are not implemented yet remain design guidance for decision states, planner
stability, dashboard history, and analytics.

## 1. Problem Statement

The original planner selected one cheapest continuous charging window before
the target departure time. This is simple and stable, but it is not sufficient
for cases where the cheapest usable price slots are not adjacent.

Example:

```text
20:00 cheap
21:00 expensive
23:00 cheap
02:00 cheap
```

If the car needs three charging slots, a continuous-only planner must pick one
continuous three-hour block. That can be more expensive than using three
separated cheap slots. Multi-window charging allows SmartCharge to charge only
during selected cheap windows while still meeting the target departure deadline.

The key challenge is not only finding cheaper slots. The planner must also
remain predictable: it should avoid unnecessary plug toggling, avoid excessive
replanning after small price changes, preserve current logger fields, and keep
the simulator useful before production behavior changes.

## 2. Goals

- Support multiple charging windows in one charging session.
- Minimize total charging cost before the target departure time.
- Respect the target departure time as a hard deadline.
- Minimize the number of charging windows when cost is similar.
- Keep planner output stable across repeated decision runs.
- Preserve backward compatibility with existing production fields.
- Keep `SessionId` as the stable session identifier.
- Use `SessionId` plus `PlanRevision` to identify plan revisions.
- Separate the decision result from the selected charging plan.
- Model the selected plan as the result of an optimization strategy, not only as
  a charging schedule.
- Keep the data model usable by the logger, simulator, dashboard, and future
  analytics.

## 3. Non Goals

The multi-window charging feature does not include:

- machine learning;
- weather prediction;
- solar production optimization;
- vehicle-to-grid behavior;
- adaptive charging power;
- battery health optimization;
- real-time charger power negotiation;
- automatic tariff provider selection;
- dashboard implementation;
- Google Sheets schema migration implementation;
- planner implementation in this RFC;
- decision engine implementation in this RFC.

## 4. PlanningResult

`PlanningResult` is the decision engine output model. It wraps the selected
`ChargePlan`, the immediate action decision, and the explanation for that
decision.

This extra level is important because the decision engine may use more inputs
than the planner alone:

```text
Battery
  -> Planner
  -> Deadline
  -> Prices
  -> Manual Override
  -> Future Weather
  -> Decision
```

`ChargePlan` remains the selected optimization result. `PlanningResult` is the
complete answer to "what should SmartCharge do now?"

### Properties

`sessionId`  
Stable session identifier. This should match the current production `sessionId`.

`decisionAt`  
Timestamp for the decision run in production local format.

`shouldChargeNow`  
Immediate action decision for the plug.

`decisionState`  
High-level decision state, such as `waiting`, `charging`, `fallback`,
`completed`, or `expired`.

`reason`  
Human-readable explanation suitable for logs and dashboard views.

`selectedPlan`  
The selected `ChargePlan`, when a plan exists.

`inputs`  
Optional compact summary of decision inputs, such as battery, current price,
target departure, and manual override state.

`environment`  
Optional normalized environment snapshot used by the decision engine. This
keeps external system state separate from planner output.

### Inputs And Environment

`inputs` should describe the decision request in business terms:

- battery state;
- target departure;
- required charging time;
- manual override state;
- current session state.

`environment` should describe the external systems that supplied context:

- Tibber price data;
- Homey Logic state;
- Mercedes vehicle state;
- plug state;
- future weather data;
- future solar data.

The architecture should remain:

```text
Inputs
  -> Environment
  -> Planner
  -> ChargePlan
  -> PlanningResult
```

### Example

```json
{
  "sessionId": "2026-07-08 18:00:00",
  "decisionAt": "2026-07-08 18:15:00",
  "shouldChargeNow": false,
  "decisionState": "waiting",
  "reason": "Waiting for selected charging windows",
  "selectedPlan": {
    "metadata": {
      "sessionId": "2026-07-08 18:00:00",
      "planRevision": 1,
      "plannerMode": "multi-window"
    }
  },
  "inputs": {
    "battery": 20,
    "currentPrice": 0.58,
    "targetDeparture": "2026-07-09 07:30:00",
    "manualOverride": false
  },
  "environment": {
    "tibber": {
      "priceCount": 48,
      "hasTomorrowPrices": true
    },
    "homey": {
      "logicAvailable": true
    },
    "vehicle": {
      "source": "Mercedes",
      "battery": 20
    },
    "plug": {
      "on": false,
      "power": 0
    }
  }
}
```

## 5. ChargeWindow

`ChargeWindow` represents one planned charging interval inside a `ChargePlan`.
One plan may contain zero, one, or many windows.

### Properties

`windowIndex`  
Zero-based window index inside the plan. This is stable within one
`SessionId` + `PlanRevision`, but it is not a global identifier.

`priority`  
Optional priority value for this window. Lower numbers represent higher
priority. The field may be `null` while windows are ordered purely by time.
This leaves room for future strategies where windows are sorted or explained by
importance, not only chronological order.

`plannedStart`  
Local production timestamp for the planned window start in
`YYYY-MM-DD HH:mm:ss` format.

`plannedEnd`  
Local production timestamp for the planned window end in
`YYYY-MM-DD HH:mm:ss` format.

`durationMinutes`  
Total planned charging duration for this window.

`energyTarget`  
Estimated energy target for this window, in kWh. This can be `null` until the
system has enough information to estimate energy reliably. The field exists so
future energy analytics, forecasting, and efficiency calculations do not require
a breaking model change.

`slotCount`  
Number of hourly price slots included in this window.

`averagePrice`  
Average price for the slots in this window, in EUR/kWh.

`totalPrice`  
Sum of selected slot prices for this window. This is not the final energy cost;
it is the planner price score for the selected hourly slots.

`startsNow`  
Whether the current decision time is inside this window.

`slots`  
Optional detailed slot list for simulator, dashboard, and analytics. Logger
payloads may use a compact JSON/text representation instead of expanding every
slot into separate spreadsheet columns.

### Example

```json
{
  "windowIndex": 0,
  "priority": 1,
  "plannedStart": "2026-07-08 02:00:00",
  "plannedEnd": "2026-07-08 04:00:00",
  "durationMinutes": 120,
  "energyTarget": 8.5,
  "slotCount": 2,
  "averagePrice": 0.155,
  "totalPrice": 0.31,
  "startsNow": false,
  "slots": [
    {
      "start": "2026-07-08 02:00:00",
      "end": "2026-07-08 03:00:00",
      "price": 0.16
    },
    {
      "start": "2026-07-08 03:00:00",
      "end": "2026-07-08 04:00:00",
      "price": 0.15
    }
  ]
}
```

## 6. ChargePlan

`ChargePlan` is the selected optimization strategy result for one decision run.
It must expose both the multi-window model and the existing production fields.

A `ChargePlan` answers "what charging strategy should this session follow?"
It does not by itself answer every decision-engine question, such as manual
override handling or whether a completed session should be reset.

### Identity

SmartCharge should not introduce a separate plan UUID.

Plan identity is:

```text
SessionId + PlanRevision
```

Example:

```text
SessionId: 2026-07-08 18:00:00
PlanRevision: 0
PlanRevision: 1
PlanRevision: 2
```

`SessionId` remains the stable session identifier and should continue to use the
session connection timestamp. `PlanRevision` starts at `0` for the first
selected plan in a session and increments only when the selected plan changes in
a meaningful way.

### Metadata

`sessionId`  
Stable session identifier. This should match the current production
`sessionId`.

`planRevision`  
Integer revision number for the selected plan inside the session.

`plannerMode`  
Planner mode that produced the plan. See [Planner Modes](#7-planner-modes).

`optimizationStrategy`  
Name of the strategy used to produce the plan. Examples: `lowest-cost`,
`lowest-cost-fewer-windows`, `deadline-fallback`, or future strategy names such
as `battery-preservation` or `co2-optimized`.

`createdAt`  
Decision time when this plan revision was created.

`engineVersion`  
SmartCharge engine version that produced the plan.

`connectedAt`  
Session connection timestamp in production local format.

`targetDeparture`  
Target departure timestamp in production local format.

`reason`  
Human-readable reason explaining the selected decision.

### Compatibility Fields

These fields must remain available because current production logging,
simulator output, and operator workflows depend on them:

`plannedStart`  
Compatibility start timestamp. For multi-window plans this should be the first
window start.

`plannedEnd`  
Compatibility end timestamp. For multi-window plans this should be the last
window end.

`averagePrice`  
Compatibility average price for the selected plan.

`totalPrice`  
Compatibility total selected slot price for the selected plan.

`chargeSlots`  
Total required charging slots.

`shouldChargeNow`  
Whether the current decision should turn on the plug.

### Statistics

`chargeMinutes`  
Total required charging minutes.

`estimatedFinish`  
Estimated timestamp when the required charging amount will be completed if the
selected plan is followed. For continuous plans this is usually `plannedEnd`.
For multi-window plans this is usually the end of the last selected window.

`windowCount`  
Number of selected charging windows.

`totalSlotCount`  
Total number of selected price slots.

`latestSafeStart`  
Latest timestamp at which charging must start to satisfy the target departure
with the required charging duration.

`continuousPlanPrice`  
Price score for the best continuous plan, when available.

`multiWindowPlanPrice`  
Price score for the best multi-window plan, when available.

`selectedPlanSavings`  
Difference between the comparable continuous plan and the selected multi-window
plan. Positive values mean the selected plan is cheaper.

`planChanged`  
Whether this decision created a new plan revision compared with the previous
selected plan for the same session.

### Windows

`windows`  
Ordered array of `ChargeWindow` objects. Adjacent selected slots should be
merged into the same `ChargeWindow`.

### Example

```json
{
  "metadata": {
    "sessionId": "2026-07-08 18:00:00",
    "planRevision": 1,
    "plannerMode": "multi-window",
    "optimizationStrategy": "lowest-cost-fewer-windows",
    "createdAt": "2026-07-08 18:15:00",
    "engineVersion": "0.3.42+build.42",
    "connectedAt": "2026-07-08 18:00:00",
    "targetDeparture": "2026-07-09 07:30:00",
    "reason": "Waiting for selected charging windows"
  },
  "compatibility": {
    "plannedStart": "2026-07-08 20:00:00",
    "plannedEnd": "2026-07-09 03:00:00",
    "averagePrice": 0.09,
    "totalPrice": 0.27,
    "chargeSlots": 3,
    "shouldChargeNow": false
  },
  "statistics": {
    "chargeMinutes": 180,
    "estimatedFinish": "2026-07-09 03:00:00",
    "windowCount": 3,
    "totalSlotCount": 3,
    "latestSafeStart": "2026-07-09 04:30:00",
    "continuousPlanPrice": 1.8,
    "multiWindowPlanPrice": 0.27,
    "selectedPlanSavings": 1.53,
    "planChanged": true
  },
  "windows": [
    {
      "windowIndex": 0,
      "priority": 1,
      "plannedStart": "2026-07-08 20:00:00",
      "plannedEnd": "2026-07-08 21:00:00",
      "durationMinutes": 60,
      "energyTarget": 2.8,
      "slotCount": 1,
      "averagePrice": 0.1,
      "totalPrice": 0.1,
      "startsNow": false,
      "slots": [
        {
          "start": "2026-07-08 20:00:00",
          "end": "2026-07-08 21:00:00",
          "price": 0.1
        }
      ]
    },
    {
      "windowIndex": 1,
      "priority": 2,
      "plannedStart": "2026-07-08 23:00:00",
      "plannedEnd": "2026-07-09 00:00:00",
      "durationMinutes": 60,
      "energyTarget": 2.8,
      "slotCount": 1,
      "averagePrice": 0.09,
      "totalPrice": 0.09,
      "startsNow": false,
      "slots": [
        {
          "start": "2026-07-08 23:00:00",
          "end": "2026-07-09 00:00:00",
          "price": 0.09
        }
      ]
    },
    {
      "windowIndex": 2,
      "priority": 3,
      "plannedStart": "2026-07-09 02:00:00",
      "plannedEnd": "2026-07-09 03:00:00",
      "durationMinutes": 60,
      "energyTarget": 2.9,
      "slotCount": 1,
      "averagePrice": 0.08,
      "totalPrice": 0.08,
      "startsNow": false,
      "slots": [
        {
          "start": "2026-07-09 02:00:00",
          "end": "2026-07-09 03:00:00",
          "price": 0.08
        }
      ]
    }
  ]
}
```

## 7. Planner Modes

`plannerMode` describes how the selected plan was built. It must not describe
the current system state. For example, `waiting` is a `decisionState`, not a
`plannerMode`.

`continuous`  
The selected plan is one continuous charging block. This matches current
production behavior.

`multi-window`  
The selected plan contains multiple charging windows. Adjacent selected slots
must be merged into one window.

`fallback`  
The planner could not produce a suitable plan, or the latest safe start has
been reached. Charging should start immediately when required by the deadline.

Future planner modes should describe optimization strategy, not lifecycle state.
For example, manual override may influence the decision engine, but it should
not force `manual` to become a planner mode unless it represents a planner
strategy.

## 8. Decision States

`decisionState` describes what the system is doing now. It is separate from
`plannerMode`.

`waiting`  
A valid plan exists, but the current decision time is outside all selected
charging windows and the latest safe start has not been reached.

`charging`  
SmartCharge should charge now because the current time is inside a selected
window or safety fallback requires immediate charging.

`completed`  
No further charging is required because the battery is full or the session has
already completed.

`expired`  
The target departure is already in the past and the session should not continue
normal planning.

`fallback`  
The system is using safety behavior because the optimized plan cannot safely
meet the deadline or because the latest safe start has been reached.

Potential future states:

- `price-unavailable` for missing or unusable price data;
- `locked` for a previously selected plan that should not be replanned;
- `manual-override` when operator input overrides normal automated behavior.

## 9. Decision Strategy

The planner should evaluate both a continuous plan and a multi-window plan
before selecting the final `ChargePlan`.

The planner should think in terms of strategy:

```text
Goal
  -> Optimization
  -> Plan
```

Charging windows are one representation of the selected strategy. They should
not be the only abstraction the planner can produce.

First, the planner should calculate the same continuous plan that production
uses today. This preserves the current baseline and provides a comparison point
for logging and stability decisions.

Second, the planner should calculate the cheapest usable non-adjacent slots
before target departure. Selected adjacent slots should be merged into one
`ChargeWindow`; separated slots should become separate windows.

The planner should then compare the candidates:

- deadline safety has priority over price;
- if the deadline cannot be satisfied by prices, fallback wins;
- if continuous and multi-window plans have the same or near-same cost, prefer
  fewer windows;
- if the multi-window plan is materially cheaper, select it;
- if the selected multi-window plan would cause excessive plug toggling for a
  very small saving, prefer the simpler stable plan;
- if the current time is inside a selected window, `shouldChargeNow` should be
  true;
- if the current time is outside all selected windows and the latest safe start
  has not been reached, `shouldChargeNow` should be false, `decisionState`
  should be `waiting`, and `plannerMode` should remain the mode that produced
  the selected plan.

The exact thresholds belong to implementation, not this RFC. The data model
should support those decisions without forcing a specific algorithm.

## 10. Stability Strategy

Multi-window planning can become noisy if every small price update creates a new
plan. SmartCharge should avoid unnecessary replanning.

`minimumSavings`  
A new plan should only replace the current plan if the expected saving is above
a configured threshold. This protects against minor price changes.

`planRevision`  
The first selected plan in a session uses revision `0`. A revision increments
only when the selected plan changes materially, such as different windows,
different mode, or a meaningful price improvement.

`planChanged`  
Logger and simulator output should expose whether a decision changed the plan.

`maximumReplansPerSession`  
The system should support a maximum number of meaningful plan revisions per
session. A practical default might be five revisions, but the exact value
belongs to implementation and Homey testing.

`minimumReplanInterval`  
The system should support a minimum interval between plan revisions, for
example no more than one selected-plan change per hour unless safety or deadline
logic requires it.

`plan locking`  
When charging is close to starting, inside a selected window, or already
charging, the planner should become more conservative. Replanning should not
interrupt active charging unless the deadline or safety logic requires it.

`deadline protection`  
As the target departure approaches, the planner should prioritize completion
over savings. Once the latest safe start has been reached, fallback behavior
must be allowed to override price optimization.

`window count optimization`  
The planner should avoid adding extra windows for tiny savings. A cheaper plan
with many short windows may be worse operationally than a slightly more
expensive plan with one or two windows.

These rules intentionally prefer a stable, explainable plan over an algorithm
that is theoretically optimal but operationally nervous.

## 11. Logging

Existing logger fields must remain available:

- `plannedStart`
- `plannedEnd`
- `averagePrice`
- `totalPrice`
- `chargeSlots`
- `shouldChargeNow`

Future logging may add:

`plannerMode`  
Selected planner mode, such as `continuous`, `multi-window`, or `fallback`.

`windowCount`  
Number of selected charging windows.

`chargeWindowsJson`  
Compact JSON representation of selected windows.

`chargeWindowsText`  
Human-readable summary, for example:
`20:00-21:00, 23:00-00:00, 02:00-03:00`.

`planRevision`  
Revision number inside the current session.

`latestSafeStart`  
Latest safe start timestamp used by fallback logic.

`continuousPlanPrice`  
Price score for the best continuous candidate.

`multiWindowPlanPrice`  
Price score for the best multi-window candidate.

`selectedPlanSavings`  
Savings of the selected plan compared with the continuous baseline.

`planChanged`  
Whether this decision changed the selected plan revision.

`estimatedFinish`  
Estimated completion timestamp for the selected plan.

`optimizationStrategy`  
Strategy name used to produce the selected plan.

`decisionDurationMs`  
How long the decision engine took to produce the `PlanningResult`. This may be
only a few milliseconds today, but it will become useful as planner strategies,
dashboard analytics, and future integrations grow.

Logger implementation and spreadsheet schema changes are intentionally out of
scope for this RFC.

## 12. Dashboard

A future dashboard could visualize `ChargePlan` data as:

- a timeline from connection time to target departure;
- a session lifecycle timeline:
  `Connection -> Planning -> Revision 1 -> Revision 2 -> Charging -> Completed`;
- selected charging windows overlaid on hourly prices;
- continuous candidate versus selected multi-window plan;
- current decision state: waiting, charging, fallback, completed, expired;
- plan revision history for one session;
- planner history view:
  `Revision 0 -> Revision 1 -> Revision 2`;
- plan revision diff, including changed windows and savings;
- what changed between revisions: windows, prices, planner mode, savings, and
  reason;
- cost comparison between continuous and multi-window planning;
- latest safe start marker;
- estimated finish marker;
- reason text from the decision engine;
- current battery and required charging duration.

Dashboard implementation is not part of this RFC. The model should simply make
these views possible.

## 13. Future Ideas

- Configurable minimum savings threshold.
- Configurable maximum number of windows per session.
- Configurable maximum replans per session.
- Configurable minimum replan interval.
- Different stability thresholds before and after charging starts.
- Historical analytics for saved cost and avoided high-price slots.
- Plan revision diff view in simulator logs.
- Dashboard timeline export.
- Optional manual override plans.
- Better support for partial or delayed Tibber price data.

## 14. Design Principles

1. Deadline first.
2. Safety before optimization.
3. Stable plans over constantly changing plans.
4. Lower cost when safety is preserved.
5. Fewer charging windows when cost difference is insignificant.
6. Backward compatibility before new features.
7. All planner decisions must be explainable through logs.

## Open Design Questions

- What minimum saving is required before replacing a continuous plan with a
  multi-window plan?
- Should there be a hard maximum number of windows per charging session?
- What maximum replan count and minimum replan interval should be used by
  default?
- Should active charging lock the plan completely, or only raise the savings
  threshold for replanning?
- Should `chargeWindowsJson` include detailed slot prices or only window
  summaries?
- Should future analytics store every evaluated candidate or only the selected
  plan?
