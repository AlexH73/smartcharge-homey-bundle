# SmartCharge Homey Bundle

![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=node.js&logoColor=white)
![HomeyScript](https://img.shields.io/badge/HomeyScript-runtime-00C7B7)
![Tibber](https://img.shields.io/badge/Tibber-price%20API-FF5A5F)
![Google Sheets](https://img.shields.io/badge/Google%20Sheets-logging-34A853?logo=googlesheets&logoColor=white)
![Local Simulator](https://img.shields.io/badge/local%20simulator-JSONL%20%2B%20CSV-6F42C1)
![License](https://img.shields.io/badge/license-ISC-blue)

SmartCharge Homey Bundle contains a modular HomeyScript runtime for planning
electric vehicle charging from Tibber hourly prices and Homey device state.

The source code lives in `src/` as small reusable modules. The build script
concatenates those modules into standalone HomeyScript files under `dist/`.

## Runtime Lifecycle

The production Homey setup is expected to call separate HomeyScript flows:

- `Start Session` creates a charging session when the cable is connected.
- `Run Decision` calculates the cheapest charging plan and decides whether the
  plug should be turned on.
- `Log On` records that SmartCharge charging started.
- `Log Off` records that SmartCharge charging stopped.
- `Reset Session` clears the active charging session after completion,
  disconnect, or manual reset.

`SmartChargeLogger` writes lifecycle and decision events to the configured
Google Sheets webhook in production.

## Install

```bash
npm install
```

The project currently uses plain Node.js for the simulator and build scripts.
No simulator-specific dependency is required.

## Build HomeyScript Files

```bash
npm run build:homey
```

Available build commands:

```bash
npm run build:decision
npm run build:reset
npm run build:start
npm run build:log-on
npm run build:log-off
```

Generated files are written to `dist/`.

Note: the current build script increments `.smartcharge-build.json` and updates
`src/00-config/00-build-info.generated.js` on each target build.

## Local Simulator

The simulator runs the real SmartCharge flow entrypoints without Homey. It
injects a local Homey mock, local Tibber price fixtures, fixed scenario time,
and a local logger.

Run every scenario:

```bash
npm run simulate:all
```

Run the default simulator command:

```bash
npm run simulate
```

Run a single scenario:

```bash
npm run simulate -- overnight
npm run simulate:battery-full
npm run simulate:session-expired
npm run simulate:missing-tomorrow
npm run simulate:safety-fallback
npm run simulate:logger-payload
```

List scenarios:

```bash
node simulator/runner.js --list
```

`npm test` also runs `npm run simulate:all`.

## Simulator Logs

The simulator never calls the real Google Sheets webhook. Any POST request that
would go to the webhook is captured locally and written to:

```text
simulator/logs/events.jsonl
simulator/logs/events.csv
```

The CSV file can be opened in Excel. Generated log files are ignored by git.
The `logger-payload` scenario also writes an actual payload snapshot to
`simulator/logs/logger-payload-actual-log.json` and compares it with
`simulator/fixtures/expected-logs/google-logger-payload.json`.

Logged event fields include:

- `eventType`
- `sessionId`
- `loggedAt`
- `battery`
- `currentPrice`
- `chargeMinutes`
- `chargeSlots`
- `chargeHoursAhead`
- `connectedAt`
- `targetDeparture`
- `plannedStart`
- `plannedEnd`
- `shouldChargeNow`
- `plugOn`
- `plugPower`
- `reason`
- `averagePrice`
- `totalPrice`
- `priceCount`
- `source`
- `engineVersion`
- `message`

## Included Scenarios

Scenario files live in `simulator/scenarios/`.

- `overnight` - overnight charge with cheap night prices.
- `battery-full` - active session with a full battery.
- `no-active-session` - decision flow without an active session.
- `session-expired` - expired session blocks charging and logs the event.
- `session-expired-while-charging` - expired session while the plug is still on.
- `price-spike` - high day prices push charging into cheaper hours.
- `price-update` - updated Tibber prices change the plan without toggling the
  plug.
- `missing-tomorrow` - Tibber has not published tomorrow prices yet.
- `safety-fallback` - charging starts immediately when remaining time is too
  short.
- `plan-starts-too-late` - selected plan starts after the latest safe start.
- `multiple-sessions` - two sequential charging sessions with a reset between
  them.
- `logger-payload` - exact Google Sheets payload contract check.
- `plug-disconnected` - reset flow after charger disconnect trigger.
- `low-power-after-charging` - log-off flow after a low-power stop signal.
- `charging-completed` - log-off plus reset after full charge.

## Add a New Scenario

1. Add or reuse a Tibber fixture in `simulator/fixtures/tibber/`.
2. Create a JSON scenario in `simulator/scenarios/`.
3. Define initial Homey Logic variables and mock device state.
4. Add one or more flow steps.
5. Add expectations for important results, events, plug state, and Tibber calls.
6. Optionally add an expected log fixture in
   `simulator/fixtures/expected-logs/` for exact payload checks.
7. Run `npm run simulate -- your-scenario-name`.

Scenario names come from the `name` field in the JSON file.

## Simulator Limitations

- The simulator calls flow entrypoints directly. It does not emulate Homey flow
  triggers or Homey UI configuration.
- Device connectivity is represented by mocked device state only. Homey trigger
  conditions such as "charger disconnected" are represented by choosing the
  matching flow in a scenario.
- Tibber data is fixture-based. The simulator never calls the real Tibber API.
- Google Sheets logging is replaced by local JSONL and CSV files.
- Real access tokens and webhook URLs must not be added to fixtures, scenarios,
  or logs.

## Recommended Development Loop

```bash
npm run simulate:all
npm run build:homey
```
