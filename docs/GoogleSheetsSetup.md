# Google Sheets Setup

SmartCharge can write lifecycle and decision events to a Google Apps Script web
app. The public repository contains only a template. You must provide your own
spreadsheet ID and deploy your own webhook.

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
4. Copy `google-apps-script/SmartChargeLogger.gs` into the Apps Script editor.
5. Replace `YOUR_GOOGLE_SHEET_ID` with your private spreadsheet ID.
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

Important payload fields:

- `sessionId`
- `loggedAt`
- `battery`
- `currentPrice`
- `connectedAt`
- `targetDeparture`
- `plannedStart`
- `plannedEnd`
- `shouldChargeNow`
- `plugOn`
- `plugPower`
- `reason`
- `averagePrice`
- `totalPrice`
- `priceCount`
- `source`
- `engineVersion`
- `detailsJson`
- `plannerMode`
- `windowCount`
- `chargeWindowsText`
- `chargeWindowsJson`

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

## Live Dashboard Link

Public dashboard:
[SmartCharge Google Sheets dashboard](https://docs.google.com/spreadsheets/d/1LueN5IylHuwcnuLIB12EAuqa7fByK7iZOU74kFAOX6c/edit?usp=sharing)
