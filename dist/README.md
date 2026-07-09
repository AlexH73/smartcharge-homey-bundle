# Generated HomeyScript Builds

This directory is intentionally kept in the repository, but generated build
artifacts are ignored by git.

Run:

```bash
npm run build:homey
```

The build writes standalone HomeyScript files here:

- `SMARTCHARGE - Start Session.js` - creates a charging session.
- `SMARTCHARGE - Run Decision.js` - calculates the plan and starts charging
  when needed.
- `SMARTCHARGE - Log On.js` - logs SmartCharge charging start.
- `SMARTCHARGE - Log Off.js` - logs SmartCharge charging stop.
- `SMARTCHARGE - Reset Session.js` - clears the active session.

Copy generated files into Homey manually. Do not commit local generated builds,
because they include local build numbers and timestamps.
