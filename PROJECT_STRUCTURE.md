# Project Structure

```text
smartcharge-homey-bundle/
  src/
    00-config/
    10-core/
      planner/
    20-adapters/
    30-logger/
    90-flows/
  scripts/
  assets/
    images/
  docs/
  simulator/
    fixtures/
    logs/
    runtime/
    scenarios/
    runner.js
  dist/
```

## `src/`

Production SmartCharge source modules. These files are written for HomeyScript
and are concatenated by `scripts/build-homey.js`.

### `src/00-config/`

Runtime constants and generated build metadata.

- `10-config.js` - variable names, device name matchers, charging limits,
  Tibber API URL, and Tibber GraphQL query.
- `00-build-info.generated.js` - generated version metadata used in logs.

### `src/10-core/`

Pure or mostly pure SmartCharge logic.

- `00-utils.js` - generic helpers.
- `10-time.js` - timezone-aware departure time helpers.
- `20-homey-logic.js` - Homey Logic variable access helpers.
- `30-charging.js` - charging duration and slot calculations.
- `40-planner.js` - continuous charging planner and shared safety helpers.
- `50-session.js` - session expiration helpers.
- `60-decision.js` - reserved for decision-level extraction.

### `src/10-core/planner/`

Planner model and multi-window planning modules.

- `10-charge-window.js` - creates `ChargeWindow` objects for continuous
  charging intervals.
- `20-charge-plan.js` - creates `ChargePlan` objects and derived window
  summaries.
- `30-planner-utils.js` - shared slot sorting, cheapest-slot selection,
  adjacent-slot merging, window building, and available-slot collection.
- `50-multi-window-planner.js` - builds the cheapest multi-window charging
  plan from usable price slots.
- `60-plan-comparator.js` - selects the preferred plan between continuous and
  multi-window candidates.
- `70-plan-selector.js` - reserved for future selection orchestration.
- `99-planner.exports.js` - reserved public planner API boundary.

### `src/20-adapters/`

Runtime integration helpers.

- `10-tibber.js` - Tibber GraphQL fetch and price normalization.
- `20-homey-devices.js` - Homey device lookup and plug control.
- `30-google-sheets.js` - reserved adapter area.
- `40-homey.js` - reserved adapter area.

### `src/30-logger/`

SmartCharge event logging.

- `10-smartcharge-logger.js` - event normalization, deduplication, Google
  Sheets payload creation, lifecycle logging, and webhook posting.

### `src/90-flows/`

Executable HomeyScript entrypoints.

- `start-session.entry.js`
- `run-decision.entry.js`
- `log-on.entry.js`
- `log-off.entry.js`
- `reset-session.entry.js`

Each entrypoint ends with `return await main();` so the generated script can run
inside HomeyScript.

## `scripts/`

Build tooling.

- `build-homey.js` - concatenates shared `src` modules plus one flow entrypoint
  into a standalone HomeyScript file under `dist/`.

## `assets/`

Repository media assets used by documentation and project presentation.

- `images/hero.png` - README cover image showing the SmartCharge architecture
  and product positioning.

## `docs/`

Engineering documentation.

- `Roadmap.md` - planned product and engineering work.
- `DevelopmentWorkflow.md` - branch model, release flow, and Definition of
  Done.

## `simulator/`

Local SmartCharge Simulator and Test Runtime. This area is separate from the
production runtime.

### `simulator/runner.js`

CLI entrypoint for running one or more scenarios.

### `simulator/runtime/`

Reusable simulator implementation.

- `default-state.js` - default Homey Logic variables and mock device state.
- `fixed-date.js` - deterministic Date constructor for scenario time.
- `homey-mock.js` - local mock for `Homey.logic`, `Homey.devices`, and device
  capability writes.
- `local-log-writer.js` - writes captured SmartCharge events to JSONL and CSV.
- `script-loader.js` - loads shared `src` modules and executes flow entrypoints.
- `simulator-runtime.js` - ties Homey mock, Tibber mock, log writer, and flow
  execution together for each scenario step.
- `tibber-mock.js` - converts fixture price profiles into Tibber-like
  `priceInfo` responses.

### `simulator/fixtures/tibber/`

Local hourly price profiles used by the Tibber mock.

- `normal-day.json`
- `cheap-night.json`
- `price-spike.json`
- `missing-tomorrow.json`
- `price-update-evening.json`
- `multi-window-adjacent.json`
- `multi-window-separated.json`
- `late-plan.json`
- `no-prices.json`

### `simulator/fixtures/expected-logs/`

Expected Google Sheets payload snapshots used by scenarios that validate the
full logging contract.

### `simulator/scenarios/`

JSON scenario definitions. Each scenario declares initial mock state, flow
steps, and expectations. Stored Homey Logic timestamps such as
`ChargeConnectedAt` should use the production `YYYY-MM-DD HH:mm:ss` format.
Tibber price grids are anchored per scenario through `priceAnchor` or `now`, so
multi-step scenarios keep a stable `today` / `tomorrow` price grid.
The simulator currently includes 19 passing scenarios, including multi-window
planner coverage.

### `simulator/logs/`

Generated simulator output.

- `events.jsonl`
- `events.csv`
- `events.html`
- `<scenario>-actual-log.json`

`events.html` is the human-readable report with a highlighted sticky header row.
Generated log files are ignored by git. `.gitkeep` keeps the directory present.

## `dist/`

Generated HomeyScript files ready to copy into Homey.

Files in this directory are generated artifacts and should not be edited
manually.
