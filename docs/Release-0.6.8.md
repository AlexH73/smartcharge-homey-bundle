# SmartCharge 0.6.8 session edge cases

Installed: **0.6.8+build.21**, based on develop `1f4a8b7`, on 2026-11-04.
The previous installed baseline was 0.6.7+build.20.

Artifact: `dist/release-0.6.8-build.21`. Manifest SHA-256:
`56f8c56e6ab51bcec0cc972b42371bc4b429f5381cdb7590717dcfa1d3f2b8fe`.
This is a locally reviewed working-tree build; no release tag or GitHub Release
has been created.

## Changes

- Fresh explicit connector disconnection blocks a new automatic Session and ON,
  and takes priority over retained charging flags and measured load.
- Stale vehicle charging flags and power no longer prevent disconnect completion.
  Fresh vehicle power above the idle threshold still vetoes inferred disconnect.
- Departure is the nearest configured time strictly after the saved connection
  timestamp, including connections after midnight, weekends and DST boundaries.
- MANUAL controls retain their independent lifecycle.

## Installation and validation

Install all twelve scripts using [controlled deployment](HomeyDeployment.md),
with fresh operator confirmations and private backup/readback evidence.
An existing Session created before the morning departure under the old rule may
receive an earlier deadline; review its saved connection before restoring AUTO.
Missing connector telemetry remains unknown and does not prove disconnection.

`npm run verify` passed, including lint, formatting, regression tests, 95 simulator
scenarios, source/bundle checks and deployment mock suites. Read-only discovery
confirmed the installed 0.6.7 baseline for all twelve Script IDs, names, API modes
and SHA-256 hashes; dry-run saved a private backup and identified twelve code
replacements and five enabled candidate Flows requiring maintenance.

The current Session was connected in the evening and its existing next-morning
deadline is unaffected by the departure correction. Preflight passed; installation
and independent readback verified all twelve hashes, IDs, names and API modes.
SmartCharge Logic was unchanged by script installation. Maintenance deliberately
revoked the AUTO grant and set AutoStartBlocked=true; the active Session and plan
were preserved. After separate operator authorization, all five control Flows
were restored and the installed AUTO MODE completed successfully. AUTO is
unblocked with a valid grant; at restoration the same Session remained in WAITING with
fresh provider heartbeat evidence and the runtime lock released. The selected
window is 2026-11-05 00:00–02:00 local, before departure at 07:30. The plug
remained OFF at zero measured power outside that window.

Read-only operational review on 2026-11-06 confirmed two overnight automatic
charges reaching the target battery level and completing their Sessions, with
load and rising SOC corroborating the ON acknowledgements. A subsequent vehicle
connection created a new Session automatically. All 179 reviewed events report
0.6.8+build.21; none is an error event. All twelve installed script hashes still
match the artifact, all five control Flows are enabled, and AUTO remains granted.

One open observation remains: the first reviewed night issued ON fifteen minutes
after its selected window began; the second started in the first scheduled tick.
The earlier ticks logged a positive planner decision but no actuator request.
Those events do not include runtime freshness or ON-veto diagnostics, so the
cause cannot be established from this history. Do not treat the delay as verified
correct behavior. Investigate runtime decision observability before relaxing any
freshness guard. Hardware acceptance of the new disconnect/departure edge cases
remains pending. Private backups and write journals are retained outside Git.
The previous artifact remains intact for
comparison and rollback.
