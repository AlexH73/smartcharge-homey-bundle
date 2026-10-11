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
| Manual ON | Explicit operator button | `SMARTCHARGE - Manual Override On` | No direct plug ON, flag writes or block clearing. Starts Manual Charging only. |
| USER_STOP | Explicit operator stop button | `SMARTCHARGE - Manual Override Off` | No vehicle, Session or busy condition; no Delay/logger before the action. |
| Auto Mode | Separate explicit operator button | `SMARTCHARGE - Auto Mode` | Never timer/startup/connection; requires safe state and fresh telemetry; may immediately request ON. |
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
