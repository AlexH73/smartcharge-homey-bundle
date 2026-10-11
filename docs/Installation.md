# Installation and configuration

Baseline: **SmartCharge 0.6.4+build.17**. This page owns prerequisites, Logic initial
values and local build commands. [Homey Flows](HomeyFlows.md) owns topology;
[Homey deployment](HomeyDeployment.md) owns approved artifact installation/rollback;
[operational acceptance](HomeyDeploymentReadiness.md) owns supervised testing.
No build changes Homey or Google Sheets.

## Requirements and integration boundary

- Homey with HomeyScript. The API client intentionally supports installed
  HomeyScript **3.6.3** only; another version blocks deployment.
- A plug/charger switch exposing `onoff`; fresh, trustworthy `measure_power`
  timestamps are needed for Manual Charging start and LOW_POWER detection.
- For Automatic Charging: battery `measure_battery`, trustworthy connected/charging
  evidence and timestamps, and Tibber API access. The current observed provider is
  Mercedes-Benz; compatible alternatives require validation of mappings/units/events.
- Required Homey Logic listed below. Manual Charging is independent of Tibber and
  an automatic Session, but still requires the safety/runtime variables.
- Optional private Google Sheets webhook and Apps Script materializer.
- Node.js 22 and npm for local tooling/CI. Windows PowerShell examples assume the
  repository root. The private deployment runner uses PowerShell 7 (`pwsh`).

## Configuration

[CONFIG](../src/00-config/10-config.js) contains timezone (`Europe/Berlin`),
departure times, charge estimates, thresholds and device-name matchers. Existing
identifiers `mercedesDeviceNameIncludes` and `plugDeviceNameIncludes` are retained.
Device lookup first checks a unique normalized exact name, then a unique partial
match; duplicates fail rather than selecting the first device. Configure another
installation privately and validate any newly built identity before approval.
Do not silently modify an already approved release artifact.

`ChargeFactor` means estimated minutes per missing battery percentage point.
`ChargeReserve` is added charging time in **minutes**, not a battery percentage;
the legacy telemetry name `chargeReservePct` remains for compatibility.
`chargingPowerKw=2.6` is nominal power for estimated cost only. Automatic planning
uses `maxChargeMinutes=300`; the separate Manual Charging maximum is 360 minutes.
Tibber uses the first home returned by the configured GraphQL query: validate this
selection for multi-home accounts; there is no automatic tariff-provider selector.

## Homey Logic variables

Text `null` below means the literal four-character string, not an absent variable.
Initialize only a new installation/migration with all writers disabled and physical
OFF. Never overwrite existing activation, terminal, token, Session or lease values
on startup or during a 0.6.3 -> 0.6.4 update.

| Name | Type | Initial/example value | Purpose |
| --- | --- | --- | --- |
| `TIBBER_ACCESS_TOKEN` | Text | `YOUR_TIBBER_TOKEN` | Private Automatic Charging credential. |
| `SMARTCHARGE_LOG_WEBHOOK_URL` | Text | `YOUR_WEBHOOK_URL`, or `null` for no sink | Private optional logging URL. |
| `SmartChargeLastLogKey` | Text | empty string | Decision log deduplication. |
| `ChargeConnectedAt` | Text | `null` | Automatic Session identity, local `YYYY-MM-DD HH:mm:ss`. |
| `ChargeFactor` | Number | `2` | Minutes per missing battery percentage point. |
| `ChargeReserve` | Number | `20` | Additional reserve minutes. |
| `ChargeMinutes` | Number | `0` | Planner output. |
| `ChargeSlots` | Number | `0` | Planner output. |
| `ChargeQuarters` | Number | `0` | Legacy compatibility output. |
| `ChargeHoursAhead` | Number | `0` | Planner output. |
| `SmartChargePlannedStart` | Text | `null` | Planner output. |
| `SmartChargePlannedEnd` | Text | `null` | Planner output. |
| `SmartChargeShouldCharge` | Boolean / Yes-No | `false` | Planner proposal, not automatic permission or physical state. |
| `SmartChargeReason` | Text | empty string | Decision explanation. |
| `SmartChargeTargetDeparture` | Text | `null` | Planner output. |
| `SmartChargeSessionStatus` | Text | empty string | Optional status output. |
| `SmartChargeRuntimeMode` | Text | `shadow` during preparation | Set `active` only after full installation/topology review; shadow is not a global kill switch. |
| `SmartChargeConnectionEvidenceAt` | Text | `null` | Single-use UTC ISO trustworthy event evidence. |
| `SmartChargeDisconnectObservedAt` | Text | `null` | Persisted suspected-disconnect observation. |
| `SmartChargeManualMode` | Boolean / Yes-No | `false` | Manual intent, not START_CONFIRMED. |
| `SmartChargeManualState` | Text | JSON below | Required durable Manual Charging lifecycle. |
| `SmartChargeAutoStartBlocked` | Boolean / Yes-No | `true` | Required Durable Auto Block. |
| `SmartChargeRuntimeLock` | Text | `null` | Required best-effort lease, not mutex. |
| `SmartChargeUserStopToken` | Text | `null` | Required generation/token for Stop races. |
| `SmartChargeAcceptedStrategy` | Text | `null` | Live-shadow accepted strategy; unavailable state does not fail charging. |
| `SmartChargeStabilityDiagnostics` | Text | `null` | Latest non-authoritative shadow result. |

Initial `SmartChargeManualState`:

```json
{
  "version": 1,
  "status": "IDLE",
  "id": null,
  "startedAt": null,
  "confirmedAt": null,
  "highPowerAt": null,
  "lastPowerAt": null,
  "lowPowerSince": null,
  "endedAt": null,
  "stopReason": null,
  "error": null,
  "activationStopToken": null,
  "autoGrant": null
}
```

Missing/corrupt required safety state fails closed. Old terminal records without a
valid explicit grant remain blocked even if the Boolean block is false. Manual ON
preserves the block; only explicit Auto Mode can grant Automatic Charging after
safe-state and freshness checks. Missing power timestamps prevent START_CONFIRMED/
LOW_POWER; USER_STOP and the original six-hour deadline still act on invocation.

Compatibility for an old running record without `activationStopToken` permits
continuation only when its original Boolean block is false; an ambiguous blocked
record fails closed. Do not reset the record or manufacture a token to bypass recovery.

## Reproduce and validate the committed release

```powershell
npm ci
npm run verify
npm run build:homey -- --reuse-version
node scripts/release-artifact.js create
node scripts/release-artifact.js verify dist/release
```

`--reuse-version` preserves both committed build number and timestamp. All twelve
bundle names/roles are listed in [dist documentation](../dist/README.md). The
artifact contains those twelve files, `manifest.json` and `SHA256SUMS`. Generated
files stay outside Git; an artifact is approved separately from source changes.

An ordinary `npm run build:homey` or individual target build increments patch/build
metadata. `--release VERSION` intentionally sets a semantic version and advances
the build counter. These are release-authoring commands, not update instructions.
Do not bump version or rebuild during installation of an approved artifact.

## Setup order

1. Privately inventory existing scripts/IDs, Flows, Logic and every Actuator writer;
   independently confirm OFF and quiesce executions before any live configuration.
2. For a new installation only, prepare required Logic values and verified device
   matching. Existing state must be preserved and recovered rather than reset.
3. Validate source locally and approve one complete twelve-bundle artifact.
4. If logging is wanted, separately configure/test the
   [Apps Script template](GoogleSheetsSetup.md) on a private workbook copy. Migration
   from older manual code needs its updated materializer; correctly migrated 0.6.3
   needs no further Apps Script/column change for 0.6.4.
5. Existing installations: follow approved-ID API backup/preflight/PUT/readback in
   [Homey deployment](HomeyDeployment.md). First-time script creation is a separate
   manual setup: the client deliberately has no create endpoint.
6. Manually prepare [trigger-only Flows](HomeyFlows.md); leave them disabled after
   installation until separately authorized supervised acceptance.
7. Verify Stop, block persistence, power timestamps/cadence, restart and explicit
   Auto Mode before considering autonomous operation.

The optional [legacy timestamp helper](../scripts/homey/SESSION%20-%20Save%20ConnectedAt.js)
is not part of the twelve bundles and must not compete with active Runtime Controller.
