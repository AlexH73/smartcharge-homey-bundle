# Public dashboard publishing

This page owns publishing guidance; [Dashboard](Dashboard.md) owns display/KPI
design and [Data model](DataModel.md) owns telemetry layers. Live workbook URLs
and raw installation data are deliberately absent. Dashboard availability/formulas
have not been verified by the current release or documentation audit.

Use a private workbook for Events -> Sessions -> Statistics. Publish only copied,
sanitized aggregate Statistics values to a separate public workbook, or a filtered
dashboard that does not grant access to private sheets. Publishing a chart and
granting access to its source workbook have different privacy effects; verify the
anonymous view and sharing settings before deliberately publishing.

Public-safe examples: total/completed session counts, planned hours, estimated
monthly costs/savings, average selected tariff, multi-window share, broad time
buckets and a coarsely rounded update date. Manual and automatic rows should be
distinguished where they affect aggregates. Savings are estimates from nominal
power/planned minutes, not metered realized savings.

Never publish raw Events, private Sessions, exact connection/departure/window
timestamps, session IDs, household routines, Homey device identifiers, private
Sheet IDs, Apps Script URLs or credentials. A public workbook URL is itself a
deliberate publication decision; use `YOUR_PUBLIC_DASHBOARD_URL` in examples
instead of copying an installation's identifier. See [Privacy](Privacy.md).
