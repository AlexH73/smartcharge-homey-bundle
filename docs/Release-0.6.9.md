# SmartCharge 0.6.9 preconditioning power

Installed: **0.6.9+build.24** on 2026-11-06, based on develop `a743661` plus the local
preconditioning changes. The previous installed baseline was 0.6.8+build.21.
This is a reviewed working-tree installation; no commit, tag or GitHub Release
was created for these changes.

Artifact: `dist/release-0.6.9-build.24`. Manifest SHA-256:
`0babffe4b2efde5bb2b570edaf010e0b811b9f8b153bd42155326570ae754cf2`.
The earlier build.22 candidate is withdrawn from installation because it lacked
idle-load protection; its immutable artifact remains intact for comparison.
Build.23 is also superseded: build.24 additionally fails OFF if reading runtime
permission during climate reconciliation fails. Earlier artifacts are not rebuilt.

## Behavior

- The operator starts/stops preconditioning in Mercedes. With authorized AUTO,
  fresh climate and connection evidence power the socket outside tariff windows,
  including at 100% or unknown SOC, without calling Tibber.
- Choose the newest Boolean `onoff_precond`/`climate_active` observation or
  compatibility alias, with OFF winning equal timestamps. Do not refresh climate
  intent with the integration heartbeat. Use the existing 30-minute freshness
  policy; unavailable/warning devices cannot authorize climate power.
- Preserve the saved charging Session and tariff strategy. Resume ordinary
  planning, completion and expiry after preconditioning ends. Do not create an
  automatic charging Session at full or unknown SOC.
- USER_STOP and AUTO grant validation remain authoritative. Explicit AUTO can
  authorize an already active, verified climate request even at full/unknown SOC.
  Manual charging retains its independent lifecycle.
- Revalidate before ON and after acknowledgement. A changed climate/connection
  signal or user stop during ON causes compensating OFF. Shadow mode remains
  read-only. Commands retain their existing error and compensation behavior.
- Persist startup/load observations and inhibition across script restarts. After
  180 seconds without observed consumption above 5 W, inhibit power. After load
  starts, independent fresh samples at/below 5 W spanning 180 seconds inhibit
  power. Missing samples do not prove zero; losing observations for over 360
  seconds after consumption also inhibits power. OFF failure retains inhibition
  and is retried on the next watchdog.
- Retained climate/connection values or a falling SOC alone cannot turn an idle
  socket back on. Fresh positive connection evidence, a new observed climate
  OFF/ON cycle (except after a known disconnect), or explicit AUTO can authorize
  a bounded new attempt. Session cleanup continues while power is inhibited.

## Timing and acceptance

Start/stop uses the existing five-minute watchdog, plus vehicle/provider delivery
delay. No new live Flow or immediate event trigger is installed by these changes.
Connection must be independently supported: a climate flag alone does not prove
the cable is attached. If climate freshness expires, its power exception ends;
tariff charging may still independently require power. The freshness policy is
not a separate maximum-duration timer for continuously refreshed climate data.

The local regression suite covers full/missing SOC, return to waiting/charging,
Session/strategy preservation, expiry, stale/future/missing/contradicting signals,
heartbeat exclusion, grants, USER_STOP, shadow mode, failed commands and changes
before/during ON. The simulator includes a fresh climate start/stop scenario and
the existing rejection case for a timestamp-less climate flag. It also covers
departure with delayed Mercedes updates, sustained idle load, startup failure,
missing power, durable inhibition, reconnection, fresh climate cycles, failed OFF,
missing/corrupt state, persistence failure and Session cleanup during inhibition.

Before installing, create the string Logic variable `SmartChargePreconditioningState`
with literal text `null` if absent, while maintenance is active. Preserve an
existing record. The deployment client does not create Logic variables; runtime
refuses recovery if this state is missing or corrupt.

Physical acceptance remains pending. Follow
[controlled deployment](HomeyDeployment.md), including fresh operator confirmation,
existing-ID selection, private backup, preflight and all-twelve-script readback.
Keep the 0.6.8 artifact for rollback.

`npm run verify` passed for build.24: lint, formatting, all regression suites,
97 simulator scenarios, source/bundle syntax and release/deployment mock checks.
The delayed-unplug scenario turns OFF after fresh idle samples and stays OFF on
later ticks with retained climate/connected values, then permits ON after fresh
reconnect evidence. Tests also cover startup/no-power timeouts, failed OFF retry,
state persistence failure and automatic Session cleanup during inhibition.

Read-only discovery confirmed the installed 0.6.8 hashes/IDs/names/API modes and
saved a private backup. With fresh operator confirmation, all five control Flows
were disabled, AUTO blocked and its grant revoked. The new string state variable
was created with literal text `null`; other Logic was preserved. Preflight passed.

Installation returned VERIFIED. Independent readback matched all twelve hashes,
IDs, names and API modes; installation preserved Logic and Flow topology. The
active Session and saved plan remain intact. The socket is OFF at zero measured
power. After separate authorization, all five control Flows were restored and
the installed AUTO MODE completed successfully. AUTO is unblocked with a valid
grant; the same Session and plan remain active in WAITING. The new state record
is still `null` (idle); the runtime lock is released and the plug remains OFF at
zero measured power outside its charging window. All twelve hashes still match.
The first operator-started partial-SOC climate cycle confirmed real socket
consumption outside the tariff window and OFF on the watchdog after the operator
stopped climate. The state then returned to IDLE without repeated ON. Full-SOC
and physical delayed-unplug/idle-load acceptance remain pending. Mercedes reported
Failure after the supply cut, then returned to Charge break without a power command;
guarded recovery while this expected status is retained is addressed by the
[0.6.10 candidate](Release-0.6.10.md). Scripts were not run during installation. Private backup,
migration and write journals remain outside Git. The previous 0.6.8 artifact is
retained for rollback.
