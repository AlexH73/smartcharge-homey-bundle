# Dashboard

The SmartCharge Dashboard is a public project showcase. It should communicate
what the charging engine achieves without exposing private operational data.

The Dashboard sits at the end of the telemetry pipeline:

```text
Events -> Sessions -> Statistics -> Dashboard
```

It should read from `Statistics`, not directly from `Events`. For public
sharing, use a filtered public copy of `Statistics` or a dedicated public
dashboard sheet that contains only safe aggregate values.

## Data Source

`Statistics` is the telemetry abstraction layer between private operational
data and the public dashboard. Each dashboard value should map to a stable
metric name in the Statistics table.

Recommended columns:

| Column | Purpose |
| --- | --- |
| `metric` | Stable key used by dashboard formulas. |
| `value` | Display value or raw numeric value. |
| `updatedAt` | Time when the metric was calculated. |
| `scope` | Optional grouping such as `all`, `month`, or `public`. |

The Dashboard should not calculate directly from raw Events because Events are
private, high-volume, and schema-sensitive. It should also avoid reading
private Sessions directly because Sessions can still contain exact timestamps
and session identifiers.

## KPI Cards

Recommended public KPI cards:

| Metric | Description | Source |
| --- | --- | --- |
| `totalSessions` | Total number of tracked charging sessions. | `Statistics` |
| `completedSessions` | Sessions that reached a completed or reset state. | `Statistics` |
| `avgSelectedPrice` | Average selected charging price. | `Statistics` |
| `totalEstimatedSavings` | Estimated total savings versus baseline. | `Statistics` |
| `multiWindowUsagePct` | Share of sessions using Multi-Window Planner. | `Statistics` |
| `avgWindowCount` | Average number of planned charging windows. | `Statistics` |
| `latestEngineVersion` | Latest SmartCharge engine version seen in telemetry. | `Statistics` |
| `lastUpdate` | Last metric refresh time. | `Statistics` |

KPI cards should be aggregate and rounded. They should not include exact
session timestamps, session IDs, or raw vehicle data.

## Future Dashboard Blocks

### Planner Usage

Show how often each planner mode is used:

- continuous planner sessions;
- multi-window planner sessions;
- fallback decisions;
- average windows per session;
- planner version currently active.

This block should use aggregated Statistics values. It should not expose the
exact planned windows for private sessions.

### Charging Analytics

Show charging outcome summaries:

- estimated charging cost by period;
- average selected price;
- estimated savings;
- planned charging hours;
- charging sessions by broad time bucket.

Use month, week, or broad time buckets rather than exact timestamps.

### Recent Sessions

Show a small public-safe activity summary, not raw session rows.

Recommended display:

- rounded date or relative period;
- planner mode;
- estimated savings bucket;
- completion status;
- window count.

Avoid exact connection time, exact departure time, session ID, and detailed
per-window schedules.

### Project Status

Show project maturity and operational state:

- current engine version;
- telemetry schema version;
- simulator scenario count;
- latest successful update;
- public dashboard refresh status.

This block is useful for GitHub visitors because it explains that SmartCharge is
tested and running in a real Homey workflow.

### Engine Health

Show high-level reliability metrics:

- last telemetry update;
- event ingestion status;
- sessions with incomplete data;
- fallback rate;
- missing price data count;
- latest Apps Script update status.

Engine health should reveal system quality without exposing private event
content.

## Privacy Rules

The public Dashboard must not expose:

- raw Events;
- private Sessions rows;
- session IDs;
- exact connection or departure timestamps;
- exact home arrival or departure patterns;
- Homey device identifiers;
- Google Sheet IDs;
- Apps Script webhook URLs;
- Tibber or Homey tokens.

The safe pattern is:

```text
Private workbook:
  Events -> Sessions -> Statistics

Public dashboard:
  filtered Statistics only
```

If a chart or formula requires raw Events, it belongs in a private dashboard,
not in the public project showcase.
