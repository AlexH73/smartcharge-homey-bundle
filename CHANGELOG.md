# Changelog

All notable SmartCharge Homey Bundle changes should be documented here.

The project follows semantic release tags such as `v0.4.0`, `v0.5.0`, and
`v1.0.0`.

## Unreleased

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
