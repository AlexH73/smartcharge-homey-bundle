# SmartCharge Homey Bundle

SmartCharge is an open-source HomeyScript charging controller that combines Homey
device telemetry with Tibber prices. It compares continuous and multi-window plans,
controls a charging plug, and optionally logs events to Google Sheets.
Manual Charging has an independent persisted lifecycle and does not require Tibber
or available vehicle telemetry to start or stop.

Prepared corrective release: **0.6.5+build.18**, containing the Actuator correction
and release metadata contract merged through PR #1. See the
[0.6.5 update procedure](docs/Release-0.6.5.md). It has not been deployed.
Installed release baseline: **0.6.4+build.17**. All twelve baseline bundles have been installed in
one controlled Homey installation and verified by readback. This proves code
installation, not unattended charging readiness; supervised operational acceptance
is still pending. The private GitHub deployment repository/runner has not been
created or tested. See [release notes](docs/Release-0.6.4.md) and
[deployment status](docs/HomeyDeployment.md).

## Capabilities

- Automatic Charging selects continuous or separated low-price windows before departure,
  with latest-safe-start fallback.
- Manual Charging persists activation, start confirmation and stop reasons across
  watchdog invocations and restarts.
- A Durable Auto Block prevents Automatic Charging after manual termination until
  the operator explicitly selects Auto Mode.
- The Runtime Controller reconciles Session lifecycle, decisions and Actuator state.
- Optional Google Apps Script materializes private Events and Sessions; cost and
  savings estimates use planned minutes and nominal power, not metered energy.
- Offline unit tests, regression scenarios and deployment mocks exercise the real
  source entrypoints without contacting Homey, Tibber or Google Sheets.

## Architecture and integrations

```text
Homey vehicle integration + charging plug telemetry
  -> trigger-only Homey Flows / Homey Advanced Flows
  -> Connection Evidence / explicit controls / Runtime Controller
       |-- independent Manual Charging lifecycle + Durable Auto Block
       |-- automatic Session lifecycle + Tibber continuous/multi-window planner
       |-- shared Actuator command gate
       `-- optional Google Apps Script -> Events -> Sessions
                                             -> Statistics -> filtered Dashboard
```

Mercedes-Benz is the observed vehicle integration, not a required provider in the
planner architecture. The current adapter uses Mercedes-oriented configuration
names and known capability mappings. Another integration needs compatible battery,
connection/charging capabilities, units and trustworthy timestamps, plus local and
supervised validation; arbitrary providers are not certified plug-and-play.

## Install and configure

Use Node.js 22 (the CI version), npm, Homey with HomeyScript, a controllable `onoff`
plug and the Logic variables in [Installation](docs/Installation.md). Fresh plug
power is required for manual start/LOW_POWER detection. Automatic Charging also
needs trustworthy vehicle/connection telemetry and Tibber access.

```powershell
npm ci
npm run verify
node scripts/release-artifact.js verify dist/release '<APPROVED_MANIFEST_SHA256>' '<APPROVED_RELEASE_TAG>'
```

`verify` checks candidate sources without rewriting the installed release. The
artifact verification command requires an independently approved digest and tag.
Do not run an ordinary or single-target build before installing an already approved
artifact: those builds change release metadata.

Configure device matching, timezone and charging estimates in
[CONFIG](src/00-config/10-config.js); put Tibber credentials and an optional webhook
in private Homey Logic. Keep the plug OFF and all writers in maintenance while
preparing the complete bundle set and [Homey Flows](docs/HomeyFlows.md).
Existing installations must update code by existing Script ID and preserve names,
compatibility mode and saved safety state. Follow the separate operator approvals,
backup and readback procedure in [Homey deployment](docs/HomeyDeployment.md).

## Limits and security

The five-minute watchdog uses sampled evidence. Manual START_CONFIRMED needs two
fresh plug samples above 500 W, at least 30 seconds apart. LOW_POWER needs independent
samples at or below 5 W spanning at least 180 seconds after confirmed consumption.
Each sample must be at most 60 seconds old; observation gaps must not exceed
360 seconds. Recovery between ticks can be missed. MAX_DURATION is 360 minutes
from activation, enforced on a runtime invocation, not a hardware cutoff.

`SmartChargeRuntimeLock` is a best-effort Logic lease, not a global mutex or command
queue. Independent executions and external writers can race. A command ACK does
not prove physical OFF. Keep independent electrical/EVSE protections and an
operator-accessible stop; do not infer unattended readiness from passing mocks.

Use Local Secure HTTPS with certificate verification. Keep Homey/Tibber tokens,
webhooks, backups, Logic snapshots and raw telemetry private. Public CI runs on
GitHub-hosted runners; a LAN Windows runner belongs only in a separate protected
private deployment repository. [Privacy guidance](docs/Privacy.md) describes data
boundaries. Public dashboards should contain aggregates only.

## Tests and development

```powershell
npm run verify
npm run test:deployment
npm run simulate -- overnight
node simulator/runner.js --list
```

`verify` runs lint, formatting, unit/regression suites, 94 simulator scenarios,
all twelve reproducible builds, release checks and deployment/provenance mocks.
The manual suites cover 52 lifecycle and 112 terminal cases; deployment mocks
cover 22 cases and provenance tests cover 10 cases. These are local checks, not
hardware acceptance or a completed GitHub deployment pipeline.

See [Development workflow](docs/DevelopmentWorkflow.md),
[Coding standards](docs/CodingStandards.md) and [Project structure](PROJECT_STRUCTURE.md).

## Documentation

- [Installation and configuration](docs/Installation.md)
- [Homey Flows](docs/HomeyFlows.md)
- [Runtime Controller](docs/RuntimeController.md)
- [Deployment and rollback](docs/HomeyDeployment.md)
- [Migration and operational acceptance](docs/HomeyDeploymentReadiness.md)
- [Execution serialization research](docs/HomeyExecutionSerialization.md)
- [Google Sheets setup](docs/GoogleSheetsSetup.md) and [Telemetry contract](docs/TelemetryContract.md)
- [Data model](docs/DataModel.md), [Dashboard design](docs/Dashboard.md) and [Public dashboard](docs/PublicDashboard.md)
- [Simulator](docs/Simulator.md), [ChargePlan design](docs/ChargePlan.md) and [Roadmap](docs/Roadmap.md)
- [Changelog](CHANGELOG.md) and [MIT license](LICENSE)
