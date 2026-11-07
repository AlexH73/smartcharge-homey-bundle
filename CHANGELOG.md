# Changelog

All notable SmartCharge Homey Bundle changes should be documented here.

The project follows semantic release tags such as `v0.4.0`, `v0.5.0`, and
`v1.0.0`.

## 0.6.11 - 2026-11-07

Prepared **0.6.11+build.29**; installation and live plan recalculation pending.

### Fixed

- Keep the latest automatic stop time and available stop SOC across multiple
  charging windows in Sessions. Preserve final values after completion or
  disconnect, and clear a stale positive battery delta when the final SOC is lower.
- Remove the 300-minute automatic planning cap: use the full rounded charging
  estimate and corresponding tariff slot count to reach the target SOC.
  Manual Charging retains its independent maximum duration.

## 0.6.10 - 2026-11-06

Installed **0.6.10+build.28**; twelve hashes/IDs/names/API modes verified.
Controls and AUTO restored; the existing waiting Session and plan verified.
See [expected-cut recovery](docs/Release-0.6.10.md).

### Fixed

- Permit one guarded tariff/climate recovery from Failure after a recorded,
  successful ordinary automatic OFF, with fresh integration evidence and a
  durable attempt reservation. Keep unknown/pre-existing Failure blocked for ON.
- Stop unconfirmed recovery on the watchdog and preserve idle-load, USER_STOP,
  lease, Session and expiry checks. Preserve OFF ACK before cut-state errors.

## 0.6.9 - 2026-11-06

Installed **0.6.9+build.24**; all twelve hashes/IDs/names/API modes verified.
Controls and AUTO restored; the existing waiting Session and plan verified.
Earlier candidates are superseded.
See [preconditioning behavior and acceptance](docs/Release-0.6.9.md).

### Added

- Power for operator-started Mercedes preconditioning outside tariff windows,
  including at full or unavailable SOC, without creating a charging Session or
  calling Tibber. Resume the saved charging lifecycle after climate ends.
- Fresh Boolean climate observations, repeat checks before/after ON, and
  preconditioning regression coverage. USER_STOP and AUTO permission retain priority.
- Durable idle-load protection: 5 W / 180-second stop, startup timeout and lost
  power observations deny repeated automatic ON on retained climate data.
  Requires the new `SmartChargePreconditioningState` string Logic variable.

### Fixed

- Avoid phantom automatic charging Sessions at full or unknown SOC.

## 0.6.8 - 2026-11-04

Installed **0.6.8+build.21**; all twelve scripts verified by SHA-256 readback.
Controls and AUTO were restored; the existing Session and waiting plan were
verified. See
[release status](docs/Release-0.6.8.md).

### Fixed

- Prioritize fresh explicit connector disconnection over retained charging data;
  ignore stale vehicle charging evidence when confirming a disconnect.
- Calculate the nearest configured departure after the saved connection time,
  including connections after midnight, weekends and DST transitions.

## 0.6.7 - 2026-11-03

Installed **0.6.7+build.20**, with all twelve scripts verified by SHA-256 readback.
Explicit AUTO created a real Session and the runtime entered its waiting plan.
Scheduled physical charging remains unverified. See [recovery status](docs/Release-0.6.7.md).

### Fixed

- Automatic SOC/connection checks distinguish unchanged capability values from
  an unresponsive Mercedes integration. A fresh lastSeenAt from the available,
  warning-free Mercedes device can support retained nonempty SOC/status values.
  Original capability timestamps remain visible separately in diagnostics.
- Reject missing, stale or future heartbeat timestamps, unknown providers and
  unavailable/warning devices as heartbeat evidence. Manual power/SOC confirmation
  still uses the original per-capability timestamps.
- Add a parked-vehicle AUTO regression and heartbeat boundary/failure cases.

## 0.6.6 - 2026-11-03

Local recovery release **0.6.6+build.19** from merged automatic-lifecycle changes on
develop. All twelve scripts were installed and verified by SHA-256 readback on
2026-11-03. Automatic Session creation and hardware acceptance remain pending
fresh Mercedes telemetry. See [recovery status](docs/Release-0.6.6.md).

### Fixed

- Calculate preliminary tariff plans while automatic charging is blocked, without
  granting permission, creating a Session or energizing the plug.
- Require explicit AUTO authorization and fresh vehicle evidence for a new ON;
  preserve an existing charging Session during transient missing SOC.
- Bound Tibber requests and preserve safety OFF handling during planning failures.

### Changed

- Include controlled-maintenance deployment checks with explicit physical isolation
  and operator evidence; retain strict maintenance as the default.
- Rebuild all twelve scripts together; preserve existing Script IDs and API modes.

## 0.6.5 - 2026-10-12

Corrective release **0.6.5+build.18**, prepared from merged PR #1. All twelve
bundles are rebuilt as a new release; installation and hardware acceptance remain
pending. See [update procedure](docs/Release-0.6.5.md).

### Fixed

- Preserve ON/OFF ACK order during USER_STOP compensation; force recovery OFF
  despite stale cached OFF or unknown ON outcome, with no logger-driven command retry.
- Derive release approval from trusted tag/commit metadata and independent manifest
  digest; verify schema-1 artifacts independently of tooling checkout version.
- Check source candidates without replacing the installed 0.6.4+build.17 artifact.
  Runtime corrections require a new separately authorized release and deployment.

### Added

- GitHub-hosted CI, immutable artifacts and manual public release workflow.
- Local Secure HomeyScript 3.6.3 client: inventory/dry-run/preflight, private backup,
  existing-ID code-only updates, SHA-256 readback, separate rollback and Flow audit.
  No create/delete/run endpoints or automatic rollback.
- Authenticated source/commit/tag/CI artifact provenance and separate private Windows
  deployment repository scaffold. The repository/runner is not created or tested.
- Offline release checks, 23 deployment mock and 14 provenance test cases.

### Changed

- Consolidate public documentation in English and preserve concurrency research.
- Exclude private diagnostics, backups, Logic snapshots and deployment artifacts.

## 0.6.4 - 2026-10-11

### Fixed

- Manual start evidence survives five-minute watchdog invocations with a 360-second
  observation gap; individual samples must still be fresh within 60 seconds.
- LOW_POWER uses <=5 W samples spanning >=180 seconds after START_CONFIRMED;
  missing/stale/invalid samples reset pending evidence and never become 0 W.
- Actuator ACK telemetry no longer reuses pre-command power/state or invents OFF.

### Changed

- All twelve bundles use `0.6.4+build.17`; MAX_DURATION remains 360 minutes from
  activation. Correctly migrated 0.6.3 needs no new Logic/Flow schema or Apps Script.
- Controlled installation/readback completed in one Homey installation; supervised
  charging acceptance and unattended readiness remain pending. Flow references and
  SmartCharge Logic were preserved; Flows were left disabled.

## 0.6.3 - 2026-10-11

### Added

- Deployment checklist, rollback plan and concurrency entry-point audit
  (originally Russian; now consolidated into English documentation).
- Final local release validation for all twelve `0.6.3+build.16` bundles.

### Changed

- Clarify ordinary Flow trigger consolidation and the limits of Logic leases.
- This release prepares the existing manual fix for supervised deployment;
  at that preparation stage Homey, deployed Flows and Google Sheets had not changed.

## 0.6.2 - 2026-10-11

### Added

- Independent, durable manual charging lifecycle and explicit Auto Mode.
- Fresh plug-power confirmation, LOW_POWER stop and six-hour maximum duration.
- Terminal recovery regression tests and Homey execution serialization research.

### Fixed

- Automatic ON after every manual terminal reason, including restart and legacy
  entry points. Manual ON preserves the automatic block.
- Partial persistence recovery and stale/future telemetry safety checks.

### Changed

- Release review bundles use `0.6.2+build.15`; Homey Flow migration is required.
- Manual Events/Sessions materialization preserves ready/charging/terminal states.
- This version is locally validated; real Homey deployment validation is pending.
  Runtime Logic ownership remains a best-effort lease, not a strict mutex.

## 0.6.1 - 2026-08-31

### Added

- Runtime controller with Mercedes connection-evidence handling and actuator
  reconciliation.
- Estimated charging-cost and savings telemetry.
- Planner stability primitives, policy, diagnostics, and persistent live shadow.
- Multi-window charging plans with separated cheap slots.
- Expanded simulator and unit-test coverage, including reconnect and runtime
  failure scenarios.

### Changed

- Homey runtime decisions now use the canonical planner and runtime lifecycle.
- Generated HomeyScript bundle version is `0.6.1+build.13`.

### Fixed

- Hardened disconnect actuator sequencing.
- Preserved completed sessions during telemetry reset.

## 0.3.42

### Added

- Modular HomeyScript source layout.
- HomeyScript build pipeline.
- SmartCharge lifecycle flows.
- Google Sheets logging contract.
