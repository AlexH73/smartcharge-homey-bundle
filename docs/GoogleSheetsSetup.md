# Google Sheets Setup

SmartCharge can write lifecycle and decision events to a Google Apps Script web
app. The public repository contains only a template. You must provide your own
spreadsheet ID and deploy your own webhook.

Status: template IMPLEMENTED / TESTED LOCALLY. This audit does not establish a
deployed Apps Script version, working dashboard or live webhook delivery. The
template appends Events and updates Sessions. Statistics formulas/dashboard
publishing require operator configuration, not an automatic analytics service.

## Spreadsheet Structure

Create one private workbook with these sheets:

- `Events`: raw append-only event log written by the webhook.
- `Sessions`: derived session summaries such as start time, end time, battery
  change, duration, and estimated cost.
- `Statistics`: private aggregate metrics used for analysis.
- `Public Dashboard`: filtered values that are safe to publish.

Raw `Events` data can reveal home arrival and departure patterns. Keep it
private.

## Apps Script Setup

1. Create a Google Sheet.
2. Copy the spreadsheet ID from the sheet URL.
3. Open Extensions -> Apps Script.
4. Copy `scripts/google-apps-script/SmartChargeLogger.gs` into the Apps Script
   editor.
5. Open Apps Script Project Settings and add a script property:

```text
SPREADSHEET_ID = YOUR_GOOGLE_SHEET_ID
```

6. Save the project.
7. Run `setupSmartChargeWorkbook` once from the Apps Script editor.
8. Authorize the script for your Google account.

Do not commit your spreadsheet ID or any deployed webhook URL back into this
repository.

`setupSmartChargeWorkbook` creates the expected sheets and headers. If an
existing `Events` sheet is missing newer columns, the Apps Script template
appends those headers the next time `setupSmartChargeWorkbook` or the webhook
runs. Rows are written by header name, so existing column order is preserved.
Update any custom formulas or charts that reference fixed column letters.

Existing Google Sheets columns should not be reordered automatically. For a
clean public setup, create a new workbook or sheet with the Events telemetry v2
header order below.

Sessions preserve two planner views. Immutable `plannerMode` and `initial*`
fields describe the first valid complete plan. `windowCount`, planned windows,
planned duration, tariff metrics, estimated costs, and EUR savings describe
the latest remaining plan and are updated during replanning.

`selectedTotalPrice` and `baselineTotalPrice` remain tariff proxies.
`estimatedSelectedCostEur` and `estimatedBaselineCostEur` are charging costs.
`estimatedSavingsEur` and `estimatedSavingsPct` are the only savings metrics.

New columns are appended; setup does not reorder production columns. Sessions
store immutable `initialEstimatedSelectedCostEur`,
`initialEstimatedBaselineCostEur`, `initialEstimatedSavingsEur`, and
`initialEstimatedSavingsPct`, plus mutable latest-plan equivalents.
Numeric zero is a valid initial value.

Add these completed-session-only metrics to the private `Statistics` sheet:

```text
totalEstimatedSavingsEur
  =SUMIF(Sessions!status:status,"completed",Sessions!initialEstimatedSavingsEur:initialEstimatedSavingsEur)
averageEstimatedSavingsEur
  =AVERAGEIF(Sessions!status:status,"completed",Sessions!initialEstimatedSavingsEur:initialEstimatedSavingsEur)
averageEstimatedSavingsPct
  =AVERAGEIF(Sessions!status:status,"completed",Sessions!initialEstimatedSavingsPct:initialEstimatedSavingsPct)
totalEstimatedSelectedCostEur
  =SUMIF(Sessions!status:status,"completed",Sessions!initialEstimatedSelectedCostEur:initialEstimatedSelectedCostEur)
totalEstimatedBaselineCostEur
  =SUMIF(Sessions!status:status,"completed",Sessions!initialEstimatedBaselineCostEur:initialEstimatedBaselineCostEur)
```

Replace each symbolic `Sessions!header:header` reference with the actual column
letter after workbook setup. Active, planned, expired, and manual-reset
sessions are excluded.

For compatibility, setup migrates a lone legacy Sessions header
`windowCounts` to `initialWindowCount` without moving its column or data. If
both headers already exist, `initialWindowCount` is canonical and
`windowCounts` is left untouched and ignored. Missing initial fields are
appended; existing sessions are not backfilled from Events.

## Webhook Deployment

Deploy the Apps Script project as a Web app:

- Execute as: your account.
- Who has access: choose the narrowest option that still lets Homey post to the
  endpoint in your setup.

After deployment, copy the Web app URL into the Homey Logic variable:

```text
SMARTCHARGE_LOG_WEBHOOK_URL = YOUR_WEBHOOK_URL
```

The webhook URL is a secret. Treat it like a write credential for your
spreadsheet.

## How Homey Sends Logs

The generated HomeyScripts use `SmartChargeLogger` to send JSON payloads to
`SMARTCHARGE_LOG_WEBHOOK_URL`.

Important event types:

- `session_start`
- `smartcharge_decision`
- `smartcharge_on`
- `smartcharge_off`
- `session_reset`
- `session_expired`
- `actuator_request` (Events only; never creates/updates a Session)
- `manual_override_enabled` / `manual_override_disabled`
- `manual_charging_started` / `manual_charging_completed`

Manual rows use `manual:<activation ISO timestamp>` with `decisionSource=manual`.
Manual `smartcharge_on` means `ready_to_charge`; `chargeStartedAt`/`charging` requires
`manual_charging_started`. LOW_POWER/BATTERY_FULL becomes `completed`; USER_STOP,
MAX_DURATION and control termination become `stopped`. The disabled event preserves
the preceding outcome. Manual and automatic identities are separate. Pre-0.6.3
migration needs the updated materializer; correctly migrated 0.6.3 needs no Apps
Script/schema change solely for 0.6.4.

Events telemetry v2 headers:

- `receivedAt`
- `schemaVersion`
- `eventType`
- `reasonCode`
- `sessionId`
- `loggedAt`
- `batteryPct`
- `targetBatteryPct`
- `missingBatteryPct`
- `connectedAt`
- `targetDeparture`
- `chargeFactor`
- `chargeReservePct`
- `chargeMinutes`
- `chargeSlots`
- `chargeHoursAhead`
- `currentPriceEurKwh`
- `avgPlanPriceEurKwh`
- `totalPlanPrice`
- `selectedAvgPriceEurKwh`
- `selectedTotalPrice`
- `baselineAvgPriceEurKwh`
- `baselineTotalPrice`
- `estimatedSavingsEur`
- `estimatedSavingsPct`
- `priceCount`
- `plannerMode`
- `plannerVersion`
- `windowCount`
- `plannedStart`
- `plannedEnd`
- `chargeWindowsText`
- `chargeWindowsJson`
- `shouldChargeNow`
- `decisionSource`
- `plugOn`
- `plugPowerW`
- `reason`
- `source`
- `engineVersion`
- `detailsJson`
- `estimatedSelectedCostEur`
- `estimatedBaselineCostEur`
- `allocatedChargeMinutes`
- `baselineAllocatedMinutes`
- `chargingPowerKw`
- `baselineAllocationComplete`
- `baselineIncompleteReason`

Decision logs are deduplicated by `SmartChargeLastLogKey`. Critical lifecycle
events are always written.

## Private Raw Data And Public Dashboard

Keep raw data private:

- Do not publish the `Events` sheet.
- Do not publish `Sessions` rows containing exact timestamps unless you are
  comfortable sharing home arrival and departure patterns.
- Do not publish device IDs, sheet IDs, webhook URLs, or tokens.

For public sharing, use one of these approaches:

- Create a separate public dashboard workbook and import only aggregate values.
- Or keep a `Public Dashboard` sheet in the private workbook and publish only a
  filtered chart or dashboard that excludes raw session details.

Recommended public fields:

- Total sessions.
- Estimated average price.
- Estimated monthly cost.
- Charging hours by broad time bucket.
- Last update date rounded to a coarse period.

Avoid public fields with exact connection timestamps, exact departure patterns,
session IDs, or device identifiers.

## Public dashboard and webhook limits

Use [Public dashboard](PublicDashboard.md) and [Dashboard design](Dashboard.md)
for sanitized publishing. No installation-specific workbook URL is included here.

The template does not implement signed payloads, shared-secret fields or Homey
identity verification. A URL alone is not strong sender authentication. Inspect
Google deployment access and test that Homey can post under the selected mode;
do not assume Google-login-only access works with this logger. Keep the URL/raw
data private, monitor unsolicited writes, and use a workbook copy for setup/tests.
