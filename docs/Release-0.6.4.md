# SmartCharge 0.6.4 — update from 0.6.3+build.16

Version: **0.6.4+build.17**; release source commit: `5fcff0e`.
All twelve bundles were installed in one controlled Homey installation on
2026-10-11 using existing Script IDs, followed by per-script and full-set SHA-256
readback. Names, API compatibility mode, Flow references and SmartCharge Logic
were preserved. Installation did not run scripts/devices or enable Flows.
Supervised operational testing remains pending. Private evidence stays outside Git.

## Corrections

- LOW_POWER is <=5 W after confirmed consumption, across >=180 seconds.
- Two fresh plug samples >500 W, >=30 seconds apart, confirm START_CONFIRMED.
  A five-minute watchdog no longer discards the first sample solely because of cadence.
- Sample freshness is 60 seconds; `manualObservationGapSeconds` is 360 seconds.
  Missing, stale and invalid observations reset pending evidence and never become 0 W.
- MAX_DURATION remains 360 minutes from original activation, including restart.
- Actuator ACK and subsequent lifecycle telemetry leave `plugOn`/`plugPower` unknown
  instead of pre-command or synthetic values. Messages distinguish request snapshot
  from ACK; ACK is not a physical measurement.

## Installation set

All twelve generated bundles change because shared config/model/runtime sources
are concatenated into every bundle, beyond the version header. Use one verified
`dist/release` artifact, with `manifest.json` and `SHA256SUMS`:

1. `SMARTCHARGE - Connection Evidence.js`
2. `SMARTCHARGE - Runtime Controller.js`
3. `SMARTCHARGE - Run Decision.js`
4. `SMARTCHARGE - Reset Session.js`
5. `SMARTCHARGE - Start Session.js`
6. `SMARTCHARGE - Log On.js`
7. `SMARTCHARGE - Log Off.js`
8. `SMARTCHARGE - State Sync.js`
9. `SMARTCHARGE - Manual Override On.js`
10. `SMARTCHARGE - Manual Override Off.js`
11. `SMARTCHARGE - Auto Mode.js`
12. `SMARTCHARGE - Stability Debug.js`

This is the manifest/build order used by the client. Writers remain disabled
throughout; no ordering makes a mixed-version set safe to execute. Entry files did
not change in the corrective commit. Stability Debug remains read-only.

## Update procedure

Use [Homey deployment](HomeyDeployment.md) for maintenance, approved-ID dry-run,
fresh attestation, preflight, new private backup, code-only PUT/readback, whole-set
verification and separate rollback approval. Preserve saved Logic/manual state,
block/token and timestamps. Never rebuild an approved artifact or bump metadata.

A correctly migrated 0.6.3 installation needs **no new Logic variables, Flow
schema, Apps Script update or Events/Sessions column migration** for this release.
Retain one five-minute watchdog. Audit the actual Connection Evidence trigger/action
and remove duplicate/direct writers; incorrect configuration needs manual correction.
The client never changes Flows. Dashboard behavior has not been revalidated.

## Limits and validation

LOW_POWER samples span >=180 seconds, not continuous observation. At five-minute
cadence it is usually recognized on a subsequent tick; timing is not guaranteed.
Recovery between ticks can be missed and a long vehicle pause can end Manual
Charging. Timestamp-less/stale data cannot confirm start/LOW_POWER. USER_STOP and
the original six-hour deadline remain available on invocation.

Auto Mode requires explicit permission, inactive manual work, safe plug state and
fresh trustworthy connection evidence plus SOC below 100. Restored Mercedes
service alone proves neither freshness nor connection. Never replace old timestamps
with current time. RuntimeLock remains a best-effort lease; strict serialization
and physical OFF from ACK are not guaranteed.

Local checks cover lint/format, unit suites, 52 manual lifecycle cases, 112 terminal
cases, 94 simulator scenarios, twelve reuse-version builds and complete source/
metadata/syntax validation. Tooling adds offline release checks, 22 deployment mock
and 10 provenance cases. These do not replace hardware acceptance.
