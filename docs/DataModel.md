# Data Model

SmartCharge stores telemetry in Google Sheets as a small analytical pipeline.
The model is intentionally simple enough to run inside Apps Script, but strict
enough to support a public dashboard and future learning features.

```text
Homey
  -> SmartCharge Engine
  -> Google Apps Script
  -> Events
  -> Sessions
  -> Statistics
  -> Dashboard
```

## Overview

| Layer | Purpose | Visibility |
| --- | --- | --- |
| `Events` | Raw append-only telemetry from engine and flow executions. | Private |
| `Sessions` | Materialized charging-session view derived from Events. | Private |
| `Statistics` | Metric/value API for dashboard and reports. | Private or copied to public |
| `Dashboard` | Public project showcase using safe aggregate values. | Public |

The model separates raw telemetry from presentation data. Events preserve the
audit trail. Sessions make analytics practical. Statistics gives the dashboard
a stable, low-risk interface.

## Events

`Events` is the raw event log. Each row represents one SmartCharge engine or
Homey Flow event, such as Run Decision, Log On, Log Off, Reset Session, or
Session Expired.

Events are append-only. They should not be edited manually except for explicit
data cleanup in a private workbook.

Events are kept because they:

- preserve the full audit trail of what SmartCharge knew and decided;
- make simulator output comparable to production telemetry;
- allow Sessions to be rebuilt if derived sheets are lost or corrupted;
- make behavior changes traceable across `engineVersion` and schema changes;
- support debugging without changing the public dashboard contract.

Events can contain private details, including exact connection times, departure
patterns, raw decision reasons, session identifiers, and debug payloads. They
must not be published directly.

## Sessions

`Sessions` is a materialized view over Events. One row represents one charging
session from cable connection until session reset.

The `sessionId` is the stable key. Apps Script or a future processor should
update the same Sessions row when more Events arrive for that `sessionId`.

Sessions are materialized because:

- dashboard queries should not scan raw Events repeatedly;
- one completed charging session is the natural analytics unit;
- cost, savings, planner mode, and window count are easier to reason about at
  session level;
- incomplete or low-quality sessions can be marked without mutating raw Events;
- future learning features need stable session-level training samples.

Sessions may still contain private information. Exact `connectedAt`,
`targetDeparture`, `plannedStart`, `plannedEnd`, and `sessionId` values should
remain private unless deliberately rounded or filtered.

## Statistics

`Statistics` is a metric/value table. It acts as a simple API between private
telemetry and the Dashboard.

Recommended shape:

| Column | Description | Example |
| --- | --- | --- |
| `metric` | Stable metric name. | `totalSessions` |
| `value` | Metric value as text, number, date, or boolean. | `42` |
| `updatedAt` | Last calculation time. | `2026-07-09T10:00:00Z` |
| `scope` | Optional grouping, such as `all`, `month`, or `public`. | `all` |
| `notes` | Optional private explanation. | `Derived from Sessions` |

Statistics should be recalculated from Sessions, not directly from raw Events,
unless a metric explicitly describes event health or ingestion status.

The Dashboard should read Statistics instead of calculating directly because:

- the dashboard remains simple and stable;
- public formulas do not need access to private raw rows;
- metric definitions can change without redesigning the dashboard;
- Apps Script can validate and sanitize values before publication.

## Dashboard

The Dashboard is a public-facing project showcase. It should present a small
set of safe aggregate metrics and narrative blocks that demonstrate SmartCharge
behavior without exposing private household patterns.

The Dashboard should read from `Statistics` or from a filtered public copy of
`Statistics`. It should not read `Events` directly, and it should avoid direct
reads from private `Sessions`.

Dashboard-safe data includes:

- total session counts;
- average selected price;
- estimated savings;
- multi-window usage percentage;
- average window count;
- latest engine version;
- last update timestamp rounded to an acceptable precision.

Dashboard-unsafe data includes:

- raw event rows;
- exact session timestamps;
- session IDs;
- exact arrival or departure patterns;
- Homey device identifiers;
- Google Sheet IDs;
- webhook URLs or tokens.

## Privacy

Keep the private workbook private. Treat raw telemetry as behavioral data.

Privacy rules:

- Do not publish `Events`.
- Do not publish private `Sessions` rows as-is.
- Do not expose `sessionId` values publicly.
- Do not expose exact home arrival or departure patterns.
- Do not expose Homey, Tibber, Google, webhook, token, or device identifiers.
- Publish only aggregate values through `Statistics` or a separate public
  workbook.

If a public workbook is used, it should receive only sanitized Statistics
values. It should not import raw private sheets.

## Rebuild / Recovery

Events are the source of truth. Sessions and Statistics are derived data.

Recovery flow:

1. Preserve the private `Events` sheet.
2. Sort Events by `sessionId` and `loggedAt`.
3. Rebuild or update one Sessions row per `sessionId`.
4. Mark incomplete sessions with a quality or incomplete reason field.
5. Recalculate Statistics from Sessions.
6. Refresh the Dashboard from Statistics.

Typical rebuild cases:

- Sessions sheet was deleted or manually damaged.
- Statistics formulas were changed incorrectly.
- Dashboard needs to move to a new public workbook.
- A new schema version adds derived metrics.
- Apps Script logic changes how completed sessions are summarized.

The rebuild process should never require editing raw Events. If historical
Events use older telemetry schemas, migration code should map old columns into
the current logical model while preserving the original raw rows.
