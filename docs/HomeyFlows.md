# Homey Flow Setup

This is the target topology for SmartCharge **0.6.4+build.17** in `active` mode.
It replaces legacy parallel Start Session / Run Decision / State Sync / Log On /
Log Off / Reset Session chains. These compatibility scripts remain in the release
but are not additional scheduled owners. Builds and the deployment client do not
create, edit or enable real Flows.

## Controls and ordinary ingress

Use the installation's actual device cards and names; roles below are not discovered
Flow IDs. The five ordinary maintenance roles are Watchdog, Connection Evidence,
Manual ON, USER_STOP and Auto Mode. Startup Recovery, when configured, is an
additional ingress to audit and quiesce.

| Role | Trigger | Only SmartCharge action | Restrictions |
| --- | --- | --- | --- |
| Runtime Watchdog | Every five minutes | `SMARTCHARGE - Runtime Controller` | One periodic caller; no vehicle availability, automatic Session or SOC condition. Manual deadlines/recovery still need ticks. |
| Connection Evidence | Real trustworthy charger-connected event | `SMARTCHARGE - Connection Evidence` | Records UTC evidence and invokes Runtime Controller itself. No timer, retained-status polling or second Runtime action. |
| MANUAL / AUTO | Explicit operator button | `SMARTCHARGE - Manual Override On`, argument `toggle` | Use the installed HomeyScript `runWithArg` card. AUTO/STOP -> manual start; active MANUAL -> AUTO. Three-second durable debounce; no direct plug commands. |
| USER_STOP | Explicit operator stop button | `SMARTCHARGE - Manual Override Off` | No vehicle, Session or busy condition; no Delay/logger before the action. |
| Auto Mode (compatibility/recovery) | Explicit operator invocation only | `SMARTCHARGE - Auto Mode` | The separate everyday AUTO Flow is removed after migration. Script remains available for supervised recovery; never scheduled. Can arm waiting at full/stale/unknown SOC. |
| Startup Recovery (optional) | Homey startup after Logic/devices are available | `SMARTCHARGE - Runtime Controller` | Never reset persisted state/block/token/lock or call Auto Mode. Enable watchdog after supervised recovery. |

For the observed Mercedes-Benz integration the connected-event card is
`Ladegerät wurde angeschlossen`; preserve its exact UI name. Other integrations
need an equivalent verified event. A general status-change card is not sufficient
unless its semantics establish a new connection. Connection Evidence must lead
directly to the dedicated script, rather than directly to Runtime Controller.
Inspect Homey Advanced Flows connections, not only the presence of a script card:
an unconnected action does not run. The audit conservatively includes disconnected
cards for maintenance because their existence cannot prove safe execution state.

## Manual Charging and Durable Auto Block

The primary button has a fixed name; its current mode is exposed as the optional
Text Logic variable `SmartChargeControlStatus` (initial value `STOP`). Runtime and
explicit controls update it to `AUTO`, `MANUAL`, `STOP` or `ERROR`. It is display
only and never read for control decisions. No custom device or dynamic button
skin is installed. STOP is a separate, always reachable control and is never
debounced. A toggle in ERROR/STOPPING performs existing recovery, not a new ON.
Returning to AUTO uses the existing safe manual-stop/OFF preparation before
Runtime selects charging, climate power or waiting; an applicable plan may turn
power back ON. The debounce is best effort across independent invocations, not
an atomic device-command queue (see the concurrency boundary below).

For migration, preserve the existing Manual ON Flow ID and change its sole action
to HomeyScript `runWithArg`, the same script ID, argument `toggle`. Rename it to
MANUAL / AUTO, preserve the separate STOP Flow, and remove the obsolete AUTO Flow
only after installed hashes, caller references and the new topology are verified.
Retain a private export of the old Flow for rollback. Argument-free script calls
continue to mean idempotent Manual ON, not toggle.

Manual ON and Auto Mode require `SmartChargeRuntimeMode=active`. Explicit USER_STOP
remains available in shadow mode. Manual Charging does not depend on an automatic
Session or Tibber. Stop denies Automatic Charging even after manual=false/restart.
Planner, startup, connection events and automatic reset cannot grant permission.

Keep the five-minute watchdog. START_CONFIRMED requires two fresh, independently
timestamped plug samples >500 W, >=30 seconds apart. LOW_POWER only applies
afterwards: independent samples <=5 W spanning >=180 seconds. Samples must be
<=60 seconds old with gaps <=360 seconds. Missing/invalid/stale/future values are
not 0 W. Recovery between ticks can be missed; continuously low power is not proved.
MAX_DURATION (360 minutes from activation) is checked on invocation.
See [Runtime Controller](RuntimeController.md).

## Writers to disable or remove manually

- Separate periodic Run Decision/State Sync and extra watchdog/price/power timers.
- Direct plug ON/OFF cards and automatic commands based on `SmartChargeShouldCharge`.
- Manual flag toggles, manual ON followed by old planner, permission grants on
  startup, and legacy `SESSION - Save ConnectedAt` helper.
- Legacy Start Session/Reset Session chains competing with Runtime Controller.
- Duplicate Log On/Log Off for runtime-owned commands; plug ON is not manual
  START_CONFIRMED and Runtime Controller emits its own events.
- Inline scripts, delegated Flows, voice/UI actions, other Apps and external APIs
  capable of changing the plug or safety Logic.

Do not add runtime calls on every power/status update. Observations may feed
telemetry without becoming an independent Actuator writer. Unknown command
outcomes go to operator inspection, not automatic retry or Auto Mode loops.

## Maintenance and activation

Before replacement disable all candidate writers/triggers, independently confirm
physical OFF, drain known/pending executions and quiesce external writers. During
installation all five controlling Flows are disabled, including USER_STOP; use
the independent physical stop while scripts are unavailable. During operation
USER_STOP must remain promptly reachable. Do not reset saved safety records or
clear a lease while an old request may still be in flight.

After installation leave Flows disabled until separately supervised acceptance.
Use [deployment/rollback](HomeyDeployment.md) and
[migration/acceptance](HomeyDeploymentReadiness.md). Never automatically restore
an old Flow's enabled state from backup.

## Concurrency boundary

Ordered Homey Advanced Flows cards sequence one invocation, not an exclusive queue
across activations. Connection Evidence, controls, startup and third-party writers
can overlap even with one watchdog. RuntimeLock and pre-/post-ON intent checks are
best effort. They cannot cancel a sent ON or guarantee compensating OFF before
electrical energization. [Serialization research](HomeyExecutionSerialization.md)
preserves evidence and future executor options.
