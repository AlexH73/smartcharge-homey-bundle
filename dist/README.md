# Generated HomeyScript Builds

This directory is intentionally kept in the repository, but generated build
artifacts are ignored by git.

Run:

```bash
npm run build:homey
```

For an explicit release version:

```bash
npm run build:homey -- --release 0.6.4
```

The release build keeps the project-wide build number monotonic. The current
release review metadata is `0.6.4+build.17`.

The build writes standalone HomeyScript files here:

- `SMARTCHARGE - Connection Evidence.js` - records a trustworthy vehicle
  connection event and runs runtime reconciliation.
- `SMARTCHARGE - Runtime Controller.js` - reconciles session lifecycle,
  charging decisions, and plug state.
- `SMARTCHARGE - Start Session.js` - creates a charging session.
- `SMARTCHARGE - Run Decision.js` - calculates the plan and starts charging
  when needed.
- `SMARTCHARGE - State Sync.js` - reconciles the physical plug state with the
  latest SmartCharge decision.
- `SMARTCHARGE - Log On.js` - logs SmartCharge charging start.
- `SMARTCHARGE - Log Off.js` - logs SmartCharge charging stop.
- `SMARTCHARGE - Reset Session.js` - clears the active session.
- `SMARTCHARGE - Manual Override On.js` - starts durable manual charging while
  preserving the automatic block.
- `SMARTCHARGE - Manual Override Off.js` - requests USER_STOP and keeps the
  automatic block across restarts.
- `SMARTCHARGE - Auto Mode.js` - explicitly grants automatic permission after
  safe-state and fresh Mercedes telemetry checks.
- `SMARTCHARGE - Stability Debug.js` - prints a read-only snapshot of persisted
  planner stability state.

Copy generated files into Homey manually. Do not commit local generated builds,
because they include local build numbers and timestamps.
