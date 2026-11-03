# SmartCharge 0.6.6 recovery

Version: **0.6.6+build.19**. Source base: merged develop `5b29b00`.
Release metadata and controlled-maintenance tooling changes are uncommitted.
No commit, push, tag or GitHub Release was created.

## Installed changes

The merged automatic-lifecycle changes calculate preliminary tariff plans while
AUTO is blocked, without creating a Session or granting permission to energize
the plug. Explicit AUTO and fresh vehicle evidence remain required for a new ON.
Transient missing SOC preserves existing measured charging. Tibber requests have
bounded execution time and do not prevent safety OFF handling.

All twelve scripts were updated by existing ID on 2026-11-03 using the local
deployment client. Per-script and full-set SHA-256 readback passed; names,
compatibility modes and SmartCharge Logic were preserved. The legacy duplicate
Stability Debug was excluded using the previously recorded explicit ID selection.
The previous twelve scripts matched the immutable 0.6.5+build.18 artifact.

Artifact: `dist/release-0.6.6-build.19`. Manifest SHA-256:
`c176e8ad5b768821d72fd06f2bf43f29f62f35917d7897b1f5ceabc5e7278de9`.
This was a locally authorized installation, not a GitHub provenance deployment.
Private backups, selection, operator confirmation and journals remain under
ignored `backup/homey/`.

## Operational findings

The retained manual record was COMPLETED with BATTERY_FULL and no AUTO grant;
AutoStartBlocked was true. The controller therefore did not create a Session.
Mercedes showed retained SOC and Charge break, but their capability timestamps were
older than two hours. A standard refresh and explicit AUTO attempt did not change
those timestamps or clear the block.

The disabled Connection Evidence Flow had disconnected cards and a cron trigger.
It now uses the real connector_connected event and invokes the dedicated
Connection Evidence script. It is enabled, alongside the restored five-minute
Runtime Controller and manual/AUTO controls. Legacy direct writers stay disabled.
A manual-only Refresh Vehicle Flow invokes the installed Mercedes refresh_data
action without notifications or actuator commands.

The new runtime calculated a preliminary tariff plan, while preserving the AUTO
block and an empty Session. This verifies planning in Homey, not charging or new
Session creation. Fresh vehicle evidence and supervised AUTO recovery are still
required; capability timestamps must not be fabricated to bypass the guard.
This intermediate installation was superseded by [0.6.7](Release-0.6.7.md), which
distinguishes unchanged values from device responsiveness and verified real
Session creation.

## Validation

`npm run verify` completed successfully both before the version change and for
0.6.6: lint, formatting, unit/regression suites, 95 simulator scenarios, twelve
source/bundle checks, release checks and deployment mocks. The local deployment
preflight and real installation returned PREFLIGHT_READY_NO_PUT and VERIFIED,
respectively. Hardware charging acceptance has not passed.
