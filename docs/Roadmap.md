# Roadmap

This roadmap captures planned SmartCharge work. Items may move between releases
as simulator coverage, Homey testing, and production risk become clearer.

## Near Term

### Multi-Window Charging

- Select the cheapest non-adjacent usable price slots before departure.
- Merge adjacent selected slots into continuous charging windows.
- Avoid plug toggling while waiting for a future selected window.
- Preserve safety fallback when not enough usable slots remain.
- Promote current future/XFAIL simulator scenarios to normal passing scenarios.

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

## Mid Term

### Dashboard

- Add a local or hosted view for charging plans, decisions, and historical
  sessions.
- Show selected windows, prices, reason text, and current Homey state.

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
