# Roadmap

This roadmap captures planned SmartCharge work. Items may move between releases
as simulator coverage, Homey testing, and production risk become clearer.

## Completed

### Multi-Window Charging

- ChargePlan and ChargeWindow model introduced.
- Continuous and multi-window planner candidates are evaluated.
- The plan comparator selects between continuous and multi-window plans.
- Adjacent selected slots are merged into charging windows.
- Multi-window simulator scenarios now pass as normal coverage.
- Safety fallback remains covered when not enough usable slots remain.

## Near Term

### Planner Stability

- Add anti-replanning rules for small savings.
- Add maximum replans per session.
- Add minimum interval between meaningful plan revisions.
- Add maximum window count configuration.

### Simulator

- Keep scenario coverage as the first step for planner changes.
- Add exact payload fixtures for new logger events when payload shape changes.
- Keep generated `events.html` as the primary human-readable simulator report.

### Release Readiness

- Keep `develop` buildable and simulator-green.
- Run HomeyScript build verification before merging feature work into
  `develop`.
- Keep generated and local-only files out of commits unless they are intended
  release artifacts.

### Energy And Cost Model

- Calculate actual estimated energy per window.
- Calculate estimated session cost from price and energy.
- Preserve backward-compatible price-score fields while adding real cost
  fields.

## Mid Term

### Dashboard

- Add a local or hosted view for charging plans, decisions, and historical
  sessions.
- Show selected windows, prices, reason text, and current Homey state.
- Add a Sessions sheet or dashboard view for session history.
- Show planner revisions and what changed between revisions.

### Analytics

- Track energy cost, avoided high-price charging, and charging session history.
- Add summaries that can be exported or reviewed outside Homey.

### Logger Improvements

- Version logger payloads.
- Keep a strict simulator fixture for the Google Sheets payload contract.
- Add migration guidance when payload fields change.

## Long Term

### SmartCharge Core

- Extract planner logic into a clearer core module with deterministic tests.
- Keep HomeyScript integration thin around the core decision engine.
- Make future integrations possible without rewriting the planner.

### Stability

- Improve handling of missing prices, partial Tibber data, and timezone edges.
- Add release smoke-test checklists for real Homey validation.
