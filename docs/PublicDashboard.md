# Public Dashboard

Public dashboard:
[SmartCharge Google Sheets dashboard](https://docs.google.com/spreadsheets/d/1LueN5IylHuwcnuLIB12EAuqa7fByK7iZOU74kFAOX6c/edit?usp=sharing)

The public dashboard should expose only filtered or aggregated SmartCharge
metrics. It must not expose raw event logs, exact session timestamps, Homey
device identifiers, Google Sheet IDs, webhook URLs, or tokens.

## Recommended Publishing Model

Use a private workbook for raw data and a separate public workbook or filtered
dashboard sheet for public data.

Private workbook:

- `Events`
- `Sessions`
- `Statistics`

Public workbook or public sheet:

- `Public Dashboard`

Only copy values that are safe to share publicly. Prefer aggregate metrics over
session-level rows.

## Safe Public Metrics

- Number of charging sessions.
- Total planned charging hours.
- Estimated average charging price.
- Estimated cost by month.
- Share of charging that happened in low-price hours.
- Last updated date rounded to a day or broader period.

## Data To Exclude

- Raw event rows.
- Session IDs.
- Exact `connectedAt`, `plannedStart`, `plannedEnd`, or departure timestamps.
- Home arrival and departure patterns.
- Homey device IDs.
- Google Sheet IDs.
- Apps Script webhook URLs.
- Tibber or Homey tokens.

## Placeholder

Current public dashboard:

```text
https://docs.google.com/spreadsheets/d/1LueN5IylHuwcnuLIB12EAuqa7fByK7iZOU74kFAOX6c/edit?usp=sharing
```
