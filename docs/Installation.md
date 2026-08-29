# Installation

This project is a HomeyScript bundle. The repository contains source code,
simulator fixtures, public templates, and documentation only. It does not
contain private tokens, webhook URLs, sheet IDs, Homey device IDs, or local
Homey configuration.

## Requirements

- Homey with the HomeyScript app installed.
- Homey Logic variables as listed below.
- A vehicle or vehicle integration device that exposes battery percentage as
  `measure_battery`.
- A controllable charging plug or charger switch that exposes `onoff`.
- Optional but recommended: plug power measurement as `measure_power`.
- Tibber API access token stored in Homey Logic.
- Optional Google Sheets webhook for event logging.
- Node.js and npm for local build and simulator commands.

The default source configuration matches devices by partial device name. If
your Homey device names differ, update `src/00-config/10-config.js` locally
before building and do not commit private local names unless they are intended
for public use.

## Required Homey Logic Variables

Create these variables in Homey Logic before running the scripts.

| Name | Type | Example value | Notes |
| --- | --- | --- | --- |
| `TIBBER_ACCESS_TOKEN` | Text | `YOUR_TIBBER_TOKEN` | Secret. Never commit it. |
| `SMARTCHARGE_LOG_WEBHOOK_URL` | Text | `YOUR_WEBHOOK_URL` | Secret. Use `null` only if logging is disabled. |
| `SmartChargeLastLogKey` | Text | empty string | Used to suppress duplicate decision logs. |
| `ChargeConnectedAt` | Text | `null` | Active session timestamp in `YYYY-MM-DD HH:mm:ss`. |
| `ChargeFactor` | Number | `2` | Minutes of charging needed per missing battery percent. |
| `ChargeReserve` | Number | `20` | Target reserve percentage above current need. |
| `ChargeMinutes` | Number | `0` | Written by SmartCharge. |
| `ChargeSlots` | Number | `0` | Written by SmartCharge. |
| `ChargeQuarters` | Number | `0` | Legacy compatibility variable. |
| `ChargeHoursAhead` | Number | `0` | Written by SmartCharge. |
| `SmartChargePlannedStart` | Text | `null` | Written by SmartCharge. |
| `SmartChargePlannedEnd` | Text | `null` | Written by SmartCharge. |
| `SmartChargeShouldCharge` | Yes/No | `false` | Written by SmartCharge. |
| `SmartChargeReason` | Text | empty string | Written by SmartCharge. |
| `SmartChargeTargetDeparture` | Text | `null` | Written by SmartCharge. |
| `SmartChargeSessionStatus` | Text | empty string | Optional status variable for flows or dashboards. |
| `SmartChargeAcceptedStrategy` | Text | `null` | Required only for the disabled-by-default Plan Stability live-shadow experiment. Create it manually; it stores the accepted strategy identity, not SOC, prices, costs, or decisions. |

## Install Dependencies

```bash
npm install
```

## Build HomeyScript Files

```bash
npm run build:homey
```

Generated files are written to `dist/`:

- `SMARTCHARGE - Start Session.js`
- `SMARTCHARGE - Run Decision.js`
- `SMARTCHARGE - State Sync.js`
- `SMARTCHARGE - Log On.js`
- `SMARTCHARGE - Log Off.js`
- `SMARTCHARGE - Reset Session.js`

Copy each generated file into a separate HomeyScript with the same name.

`npm run build:homey` increments the build number once and writes the same
engine version into every generated HomeyScript file. Individual target builds,
such as `npm run build:decision`, still increment the build number when run
alone.

For an explicit release version, keep the project-wide build counter monotonic:

```bash
npm run build:homey -- --release 0.5.0
```

This sets the requested semantic version and increments only the existing
project build counter.

To regenerate all Homey targets while reviewing an already-versioned release
without incrementing its metadata:

```bash
npm run build:homey -- --reuse-version
```

Use this only for validation before the versioned release commit.

## Required HomeyScripts

Use the generated scripts in `dist/` for normal operation:

- `SMARTCHARGE - Start Session`
- `SMARTCHARGE - Run Decision`
- `SMARTCHARGE - State Sync`
- `SMARTCHARGE - Log On`
- `SMARTCHARGE - Log Off`
- `SMARTCHARGE - Reset Session`

The template at `scripts/homey/SESSION - Save ConnectedAt.js` is an optional
legacy manual helper. It is not part of `npm run build:homey` because the
generated `Start Session` script already stores `ChargeConnectedAt`, clears old
planner state, and logs the session start event.

## Setup Order

1. Create the Homey Logic variables.
2. Update local device-name matching in `src/00-config/10-config.js` if needed.
3. Run `npm install`.
4. Run `npm test` to verify the local simulator.
5. Run `npm run build:homey`.
6. Copy the generated files from `dist/` into HomeyScript.
7. Create the Homey Flows described in [HomeyFlows.md](HomeyFlows.md).
8. Optional: set up Google Sheets logging with
   [GoogleSheetsSetup.md](GoogleSheetsSetup.md).

## Validation

Before using a new build on Homey:

```bash
npm test
```

The simulator uses local fixtures and never calls the real Tibber API or Google
Sheets webhook.
