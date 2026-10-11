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
- Keep `backup/`, `diagnostics/`, maintenance attestations, Flow audits, Logic
  snapshots, approved provenance and local release/download artifacts out of Git.
  They may contain embedded script/Flow credentials as well as private device data.
- Windows private storage needs appropriate ACLs; POSIX file mode 0600 is not a
  substitute. Avoid credentials in shell history/transcripts and never print tokens.
- Public CI uses hosted runners only. Homey credentials and LAN self-hosted runners
  belong exclusively in a protected separate private deployment repository.
- `.gitignore` does not remove already tracked secrets or historical exposure.
  Review the publishable diff/history; revoke an exposed credential rather than
  assuming a later deletion makes it private again.

## Automated publication checks

`npm run check:public` checks indexed and working-copy tracked content for targeted
credential patterns and forbidden local-output paths. `npm run verify` runs it in
public CI. Artifact verification also scans all 14 allowlisted regular files.
This is a targeted guard, not a complete secret detector or a history audit.
Review screenshots, identifiers and new credential formats manually. The current
Homey token is also checked when provided in the process environment; it is never
printed.

Temporary Codex diagnostics are ignored. Reviewed, synthetic permanent fixtures
and tests may live in `diagnostics/fixtures/` and `diagnostics/tests/`; useful
findings belong in English documentation and regression tests. The separate-scope
RuntimeLock race is retained as `tests/runtime-lock-race.test.js`, documenting
why external execution serialization remains required. Original local evidence
is preserved privately.
