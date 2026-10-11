# Project structure

The production source is concatenated by
[build-homey.js](scripts/build-homey.js) in path order plus one entrypoint. It is
HomeyScript code, not a Node application. Generated scripts/logs/backups are local
artifacts excluded from Git. Current version: 0.6.4+build.17; license: MIT.

```text
src/
  00-config/              configuration and committed build metadata
  10-core/                utilities, time, Logic access, charging/session helpers
    planner/              continuous/multi-window models, selection, cost estimates
    runtime/              provider/runtime model and durable manual model
    stability/            pure policy, shadow evaluation and persistence
  20-adapters/            Tibber, Homey device access and adapter placeholders
  30-logger/              SmartChargeLogger, payloads, deduplication, best-effort webhook
  40-runtime/             Runtime Controller, Manual Charging, canonical decision
  90-flows/               twelve executable HomeyScript entrypoints
scripts/
  build-homey.js          release-authoring or reproducible --reuse-version builds
  release-artifact.js     source-to-bundle and artifact validation
  homey-deployment.js     guarded existing-ID installation and explicit rollback
  homey-discovery.js      GET-only inventory and private snapshots
  homey-flow-audit.js     conservative writer/trigger inventory
  homey-mercedes-audit.js cached timestamps and Connection Evidence wiring
  verify-release-source.js authenticated GitHub artifact provenance
  prepare-private-deployment.js allowlisted local private repository scaffold
  homey/                 optional legacy timestamp helper
  google-apps-script/     sanitized Google Sheets webhook/materializer template
tests/                   unit, manual regression, artifact/deployment/provenance tests
simulator/
  runner.js              scenario CLI
  runtime/               Homey/Tibber mocks, fixed clock, loader, log writer, shadow state
  fixtures/              Tibber prices and expected log payloads
  scenarios/             94 JSON regression scenarios
  logs/                  generated private/local JSONL, CSV, HTML and payload reports
.github/workflows/       public GitHub-hosted CI and manual release publication
deployment/private-repository/ inactive private Windows deployment workflow template
docs/                    public setup, contracts, research and planned milestones
assets/images/           sanitized README hero and image privacy guidance
dist/                    twelve ignored bundles and local release artifact; tracked README
backup/                  private ignored snapshots/journals/scaffold staging
diagnostics/             private ignored reports, evidence and audit results
```

## Important boundaries

The pure [manual model](src/10-core/runtime/20-manual-model.js) owns evidence/timers;
[manual runtime](src/40-runtime/15-manual-runtime.js) persists safety/intent and
orchestrates controls. [Runtime Controller](src/40-runtime/10-runtime-controller.js)
collects device evidence and routes Actuator commands through the shared gate.
That shared code does not serialize independent HomeyScript VMs.

[ChargePlan](src/10-core/planner/20-charge-plan.js) is a flat compatibility model;
[estimated costs](src/10-core/planner/65-estimated-cost.js) use exact allocated
minutes and nominal power. The empty/reserved adapter/export modules are boundaries,
not implemented independent integrations. Stability recommendations remain shadow-only.

Each entrypoint finishes with `return await main();`. The
[twelve output names/roles](dist/README.md) are canonical. The
[legacy timestamp helper](scripts/homey/SESSION%20-%20Save%20ConnectedAt.js) is not
generated and must not run alongside active lifecycle ownership.

The [Apps Script template](scripts/google-apps-script/SmartChargeLogger.gs) belongs
under `scripts/`, not a root `google-apps-script/` directory. It appends Events and
materializes Sessions; Statistics/dashboard formulas require operator setup.
Scenario `ChargeConnectedAt` values use local `YYYY-MM-DD HH:mm:ss`; price grids
are anchored by `priceAnchor` or `now`. Logs (`events.jsonl`, `events.csv`,
`events.html`, actual payload snapshots) are ignored and never public evidence.

Use [README](README.md) as the documentation index. No tracked AGENTS.md,
CONTRIBUTING.md or `.github/**/*.md` exists at the time of this audit.
