# SmartCharge 0.6.11 full charge estimates and Session stop summaries

Prepared **0.6.11+build.29** on 2026-11-07. Not installed yet.
Installed Homey baseline remains 0.6.10+build.28.

Artifact: `dist/release-0.6.11-build.29`. Manifest SHA-256:
`8ff5f34699c35cc074ad3683553866882fcb92f97d3efd34d51d66de69613f37`.

Automatic planning now uses the full rounded estimate, without the former
300-minute cap. At SOC 11%, factor 3.3 and reserve 15 minutes, the estimate is
310 minutes and six hourly tariff slots. Departure constraints and price coverage
still apply; reaching 100% physically depends on telemetry and actual charging.
Manual Charging retains its independent 360-minute maximum.

The Apps Script materializer now records the latest stop time and available SOC
while a Session is active, including multiple tariff or preconditioning windows.
Final values survive subsequent driving telemetry and repeated OFF events after
disconnect. A completion decision before the final OFF still permits that OFF's
timestamp to be recorded. A lower final SOC clears a stale positive battery delta.
No new columns or Logic variables are required.

The known stale Session row was repaired from its last OFF event separately;
no generic historical replay is performed. Publish the Apps Script source through
the existing deployment, preserving its URL, configuration and access settings.
Save the installed source/version/configuration before replacing it.

Install Homey using [controlled deployment](HomeyDeployment.md), with fresh
operator confirmations, backup, preflight and twelve-script readback. Preserve
the Session and climate state. Restore controls and AUTO only after separate
authorization, then verify the recalculated plan and current charge duration.

Validation: `npm run verify` passed for these behavior changes, including 98
simulator scenarios and multi-window/terminal materializer regressions.
