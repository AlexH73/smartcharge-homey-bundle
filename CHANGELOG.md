# Changelog

All notable SmartCharge Homey Bundle changes should be documented here.

The project follows semantic release tags such as `v0.4.0`, `v0.5.0`, and
`v1.0.0`.

## Unreleased

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
