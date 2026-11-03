# SmartCharge 0.6.7 parked-vehicle recovery

Installed: **0.6.7+build.20**, based on develop `5b29b00` plus the local heartbeat
fix. Installation used a locally reviewed working-tree build. No release tag or
GitHub Release was created; the immutable artifact identity is recorded below.

Artifact: `dist/release-0.6.7-build.20`. Manifest SHA-256:
`2649103e5db8e252b6e7b6c407f5e9ece2f3bc757ae24fe860e6c8179179a601`.
The installed 0.6.6+build.19 artifact remains intact for comparison and rollback.

## Fix

The operator confirmed that retained SOC and connected charging status were current.
The available Mercedes device had a fresh lastSeenAt even though its values had
not changed. Automatic SOC/connection checks now consider that separate heartbeat
for this provider. They retain the original capability change timestamps and
report the evidence source. No capability or connection-event timestamp is rewritten.

Heartbeat fallback requires the known Mercedes driver, available=true, no warning,
a valid nonempty capability and a non-future capability timestamp. It rejects
missing, invalid, future and older-than-30-minute heartbeats. Manual battery-full
confirmation and independent plug power samples retain their existing rules.

A device heartbeat is evidence of integration responsiveness; it does not prove
each retained attribute was independently remeasured. This provider limitation is
documented in [Runtime Controller](RuntimeController.md).

Tests cover parked-car AUTO creation with unchanged values, denial of new ON after
the heartbeat goes stale, exact freshness boundaries, unknown drivers,
missing values/timestamps, warnings and unavailable devices.

## Verification

`npm run verify` passed: lint, formatting, regression suites including the new
parked-vehicle cases, 95 simulator scenarios, source/bundle validation and
deployment/release checks. Preflight passed and installation returned VERIFIED
for all twelve scripts. A subsequent independent readback matched every hash,
Script ID, name and compatibility mode.

Runtime/manual/AUTO controls and the repaired connection-event Flow were restored.
After a provider refresh, explicit AUTO created a real active Session and granted
automatic permission. The runtime calculated a waiting plan, left the plug OFF
outside its window, and released its execution lease. Real scheduled charging and
full unattended hardware acceptance remain unverified. Private telemetry, exact
Session timestamps, backup and installation journals stay in ignored backup files.
