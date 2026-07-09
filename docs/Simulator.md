# Simulator

The simulator runs the real SmartCharge flow entrypoints without Homey. It
injects a local Homey mock, local Tibber price fixtures, fixed scenario time,
and a local logger.

## Commands

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
npm run simulate:multi-window-needed
npm run simulate:adjacent-cheap-slots
npm run simulate:fallback-when-not-enough-slots
npm run simulate:multi-window-price-update
npm run simulate -- same-day-reconnect
```

List scenarios:

```bash
node simulator/runner.js --list
```

`npm test` runs `npm run simulate:all`.

## Logs

The simulator never calls the real Google Sheets webhook. Any POST request that
would go to the webhook is captured locally and written to:

```text
simulator/logs/events.jsonl
simulator/logs/events.csv
simulator/logs/events.html
```

The CSV file is intended for import and machine checks. The HTML file is
intended for human review in a browser and includes a highlighted sticky header
row. Generated log files are ignored by git.

The `logger-payload` scenario also writes an actual payload snapshot to
`simulator/logs/logger-payload-actual-log.json` and compares it with
`simulator/fixtures/expected-logs/google-logger-payload.json`.

## Logged Fields

- `receivedAt`
- `eventType`
- `sessionId`
- `loggedAt`
- `battery_%`
- `currentPrice_EUR_per_kWh`
- `chargeMinutes_min`
- `chargeSlots`
- `chargeHoursAhead_h`
- `connectedAt`
- `targetDeparture`
- `plannedStart`
- `plannedEnd`
- `shouldChargeNow`
- `plugOn`
- `plugPower_W`
- `reason`
- `averagePrice_EUR_per_kWh`
- `totalPrice_EUR`
- `priceCount`
- `source`
- `engineVersion`
- `detailsJson`
- `plannerMode`
- `windowCount`
- `chargeWindowsText`
- `chargeWindowsJson`

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
- `same-day-reconnect` - a same-day disconnect and reconnect creates a fresh
  session.
- `multi-window-needed` - separated cheapest slots are planned as multiple
  charging windows.
- `adjacent-cheap-slots` - adjacent cheap slots are preserved as one merged
  charging window.
- `fallback-when-not-enough-slots` - safety fallback when fewer usable slots
  remain than the charge requires.
- `multi-window-price-update` - a price update replaces one continuous plan
  with cheaper separated windows without plug toggling while waiting.
- `logger-payload` - exact Google Sheets payload contract check.
- `plug-disconnected` - reset flow after charger disconnect trigger.
- `low-power-after-charging` - log-off flow after a low-power stop signal.
- `charging-completed` - log-off plus reset after full charge.

## Add A Scenario

1. Add or reuse a Tibber fixture in `simulator/fixtures/tibber/`.
2. Create a JSON scenario in `simulator/scenarios/`.
3. Define initial Homey Logic variables and mock device state.
4. Use production timestamp format for stored session values such as
   `ChargeConnectedAt`: `YYYY-MM-DD HH:mm:ss`.
5. Add one or more flow steps.
6. Add expectations for important results, events, plug state, and Tibber calls.
7. Optionally add an expected log fixture in
   `simulator/fixtures/expected-logs/` for exact payload checks.
8. Run `npm run simulate -- your-scenario-name`.

Scenario names come from the `name` field in the JSON file. Tibber price grids
are anchored to the scenario `priceAnchor` value when it is set, otherwise to
scenario `now`. Step `now` values select the current price but do not rebuild
the fixture date grid.

## Limitations

- The simulator calls flow entrypoints directly. It does not emulate Homey flow
  triggers or Homey UI configuration.
- Device connectivity is represented by mocked device state only.
- Homey trigger conditions such as "charger disconnected" are represented by
  choosing the matching flow in a scenario.
- Tibber data is fixture-based. The simulator never calls the real Tibber API.
- Google Sheets logging is replaced by local JSONL and CSV files.
- Real access tokens and webhook URLs must not be added to fixtures, scenarios,
  or logs.
