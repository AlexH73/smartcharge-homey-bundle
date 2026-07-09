# Privacy And Public Release Safety

This repository is intended to be public-safe. Keep local configuration and raw
runtime data outside git.

## Do Not Publish

- Raw event logs.
- Session IDs.
- Exact home arrival or departure patterns.
- Homey device IDs.
- Google Sheet IDs.
- Apps Script webhook URLs.
- Tibber access tokens.
- Homey tokens.
- Email addresses.
- Real private spreadsheet data.

## Recommended Data Separation

Use a private workbook for raw SmartCharge logs and a separate public dashboard
workbook, or publish only a filtered `Public Dashboard` sheet.

The private workbook can contain:

- `Events`
- `Sessions`
- `Statistics`

The public dashboard should contain only aggregate or filtered values that do
not reveal household routines or system credentials.

## Repository Rules

- Use placeholders such as `YOUR_GOOGLE_SHEET_ID`, `YOUR_WEBHOOK_URL`,
  `YOUR_TIBBER_TOKEN`, and `YOUR_HOMEY_VARIABLE_NAME` in committed examples.
- Keep `.env`, generated simulator logs, and generated `dist/` files out of
  public commits unless you intentionally publish a release artifact.
- Review docs and templates before publishing screenshots or dashboard links.
