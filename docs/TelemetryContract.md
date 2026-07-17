# Telemetry Contract

Status: Living contract
Scope: Public data model for SmartCharge telemetry
Primary sinks: Google Sheets, local simulator logs, future dashboard storage
Primary producers: Homey Flows, Session Engine, Planner, Multi-Window Planner

SmartCharge telemetry is split into two logical entities:

- `Events`: append-only execution records. One row describes one meaningful
  Homey Flow or engine execution, such as Run Decision, Log On, Log Off, Reset
  Session, or Session Expired.
- `Sessions`: aggregated charging outcomes. One row describes one completed
  charging session from cable connection until session reset.

The contract is intended to remain stable as SmartCharge grows from HomeyScript
automation into a production charging engine with a Session Engine, Planner,
Multi-Window Planner, Simulator, Google Sheets telemetry, Public Dashboard, and
future Learning Engine.

## Status Levels

Every field is classified by implementation maturity.

| Status | Meaning |
| --- | --- |
| `CURRENT` | Already emitted, already present in the current Sheets template, or derivable from current event telemetry without new runtime inputs. |
| `NEXT RELEASE` | Should be added in the next telemetry/schema update because the data is already available or simple to derive. |
| `FUTURE` | Requires new sensors, new integrations, new Session Engine behavior, dashboard storage, or Learning Engine support. |

## Compatibility Rules

- Existing columns must not be renamed or reordered.
- New Google Sheets columns must be appended at the end of the existing sheet.
- Existing Google Sheets workbooks should not be automatically reordered to the
  v1 layout. Use a new sheet or an explicit migration when a clean v1 layout is
  required.
- Existing consumers should be able to ignore unknown columns.
- New fields are optional until every producer can populate them.
- Use stable machine-readable codes for automation and human-readable text for
  dashboard display.
- Do not store secrets, Homey tokens, Tibber tokens, webhook URLs, Google Sheet
  IDs, email addresses, or private device identifiers.
- Public dashboards must use aggregated or filtered data, not raw event rows.
- Timestamps should use ISO 8601 where possible. If Homey local display time is
  used, the timezone should be documented by the sink.
- Currency fields use EUR unless explicitly documented otherwise.
- Percent fields are numbers in the `0..100` range unless explicitly documented
  otherwise.
- Price fields are EUR per kWh unless the field name says otherwise.

## Events Telemetry V1 Header Order

Clean public setups should use this `Events` header order. Existing workbooks
that still use older columns should preserve their current order and append new
columns, because formulas and dashboards may depend on fixed column positions.

```text
receivedAt
schemaVersion
eventType
reasonCode
sessionId
loggedAt
batteryPct
targetBatteryPct
missingBatteryPct
connectedAt
targetDeparture
chargeFactor
chargeReservePct
chargeMinutes
chargeSlots
chargeHoursAhead
currentPriceEurKwh
avgPlanPriceEurKwh
totalPlanPrice
selectedAvgPriceEurKwh
selectedTotalPrice
baselineAvgPriceEurKwh
baselineTotalPrice
estimatedSavings
estimatedSavingsPct
priceCount
plannerMode
plannerVersion
windowCount
plannedStart
plannedEnd
chargeWindowsText
chargeWindowsJson
shouldChargeNow
decisionSource
plugOn
plugPowerW
reason
source
engineVersion
detailsJson
```

The runtime may use internal JSON aliases such as `battery`, `currentPrice`,
`averagePrice`, or `plugPower`. Telemetry sinks should expose the public v1
header names above.

## Entity Ownership

### Events

Events describe what the engine knew and decided at one point in time. They are
the audit trail.

Use Events for:

- flow execution history;
- decision snapshots;
- planner inputs and selected plan at decision time;
- plug state transitions;
- error and fallback diagnostics;
- simulator verification;
- rebuilding Sessions if the derived session table is lost.

Events should keep high-cardinality and debug data because they are private raw
telemetry.

### Sessions

Sessions describe the final business outcome of charging. They are the
analytics layer.

Use Sessions for:

- public dashboard aggregates;
- cost and savings summaries;
- charging duration and energy summaries;
- planner performance;
- prediction error;
- Learning Engine training samples;
- quality scoring.

Sessions should avoid raw debug payloads. They may reference event timestamps,
but public dashboards should round or aggregate them.

### Shared Fields

Some concepts appear in both entities with different semantics:

- `sessionId`: event rows use it to link to a charging session; session rows use
  it as the primary key.
- `plannerMode`: event rows record the mode selected during one decision; a
  session row preserves the first planner mode recorded for the session.
- `windowCount` and `chargeWindowsJson`: event rows record the selected plan at
  decision time; session rows record the latest remaining plan.
- price fields: event rows record current or selected decision prices; session
  rows record final aggregated prices and cost.

## Events Schema

An Event row represents one meaningful execution of the SmartCharge runtime.
The minimum useful event contains `eventType`, `loggedAt`, `source`, and
`engineVersion`. Session-scoped events should also include `sessionId`.

Known event types:

- `session_start`
- `smartcharge_decision`
- `smartcharge_on`
- `smartcharge_off`
- `session_reset`
- `session_expired`
- `battery_full`
- `charger_disconnected`
- `smartcharge_error`

### Events: Metadata

| Field | Type | Required | Status | Description | Example | Future usage |
| --- | --- | --- | --- | --- | --- | --- |
| `receivedAt` | datetime | Required by sink | `CURRENT` | Timestamp when the telemetry sink received the event. | `2026-07-09T01:34:06.602Z` | Detect delayed Homey execution and webhook latency. |
| `eventType` | enum string | Required | `CURRENT` | Machine-readable event type. | `smartcharge_decision` | Primary filter for dashboards, alerts, and session reconstruction. |
| `sessionId` | string | Required for session events | `CURRENT` | Stable identifier for the charging session. | `2026-07-07 18:00:00` | Join Events to Sessions and rebuild session aggregates. |
| `loggedAt` | datetime | Required | `CURRENT` | Runtime timestamp when the event was produced. | `2026-07-07T16:05:00.000Z` | Timeline ordering and session duration calculations. |
| `source` | string | Required | `CURRENT` | Runtime component that produced the event. | `smartcharge-run-decision` | Debug ownership and component-level reliability metrics. |
| `engineVersion` | string | Required | `CURRENT` | SmartCharge engine version used by the producer. | `0.4.1+build.1` | Compare behavior across releases. |
| `schemaVersion` | integer | Optional | `CURRENT` | Telemetry schema version. | `1` | Safe parsing and future migrations. |
| `flowName` | enum string | Optional | `NEXT RELEASE` | Homey Flow that triggered the event. | `Run Decision` | Flow-level dashboard filters. |
| `scriptName` | string | Optional | `NEXT RELEASE` | HomeyScript name or generated script target. | `SmartCharge - Run Decision` | Deployment validation and support diagnostics. |
| `message` | string | Optional | `CURRENT` | Short human-readable message for lifecycle events. | `Charging plug turned on` | User-facing dashboard activity feed. |

### Events: Vehicle State

| Field | Type | Required | Status | Description | Example | Future usage |
| --- | --- | --- | --- | --- | --- | --- |
| `batteryPct` | number | Optional | `CURRENT` | Current vehicle battery percentage. | `70` | Estimate missing charge and learning samples. |
| `targetBatteryPct` | number | Optional | `CURRENT` | Desired battery percentage for departure. | `100` | Replace hard-coded assumptions and support user profiles. |
| `missingBatteryPct` | number | Optional | `CURRENT` | Difference between target and current battery. | `30` | Normalize charging need independent of vehicle size. |
| `connectedAt` | datetime | Optional | `CURRENT` | Cable connection timestamp for the active session. | `2026-07-07 18:00:00` | Session boundary and arrival pattern analysis. |
| `targetDeparture` | datetime | Optional | `CURRENT` | Planned departure deadline. | `2026-07-08 07:30:00` | Planner deadline and session quality scoring. |
| `plugOn` | boolean | Optional | `CURRENT` | Whether the charging plug is currently enabled. | `false` | Detect toggles and validate decision execution. |
| `plugPowerW` | number | Optional | `CURRENT` | Current plug power in watts. | `3600` | Infer actual charging and low-power stop conditions. |
| `chargerStatus` | enum string | Optional | `NEXT RELEASE` | Normalized charger state. | `connected` | Watchdog recovery and missing session detection. |
| `vehicleProvider` | string | Optional | `FUTURE` | Vehicle data provider or integration name. | `Mercedes` | Multi-vehicle and provider reliability analytics. |

### Events: Planning

| Field | Type | Required | Status | Description | Example | Future usage |
| --- | --- | --- | --- | --- | --- | --- |
| `chargeMinutes` | number | Optional | `CURRENT` | Estimated minutes required to reach the target. | `180` | Planner input and session expected duration. |
| `chargeSlots` | number | Optional | `CURRENT` | Number of price slots required for charging. | `3` | Explain planner decisions and compare slot models. |
| `chargeHoursAhead` | number | Optional | `CURRENT` | Available planning horizon in hours. | `14` | Detect deadline pressure and fallback risk. |
| `plannedStart` | datetime | Optional | `CURRENT` | First planned charging start. | `2026-07-08 02:00:00` | Backward-compatible single-window dashboard views. |
| `plannedEnd` | datetime | Optional | `CURRENT` | Last planned charging end. | `2026-07-08 04:00:00` | Backward-compatible single-window dashboard views. |
| `plannerMode` | enum string | Optional | `CURRENT` | Planner strategy that selected the plan. | `multi-window` | Compare continuous and multi-window behavior. |
| `windowCount` | number | Optional | `CURRENT` | Number of selected charging windows. | `3` | Dashboard distribution and toggle-risk metrics. |
| `chargeWindowsText` | string | Optional | `CURRENT` | Human-readable list of planned windows. | `2026-07-07 20:00:00-2026-07-07 21:00:00 | 2026-07-07 23:00:00-2026-07-08 00:00:00` | Quick spreadsheet inspection. |
| `chargeWindowsJson` | JSON string | Optional | `CURRENT` | Machine-readable list of selected windows. | `[{"plannedStart":"2026-07-07 20:00:00","plannedEnd":"2026-07-07 21:00:00","slotCount":1}]` | Dashboard charts and Learning Engine plan reconstruction. |
| `plannerVersion` | string | Optional | `CURRENT` | Planner algorithm version independent of engine build. | `multi-window-v1` | A/B comparison and learning reproducibility. |
| `planRevision` | integer | Optional | `NEXT RELEASE` | Revision number within one session. | `2` | Detect replanning churn after price updates. |
| `chargeFactor` | number | Optional | `CURRENT` | Estimated minutes per missing battery percent. | `2.5` | Learning Engine baseline and per-car calibration. |
| `chargeReservePct` | number | Optional | `CURRENT` | Extra reserve percentage added to the plan. | `5` | Explain conservative planning and missed target prevention. |

### Events: Energy

| Field | Type | Required | Status | Description | Example | Future usage |
| --- | --- | --- | --- | --- | --- | --- |
| `plannedEnergyKWh` | number | Optional | `NEXT RELEASE` | Estimated energy required by the selected plan. | `9.8` | Cost estimates and public dashboard energy totals. |
| `actualChargeMinutes` | number | Optional | `FUTURE` | Actual charging minutes observed so far in the session. | `82` | Mid-session progress and prediction correction. |
| `actualEnergyKWh` | number | Optional | `FUTURE` | Actual measured energy delivered so far. | `8.4` | Accurate cost and efficiency calculations. |
| `averagePower` | number | Optional | `FUTURE` | Average charging power in watts or kW as documented by sink. | `3.4` | Detect derating and charger/vehicle limits. |
| `efficiencyScore` | number | Optional | `FUTURE` | Normalized score for how efficiently the session is tracking the plan. | `0.92` | Dashboard quality and Learning Engine weighting. |

### Events: Pricing

| Field | Type | Required | Status | Description | Example | Future usage |
| --- | --- | --- | --- | --- | --- | --- |
| `currentPriceEurKwh` | number | Optional | `CURRENT` | Current Tibber price at decision time. | `0.58` | Explain immediate charge/no-charge decisions. |
| `avgPlanPriceEurKwh` | number | Optional | `CURRENT` | Average price of the selected plan. | `0.155` | Dashboard estimate and comparison to baseline. |
| `totalPlanPrice` | number | Optional | `CURRENT` | Sum of selected slot prices, not full session cost. | `0.31` | Backward-compatible cost proxy. |
| `priceCount` | number | Optional | `CURRENT` | Number of price entries available to the planner. | `48` | Detect missing Tibber tomorrow prices. |
| `baselineMode` | enum string | Optional | `NEXT RELEASE` | Baseline strategy used for comparison. | `continuous-cheapest` | Savings calculation and public dashboard storytelling. |
| `baselineAvgPriceEurKwh` | number | Optional | `CURRENT` | Average price of the baseline plan. | `0.24` | Compare selected planner to legacy behavior. |
| `baselineTotalPrice` | number | Optional | `CURRENT` | Total price proxy for the baseline plan. | `0.72` | Savings estimate. |
| `selectedAvgPriceEurKwh` | number | Optional | `CURRENT` | Average price of the selected plan. | `0.09` | Replacement for ambiguous `averagePrice`. |
| `selectedTotalPrice` | number | Optional | `CURRENT` | Total price proxy for the selected plan. | `0.27` | Replacement for ambiguous `totalPrice`. |
| `estimatedSavings` | number | Optional | `CURRENT` | Estimated EUR saved versus baseline. | `0.45` | Public dashboard savings metrics. |
| `estimatedSavingsPct` | number | Optional | `CURRENT` | Estimated savings percentage versus baseline. | `62.5` | Public dashboard efficiency metrics. |

### Events: Decision

| Field | Type | Required | Status | Description | Example | Future usage |
| --- | --- | --- | --- | --- | --- | --- |
| `shouldChargeNow` | boolean | Optional | `CURRENT` | Immediate engine decision for plug state. | `false` | Validate charge windows and plug transitions. |
| `reason` | string | Optional | `CURRENT` | Human-readable explanation for the decision. | `Waiting for selected charging plan` | Dashboard activity and support diagnostics. |
| `reasonCode` | enum string | Optional | `CURRENT` | Stable machine-readable reason. | `WAITING_FOR_PLAN` | Alerting, translations, and analytics without parsing text. |
| `decisionSource` | enum string | Optional | `CURRENT` | Component that made the final decision. | `planner` | Separate planner decisions from fallback/manual decisions. |
| `decisionState` | enum string | Optional | `NEXT RELEASE` | High-level state for the decision. | `waiting` | State charts and long-term trend analysis. |
| `fallbackActive` | boolean | Optional | `NEXT RELEASE` | Whether a safety fallback overrode the selected plan. | `false` | Reliability and risk metrics. |
| `manualOverride` | boolean | Optional | `FUTURE` | Whether user action overrode SmartCharge. | `false` | Exclude manual sessions from learning samples. |

### Events: Environment

| Field | Type | Required | Status | Description | Example | Future usage |
| --- | --- | --- | --- | --- | --- | --- |
| `hasTomorrowPrices` | boolean | Optional | `NEXT RELEASE` | Whether tomorrow price data was available. | `true` | Explain suboptimal plans caused by missing prices. |
| `priceDataAgeMinutes` | number | Optional | `NEXT RELEASE` | Age of the price data used by the decision. | `12` | Detect stale integrations. |
| `outsideTemperature` | number | Optional | `FUTURE` | Outside temperature in Celsius. | `-3.5` | Model charging speed and battery conditioning effects. |
| `batteryTemperature` | number | Optional | `FUTURE` | Vehicle battery temperature in Celsius. | `8.2` | Improve energy and duration prediction. |
| `solarForecastKWh` | number | Optional | `FUTURE` | Expected solar production before departure. | `4.1` | Solar-aware planning. |
| `gridCarbonIntensity` | number | Optional | `FUTURE` | Carbon intensity for selected charge window. | `120` | CO2-aware planning. |

### Events: Debug

| Field | Type | Required | Status | Description | Example | Future usage |
| --- | --- | --- | --- | --- | --- | --- |
| `detailsJson` | JSON string | Required by Sheets | `CURRENT` | Raw JSON payload snapshot. | `{"scenario":"overnight","flow":"run-decision"}` | Backward compatibility and incident debugging. |
| `logKey` | string | Optional | `NEXT RELEASE` | Deduplication key used by the logger. | `smartcharge_decision|70|0.58|...` | Explain skipped duplicate decision logs. |
| `errorName` | string | Optional | `NEXT RELEASE` | Error class or stable error name. | `TibberPriceError` | Error dashboards and alert routing. |
| `errorMessage` | string | Optional | `NEXT RELEASE` | Sanitized error message. | `Price data unavailable` | Support diagnostics without secrets. |
| `simulatorScenario` | string | Optional | `CURRENT` | Simulator scenario name when logs are produced locally. | `multi-window-needed` | Regression analysis in simulator artifacts only. |
| `confidenceScore` | number | Optional | `FUTURE` | Confidence assigned to the decision by a future model. | `0.86` | Learning Engine explainability and safety gates. |

## Sessions Schema

A Session row represents one completed charging session from cable connection
until session reset. Today this entity is mostly derived from Events. The
contract below defines the long-term target for the `Sessions` sheet and future
storage.

The minimum useful Session contains `sessionId`, `connectedAt`, `resetAt` or
`disconnectedAt`, start/end battery values when available, and the final planner
summary.

Telemetry v1.1 keeps the original complete plan separate from the latest
remaining-plan snapshot:

- immutable first-plan fields: `plannerMode`, `initialWindowCount`,
  `initialSelectedTotalPrice`, `initialBaselineTotalPrice`,
  `initialEstimatedSavings`, and `initialEstimatedSavingsPct`;
- mutable current-plan fields: `windowCount`, `plannedStart`, `plannedEnd`,
  `chargeWindowsText`, `chargeWindowsJson`, `plannedChargeMinutes`,
  `selectedAvgPriceEurKwh`, `selectedTotalPrice`,
  `baselineAvgPriceEurKwh`, `baselineTotalPrice`, `estimatedSavings`, and
  `estimatedSavingsPct`.

The `initial*` fields come from the first valid decision containing a complete
plan and are never overwritten. Mutable fields are refreshed from later
decisions and describe only the latest remaining plan. Both savings sets are
planner estimates; they are not actual EUR savings calculated from consumed
energy.

### Sessions: Connection

| Field | Type | Required | Status | Description | Example | Future usage |
| --- | --- | --- | --- | --- | --- | --- |
| `sessionId` | string | Required | `CURRENT` | Primary key for the completed session. | `2026-07-07 18:00:00` | Join to raw Events and dashboard session count. |
| `connectedAt` | datetime | Required | `CURRENT` | Cable connection timestamp. | `2026-07-07 18:00:00` | Session duration and arrival bucket. |
| `disconnectedAt` | datetime | Optional | `CURRENT` | Cable disconnect timestamp, if observed. | `2026-07-08 07:05:00` | Departure timing and session close reason. |
| `resetAt` | datetime | Optional | `NEXT RELEASE` | Timestamp when SmartCharge cleared session state. | `2026-07-08T05:00:00Z` | Separate real disconnect from logical reset. |
| `resetReason` | enum string | Optional | `NEXT RELEASE` | Machine-readable reason for session reset. | `CHARGING_COMPLETED` | Session quality and recovery metrics. |
| `connectionSource` | string | Optional | `FUTURE` | Source that detected the connection. | `Homey charger flow` | Multi-device setups and watchdog diagnostics. |

### Sessions: Battery

| Field | Type | Required | Status | Description | Example | Future usage |
| --- | --- | --- | --- | --- | --- | --- |
| `startBattery` | number | Optional | `CURRENT` | Battery percentage at connection or first decision. | `62` | Measure charging need and learning samples. |
| `endBattery` | number | Optional | `CURRENT` | Battery percentage at session end. | `100` | Completion quality and prediction error. |
| `targetBattery` | number | Optional | `NEXT RELEASE` | Desired battery percentage for the session. | `100` | User profiles and charge completion scoring. |
| `missingBatteryPercent` | number | Optional | `NEXT RELEASE` | Battery percentage needed at session start. | `38` | Normalize sessions across starting battery levels. |
| `batteryDelta` | number | Optional | `NEXT RELEASE` | End battery minus start battery. | `38` | Learning Engine target variable. |

### Sessions: Timing

| Field | Type | Required | Status | Description | Example | Future usage |
| --- | --- | --- | --- | --- | --- | --- |
| `targetDeparture` | datetime | Optional | `CURRENT` | Departure deadline used by the session. | `2026-07-08 07:30:00` | Session quality and late/early metrics. |
| `firstDecisionAt` | datetime | Optional | `CURRENT` | First decision event timestamp in the session. | `2026-07-07T16:05:00Z` | Detect delayed startup. |
| `lastDecisionAt` | datetime | Optional | `CURRENT` | Last decision event timestamp in the session. | `2026-07-08T04:50:00Z` | Replanning and watchdog analysis. |
| `plannedStart` | datetime | Optional | `CURRENT` | First planned charging start from the accepted plan. | `2026-07-08 02:00:00` | Dashboard schedule summary. |
| `plannedEnd` | datetime | Optional | `CURRENT` | Last planned charging end from the accepted plan. | `2026-07-08 04:00:00` | Dashboard schedule summary. |
| `plannedChargeMinutes` | number | Optional | `CURRENT` | Planned charge duration for the session. | `180` | Compare expected and actual charge time. |
| `actualChargeMinutes` | number | Optional | `FUTURE` | Actual minutes with charging power above threshold. | `172` | Learning Engine target and accuracy metric. |
| `predictionErrorMinutes` | number | Optional | `FUTURE` | Actual charge minutes minus predicted charge minutes. | `-8` | Learning Engine calibration. |
| `predictionErrorPercent` | number | Optional | `FUTURE` | Prediction error relative to planned charge minutes. | `-4.4` | Confidence and model health dashboards. |

### Sessions: Energy

| Field | Type | Required | Status | Description | Example | Future usage |
| --- | --- | --- | --- | --- | --- | --- |
| `estimatedEnergyKWh` | number | Optional | `NEXT RELEASE` | Estimated energy required by the plan. | `11.2` | Cost and savings estimation. |
| `actualEnergyKWh` | number | Optional | `FUTURE` | Metered delivered energy for the session. | `10.7` | Accurate cost, savings, and CO2 calculations. |
| `averagePower` | number | Optional | `FUTURE` | Average charging power during active charging. | `3.6` | Detect derating and charger limits. |
| `chargeFactor` | number | Optional | `NEXT RELEASE` | Planning factor used for this session. | `2.5` | Explain selected charge duration. |
| `learnedChargeFactor` | number | Optional | `FUTURE` | Updated factor learned from this and previous sessions. | `2.35` | Adaptive planning per car and season. |
| `efficiencyScore` | number | Optional | `FUTURE` | Normalized session efficiency score. | `0.91` | Public dashboard summary and learning sample weight. |

### Sessions: Pricing

| Field | Type | Required | Status | Description | Example | Future usage |
| --- | --- | --- | --- | --- | --- | --- |
| `estimatedCost` | number | Optional | `CURRENT` | Estimated session cost in EUR. | `1.84` | Public dashboard cost summary. |
| `baselineMode` | enum string | Optional | `NEXT RELEASE` | Strategy used as comparison baseline. | `continuous-cheapest` | Savings narrative and regression checks. |
| `baselineAveragePrice` | number | Optional | `NEXT RELEASE` | Average price for the baseline plan. | `0.24` | Compare selected planner against legacy strategy. |
| `baselineTotalPrice` | number | Optional | `NEXT RELEASE` | Total price proxy or estimated cost for baseline plan. | `0.72` | Savings calculation. |
| `selectedAveragePrice` | number | Optional | `NEXT RELEASE` | Average price for the selected plan. | `0.09` | Dashboard planner quality metric. |
| `selectedTotalPrice` | number | Optional | `NEXT RELEASE` | Total price proxy or estimated cost for selected plan. | `0.27` | Savings calculation. |
| `actualAveragePrice` | number | Optional | `FUTURE` | Average price of actual charged energy or charged slots. | `0.11` | Validate plan execution against real charging. |
| `actualTotalPrice` | number | Optional | `FUTURE` | Final actual cost in EUR. | `1.76` | Accurate monthly cost and savings. |
| `estimatedSavings` | number | Optional | `NEXT RELEASE` | Estimated EUR saved versus baseline. | `0.45` | Public dashboard savings metric. |
| `estimatedSavingsPercent` | number | Optional | `NEXT RELEASE` | Estimated savings percentage versus baseline. | `62.5` | Public dashboard savings metric. |
| `initialSelectedTotalPrice` | number | Optional | `CURRENT` | Selected total-price estimate from the first valid complete plan. Immutable once stored. | `0.7567` | Preserve the original plan estimate across replanning. |
| `initialBaselineTotalPrice` | number | Optional | `CURRENT` | Baseline total-price estimate from the first valid complete plan. Immutable once stored. | `0.7615` | Preserve the original comparison baseline. |
| `initialEstimatedSavings` | number | Optional | `CURRENT` | Savings estimate from the first valid complete plan. Immutable once stored; zero is valid. | `0.0048` | Compare original opportunity with the remaining-plan estimate. |
| `initialEstimatedSavingsPct` | number | Optional | `CURRENT` | Savings percentage from the first valid complete plan. Immutable once stored; zero is valid. | `0.63` | Compare original and remaining-plan savings. |

### Sessions: Planner

| Field | Type | Required | Status | Description | Example | Future usage |
| --- | --- | --- | --- | --- | --- | --- |
| `plannerMode` | enum string | Optional | `CURRENT` | First planner strategy recorded for the session. Immutable once stored. | `multi-window` | Compare strategy usage and value. |
| `plannerVersion` | string | Optional | `NEXT RELEASE` | Planner algorithm version. | `multi-window-v1` | Reproducible learning and release comparison. |
| `initialWindowCount` | number | Optional | `CURRENT` | Number of windows in the first valid complete plan. Immutable once stored. | `3` | Preserve original multi-window plan complexity. |
| `windowCount` | number | Optional | `CURRENT` | Number of windows in the latest remaining plan. Updated during replanning. | `1` | Current schedule and remaining-plan metrics. |
| `chargeWindowsJson` | JSON string | Optional | `CURRENT` | Latest remaining planned charging windows. | `[{"plannedStart":"2026-07-07 20:00:00","plannedEnd":"2026-07-07 21:00:00"}]` | Current schedule visualization. |
| `planRevisionCount` | number | Optional | `NEXT RELEASE` | Number of distinct plan revisions during the session. | `2` | Planner stability metric. |
| `fallbackCount` | number | Optional | `NEXT RELEASE` | Number of safety fallback decisions in the session. | `0` | Reliability and risk tracking. |
| `replansCount` | number | Optional | `NEXT RELEASE` | Number of times selected windows changed. | `1` | Detect churn from price updates. |

### Sessions: Learning

| Field | Type | Required | Status | Description | Example | Future usage |
| --- | --- | --- | --- | --- | --- | --- |
| `confidenceScore` | number | Optional | `FUTURE` | Model confidence for the session plan. | `0.86` | Decide whether adaptive recommendations are safe. |
| `sampleSize` | number | Optional | `FUTURE` | Number of historical samples used for prediction. | `42` | Explain confidence and avoid overfitting. |
| `predictionErrorMinutes` | number | Optional | `FUTURE` | Final timing prediction error. | `-8` | Primary model accuracy metric. |
| `predictionErrorPercent` | number | Optional | `FUTURE` | Final timing prediction error percentage. | `-4.4` | Normalize accuracy across session lengths. |
| `learnedChargeFactor` | number | Optional | `FUTURE` | Learned charge factor after processing the session. | `2.35` | Feed next-session planning. |

### Sessions: Quality

| Field | Type | Required | Status | Description | Example | Future usage |
| --- | --- | --- | --- | --- | --- | --- |
| `dataQuality` | enum string | Optional | `NEXT RELEASE` | Overall quality of the session telemetry. | `complete` | Filter dashboard and learning samples. |
| `incompleteReason` | enum string | Optional | `NEXT RELEASE` | Why the session is incomplete or excluded. | `MISSING_LOG_OFF` | Debug missing Homey events. |
| `priceCoveragePercent` | number | Optional | `NEXT RELEASE` | Share of required planning horizon covered by price data. | `100` | Explain fallback or weak savings. |
| `telemetrySchemaVersion` | integer | Optional | `NEXT RELEASE` | Schema version used to derive the session row. | `1` | Session table migrations. |
| `notes` | string | Optional | `CURRENT` | Manual or derived notes. | `Low power stop detected` | Support and manual review. |

## Field Placement Rules

Use these rules when adding future fields:

- Put raw execution inputs in Events.
- Put final aggregates in Sessions.
- Put human-readable explanations in Events and stable codes in both when they
  affect analytics.
- Put high-cardinality debug payloads only in Events.
- Put Learning Engine training outcomes in Sessions.
- Put model confidence snapshots in Events only when a decision used them.
- Put public dashboard fields in Sessions or a dedicated filtered dashboard
  sheet, not in raw Events.

## Recommended Dashboard Metrics

Dashboard metrics should come from Sessions whenever possible. Events may be
used for drill-down in a private dashboard.

Recommended private dashboard metrics:

- Total sessions.
- Sessions by planner mode.
- Multi-window usage share.
- Average `windowCount`.
- Planned charging hours.
- Actual charging hours when available.
- Estimated monthly cost.
- Actual monthly cost when available.
- Selected average price.
- Baseline average price.
- Estimated savings and estimated savings percent.
- Fallback count and fallback rate.
- Replan count per session.
- Sessions with missing tomorrow prices.
- Sessions completed before target departure.
- Sessions excluded from learning due to incomplete data.

Recommended public dashboard metrics:

- Total sessions.
- Total planned charging hours.
- Estimated cost by month.
- Estimated savings by month.
- Average selected price.
- Share of sessions using Multi-Window Planner.
- Last update date rounded to day or broader period.

Do not publish raw session IDs, exact connection timestamps, exact departure
patterns, Homey device identifiers, webhook URLs, Sheet IDs, or tokens.

## Recommended Learning Engine Metrics

The Learning Engine should train primarily on Sessions because they represent
completed outcomes. Events provide supporting timeline and decision context.

Recommended learning features:

- `startBattery`
- `targetBattery`
- `missingBatteryPercent`
- `targetDeparture`
- `plannedChargeMinutes`
- `actualChargeMinutes`
- `plannedEnergyKWh`
- `actualEnergyKWh`
- `averagePower`
- `outsideTemperature`
- `batteryTemperature`
- `plannerMode`
- `windowCount`
- `chargeFactor`
- `learnedChargeFactor`
- `priceCoveragePercent`
- `fallbackCount`
- `replansCount`

Recommended learning targets:

- `predictionErrorMinutes`
- `predictionErrorPercent`
- `actualChargeMinutes`
- `actualEnergyKWh`
- `efficiencyScore`

Recommended model health metrics:

- Mean absolute prediction error.
- Median prediction error.
- Error by outside temperature bucket.
- Error by start battery bucket.
- Error by planner mode.
- Error by charging window count.
- Confidence score calibration.
- Sample size per season or month.
- Excluded sample count by incomplete reason.

## Migration Notes

The current system can continue writing Events without a dedicated Sessions
writer. Sessions can be derived from Events using `sessionId` and event type
ordering.

For existing private Google Sheets workbooks, do not reorder old columns in
place. Append missing Events v1 columns or create a new clean `Events` sheet
with the v1 order and migrate/import data intentionally.

After Events telemetry v1, the next telemetry work should prioritize:

1. Populate currently nullable v1 fields such as `reasonCode`,
   `decisionSource`, `targetBatteryPct`, baseline pricing, and selected pricing.
2. Add a Sessions derivation step that writes one row per completed session.
3. Add data quality fields before using Sessions for public dashboard metrics
   or Learning Engine training.
4. Add model and environment fields only after the required inputs exist.
