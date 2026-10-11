# Roadmap

Baseline: SmartCharge 0.6.4+build.17. IMPLEMENTED describes source; TESTED LOCALLY
describes offline evidence; DEPLOYED describes code installation, not physical
charging certification. [Deployment status](HomeyDeployment.md) is the status owner.

## Implemented and locally tested

- Continuous/multi-window planning, adjacent-slot merging, latest-safe-start fallback.
- Estimated costs/savings from exact allocated minutes and nominal charging power;
  backward-compatible tariff score fields. No metered actual-energy/cost model.
- Runtime Controller lifecycle/reconciliation and trustworthy Connection Evidence.
- Independent durable Manual Charging, explicit Auto Mode and Durable Auto Block,
  corrected five-minute observation and ACK telemetry.
- Pure Plan Stability policy, simulator shadow and persistent live shadow/diagnostics;
  these recommendations do not change production charging decisions.
- Events/Sessions Apps Script materialization, including manual events and immutable
  initial estimates. Statistics formulas/dashboard publishing remain operator setup.
- 94 simulator scenarios plus unit/manual/deployment regression suites.
- Immutable release validation, guarded local API client, public workflow definitions
  and private deployment repository scaffold.

All twelve corrective bundles were installed/read back in one controlled Homey
installation. Supervised operational testing remains pending.

## Next validation and infrastructure work

- Separately supervise real Stop, restart/block persistence, sample cadence/driver
  timestamps, Manual Charging completion and Auto Mode acceptance.
- Obtain successful GitHub CI evidence after an authorized push/PR.
- Create/configure/test the private deployment repository, Windows runner and enforced
  Environment approvals; approve source SHA/tag/manifest/artifact provenance.
- Publish a GitHub Release only after separate authorization; do not treat scaffold
  preparation as an operational pipeline.
- Design and validate a true single-owner executor with durable intent, Stop priority
  and unknown-outcome recovery. [Research](HomeyExecutionSerialization.md) compares
  a Homey App queue with Flow and external coordinator options.

## Planned product/engineering work

- Active stability/hysteresis, meaningful revision counters, maximum replans/windows
  and minimum revision intervals, calibrated from operational data.
- Actual energy, actual charging duration and actual cost, weather/battery-temperature
  context, quality scoring and learning; preserve privacy and existing columns.
  [Historical telemetry extension proposal](milestones/TelemetryV2.md) remains useful.
- Dashboard plan/revision visualization and safe aggregate analytics/history.
- Missing-price, partial-Tibber, multi-home selection and timezone-edge hardening.
- Additional provider integrations with validated capabilities/units/timestamps.
- Maintain exact logger fixtures and scenario-first regression coverage; keep
  generated HTML reports, raw logs and fault-injection evidence private.
- Keep core deterministic and integration adapters thin as new requirements emerge.
